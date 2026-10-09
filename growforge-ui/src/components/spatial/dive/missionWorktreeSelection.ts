import type { MissionWorktree } from "./missionWorktree";
import { ambiguityId, ambiguityNodeId, isAmbiguityId, isKnownEntity, issuesOfNode, ownershipAncestry, selectableFor, selectableIn } from "./missionWorktreeAncestry";
import { entityLabel, type ThreadSegment } from "./missionWorktreeLabels";
import type { WorktreeView } from "./missionWorktreeLayout";
import { hasSection, settleSection, workbenchCapabilities, workbenchSectionLabel, type InspectionDepth, type WorkbenchSectionId } from "./missionWorkbench";
import { focusAvailability, focusableSections } from "./missionWorktreeFocus";

/**
 * The ONE canonical selection of the Missions Worktree (W4). Identity is a W1 entity id (or an ambiguity id for an unresolved-dependency marker); a label or an
 * ordinal is never an identity. The header's Context Thread, NORA's context, the ancestry highlight, the W3 conduit path and the Peek are all derived from this
 * single state; nothing keeps a second selection. Pure: components dispatch, this decides.
 */
export interface WorktreeSelection {
  view: WorktreeView;
  /** The selected entity (mission at rest). */
  selectedId: string | null;
  /** The department whose steps are drawn. Independent of selection: collapsing a branch never discards the user's context. */
  expandedDepartmentId: string | null;
  /** The Peek plane is shown for the selection. Escape closes it first; the selection itself stays. */
  peekOpen: boolean;
  /** The latest selection / keyboard-focus event (drives the one-shot W3 packet). `view` pins it to the layout it happened in, so switching layouts never replays it. */
  pulse: { subject: string | null; serial: number; view: WorktreeView } | null;
  /** Ownership ancestry captured at selection time: lets a stale selection fall back to its nearest valid ancestor after a data refresh. */
  trail: string[];
  /**
   * Inspection depth of the SAME selected entity: `peek` -> `workbench` (W5.1) -> `focus` (W6.1). Only meaningful while `peekOpen`; neither the Workbench nor Focus ever has its
   * own entity, view or NORA selection. 
   */
  depth: InspectionDepth;
  /** The active Workbench section for `selectedId`. Always a section the selected entity really has (derived by the reducer on every entity change). */
  section: WorkbenchSectionId;
  /** Transient, per-entity memory of the sections the user chose in this inspection session. Never persisted. */
  sectionMemory: Readonly<Record<string, WorkbenchSectionId>>;
  /**
   * W6.1: where the Workbench was when Focus was opened (entity, section, the section panel's scrollTop reported by the surface). Kept while Focus is open and after returning, so the
   * Workbench reappears exactly there; `serial` lets the surface restore it once. Dropped as soon as the Workbench closes, its section changes or the entity changes. State only: scroll is
   * the surface's to measure and apply.
   */
  resume: FocusResume | null;
}
export interface FocusResume { entityId: string; section: WorkbenchSectionId; scrollTop: number; serial: number }

export type SelectionAction =
  | { type: "select"; id: string }
  | { type: "toggleExpand"; departmentId: string }
  | { type: "pulse"; subject: string }
  | { type: "escape" }
  | { type: "reconcile" }
  | { type: "openWorkbench" }
  | { type: "closeWorkbench" }
  | { type: "setSection"; section: WorkbenchSectionId }
  /** Workbench -> Focus for the CURRENT selection and section, only when that section has long content worth reading (`scrollTop` = the section panel's scroll position now). */
  | { type: "openFocus"; scrollTop?: number }
  /** Focus -> Workbench: same entity, same section, resume kept. */
  | { type: "closeFocus" }
  /** Focus navigation: the ONLY way another entity becomes the selection while Focus is open. Background graph clicks / keys / expanders do nothing in Focus. */
  | { type: "focusNavigate"; id: string };

