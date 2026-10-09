import type { Approval, Consultation, Department, MissionWorktree, Step, Usage, UsageTotals } from "./missionWorktree";
import { PHASE_DEFINITIONS } from "./missionWorktree";
import { ambiguityId, ambiguityNodeId, isKnownEntity, issuesOfNode, selectableFor, stepsOfNode } from "./missionWorktreeAncestry";
import { entityLabel, stepDisplayLabel, stepLabelOf } from "./missionWorktreeLabels";
import { STEP_KIND_LABELS } from "./missionStepModel";
import { sanitizeRecordedError } from "./missionRecordedError";
import { workbenchCapabilities, type WorkbenchSectionId } from "./missionWorkbench";
import { planApprovalOf } from "./missionWorktreePlanApproval";
import { analyticsOf, executionTimelineOf, usageBreakdownOf, type Analytics, type ExecutionTimeline, type UsageBreakdown } from "./missionAnalytics";
import type { AnalyticsPart } from "./AnalyticsInstrument";

/**
 * Workbench reading content (W5.3A): Mission, Department and Step. A pure model of SEMANTIC blocks built only from the W1 Worktree and the W5.1 capabilities, so the
 * contract (no placeholder, estimate != bill, recorded != confirmed-live, unique-step binding, nothing guessed) is testable without React. The renderer
 * (`MissionWorkbenchContent.tsx`) understands each block kind; there is no generic JSON renderer. Provenance is shown only where it changes how a line should be read.
 * Any section this does not cover returns null and the shell keeps its placeholder (Research / Team Review / QA / ambiguity are later W5.3 tasks).
 */
export type Tone = "alert" | "live" | "quiet";
export interface Fact { label: string; value: string; tone?: Tone; /** A selectable Worktree entity this fact names. */ target?: string; /** Only where it materially helps. */ provenance?: "Derived" | "Parsed from text" }
export interface RelationItem { label: string; detail?: string; /** Selectable ONLY when the target resolves uniquely; never a guess. */ target?: string; tone?: Tone; unresolved?: boolean }
export interface UsageRow { title: string; meta: string; estimate: string; step?: { label: string; target?: string } }
/** Research ledgers (W5.3B). Marks are presentation only (Q01 / F01 / [n]); they are never entity identities. */
export interface LedgerRow { mark: string; text: string }
export interface FindingRow { mark: string; heading: string; text: string; /** `[n]` markers that APPEAR in the recorded text; not a verified claim -> source mapping. */ refs: number[]; /** Markers with no recorded source at that list position. */ unmatched: number[]; textSaysNoSources: boolean }
export interface SourceRow { mark: string; title: string; uri: string; /** Only for a valid http(s) URL without credentials. */ href?: string; domain?: string; origin?: string; /** Finding numbers whose recorded text mentions this position (neutral, not support). */ mentionedIn?: number[]; /** The same, as a compact phrase ("findings 01–05", "all 5 parsed findings"). */ mentioned?: string }
/** One parsed section of the recorded review. `heading` is the recorded heading; the text is the section body as written. A convenience view: the raw output stays authoritative. */
export interface ReviewRow { mark: string; heading: string; /** Present only when W1 recognised the section AND the recorded heading differs from the recognised one. */ recognisedAs?: string; recognised: boolean; text: string }
export interface StepRow { target: string; label: string; type: string; status: string; tone?: Tone; progress: string; provider?: string; activity?: string; note?: string }
export type Block =
  | { kind: "facts"; facts: Fact[] }
  | { kind: "group"; title: string; note?: string; blocks: Block[] }
  | { kind: "relations"; items: RelationItem[] }
  | { kind: "text"; title?: string; text: string; format: "plain" | "markdown"; chars?: number }
  | { kind: "usage"; rows: UsageRow[] }
  | { kind: "record"; title: string; subtitle?: string; target?: string; facts: Fact[]; body?: string }
  | { kind: "steps"; rows: StepRow[] }
  | { kind: "inquiry"; rows: LedgerRow[] }
  | { kind: "findings"; rows: FindingRow[] }
  | { kind: "sources"; rows: SourceRow[] }
  | { kind: "review"; rows: ReviewRow[] }
  /** W7.2: the selection-aware instrument (real, sourced numbers) at the top of an Overview. */
  | { kind: "analytics"; analytics: Analytics; part: AnalyticsPart }
  /** C7G: the canonical provider / model / API usage breakdown (calls, input / output tokens, estimated cost per contributor, the total). */
  | { kind: "usageBreakdown"; breakdown: UsageBreakdown }
  /** C7G: recorded step windows on one time axis (Execution only, and only with at least two steps that recorded a start and a finish). */
  | { kind: "timeline"; timeline: ExecutionTimeline }
  /** C7G.1: how many resolved prerequisites / dependents this work has, and how many references stayed unresolved (the lists below carry the names). */
  | { kind: "depmap"; needs: number; waits: number; unresolved: number }
  | { kind: "empty"; text: string }
  | { kind: "unavailable"; label: string; reason: string }
  | { kind: "note"; text: string; tone?: Tone };
export interface WorkbenchContent { entityId: string; section: WorkbenchSectionId; blocks: Block[] }

