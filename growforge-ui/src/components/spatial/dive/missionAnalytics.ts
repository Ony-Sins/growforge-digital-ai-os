import type { MissionWorktree, Step, StepStatus, Usage } from "./missionWorktree";
import { selectableFor, stepsOfNode } from "./missionWorktreeAncestry";

/**
 * W7.2 selection-aware analytics: a PURE model built only from the canonical Worktree (W1). Every number has a deterministic source that is carried WITH the number (`source`),
 * so the surface can say where it came from and a test can prove it. Nothing here is a score, a health rating, an efficiency, a confidence or a trend.
 *
 * Truth rules (locked):
 *   - A percentage exists only when its denominator exists: recorded `percent` fields as recorded, or `done steps / recorded steps` (derived, labelled). No denominator = no percent.
 *   - Billed cost is NEVER recorded in the job: it is always "Not recorded". The price-table estimate is a separate field and is never worded as spend; a free / local model has no
 *     per-token price ("$0" is never claimed as a bill).
 *   - Usage is attributed only through the step that recorded it. A phase / department / mission total is the sum over the steps it owns (a recorded ownership relation).
 *   - A distribution is drawn only where it has at least two real rows. One row is a number, not a chart.
 */
export type MetricTone = "alert" | "quiet" | "live";
export interface Metric { label: string; value: string; sub?: string; tone?: MetricTone; /** Where the value comes from (recorded field, or the derivation). */ source: string }
export interface StatusSegment { status: StepStatus; label: string; count: number }
export interface DistRow { label: string; value: number; display: string; /** Selectable entity this row stands for. */ target?: string }
export interface Distribution { title: string; rows: DistRow[]; source: string }
export type AnalyticsKind = "mission" | "phase" | "department" | "step";
export interface Analytics {
  entityId: string; kind: AnalyticsKind;
  headline: { label: string; percent: number | null; text: string; source: string };
  composition?: { title: string; total: number; segments: StatusSegment[]; source: string };
  /** The key instruments (the Peek shows these). */
  tiles: Metric[];
  /** The full instrument set (the Workbench Overview shows these). */
  groups: { title: string; metrics: Metric[] }[];
  /** Input vs output tokens, only when both are reported for every call in scope. */
  split?: { input: number; output: number; source: string };
  distributions: Distribution[];
  /** Billed and estimated cost are separate and never merged. */
  cost: { billed: string; estimate: string; estimateNote: string };
  /** Peek fact labels this analytics header already carries (the Peek hides those facts instead of printing the value twice). */
  covers: string[];
}

const STATUS_LABEL: Record<StepStatus, string> = { done: "done", active: "running (recorded)", pending: "pending", error: "failed", skipped: "skipped" };
const STATUS_ORDER: StepStatus[] = ["done", "active", "pending", "error", "skipped"];
const num = (n: number) => n.toLocaleString("en-US");
export const compactNumber = (n: number): string => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M` : n >= 10_000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
export const formatDuration = (ms: number): string => { const s = Math.round(ms / 1000); return s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s` : ms < 10_000 && ms > 0 ? `${(ms / 1000).toFixed(1)}s` : `${s}s`; };
const span = (a?: string, b?: string): number | null => { if (!a || !b) return null; const ms = Date.parse(b) - Date.parse(a); return Number.isFinite(ms) && ms >= 0 ? ms : null; };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const pct = (done: number, total: number): number | null => (total > 0 ? Math.round((100 * done) / total) : null);
const earliest = (v: (string | undefined)[]) => v.filter((x): x is string => !!x).sort()[0];
const latest = (v: (string | undefined)[]) => v.filter((x): x is string => !!x).sort().slice(-1)[0];

