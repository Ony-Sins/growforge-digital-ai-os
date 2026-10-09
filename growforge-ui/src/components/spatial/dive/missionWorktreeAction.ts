import type { MissionWorktree } from "./missionWorktree";
import { workbenchCapabilities, type WorkbenchSectionId } from "./missionWorkbench";
import type { SelectionAction, WorktreeSelection } from "./missionWorktreeSelection";

/**
 * Semantic mission actions (`growforge:mission-action`): how NORA (or voice, later) addresses the selected mission by id instead of by DOM text or simulated clicks. This is the ONE translation
 * from that contract to the canonical Worktree selection (`missionWorktreeSelection`): an action becomes a short list of the SAME `SelectionAction`s a click or a key would dispatch, so there
 * is no second selection model and no hidden state. An action can only land on something that really exists in the selected mission; anything else returns null and nothing changes.
 *
 * Ids differ between the contract and the Worktree, so the translation is explicit:
 *  - department `id`   = the canonical department id (what `Department.canonicalId` records). A full Worktree department entity id is accepted too.
 *  - step `ordinal`    = the 1-based position in the recorded steps (what `Step.ordinal` records).
 *  - inspect `category`= one of the legacy deep-inspection category names, mapped to the MISSION's Workbench section that now holds that reading (CATEGORY_SECTION). A category with no
 *                        mission-level home (e.g. "Dependencies", "Agents", "Quality") is rejected rather than approximated. "History" is deliberately not mapped (no History UI).
 */
export const MISSION_ACTION_EVENT = "growforge:mission-action";

export type MissionAction =
  | { kind: "mission"; /** true = also collapse the expanded department (full reset). */ reset?: boolean }
  | { kind: "department"; id: string }
  | { kind: "step"; ordinal: number }
  | { kind: "inspect"; category: string };

/** Parses an untrusted event detail into an action (never throws). */
export function parseMissionAction(detail: unknown): MissionAction | null {
  if (!detail || typeof detail !== "object") return null;
  const d = detail as Record<string, unknown>;
  if (d.kind === "mission") return { kind: "mission", reset: d.reset === true };
  if (d.kind === "department" && typeof d.id === "string" && d.id) return { kind: "department", id: d.id };
  if (d.kind === "step" && typeof d.ordinal === "number" && Number.isInteger(d.ordinal)) return { kind: "step", ordinal: d.ordinal };
  if (d.kind === "inspect" && typeof d.category === "string" && d.category) return { kind: "inspect", category: d.category };
  return null;
}

/** Legacy deep-inspection category -> the mission-level Workbench section that holds that reading now (null = no home; rejected). */
export const CATEGORY_SECTION: Readonly<Record<string, WorkbenchSectionId | null>> = {
  Identity: "overview", Context: "overview", "Next steps": "overview",
  Steps: "execution", Telemetry: "execution",
  Outputs: "output", Files: "output",
  Cost: "usage",
  Tools: "approvals", Approvals: "approvals",
  History: null, Dependencies: null, Agents: null, Evidence: null, Quality: null,
};

/**
 * The canonical selection actions for an action, or null when it names something that does not exist here. `selection` is only read (to leave Focus first and to collapse on reset).
 */
export function missionActionPlan(action: MissionAction, worktree: MissionWorktree, selection: WorktreeSelection): SelectionAction[] | null {
  const leaveFocus: SelectionAction[] = selection.depth === "focus" ? [{ type: "closeFocus" }] : [];
  const missionId = worktree.mission.id;
  switch (action.kind) {
    case "mission": {
      const collapse: SelectionAction[] = action.reset && selection.expandedDepartmentId ? [{ type: "toggleExpand", departmentId: selection.expandedDepartmentId }] : [];
      // Collapse first (it may reselect the department), then land on the mission.
      return [...leaveFocus, ...collapse, { type: "select", id: missionId }];
    }
    case "department": {
      const department = worktree.departments.find(d => d.canonicalId === action.id || d.id === action.id);
      return department ? [...leaveFocus, { type: "select", id: department.id }] : null;
    }
    case "step": {
      const step = worktree.steps.find(s => s.ordinal === action.ordinal);
      return step ? [...leaveFocus, { type: "select", id: step.id }] : null;
    }
    case "inspect": {
      const section = Object.hasOwn(CATEGORY_SECTION, action.category) ? CATEGORY_SECTION[action.category] : null;
      if (!section) return null;
      const offered = workbenchCapabilities(worktree, missionId)?.sections.some(s => s.id === section);
      return offered ? [...leaveFocus, { type: "select", id: missionId }, { type: "openWorkbench" }, { type: "setSection", section }] : null;
    }
  }
}