/* ------------------------------------------------------------------ vocabulary */
const STATUS_TEXT: Record<string, string> = { pending: "Pending", active: "Active (recorded)", done: "Done", error: "Error", skipped: "Skipped", mixed: "Mixed", assigned: "Assigned" };
export const statusText = (status: string) => STATUS_TEXT[status] ?? `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
const statusTone = (status: string): Tone | undefined => (status === "error" ? "alert" : status === "active" ? "live" : status === "pending" || status === "skipped" ? "quiet" : undefined);
const stamp = (iso?: string) => (iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` : undefined);
const span = (a?: string, b?: string) => { if (!a || !b) return undefined; const ms = Date.parse(b) - Date.parse(a); if (!Number.isFinite(ms) || ms < 0) return undefined; const s = Math.round(ms / 1000); return s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`; };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const num = (n: number) => n.toLocaleString("en-US");
const mixText = (counts: Partial<Record<string, number>>) => (Object.keys(counts) as string[]).map(k => `${counts[k]} ${statusText(k).toLowerCase()}`).join(" · ");
const fact = (label: string, value: string | undefined | null, extra: Partial<Fact> = {}): Fact | null => (value ? { label, value, ...extra } : null);
const facts = (list: (Fact | null)[]): Block | null => { const f = list.filter((x): x is Fact => !!x); return f.length ? { kind: "facts", facts: f } : null; };
const blocks = (list: (Block | null | false | undefined)[]): Block[] => list.filter((b): b is Block => !!b);

/* ------------------------------------------------------------------ money, tokens and the estimate / bill distinction */
/** A price-table ESTIMATE, never a bill. usd === 0 means the table has no per-token price (local / free models): it is NOT shown as "$0". */
export function estimateText(usd: number | null, priced: boolean): string {
  if (!priced || usd === null) return "No price-table estimate for this model";
  if (usd === 0) return "$0.00 price-table estimate (listed at no cost: local or free model)";
  return `≈ $${usd.toFixed(usd < 0.01 ? 4 : 2)} price-table estimate`;
}
export function totalsFacts(t: UsageTotals, billed: { reason: string } | undefined): Fact[] {
  const out: (Fact | null)[] = [
    fact("Calls", `${num(t.calls)} recorded`),
    fact("Tokens", `${num(t.reportedTokens.total)} reported${t.reportedTokens.complete ? "" : " (incomplete: some calls reported no count)"}`),
    fact("Estimate", t.estimatedCostUsd === null ? "Not available (some models have no price-table entry)" : t.estimatedCostUsd === 0 ? "No per-token prices apply (local or free models)" : `≈ $${t.estimatedCostUsd.toFixed(t.estimatedCostUsd < 0.01 ? 4 : 2)} from the price table${t.estimateComplete ? "" : ", partial"}`, { tone: "quiet" }),
    fact("Billed cost", billed ? "Not recorded" : undefined, { tone: "quiet" }),
  ];
  return out.filter((f): f is Fact => !!f);
}
function usageRow(worktree: MissionWorktree, u: Usage, withStep: boolean): UsageRow {
  const tokens = `${u.inputTokens === null ? "in: not reported" : `in ${num(u.inputTokens)}`} · ${u.outputTokens === null ? "out: not reported" : `out ${num(u.outputTokens)}`}`;
  const step = worktree.steps.find(s => s.id === u.stepId);
  return {
    title: `${u.provider} · ${u.model}`,
    meta: [tokens, `${(u.durationMs / 1000).toFixed(u.durationMs < 10000 ? 1 : 0)} s`, stamp(u.timestamp)].filter(Boolean).join(" · "),
    estimate: estimateText(u.estimate.usd, u.estimate.priced),
    ...(withStep && step ? { step: { label: stepDisplayLabel(worktree, step), target: selectableFor(worktree, step.id) } } : {}),
  };
}

/* ------------------------------------------------------------------ relationships (resolved only; ambiguity is explained, never guessed) */
function relationLabel(worktree: MissionWorktree, id: string): string {
  const seg = entityLabel(worktree, id);
  const step = seg?.kind === "step" ? worktree.steps.find(s => s.id === id) : undefined;
  const dept = step?.departmentId ? worktree.departments.find(d => d.id === step.departmentId) : undefined;
  return dept && seg ? `${dept.name} · ${seg.label}` : seg?.label ?? id;
}
function targetStatus(worktree: MissionWorktree, id: string): string | undefined {
  const s = worktree.steps.find(x => x.id === id)?.status ?? worktree.phases.find(p => p.id === id)?.status;
  return s ? statusText(s) : undefined;
}
function relationBlocks(worktree: MissionWorktree, steps: Step[], ownNodeId: string): Block[] {
  const inside = new Set(steps.map(s => s.id));
  const uniq = (ids: string[]) => [...new Set(ids.filter(id => !inside.has(id)).map(id => selectableFor(worktree, id)))].filter(id => id !== ownNodeId);
  const toItem = (id: string): RelationItem => ({ label: relationLabel(worktree, id), detail: targetStatus(worktree, id), target: id });
  const needs = uniq(steps.flatMap(s => s.dependencies.prerequisiteIds)), waits = uniq(steps.flatMap(s => s.dependencies.dependentIds));
  const issues = issuesOfNode(worktree, ownNodeId);
  const explain = isKnownEntity(worktree, ambiguityId(ownNodeId)) ? ambiguityId(ownNodeId) : undefined;
  return blocks([
    needs.length + waits.length + issues.length > 0 ? { kind: "depmap", needs: needs.length, waits: waits.length, unresolved: issues.length } : null,
    { kind: "group", title: "Needs first", blocks: needs.length ? [{ kind: "relations", items: needs.map(toItem) }] : [{ kind: "empty", text: "No prerequisite is recorded." }] },
    { kind: "group", title: "Waits on this", blocks: waits.length ? [{ kind: "relations", items: waits.map(toItem) }] : [{ kind: "empty", text: "No recorded step waits on this." }] },
    issues.length > 0 && {
      kind: "group", title: "Unresolved", note: "Recorded references that do not point at exactly one step. They are not guessed and not selectable as targets.",
      blocks: [{ kind: "relations", items: issues.map((i, n): RelationItem => ({
        label: i.kind === "ambiguous" ? "Reference matches more than one step" : i.kind === "unresolved" ? "Reference matches no recorded step" : i.kind === "self-reference" ? "Step names itself" : "Malformed reference",
        detail: i.reference ? `“${i.reference}”${i.detail ? ` · ${i.detail}` : ""}` : i.detail, unresolved: true, tone: "alert",
        ...(i.kind === "ambiguous" && explain && n === issues.findIndex(x => x.kind === "ambiguous") ? { target: explain } : {}),
      })) }],
    },
  ]);
}

/* ------------------------------------------------------------------ approvals / consultations (bound only through the W1 adapter's unique-step binding) */
const argsSummary = (args: Record<string, unknown>) => Object.entries(args).slice(0, 6).map(([k, v]) => `${k}: ${typeof v === "string" ? (v.length > 90 ? `${v.slice(0, 89)}…` : v) : typeof v === "number" || typeof v === "boolean" ? String(v) : Array.isArray(v) ? `${v.length} items` : v && typeof v === "object" ? "nested record" : "—"}`).join("\n");
function approvalRecord(worktree: MissionWorktree, a: Approval): Block {
  const bound = a.stepId ? worktree.steps.find(s => s.id === a.stepId) : undefined;
  return { kind: "record", title: a.toolName, subtitle: bound ? stepDisplayLabel(worktree, bound) : a.stepLabel, ...(bound ? { target: selectableFor(worktree, bound.id) } : {}), body: Object.keys(a.args).length ? argsSummary(a.args) : undefined,
    facts: blocksFacts([fact("Status", statusText(a.status), { tone: a.status === "pending" ? "live" : undefined }), fact("Requested", stamp(a.createdAt)), fact("Decided", a.decidedAt ? `${stamp(a.decidedAt)}${a.decidedBy ? ` · ${a.decidedBy}` : ""}` : undefined), bound ? null : fact("Step", "Not bound: the recorded step id is not unique", { tone: "quiet" })]) };
}
function consultationRecord(worktree: MissionWorktree, c: Consultation): Block {
  const bound = c.stepId ? worktree.steps.find(s => s.id === c.stepId) : undefined;
  return { kind: "record", title: c.question, subtitle: bound ? stepDisplayLabel(worktree, bound) : c.stepLabel, ...(bound ? { target: selectableFor(worktree, bound.id) } : {}), body: c.answer ?? c.redirectDirective,
    facts: blocksFacts([fact("Status", statusText(c.status)), c.options?.length ? fact("Options", c.options.join(" · ")) : null, c.answer ? fact("Answer", "Recorded below") : null, c.redirectDirective ? fact("Redirect", "Recorded below") : null, fact("Asked", stamp(c.createdAt)), fact("Answered", c.answeredAt ? `${stamp(c.answeredAt)}${c.answeredBy ? ` · ${c.answeredBy}` : ""}` : undefined), bound ? null : fact("Step", "Not bound: the recorded step id is not unique", { tone: "quiet" })]) };
}
const blocksFacts = (list: (Fact | null)[]) => list.filter((f): f is Fact => !!f);

/* ------------------------------------------------------------------ Mission */
const EXECUTOR_TEXT: Record<string, { text: string; tone?: Tone }> = {
  confirmed: { text: "Confirmed live by an executor", tone: "live" },
  unconfirmed: { text: "Recorded as running · no executor confirms it", tone: "alert" },
  unverifiable: { text: "Executor state could not be read" },
  "not-applicable": { text: "Not applicable · the record is not running", tone: "quiet" },
};
const executorFact = (e: string): Fact => ({ label: "Executor", value: EXECUTOR_TEXT[e]?.text ?? e, tone: EXECUTOR_TEXT[e]?.tone });
function missionContent(worktree: MissionWorktree, section: WorkbenchSectionId): Block[] | null {
  const m = worktree.mission;
  switch (section) {
    case "overview": {
      const errored = worktree.steps.filter(s => s.status === "error");
      const first = errored.find(s => s.error);
      const missing = worktree.missingPhaseKeys.map(key => PHASE_DEFINITIONS.find(p => p.key === key)?.label ?? key);
      return blocks([
        facts([fact("Recorded", statusText(m.status), { tone: statusTone(m.status === "running" ? "active" : m.status) }), executorFact(m.execution.liveEvidence), fact("Progress", `${m.percent}% recorded`), fact("Verified", m.verified ? "Yes (recorded flag)" : "No (recorded flag)")]),
        { kind: "group", title: "Shape of the record", blocks: blocks([
          facts([fact("Phases", `${worktree.phases.length} of ${PHASE_DEFINITIONS.length} recorded`), missing.length ? fact("Not recorded", missing.join(" · "), { tone: "quiet" }) : null, fact("Departments", String(worktree.departments.length)), fact("Steps", `${worktree.steps.length} recorded${m.unphasedStepIds.length ? ` · ${m.unphasedStepIds.length} of unknown type` : ""}`),
            errored.length ? fact("Attention", `${plural(errored.length, "step")} in error${first ? ` · ${sanitizeRecordedError(first.error, 140)}` : ""}`, { tone: "alert", target: first ? selectableFor(worktree, first.id) : undefined }) : null, m.error ? fact("Mission error", sanitizeRecordedError(m.error, 240) ?? "", { tone: "alert" }) : null]),
        ]) },
        m.brief ? { kind: "text", title: "Brief", text: m.brief, format: "plain" } : { kind: "unavailable", label: "Brief", reason: "No brief is recorded." },
      ]);
    }
    case "execution": {
      const active = m.execution.recordedActiveStepIds.map(id => ({ label: relationLabel(worktree, id), target: selectableFor(worktree, id), tone: "live" as Tone }));
      const phaseRows: RelationItem[] = PHASE_DEFINITIONS.map(def => {
        const phase = worktree.phases.find(p => p.key === def.key);
        return phase ? { label: phase.label, detail: `${statusText(phase.status)}${phase.recordedPercent !== undefined ? ` · ${phase.recordedPercent}% recorded` : ""}${phase.multiple ? " · more than one recorded step" : ""}`, target: phase.id, tone: statusTone(phase.status) }
          : { label: def.label, detail: "Not recorded", unresolved: true, tone: "quiet" };
      });
      return blocks([
        facts([fact("Recorded", statusText(m.execution.recordedStatus)), executorFact(m.execution.liveEvidence), fact("Created", stamp(m.createdAt) ? `${stamp(m.createdAt)}${m.createdBy ? ` · ${m.createdBy}` : ""}` : undefined), fact("Updated", stamp(m.updatedAt)), fact("Finished", stamp(m.finishedAt)), fact("Approved", m.approvedAt ? `${stamp(m.approvedAt)}${m.approvedBy ? ` · ${m.approvedBy}` : ""}` : undefined),
          m.error ? fact("Error", sanitizeRecordedError(m.error, 600) ?? "", { tone: "alert" }) : null]),
        !m.execution.liveConfirmed && m.execution.recordedStatus === "running" && { kind: "note", text: "The record says running, but no executor reports this mission. It is not shown as live.", tone: "alert" },
        { kind: "group", title: "Recorded active steps", blocks: active.length ? [{ kind: "relations", items: active }] : [{ kind: "empty", text: "No step is recorded active." }] },
        { kind: "group", title: "Phases", note: "Canonical sequence. A phase the record lacks is Not recorded, never waiting or 0%.", blocks: [{ kind: "relations", items: phaseRows }] },
        m.liveNotes.length > 0 && { kind: "group", title: "Live notes", note: "Recorded as bare text: no author, no time.", blocks: m.liveNotes.map((text): Block => ({ kind: "text", text, format: "plain" })) },
      ]);
    }
    case "output": {
      const out = worktree.outputs.find(o => o.id === m.finalOutputId);
      return blocks([
        out ? { kind: "text", title: "Final output", text: out.text, format: "markdown", chars: out.chars } : { kind: "unavailable", label: "Final output", reason: "No final output is recorded." },
        m.media.length > 0 && { kind: "group", title: "Media", blocks: [{ kind: "facts", facts: m.media.map((x): Fact => ({ label: x.type, value: `${x.label ? `${x.label} · ` : ""}${x.url}` })) }] },
      ]);
    }
    case "usage": {
      if (!m.usage) return [{ kind: "unavailable", label: "Usage", reason: "No usage records for this mission." }];
      const byStep = new Map<string, Usage[]>();
      worktree.usage.forEach(u => byStep.set(u.stepId, [...(byStep.get(u.stepId) ?? []), u]));
      return blocks([
        breakdownBlock(worktree.usage),
        ...[...byStep.entries()].map(([stepId, list]): Block => ({ kind: "group", title: relationLabel(worktree, stepId), blocks: [{ kind: "usage", rows: list.map(u => usageRow(worktree, u, false)) }] })),
      ]);
    }
    case "approvals": {
      const tools: Block[] = worktree.approvals ? (worktree.approvals.length ? worktree.approvals.map(a => approvalRecord(worktree, a)) : [{ kind: "empty", text: "No approval is recorded for this mission." }]) : [{ kind: "unavailable", label: "Approvals", reason: "Approvals could not be read." }];
      return [planApprovalBlock(worktree), { kind: "group", title: "Tool approval requests", blocks: tools }];
    }
    case "consultations": return worktree.consultations ? (worktree.consultations.length ? worktree.consultations.map(c => consultationRecord(worktree, c)) : [{ kind: "empty", text: "No consultation is recorded for this mission." }]) : [{ kind: "unavailable", label: "Consultations", reason: "Consultations could not be read." }];
    case "requestedChanges": return m.requestedChanges.length ? m.requestedChanges.map((c): Block => ({ kind: "record", title: stamp(c.createdAt) ?? "Requested change", body: c.message,
      facts: blocksFacts([fact("Effect", c.effect === "reran" ? "Steps were re-run" : "Queued"), c.redoneSteps?.length ? fact("Re-ran", c.redoneSteps.join(" · ")) : null]) })) : [{ kind: "empty", text: "No requested change is recorded." }];
    case "lineage": return blocks([
      facts([fact("Re-run of", m.lineage.rerunOf), fact("Replay mode", m.lineage.replayMode)]) ?? { kind: "empty", text: "Not recorded as a re-run or replay." },
    ]);
    default: return null;
  }
}

/* ------------------------------------------------------------------ Department */
function departmentContent(worktree: MissionWorktree, d: Department, section: WorkbenchSectionId): Block[] | null {
  const steps = stepsOfNode(worktree, d.id);
  switch (section) {
    case "overview": {
      const counts: Partial<Record<string, number>> = {};
      steps.forEach(s => { counts[s.status] = (counts[s.status] ?? 0) + 1; });
      const errored = steps.filter(s => s.status === "error");
      return blocks([
        facts([fact("Department", d.name), fact("Recorded as", d.canonicalId, { tone: "quiet" }), d.legacyRoute ? fact("Legacy route", d.legacyRoute, { tone: "quiet" }) : null,
          fact("Origin", [d.origin.assignment ? "planned in the plan snapshot" : null, d.origin.step ? "has recorded steps" : null].filter(Boolean).join(" · ") || undefined),
          fact("Steps", steps.length ? `${plural(steps.length, "step")} · ${mixText(counts)}` : "None recorded (assigned only)")]),
        errored.length > 0 && { kind: "group", title: "Attention", blocks: [{ kind: "relations", items: errored.map((s): RelationItem => ({ label: stepDisplayLabel(worktree, s), detail: sanitizeRecordedError(s.error, 200) ?? "Error (no message recorded)", target: selectableFor(worktree, s.id), tone: "alert" })) }] },
      ]);
    }
    case "assignment": return blocks([
      ...d.assignments.map((a, i): Block => {
        const ref = a.stepRef ? worktree.steps.find(s => s.recordedId === a.stepRef && s.idUnique && s.departmentId === d.id) : undefined;
        return { kind: "record", title: d.assignments.length > 1 ? `Assignment ${i + 1}` : "Task", body: a.task, facts: blocksFacts([fact("Activity", a.activity), a.stepRef ? fact("Step", ref ? stepDisplayLabel(worktree, ref) : `${a.stepRef} (not matched to a unique step)`, { target: ref ? selectableFor(worktree, ref.id) : undefined, tone: ref ? undefined : "quiet" }) : null, fact("Route", a.runtimeRouteId)]) };
      }),
      d.specialistRecommendation && { kind: "group", title: "Planning recommendation", note: "A dispatch recommendation recorded at planning time. It does not show that this specialist executed anything.", blocks: [{ kind: "facts", facts: blocksFacts([fact("Specialist", d.specialistRecommendation.name), fact("Category", d.specialistRecommendation.category), fact("Band", d.specialistRecommendation.band), fact("Confidence", `${Math.round(d.specialistRecommendation.confidence * 100)}%`)]) }] },
    ]);
    case "steps": return steps.length ? [{ kind: "steps", rows: steps.map((s): StepRow => ({ target: s.id, label: stepDisplayLabel(worktree, s), type: s.kindKnown ? STEP_KIND_LABELS[s.kind] ?? "Type not recorded" : "Type not recorded", status: statusText(s.status), tone: statusTone(s.status), progress: `${s.percent}%`, provider: s.provider, activity: s.status === "error" ? undefined : s.activity || undefined, note: s.status === "error" ? sanitizeRecordedError(s.error, 120) ?? undefined : undefined })) }] : [{ kind: "empty", text: "No step is recorded for this department." }];
    case "dependencies": return relationBlocks(worktree, steps, d.id);
    case "execution": return [{ kind: "note", text: "Derived from this department's recorded steps. Each step's own timing, provider and error are in its Execution section.", tone: "quiet" }];
    case "output": return outputsOfSteps(worktree, steps);
    case "usage": return usageOfSteps(worktree, steps);
    default: return null;
  }
}
/** The recorded output of each step in scope, one labelled group per step (a department / phase has no output of its own). */
function outputsOfSteps(worktree: MissionWorktree, steps: Step[]): Block[] {
  const per = steps.filter(s => !!s.outputId).map((s): Block => ({ kind: "group", title: stepDisplayLabel(worktree, s), blocks: stepBlocks(worktree, s, "output") ?? [] }));
  return per.length ? per : [{ kind: "unavailable", label: "Output", reason: "No output is recorded for this work." }];
}
const breakdownBlock = (records: readonly Usage[]): Block | null => { const b = usageBreakdownOf(records); return b ? { kind: "usageBreakdown", breakdown: b } : null; };
/** Recorded usage of each step in scope, grouped by the step that recorded it, under the scope's totals. */
function usageOfSteps(worktree: MissionWorktree, steps: Step[]): Block[] {
  const per = steps.map(s => ({ s, rows: worktree.usage.filter(u => u.stepId === s.id) })).filter(x => x.rows.length);
  return per.length ? blocks([breakdownBlock(per.flatMap(x => x.rows)), ...per.map(({ s, rows }): Block => ({ kind: "group", title: stepDisplayLabel(worktree, s), blocks: [{ kind: "usage", rows: rows.map(u => usageRow(worktree, u, false)) }] })) ]) : [{ kind: "unavailable", label: "Usage", reason: "No usage records for this work." }];
}

/* ------------------------------------------------------------------ Live Research (W5.3B) */
/** The only external-link rule: http(s) without embedded credentials. Anything else is shown as text and never becomes a link. */
/** The plan decision as RECORDED: approved (when, by whom only if recorded) or not recorded. Absence of `approvedAt` is never worded as approval, and never as a refusal. */
function planApprovalBlock(worktree: MissionWorktree): Block {
  const plan = planApprovalOf(worktree);
  const state: Fact = plan.approved
    ? { label: "Plan approval", value: `Recorded ${stamp(plan.approved.at) ?? plan.approved.at}${plan.approved.by ? ` by ${plan.approved.by}` : ""}` }
    : { label: "Plan approval", value: "Not recorded", tone: "quiet" };
  return { kind: "group", title: "Plan approval",
    note: plan.approved ? "This records the owner's approval of the final plan. It did not execute any external tool." : plan.hasFinalPlan ? "A final plan is recorded. No approval of it is recorded." : "No final plan is recorded yet, so there is nothing to approve.",
    blocks: [{ kind: "facts", facts: [state] }] };
}

export function safeHttpUrl(uri: string): { href: string; domain: string } | null {
  try { const u = new URL(uri.trim()); return (u.protocol === "https:" || u.protocol === "http:") && !u.username && !u.password ? { href: u.href, domain: u.hostname.replace(/^www\./, "") } : null; } catch { return null; }
}
const pad2 = (n: number) => String(n).padStart(2, "0");
const refsText = (refs: number[]) => refs.map(n => `[${n}]`).join(", ");
function researchBlocks(worktree: MissionWorktree, s: Step, section: WorkbenchSectionId): Block[] | null {
  const r = s.research;
  if (!["overview", "questions", "findings", "sources"].includes(section)) return stepBlocks(worktree, s, section);
  if (!r) return [{ kind: "unavailable", label: "Research detail", reason: "This step carries no parsed research detail." }];
  const sources = r.sourceIds.map(id => worktree.sources.find(x => x.id === id)).filter((x): x is NonNullable<typeof x> => !!x);
  switch (section) {
    case "overview": {
      const finished = s.status !== "pending" && s.status !== "active";
      const evidence = sources.length ? `${plural(sources.length, "source")} recorded` : r.noSources ? "No source recorded" : "No source recorded yet";
      return blocks([
        facts([fact("Recorded", statusText(s.status), { tone: statusTone(s.status) }), fact("Progress", `${s.percent}% recorded`), s.startedAt ? fact("Timing", `${stamp(s.startedAt)}${s.finishedAt ? ` · ${span(s.startedAt, s.finishedAt) ?? "finished"}` : " · not finished"}`) : fact("Timing", "Not recorded", { tone: "quiet" }),
          fact("Questions", r.questions ? `${r.questions.length} recorded` : "Not recorded (no plan snapshot)", r.questions ? {} : { tone: "quiet" }),
          fact("Findings", `${r.findings.length} parsed`, { provenance: "Parsed from text" }),
          fact("Sources", String(sources.length)), fact("Evidence", evidence, { tone: sources.length ? undefined : finished ? "alert" : "quiet" }),
          fact("Verified flag", r.verified ? "Set (recorded on the dossier / job)" : "Not set (recorded)", { tone: r.verified ? undefined : "quiet" }),
          s.error ? fact("Error", sanitizeRecordedError(s.error, 220) ?? "", { tone: "alert" }) : null]),
        finished && r.findings.length > 0 && sources.length === 0 && { kind: "note", text: "The research reports findings but records no source: the evidence is missing. Nothing here is verified by a source.", tone: "alert" },
        s.status === "active" && { kind: "note", text: "Active in the record. Nothing here proves a live executor is working on it.", tone: "live" },
        r.unresolvedMarkers.length > 0 && { kind: "note", text: `References ${refsText(r.unresolvedMarkers)} appear in the recorded text but match no recorded source position.`, tone: "quiet" },
        s.status === "error" && s.percent >= 100 && { kind: "note", text: "The record holds both facts: the step is in error and its recorded progress is 100%. They are not reconciled.", tone: "quiet" },
      ]);
    }
    case "questions": return r.questions
      ? [{ kind: "note", text: "Recorded in the plan snapshot, in order. A question is not marked answered.", tone: "quiet" }, { kind: "inquiry", rows: r.questions.map((text, i): LedgerRow => ({ mark: `Q${pad2(i + 1)}`, text })) }]
      : [{ kind: "unavailable", label: "Questions", reason: "No plan snapshot, so no research question is recorded." }];
    case "findings": return r.findings.length ? [
      { kind: "note", text: "Parsed from text: the recorded research markdown split on its finding headings. Inline [n] markers are references that appear in the text, not a recorded claim → source mapping.", tone: "quiet" },
      { kind: "findings", rows: r.findings.map((f): FindingRow => ({ mark: `F${pad2(f.index)}`, heading: f.question, text: f.answer, refs: f.markers, unmatched: f.markers.filter(n => n > sources.length), textSaysNoSources: f.sourcesNone })) },
    ] : [{ kind: "unavailable", label: "Findings", reason: "No finding could be parsed from the recorded research output." }];
    case "sources": return sources.length ? [
      { kind: "note", text: "The recorded source list, in recorded order; [n] is the list position. A source here is recorded, not verified.", tone: "quiet" },
      { kind: "sources", rows: sources.map((src): SourceRow => {
        const link = safeHttpUrl(src.uri);
        return { mark: `[${src.index}]`, title: src.title || link?.domain || src.uri, uri: src.uri, ...(link ? { href: link.href, domain: link.domain } : {}), origin: src.origin === "dossier" ? "Recorded in the dossier" : "Recorded on the research step" };
      }) },
    ] : r.noSources ? [{ kind: "note", text: "No source is recorded for this research. The findings, if any, have no recorded evidence behind them.", tone: "alert" }] : [{ kind: "empty", text: "No source is recorded yet." }];
    default: return null;
  }
}
function researchContent(worktree: MissionWorktree, id: string, section: WorkbenchSectionId): Block[] | null {
  const steps = stepsOfNode(worktree, id);
  if (!steps.length) return null;
  if (steps.length === 1) return researchBlocks(worktree, steps[0], section);
  const per = steps.map(s => ({ s, b: researchBlocks(worktree, s, section) }));
  if (per.some(p => p.b === null)) return null;
  return per.map(({ s, b }, i): Block => ({ kind: "group", title: `Step ${i + 1} of ${steps.length} · ${stepDisplayLabel(worktree, s)}`, blocks: b! }));
}

/* ------------------------------------------------------------------ Inputs shared by Team Review and QA (W5.3C1 / C2) */
const KIND_PLURAL: Record<string, string> = { ambiguous: "match more than one step", unresolved: "match no recorded step", "self-reference": "name their own step", malformed: "are malformed" };
function inputsBlocks(worktree: MissionWorktree, s: Step, ownNodeId: string, who: "review" | "QA"): Block[] {
  const targets = [...new Set(s.dependencies.prerequisiteIds.map(id => selectableFor(worktree, id)))].filter(id => id !== ownNodeId);
  const row = (id: string): RelationItem => {
    const inner = stepsOfNode(worktree, id), first = inner[0];
    const bad = inner.find(x => x.status === "error");
    const parts = [targetStatus(worktree, id), inner.length ? (inner.some(x => x.outputId) ? "output recorded" : "no output recorded") : undefined, bad ? sanitizeRecordedError(bad.error, 90) ?? "error" : undefined].filter(Boolean);
    return { label: relationLabel(worktree, id), detail: parts.join(" · "), target: id, tone: bad ? "alert" : first ? statusTone(first.status) : undefined };
  };
  const issues = s.dependencies.issues, explain = isKnownEntity(worktree, ambiguityId(ownNodeId)) ? ambiguityId(ownNodeId) : undefined;
  const kinds = new Map<string, number>();
  issues.forEach(i => kinds.set(i.kind, (kinds.get(i.kind) ?? 0) + 1));
  const summary = [...kinds.entries()].map(([k, n]) => `${n} ${KIND_PLURAL[k] ?? k}`).join(" · ");
  return blocks([
    { kind: "note", text: `The steps this ${who === "QA" ? "QA step" : "review"} recorded a resolved dependency on. Derived from those dependencies; the record does not store the inputs as such.`, tone: "quiet" },
    targets.length ? { kind: "relations", items: targets.map(row) } : { kind: "empty", text: "No resolved input is recorded." },
    issues.length > 0 && { kind: "group", title: "Could not resolve uniquely", note: `${plural(issues.length, "recorded reference")} ${issues.length === 1 ? "is" : "are"} not listed as inputs and no step was chosen for ${issues.length === 1 ? "it" : "them"}.`,
      blocks: [{ kind: "relations", items: [{ label: `${plural(issues.length, "recorded reference")} · ${summary}`, detail: explain ? "Open the explanation" : undefined, tone: "alert", ...(explain ? { target: explain } : { unresolved: true }) }] }] },
  ]);
}

/* ------------------------------------------------------------------ QA (W5.3C2) */
function qaBlocks(worktree: MissionWorktree, s: Step, ownNodeId: string, section: WorkbenchSectionId): Block[] | null {
  const out = worktree.outputs.find(o => o.id === s.outputId);
  const verdict = s.review?.verdict;
  switch (section) {
    case "overview": {
      const resolved = new Set(s.dependencies.prerequisiteIds.map(id => selectableFor(worktree, id))).size, unresolved = s.dependencies.issues.length;
      const calls = worktree.usage.filter(u => u.stepId === s.id).length;
      return blocks([
        facts([fact("Recorded", statusText(s.status), { tone: statusTone(s.status) }), fact("Progress", `${s.percent}% recorded`), s.startedAt ? fact("Timing", `${stamp(s.startedAt)}${s.finishedAt ? ` · ${span(s.startedAt, s.finishedAt) ?? "finished"}` : " · not finished"}`) : fact("Timing", "Not recorded", { tone: "quiet" }),
          fact("Inputs", `${resolved} resolved${unresolved ? ` · ${plural(unresolved, "recorded reference")} not resolved uniquely` : ""}`),
          fact("Provider", s.provider ?? "Not recorded", s.provider ? {} : { tone: "quiet" }), fact("Usage", calls ? `${plural(calls, "call")} recorded` : "None recorded", calls ? {} : { tone: "quiet" }),
          out ? (verdict ? fact("Verdict", verdict, { provenance: "Parsed from text" }) : fact("Verdict", "No explicit verdict line recorded", { tone: "quiet" })) : fact("Output", "No output recorded", { tone: "quiet" }),
          s.error ? fact("Error", sanitizeRecordedError(s.error, 220) ?? "", { tone: "alert" }) : null]),
        s.status === "pending" && { kind: "note", text: "QA has not run: no output is recorded.", tone: "quiet" },
        s.status === "active" && { kind: "note", text: "Active in the record. Nothing here proves a live executor is working on it.", tone: "live" },
        !!out && !verdict && { kind: "note", text: "The recorded QA output has no explicit Verdict line. A finished QA step is not a pass; no verdict is inferred from its state, progress or wording.", tone: "quiet" },
      ]);
    }
    case "inputs": return inputsBlocks(worktree, s, ownNodeId, "QA");
    case "qa": {
      if (!verdict || !out) return [{ kind: "unavailable", label: "QA verdict", reason: "The recorded output has no explicit Verdict line." }];
      const line = /\*\*Verdict:?\*\*:?[ \t]*(?:PASS WITH FIXES|NEEDS WORK|PASS)[^\n]*/i.exec(out.text)?.[0];
      return blocks([
        facts([fact("Verdict", verdict, { provenance: "Parsed from text" })]),
        { kind: "note", text: "Parsed from the explicit Verdict line in the recorded output. It is not an approval, a score or a rating, and nothing else here is derived from it. The recorded output (Output) is authoritative.", tone: "quiet" },
        !!line && { kind: "text", title: "Recorded verdict line", text: line, format: "plain" },
      ]);
    }
    default: return stepBlocks(worktree, s, section);
  }
}
function qaContent(worktree: MissionWorktree, id: string, section: WorkbenchSectionId): Block[] | null {
  const steps = stepsOfNode(worktree, id);
  if (!steps.length) return null;
  if (steps.length === 1) return qaBlocks(worktree, steps[0], id, section);
  const per = steps.map(s => ({ s, b: qaBlocks(worktree, s, id, section) }));
  if (per.some(p => p.b === null)) return null;
  return per.map(({ s, b }, i): Block => ({ kind: "group", title: `Step ${i + 1} of ${steps.length} · ${stepDisplayLabel(worktree, s)}`, blocks: b! }));
}

/* ------------------------------------------------------------------ Ambiguity / unresolved dependency explanation (W5.3C2) */
const ISSUE_TEXT: Record<string, { label: string; why: string }> = {
  ambiguous: { label: "Matches more than one step", why: "The recorded reference matches more than one recorded step, so it cannot be known which one was meant. No candidate was selected because the recorded reference is not unique." },
  unresolved: { label: "Matches no recorded step", why: "No recorded step has this id, so there is nothing to link to. No target was chosen." },
  "self-reference": { label: "Step names itself", why: "The step lists itself as a prerequisite. That is not drawn as a dependency." },
  malformed: { label: "Malformed reference", why: "The recorded value is not a usable step id. No target was chosen." },
};
function ambiguityContent(worktree: MissionWorktree, id: string, section: WorkbenchSectionId): Block[] | null {
  const nodeId = ambiguityNodeId(id), issues = issuesOfNode(worktree, nodeId);
  if (!issues.length) return null;
  const stepOf = (stepId: string) => worktree.steps.find(x => x.id === stepId);
  const stepName = (stepId: string) => { const st = stepOf(stepId); return st ? stepDisplayLabel(worktree, st) : stepId; };
  switch (section) {
    case "problem": {
      const kinds = new Map<string, number>();
      issues.forEach(i => kinds.set(i.kind, (kinds.get(i.kind) ?? 0) + 1));
      const candidates = new Set(issues.flatMap(i => i.candidateStepIds ?? []));
      return blocks([
        facts([fact("Where", relationLabel(worktree, nodeId), { target: nodeId }), fact("References", plural(issues.length, "recorded reference")), ...[...kinds.entries()].map(([k, n]) => fact(ISSUE_TEXT[k]?.label ?? k, String(n))),
          candidates.size ? fact("Candidates", `${plural(candidates.size, "recorded step")} share the referenced ids`) : null, fact("Selected", "None. GrowForge does not choose.", { tone: "quiet" })]),
        { kind: "group", title: "Why no target was chosen", blocks: [...kinds.keys()].map((k): Block => ({ kind: "note", text: ISSUE_TEXT[k]?.why ?? "The reference could not be resolved safely." })) },
        { kind: "note", text: "No dependency is drawn for these references and nothing is shown as waiting on or feeding another step because of them. Uncertainty is kept instead of a guessed relationship.", tone: "quiet" },
      ]);
    }
    case "references": return [{ kind: "relations", items: issues.map((i): RelationItem => ({
      label: i.reference ? `“${i.reference}”` : "Reference not recorded",
      detail: `${ISSUE_TEXT[i.kind]?.label ?? i.kind} · on ${stepName(i.stepId)}${i.candidateStepIds?.length ? ` · ${plural(i.candidateStepIds.length, "candidate")}` : ""}`, unresolved: true, tone: "quiet" })) }];
    case "candidates": {
      const groups = new Map<string, string[]>();
      issues.forEach(i => { if (i.candidateStepIds?.length) groups.set(i.reference ?? "Reference not recorded", [...new Set([...(groups.get(i.reference ?? "Reference not recorded") ?? []), ...i.candidateStepIds])]); });
      return [
        { kind: "note", text: "Candidate identities are shown to explain the ambiguity. None has been selected as the dependency.", tone: "quiet" },
        ...[...groups.entries()].map(([ref, ids]): Block => ({ kind: "group", title: `“${ref}”`, note: `${plural(ids.length, "recorded step")} carry this id, in recorded order.`, blocks: [{ kind: "relations", items: ids.map((cid): RelationItem => {
          const c = stepOf(cid);
          return { label: relationLabel(worktree, cid), detail: c ? `recorded id “${c.recordedId}” · position ${c.ordinal} · ${statusText(c.status)}` : "recorded identity", unresolved: true, tone: "quiet" };
        }) }] })),
      ];
    }
    default: return null;
  }
}

/* ------------------------------------------------------------------ Team Review (W5.3C1) */
function reviewBlocks(worktree: MissionWorktree, s: Step, ownNodeId: string, section: WorkbenchSectionId): Block[] | null {
  const out = worktree.outputs.find(o => o.id === s.outputId);
  const sections = s.review?.sections ?? [];
  switch (section) {
    case "overview": {
      const resolved = new Set(s.dependencies.prerequisiteIds.map(id => selectableFor(worktree, id))).size, unresolved = s.dependencies.issues.length;
      const calls = worktree.usage.filter(u => u.stepId === s.id).length;
      const upstreamDone = s.dependencies.prerequisiteIds.length > 0 && s.dependencies.prerequisiteIds.every(id => worktree.steps.find(x => x.id === id)?.status === "done");
      return blocks([
        facts([fact("Recorded", statusText(s.status), { tone: statusTone(s.status) }), fact("Progress", `${s.percent}% recorded`), s.startedAt ? fact("Timing", `${stamp(s.startedAt)}${s.finishedAt ? ` · ${span(s.startedAt, s.finishedAt) ?? "finished"}` : " · not finished"}`) : fact("Timing", "Not recorded", { tone: "quiet" }),
          fact("Inputs", `${resolved} resolved${unresolved ? ` · ${plural(unresolved, "recorded reference")} not resolved uniquely` : ""}`),
          fact("Provider", s.provider ?? "Not recorded", s.provider ? {} : { tone: "quiet" }), fact("Usage", calls ? `${plural(calls, "call")} recorded` : "None recorded", calls ? {} : { tone: "quiet" }),
          out ? fact("Review", sections.length ? `${plural(sections.length, "section")} parsed` : "No recognisable sections", sections.length ? { provenance: "Parsed from text" } : { tone: "quiet" }) : fact("Output", "No output recorded", { tone: "quiet" }),
          s.error ? fact("Error", sanitizeRecordedError(s.error, 220) ?? "", { tone: "alert" }) : null]),
        s.status === "pending" && { kind: "note", text: `Team Review has not run: ${out ? "" : "no output is recorded. "}${upstreamDone ? "Finished upstream departments do not make it complete." : "It waits on its inputs."}`.trim(), tone: "quiet" },
        s.status === "active" && { kind: "note", text: "Active in the record. Nothing here proves a live executor is working on it.", tone: "live" },
        out && sections.length === 0 && { kind: "note", text: "No recognisable section headings were found in the recorded review. It is shown as written in Output; nothing is inferred.", tone: "quiet" },
      ]);
    }
    case "inputs": return inputsBlocks(worktree, s, ownNodeId, "review");
    case "review": {
      if (!out || sections.length === 0) return [{ kind: "unavailable", label: "Review", reason: "No review sections could be parsed from the recorded output." }];
      const heads = [...out.text.matchAll(/^###[ \t]+(.+?)[ \t]*$/gm)];
      const aligned = heads.length === sections.length;
      const pre = heads.length ? out.text.slice(0, heads[0].index ?? 0).trim() : "";
      return blocks([
        { kind: "note", text: "Parsed from text: the recorded review split on its ### headings, in recorded order. These are a convenience view; the recorded review (Output) is authoritative. No section is a structured finding, decision or approval.", tone: "quiet" },
        !!pre && { kind: "text", title: "Recorded text before the first section", text: pre, format: "markdown" },
        { kind: "review", rows: sections.map((sec, i): ReviewRow => {
          const recorded = aligned ? heads[i][1].trim() : sec.heading;
          return { mark: pad2(i + 1), heading: recorded, recognised: sec.recognized, ...(sec.recognized && aligned && recorded.replace(/[*_:`]/g, "").trim().toLowerCase() !== sec.heading.toLowerCase() ? { recognisedAs: sec.heading } : {}), text: sec.text };
        }) },
      ]);
    }
    default: return stepBlocks(worktree, s, section);
  }
}
function reviewContent(worktree: MissionWorktree, id: string, section: WorkbenchSectionId): Block[] | null {
  const steps = stepsOfNode(worktree, id);
  if (!steps.length) return null;
  if (steps.length === 1) return reviewBlocks(worktree, steps[0], id, section);
  const per = steps.map(s => ({ s, b: reviewBlocks(worktree, s, id, section) }));
  if (per.some(p => p.b === null)) return null;
  return per.map(({ s, b }, i): Block => ({ kind: "group", title: `Step ${i + 1} of ${steps.length} · ${stepDisplayLabel(worktree, s)}`, blocks: b! }));
}