interface UsageSum {
  calls: number; inputTokens: number; outputTokens: number; totalTokens: number;
  /** false when any call in scope did not report an input or output count */
  tokensComplete: boolean; apiMs: number;
  estimateUsd: number | null; estimateKnownAll: boolean;
  models: Map<string, { calls: number; tokens: number }>;
}
function sumUsage(records: readonly Usage[]): UsageSum | null {
  if (!records.length) return null;
  const models = new Map<string, { calls: number; tokens: number }>();
  let inT = 0, outT = 0, ms = 0, usd = 0, known = true, complete = true;
  records.forEach(u => {
    inT += u.inputTokens ?? 0; outT += u.outputTokens ?? 0; ms += u.durationMs;
    if (u.inputTokens === null || u.outputTokens === null) complete = false;
    if (u.estimate.usd === null) known = false; else usd += u.estimate.usd;
    const key = `${u.provider} · ${u.model}`, m = models.get(key) ?? { calls: 0, tokens: 0 };
    m.calls += 1; m.tokens += (u.inputTokens ?? 0) + (u.outputTokens ?? 0); models.set(key, m);
  });
  return { calls: records.length, inputTokens: inT, outputTokens: outT, totalTokens: inT + outT, tokensComplete: complete, apiMs: ms, estimateUsd: known ? usd : null, estimateKnownAll: known, models };
}
/** Estimate wording: a price-table estimate, never a bill. usd === 0 is a KNOWN zero (the table lists the model at no cost: local / free); an unpriced model or a call without token counts is unknown ("Not available"), never $0. */
function estimateText(sum: UsageSum | null): { value: string; note: string } {
  if (!sum) return { value: "No usage recorded", note: "No call is recorded for this work, so there is nothing to estimate." };
  if (sum.estimateUsd === null) return { value: "Not available", note: "Some models have no price-table entry (or a call reported no token count)." };
  if (sum.estimateUsd === 0) return { value: "$0.00", note: "Every call is on a model the price table lists at zero (local / free): a known $0.00 estimate. Not a bill; billed cost is not recorded." };
  return { value: `≈ $${sum.estimateUsd.toFixed(sum.estimateUsd < 0.01 ? 4 : 2)}`, note: "Price-table estimate from reported tokens. Not billed spend." };
}
const tokensMetric = (sum: UsageSum | null, scope: string): Metric => sum
  ? { label: "Tokens", value: compactNumber(sum.totalTokens), sub: `${compactNumber(sum.inputTokens)} in/${compactNumber(sum.outputTokens)} out${sum.tokensComplete ? "" : " ·partial"}`, source: `Provider-reported input + output tokens summed over the ${scope}'s recorded calls${sum.tokensComplete ? "" : "; some calls reported no count"}.` }
  : { label: "Tokens", value: "Not recorded", tone: "quiet", source: `No usage record exists for this ${scope}.` };
const callsMetric = (sum: UsageSum | null, scope: string): Metric => sum
  ? { label: "API calls", value: String(sum.calls), sub: `${formatDuration(sum.apiMs)} API`, source: `Count of recorded usage records for the ${scope}; API time is the sum of their measured durations.` }
  : { label: "API calls", value: "Not recorded", tone: "quiet", source: `No usage record exists for this ${scope}.` };

