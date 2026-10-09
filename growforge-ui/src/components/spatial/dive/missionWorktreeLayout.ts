import type { Department, MissionWorktree, PhaseKey, PipelinePhase, RelationKind, Step, StepStatus } from "./missionWorktree";
import { DEPARTMENT_TAXONOMY } from "@/lib/departmentTaxonomy";
import { ownershipAncestry } from "./missionWorktreeAncestry";
import { stepPrimaryLabel } from "./missionStepModel";
import type { MissionLayoutMode } from "./missionFlowModel";

/**
 * W2: deterministic geometry for the SAME MissionWorktree entities in two arrangements.
 *   graph    the Mission's operational universe: the Mission is the anchor, recorded phases orbit it clockwise in execution order, Departments
 *            fan out of the Departments phase.
 *   canonical execution order: Client Brief -> Planning -> Live Research -> Departments (fan out / run parallel) -> Team Review -> QA -> Final Plan.
 * Pure: layout = f(worktree, stage size, responsive mode, view state). No measurement, no simulation, no randomness, no timers.
 *
 * Truth rules carried from W1: a missing canonical phase is a GAP MARKER (not an entity, no status/progress, not selectable). The layout never turns
 * recorded progress into success: `status` and `percent` are separate fields and nothing here reads one to produce the other. An ambiguous dependency draws
 * NO connection of any kind (step-level or department-level): it becomes an ambiguity marker whose metadata keeps the candidate step and department ids.
 * Every recorded step is a node. A step whose kind is not a canonical phase kind keeps its department when it records one; otherwise it sits in the derived
 * "Unclassified recorded steps" region (not a phase, not an entity). Departments are laid out in the canonical taxonomy order (spatial memory, not importance).
 */
/** The canonical Mission Graph is the only layout family (a desktop arrangement and the phone's responsive stack); there is no alternative view. */
export type WorktreeView = "graph";
/** The view state. Identity is the entity id; labels and ordinals are never used. */
export interface ViewState { view: WorktreeView; selectedId: string | null; expandedDepartmentId: string | null }
export interface StageBox { width: number; height: number }

export type LayoutNodeKind = "mission" | "phase" | "department" | "step";
export interface LayoutNode {
  /** The Worktree entity id. Identical in both views. */
  id: string; kind: LayoutNodeKind;
  x: number; y: number; w: number; h: number;
  /** Header height inside a node that also contains child nodes (Departments group). Edge anchors use it. */
  headerH: number;
  /** Containment depth in the semantic hierarchy (mission 0, phase 1, department 2, step 3). */
  depth: number; parentId?: string;
  label: string; detail: string;
  /** Recorded status. Never derived from `percent`. */
  status?: StepStatus | "mixed" | "assigned"; percent?: number;
  stepCount?: number;
  /** Graph only: the side of this node that faces the Mission (the open / structural edge is drawn there). */
  facing?: "l" | "r" | "t" | "b";
  /** Phase / department: the recorded status of each step it owns, in recorded order (the micro state strip). Never aggregated into a score. */
  statuses?: StepStatus[];
  /** Phase only: its 1-based position in the canonical execution order (a constant of the canonical order, never derived from status or time). */
  order?: number;
  /** Step whose recorded kind is not a canonical phase kind: its type is unavailable (never guessed). */
  kindUnknown?: true;
  /** Node ids this node has recorded, resolved dependencies on (at the coarsest representative visible in this view). */
  dependsOn: string[];
  ambiguousCount: number;
}
/** A derived structural region (not an entity): where recorded steps go when neither a phase nor a department can truthfully contain them. */
export interface LayoutRegion { key: "unclassified-steps"; label: string; caption: string; x: number; y: number; w: number; h: number; stepIds: string[] }
/** A canonical phase the record does not contain. NOT an entity: no id of a Worktree entity, no status, no progress, not selectable. */
export interface LayoutGap { key: PhaseKey; label: string; order: number; x: number; y: number; w: number; h: number; caption: "not recorded" }
export type LayoutRelation = RelationKind;
export interface LayoutEdge {
  id: string; relation: LayoutRelation; from: string; to: string;
  /** line: draw a path. containment: expressed by nesting. implicit: the relation holds but is not drawn in this view. */
  rendering: "line" | "containment" | "implicit";
  d: string;
  /** dependency: how many recorded step dependencies this connection aggregates. */
  count?: number;
  meaning: string;
}
export interface LayoutAmbiguity {
  nodeId: string;
  /** Marker position (stage px), at the node's top-right corner. */
  x: number; y: number;
  issues: { stepId: string; kind: string; reference?: string; candidateStepIds: string[]; candidateDepartmentIds: string[]; detail: string }[];
}
export interface WorktreeLayout {
  view: WorktreeView; mode: MissionLayoutMode; stage: StageBox;
  state: ViewState;
  nodes: LayoutNode[]; gaps: LayoutGap[]; regions: LayoutRegion[]; edges: LayoutEdge[]; ambiguities: LayoutAmbiguity[];
  /** Stack only: the slot reserved under the selected row for the Peek sheet (every later row is already shifted down by it). */
  peekSlot?: { afterId: string; x: number; y: number; w: number; h: number };
  /** > stage.height when the content needs vertical scrolling (never horizontal). */
  contentHeight: number;
}

const RELATION_MEANING: Record<LayoutRelation, string> = {
  ownership: "The Mission owns this entity.",
  "phase-membership": "The phase contains this entity.",
  "department-membership": "The department owns this step.",
  dependency: "A recorded dependency: the target cannot start until the source is done.",
  "recorded-evidence": "The step recorded this source.",
};