/* ------------------------------------------------------------------ Step (and a typed phase that stands for its step) */
function stepBlocks(worktree: MissionWorktree, s: Step, section: WorkbenchSectionId): Block[] | null {
  const department = s.departmentId ? worktree.departments.find(d => d.id === s.departmentId) : undefined;
  const phase = s.phaseId ? worktree.phases.find(p => p.id === s.phaseId) : undefined;
  const usage = worktree.usage.filter(u => u.stepId === s.id);
  switch (section) {
    case "overview": return blocks([
      facts([fact("Label", s.label), fact("Activity", s.activity || undefined), fact("Type", s.kindKnown ? STEP_KIND_LABELS[s.kind] ?? "Type not recorded" : "Type not recorded", s.kindKnown ? {} : { tone: "quiet" }),
        department ? fact("Department", department.name, { target: department.id }) : null, phase ? fact("Phase", phase.label, { target: phase.id }) : null,
        fact("State", statusText(s.status), { tone: statusTone(s.status) }), fact("Progress", `${s.percent}% recorded`),
        s.startedAt ? fact("Timing", `${stamp(s.startedAt)}${s.finishedAt ? ` · ${span(s.startedAt, s.finishedAt) ?? "finished"}` : " · not finished"}`) : fact("Timing", "Not recorded", { tone: "quiet" }),
        s.error ? fact("Error", sanitizeRecordedError(s.error, 220) ?? "", { tone: "alert" }) : null]),
      !s.kindKnown && { kind: "note", text: `The recorded kind “${String(s.kind)}” is not one of the canonical step types, so no phase is assumed.`, tone: "quiet" },
      !s.idUnique && { kind: "note", text: "This step's recorded id is shared with other steps, so id-based references to it are never resolved.", tone: "quiet" },
    ]);
    case "execution": {
      const models = [...new Set(usage.map(u => u.model))];
      return blocks([
        facts([fact("Recorded", statusText(s.status), { tone: statusTone(s.status) }), fact("Provider", s.provider), models.length ? fact("Models", models.join(" · ")) : null, fact("Route", s.runtimeRouteId), fact("Instr. hash", s.instruction?.hash, { tone: "quiet" })]),
        s.status === "active" && { kind: "note", text: "Active in the record. Nothing here proves a live executor is working on it.", tone: "live" },
        s.instruction?.executions.length ? { kind: "group", title: "Recorded executions", blocks: [{ kind: "facts", facts: s.instruction.executions.map((e): Fact => ({ label: e.phase, value: `${e.provider} · ${e.requestedModel} · ${stamp(e.createdAt) ?? ""}`.trim() })) }] } : null,
        !!s.error && { kind: "group", title: "Recorded error", blocks: [{ kind: "text", text: sanitizeRecordedError(s.error, 900) ?? "", format: "plain" }] },
        { kind: "unavailable", label: "Executor", reason: s.execution.executorEvidence.reason },
      ]);
    }
    case "dependencies": return relationBlocks(worktree, [s], selectableFor(worktree, s.id));
    case "output": {
      const out = worktree.outputs.find(o => o.id === s.outputId);
      return [out ? { kind: "text", text: out.text, format: "markdown", chars: out.chars } : { kind: "unavailable", label: "Output", reason: "No output is recorded for this step." }];
    }
    case "usage": return usage.length ? blocks([breakdownBlock(usage), { kind: "usage", rows: usage.map(u => usageRow(worktree, u, false)) }]) : [{ kind: "unavailable", label: "Usage", reason: "No usage records for this step." }];
    case "approvals": return worktree.approvals ? (s.approvalIds.length ? s.approvalIds.map(id => worktree.approvals!.find(a => a.id === id)).filter((a): a is Approval => !!a).map(a => approvalRecord(worktree, a)) : [{ kind: "empty", text: "No approval is attached to this step." }]) : [{ kind: "unavailable", label: "Approvals", reason: "Approvals could not be read." }];
    case "consultations": return worktree.consultations ? (s.consultationIds.length ? s.consultationIds.map(id => worktree.consultations!.find(c => c.id === id)).filter((c): c is Consultation => !!c).map(c => consultationRecord(worktree, c)) : [{ kind: "empty", text: "No consultation is attached to this step." }]) : [{ kind: "unavailable", label: "Consultations", reason: "Consultations could not be read." }];
    default: return null;
  }
}
function stepContent(worktree: MissionWorktree, id: string, section: WorkbenchSectionId): Block[] | null {
  const steps = stepsOfNode(worktree, id);
  if (!steps.length) return null;
  if (steps.length === 1) return stepBlocks(worktree, steps[0], section);
  // A phase that recorded several steps (a re-run left two): one labelled group per step, never merged.
  const per = steps.map(s => ({ s, b: stepBlocks(worktree, s, section) }));
  if (per.some(p => p.b === null)) return null;
  return per.map(({ s, b }, i): Block => ({ kind: "group", title: `Step ${i + 1} of ${steps.length} · ${stepDisplayLabel(worktree, s)}`, blocks: b! }));
}

