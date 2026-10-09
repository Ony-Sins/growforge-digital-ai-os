import type { CoreState } from "@/lib/coreState";
import type { NextStep, OverviewItem, OverviewSnapshot, Priority } from "@/lib/overviewSnapshot";
import type { DiveLens } from "./overviewModel";
import { recordedOverviewStages, type ExecutionStage } from "./overviewRuntimeModel";

/**
 * Presentation model for the Overview. Pure: it only reshapes the deterministic Overview Snapshot (and the recorded
 * stages of the focus job) into what each region shows. It adds no facts. The strings here are fixed interface labels
 * (a region title, a status word), not conversational text: NORA's wording is generated elsewhere, later, from the
 * same snapshot.
 */

export type Tone = "neutral" | "live" | "attention" | "critical" | "muted";

/** Mission titles are stored as the brief's first line (often a markdown heading with a category prefix). Presentation only. */
export function displayTitle(title: string): string {
  const line = title.split("\n")[0].replace(/^\s*#+\s*/, "").replace(/^CLIENT\s*&\s*BUSINESS:\s*/i, "").trim();
  return line || title.trim() || "Untitled";
}

// ---- Top: operational summary (State / Executing / Approvals / Services) ---------------------------------------

export interface StripCell {
  id: "state" | "executing" | "approvals" | "services";
  label: string;
  value: string;
  caption: string;
  tone: Tone;
  lens: DiveLens | null;
  title?: string;
}

const LEVEL_LABEL = { critical: "Critical", attention: "Attention", nominal: "Nominal", unknown: "Unknown" } as const;

export function operationalStrip(snapshot: OverviewSnapshot | null): StripCell[] {
  if (!snapshot) {
    const unavailable = (id: StripCell["id"], label: string): StripCell => ({ id, label, value: "—", caption: "Unavailable", tone: "muted", lens: null });
    return [unavailable("state", "State"), unavailable("executing", "Executing"), unavailable("approvals", "Approvals"), unavailable("services", "Services")];
  }
  const { counts, executingNow, attention, status } = snapshot;
  const executing = executingNow.missionIds.length;
  const approvals = counts.approvals?.pending;
  const services = counts.services;
  return [
    { id: "state", label: "State", value: LEVEL_LABEL[status.level], caption: attention.length ? `${attention.length} open` : status.level === "unknown" ? "Not readable" : "No open items", tone: status.level === "critical" ? "critical" : status.level === "attention" ? "attention" : status.level === "unknown" ? "muted" : "neutral", lens: null },
    { id: "executing", label: "Executing", value: executingNow.confirmable ? String(executing) : "—", caption: executingNow.confirmable ? (executing ? "Confirmed live" : "None confirmed") : "Not confirmable here", tone: executing ? "live" : "muted", lens: "Missions", title: executingNow.confirmable ? "Work an executor is confirmed to be running right now." : "This view has no live executor, so execution cannot be confirmed." },
    { id: "approvals", label: "Approvals", value: approvals === undefined ? "—" : String(approvals), caption: approvals === undefined ? "Unavailable" : approvals ? "Waiting" : "None waiting", tone: approvals ? "attention" : "neutral", lens: "Missions" },
    { id: "services", label: "Services", value: services ? `${services.reachable}/${services.measured}` : "—", caption: services ? (services.unreachable ? `${services.unreachable} unreachable` : "All reachable") : "Unmeasured", tone: services && services.unreachable ? "attention" : "neutral", lens: "Tools" },
  ];
}

// ---- Left: operational snapshot (recorded counts + Now) --------------------------------------------------------

export interface SnapshotCounts { recordedRunning: number; completed: number; errors: number }

/** Recorded mission counts. `null` when missions could not be read. Errors = failed + interrupted. */
export function snapshotCounts(snapshot: OverviewSnapshot | null): SnapshotCounts | null {
  const m = snapshot?.counts.missions;
  return m ? { recordedRunning: m.recordedRunning, completed: m.completed, errors: m.failed + m.interrupted } : null;
}

export type WorkEvidence = "executing" | "recorded_unconfirmed" | "executor_absent";

export interface StageView { id: string; label: string; status: ExecutionStage["status"]; statusLabel: string }

export interface NowView {
  mission: { id: string; title: string; percent: number | null; stage: string | null; evidence: WorkEvidence; evidenceLabel: string; waiting: boolean } | null;
  /** Additional recorded-running missions beyond the primary one. */
  more: number;
  stages: StageView[];
  stagesDone: number;
  /** The next recorded stage after the current one (from the job's own steps), or null. */
  nextStage: string | null;
  /** A snapshot next-step that concerns THIS mission; unrelated global steps are not shown here. */
  nextStep: { code: NextStep["code"]; label: string; lens: DiveLens } | null;
}

export const EVIDENCE_LABEL: Record<WorkEvidence, string> = {
  executing: "Executing now · confirmed",
  recorded_unconfirmed: "Recorded as running · no confirmed live executor",
  executor_absent: "Recorded as running · no executor found",
};

/** A recorded `active` step is only "Executing" when its mission has a confirmed executor; otherwise it is a record. */
export function stageStatusLabel(status: ExecutionStage["status"], evidence: WorkEvidence): string {
  if (status === "active") return evidence === "executing" ? "Executing" : "Recorded active";
  return { done: "Completed", pending: "Pending", error: "Error", skipped: "Skipped" }[status];
}

export const NEXT_STEP_LABEL: Record<NextStep["code"], string> = {
  decide_pending_approval: "Decide pending approval",
  answer_pending_consultation: "Answer pending question",
  review_failed_mission: "Review failed mission",
  verify_running_mission: "Verify running mission",
  inspect_unreachable_services: "Inspect unreachable services",
};
const LENS_ID_TO_LABEL: Record<string, DiveLens> = { "lens.missions": "Missions", "lens.tools": "Tools", "lens.overview": "Overview", "lens.context": "Context", "lens.finance": "Finance", "lens.departments": "Departments", "lens.agents": "Agents", "lens.workflows": "Workflows", "lens.intelligence": "Intelligence" };
export const lensLabelFor = (lensId: string): DiveLens => LENS_ID_TO_LABEL[lensId] ?? "Overview";

function evidenceOf(item: OverviewItem): WorkEvidence {
  const evidence = item.reason.facts.evidence;
  return evidence === "executor_confirmed" ? "executing" : evidence === "executor_absent" ? "executor_absent" : "recorded_unconfirmed";
}

export function nowView(snapshot: OverviewSnapshot | null, core: CoreState | null): NowView {
  const empty: NowView = { mission: null, more: 0, stages: [], stagesDone: 0, nextStage: null, nextStep: null };
  if (!snapshot) return empty;
  // Confirmed-executing work first, otherwise the most recently updated record (activeWork is already recency-sorted).
  const work = [...snapshot.activeWork].sort((a, b) => Number(evidenceOf(b) === "executing") - Number(evidenceOf(a) === "executing"));
  const primary = work[0];
  if (!primary) return empty;
  const evidence = evidenceOf(primary);
  const missionId = primary.subject.id;
  const concernsMission = (itemId: string) => itemId === `mission:${missionId}` || snapshot.attention.some((a) => a.id === itemId && a.reason.facts.jobId === missionId);
  const step = snapshot.nextSteps.find((s) => s.derivedFrom.some(concernsMission));
  const nextStep = step ? { code: step.code, label: NEXT_STEP_LABEL[step.code], lens: lensLabelFor(step.lens) } : null;
  const stages = core?.job?.id === missionId ? recordedOverviewStages(core) : [];
  const percent = typeof primary.reason.facts.percent === "number" ? primary.reason.facts.percent : null;
  const stage = typeof primary.reason.facts.stage === "string" ? primary.reason.facts.stage : null;
  return {
    mission: { id: missionId, title: displayTitle(primary.subject.label), percent, stage, evidence, evidenceLabel: EVIDENCE_LABEL[evidence], waiting: primary.reason.facts.waitingOnApproval === true },
    more: work.length - 1,
    stages: stages.map((s) => ({ id: s.id, label: s.label, status: s.status, statusLabel: stageStatusLabel(s.status, evidence) })),
    stagesDone: stages.filter((s) => s.status === "done" || s.status === "skipped").length,
    nextStage: (() => { const i = stages.findIndex((s) => s.status === "active"); const after = stages.slice(i < 0 ? 0 : i + 1).find((s) => s.status === "pending"); return after ? after.label : null; })(),
    nextStep,
  };
}

// ---- Left: recorded outcomes over time (graph) -----------------------------------------------------------------------

export interface GraphPoint { day: string; label: string; completed: number; errors: number; /** 0..1 left to right */ x: number }
export interface ActivityGraph {
  /** `unavailable`: missions unreadable. `empty`: readable but no outcome in the window. `sparse`: too little history for a trend. `series`: enough days to draw a line. */
  state: "unavailable" | "empty" | "sparse" | "series";
  windowDays: number;
  /** Common scale ceiling (the largest single-day count, at least 1). Both series share it so heights are comparable. */
  max: number;
  points: GraphPoint[];
  totals: { completed: number; errors: number };
  caption: string;
}

export const GRAPH_MIN_ACTIVE_DAYS = 2;

/**
 * The Operational snapshot's graph. Pure reshaping of `snapshot.activity` (recorded mission outcomes per UTC day).
 * It adds no values: every point is a count of real job records, and with too little history it says so instead of
 * drawing a trend.
 */
export function activityGraph(snapshot: OverviewSnapshot | null): ActivityGraph {
  const activity = snapshot?.activity;
  if (!activity) return { state: "unavailable", windowDays: 0, max: 1, points: [], totals: { completed: 0, errors: 0 }, caption: "History unavailable" };
  const n = activity.buckets.length;
  const points = activity.buckets.map((b, i): GraphPoint => ({ day: b.day, label: shortDate(`${b.day}T00:00:00Z`), completed: b.completed, errors: b.errors, x: n > 1 ? i / (n - 1) : 0 }));
  const max = Math.max(1, ...activity.buckets.flatMap((b) => [b.completed, b.errors]));
  const base = { windowDays: activity.windowDays, max, points, totals: activity.total };
  if (activity.total.completed + activity.total.errors === 0) return { ...base, state: "empty", caption: `No recorded outcomes in the last ${activity.windowDays} days` };
  if (activity.activeDays < GRAPH_MIN_ACTIVE_DAYS) return { ...base, state: "sparse", caption: "Insufficient history for a trend" };
  return { ...base, state: "series", caption: `Last ${activity.windowDays} days` };
}

// ---- Left: system health (measured reachability only) ------------------------------------------------------------

export interface HealthRow { id: string; name: string; reachable: boolean; detail: string }
const SERVICE_SHORT: Record<string, string> = { ollama: "Ollama", searxng: "SearXNG", n8n: "n8n", comfyui: "ComfyUI" };

/** One row per measured service. Reachability is a measurement; latency appears only when it was measured. */
export function healthRows(snapshot: OverviewSnapshot | null): HealthRow[] | null {
  const services = snapshot?.health.services;
  if (!services) return null;
  return services.map((s) => ({ id: s.id, name: SERVICE_SHORT[s.id] ?? s.label, reachable: s.online, detail: s.online ? (typeof s.latencyMs === "number" ? `Reachable · ${s.latencyMs} ms` : "Reachable") : "Unreachable" }));
}

// ---- Right: attention (grouped) -----------------------------------------------------------------------------------

export interface AttentionRow {
  id: string;
  priority: Exclude<Priority, "informational">;
  headline: string;
  subject: string;
  /** How many snapshot items this row stands for (repeated issues are grouped, not listed one by one). */
  count: number;
  glyph: "signal" | "fracture" | "seal" | "layers";
  lens: DiveLens;
  entity: { type: string; id: string };
  /** The mission this item is about, when it has one (used to open it in Missions). */
  missionId: string | null;
}

export const REASON_LABEL: Record<string, string> = {
  "approval.blocks_executing_work": "Approval blocking live work",
  "approval.pending": "Approval waiting",
  "approval.timed_out": "Approval timed out",
  "consultation.pending": "Question waiting",
  "mission.failed": "Mission failed",
  "mission.interrupted": "Mission interrupted",
  "mission.stalled": "Mission stalled",
  "mission.running_without_executor": "Running with no executor",
  "service.unreachable": "Services unreachable",
};
export const ATTENTION_ROWS_VISIBLE = 4;

/** Items of these kinds collapse into one row when more than one is present. */
const GROUPS: { kinds: string[]; headline: (n: number) => string; glyph: AttentionRow["glyph"] }[] = [
  { kinds: ["mission.failed", "mission.interrupted"], headline: (n) => `${n} missions need review`, glyph: "fracture" },
  { kinds: ["approval.pending", "approval.timed_out"], headline: (n) => `${n} approvals waiting`, glyph: "seal" },
  { kinds: ["consultation.pending"], headline: (n) => `${n} questions waiting`, glyph: "seal" },
];
const SINGLE_GLYPH: Record<string, AttentionRow["glyph"]> = { service: "signal", mission: "fracture", approval: "seal", consultation: "seal" };

export function attentionRows(snapshot: OverviewSnapshot | null, expanded = false): { rows: AttentionRow[]; hidden: number } {
  if (!snapshot) return { rows: [], hidden: 0 };
  // Service reachability is stated once in the status line and detailed once in the System health disclosure; it is not repeated here.
  const items = snapshot.attention.filter((i): i is OverviewItem & { priority: "critical" | "attention" } => i.priority !== "informational" && i.subject.type !== "service");
  const toRow = (i: OverviewItem & { priority: "critical" | "attention" }, group?: { headline: string; count: number; glyph: AttentionRow["glyph"]; more: number; priority: "critical" | "attention" }): AttentionRow => ({
    id: i.id, priority: group?.priority ?? i.priority, headline: group?.headline ?? REASON_LABEL[i.reason.code] ?? i.reason.code,
    subject: i.subject.type === "service"
      ? (typeof i.reason.facts.unreachable === "string" ? i.reason.facts.unreachable.split(",").map((id) => SERVICE_SHORT[id] ?? id).join(" · ") : i.subject.label)
      : displayTitle(i.subject.label) + (group && group.more > 0 ? ` +${group.more} more` : ""),
    count: group?.count ?? 1, glyph: group?.glyph ?? SINGLE_GLYPH[i.subject.type] ?? "layers", lens: lensLabelFor(i.lens), entity: { type: i.subject.type, id: i.subject.id },
    missionId: i.subject.type === "mission" ? i.subject.id : typeof i.reason.facts.jobId === "string" ? i.reason.facts.jobId : null,
  });
  const all: AttentionRow[] = [];
  const consumed = new Set<string>();
  for (const item of items) {
    if (consumed.has(item.id)) continue;
    const group = GROUPS.find((g) => g.kinds.includes(item.reason.code));
    const members = group ? items.filter((m) => group.kinds.includes(m.reason.code)) : [];
    // A critical item is never folded into a group: it stays its own row so its reason stays visible.
    const foldable = members.filter((m) => m.priority !== "critical");
    if (group && item.priority !== "critical" && foldable.length > 1) {
      foldable.forEach((m) => consumed.add(m.id));
      all.push(toRow(foldable[0], { headline: group.headline(foldable.length), count: foldable.length, glyph: group.glyph, more: foldable.length - 1, priority: "attention" }));
    } else {
      consumed.add(item.id);
      all.push(toRow(item));
    }
  }
  const rows = expanded ? all : all.slice(0, ATTENTION_ROWS_VISIBLE);
  return { rows, hidden: Math.max(0, all.length - rows.length) };
}

// ---- Right: recent ------------------------------------------------------------------------------------------------

export interface RecentRow {
  id: string; outcome: "completed" | "failed" | "interrupted" | "approved" | "denied" | "timed_out" | "answered";
  outcomeLabel: string; recordKind: "mission" | "decision"; subject: string; when: string; dateLabel: string; occurredAt: string | null; missionId: string | null;
}
export const RECENT_ROWS_VISIBLE = 3;

const OUTCOME: Record<string, { outcome: RecentRow["outcome"]; label: string; kind: RecentRow["recordKind"] }> = {
  "mission.completed": { outcome: "completed", label: "Completed", kind: "mission" },
  "mission.failed": { outcome: "failed", label: "Failed", kind: "mission" },
  "mission.failed.aged": { outcome: "failed", label: "Failed", kind: "mission" },
  "mission.interrupted": { outcome: "interrupted", label: "Interrupted", kind: "mission" },
  "mission.interrupted.aged": { outcome: "interrupted", label: "Interrupted", kind: "mission" },
  "approval.approved": { outcome: "approved", label: "Approved", kind: "decision" },
  "approval.denied": { outcome: "denied", label: "Denied", kind: "decision" },
  "approval.timed_out": { outcome: "timed_out", label: "Timed out", kind: "decision" },
  "consultation.answered": { outcome: "answered", label: "Answered", kind: "decision" },
};

/** Compact relative age from two timestamps. Formatting only. */
export function ageLabel(occurredAt: string | null, now: string): string {
  const t = occurredAt ? Date.parse(occurredAt) : NaN;
  if (Number.isNaN(t)) return "";
  const diff = Math.max(0, Date.parse(now) - t);
  const m = Math.floor(diff / 60_000), h = Math.floor(diff / 3_600_000), d = Math.floor(diff / 86_400_000);
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : h < 24 ? `${h}h ago` : d < 60 ? `${d}d ago` : `${Math.floor(d / 30)}mo ago`;
}

/** Short calendar date for a recorded event ("Sep 29"). Formatting only; locale-independent. */
export function shortDate(occurredAt: string | null): string {
  const t = occurredAt ? Date.parse(occurredAt) : NaN;
  if (Number.isNaN(t)) return "";
  const d = new Date(t);
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export type RecentSummary = { completed: number; failed: number; interrupted: number; decisions: number };
export type RecentState = "unavailable" | "empty" | "populated";

export function recentState(snapshot: OverviewSnapshot | null): RecentState {
  if (!snapshot || snapshot.counts.missions === null || snapshot.context.mode === "restricted") {
    return "unavailable";
  }
  return snapshot.recent.length > 0 ? "populated" : "empty";
}

export function recentRows(snapshot: OverviewSnapshot | null): { rows: RecentRow[]; summary: RecentSummary } {
  if (!snapshot) return { rows: [], summary: { completed: 0, failed: 0, interrupted: 0, decisions: 0 } };
  const rows = snapshot.recent.flatMap((i): RecentRow[] => {
    const o = OUTCOME[i.reason.code];
    if (!o) return [];
    return [{ id: i.id, outcome: o.outcome, outcomeLabel: o.label, recordKind: o.kind, subject: displayTitle(i.subject.label), when: ageLabel(i.occurredAt, snapshot.generatedAt), dateLabel: shortDate(i.occurredAt), occurredAt: i.occurredAt, missionId: i.subject.type === "mission" ? i.subject.id : typeof i.reason.facts.jobId === "string" ? i.reason.facts.jobId : null }];
  });
  const count = (...kinds: RecentRow["outcome"][]) => rows.filter((r) => kinds.includes(r.outcome)).length;
  return { rows, summary: { completed: count("completed"), failed: count("failed"), interrupted: count("interrupted"), decisions: count("approved", "denied", "timed_out", "answered") } };
}

// ---- Center: NORA Brief --------------------------------------------------------------------------------------------

/**
 * The NORA Brief's one state. Briefing is a foundation: it is not connected to a model, so the honest state is that it
 * is not available yet. Execution evidence already lives in the status line and the Operational Snapshot, so it is not repeated here.
 */
export function briefState(snapshot: OverviewSnapshot | null): string {
  return snapshot ? "Briefing is not connected yet" : "Waiting for operational state";
}

/**
 * One factual execution-evidence line: what is and is not confirmed. Used for the screen-reader status; the visible
 * status line and Operational Snapshot carry the same facts, so the Brief does not repeat it.
 */
export function briefStatus(snapshot: OverviewSnapshot | null): string {
  if (!snapshot) return "Operational state unavailable";
  const recorded = snapshot.counts.missions?.recordedRunning ?? 0;
  const executing = snapshot.executingNow.missionIds.length;
  if (executing > 0) return `${executing} executing · confirmed`;
  if (!snapshot.executingNow.confirmable) return recorded > 0 ? `No confirmed live executor · ${recorded} recorded as running` : "No confirmed live executor";
  return recorded > 0 ? `${recorded} recorded as running · none confirmed` : "No active execution";
}

/** Screen-reader status: the same facts as the summary row, for an aria-live region. */
export function liveStatusText(snapshot: OverviewSnapshot | null): string {
  if (!snapshot) return "Operational state unavailable";
  return operationalStrip(snapshot).map((cell) => `${cell.label} ${cell.value} ${cell.caption}`).join(". ");
}