function composition(steps: Step[], title: string, source: string): Analytics["composition"] {
  const counts = new Map<StepStatus, number>();
  steps.forEach(s => counts.set(s.status, (counts.get(s.status) ?? 0) + 1));
  return { title, total: steps.length, segments: STATUS_ORDER.filter(s => counts.has(s)).map(s => ({ status: s, label: STATUS_LABEL[s], count: counts.get(s)! })), source };
}
const countOf = (steps: Step[], status: StepStatus) => steps.filter(s => s.status === status).length;
const stepsMetric = (steps: Step[], scope: string): Metric => {
  const done = countOf(steps, "done");
  return { label: "Steps", value: steps.length ? `${done}/${steps.length}` : "None", sub: steps.length ? `${done} done` : "none recorded", source: `Recorded steps of the ${scope}: done / total.` };
};
function outputMetric(steps: Step[], scope: string): Metric {
  const n = steps.filter(s => !!s.outputId).length;
  return { label: "Output", value: steps.length ? `${n}/${steps.length}` : "None", sub: n ? "recorded" : "none recorded", tone: n ? undefined : "quiet", source: `Steps of the ${scope} that have a recorded output / steps recorded.` };
}
function dependencyMetric(worktree: MissionWorktree, steps: Step[], scope: string): Metric {
  const inside = new Set(steps.map(s => s.id));
  const needs = new Set(steps.flatMap(s => s.dependencies.prerequisiteIds).filter(id => !inside.has(id)).map(id => selectableFor(worktree, id)));
  const waits = new Set(steps.flatMap(s => s.dependencies.dependentIds).filter(id => !inside.has(id)).map(id => selectableFor(worktree, id)));
  const issues = steps.reduce((n, s) => n + s.dependencies.issues.length, 0);
  return { label: "Dependencies", value: `←${needs.size} · ${waits.size}→`, sub: issues ? `${issues} unresolved` : "needs · waited by", tone: issues ? "alert" : undefined, source: `Resolved recorded dependencies of the ${scope}'s steps that cross its boundary (needs first / waits on this). Unresolved references are counted, never guessed.` };
}
function timing(steps: Step[]): { start?: string; end?: string; ms: number | null; running: boolean } {
  const start = earliest(steps.map(s => s.startedAt)), finishes = steps.map(s => s.finishedAt);
  const running = steps.some(s => s.startedAt && !s.finishedAt);
  const end = running ? undefined : latest(finishes);
  return { start, end, ms: span(start, end), running };
}
const stamp = (iso?: string) => (iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` : undefined);

function rankedDistribution(title: string, source: string, rows: { label: string; value: number; target?: string }[]): Distribution | null {
  const used = rows.filter(r => r.value > 0);
  if (used.length < 2) return null; // one row is a number, not a chart
  const total = used.reduce((n, r) => n + r.value, 0);
  return { title, source, rows: used.sort((a, b) => b.value - a.value || (a.label < b.label ? -1 : 1)).map(r => ({ label: r.label, value: r.value, display: `${compactNumber(r.value)} · ${Math.round((100 * r.value) / total)}%`, ...(r.target ? { target: r.target } : {}) })) };
}
const tokensOf = (records: readonly Usage[]) => records.reduce((n, u) => n + (u.inputTokens ?? 0) + (u.outputTokens ?? 0), 0);
const modelDistribution = (sum: UsageSum | null, scope: string): Distribution | null => sum ? rankedDistribution("Tokens by provider · model", `Provider-reported tokens grouped by the recorded provider and model of each call in the ${scope}.`, [...sum.models.entries()].map(([label, m]) => ({ label, value: m.tokens }))) : null;
const modelsMetric = (sum: UsageSum | null, steps: Step[], scope: string): Metric => {
  const names = sum ? [...sum.models.keys()] : [...new Set(steps.map(s => s.provider).filter((p): p is string => !!p))];
  return { label: "Provider · model", value: names.length ? (names.length === 1 ? names[0] : `${names.length} models`) : "Not recorded", ...(names.length > 1 ? { sub: names.slice(0, 3).join(" · ") } : {}), tone: names.length ? undefined : "quiet", source: `Provider and model recorded on the ${scope}'s usage records${sum ? "" : " (step provider only; no per-call record)"}.` };
};
const splitOf = (sum: UsageSum | null, scope: string): Analytics["split"] => (sum && sum.tokensComplete && sum.inputTokens + sum.outputTokens > 0 ? { input: sum.inputTokens, output: sum.outputTokens, source: `Input and output tokens as reported by the provider for every call in the ${scope}.` } : undefined);