/* ------------------------------------------------------------------ Departments phase (the sector as a whole) */
function departmentsPhaseContent(worktree: MissionWorktree, id: string, section: WorkbenchSectionId): Block[] | null {
  const phase = worktree.phases.find(p => p.id === id);
  if (!phase) return null;
  const steps = stepsOfNode(worktree, id);
  const parallel = phase.parallel;
  const evidence = parallel ? (parallel.state === "parallel" ? "Parallel: no recorded dependency between departments" : parallel.state === "single" ? "One department recorded" : "Departments depend on each other") : undefined;
  switch (section) {
    case "overview": return blocks([
      facts([fact("State", mixText(phase.statusCounts) || "No recorded steps", { tone: statusTone(phase.status) }), fact("Departments", String(worktree.departments.length)), fact("Steps", String(steps.length)), fact("Execution", evidence, { provenance: "Derived" }),
        phase.startedAt ? fact("Timing", `${stamp(phase.startedAt)}${phase.finishedAt ? ` · ${span(phase.startedAt, phase.finishedAt) ?? "finished"}` : " · not finished"}`) : null]),
      { kind: "note", text: "The departments run as one sector. Open a department to see its own steps; the recorded dependencies, not the layout, say what waited on what.", tone: "quiet" },
    ]);
    case "execution": return blocks([
      facts([fact("Recorded", statusText(phase.status === "mixed" ? "mixed" : phase.status)), fact("Execution", evidence, { provenance: "Derived" }), fact("Statuses", mixText(phase.statusCounts) || undefined)]),
      !worktree.mission.execution.liveConfirmed && steps.some(s => s.status === "active") && { kind: "note", text: "Active in the record. Nothing here proves a live executor is working on it.", tone: "live" },
    ]);
    case "usage": return usageOfSteps(worktree, steps);
    case "dependencies": return phase.dependsOnPhaseIds.length ? [{ kind: "relations", items: phase.dependsOnPhaseIds.map((pid): RelationItem => ({ label: relationLabel(worktree, pid), detail: targetStatus(worktree, pid), target: pid })) }] : [{ kind: "empty", text: "No resolved dependency on another phase." }];
    default: return null;
  }
}

