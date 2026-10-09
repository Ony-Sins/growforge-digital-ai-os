import type { Department, Mission, MissionWorktree, PipelinePhase, Step, StepStatus } from "./missionWorktree";
import { ambiguityNodeId, isAmbiguityId } from "./missionWorktreeAncestry";
import { entityLabel } from "./missionWorktreeLabels";
import { statusText } from "./missionWorkbenchContent";
import { analyticsOf, compactNumber, type Analytics, type Metric } from "./missionAnalytics";
import { sanitizeRecordedError } from "./missionRecordedError";

/**
 * The identity header of the Mission Intelligence panel (pure). Only RECORDED facts: the recorded job status (done / error / running) and, for a running record, whether an executor confirms
 * it; the title; the recorded brief. There is no "On Track" / "At risk" judgement in the record, so none is ever shown.
 */
export type IntelTone = "done" | "error" | "running" | "live" | "neutral";
export interface IntelHeader { /** The selected entity's type, upper-cased in the panel (MISSION / PHASE / DEPARTMENT / STEP). */ eyebrow: string; title: string; status: { label: string; tone: IntelTone; note: string }; brief: string | null }

export function intelHeaderOf(mission: Pick<Mission, "title" | "brief" | "status" | "execution">): IntelHeader {
  const live = mission.execution.liveEvidence;
  const status = mission.status === "done" ? { label: "Done", tone: "done" as const, note: "Recorded status: done." }
    : mission.status === "error" ? { label: "Error", tone: "error" as const, note: "Recorded status: error." }
    : live === "confirmed" ? { label: "Running · live", tone: "live" as const, note: "Recorded running, and an executor confirms it." }
    : { label: "Running (recorded)", tone: "running" as const, note: live === "unconfirmed" ? "Recorded running; no executor confirms it." : "Recorded running; executor state could not be verified." };
  const brief = mission.brief.replace(/\s+/g, " ").trim();
  return { eyebrow: "Mission", title: mission.title, status, brief: brief || null };
}

/**
 * The Mission Progress block (Task 2C), recorded facts only: the mission's own recorded completion percent (job.percent, never recomputed or inferred) and the count of recorded steps
 * whose recorded status is done, out of every recorded step. The two are independent records and are shown as such: the bar is the recorded percent, the right-hand count is steps.
 */
export interface IntelProgress { percent: number; done: number; total: number; stepsText: string; note: string }
export function intelProgressOf(worktree: { mission: Pick<Mission, "percent">; steps: readonly { status: string }[] }): IntelProgress {
  const total = worktree.steps.length, done = worktree.steps.filter(s => s.status === "done").length;
  const percent = Math.max(0, Math.min(100, Math.round(worktree.mission.percent)));
  return { percent, done, total, stepsText: total ? `${done} / ${total} steps` : "No steps recorded", note: `Completion is the mission's recorded percent (job.percent). ${total ? `${done} of ${total} recorded steps have the recorded status done.` : "No step is recorded."}` };
}

/**
 * C5B: the identity header FOLLOWS THE GRAPH SELECTION. Mission -> the mission's own header; Phase / Department / Step -> that entity's recorded label, recorded status and a recorded description
 * (a department's assignment task, a step's recorded activity or error). Where nothing descriptive is recorded the line is a plain count of recorded facts, or empty ("not recorded"); never invented.
 */