/* ------------------------------------------------------------------ state */
/** Selecting a step reveals its department (the expansion is derived, never remapped by label). A stale id falls back to nothing. */
export function resolveViewState(worktree: MissionWorktree, state: ViewState): ViewState {
  const known = new Set<string>([worktree.mission.id, ...worktree.phases.map(p => p.id), ...worktree.departments.map(d => d.id), ...worktree.steps.map(s => s.id)]);
  const selectedId = state.selectedId && known.has(state.selectedId) ? state.selectedId : null;
  const selectedStep = selectedId ? worktree.steps.find(s => s.id === selectedId) : undefined;
  let expanded = state.expandedDepartmentId && worktree.departments.some(d => d.id === state.expandedDepartmentId) ? state.expandedDepartmentId : null;
  if (selectedStep?.departmentId) expanded = selectedStep.departmentId;
  return { view: state.view, selectedId, expandedDepartmentId: expanded };
}
/** The chain mission -> phase -> department -> step that contains an entity (for the illuminated ancestry path). Implemented in missionWorktreeAncestry (no geometry). */
export const ancestryOf = ownershipAncestry;

/* ------------------------------------------------------------------ canonical department order & density contract */
const TAXON_ORDER: readonly string[] = DEPARTMENT_TAXONOMY.map(taxon => taxon.id);
/**
 * Spatial order of a canonical department: its position in DEPARTMENT_TAXONOMY (the one canonical list). The legacy `meta-ads` branch sits right after its parent
 * (Brand & Growth Marketing); any unknown / custom department follows, ordered by id. This is for spatial memory only, never importance.
 */
export function departmentRank(canonicalId: string): number {
  const index = TAXON_ORDER.indexOf(canonicalId);
  if (index >= 0) return index;
  if (canonicalId === "meta-ads") return TAXON_ORDER.indexOf("brand_growth_marketing") + 0.5;
  return 1000;
}
export const orderDepartments = (departments: readonly Department[]): Department[] => [...departments].sort((a, b) => departmentRank(a.canonicalId) - departmentRank(b.canonicalId) || (a.canonicalId < b.canonicalId ? -1 : a.canonicalId > b.canonicalId ? 1 : 0));
/** Interaction-safe sizes (px). Phones reserve at least 40 px for every interactive row; desktop never goes below 28 px for a clickable node. */
export const DENSITY = {
  desktop: { stepMin: 28, departmentHeadMin: 30, groupHeader: 28, regionRow: 30 },
  stack: { mission: 56, phase: 60, department: 48, step: 44, groupHeader: 40, regionRow: 44, gap: 36 },
} as const;

/* ------------------------------------------------------------------ model shared by every arrangement */
const STATUS_TEXT: Record<string, string> = { pending: "pending", active: "active (recorded)", done: "done", error: "error", skipped: "skipped", mixed: "mixed" };

const statusesOf = (worktree: MissionWorktree, ids: readonly string[]): StepStatus[] => ids.map(id => worktree.steps.find(s => s.id === id)?.status).filter((x): x is StepStatus => !!x);
const compactTokens = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
/** A step's compact execution facts, recorded only: how long it took and how many tokens its calls reported. Absent when not recorded (never zero-filled). */
function stepFacts(worktree: MissionWorktree, step: Step): string {
  const ms = step.startedAt && step.finishedAt ? Date.parse(step.finishedAt) - Date.parse(step.startedAt) : NaN;
  const records = worktree.usage.filter(u => u.stepId === step.id);
  const tokens = records.reduce((n, u) => n + (u.inputTokens ?? 0) + (u.outputTokens ?? 0), 0);
  const dur = Number.isFinite(ms) && ms >= 0 ? (ms >= 60_000 ? `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s` : `${Math.round(ms / 1000)}s`) : "";
  return `${dur ? ` · ${dur}` : ""}${records.length && tokens > 0 ? ` · ${compactTokens(tokens)} tok` : ""}`;
}
function departmentStatus(worktree: MissionWorktree, department: Department): { status: LayoutNode["status"]; detail: string } {
  const steps = department.stepIds.map(id => worktree.steps.find(s => s.id === id)).filter((s): s is Step => !!s);
  if (!steps.length) return { status: "assigned", detail: "assigned · no recorded steps" };
  const counts: Partial<Record<StepStatus, number>> = {};
  steps.forEach(s => { counts[s.status] = (counts[s.status] ?? 0) + 1; });
  const kinds = Object.keys(counts) as StepStatus[];
  const status = counts.error ? "error" : counts.active ? "active" : kinds.length === 1 ? kinds[0] : "mixed";
  return { status, detail: `${steps.length} ${steps.length === 1 ? "step" : "steps"} · ${kinds.map(k => `${counts[k]} ${STATUS_TEXT[k] ?? k}`).join(" · ")}` };
}
function phaseDetail(phase: PipelinePhase): string {
  const mix = (Object.keys(phase.statusCounts) as StepStatus[]).map(k => `${phase.statusCounts[k]} ${STATUS_TEXT[k] ?? k}`).join(" · ");
  if (phase.key === "departments") return `parallel · ${mix}`;
  return `${STATUS_TEXT[phase.status] ?? phase.status}${phase.recordedPercent !== undefined ? ` · ${phase.recordedPercent}% recorded` : ""}`;
}

