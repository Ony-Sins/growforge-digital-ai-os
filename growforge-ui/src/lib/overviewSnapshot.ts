import type { DiveLensId } from "./diveLenses";

/**
 * OVERVIEW SNAPSHOT — the one deterministic, grounded description of "what is going on right now".
 *
 * Pure: it takes plain facts read from the canonical stores (see overviewSnapshotServer.ts) and returns structured
 * state. It contains NO prose. Every field is a fact, a code, a count or a raw entity label, so the same snapshot can
 * later feed text, voice and visualization (the NORA briefing layer) without any of them inventing state.
 *
 *   REAL SYSTEM STATE -> Overview Snapshot -> (future) NORA presentation plan -> text + voice + visuals
 *
 * Rules enforced here:
 *  - A persisted `running` job is NOT proof that anything is executing. Executing is claimed only with executor
 *    evidence (an in-process execution record), and only when an executor exists in this process at all.
 *  - A source that could not be read is `null` / "unknown", never a guessed zero.
 *  - Severity is derived from explicit rules below, each with a reason code; nothing is exaggerated.
 */

export const OVERVIEW_SNAPSHOT_VERSION = 1;

/** Synthetic fixtures (tests, crash drills, verification runs) are never part of the owner's real work. */
export const TEST_JOB_ID_PATTERN = /^(job-)?(test|crash-test|research-verify)|^test-job/;

/** A failure/interruption older than this is history, not something that needs attention now. */
export const ATTENTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** Provenance freshness bands for recorded facts. */
export const RECENT_MS = 24 * 60 * 60 * 1000;
export const LIVE_MS = 60 * 1000;
/** Recent events kept in the snapshot. */
export const RECENT_LIMIT = 10;
/** Window of the recorded-outcome history shown in the Operational snapshot graph. */
export const ACTIVITY_WINDOW_DAYS = 14;

export type Priority = "critical" | "attention" | "informational";
export type SourceId = "jobStore" | "approvalStore" | "consultationStore" | "agentStore" | "executor" | "serviceProbe" | "mcpStore" | "aiModelStore" | "usage" | "financeFoundation" | "vault";
export type Freshness = "live" | "recent" | "stale" | "unknown";

/** Where a fact came from and how old it is. Internal structured provenance, not for display. */
export interface Provenance {
  source: SourceId;
  basis: "recorded" | "measured" | "derived" | "absent";
  refs: { type: string; id: string }[];
  observedAt: string | null;
  ageMs: number | null;
  freshness: Freshness;
}

/** Why an item has its priority: a rule code plus the facts the rule used. Not a sentence. */
export interface PriorityReason {
  code: string;
  facts: Record<string, string | number | boolean | null>;
}

export type OverviewItemKind =
  | "mission.running" | "mission.completed" | "mission.failed" | "mission.interrupted"
  | "approval.pending" | "approval.decided" | "approval.timed_out"
  | "consultation.pending" | "consultation.answered"
  | "services.unreachable";

export interface OverviewItem {
  id: string;
  kind: OverviewItemKind;
  priority: Priority;
  reason: PriorityReason;
  /** `label` is the raw name of the entity (a mission title, a service name), never generated wording. */
  subject: { type: "mission" | "approval" | "consultation" | "service"; id: string; label: string };
  occurredAt: string | null;
  /** The deeper lens that owns this item. */
  lens: DiveLensId;
  provenance: Provenance;
}

export interface NextStep {
  code: "decide_pending_approval" | "answer_pending_consultation" | "review_failed_mission" | "verify_running_mission" | "inspect_unreachable_services";
  lens: DiveLensId;
  derivedFrom: string[];
  priority: Priority;
}

// ---- input facts (plain data; null = the source could not be read) ---------------------------------------------

export interface JobFacts {
  id: string; title: string; status: "running" | "done" | "error"; percent: number;
  createdAt: string; updatedAt: string; finishedAt?: string; approvedAt?: string;
  isTest: boolean; error?: string; interrupted: boolean; verified: boolean;
  activeStep?: string | null; stepsDone?: number; stepsTotal?: number;
  usage?: { calls: number; totalTokens: number; costUsd: number | null; allCostsKnown: boolean } | null;
}
export interface ApprovalFacts { id: string; jobId: string; jobTitle: string; stepLabel: string; toolName: string; status: "pending" | "approved" | "denied" | "timed_out"; createdAt: string; decidedAt?: string; decidedBy?: string }
export interface ConsultationFacts { id: string; jobId: string; jobTitle: string; stepLabel: string; status: "pending" | "answered" | "timed_out"; createdAt: string; answeredAt?: string }
export interface AgentFacts { id: string; name: string; persistedStatus: string; lastRun: string }
export interface ProbeFacts { id: string; label: string; online: boolean; detail: string; latencyMs: number | null }