const STEP_STATUS: Record<StepStatus, { label: string; tone: IntelTone }> = {
  done: { label: "Done", tone: "done" }, error: { label: "Error", tone: "error" }, active: { label: "Active (recorded)", tone: "running" }, pending: { label: "Pending", tone: "neutral" }, skipped: { label: "Skipped", tone: "neutral" },
};
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
const tidy = (text: string | undefined) => (text ?? "").replace(/\s+/g, " ").trim() || null;
function rollup(statuses: StepStatus[]): { label: string; tone: IntelTone } {
  if (!statuses.length) return { label: "No steps recorded", tone: "neutral" };
  const kinds = [...new Set(statuses)];
  if (statuses.includes("error")) return STEP_STATUS.error;
  if (statuses.includes("active")) return STEP_STATUS.active;
  return kinds.length === 1 ? STEP_STATUS[kinds[0]] : { label: "Mixed", tone: "neutral" };
}
export function intelIdentityOf(worktree: MissionWorktree, selectedId: string | null | undefined): IntelHeader {
  const mission = intelHeaderOf(worktree.mission);
  const id = selectedId && isAmbiguityId(selectedId) ? ambiguityNodeId(selectedId) : selectedId;
  if (!id || id === worktree.mission.id) return mission;
  const stepOf = (ids: string[]) => ids.map(x => worktree.steps.find(s => s.id === x)).filter((s): s is NonNullable<typeof s> => !!s);
  const phase = worktree.phases.find(p => p.id === id);
  if (phase) {
    const steps = stepOf(phase.stepIds), status = rollup(steps.map(s => s.status));
    const counts = steps.length ? `${plural(steps.length, "recorded step")}${phase.recordedPercent !== undefined ? ` · ${phase.recordedPercent}% recorded` : ""}` : "No steps are recorded for this phase.";
    return { eyebrow: "Phase", title: phase.label, status: { ...status, note: `Roll-up of the recorded status of ${plural(steps.length, "step")}.` }, brief: counts };
  }
  const department = worktree.departments.find(d => d.id === id);
  if (department) {
    const steps = stepOf(department.stepIds), status = rollup(steps.map(s => s.status));
    return { eyebrow: "Department", title: department.name, status: { ...status, note: `Roll-up of the recorded status of ${plural(steps.length, "step")}.` }, brief: tidy(department.assignments[0]?.task) };
  }
  const step = worktree.steps.find(s => s.id === id);
  if (step) {
    const st = STEP_STATUS[step.status];
    return { eyebrow: "Step", title: entityLabel(worktree, step.id)?.label ?? step.label, status: { ...st, note: `Recorded step status: ${step.status}.` }, brief: step.status === "error" ? tidy(step.error) ?? tidy(step.activity) : tidy(step.activity) };
  }
  return mission;
}

/**
 * C7A: the panel body in the reference's structure, for EVERY selection: a status / context row, one headline metric (with the recorded dot instrument), a 2 x 2 grid of key figures and one compact
 * analysis card (C7C). Every value is a recorded fact already used elsewhere: the canonical analytics (`analyticsOf`: headline, composition, tiles) and the step / department / phase records.
 * Nothing is added that the record does not hold (no sentiment, health, trend or narrative): where the reference has such a field the card simply has no counterpart.
 */
/** C7B: the compact dot instrument beside the headline. `distribution`: one column per recorded state, one dot per recorded child (scaled by `unit` only when a column would exceed the dot rows, and then
 *  the legend says so); `progress`: a dotted track filled to the step's own recorded percent. Both are the recorded numbers drawn as dots, nothing else. */
export const INTEL_DOT_ROWS = 8, INTEL_PROGRESS_DOTS = 20;
export type IntelInstrument =
  | { kind: "distribution"; unit: number; columns: { status: StepStatus; label: string; count: number; dots: number }[] }
  | { kind: "progress"; percent: number; dots: number; filled: number }
  | null;