interface Info { node: Omit<LayoutNode, "x" | "y" | "w" | "h" | "headerH" | "dependsOn" | "ambiguousCount">; }
interface Model {
  worktree: MissionWorktree; state: ViewState; view: WorktreeView;
  mission: Info; phases: Map<PhaseKey, Info>; departments: Info[]; steps: Info[]; stepsOf: Map<string, Info[]>; /** C5A.1: the recorded steps of each NON-Departments phase (its immediate children; only the desktop Graph draws them, and only for the active phase). */ phaseSteps: Map<PhaseKey, Info[]>; unclassified: Info[];
  repCollapsed: (stepId: string) => string | undefined;
  visibleIds: Set<string>;
}
function buildModel(worktree: MissionWorktree, state: ViewState): Model {
  const mission: Info = { node: { id: worktree.mission.id, kind: "mission", depth: 0, label: worktree.mission.title, detail: `${worktree.mission.status} · ${worktree.mission.percent}% recorded`, status: worktree.mission.status === "running" ? "active" : worktree.mission.status, percent: worktree.mission.percent } };
  const departmentsPhase = worktree.phases.find(p => p.key === "departments");
  const phases = new Map<PhaseKey, Info>();
  worktree.phases.forEach(phase => phases.set(phase.key, { node: { id: phase.id, kind: "phase", depth: 1, parentId: worktree.mission.id, label: phase.label, detail: phaseDetail(phase), status: phase.status, order: worktree.canonicalPhaseOrder.indexOf(phase.key) + 1, statuses: statusesOf(worktree, phase.stepIds), ...(phase.recordedPercent !== undefined ? { percent: phase.recordedPercent } : {}), stepCount: phase.stepIds.length } }));
  const departments: Info[] = orderDepartments(worktree.departments).map(department => {
    const summary = departmentStatus(worktree, department);
    return { node: { id: department.id, kind: "department", depth: 2, parentId: departmentsPhase?.id ?? worktree.mission.id, label: department.name, detail: summary.detail, status: summary.status, stepCount: department.stepIds.length, statuses: statusesOf(worktree, department.stepIds) } };
  });
  const stepsOf = new Map<string, Info[]>();
  const steps: Info[] = [];
  const stepNode = (step: Step, parentId: string, depth: number, canonicalId: string | undefined): Info => ({
    node: { id: step.id, kind: "step", depth, parentId, label: stepPrimaryLabel({ label: step.label, kind: step.kind, departmentId: canonicalId }, step.ordinal).text,
      detail: `${STATUS_TEXT[step.status] ?? step.status}${step.status === "active" ? ` · ${step.percent}%` : ""}${stepFacts(worktree, step)}${step.kindKnown ? "" : " · type not recorded"}`, status: step.status, ...(step.status === "active" ? { percent: step.percent } : {}), ...(step.kindKnown ? {} : { kindUnknown: true as const }) },
  });
  // Recorded steps with neither a canonical phase nor a department: always drawn, in the derived Unclassified region.
  const unclassified: Info[] = worktree.steps.filter(step => !step.phaseKey && !step.departmentId).map(step => stepNode(step, worktree.mission.id, 1, undefined));
  distinguishRepeatedLabels(unclassified, worktree);
  const phaseSteps = new Map<PhaseKey, Info[]>();
  worktree.phases.forEach(phase => {
    if (phase.key === "departments") return;
    const list = phase.stepIds.map(id => worktree.steps.find(x => x.id === id)).filter((x): x is Step => !!x).map(x => stepNode(x, phase.id, 2, undefined));
    distinguishRepeatedLabels(list, worktree);
    phaseSteps.set(phase.key, list);
  });
  const expanded = worktree.departments.find(d => d.id === state.expandedDepartmentId);
  if (expanded) {
    const list = expanded.stepIds.map(id => worktree.steps.find(s => s.id === id)).filter((s): s is Step => !!s).map(step => stepNode(step, expanded.id, 3, expanded.canonicalId));
    distinguishRepeatedLabels(list, worktree);
    stepsOf.set(expanded.id, list); steps.push(...list);
  }
  const visibleIds = new Set<string>([mission.node.id, ...[...phases.values()].map(i => i.node.id), ...departments.map(i => i.node.id), ...steps.map(i => i.node.id), ...unclassified.map(i => i.node.id)]);
  const stepById = new Map(worktree.steps.map(s => [s.id, s]));
  // Graph view collapses a department into the Departments phase node unless that department is expanded.
  const repCollapsed = (stepId: string) => { const s = stepById.get(stepId); if (!s) return undefined; if (visibleIds.has(s.id)) return s.id; if (s.departmentId && s.departmentId === state.expandedDepartmentId) return s.departmentId; return s.phaseId && visibleIds.has(s.phaseId) ? s.phaseId : (s.departmentId && visibleIds.has(s.departmentId) ? s.departmentId : undefined); };
  return { worktree, state, view: state.view, mission, phases, departments, steps, stepsOf, phaseSteps, unclassified, repCollapsed, visibleIds };
}

/** W5.4C: sibling step nodes whose VISIBLE label is identical (a generic recorded label such as "Department") cannot be told apart. For those only, the second line gains the first of the
 *  step's own recorded fields (activity, then error text) that is recorded for every repeated sibling and gives each a different value (already on the step; never invented).
 *  W5.4C-R1: when no recorded field separates ALL of them, the second line leads with the step's existing deterministic position in the mission ("Step 12 · error"): a navigation
 *  identifier, not a task name. Never a timestamp. Nothing changes when the visible labels already differ. */
