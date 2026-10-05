import { isPublicPreviewMode } from "@/lib/session";
import { isBetaMode } from "@/lib/beta/access";
import { isOwnerReviewMode } from "@/lib/ownerReview";
import { getJob, listJobSummaries } from "@/lib/jobStore";
import { listExecutingJobIds } from "@/lib/durableJobEngine";
import { listApprovalHistory } from "@/lib/approvalStore";
import { listConsultationHistory } from "@/lib/consultationStore";
import { listAgents, listExecutingAgentIds } from "@/lib/agentStore";
import { buildCoreState } from "@/lib/coreState";
import { summarizeUsage, type UsageRecord } from "@/lib/usage";
import { financeTrackedCount } from "@/lib/financeFoundation";
import { errorKindOf } from "@/components/spatial/dive/missionStates";
import { TEST_JOB_ID_PATTERN, type AgentFacts, type ApprovalFacts, type ConsultationFacts, type JobFacts, type OverviewInput, type ProbeFacts } from "@/lib/overviewSnapshot";


/**
 * Reads the canonical stores and returns plain facts for buildOverviewSnapshot. No second store, no cache, no
 * writes: each value comes straight from jobStore / approvalStore / consultationStore / agentStore / service probes /
 * the executor registries, and a source that throws becomes `null` ("unknown") rather than a guessed empty list.
 */
/** Nothing is read: public preview, beta and non-owner sessions must not see owner runtime state. */
export function restrictedOverviewInput(now: number = Date.now()): OverviewInput {
  return { now, mode: "restricted", executor: { available: false, jobsExecuting: [], agentsExecuting: [] }, jobs: null, approvals: null, consultations: null, agents: null, probes: null, systems: null, financeTrackedModules: financeTrackedCount() };
}

export async function gatherOverviewInput(now: number = Date.now()): Promise<OverviewInput> {
  if (isPublicPreviewMode() || isBetaMode()) return restrictedOverviewInput(now);
  const attempt = <T>(read: () => T): T | null => { try { return read(); } catch { return null; } };

  const jobs = attempt<JobFacts[]>(() => listJobSummaries().map((summary) => {
    const job = getJob(summary.id);
    const records: UsageRecord[] = job ? job.steps.flatMap((step) => step.usage ?? []) : [];
    const usage = records.length ? (() => { const s = summarizeUsage(records); return { calls: s.totalCalls, totalTokens: s.totalInputTokens + s.totalOutputTokens, costUsd: s.totalCostUsd, allCostsKnown: s.allCostsKnown }; })() : null;
    return {
      id: summary.id, title: summary.title || "Untitled project", status: summary.status, percent: summary.percent,
      createdAt: summary.createdAt, updatedAt: summary.updatedAt, finishedAt: summary.finishedAt ?? undefined, approvedAt: summary.approvedAt ?? undefined,
      isTest: TEST_JOB_ID_PATTERN.test(summary.id), error: job?.error, interrupted: job ? errorKindOf(job) === "interrupted" : false, verified: summary.verified,
      activeStep: summary.activeStep, stepsDone: job?.steps.filter((s) => s.status === "done").length, stepsTotal: job?.steps.length, usage,
    } satisfies JobFacts;
  }));
  const approvals = attempt<ApprovalFacts[]>(() => listApprovalHistory().map((a) => ({ id: a.id, jobId: a.jobId, jobTitle: a.jobTitle, stepLabel: a.stepLabel, toolName: a.toolName, status: a.status, createdAt: a.createdAt, decidedAt: a.decidedAt, decidedBy: a.decidedBy })));
  const consultations = attempt<ConsultationFacts[]>(() => listConsultationHistory().map((c) => ({ id: c.id, jobId: c.jobId, jobTitle: c.jobTitle, stepLabel: c.stepLabel, status: c.status, createdAt: c.createdAt, answeredAt: (c as { answeredAt?: string }).answeredAt })));
  const agents = attempt<AgentFacts[]>(() => listAgents().map((a) => ({ id: a.id, name: a.name, persistedStatus: a.status, lastRun: a.lastRun })));

  // Service reachability and registry counts: the same live probes the CORE page uses (one source, not a copy).
  let probes: ProbeFacts[] | null = null;
  let systems: OverviewInput["systems"] = null;
  try {
    const core = await buildCoreState();
    probes = core.systems.probes.filter((p) => !/preview/i.test(p.detail)).map((p) => ({ id: p.id, label: p.label, online: p.online, detail: p.detail, latencyMs: p.latencyMs }));
    systems = { mcpServers: core.systems.mcp.count, mcpTools: core.systems.mcp.servers.reduce((n, s) => n + s.toolCount, 0), models: core.systems.models.count, routing: core.systems.routing, notesVaultReachable: core.systems.vault.reachable };
  } catch { /* unknown, not empty */ }

  const reviewMode = isOwnerReviewMode();
  return {
    now,
    mode: reviewMode ? "owner-review" : "live",
    // The review instance runs no executor, so "executing" can never be confirmed there.
    executor: { available: !reviewMode, jobsExecuting: attempt(listExecutingJobIds) ?? [], agentsExecuting: attempt(listExecutingAgentIds) ?? [] },
    jobs, approvals, consultations, agents, probes, systems,
    financeTrackedModules: financeTrackedCount(),
  };
}
