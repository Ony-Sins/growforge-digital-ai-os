/**
 * src/lib/durableJobEngine.ts
 *
 * Durable Background-Job & Crash-Recovery Dispatch Engine for GrowForge OS.
 * (Phase 4, Item 5 — Trigger.dev native integration & durable state machine).
 *
 * Features:
 * 1. Durable Stage Decomposition: Orchestrates stages (plan, research, departments,
 *    reconcile, qa, final) with dedicated retries, exponential backoff, and timeouts.
 * 2. Process Crash & Restart Recovery: Scans `data/jobs.json` on startup or runtime
 *    invocations. Any job interrupted mid-run is automatically resumed from its exact
 *    last completed checkpoint without re-running finished steps.
 * 3. Self-contained: this engine is the real dispatch path. The Trigger.dev tasks in
 *    src/trigger/ are defined but never invoked (see state.md §A, 2026-09-24).
 */

import { getJob, listJobSummaries, updateStep, updateJob } from "@/lib/jobStore";
import { logJobStateChange, logStrategicDecision } from "@/lib/brainLogger";

export interface StageRetryPolicy {
  maxAttempts: number;
  minTimeoutMs: number;
  maxTimeoutMs: number;
  factor: number;
}

const DEFAULT_STAGE_RETRY_POLICY: StageRetryPolicy = {
  maxAttempts: 3,
  minTimeoutMs: 1500,
  maxTimeoutMs: 12000,
  factor: 2,
};

/**
 * Executes an async stage action with durable exponential-backoff retries.
 */
export async function withDurableRetry<T>(
  actionName: string,
  fn: () => Promise<T>,
  policy: StageRetryPolicy = DEFAULT_STAGE_RETRY_POLICY
): Promise<T> {
  let attempt = 0;
  let delay = policy.minTimeoutMs;

  while (attempt < policy.maxAttempts) {
    attempt++;
    try {
      return await fn();
    } catch (err) {
      const isLastAttempt = attempt >= policy.maxAttempts;
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[durableEngine] Stage "${actionName}" attempt ${attempt}/${policy.maxAttempts} failed: ${errorMsg}`
      );

      if (isLastAttempt) {
        throw err;
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * policy.factor, policy.maxTimeoutMs);
    }
  }

  throw new Error(`[durableEngine] Exhausted all ${policy.maxAttempts} attempts for stage "${actionName}".`);
}

// In-flight execution tracking to prevent duplicate executions in the same process
const activeExecutions = new Set<string>();

/**
 * Dispatches a job through the durable background engine.
 */
export function dispatchDurableJob(jobId: string, runner: (id: string) => Promise<void>): void {
  if (activeExecutions.has(jobId)) {
    console.log(`[durableEngine] Job ${jobId} is already actively executing in this worker.`);
    return;
  }

  activeExecutions.add(jobId);

  // Background execution with error isolation
  void (async () => {
    try {
      console.log(`[durableEngine] Starting durable pipeline execution for job ${jobId}...`);
      await runner(jobId);
      console.log(`[durableEngine] Completed durable pipeline execution for job ${jobId}.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[durableEngine] Job ${jobId} pipeline execution failed:`, err);
      const current = getJob(jobId);
      if (current && current.status === "running") {
        current.steps
          .filter((s) => s.status === "active")
          .forEach((s) =>
            updateStep(jobId, s.id, {
              status: "error",
              error: message,
              finishedAt: new Date().toISOString(),
            })
          );
        updateJob(jobId, {
          status: "error",
          error: message,
          finishedAt: new Date().toISOString(),
        });
        logJobStateChange(getJob(jobId)!);
      }
    } finally {
      activeExecutions.delete(jobId);
    }
  })();
}

/**
 * Checks for interrupted or orphaned jobs in `data/jobs.json` left in `running` state
 * (e.g., following a Node.js / PM2 process restart or server crash) and resumes them.
 */
export function recoverInterruptedJobs(runner: (id: string) => Promise<void>): number {
  const summaries = listJobSummaries();
  const runningSummaries = summaries.filter((s) => s.status === "running");

  if (runningSummaries.length === 0) {
    return 0;
  }

  let recoveredCount = 0;

  for (const s of runningSummaries) {
    if (activeExecutions.has(s.id)) continue;

    const job = getJob(s.id);
    if (!job || job.status !== "running") continue;

    const activeOrPendingSteps = job.steps.filter((st) => st.status === "active" || st.status === "pending");
    const lastDone = job.steps.filter((st) => st.status === "done").map((st) => st.id);

    console.log(
      `[durableEngine] 🔄 RECOVERY TRIGGERED for job ${job.id} ("${job.title}"): Rebuilding pipeline from checkpoint. Completed steps: [${lastDone.join(
        ", "
      )}]. Resuming remaining ${activeOrPendingSteps.length} steps...`
    );

    // Reset any interrupted "active" step back to "pending" so the stage runner picks it up cleanly
    for (const step of job.steps) {
      if (step.status === "active") {
        updateStep(job.id, step.id, {
          status: "pending",
          activity: `Resuming from crash checkpoint (${step.label})`,
        });
      }
    }

    logStrategicDecision({
      title: `Automatic Crash Recovery for Job ${job.id}`,
      context: `Process restart detected with job in state "running" at ${job.percent}% completion`,
      decision: `Durable execution engine automatically restored job context and resumed pipeline execution without data loss. Reused finished steps: [${lastDone.join(
        ", "
      )}].`,
      department: "Durable Dispatch Engine",
    });

    dispatchDurableJob(job.id, runner);
    recoveredCount++;
  }

  return recoveredCount;
}