export interface OverviewInput {
  /** ISO time or epoch ms. Injected so the snapshot is deterministic. */
  now: string | number;
  /** `owner-review`: a read-only projection of another server's state. `restricted`: public preview / beta, nothing is read. */
  mode: "live" | "owner-review" | "restricted";
  /** `available` is false when this process has no executor at all (so "executing" can never be confirmed). */
  executor: { available: boolean; jobsExecuting: string[]; agentsExecuting: string[] };
  jobs: JobFacts[] | null;
  approvals: ApprovalFacts[] | null;
  consultations: ConsultationFacts[] | null;
  agents: AgentFacts[] | null;
  probes: ProbeFacts[] | null;
  systems: { mcpServers: number; mcpTools: number; models: number; routing: "local-first" | "cloud-first"; notesVaultReachable: boolean | null } | null;
  /** Number of finance modules that actually track data (financeFoundation.financeTrackedCount()). */
  financeTrackedModules: number;
  /** Seam for true "since last visit": the time the owner last reviewed Overview. No persistence exists yet. */
  lastViewedAt?: string | null;
}

// ---- output ---------------------------------------------------------------------------------------------------

/** Recorded mission outcomes bucketed by UTC day. Counts of real job records only; no smoothing, no estimates. */
export interface ActivitySeries {
  windowDays: number;
  /** Oldest first; always `windowDays` buckets (a quiet day is a real zero, not a gap). */
  buckets: { day: string; completed: number; errors: number }[];
  total: { completed: number; errors: number };
  /** Distinct days that contain at least one recorded outcome. */
  activeDays: number;
  /** How the series was derived, for audit. Internal; not for display. */
  derivation: { from: "jobStore.finishedAt|updatedAt"; completedWhen: "status=done"; errorsWhen: "status=error (failed + interrupted)"; excludes: "test fixtures" };
  provenance: Provenance;
}

export interface OverviewSnapshot {
  schemaVersion: typeof OVERVIEW_SNAPSHOT_VERSION;
  generatedAt: string;
  context: { mode: OverviewInput["mode"]; executorAvailable: boolean };
  /** Overall operational level and the rules that produced it. */
  status: { level: "critical" | "attention" | "nominal" | "unknown"; reasons: PriorityReason[] };
  counts: {
    missions: { total: number; recordedRunning: number; executingNow: number; completed: number; failed: number; interrupted: number; testExcluded: number } | null;
    approvals: { pending: number } | null;
    consultations: { pending: number } | null;
    agents: { total: number; persistedActive: number; executingNow: number } | null;
    services: { measured: number; reachable: number; unreachable: number } | null;
  };
  /** Work that exists on record as in progress, each with whether an executor is confirmed for it. */
  activeWork: OverviewItem[];
  /** Only what an executor is confirmed to be running right now. Empty whenever no executor can be confirmed. */
  executingNow: { missionIds: string[]; agentIds: string[]; confirmable: boolean };
  attention: OverviewItem[];
  recent: OverviewItem[];
  /** Mission outcomes over time, or null when missions could not be read. */
  activity: ActivitySeries | null;
  nextSteps: NextStep[];
  health: { services: (ProbeFacts & { provenance: Provenance })[] | null; degraded: boolean | null };
  agents: { id: string; name: string; persistedStatus: string; lastRun: string; executingNow: boolean }[] | null;
  context_signals: { mcpServers: number; mcpTools: number; models: number; routing: "local-first" | "cloud-first"; notesVaultReachable: boolean | null; provenance: Provenance } | null;
  usage: { available: true; calls: number; totalTokens: number; costUsd: number | null; allCostsKnown: boolean; jobsWithUsage: number; provenance: Provenance } | { available: false; reason: "no_usage_recorded" | "jobs_unreadable" };
  finance: { tracked: boolean; trackedModules: number; reason?: "no_finance_ledger" };
  sinceLastVisit: { supported: false; reason: "no_last_view_record" } | { supported: true; lastViewedAt: string; changedItemIds: string[] };
  /** What the Overview cannot truthfully know today. */
  gaps: string[];
}

// ---- helpers --------------------------------------------------------------------------------------------------