/* ------------------------------------------------------------------ builders */
function missionAnalytics(worktree: MissionWorktree): Analytics {
  const m = worktree.mission, steps = worktree.steps, sum = sumUsage(worktree.usage);
  const est = estimateText(sum), phaseCount = worktree.phases.length;
  const live = m.execution.liveEvidence;
  const qa = worktree.steps.find(s => s.phaseKey === "qa");
  const elapsed = span(m.createdAt, m.finishedAt), win = timing(steps);
  const pendingTools = worktree.approvals ? worktree.approvals.filter(a => a.status === "pending").length : null;
  const dist = [
    rankedDistribution("Tokens by department", "Provider-reported tokens of each department's recorded steps (usage is attributed through the step that recorded it).", worktree.departments.map(d => ({ label: d.name, value: tokensOf(worktree.usage.filter(u => d.stepIds.includes(u.stepId))), target: d.id }))),
    rankedDistribution("Tokens by phase", "Provider-reported tokens of each canonical phase's recorded steps.", worktree.phases.map(p => ({ label: p.label, value: tokensOf(worktree.usage.filter(u => p.stepIds.includes(u.stepId))), target: p.id }))),
    modelDistribution(sum, "mission"),
  ].filter((d): d is Distribution => !!d);
  const done = countOf(steps, "done");
  return {
    entityId: m.id, kind: "mission",
    headline: { label: "Recorded completion", percent: m.percent, text: `${m.percent}%`, source: "The mission's own recorded percent (job.percent). Recorded progress is not success." },
    ...(steps.length ? { composition: composition(steps, "Steps by recorded state", "Count of the mission's recorded steps per recorded status.") } : {}),
    tiles: [
      { label: "Steps", value: steps.length ? `${done}/${steps.length}` : "None", sub: `${phaseCount}/${worktree.canonicalPhaseOrder.length} phases`, source: "Recorded steps done / total; phases recorded of 7 canonical; departments recorded." },
      callsMetric(sum, "mission"), tokensMetric(sum, "mission"),
      { label: "Elapsed", value: elapsed !== null ? formatDuration(elapsed) : m.finishedAt ? "Not recorded" : "Not finished", sub: win.ms !== null && win.ms !== elapsed ? `${formatDuration(win.ms)} steps` : "created → finished", tone: elapsed === null ? "quiet" : undefined, source: "Created → finished timestamps on the job; the step window is first step start → last step finish." },
      { label: "Estimate", value: est.value, sub: est.value === "$0.00" ? "local / free model" : "price table", tone: est.value === "Not available" || est.value === "No usage recorded" ? "quiet" : undefined, source: est.note },
      { label: "Billed cost", value: "Not recorded", tone: "quiet", source: m.billedCost.reason || "Billed cost is not recorded on the job." },
    ],
    groups: [
      { title: "Progress", metrics: [
        { label: "Recorded completion", value: `${m.percent}%`, source: "job.percent (recorded)." },
        { label: "Phases", value: `${phaseCount} of ${worktree.canonicalPhaseOrder.length}`, sub: "recorded", source: "Canonical phases that have at least one recorded step." },
        { label: "Departments", value: String(worktree.departments.length), source: "Recorded departments." },
        stepsMetric(steps, "mission"),
        { label: "By state", value: `${done} done · ${countOf(steps, "active")} running · ${countOf(steps, "pending")} pending · ${countOf(steps, "error")} failed`, source: "Recorded step statuses; running is the recorded status, not executor confirmation." },
        { label: "State", value: m.status === "running" ? (live === "confirmed" ? "Running · executor confirmed" : live === "unconfirmed" ? "Recorded running · not confirmed" : "Recorded running · unverifiable") : m.status === "done" ? "Done" : "Error", tone: m.status === "error" ? "alert" : live === "confirmed" ? "live" : undefined, source: "Recorded job status; executor confirmation is a separate read." },
      ] },
      { title: "Time", metrics: [
        { label: "Created", value: stamp(m.createdAt) ?? "Not recorded", source: "job.createdAt." },
        { label: "Finished", value: stamp(m.finishedAt) ?? "Not finished", tone: m.finishedAt ? undefined : "quiet", source: "job.finishedAt." },
        { label: "Elapsed", value: elapsed !== null ? formatDuration(elapsed) : "Not recorded", tone: elapsed === null ? "quiet" : undefined, source: "finishedAt − createdAt." },
        { label: "Step window", value: win.ms !== null ? formatDuration(win.ms) : win.running ? "Still running" : "Not recorded", sub: win.start ? stamp(win.start) : undefined, tone: win.ms === null ? "quiet" : undefined, source: "Earliest step startedAt → latest step finishedAt." },
        ...(sum ? [{ label: "API time", value: formatDuration(sum.apiMs), source: "Sum of measured per-call durations." } as Metric] : []),
      ] },
      { title: "Usage", metrics: [callsMetric(sum, "mission"), tokensMetric(sum, "mission"), modelsMetric(sum, steps, "mission")] },
      { title: "Cost", metrics: [
        { label: "Billed cost", value: "Not recorded", tone: "quiet", source: m.billedCost.reason || "Billed cost is not recorded on the job." },
        { label: "Estimated cost", value: est.value, sub: "price-table estimate, not spend", tone: undefined, source: est.note },
      ] },
      { title: "Decisions", metrics: [
        { label: "Plan approval", value: m.approvedAt ? `Approved ${stamp(m.approvedAt)}` : "Not recorded", tone: m.approvedAt ? undefined : "quiet", source: "job.approvedAt (owner approval of the final plan)." },
        { label: "Tool approvals", value: pendingTools === null ? "Not readable" : pendingTools ? `${pendingTools} pending` : worktree.approvals?.length ? "None pending" : "None recorded", tone: pendingTools ? "alert" : "quiet", source: "Pending tool approval requests for this mission." },
        { label: "Requested changes", value: String(m.requestedChanges.length), source: "job.revisions." },
        { label: "QA verdict", value: qa?.review?.verdict ?? "Not recorded", sub: qa?.review?.verdict ? "parsed from the Verdict line" : undefined, tone: qa?.review?.verdict ? undefined : "quiet", source: "The explicit **Verdict:** line of the recorded QA output (parsed from text). Never inferred from state." },
      ] },
    ],
    ...(splitOf(sum, "mission") ? { split: splitOf(sum, "mission") } : {}),
    distributions: dist,
    cost: { billed: "Not recorded", estimate: est.value, estimateNote: est.note },
    covers: ["Progress", "Phases", "Departments", "Steps"],
  };
}