export function initialSelection(worktree: MissionWorktree | null, view: WorktreeView): WorktreeSelection {
  return { view, selectedId: worktree ? worktree.mission.id : null, expandedDepartmentId: null, peekOpen: false, pulse: null, trail: worktree ? [worktree.mission.id] : [], depth: "peek", section: "overview", sectionMemory: {}, resume: null };
}

const bump = (state: WorktreeSelection, subject: string): WorktreeSelection["pulse"] => ({ subject, serial: (state.pulse?.serial ?? 0) + 1, view: state.view });

/**
 * Depth + section bookkeeping after any transition: the Workbench follows the canonical selection (it stays open when another entity is selected), the active
 * section is re-derived for the (possibly new) entity (remembered choice for it, else the carried section if it has one, else its default) and a selection that
 * cannot support inspection leaves the Workbench. Closing the Peek always leaves the Workbench.
 */
function settle(previous: WorktreeSelection, next: WorktreeSelection, worktree: MissionWorktree): WorktreeSelection {
  const set = workbenchCapabilities(worktree, next.selectedId);
  const section = settleSection(set, next.sectionMemory, next.selectedId === previous.selectedId ? next.section : previous.section);
  let depth: InspectionDepth = (next.depth === "workbench" || next.depth === "focus") && next.peekOpen && set ? next.depth : "peek";
  // Focus never outlives its content: if the section no longer has long content (a data refresh, a reconcile), the Workbench is what remains.
  const dropped = depth === "focus" && !(next.selectedId && focusAvailability(worktree, next.selectedId, section).available);
  if (dropped) depth = "workbench";
  // The resume record is only valid for the entity + section it was captured for, only while an inspection depth is open, and not for content that has since changed under it.
  const resume = !dropped && next.resume && depth !== "peek" && next.resume.entityId === next.selectedId && next.resume.section === section ? next.resume : null;
  return depth === next.depth && section === next.section && resume === next.resume ? next : { ...next, depth, section, resume };
}

export function reduceSelection(state: WorktreeSelection, action: SelectionAction, worktree: MissionWorktree | null): WorktreeSelection {
  if (!worktree) return state;
  const next = reduceCore(state, action, worktree);
  // A reconcile follows a data refresh: even when the selection is still known, the section's content may have changed, so depth is always re-settled (Focus never outlives its content).
  return next === state && action.type !== "reconcile" ? state : settle(state, next, worktree);
}