export function instrumentOf(segments: { status: StepStatus; label: string; count: number }[], percent: number | null, hasComposition: boolean): IntelInstrument {
  if (hasComposition && segments.length) {
    // one slot per recorded state in the canonical order: a state with no recorded child keeps its (empty) slot, so the instrument reads as a histogram, never as a single bar
    const max = Math.max(...segments.map(x => x.count)), unit = Math.max(1, Math.ceil(max / INTEL_DOT_ROWS));
    const slots = (["done", "active", "pending", "error", "skipped"] as const).map(status => { const seg = segments.find(x => x.status === status), count = seg?.count ?? 0; return { status, label: seg?.label ?? status, count, dots: count ? Math.max(1, Math.ceil(count / unit)) : 0 }; });
    return { kind: "distribution", unit, columns: slots };
  }
  if (percent === null) return null;
  const clamped = Math.max(0, Math.min(100, percent));
  return { kind: "progress", percent: clamped, dots: INTEL_PROGRESS_DOTS, filled: Math.round((clamped / 100) * INTEL_PROGRESS_DOTS) };
}
/** C7C: the compact analysis card: a lead line and one or two evidence sentences, every one a deterministic statement of recorded facts. */
export interface IntelAnalysis { lead: string; lines: string[] }
export interface IntelSummary {
  context: string;
  headline: { label: string; text: string; percent: number | null; note: string; meta: string | null };
  segments: { status: StepStatus; label: string; count: number }[];
  instrument: IntelInstrument;
  tiles: Metric[];
  analysis: IntelAnalysis;
}
const stampOf = (iso?: string) => (iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` : null);
const earliest = (list: (string | undefined)[]) => list.filter((x): x is string => !!x).sort()[0];
/**
 * C7E.3.1: the 2 x 2 key figures: API calls, Tokens, API cost, Elapsed (completion and step counts already live in the headline). Every figure is the canonical analytics' own metric (the same numbers and
 * sources the Workbench shows); the cost tile reuses `analytics.cost` (billed vs price-table estimate, never merged): a recorded billed cost is shown as billed; else an existing estimate is shown clearly
 * labelled "Estimated"; else "Not recorded". A missing or unpriced cost is never shown as $0.
 */
export function costMetric(cost: Analytics["cost"]): Metric {
  const billed = cost.billed.trim();
  if (billed && billed !== "Not recorded") return { label: "API cost", value: billed, sub: "Billed", source: "Recorded billed cost." };
  if (/^[≈$]/.test(cost.estimate)) return { label: "API cost", value: cost.estimate, sub: cost.estimate === "$0.00" ? "Estimated · local / free model" : "Estimated · price table", source: `${cost.estimateNote} Billed cost is not recorded.` };
  return { label: "API cost", value: "Not recorded", tone: "quiet", source: `${cost.estimateNote} Billed cost is not recorded.` };
}
export function kpisOf(analytics: Analytics): Metric[] {
  const all = [...analytics.tiles, ...analytics.groups.flatMap(g => g.metrics)];
  const pick = (labels: string[], fallback: Metric): Metric => all.find(m => labels.includes(m.label)) ?? fallback;
  const missing = (label: string): Metric => ({ label, value: "Not recorded", tone: "quiet", source: "Nothing is recorded for this." });
  const time = pick(["Elapsed", "Duration"], missing("Elapsed"));
  return [pick(["API calls"], missing("API calls")), pick(["Tokens"], missing("Tokens")), costMetric(analytics.cost), { ...time, label: "Elapsed" }];
}
const COUNT_WORD: Record<StepStatus, string> = { done: "done", active: "running", pending: "pending", error: "failed", skipped: "skipped" };
const COUNT_ORDER: StepStatus[] = ["done", "active", "pending", "error", "skipped"];
const plural2 = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
const oneLine = (text: string | undefined) => (text ?? "").replace(/\s+/g, " ").trim();
function analysisOf(worktree: MissionWorktree, headline: { label: string; text: string }, step?: Step, phase?: PipelinePhase, department?: Department): IntelAnalysis {
  if (step) {
    const lines: string[] = [];
    const err = step.status === "error" || step.error ? sanitizeRecordedError(step.error, 150) : null;
    if (err) lines.push(`Recorded error: ${err}`);
    else if (oneLine(step.activity)) lines.push(`Recorded activity: ${oneLine(step.activity)}`);
    const out = step.outputId ? worktree.outputs.find(o => o.id === step.outputId) : undefined;
    if (out && !err) lines.push(`Output: ${compactNumber(out.chars)} characters recorded.`);
    const needs = step.dependencies.prerequisiteIds.length, waits = step.dependencies.dependentIds.length;
    if (needs || waits) lines.push(`Needs ${plural2(needs, "recorded step")}; ${plural2(waits, "recorded step")} ${waits === 1 ? "waits" : "wait"} on it.`);
    const records = worktree.usage.filter(u => u.stepId === step.id);
    if (records.length) { const tokens = records.reduce((n, u) => n + (u.inputTokens ?? 0) + (u.outputTokens ?? 0), 0); lines.push(`${[...new Set(records.map(u => u.provider))].join(", ")} · ${plural2(records.length, "call")}${tokens ? ` · ${compactNumber(tokens)} tokens` : ""} recorded.`); }
    return { lead: `${statusText(step.status)} · ${step.percent}% recorded`, lines: lines.slice(0, 3) };
  }
  const scope = phase ? phase.stepIds.map(x => worktree.steps.find(y => y.id === x)).filter((y): y is Step => !!y) : department ? department.stepIds.map(x => worktree.steps.find(y => y.id === x)).filter((y): y is Step => !!y) : worktree.steps;
  const counts = COUNT_ORDER.map(st => ({ st, n: scope.filter(x => x.status === st).length })).filter(x => x.n > 0).map(x => `${x.n} ${COUNT_WORD[x.st]}`);
  const joined = counts.length > 1 ? `${counts.slice(0, -1).join(", ")} and ${counts[counts.length - 1]}` : counts[0] ?? "";
  const lines = [scope.length ? `${joined} of ${plural2(scope.length, "recorded step")}.` : "No step is recorded."];
  const failed = scope.filter(x => x.status === "error").sort((a, b) => a.ordinal - b.ordinal)[0];
  if (failed) {
    const owner = failed.departmentId ? worktree.departments.find(d => d.id === failed.departmentId)?.name : worktree.phases.find(p => p.id === failed.phaseId)?.label;
    const err = sanitizeRecordedError(failed.error, 150);
    lines.push(err ? `Recorded error${owner ? ` in ${owner}` : ""}: ${err}` : `${owner ?? entityLabel(worktree, failed.id)?.label ?? "A step"} is recorded as failed (no error text recorded).`);
  }
  return { lead: `${headline.label} ${headline.text}`, lines };
}
export function intelSummaryOf(worktree: MissionWorktree, selectedId: string | null | undefined): IntelSummary {
  const raw = selectedId && isAmbiguityId(selectedId) ? ambiguityNodeId(selectedId) : selectedId;
  const id = raw ?? worktree.mission.id;
  const step = worktree.steps.find(x => x.id === id), phase = worktree.phases.find(p => p.id === id);
  const department = worktree.departments.find(d => d.id === id);
  const analytics = analyticsOf(worktree, id) ?? analyticsOf(worktree, worktree.mission.id)!;
  const stepsOfIds = (ids: string[]) => ids.map(x => worktree.steps.find(y => y.id === x)).filter((y): y is NonNullable<typeof y> => !!y);
  // ---- the analysis card: deterministic sentences over recorded facts only (no recommendation, sentiment, risk or trend)
  const analysis = analysisOf(worktree, analytics.headline, step, phase, department);
  // ---- the context line: one recorded timestamp
  const started = step ? step.startedAt : phase ? phase.startedAt : department ? earliest(stepsOfIds(department.stepIds).map(x => x.startedAt)) : undefined;
  const context = !step && !phase && !department ? `Last recorded update ${stampOf(worktree.mission.updatedAt) ?? "not recorded"}` : started ? `Started ${stampOf(started)}` : "No start time recorded";
  const isMission = !step && !phase && !department;
  return {
    context,
    headline: { label: analytics.headline.label, text: analytics.headline.text, percent: analytics.headline.percent, note: analytics.headline.source, meta: isMission ? intelProgressOf(worktree).stepsText : null },
    segments: (analytics.composition?.segments ?? []).filter(x => x.count > 0),
    instrument: instrumentOf((analytics.composition?.segments ?? []).filter(x => x.count > 0), analytics.headline.percent, !!analytics.composition),
    tiles: kpisOf(analytics), analysis,
  };
}