function scopeAnalytics(worktree: MissionWorktree, id: string, kind: "phase" | "department"): Analytics {
  const steps = stepsOfNode(worktree, id);
  const phase = kind === "phase" ? worktree.phases.find(p => p.id === id) : undefined;
  const department = kind === "department" ? worktree.departments.find(d => d.id === id) : undefined;
  const scope = kind === "phase" ? "phase" : "department";
  const set = new Set(steps.map(s => s.id)), records = worktree.usage.filter(u => set.has(u.stepId));
  const sum = sumUsage(records), est = estimateText(sum), t = timing(steps), done = countOf(steps, "done");
  const single = phase && steps.length === 1 && phase.recordedPercent !== undefined;
  const percent = single ? phase!.recordedPercent! : pct(done, steps.length);
  const headline: Analytics["headline"] = single
    ? { label: "Recorded progress", percent, text: `${percent}%`, source: "The phase's single step: its own recorded percent." }
    : { label: "Completion", percent, text: percent === null ? "—" : `${percent}%`, source: percent === null ? "No recorded step, so there is no denominator." : "Derived: done steps / recorded steps in this " + scope + "." };
  const deps = dependencyMetric(worktree, steps, scope);
  const dist = [
    kind === "phase" && phase?.key === "departments"
      ? rankedDistribution("Tokens by department", "Provider-reported tokens of each department's recorded steps.", worktree.departments.map(d => ({ label: d.name, value: tokensOf(records.filter(u => d.stepIds.includes(u.stepId))), target: d.id })))
      : rankedDistribution("Tokens by step", "Provider-reported tokens of each recorded step.", steps.map(s => ({ label: s.label, value: tokensOf(records.filter(u => u.stepId === s.id)), target: selectableFor(worktree, s.id) }))),
    modelDistribution(sum, scope),
  ].filter((d): d is Distribution => !!d);
  const duration: Metric = { label: "Elapsed", value: t.ms !== null ? formatDuration(t.ms) : t.running ? "Running" : "Not recorded", sub: t.start ? stamp(t.start) : undefined, tone: t.ms === null && !t.running ? "quiet" : undefined, source: "Earliest step start → latest step finish of this " + scope + "; not shown while any step is unfinished." };
  const specialist = department?.specialistRecommendation;
  const upstream = phase ? phase.dependsOnPhaseIds.length : 0;
  return {
    entityId: id, kind, headline,
    ...(steps.length ? { composition: composition(steps, "Steps by recorded state", `Count of this ${scope}'s recorded steps per recorded status.`) } : {}),
    tiles: [
      stepsMetric(steps, scope), duration, callsMetric(sum, scope), tokensMetric(sum, scope), deps, outputMetric(steps, scope),
    ],
    groups: [
      { title: "Progress", metrics: [
        { label: headline.label, value: headline.text, tone: percent === null ? "quiet" : undefined, source: headline.source },
        stepsMetric(steps, scope),
        { label: "By state", value: `${done} done · ${countOf(steps, "active")} running · ${countOf(steps, "pending")} pending · ${countOf(steps, "error")} failed`, source: "Recorded step statuses; running is the recorded status, not executor confirmation." },
        ...(phase ? [{ label: "Depends on", value: upstream ? plural(upstream, "phase") : "None recorded", tone: upstream ? undefined : "quiet", source: "Phases whose steps this phase's steps record a resolved dependency on." } as Metric] : []),
        ...(department ? [{ label: "Specialist", value: specialist ? specialist.name : "Not recorded", sub: specialist ? "planning recommendation, not an executor" : undefined, tone: specialist ? undefined : "quiet", source: "Recorded at planning time (plan snapshot). It is not proof that the specialist executed the work." } as Metric] : []),
      ] },
      { title: "Time", metrics: [duration, ...(sum ? [{ label: "API time", value: formatDuration(sum.apiMs), source: "Sum of measured per-call durations." } as Metric] : [])] },
      { title: "Usage", metrics: [callsMetric(sum, scope), tokensMetric(sum, scope), modelsMetric(sum, steps, scope)] },
      { title: "Cost", metrics: [
        { label: "Billed cost", value: "Not recorded", tone: "quiet", source: "Billed cost is not recorded on the job." },
        { label: "Estimated cost", value: est.value, sub: "price-table estimate, not spend", tone: undefined, source: est.note },
      ] },
      { title: "Structure", metrics: [deps, outputMetric(steps, scope)] },
    ],
    ...(splitOf(sum, scope) ? { split: splitOf(sum, scope) } : {}),
    distributions: dist,
    cost: { billed: "Not recorded", estimate: est.value, estimateNote: est.note },
    covers: kind === "phase" ? ["Timing", "Provider", "Departments", "Steps", "Progress"] : ["Steps"],
  };
}