function distinguishRepeatedLabels(list: Info[], worktree: MissionWorktree): void {
  const key = (text: string) => text.trim().toLowerCase();
  const groups = new Map<string, Info[]>();
  list.forEach(i => groups.set(key(i.node.label), [...(groups.get(key(i.node.label)) ?? []), i]));
  const stepOf = (i: Info) => worktree.steps.find(s => s.id === i.node.id);
  groups.forEach(group => {
    if (group.length < 2) return;
    for (const field of ["activity", "error"] as const) {
      const values = group.map(i => (stepOf(i)?.[field] ?? "").trim());
      if (values.some(v => !v) || new Set(values.map(key)).size < group.length) continue; // only a field that is recorded for, and separates, EVERY repeated sibling
      group.forEach((i, n) => { if (key(values[n]) !== key(i.node.label)) i.node.detail = `${i.node.detail} · ${values[n]}`; });
      return;
    }
    group.forEach(i => { const step = stepOf(i); if (step) i.node.detail = `Step ${step.ordinal} · ${i.node.detail}`; });
  });
}

interface Rect { x: number; y: number; w: number; h: number }
const f = (n: number) => Math.round(n * 10) / 10;

/* ------------------------------------------------------------------ edges & ambiguity (view-aware, relation-preserving) */
function buildEdges(model: Model, rects: Map<string, Rect>, headers: Map<string, number>, mode: MissionLayoutMode, pathFor: (relation: LayoutRelation, from: string, to: string) => string | null): { edges: LayoutEdge[]; dependsOn: Map<string, Set<string>>; ambiguities: Map<string, LayoutAmbiguity["issues"]> } {
  const { worktree } = model;
  const edges: LayoutEdge[] = [];
  const dependsOn = new Map<string, Set<string>>();
  const pick = model.repCollapsed;
  const departmentsPhase = worktree.phases.find(p => p.key === "departments");
  const add = (relation: LayoutRelation, from: string, to: string, extra: Partial<LayoutEdge> = {}, rendering: LayoutEdge["rendering"] = "line") => {
    if (!rects.has(from) || !rects.has(to)) return;
    const id = `${relation}:${from}>${to}`;
    if (edges.some(e => e.id === id)) { const e = edges.find(x => x.id === id)!; if (extra.count) e.count = (e.count ?? 0) + extra.count; return; }
    const d = rendering === "line" ? (pathFor(relation, from, to) ?? "") : "";
    edges.push({ id, relation, from, to, rendering: rendering === "line" && !d ? "implicit" : rendering, d, meaning: RELATION_MEANING[relation], ...extra });
  };
  // ownership: Mission -> each recorded phase (a line)
  worktree.phases.forEach(phase => add("ownership", worktree.mission.id, phase.id, {}, "line"));
  // phase membership: Departments phase contains its departments (via their steps); department membership: department owns its drawn steps
  model.departments.forEach(info => { if (departmentsPhase) add("phase-membership", departmentsPhase.id, info.node.id, {}, "line"); else add("ownership", worktree.mission.id, info.node.id, {}, "implicit"); });
  model.steps.forEach(info => add(worktree.phases.some(p => p.id === info.node.parentId) ? "phase-membership" : "department-membership", info.node.parentId!, info.node.id, {}, "line"));
  // resolved dependencies, aggregated to the coarsest visible representatives
  worktree.relations.filter(r => r.kind === "dependency").forEach(r => {
    const a = pick(r.from), b = pick(r.to);
    if (!a || !b || a === b) return;
    add("dependency", a, b, { count: 1 });
    if (!dependsOn.has(b)) dependsOn.set(b, new Set());
    dependsOn.get(b)!.add(a);
  });
  // ambiguity: a marker with candidate step AND department ids as metadata. NO connection is drawn: the persisted relationship is step -> step and cannot be resolved.
  const ambiguities = new Map<string, LayoutAmbiguity["issues"]>();
  const stepById = new Map(worktree.steps.map(s => [s.id, s]));
  worktree.steps.forEach(step => step.dependencies.issues.forEach(issue => {
    const nodeId = pick(step.id);
    if (!nodeId) return;
    const candidates = issue.candidateStepIds ?? [];
    const candidateDepartmentIds = [...new Set(candidates.map(id => stepById.get(id)?.departmentId).filter((id): id is string => !!id))];
    const list = ambiguities.get(nodeId) ?? [];
    list.push({ stepId: step.id, kind: issue.kind, ...(issue.reference !== undefined ? { reference: issue.reference } : {}), candidateStepIds: candidates, candidateDepartmentIds, detail: issue.detail });
    ambiguities.set(nodeId, list);
  }));
  // Steps in the Unclassified region belong to the Mission only by ownership (expressed by the region, not a line).
  model.unclassified.forEach(info => add("ownership", worktree.mission.id, info.node.id, {}, "implicit"));
  void mode;
  return { edges, dependsOn, ambiguities };
}