const time = (value: string | undefined | null): number | null => { if (!value) return null; const t = Date.parse(value); return Number.isNaN(t) ? null : t; };
const PRIORITY_RANK: Record<Priority, number> = { critical: 0, attention: 1, informational: 2 };

function recordedProvenance(source: SourceId, ref: { type: string; id: string }, observedAt: string | null | undefined, now: number): Provenance {
  const t = time(observedAt);
  const ageMs = t === null ? null : Math.max(0, now - t);
  return { source, basis: "recorded", refs: [ref], observedAt: t === null ? null : new Date(t).toISOString(), ageMs, freshness: ageMs === null ? "unknown" : ageMs <= LIVE_MS ? "live" : ageMs <= RECENT_MS ? "recent" : "stale" };
}
function measuredProvenance(source: SourceId, refs: { type: string; id: string }[], now: number): Provenance {
  return { source, basis: "measured", refs, observedAt: new Date(now).toISOString(), ageMs: 0, freshness: "live" };
}
function derivedProvenance(source: SourceId, refs: { type: string; id: string }[], now: number): Provenance {
  return { source, basis: "derived", refs, observedAt: new Date(now).toISOString(), ageMs: 0, freshness: "live" };
}

const byPriorityThenRecency = (a: OverviewItem, b: OverviewItem) =>
  PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (time(b.occurredAt) ?? 0) - (time(a.occurredAt) ?? 0) || a.id.localeCompare(b.id);
const byRecency = (a: OverviewItem, b: OverviewItem) => (time(b.occurredAt) ?? 0) - (time(a.occurredAt) ?? 0) || a.id.localeCompare(b.id);

/** Bucket recorded mission outcomes (done / error) by UTC day over the trailing window ending at `now`. */
export function buildActivitySeries(jobs: JobFacts[] | null, now: number, windowDays = ACTIVITY_WINDOW_DAYS): ActivitySeries | null {
  if (!jobs) return null;
  const DAY = 86_400_000;
  const todayStart = Math.floor(now / DAY) * DAY;
  const firstStart = todayStart - (windowDays - 1) * DAY;
  const buckets = Array.from({ length: windowDays }, (_, i) => ({ day: new Date(firstStart + i * DAY).toISOString().slice(0, 10), completed: 0, errors: 0 }));
  const refs: { type: string; id: string }[] = [];
  for (const job of jobs) {
    if (job.isTest || job.status === "running") continue;
    const at = time(job.finishedAt ?? job.updatedAt);
    if (at === null || at < firstStart || at >= todayStart + DAY) continue;
    const bucket = buckets[Math.floor((at - firstStart) / DAY)];
    if (job.status === "done") bucket.completed += 1; else bucket.errors += 1;
    refs.push({ type: "mission", id: job.id });
  }
  return {
    windowDays, buckets,
    total: { completed: buckets.reduce((s, b) => s + b.completed, 0), errors: buckets.reduce((s, b) => s + b.errors, 0) },
    activeDays: buckets.filter((b) => b.completed + b.errors > 0).length,
    derivation: { from: "jobStore.finishedAt|updatedAt", completedWhen: "status=done", errorsWhen: "status=error (failed + interrupted)", excludes: "test fixtures" },
    provenance: derivedProvenance("jobStore", refs.sort((a, b) => a.id.localeCompare(b.id)), now),
  };
}

// ---- builder --------------------------------------------------------------------------------------------------