function stepAnalytics(worktree: MissionWorktree, step: Step): Analytics {
  const records = worktree.usage.filter(u => u.stepId === step.id), sum = sumUsage(records), est = estimateText(sum);
  const ms = span(step.startedAt, step.finishedAt);
  const out = worktree.outputs.find(o => o.id === step.outputId);
  const deps = dependencyMetric(worktree, [step], "step");
  const duration: Metric = { label: "Duration", value: ms !== null ? formatDuration(ms) : step.startedAt ? "Not finished" : "Not recorded", sub: step.startedAt ? stamp(step.startedAt) : undefined, tone: ms === null ? "quiet" : undefined, source: "step.finishedAt − step.startedAt." };
  const models = [...new Set(records.map(u => u.model))], provider = step.provider ?? records[0]?.provider;
  const providerMetric: Metric = { label: "Provider", value: provider ?? "Not recorded", ...(models.length ? { sub: models.length === 1 ? models[0] : `${models.length} models` } : {}), tone: provider ? undefined : "quiet", source: "step.provider and the model recorded on the step's usage records. Executor identity is not recorded." };
  const percent = step.percent;
  return {
    entityId: step.id, kind: "step",
    headline: { label: step.status === "done" ? "Recorded progress" : step.status === "active" ? "Recorded progress (running)" : "Recorded progress", percent, text: `${percent}%`, source: "The step's own recorded percent. A recorded percent is not success." },
    tiles: [
      duration, callsMetric(sum, "step"), tokensMetric(sum, "step"), providerMetric, deps,
      step.error ? { label: "Error", value: "Recorded", tone: "alert", source: "step.error is recorded; see the Execution section." } : { label: "Output", value: out ? `${compactNumber(out.chars)} chars` : "None", tone: out ? undefined : "quiet", source: "Length of the step's recorded output." },
    ],
    groups: [
      { title: "State", metrics: [
        { label: "Recorded state", value: step.status === "active" ? "Running (recorded)" : step.status === "done" ? "Done" : step.status === "error" ? "Failed" : step.status === "skipped" ? "Skipped" : "Pending", tone: step.status === "error" ? "alert" : step.status === "pending" ? "quiet" : undefined, source: "step.status. Per-step executor evidence is not recorded." },
        { label: "Recorded progress", value: `${percent}%`, source: "step.percent." },
      ] },
      { title: "Time", metrics: [duration, ...(sum ? [{ label: "API time", value: formatDuration(sum.apiMs), source: "Sum of measured per-call durations." } as Metric] : [])] },
      { title: "Usage", metrics: [providerMetric, callsMetric(sum, "step"), tokensMetric(sum, "step")] },
      { title: "Cost", metrics: [
        { label: "Billed cost", value: "Not recorded", tone: "quiet", source: "Billed cost is not recorded on the job." },
        { label: "Estimated cost", value: est.value, sub: "price-table estimate, not spend", tone: undefined, source: est.note },
      ] },
      { title: "Structure", metrics: [deps, { label: "Output", value: out ? `${num(out.chars)} characters` : "None recorded", tone: out ? undefined : "quiet", source: "Recorded output length." },
        { label: "Approvals · consultations", value: `${step.approvalIds.length} · ${step.consultationIds.length}`, source: "Tool approval requests and consultations bound to this step by a unique recorded step id." }] },
    ],
    ...(splitOf(sum, "step") ? { split: splitOf(sum, "step") } : {}),
    distributions: [],
    cost: { billed: "Not recorded", estimate: est.value, estimateNote: est.note },
    covers: ["Progress", "Provider", "Dependencies", "Timing"],
  };
}

/** The analytics for a selectable Worktree entity, or null (nothing is invented for an ambiguity marker or an unknown id). */
export function analyticsOf(worktree: MissionWorktree, id: string | null): Analytics | null {
  if (!id) return null;
  if (id === worktree.mission.id) return missionAnalytics(worktree);
  if (worktree.phases.some(p => p.id === id)) return scopeAnalytics(worktree, id, "phase");
  if (worktree.departments.some(d => d.id === id)) return scopeAnalytics(worktree, id, "department");
  const step = worktree.steps.find(s => s.id === id);
  return step ? stepAnalytics(worktree, step) : null;
}