function finish(model: Model, mode: MissionLayoutMode, stage: StageBox, rectsList: { id: string; rect: Rect; headerH?: number }[], gaps: LayoutGap[], regions: LayoutRegion[], contentHeight: number, pathFor: (relation: LayoutRelation, from: string, to: string) => string | null): WorktreeLayout {
  const rects = new Map(rectsList.map(r => [r.id, r.rect]));
  const headers = new Map(rectsList.map(r => [r.id, r.headerH ?? 0]));
  const { edges, dependsOn, ambiguities } = buildEdges(model, rects, headers, mode, pathFor);
  const infos = new Map<string, Info>();
  [model.mission, ...model.phases.values(), ...model.departments, ...model.steps, ...model.unclassified].forEach(i => infos.set(i.node.id, i));
  const missionRect = rects.get(model.mission.node.id);
  const facingOf = (r: Rect, kind: LayoutNode["kind"]): LayoutNode["facing"] => { if (!missionRect) return undefined; const dx = missionRect.x + missionRect.w / 2 - (r.x + r.w / 2), dy = missionRect.y + missionRect.h / 2 - (r.y + r.h / 2); if (kind === "department" || kind === "phase" || kind === "step") return "l"; return Math.abs(dx) * r.h >= Math.abs(dy) * r.w ? (dx < 0 ? "r" : "l") : (dy < 0 ? "b" : "t"); };
  const nodes: LayoutNode[] = rectsList.map(({ id, rect, headerH }) => ({ ...infos.get(id)!.node, ...(infos.get(id)!.node.kind === "phase" || infos.get(id)!.node.kind === "department" || infos.get(id)!.node.kind === "step" ? (facingOf(rect, infos.get(id)!.node.kind) ? { facing: facingOf(rect, infos.get(id)!.node.kind) } : {}) : {}), x: f(rect.x), y: f(rect.y), w: f(rect.w), h: f(rect.h), headerH: headerH ?? rect.h, dependsOn: [...(dependsOn.get(id) ?? [])], ambiguousCount: ambiguities.get(id)?.length ?? 0 }));
  const markers: LayoutAmbiguity[] = [...ambiguities.entries()].filter(([id]) => rects.has(id)).map(([nodeId, issues]) => { const r = rects.get(nodeId)!; return { nodeId, x: f(r.x + r.w - 2), y: f(r.y + 2), issues }; });
  return { view: "graph", mode, stage, state: model.state, nodes, gaps, regions, edges, ambiguities: markers, contentHeight: Math.max(stage.height, Math.ceil(contentHeight)) };
}

/** Region for Unclassified recorded steps on a desktop canvas: first free corner (deterministic order), else below the content (the stage scrolls). */
function placeRegion(model: Model, rects: { id: string; rect: Rect; headerH?: number }[], gaps: LayoutGap[], stage: StageBox, contentHeight: number, preferW: number): { region: LayoutRegion | null; contentHeight: number } {
  const list = model.unclassified;
  if (!list.length) return { region: null, contentHeight };
  const rowH = DENSITY.desktop.regionRow, head = 26, inner = 8, gap = 4, margin = 8, pad = 12;
  const w = Math.min(preferW, stage.width - 2 * pad), h = head + inner + list.length * (rowH + gap) - gap + inner;
  const taken: Rect[] = [...rects.map(r => r.rect), ...gaps];
  const clear = (r: Rect) => !taken.some(t => r.x < t.x + t.w + margin && t.x < r.x + r.w + margin && r.y < t.y + t.h + margin && t.y < r.y + r.h + margin);
  const anchors: Rect[] = [{ x: pad, y: stage.height - pad - h, w, h }, { x: pad, y: pad, w, h }, { x: stage.width - pad - w, y: stage.height - pad - h, w, h }, { x: stage.width - pad - w, y: pad, w, h }];
  const spot = anchors.find(r => r.y >= pad && clear(r)) ?? { x: pad, y: Math.max(contentHeight, stage.height) + margin, w, h };
  const region: LayoutRegion = { key: "unclassified-steps", label: "Unclassified recorded steps", caption: "phase and type not recorded", ...spot, stepIds: list.map(i => i.node.id) };
  list.forEach((info, i) => rects.push({ id: info.node.id, rect: { x: spot.x + inner, y: spot.y + head + inner + i * (rowH + gap), w: w - 2 * inner, h: rowH } }));
  return { region, contentHeight: Math.max(contentHeight, spot.y + h + pad) };
}

/* ------------------------------------------------------------------ desktop graph (Control AI composition: core -> phase column -> arc of children) */
/** C1 geometry. Left: the Mission Core slot (the Mission node). Then ONE vertical column of the seven canonical phases in execution order, top to bottom (a phase the record lacks keeps its slot as
 *  a gap marker, so every position is stable whatever was recorded). From the ACTIVE phase (the selected phase, or the phase that holds the selected department / step; the Departments phase when the
 *  Mission itself is selected) a column of its recorded children is laid on a convex arc: the rows sit on a circle centred on that phase's right edge (the fan origin), so the middle rows reach furthest
 *  right and the ends curve back. Only the active phase's immediate children are drawn (its departments, or for every other phase its recorded steps); there is never a third column. Positions are a pure function of the data, the selection and the stage. */