function reduceCore(state: WorktreeSelection, action: SelectionAction, worktree: MissionWorktree): WorktreeSelection {
  // While Focus is open the background is inert: a graph click, a keyboard move, an expander, a section marker, a pulse or another Workbench action must not retarget or replay anything.
  // Only Focus's own navigation (focusNavigate), Back / Esc, a layout switch (which preserves Focus) and a data reconcile act.
  if (state.depth === "focus" && state.peekOpen && (action.type === "select" || action.type === "toggleExpand" || action.type === "pulse" || action.type === "openWorkbench" || action.type === "closeWorkbench" || action.type === "setSection" || action.type === "openFocus")) return state;
  switch (action.type) {
    case "select": {
      // C5A.1: the desktop-class Graph draws a non-Departments phase's recorded steps as its level-2 rows, so there a step IS selectable; every other view keeps resolving it to its phase.
      const id = selectableIn(worktree, action.id, true);
      if (!isKnownEntity(worktree, id)) return state;
      const department = worktree.departments.find(d => d.id === id);
      const step = worktree.steps.find(s => s.id === id);
      // Selecting a department expands it and keeps it expanded (never a surprise collapse); selecting a step reveals its department.
      const expandedDepartmentId = department ? department.id : step?.departmentId ?? state.expandedDepartmentId;
      return { ...state, selectedId: id, expandedDepartmentId, peekOpen: true, pulse: bump(state, id), trail: ownershipAncestry(worktree, id) };
    }
    case "toggleExpand": {
      const department = worktree.departments.find(d => d.id === action.departmentId);
      if (!department) return state;
      if (state.expandedDepartmentId !== department.id) return { ...state, expandedDepartmentId: department.id };
      // Collapsing hides the department's steps: a selected step falls back to the department (its nearest still-drawn ancestor), never to something unrelated.
      const selectedStep = state.selectedId ? worktree.steps.find(s => s.id === state.selectedId) : undefined;
      const lost = selectedStep?.departmentId === department.id;
      return { ...state, expandedDepartmentId: null, ...(lost ? { selectedId: department.id, trail: ownershipAncestry(worktree, department.id) } : {}) };
    }
    // A layout switch is not a selection event: the pulse is cleared so neither this layout nor the one we return to ever replays the packet.
    case "pulse": return isKnownEntity(worktree, action.subject) ? { ...state, pulse: bump(state, selectableFor(worktree, action.subject)) } : state;
    // Peek -> Workbench for the CURRENT selection; the entity is never changed here.
    case "openWorkbench": return state.peekOpen && state.depth === "peek" && workbenchCapabilities(worktree, state.selectedId) ? { ...state, depth: "workbench" } : state;
    case "closeWorkbench": return state.depth === "workbench" ? { ...state, depth: "peek" } : state;
    case "openFocus": {
      if (!state.peekOpen || state.depth !== "workbench" || !state.selectedId || !focusAvailability(worktree, state.selectedId, state.section).available) return state;
      const scrollTop = Number.isFinite(action.scrollTop) ? Math.max(0, Math.round(action.scrollTop as number)) : 0;
      return { ...state, depth: "focus", resume: { entityId: state.selectedId, section: state.section, scrollTop, serial: (state.resume?.serial ?? 0) + 1 } };
    }
    case "closeFocus": return state.depth === "focus" ? { ...state, depth: "workbench" } : state;
    case "focusNavigate": {
      if (state.depth !== "focus" || !state.peekOpen) return state;
      const id = selectableFor(worktree, action.id);
      if (!isKnownEntity(worktree, id)) return state;
      const readable = focusableSections(worktree, id);
      const pick = [state.sectionMemory[id], state.section].find((s): s is WorkbenchSectionId => !!s && readable.includes(s)) ?? readable[0];
      if (id === state.selectedId && pick === state.section) return state;
      const department = worktree.departments.find(d => d.id === id), step = worktree.steps.find(s => s.id === id);
      // Same bookkeeping as a selection (expansion, ownership trail) but NO pulse: navigating inside Focus never replays a conduit packet.
      const moved = { ...state, selectedId: id, expandedDepartmentId: department ? department.id : step?.departmentId ?? state.expandedDepartmentId, trail: ownershipAncestry(worktree, id), resume: null };
      // An entity with nothing worth reading never becomes an empty Focus: the user lands in its Workbench instead.
      return pick ? { ...moved, section: pick, sectionMemory: { ...state.sectionMemory, [id]: pick } } : { ...moved, depth: "workbench" as const };
    }
    case "setSection": {
      if (state.depth !== "workbench" || !hasSection(workbenchCapabilities(worktree, state.selectedId), action.section) || !state.selectedId) return state;
      return { ...state, section: action.section, sectionMemory: { ...state.sectionMemory, [state.selectedId]: action.section } };
    }
    case "escape": {
      // Focus -> Workbench -> Peek (same entity throughout); then the approved W4 behaviour: close the Peek, then climb one level.
      if (state.depth === "focus") return { ...state, depth: "workbench" };
      if (state.depth === "workbench") return { ...state, depth: "peek" };
      if (state.peekOpen) return { ...state, peekOpen: false };
      const parent = state.trail.length > 1 ? state.trail[state.trail.length - 2] : null;
      return parent && isKnownEntity(worktree, parent) ? { ...state, selectedId: parent, trail: state.trail.slice(0, -1) } : state;
    }
    case "reconcile": {
      const selectedKnown = !state.selectedId || isKnownEntity(worktree, state.selectedId);
      const expandedKnown = !state.expandedDepartmentId || worktree.departments.some(d => d.id === state.expandedDepartmentId);
      if (selectedKnown && expandedKnown) return state;
      let selectedId = state.selectedId, trail = state.trail;
      if (!selectedKnown) {
        // Nearest valid ancestor, walking up the trail captured when the entity was selected; the Mission always exists.
        const ancestor = [...state.trail].reverse().find(id => id !== state.selectedId && isKnownEntity(worktree, id));
        selectedId = ancestor ?? worktree.mission.id;
        trail = ownershipAncestry(worktree, selectedId);
      }
      return { ...state, selectedId, trail, expandedDepartmentId: expandedKnown ? state.expandedDepartmentId : null };
    }
  }
}

