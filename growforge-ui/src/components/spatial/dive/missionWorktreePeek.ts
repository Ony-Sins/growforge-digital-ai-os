import type { Department, MissionWorktree, PipelinePhase, Step } from "./missionWorktree";
import { ambiguityId, ambiguityNodeId, isAmbiguityId, isKnownEntity, issuesOfNode, selectableFor, stepsOfNode } from "./missionWorktreeAncestry";
import { entityLabel, stepDisplayLabel } from "./missionWorktreeLabels";
import { STEP_KIND_LABELS } from "./missionStepModel";
import { sanitizeRecordedError } from "./missionRecordedError";
import { analyticsOf, analyticsPeekHeight, type Analytics } from "./missionAnalytics";

/**
 * Peek content (W4): 4-6 useful facts about the selected entity, from canonical Worktree data only. Anything parsed from markdown says so; derived values say so;
 * nothing is invented (no executor identity, no QA verdict without the explicit verdict line, no task name for a generic step). Depth belongs to the Workbench (W5).
 */
export type PeekProvenance = "recorded" | "derived" | "parsed";
export interface PeekFact { label: string; value: string; provenance?: PeekProvenance; tone?: "alert" | "live"; /** Rendered lines (1 or 2). */ lines?: 1 | 2 }
export interface PeekLink { label: string; detail?: string; targetId: string; direction: "needs" | "waits" | "ambiguity" }
export type PeekKind = "mission" | "phase" | "department" | "step" | "ambiguity";
export interface PeekModel {
  entityId: string; kind: PeekKind; typeLabel: string; title: string;
  facts: PeekFact[]; links: PeekLink[];
  /** W7.2: the selection-aware instrument (real, sourced numbers); null for an ambiguity marker. The Peek hides the facts it already carries (`analytics.covers`). */
  analytics: Analytics | null;
  /** Dependencies beyond the links shown (counted, never silently dropped). */
  linksOverflow: number;
}
export const MAX_PEEK_FACTS = 6;
const MAX_LINKS_PER_DIRECTION = 1;