/** A short stage (small desktops) cannot hold six instruments beside the entity: the Peek then carries the first three. The Workbench always has them all. */
export const PEEK_COMPACT_TILES = 3;
/** Peek height budget (px) of the analytics header, deterministic so layout can reserve it without measuring the DOM. */
export function analyticsPeekHeight(a: Analytics | null, compact = false, columns = 3): number {
  if (!a) return 0;
  return 30 + (!compact && a.composition && a.composition.total > 0 ? 26 : 0) + Math.ceil((compact ? PEEK_COMPACT_TILES : a.tiles.length) / columns) * 56 + 22 + 6;
}


/* ------------------------------------------------------------------ C7G: the canonical provider / model usage breakdown (Workbench Usage) */
export interface BreakdownCost {
  /** Sum of the KNOWN price-table estimates (0 is a real, known zero). null when no call could be priced. */
  usd: number | null;
  /** known = every call priced; partial = some calls unpriced or without token counts; unknown = none could be priced. */
  state: "known" | "partial" | "unknown";
  unpricedCalls: number;
}
export interface UsageContributor { key: string; provider: string; model: string; calls: number; inputTokens: number; outputTokens: number; totalTokens: number; tokensComplete: boolean; cost: BreakdownCost; apiMs: number }
export interface UsageBreakdown {
  contributors: UsageContributor[];
  total: { calls: number; inputTokens: number; outputTokens: number; totalTokens: number; tokensComplete: boolean; cost: BreakdownCost; apiMs: number };
  /** Billed cost is never recorded on the job. It is a separate line from the estimate. */
  billed: string;
  source: string;
}
const costOf = (calls: number, usds: (number | null)[]): BreakdownCost => {
  const known = usds.filter((u): u is number => u !== null);
  return { usd: known.length ? known.reduce((n, u) => n + u, 0) : null, state: known.length === calls ? "known" : known.length ? "partial" : "unknown", unpricedCalls: calls - known.length };
};
/** USD for a price-table estimate: $0.00 is a real zero; small amounts keep four decimals so they never round to a false zero. */
export const usdText = (usd: number): string => `$${usd === 0 ? "0.00" : usd < 0.01 ? usd.toFixed(4) : usd.toFixed(2)}`;
/** The one wording of a breakdown cost: a number only where one is known; "Not recorded" only when it genuinely is not. */
export const breakdownCostText = (c: BreakdownCost): string => (c.state === "unknown" ? "Not recorded" : c.state === "partial" ? `≥ ${usdText(c.usd ?? 0)}` : usdText(c.usd ?? 0));
export function usageBreakdownOf(records: readonly Usage[]): UsageBreakdown | null {
  if (!records.length) return null;
  const groups = new Map<string, Usage[]>();
  records.forEach(u => { const key = `${u.provider} · ${u.model}`; groups.set(key, [...(groups.get(key) ?? []), u]); });
  const agg = (list: readonly Usage[]) => {
    const input = list.reduce((n, u) => n + (u.inputTokens ?? 0), 0), output = list.reduce((n, u) => n + (u.outputTokens ?? 0), 0);
    return { calls: list.length, inputTokens: input, outputTokens: output, totalTokens: input + output, tokensComplete: list.every(u => u.inputTokens !== null && u.outputTokens !== null), cost: costOf(list.length, list.map(u => u.estimate.usd)), apiMs: list.reduce((n, u) => n + u.durationMs, 0) };
  };
  const contributors = [...groups.entries()].map(([key, list]): UsageContributor => ({ key, provider: list[0].provider, model: list[0].model, ...agg(list) }))
    .sort((a, b) => b.totalTokens - a.totalTokens || b.calls - a.calls || (a.key < b.key ? -1 : 1));
  return { contributors, total: agg(records), billed: "Not recorded", source: "Every recorded usage call of this work, grouped by the recorded provider and model. Tokens are provider-reported; cost is the static price-table estimate (never a bill)." };
}