/** Where the ray from a rect's centre toward a point leaves the rect. Spokes run centre to centre, clipped at both boundaries. */
function rayExit(r: Rect, toward: { x: number; y: number }): { x: number; y: number } {
  const c = { x: r.x + r.w / 2, y: r.y + r.h / 2 }, dx = toward.x - c.x, dy = toward.y - c.y;
  if (!dx && !dy) return c;
  const t = Math.min(dx ? r.w / 2 / Math.abs(dx) : Infinity, dy ? r.h / 2 / Math.abs(dy) : Infinity);
  return { x: c.x + dx * t, y: c.y + dy * t };
}
/** The level-1 phase whose children the graph shows. */
export function activePhaseKey(worktree: MissionWorktree, state: ViewState): PhaseKey {
  const id = state.selectedId;
  const phase = id ? worktree.phases.find(p => p.id === id) : undefined;
  if (phase) return phase.key;
  const step = id ? worktree.steps.find(s => s.id === id) : undefined;
  if (step?.phaseKey) return step.phaseKey;
  return "departments"; // the Mission, a department, a step of a department, or nothing selected
}
function layoutGraphDesktop(model: Model, stage: StageBox, mode: MissionLayoutMode, tight: 0 | 1 | 2 = 0): WorktreeLayout {
  const { worktree } = model;
  const pad = 12, compact = mode !== "graph";
  const T = (a: number, b: number, c: number) => (tight === 2 ? a : tight === 1 ? b : c); // narrower node tiers for a yielded stage (Workbench / Intelligence panel)
  // C7F: the seven phase cards have ONE size per stage tier (never per mission), wide / tall enough for a flexible two-line label beside / under the count.
  const sw = T(148, 164, compact ? 168 : 200), ph = T(42, 46, compact ? 46 : 56), dw = T(128, 142, compact ? 190 : 250), dh = T(32, 34, compact ? 36 : 42), g1 = T(26, 34, compact ? 50 : 72);
  const H = stage.height, W = stage.width;
  // C7E.4: the Mission Core is the primary visual anchor: ~29% of the stage height (27% / 28% on the narrower tiers), bounded per tier so it never crowds the phase column (the gap g1 is unchanged) or the panel.
  const coreS = Math.round(Math.max(T(100, 120, compact ? 150 : 190), Math.min(T(124, 150, compact ? 204 : 232), H * T(0.27, 0.28, 0.29))));
  const order = worktree.canonicalPhaseOrder;
  const rects: { id: string; rect: Rect; headerH?: number }[] = [];
  const gaps: LayoutGap[] = [];
  // Level 1: one column, evenly spaced, vertically centred.
  const pitch = Math.min(ph + 22, (H - 2 * pad - ph) / Math.max(1, order.length - 1));
  const colTop = Math.max(pad, (H - (ph + pitch * (order.length - 1))) / 2);
  const slotTop = (i: number) => colTop + i * pitch;
  const activeKey = activePhaseKey(worktree, model.state), activeIndex = Math.max(0, order.indexOf(activeKey));
  const fanY = slotTop(activeIndex) + ph / 2;
  // Level 2: the active phase's recorded children (only the Departments phase has separate child entities), equal pitch, compressed to fit, centred on the fan origin.
  // C5A.1: level 2 is ALWAYS the active phase's real immediate children: its departments (Departments) or its recorded steps (every other phase). Never a third level.
  const children = activeKey === "departments" ? model.departments : (model.phaseSteps.get(activeKey) ?? []);
  if (activeKey !== "departments") model.steps.push(...children);
  const n = children.length;
  const leftBlock = coreS + g1 + sw;
  const available = W - 2 * pad - leftBlock - dw;
  /** C7E.2: the child fan (a pure function of the stage and the row count, never of the selection). The rows span ~56% of the stage height plus the row height (about 62% overall) even when there are few of them (capped so a pair does not
   *  drift apart), sit on a circle centred on the active phase's right edge, and that circle is large enough that the middle rows reach far right while the ends curve strongly back (a semicircular fan).
   *  Many rows keep a minimum pitch (the stage then scrolls rather than overlapping). */
  const fanOf = (count: number, y: number) => {
    if (!count) return { centres: [] as number[], rowH: dh, R: 0, bottom: 0 };
    const minH = DENSITY.desktop.departmentHeadMin, minPitch = minH + 4;
    const target = Math.min(0.56 * H, (count - 1) * 0.32 * H);
    const span = count > 1 ? Math.max(target, (count - 1) * minPitch) : 0;
    const pitch = count > 1 ? span / (count - 1) : 0;
    const rowH = count > 1 ? Math.max(minH, Math.min(dh, Math.floor(pitch - 6))) : dh;
    const top = Math.max(pad + rowH / 2, Math.min(y - span / 2, H - pad - rowH / 2 - span));
    const centres = Array.from({ length: count }, (_, i) => top + i * pitch);
    const ext = Math.max(0, ...centres.map(c => Math.abs(c - y)));
    const R = count > 1 ? Math.max(120, Math.min(available, Math.max(ext / 0.8, 0.12 * W))) : Math.max(70, Math.min(available, 130));
    return { centres, rowH, R, bottom: top + span + rowH / 2 + pad };
  };
  const fan = fanOf(n, fanY), centres = fan.centres, R = fan.R;
  // C7E.5: the chassis (Core -> phase column -> fan origin) is a function of the STAGE only. It is centred once on a fixed fan envelope (the standard fan: rows spanning ~56% of the stage height on the same circle rule as `fanOf`,
  // never fewer than 0.12 of the width), not on this mission's widest fan, so no department / step count, title, selection or status moves the Core, the selector or the phase column. Children grow away from this skeleton.
  const reserve = Math.max(120, Math.min(available, Math.max((0.56 * H) / 2 / 0.8, 0.12 * W)));
  const total = leftBlock + reserve + dw;
  const x0 = pad + Math.max(0, (W - 2 * pad - total) / 2);
  const x1 = x0 + coreS + g1;
  rects.push({ id: model.mission.node.id, rect: { x: x0, y: (H - coreS) / 2, w: coreS, h: coreS } });
  order.forEach((key, i) => {
    const info = model.phases.get(key);
    if (info) rects.push({ id: info.node.id, rect: { x: x1, y: slotTop(i), w: sw, h: ph } });
    else gaps.push({ key, label: gapLabel(key), order: i + 1, x: f(x1), y: f(slotTop(i) + (ph - 40) / 2), w: sw, h: 40, caption: "not recorded" });
  });
  const fanX = x1 + sw;
  children.forEach((info, i) => {
    const dy = centres[i] - fanY;
    rects.push({ id: info.node.id, rect: { x: Math.max(fanX + 24, fanX + Math.sqrt(Math.max(0, R * R - dy * dy))), y: centres[i] - fan.rowH / 2, w: dw, h: fan.rowH } });
  });
  let contentHeight = Math.max(H, Math.ceil(fan.bottom));
  const placed = placeRegion(model, rects, gaps, stage, contentHeight, 210);
  contentHeight = placed.contentHeight;
  const find = (id: string) => rects.find(r => r.id === id)!.rect;
  const mission = rects[0].rect, centre = { x: mission.x + mission.w / 2, y: mission.y + mission.h / 2 };
  const pathFor = (relation: LayoutRelation, from: string, to: string) => {
    const a = find(from), b = find(to);
    const swirl = (factor: number) => {
      const p = rayExit(a, { x: b.x + b.w / 2, y: b.y + b.h / 2 }), q = rayExit(b, { x: a.x + a.w / 2, y: a.y + a.h / 2 });
      const dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy) || 1, o = factor * len;
      return `M${f(p.x)} ${f(p.y)}Q${f((p.x + q.x) / 2 - (dy / len) * o)} ${f((p.y + q.y) / 2 + (dx / len) * o)} ${f(q.x)} ${f(q.y)}`;
    };
    // C3: every conduit leaves ONE shared origin and ends on the target's near edge with horizontal tangents on both ends (smooth S-curves, no swirl): the Mission Core's right edge for the phases,
    // a focal point just beside the active phase card for its children. One line per real relation; nothing is drawn that is not a recorded relationship.
    const sCurve = (p: { x: number; y: number }, q: { x: number; y: number }) => { const c = Math.max(24, (q.x - p.x) * 0.55); return `M${f(p.x)} ${f(p.y)}C${f(p.x + c)} ${f(p.y)} ${f(q.x - c)} ${f(q.y)} ${f(q.x)} ${f(q.y)}`; };
    if (relation === "ownership") return sCurve({ x: a.x + a.w, y: a.y + a.h / 2 }, { x: b.x, y: b.y + b.h / 2 });
    if (relation === "phase-membership" || relation === "department-membership") return sCurve({ x: a.x + a.w + 8, y: a.y + a.h / 2 }, { x: b.x, y: b.y + b.h / 2 });
    void swirl;
    // A cross-link is not hierarchy: it leaves each end along the line between them and bows away from the Mission.
    const p = rayExit(a, { x: b.x + b.w / 2, y: b.y + b.h / 2 }), q = rayExit(b, { x: a.x + a.w / 2, y: a.y + a.h / 2 });
    const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2, ox = mx - centre.x, oy = my - centre.y, len = Math.hypot(ox, oy) || 1, chord = Math.hypot(q.x - p.x, q.y - p.y), k = Math.min(46, chord * 0.22) / len;
    return `M${f(p.x)} ${f(p.y)}Q${f(mx + ox * k)} ${f(my + oy * k)} ${f(q.x)} ${f(q.y)}`;
  };
  return finish(model, mode, stage, rects, gaps, placed.region ? [placed.region] : [], contentHeight, pathFor);
}