const STATUS_TEXT: Record<string, string> = { pending: "Pending", active: "Active (recorded)", done: "Done", error: "Error", skipped: "Skipped", mixed: "Mixed" };
const stamp = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
const duration = (a: string, b: string) => { const ms = Date.parse(b) - Date.parse(a); if (!Number.isFinite(ms) || ms < 0) return null; const s = Math.round(ms / 1000); return s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`; };
const clip = (text: string, max: number) => { const t = text.replace(/\s+/g, " ").trim(); return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t; };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const timing = (startedAt?: string, finishedAt?: string): PeekFact | null => startedAt ? { label: "Timing", value: `${stamp(startedAt)}${finishedAt ? ` · ${duration(startedAt, finishedAt) ?? "finished"}` : " · not finished"}` } : null;
const compact = (facts: (PeekFact | null | false | undefined)[]): PeekFact[] => facts.filter((f): f is PeekFact => !!f).slice(0, MAX_PEEK_FACTS);
const mix = (counts: Partial<Record<string, number>>) => (Object.keys(counts) as string[]).map(k => `${counts[k]} ${(STATUS_TEXT[k] ?? k).toLowerCase()}`).join(" · ");

function stepErrors(steps: Step[]): PeekFact | null {
  const errored = steps.filter(s => s.status === "error");
  if (!errored.length) return null;
  const first = errored.find(s => s.error);
  const text = first ? sanitizeRecordedError(first.error, 130) : null;
  return { label: "Attention", value: `${plural(errored.length, "error")}${text ? ` · ${text}` : ""}`, tone: "alert", lines: 2 };
}

/** Dependency links for a work item: resolved prerequisites / dependents are selectable; unresolved references are only counted; ambiguity is its own selectable explanation. */
function dependencyLinks(worktree: MissionWorktree, steps: Step[], ownNodeId: string): { links: PeekLink[]; overflow: number; unresolved: number } {
  const inside = new Set(steps.map(s => s.id));
  const target = (id: string) => selectableFor(worktree, id);
  const uniq = (ids: string[]) => [...new Set(ids.filter(id => !inside.has(id)).map(target))].filter(id => id !== ownNodeId);
  const needs = uniq(steps.flatMap(s => s.dependencies.prerequisiteIds)), waits = uniq(steps.flatMap(s => s.dependencies.dependentIds));
  const label = (id: string) => {
    const seg = entityLabel(worktree, id);
    const st = seg?.kind === "step" ? worktree.steps.find(x => x.id === id) : undefined;
    const dept = st?.departmentId ? worktree.departments.find(d => d.id === st.departmentId) : undefined;
    return dept && seg ? `${dept.name} · ${seg.label}` : seg?.label ?? id;
  };
  const links: PeekLink[] = [
    ...needs.slice(0, MAX_LINKS_PER_DIRECTION).map((id): PeekLink => ({ label: label(id), targetId: id, direction: "needs" })),
    ...waits.slice(0, MAX_LINKS_PER_DIRECTION).map((id): PeekLink => ({ label: label(id), targetId: id, direction: "waits" })),
  ];
  const issues = steps.flatMap(s => s.dependencies.issues);
  const ambiguous = issues.filter(i => i.kind === "ambiguous").length;
  if (ambiguous) links.push({ label: `Dependency could not be resolved uniquely (${ambiguous})`, targetId: ambiguityId(ownNodeId), direction: "ambiguity" });
  return { links, overflow: Math.max(0, needs.length - MAX_LINKS_PER_DIRECTION) + Math.max(0, waits.length - MAX_LINKS_PER_DIRECTION), unresolved: issues.filter(i => i.kind !== "ambiguous").length };
}

function phasePeek(worktree: MissionWorktree, phase: PipelinePhase): Pick<PeekModel, "facts" | "links" | "linksOverflow"> {
  const steps = stepsOfNode(worktree, phase.id);
  const before = phase.dependsOnPhaseIds.map(id => worktree.phases.find(p => p.id === id)?.label).filter((l): l is string => !!l);
  const after = worktree.phases.filter(p => p.dependsOnPhaseIds.includes(phase.id)).map(p => p.label);
  const rel = (label: string, names: string[]): PeekFact | null => names.length ? { label, value: names.join(", "), provenance: "derived" } : null;
  const state: PeekFact = { label: "State", value: `${STATUS_TEXT[phase.status] ?? phase.status}${phase.recordedPercent !== undefined ? ` · ${phase.recordedPercent}% recorded` : ""}`, tone: phase.status === "error" ? "alert" : undefined };
  const dep = dependencyLinks(worktree, steps, phase.id);
  const only = steps[0];
  let facts: (PeekFact | null)[];
  if (phase.key === "live-research" && only?.research) {
    const r = only.research;
    facts = [state, timing(only.startedAt, only.finishedAt),
      { label: "Questions", value: r.questions ? String(r.questions.length) : "not recorded" },
      { label: "Sources", value: r.sourceIds.length ? `${r.sourceIds.length} recorded · ${r.verified ? "verified" : "not verified"}` : "none recorded · no search-grounded sources", tone: r.noSources ? "alert" : undefined },
      stepErrors(steps), rel("Leads to", after)];
  } else if (phase.key === "team-review" && only) {
    const agreed = only.review?.sections.find(s => s.key === "agreed-direction");
    const line = agreed?.text.split("\n").map(l => l.replace(/^[-*\d.\s]+/, "").trim()).find(Boolean);
    const inputs = new Set(only.dependencies.prerequisiteIds).size;
    facts = [state, timing(only.startedAt, only.finishedAt), { label: "Inputs", value: inputs ? `${plural(inputs, "recorded step")} feed this review` : "none resolved" },
      { label: "Provider", value: `${only.provider ?? "not recorded"} · ${only.usageIds.length ? plural(only.usageIds.length, "usage record") : "no usage recorded"}` },
      line ? { label: "Agreed direction", value: clip(line, 120), provenance: "parsed", lines: 2 } : null, stepErrors(steps)];
  } else if (phase.key === "qa" && only) {
    facts = [state, timing(only.startedAt, only.finishedAt), only.review?.verdict ? { label: "Verdict", value: only.review.verdict, provenance: "parsed" } : null,
      { label: "Provider", value: `${only.provider ?? "not recorded"} · ${only.usageIds.length ? plural(only.usageIds.length, "usage record") : "no usage recorded"}` }, rel("Before", before), stepErrors(steps)];
  } else if (phase.key === "departments") {
    const parallel = phase.parallel;
    facts = [{ label: "State", value: mix(phase.statusCounts) || "no recorded steps", tone: phase.status === "error" ? "alert" : undefined }, { label: "Departments", value: String(worktree.departments.length) },
      { label: "Steps", value: String(steps.length) }, parallel ? { label: "Execution", value: parallel.state === "parallel" ? "parallel (no recorded dependency between departments)" : parallel.state === "single" ? "one department recorded" : "departments depend on each other", provenance: "derived", lines: 2 } : null,
      timing(phase.startedAt, phase.finishedAt), stepErrors(steps)];
  } else {
    facts = [state, timing(phase.startedAt, phase.finishedAt), rel("Before", before), rel("After", after), stepErrors(steps)];
  }
  return { facts: compact(facts), links: dep.links, linksOverflow: dep.overflow };
}

function departmentPeek(worktree: MissionWorktree, department: Department): Pick<PeekModel, "facts" | "links" | "linksOverflow"> {
  const steps = stepsOfNode(worktree, department.id);
  const counts: Partial<Record<string, number>> = {};
  steps.forEach(s => { counts[s.status] = (counts[s.status] ?? 0) + 1; });
  const assignment = department.assignments[0];
  const pendingApprovals = (worktree.approvals ?? []).filter(a => a.status === "pending" && a.stepId && steps.some(s => s.id === a.stepId)).length;
  const pendingAsk = (worktree.consultations ?? []).filter(c => c.status === "pending" && c.stepId && steps.some(s => s.id === c.stepId)).length;
  const errors = steps.filter(s => s.status === "error").length;
  const attention = [errors ? plural(errors, "step error") : "", pendingApprovals ? plural(pendingApprovals, "approval") + " pending" : "", pendingAsk ? plural(pendingAsk, "question") + " pending" : ""].filter(Boolean).join(" · ");
  const rec = department.specialistRecommendation;
  return { facts: compact([
    { label: "Steps", value: steps.length ? `${plural(steps.length, "step")} · ${mix(counts)}` : "assigned · no recorded steps", tone: errors ? "alert" : undefined },
    assignment?.task ? { label: "Assignment", value: clip(assignment.task, 140), lines: 2 } : { label: "Assignment", value: "task not recorded" },
    attention ? { label: "Attention", value: attention, tone: "alert" } : null,
    rec ? { label: "Suggested", value: `${rec.name} · planning recommendation, not an executor`, lines: 2 } : null,
    department.legacyRoute ? { label: "Route", value: `recorded through legacy route ${department.legacyRoute}` } : null,
  ]), links: [], linksOverflow: 0 };
}

function stepPeek(worktree: MissionWorktree, step: Step): Pick<PeekModel, "facts" | "links" | "linksOverflow"> {
  const usage = worktree.usage.find(u => u.stepId === step.id);
  const dep = dependencyLinks(worktree, [step], selectableFor(worktree, step.id));
  const counts = `needs ${step.dependencies.prerequisiteIds.length} · waits on this ${step.dependencies.dependentIds.length}${dep.unresolved ? ` · ${dep.unresolved} unresolved` : ""}`;
  const err = step.error ? sanitizeRecordedError(step.error, 140) : null;
  return { facts: compact([
    { label: "Type", value: step.kindKnown ? (STEP_KIND_LABELS[step.kind] ?? step.kind) : "not recorded as a known type" },
    { label: "State", value: `${STATUS_TEXT[step.status] ?? step.status}${step.status === "active" ? ` · ${step.percent}%` : ""}`, tone: step.status === "error" ? "alert" : undefined },
    { label: "Progress", value: `${step.percent}% recorded` },
    step.provider || usage ? { label: "Provider", value: [step.provider, usage?.model].filter(Boolean).join(" · ") } : null,
    { label: "Dependencies", value: counts },
    err ? { label: "Error", value: err, tone: "alert", lines: 2 } : timing(step.startedAt, step.finishedAt),
  ]), links: dep.links, linksOverflow: dep.overflow };
}

function ambiguityPeek(worktree: MissionWorktree, nodeId: string): Pick<PeekModel, "facts" | "links" | "linksOverflow"> {
  const issues = issuesOfNode(worktree, nodeId);
  const ambiguous = issues.filter(i => i.kind === "ambiguous");
  const candidates = new Set(ambiguous.flatMap(i => i.candidateStepIds ?? []));
  const others = issues.length - ambiguous.length;
  return { facts: compact([
    { label: "Problem", value: "Dependency could not be resolved uniquely", tone: "alert", lines: 2 },
    { label: "On", value: entityLabel(worktree, nodeId)?.label ?? nodeId },
    { label: "References", value: plural(issues.length, "dependency reference") },
    ambiguous.length ? { label: "Candidates", value: `${plural(candidates.size, "recorded step")} share the referenced ids; none is chosen`, lines: 2 } : null,
    others ? { label: "Also", value: `${plural(others, "reference")} unresolved or malformed` } : null,
  ]), links: [], linksOverflow: 0 };
}

function peekCore(worktree: MissionWorktree, id: string | null): Omit<PeekModel, "analytics"> | null {
  if (!id || !isKnownEntity(worktree, id)) return null;
  const thread = entityLabel(worktree, id);
  if (!thread) return null;
  if (id === worktree.mission.id) {
    const m = worktree.mission, live = m.execution.liveEvidence;
    const errors = worktree.steps.filter(s => s.status === "error").length;
    const state = m.status === "running" ? (live === "confirmed" ? "Running · executor confirmed" : live === "unconfirmed" ? "Recorded running · no executor confirms it" : "Recorded running · liveness cannot be verified") : STATUS_TEXT[m.status === "done" ? "done" : "error"];
    return { entityId: id, kind: "mission", typeLabel: "Mission", title: m.title, links: [], linksOverflow: 0, facts: compact([
      { label: "State", value: state, tone: m.status === "error" ? "alert" : live === "confirmed" ? "live" : undefined, lines: 2 },
      { label: "Progress", value: `${m.percent}% recorded` }, { label: "Phases", value: `${worktree.phases.length} of ${worktree.canonicalPhaseOrder.length} recorded` },
      { label: "Departments", value: String(worktree.departments.length) }, { label: "Steps", value: String(worktree.steps.length) },
      errors ? { label: "Attention", value: plural(errors, "step error"), tone: "alert" } : null]) };
  }
  if (isAmbiguityId(id)) return { entityId: id, kind: "ambiguity", typeLabel: "Dependency", title: "Could not be resolved uniquely", ...ambiguityPeek(worktree, ambiguityNodeId(id)) };
  const phase = worktree.phases.find(p => p.id === id);
  if (phase) return { entityId: id, kind: "phase", typeLabel: "Phase", title: phase.label, ...phasePeek(worktree, phase) };
  const department = worktree.departments.find(d => d.id === id);
  if (department) return { entityId: id, kind: "department", typeLabel: "Department", title: department.name, ...departmentPeek(worktree, department) };
  const step = worktree.steps.find(s => s.id === id);
  return step ? { entityId: id, kind: "step", typeLabel: step.kindKnown ? "Step" : "Step · type not recorded", title: stepDisplayLabel(worktree, step), ...stepPeek(worktree, step) } : null;
}

export function peekOf(worktree: MissionWorktree, id: string | null): PeekModel | null {
  const core = peekCore(worktree, id);
  return core ? { ...core, analytics: core.kind === "ambiguity" ? null : analyticsOf(worktree, core.entityId) } : null;
}
/** The facts the Peek prints: the ones the analytics header already carries are hidden instead of being shown twice. The full list stays on the model (NORA context, Workbench lead). */
export const visibleFacts = (model: PeekModel, compact = false): PeekFact[] => { const facts = model.analytics ? model.facts.filter(f => !model.analytics!.covers.includes(f.label)) : model.facts; return compact ? facts.slice(0, 1) : facts; };

/**
 * Deterministic Peek size (px) from its content, so layout can reserve or place it without measuring the DOM. `double` is a two-column variant (wide and short) used when the
 * single-column plane has no clear spot beside the selected entity.
 */
export type PeekVariant = "single" | "double" | "triple";
const COLUMNS: Record<PeekVariant, number> = { single: 1, double: 2, triple: 3 };
export function peekSize(model: PeekModel, mode: "desktop" | "wide" | "stack", stageWidth: number, variant: PeekVariant = "single", compact = false): { w: number; h: number; variant: PeekVariant } {
  const phone = mode === "stack";
  const linkH = phone ? 44 : 28;
  const lines = (f: PeekFact) => (f.lines === 2 ? 2 : 1);
  const facts = visibleFacts(model, compact), an = analyticsPeekHeight(model.analytics, compact);
  if (phone || variant === "single") {
    const w = phone ? Math.max(200, stageWidth - 20) : mode === "wide" ? 274 : 324;
    const h = 16 + 40 + an + facts.reduce((a, f) => a + lines(f) * 15 + 5, 0) + (model.links.length ? 8 + model.links.length * linkH : 0) + (model.linksOverflow ? 18 : 0) + 14;
    return { w, h, variant: "single" };
  }
  const cols = COLUMNS[variant];
  const w = Math.min(stageWidth - 24, variant === "double" ? (mode === "wide" ? 430 : 480) : (mode === "wide" ? 508 : 600));
  let rows = 0;
  for (let i = 0; i < facts.length; i += cols) rows += Math.max(...facts.slice(i, i + cols).map(lines)) * 15 + 5;
  const h = 16 + 40 + an + rows + (model.links.length ? 8 + Math.ceil(model.links.length / cols) * linkH : 0) + (model.linksOverflow ? 18 : 0) + 14;
  return { w, h, variant };
}
export { stepsOfNode };