/* ------------------------------------------------------------------ C7F: Overview is a summary; the telemetry moves deeper (nothing is dropped) */
/** Facts that the Overview used to print and that belong in Execution (state, timing, executor, verification) or Usage (provider, usage). */
const EXEC_LABELS = new Set(["Recorded", "Progress", "Timing", "Created", "Updated", "Executor", "Verified", "Verified flag", "State", "Steps"]);
const USAGE_LABELS = new Set(["Provider", "Usage"]);
const IDENTITY_LABELS = new Set(["Department", "Label", "Name"]);
function splitOverview(blocks: Block[], has: { exec: boolean; usage: boolean }, title?: string): { kept: Block[]; exec: Fact[]; usage: Fact[] } {
  const exec: Fact[] = [], usage: Fact[] = [], kept: Block[] = [];
  blocks.forEach(b => {
    if (b.kind !== "facts") { kept.push(b); return; }
    // A fact only leaves the Overview when its deeper section exists for this entity (an absence like "Provider: Not recorded" must not vanish with a missing Usage section).
    // C7G: a fact that only repeats the entity's own title (the identity header already says it) is not printed again.
    const rest = b.facts.filter(f => !(title && IDENTITY_LABELS.has(f.label) && !f.target && f.value.replace(/\s*\(.*\)$/, "").trim() === title.trim())).filter(f => (has.exec && EXEC_LABELS.has(f.label) ? (exec.push(f), false) : has.usage && USAGE_LABELS.has(f.label) ? (usage.push(f), false) : true));
    if (rest.length) kept.push({ ...b, facts: rest });
  });
  return { kept, exec, usage };
}
const factLabels = (list: Block[]) => new Set(list.flatMap(b => (b.kind === "facts" ? b.facts.map(f => f.label) : [])));