/* ------------------------------------------------------------------ truthful labels, the Context Thread and NORA's context (all derived from the selection) */
export { entityLabel, stepDisplayLabel, type ThreadSegment } from "./missionWorktreeLabels";
/** The chain shown in the header and sent to NORA: Mission / [Departments] / Department / Step, from the same ancestry the conduits light. */
export function contextThread(worktree: MissionWorktree, selectedId: string | null): ThreadSegment[] {
  const chain = ownershipAncestry(worktree, selectedId ?? worktree.mission.id);
  return (chain.length ? chain : [worktree.mission.id]).map(id => entityLabel(worktree, id)).filter((s): s is ThreadSegment => !!s);
}

export interface NoraWorktreeContext {
  /** growforge:mission-context payload (existing contract: id, title, context JSON string). */
  mission: { id: string; title: string; context: string };
  /** DIVE_DETAIL_EVENT payload: what is selected inside the Mission; null at mission level. */
  detail: { type: string; id: string; label: string } | null;
}
/** Workbench / Focus depth as part of NORA's context ("Mission / Live Research / Sources"). Present only while the Workbench or Focus is open (Focus keeps the same path and section, depth "focus"); the entity selection stays the source of truth. */
export function inspectionOf(worktree: MissionWorktree, selection: Pick<WorktreeSelection, "selectedId" | "peekOpen" | "depth" | "section">): { depth: "workbench" | "focus"; section: { id: WorkbenchSectionId; label: string }; path: string[] } | null {
  if (!selection.peekOpen || (selection.depth !== "workbench" && selection.depth !== "focus")) return null;
  const path = contextThread(worktree, selection.selectedId).map(s => s.label);
  return { depth: selection.depth, section: { id: selection.section, label: workbenchSectionLabel(selection.section) }, path: [...path, workbenchSectionLabel(selection.section)] };
}
export function noraContextFor(worktree: MissionWorktree, selectedId: string | null, facts: { label: string; value: string }[], inspection?: ReturnType<typeof inspectionOf>): NoraWorktreeContext {
  const thread = contextThread(worktree, selectedId);
  const tail = thread[thread.length - 1];
  const below = thread.slice(1);
  const level = tail?.kind ?? "mission";
  const context = JSON.stringify({
    missionId: worktree.mission.id.replace(/^mission:/, ""), title: worktree.mission.title, status: worktree.mission.status,
    navigation: { level, path: thread.map(s => s.label), entityId: selectedId, facts: facts.map(f => ({ [f.label]: f.value })), liveEvidence: worktree.mission.execution.liveEvidence, ...(inspection ? { inspection } : {}) },
    note: "Recorded facts only, taken from the Mission Worktree. Ownership: Mission > phase > department > step. A dependency between steps is a separate relationship; one that names a step id shared by several steps is reported as unresolved and never guessed.",
  });
  return { mission: { id: worktree.missionId, title: worktree.mission.title, context }, detail: below.length ? { type: level, id: tail.id, label: below.map(s => s.label).join(" / ") } : null };
}
export { ambiguityId, ambiguityNodeId, isAmbiguityId, issuesOfNode };