/* ------------------------------------------------------------------ C7G: the Execution timeline (recorded step windows only) */
export type TimelineLabelSource = "recorded-label" | "kind" | "position";
export interface TimelineRow { target: string; stepId: string; /** The step's recorded activity text, when it has one (shown as the full-label disclosure). */ activity?: string; label: string; labelSource: TimelineLabelSource; status: StepStatus; startMs: number; endMs: number; start: string; end: string }
/** Steps that share one VERIFIED owning department (`step.departmentId` resolves to a recorded department). `departmentId` is absent for a step with no verified owner: it is its own group and is never attributed. */
export interface TimelineGroup {
  key: string; departmentId?: string; /** The recorded department name, only when the relationship is verified. */ label: string | null; target: string;
  rows: TimelineRow[];
  /** The envelope of the group: its earliest recorded start to its latest recorded finish. A window, NOT a sum of durations (overlapping steps are never added together). */
  startMs: number; endMs: number;
  /** true when at least two of the group's steps overlap in recorded time (derived from the stamps only). */ overlapping: boolean;
}
export interface ExecutionTimeline { rows: TimelineRow[]; groups: TimelineGroup[]; fromMs: number; toMs: number; source: string; /** Steps in scope that recorded no start or no finish: counted, never drawn, never guessed. */ omitted: number; total: number }
/** One bar per step that recorded BOTH a start and a finish, on one real time axis, grouped under the department that verifiably owns it. Needs at least two such steps and a window longer than zero: with fewer there is no
 *  chronology to show, and nothing is synthesised. A generic kind wording ("Department") is never used as a name: a step without a recorded label of its own is "Step N" within its department. */
export function executionTimelineOf(worktree: MissionWorktree, steps: readonly Step[], labelOf: (s: Step) => { text: string; source: TimelineLabelSource }): ExecutionTimeline | null {
  const rows = steps.map((s): (TimelineRow & { departmentId?: string }) | null => {
    const a = s.startedAt ? Date.parse(s.startedAt) : NaN, b = s.finishedAt ? Date.parse(s.finishedAt) : NaN;
    if (!(Number.isFinite(a) && Number.isFinite(b) && b >= a)) return null;
    const l = labelOf(s), department = s.departmentId ? worktree.departments.find(d => d.id === s.departmentId) : undefined;
    return { target: selectableFor(worktree, s.id), stepId: s.id, ...(s.activity ? { activity: s.activity } : {}), label: l.text, labelSource: l.source, status: s.status, startMs: a, endMs: b, start: s.startedAt!, end: s.finishedAt!, ...(department ? { departmentId: department.id } : {}) };
  }).filter((r): r is TimelineRow & { departmentId?: string } => !!r).sort((x, y) => x.startMs - y.startMs || x.endMs - y.endMs);
  if (rows.length < 2) return null;
  const fromMs = Math.min(...rows.map(r => r.startMs)), toMs = Math.max(...rows.map(r => r.endMs));
  if (toMs <= fromMs) return null;
  const byDepartment = new Map<string, (TimelineRow & { departmentId?: string })[]>();
  const groups: TimelineGroup[] = [];
  for (const r of rows) {
    if (!r.departmentId) { groups.push({ key: `step:${r.stepId}`, label: null, target: r.target, rows: [r], startMs: r.startMs, endMs: r.endMs, overlapping: false }); continue; }
    byDepartment.set(r.departmentId, [...(byDepartment.get(r.departmentId) ?? []), r]);
  }
  byDepartment.forEach((list, departmentId) => {
    const department = worktree.departments.find(d => d.id === departmentId)!;
    // inside a department: the recorded label when the step has one of its own, else its position among the department's timed steps
    const labelled = list.map((r, i): TimelineRow => ({ ...r, label: r.labelSource === "recorded-label" ? r.label : `Step ${i + 1}`, labelSource: r.labelSource === "recorded-label" ? r.labelSource : "position" }));
    const overlapping = labelled.some((r, i) => labelled.some((o, j) => j > i && o.startMs < r.endMs && r.startMs < o.endMs));
    groups.push({ key: `dept:${departmentId}`, departmentId, label: department.name, target: selectableFor(worktree, departmentId), rows: labelled, startMs: Math.min(...labelled.map(r => r.startMs)), endMs: Math.max(...labelled.map(r => r.endMs)), overlapping });
  });
  groups.sort((x, y) => x.startMs - y.startMs || x.endMs - y.endMs);
  return { rows, groups, fromMs, toMs, source: "Each step's recorded start and finish stamps on one time axis, grouped under the department that verifiably owns the step. A group's bar is its earliest start to its latest finish (a window, never a sum). Steps without both stamps are not drawn.", omitted: steps.length - rows.length, total: steps.length };
}
