import type { CoreState } from "@/lib/coreState";

/**
 * Mission states shown in the Missions lens. Derived only from recorded job status,
 * a recorded job's own error record, and recorded pending approvals. Nothing is inferred.
 *
 * jobStore reports a job as `error: Interrupted…` when a different process loads a job
 * that was running, so a run that merely lost its process is "unverified", not
 * "blocked": we cannot tell whether it failed or finished. The Core job summary does
 * not carry the error, so an errored job is "checking" until its own record is read.
 */
export const MISSION_STATES = ["running", "waiting", "blocked", "completed", "unverified"] as const;
export type MissionState = (typeof MISSION_STATES)[number];
export type MissionRowState = MissionState | "checking";

export const MISSION_STATE_LABELS: Record<MissionRowState, string> = {
  running: "Running",
  waiting: "Queued / waiting",
  blocked: "Blocked / error",
  completed: "Completed",
  unverified: "Unverified / interrupted",
  checking: "Error · checking",
};

export type MissionSummary = Pick<CoreState["jobs"][number], "id" | "status">;
export type ErrorKind = "interrupted" | "failed";

/** Classifies a raw job record's failure. Pure so it can be tested against fixtures. */
export function errorKindOf(job: { error?: unknown; steps?: unknown }): ErrorKind {
  const stepInterrupted = Array.isArray(job.steps) && job.steps.some(step => typeof step === "object" && step !== null && /^interrupted$/i.test(String((step as { error?: unknown }).error ?? "")));
  return stepInterrupted || /interrupt/i.test(typeof job.error === "string" ? job.error : "") ? "interrupted" : "failed";
}

/**
 * `pendingApprovalJobIds` is null when approvals could not be read, so waiting cannot be told
 * from running. `errorKinds` holds the resolved kind per errored job id.
 */
export function missionState(job: MissionSummary, pendingApprovalJobIds: ReadonlySet<string> | null, errorKinds: ReadonlyMap<string, ErrorKind>): MissionRowState {
  if (job.status === "done") return "completed";
  if (job.status === "error") {
    const kind = errorKinds.get(job.id);
    return kind === "interrupted" ? "unverified" : kind === "failed" ? "blocked" : "checking";
  }
  return pendingApprovalJobIds?.has(job.id) ? "waiting" : "running";
}

/** A count is null when it cannot be determined, never a guessed zero. */
export function missionStateCounts(jobs: MissionSummary[], pendingApprovalJobIds: ReadonlySet<string> | null, errorKinds: ReadonlyMap<string, ErrorKind>): Record<MissionState, number | null> {
  const counts: Record<MissionState, number | null> = { running: 0, waiting: pendingApprovalJobIds ? 0 : null, blocked: 0, completed: 0, unverified: 0 };
  let checking = 0;
  for (const job of jobs) {
    const state = missionState(job, pendingApprovalJobIds, errorKinds);
    if (state === "checking") checking += 1;
    else counts[state] = (counts[state] ?? 0) + 1;
  }
  if (checking) { counts.blocked = null; counts.unverified = null; }
  return counts;
}