const GAP_LABELS: Record<PhaseKey, string> = { "client-brief": "Client Brief", planning: "Planning (HQ)", "live-research": "Live Research", departments: "Departments", "team-review": "Team Review", qa: "QA", "final-plan": "Final Plan" };
const gapLabel = (key: PhaseKey) => GAP_LABELS[key];

/* ------------------------------------------------------------------ stack (phones / small tablets): vertical, never a miniaturized desktop graph */
function layoutStack(model: Model, stage: StageBox, mode: MissionLayoutMode, peek?: PeekReservation): WorktreeLayout {
  const { worktree } = model;
  const D = DENSITY.stack;
  const pad = 10, W = stage.width;
  const rects: { id: string; rect: Rect; headerH?: number }[] = [];
  const gaps: LayoutGap[] = [];
  const regions: LayoutRegion[] = [];
  const indent = 14;
  let y = pad;
  const row = (id: string, depth: number, h: number, extraIndent = 0) => { const x = pad + depth * indent + extraIndent; rects.push({ id, rect: { x, y, w: W - x - pad, h } }); y += h + 6; };
  row(model.mission.node.id, 0, D.mission);
  const departmentsKey: PhaseKey = "departments";
  // The sector is open when the Departments phase, one of its departments (or a step of one) is the subject, or a department is expanded.
  const subject = model.state.selectedId, departmentsId = model.phases.get(departmentsKey)?.node.id;
  const sectorOpen = !!model.state.expandedDepartmentId || (!!subject && (subject === departmentsId || model.departments.some(d => d.node.id === subject)));
  worktree.canonicalPhaseOrder.forEach((key, i) => {
    if (key === departmentsKey && !sectorOpen) {
      // W7 progressive disclosure on a phone: the Departments sector is one phase row (its recorded count and state are on the row) until the user enters it.
      const info = model.phases.get(key);
      if (info) row(info.node.id, 1, D.phase);
      else if (model.departments.length === 0) { gaps.push({ key, label: gapLabel(key), order: i + 1, x: pad + indent, y, w: W - pad * 2 - indent, h: D.gap, caption: "not recorded" }); y += D.gap + 6; }
      return;
    }
    if (key === departmentsKey) {
      const info = model.phases.get(key);
      const groupTop = y;
      if (info) { rects.push({ id: info.node.id, rect: { x: pad + indent, y, w: W - pad * 2 - indent, h: 0 }, headerH: D.groupHeader }); y += D.groupHeader + 6; }
      else if (model.departments.length === 0) { gaps.push({ key, label: gapLabel(key), order: i + 1, x: pad + indent, y, w: W - pad * 2 - indent, h: D.gap, caption: "not recorded" }); y += D.gap + 6; }
      model.departments.forEach(dept => {
        const d = dept.node;
        const x = pad + 2 * indent;
        rects.push({ id: d.id, rect: { x, y, w: W - x - pad, h: D.department } }); y += D.department + 6;
        (model.stepsOf.get(d.id) ?? []).forEach(step => { const sx = x + 16; rects.push({ id: step.node.id, rect: { x: sx, y, w: W - sx - pad, h: D.step } }); y += D.step + 6; });
      });
      if (info) { const r = rects.find(r => r.id === info.node.id)!; r.rect.h = Math.max(D.groupHeader, y - groupTop - 6); }
      return;
    }
    const info = model.phases.get(key);
    if (info) row(info.node.id, 1, D.phase);
    else { gaps.push({ key, label: gapLabel(key), order: i + 1, x: pad + indent, y, w: W - pad * 2 - indent, h: D.gap, caption: "not recorded" }); y += D.gap + 6; }
  });
  // Recorded steps that no phase or department can truthfully contain: one derived region after the phases, every step a full-size row.
  if (model.unclassified.length) {
    const regionTop = y, head = 34;
    y += head;
    model.unclassified.forEach(info => { rects.push({ id: info.node.id, rect: { x: pad + 12, y, w: W - 2 * pad - 24, h: D.regionRow } }); y += D.regionRow + 6; });
    regions.push({ key: "unclassified-steps", label: "Unclassified recorded steps", caption: "phase and type not recorded", x: pad, y: regionTop, w: W - 2 * pad, h: y - regionTop, stepIds: model.unclassified.map(i => i.node.id) });
  }
  // Reserve the Peek sheet directly under the selected row: everything below moves down by its height, containers that hold the row grow by it (no overlay, nothing hidden).
  let peekSlot: WorktreeLayout["peekSlot"];
  const selectedRect = peek ? rects.find(r => r.id === peek.afterId) : undefined;
  if (peek && selectedRect) {
    const anchor = selectedRect.rect.y + (selectedRect.headerH && selectedRect.rect.h > selectedRect.headerH ? selectedRect.headerH : selectedRect.rect.h);
    const shift = peek.height + 12;
    const shiftBox = (b: { y: number; h: number }) => { if (b.y >= anchor - 0.5) b.y += shift; else if (b.y + b.h > anchor + 0.5) b.h += shift; };
    rects.forEach(r => shiftBox(r.rect)); gaps.forEach(g => shiftBox(g)); regions.forEach(g => shiftBox(g));
    y += shift;
    peekSlot = { afterId: peek.afterId, x: selectedRect.rect.x, y: anchor + 6, w: selectedRect.rect.w, h: peek.height };
  }
  const find = (id: string) => rects.find(r => r.id === id)!;
  const pathFor = (relation: LayoutRelation, from: string, to: string) => {
    const A = find(from).rect, B = find(to).rect;
    if (relation === "dependency") return null; // listed as node.dependsOn; the stack draws containment rails only
    const rail = A.x + 6, toY = B.y + B.h / 2;
    return `M${f(rail)} ${f(A.y + Math.min(A.h, find(from).headerH ?? A.h))}L${f(rail)} ${f(toY)}L${f(B.x)} ${f(toY)}`;
  };
  const result = finish(model, mode, stage, rects, gaps, regions, y + pad, pathFor);
  return peekSlot ? { ...result, peekSlot } : result;
}