export function buildOverviewSnapshot(input: OverviewInput): OverviewSnapshot {
  const now = typeof input.now === "number" ? input.now : Date.parse(input.now);
  const generatedAt = new Date(now).toISOString();
  const executorAvailable = input.mode !== "restricted" && input.executor.available;
  const jobsExecuting = new Set(executorAvailable ? input.executor.jobsExecuting : []);
  const agentsExecuting = new Set(executorAvailable ? input.executor.agentsExecuting : []);

  const items: OverviewItem[] = [];
  const restricted = input.mode === "restricted";

  // Real work only: synthetic test fixtures never enter the briefing.
  const realJobs = input.jobs ? input.jobs.filter((job) => !job.isTest) : null;
  const testJobIds = new Set((input.jobs ?? []).filter((j) => j.isTest).map((j) => j.id));
  const isRealJobId = (id: string) => !testJobIds.has(id) && !TEST_JOB_ID_PATTERN.test(id);
  const realApprovals = input.approvals ? input.approvals.filter((a) => isRealJobId(a.jobId)) : null;
  const realConsultations = input.consultations ? input.consultations.filter((c) => isRealJobId(c.jobId)) : null;
  const pendingApprovals = realApprovals?.filter((a) => a.status === "pending") ?? null;
  // A record without its own title borrows the owning job's title; failing that, shows its raw id. Never a made-up name.
  const titleOf = (jobId: string, own: string | undefined) => own || input.jobs?.find((j) => j.id === jobId)?.title || jobId;
  const pendingByJob = new Map<string, ApprovalFacts[]>();
  for (const approval of pendingApprovals ?? []) pendingByJob.set(approval.jobId, [...(pendingByJob.get(approval.jobId) ?? []), approval]);

  // ---- missions
  for (const job of realJobs ?? []) {
    const ref = { type: "mission", id: job.id };
    const ageSinceUpdate = Math.max(0, now - (time(job.updatedAt) ?? now));
    const subject = { type: "mission" as const, id: job.id, label: job.title };
    if (job.status === "running") {
      const executing = jobsExecuting.has(job.id);
      const waiting = (pendingByJob.get(job.id) ?? []).length > 0;
      const reason: PriorityReason = executorAvailable && !executing
        ? { code: "mission.running_without_executor", facts: { executorAvailable, executing, ageSinceUpdateMs: ageSinceUpdate } }
        : executing && !waiting && ageSinceUpdate > RECENT_MS
          ? { code: "mission.stalled", facts: { executing, ageSinceUpdateMs: ageSinceUpdate } }
          : { code: executing ? "mission.executing" : "mission.recorded_running_unconfirmed", facts: { executorAvailable, executing } };
      items.push({
        id: `mission:${job.id}`, kind: "mission.running",
        priority: reason.code === "mission.running_without_executor" || reason.code === "mission.stalled" ? "attention" : "informational",
        reason: { code: reason.code, facts: { ...reason.facts, percent: job.percent, stage: job.activeStep ?? null, waitingOnApproval: waiting, evidence: executing ? "executor_confirmed" : executorAvailable ? "executor_absent" : "persisted_only" } },
        subject, occurredAt: job.updatedAt, lens: "lens.missions", provenance: recordedProvenance("jobStore", ref, job.updatedAt, now),
      });
    } else if (job.status === "done") {
      items.push({
        id: `mission:${job.id}`, kind: "mission.completed", priority: "informational",
        reason: { code: "mission.completed", facts: { verified: job.verified, approved: !!job.approvedAt } },
        subject, occurredAt: job.finishedAt ?? job.updatedAt, lens: "lens.missions", provenance: recordedProvenance("jobStore", ref, job.finishedAt ?? job.updatedAt, now),
      });
    } else {
      const occurredAt = job.finishedAt ?? job.updatedAt;
      const age = Math.max(0, now - (time(occurredAt) ?? now));
      const recentEnough = age <= ATTENTION_WINDOW_MS;
      const code = job.interrupted ? "mission.interrupted" : "mission.failed";
      items.push({
        id: `mission:${job.id}`, kind: job.interrupted ? "mission.interrupted" : "mission.failed",
        priority: recentEnough ? "attention" : "informational",
        reason: { code: recentEnough ? code : `${code}.aged`, facts: { ageMs: age, windowMs: ATTENTION_WINDOW_MS, interrupted: job.interrupted } },
        subject, occurredAt, lens: "lens.missions", provenance: recordedProvenance("jobStore", ref, occurredAt, now),
      });
    }
  }

  // ---- approvals
  for (const approval of realApprovals ?? []) {
    const ref = { type: "approval", id: approval.id };
    const subject = { type: "approval" as const, id: approval.id, label: titleOf(approval.jobId, approval.jobTitle) };
    if (approval.status === "pending") {
      const blocking = jobsExecuting.has(approval.jobId);
      items.push({
        id: `approval:${approval.id}`, kind: "approval.pending",
        priority: blocking ? "critical" : "attention",
        reason: { code: blocking ? "approval.blocks_executing_work" : "approval.pending", facts: { jobId: approval.jobId, tool: approval.toolName, stage: approval.stepLabel, executingWorkBlocked: blocking } },
        subject, occurredAt: approval.createdAt, lens: "lens.missions", provenance: recordedProvenance("approvalStore", ref, approval.createdAt, now),
      });
    } else if (approval.status === "timed_out") {
      const at = approval.decidedAt ?? approval.createdAt;
      items.push({
        id: `approval:${approval.id}`, kind: "approval.timed_out",
        priority: now - (time(at) ?? now) <= ATTENTION_WINDOW_MS ? "attention" : "informational",
        reason: { code: "approval.timed_out", facts: { jobId: approval.jobId, tool: approval.toolName } },
        subject, occurredAt: at, lens: "lens.missions", provenance: recordedProvenance("approvalStore", ref, at, now),
      });
    } else if (approval.decidedAt) {
      items.push({
        id: `approval:${approval.id}`, kind: "approval.decided", priority: "informational",
        reason: { code: `approval.${approval.status}`, facts: { jobId: approval.jobId, tool: approval.toolName } },
        subject, occurredAt: approval.decidedAt, lens: "lens.missions", provenance: recordedProvenance("approvalStore", ref, approval.decidedAt, now),
      });
    }
  }

  // ---- consultations (a pipeline asked the owner a question)
  for (const consultation of realConsultations ?? []) {
    const ref = { type: "consultation", id: consultation.id };
    const subject = { type: "consultation" as const, id: consultation.id, label: titleOf(consultation.jobId, consultation.jobTitle) };
    if (consultation.status === "pending") {
      items.push({
        id: `consultation:${consultation.id}`, kind: "consultation.pending", priority: "attention",
        reason: { code: "consultation.pending", facts: { jobId: consultation.jobId, stage: consultation.stepLabel, executingWorkBlocked: jobsExecuting.has(consultation.jobId) } },
        subject, occurredAt: consultation.createdAt, lens: "lens.missions", provenance: recordedProvenance("consultationStore", ref, consultation.createdAt, now),
      });
    } else if (consultation.status === "answered" && consultation.answeredAt) {
      items.push({
        id: `consultation:${consultation.id}`, kind: "consultation.answered", priority: "informational",
        reason: { code: "consultation.answered", facts: { jobId: consultation.jobId } },
        subject, occurredAt: consultation.answeredAt, lens: "lens.missions", provenance: recordedProvenance("consultationStore", ref, consultation.answeredAt, now),
      });
    }
  }

  // ---- services: one grouped item, not one per service
  const probes = input.probes;
  const unreachable = probes?.filter((p) => !p.online) ?? [];
  if (probes && unreachable.length) {
    items.push({
      id: "services:unreachable", kind: "services.unreachable", priority: "attention",
      reason: { code: "service.unreachable", facts: { unreachable: unreachable.map((p) => p.id).join(","), unreachableCount: unreachable.length, measured: probes.length, allUnreachable: unreachable.length === probes.length } },
      subject: { type: "service", id: "services", label: unreachable.map((p) => p.label).join(", ") },
      occurredAt: generatedAt, lens: "lens.tools", provenance: measuredProvenance("serviceProbe", unreachable.map((p) => ({ type: "service", id: p.id })), now),
    });
  }

  // ---- partitions
  const attention = items.filter((i) => i.priority !== "informational").sort(byPriorityThenRecency);
  const activeWork = items.filter((i) => i.kind === "mission.running").sort(byRecency);
  const RECENT_KINDS: OverviewItemKind[] = ["mission.completed", "mission.failed", "mission.interrupted", "approval.decided", "approval.timed_out", "consultation.answered"];
  const recent = items.filter((i) => RECENT_KINDS.includes(i.kind)).sort(byRecency).slice(0, RECENT_LIMIT);

  // ---- next steps: deterministic codes derived from attention items only
  const nextSteps: NextStep[] = [];
  const add = (code: NextStep["code"], lens: DiveLensId, from: OverviewItem[]) => { if (from.length) nextSteps.push({ code, lens, derivedFrom: from.map((i) => i.id), priority: from.some((i) => i.priority === "critical") ? "critical" : "attention" }); };
  add("decide_pending_approval", "lens.missions", attention.filter((i) => i.kind === "approval.pending"));
  add("answer_pending_consultation", "lens.missions", attention.filter((i) => i.kind === "consultation.pending"));
  add("review_failed_mission", "lens.missions", attention.filter((i) => i.kind === "mission.failed" || i.kind === "mission.interrupted"));
  add("verify_running_mission", "lens.missions", attention.filter((i) => i.kind === "mission.running"));
  add("inspect_unreachable_services", "lens.tools", attention.filter((i) => i.kind === "services.unreachable"));

  // ---- overall status
  const level: OverviewSnapshot["status"]["level"] = restricted || (input.jobs === null && probes === null)
    ? "unknown"
    : attention.some((i) => i.priority === "critical") ? "critical" : attention.length ? "attention" : "nominal";
  const reasons = attention.slice(0, 5).map((i) => ({ code: i.reason.code, facts: { itemId: i.id, priority: i.priority } }));

  // ---- counts
  const missions = realJobs && {
    total: realJobs.length,
    recordedRunning: realJobs.filter((j) => j.status === "running").length,
    executingNow: realJobs.filter((j) => j.status === "running" && jobsExecuting.has(j.id)).length,
    completed: realJobs.filter((j) => j.status === "done").length,
    failed: realJobs.filter((j) => j.status === "error" && !j.interrupted).length,
    interrupted: realJobs.filter((j) => j.status === "error" && j.interrupted).length,
    testExcluded: (input.jobs?.length ?? 0) - realJobs.length,
  };
  const agentsExecutingIds = (input.agents ?? []).filter((a) => agentsExecuting.has(a.id)).map((a) => a.id);

  // ---- usage: only what step records actually carry
  const withUsage = (realJobs ?? []).filter((j) => j.usage && j.usage.calls > 0);
  const usage: OverviewSnapshot["usage"] = !realJobs
    ? { available: false, reason: "jobs_unreadable" }
    : !withUsage.length
      ? { available: false, reason: "no_usage_recorded" }
      : {
        available: true,
        calls: withUsage.reduce((s, j) => s + j.usage!.calls, 0),
        totalTokens: withUsage.reduce((s, j) => s + j.usage!.totalTokens, 0),
        costUsd: withUsage.every((j) => j.usage!.costUsd !== null) ? withUsage.reduce((s, j) => s + (j.usage!.costUsd ?? 0), 0) : null,
        allCostsKnown: withUsage.every((j) => j.usage!.allCostsKnown),
        jobsWithUsage: withUsage.length,
        provenance: derivedProvenance("usage", withUsage.map((j) => ({ type: "mission", id: j.id })), now),
      };

  // ---- since last visit (seam only: nothing persists the last view yet)
  const lastViewed = time(input.lastViewedAt ?? null);
  const sinceLastVisit: OverviewSnapshot["sinceLastVisit"] = lastViewed === null
    ? { supported: false, reason: "no_last_view_record" }
    : { supported: true, lastViewedAt: new Date(lastViewed).toISOString(), changedItemIds: items.filter((i) => (time(i.occurredAt) ?? 0) > lastViewed).map((i) => i.id).sort() };

  const gaps = [
    ...(sinceLastVisit.supported ? [] : ["since_last_visit"]),
    ...(executorAvailable ? [] : ["executor_confirmation"]),
    "live_runtime_failure_signal",
    "agent_current_task",
    "usage_outside_missions",
    ...(input.financeTrackedModules > 0 ? [] : ["finance_ledger"]),
    "durable_runtime_events",
  ];

  return {
    schemaVersion: OVERVIEW_SNAPSHOT_VERSION,
    generatedAt,
    context: { mode: input.mode, executorAvailable },
    status: { level, reasons },
    counts: {
      missions,
      approvals: pendingApprovals && { pending: pendingApprovals.length },
      consultations: realConsultations && { pending: realConsultations.filter((c) => c.status === "pending").length },
      agents: input.agents && { total: input.agents.length, persistedActive: input.agents.filter((a) => a.persistedStatus === "active").length, executingNow: agentsExecutingIds.length },
      services: probes && { measured: probes.length, reachable: probes.length - unreachable.length, unreachable: unreachable.length },
    },
    activeWork,
    executingNow: { missionIds: (realJobs ?? []).filter((j) => j.status === "running" && jobsExecuting.has(j.id)).map((j) => j.id).sort(), agentIds: agentsExecutingIds.sort(), confirmable: executorAvailable },
    attention,
    recent,
    activity: buildActivitySeries(input.jobs, now),
    nextSteps,
    health: { services: probes && probes.map((p) => ({ ...p, provenance: measuredProvenance("serviceProbe", [{ type: "service", id: p.id }], now) })), degraded: probes ? unreachable.length > 0 : null },
    agents: input.agents && input.agents.map((a) => ({ id: a.id, name: a.name, persistedStatus: a.persistedStatus, lastRun: a.lastRun, executingNow: agentsExecuting.has(a.id) })),
    context_signals: input.systems && { ...input.systems, provenance: measuredProvenance("mcpStore", [{ type: "registry", id: "mcp+models" }], now) },
    usage,
    finance: input.financeTrackedModules > 0 ? { tracked: true, trackedModules: input.financeTrackedModules } : { tracked: false, trackedModules: 0, reason: "no_finance_ledger" },
    sinceLastVisit,
    gaps,
  };
}