/** The reading content for an entity + section, or null when this task does not cover it (the shell keeps its placeholder) or the section is not available. */
export function workbenchContentOf(worktree: MissionWorktree, entityId: string | null, section: WorkbenchSectionId): WorkbenchContent | null {
  const caps = workbenchCapabilities(worktree, entityId);
  if (!entityId || !caps || !caps.sections.some(s => s.id === section)) return null;
  const build = (sec: WorkbenchSectionId): Block[] | null => {
    if (caps.profile === "mission") return missionContent(worktree, sec);
    if (caps.profile === "department") return departmentContent(worktree, worktree.departments.find(d => d.id === entityId)!, sec);
    if (caps.profile === "step") return stepContent(worktree, entityId, sec);
    if (caps.profile === "research") return researchContent(worktree, entityId, sec);
    if (caps.profile === "review") return reviewContent(worktree, entityId, sec);
    if (caps.profile === "qa") return qaContent(worktree, entityId, sec);
    if (caps.profile === "ambiguity") return ambiguityContent(worktree, entityId, sec);
    if (caps.profile === "departments-phase") return departmentsPhaseContent(worktree, entityId, sec);
    return null;
  };
  let content = build(section);
  const has = { exec: caps.sections.some(c => c.id === "execution"), usage: caps.sections.some(c => c.id === "usage") };
  if (content && caps.profile !== "ambiguity") {
    const analytics = analyticsOf(worktree, entityId);
    if (section === "overview") {
      // W7.2 / C7F: one summary row (Completion, Elapsed, Steps, API cost) + the recorded state bar; the telemetry the old Overview repeated lives in Execution and Usage.
      content = [...(analytics ? [{ kind: "analytics", analytics, part: "overview" } as Block] : []), ...splitOverview(content, has, entityLabel(worktree, entityId)?.label).kept];
    } else if (section === "execution" || section === "usage") {
      const moved = splitOverview(build("overview") ?? [], has);
      const mine = factLabels(content), extra = (section === "execution" ? moved.exec : moved.usage).filter(f => !mine.has(f.label));
      const timeline = section === "execution" ? executionTimelineOf(worktree, entityId === worktree.mission.id ? worktree.steps : stepsOfNode(worktree, entityId), step => stepLabelOf(worktree, step)) : null;
      const lead = [...(analytics ? [{ kind: "analytics", analytics, part: section } as Block] : []), ...(timeline ? [{ kind: "timeline", timeline } as Block] : [])];
      const at = content.findIndex(b => b.kind === "facts");
      // C7G: the usage breakdown is the section's primary instrument: it leads, the other-dimension distributions follow.
      const first = section === "usage" && content[0]?.kind === "usageBreakdown" ? [content[0]] : [];
      if (first.length) content = [...first, ...(extra.length ? [{ kind: "facts", facts: extra } as Block] : []), ...lead, ...content.slice(1)];
      else if (!extra.length) content = [...lead, ...content];
      else if (at >= 0) content = [...lead, ...content.map((b, i) => (i === at && b.kind === "facts" ? { ...b, facts: [...b.facts, ...extra] } : b))];
      else content = [...lead, { kind: "facts", facts: extra } as Block, ...content];
    }
  }
  return content ? { entityId, section, blocks: content } : null;
}