/* ------------------------------------------------------------------ public */
/** Phones: the Peek sheet is part of the flow, so the layout must know its height to reserve the slot. */
export interface PeekReservation { afterId: string; height: number }
export function layoutWorktree(worktree: MissionWorktree, stage: StageBox, mode: MissionLayoutMode, state: ViewState, peek?: PeekReservation, options?: { tight?: boolean | 1 | 2 }): WorktreeLayout {
  const resolved = resolveViewState(worktree, state);
  const model = buildModel(worktree, resolved);
  if (mode === "stack") return layoutStack(model, stage, mode, peek);
  const tier: 0 | 1 | 2 = options?.tight === true ? 1 : options?.tight === 2 ? 2 : options?.tight === 1 ? 1 : 0;
  return layoutGraphDesktop(model, stage, mode, tier);
}
/** Overlap between nodes where neither contains the other, and between a derived region and any node that is not one of its own steps. Used by tests and the dev view. */
export function findCollisions(layout: WorktreeLayout): [string, string][] {
  const byId = new Map(layout.nodes.map(n => [n.id, n]));
  const isAncestor = (a: LayoutNode, b: LayoutNode) => { for (let p = b.parentId ? byId.get(b.parentId) : undefined, n = 0; p && n < 6; p = p.parentId ? byId.get(p.parentId) : undefined, n++) if (p.id === a.id) return true; return false; };
  const out: [string, string][] = [];
  for (let i = 0; i < layout.nodes.length; i++) for (let j = i + 1; j < layout.nodes.length; j++) {
    const a = layout.nodes[i], b = layout.nodes[j];
    if (isAncestor(a, b) || isAncestor(b, a)) continue;
    if (a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5) out.push([a.id, b.id]);
  }
  for (const region of layout.regions) for (const n of layout.nodes) {
    const inside = region.stepIds.includes(n.id);
    const overlaps = region.x < n.x + n.w - 0.5 && n.x < region.x + region.w - 0.5 && region.y < n.y + n.h - 0.5 && n.y < region.y + region.h - 0.5;
    const contained = n.x >= region.x - 0.5 && n.x + n.w <= region.x + region.w + 0.5 && n.y >= region.y - 0.5 && n.y + n.h <= region.y + region.h + 0.5;
    if (inside ? !contained : overlaps) out.push([n.id, `region:${region.key}`]);
  }
  return out;
}
