import type { MissionWorktree } from "./missionWorktree";
import { ambiguityId, ambiguityNodeId, isAmbiguityId, issuesOfNode, selectableFor } from "./missionWorktreeAncestry";
import { orderDepartments } from "./missionWorktreeLayout";

/**
 * Keyboard navigation of the Worktree. One roving Tab stop; inside it the keys follow the OWNERSHIP hierarchy (Mission > phase > department > step), not screen
 * geometry, so the same keys do the same thing in the Graph:
 *   Up / Down     previous / next sibling (phases in canonical order, departments in canonical order, steps in recorded order); Down from the Mission = first phase
 *   Home / End    first / last sibling
 *   Right         go deeper: Mission -> first phase; Departments phase -> first department; department -> its first step; a node with an unresolved dependency -> that explanation
 *   Left          back toward the ancestor: step -> department, department -> Departments phase, phase -> Mission, explanation -> its node
 *   Enter / Space activate (native button); Escape is handled by the selection reducer (closes the Peek first, then moves up one level).
 * Pure: it names the entity to select; the selection reducer expands departments and the view moves DOM focus.
 */
export type WorktreeNavKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "Home" | "End";
export const WORKTREE_NAV_KEYS: readonly WorktreeNavKey[] = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"];
export const isWorktreeNavKey = (key: string): key is WorktreeNavKey => (WORKTREE_NAV_KEYS as readonly string[]).includes(key);
export const WORKTREE_NAV_HELP = "Keyboard: arrow keys move through the mission, its phases, departments and steps. Right arrow goes deeper, left arrow goes back up. Enter selects. Escape closes the details, then moves up one level.";

/** `graphSteps`: the desktop Graph draws a non-Departments phase's recorded steps as its level-2 rows, so Right goes into them and Left comes back out. Phone passes nothing: unchanged. */
export function navigateWorktree(key: WorktreeNavKey, currentId: string, worktree: MissionWorktree, opts: { graphSteps?: boolean } = {}): string | null {
  const mission = worktree.mission.id;
  const departmentsPhase = worktree.phases.find(p => p.key === "departments");
  const unclassified = worktree.steps.filter(s => !s.phaseKey && !s.departmentId).map(s => s.id);
  const phaseLevel = [...worktree.phases.map(p => p.id), ...unclassified];
  const departments = orderDepartments(worktree.departments).map(d => d.id);
  const clone = (id: string) => selectableFor(worktree, id);
  const current = isAmbiguityId(currentId) ? ambiguityNodeId(currentId) : currentId;
  const stepsOf = (departmentId: string) => worktree.steps.filter(s => s.departmentId === departmentId).map(s => s.id);
  const step = worktree.steps.find(s => s.id === current);
  const siblings = (): string[] => {
    if (current === mission) return [mission];
    if (worktree.phases.some(p => p.id === current) || unclassified.includes(current)) return phaseLevel;
    if (departments.includes(current)) return departments;
    return step?.departmentId ? stepsOf(step.departmentId) : [current];
  };
  const parent = (): string | null => {
    if (isAmbiguityId(currentId)) return current;
    if (current === mission) return null;
    if (departments.includes(current)) return departmentsPhase?.id ?? mission;
    if (step?.departmentId) return step.departmentId;
    if (opts.graphSteps && step?.phaseId && step.phaseKey !== "departments") return step.phaseId;
    return mission;
  };
  const child = (): string | null => {
    if (current === mission) return phaseLevel[0] ?? null;
    if (departmentsPhase && current === departmentsPhase.id) return departments[0] ?? null;
    if (departments.includes(current)) { const first = stepsOf(current)[0]; if (first) return first; }
    if (opts.graphSteps) { const phase = worktree.phases.find(p => p.id === current); const first = phase && phase.key !== "departments" ? phase.stepIds.find(id => worktree.steps.some(s => s.id === id)) : undefined; if (first) return first; }
    const nodeId = clone(current);
    return !isAmbiguityId(currentId) && issuesOfNode(worktree, nodeId).length ? ambiguityId(nodeId) : null;
  };
  if (key === "ArrowRight") return child();
  if (key === "ArrowLeft") return parent();
  if (isAmbiguityId(currentId)) return null;
  if (key === "ArrowDown" && current === mission) return phaseLevel[0] ?? null;
  const list = siblings(), at = list.indexOf(current);
  if (at < 0) return null;
  if (key === "Home") return list[0] === current ? null : list[0];
  if (key === "End") return list[list.length - 1] === current ? null : list[list.length - 1];
  if (key === "ArrowDown") return current === mission ? (phaseLevel[0] ?? null) : (list[at + 1] ?? null);
  // ArrowUp: from the first phase-level item go to the Mission
  return at > 0 ? list[at - 1] : (phaseLevel.includes(current) ? mission : null);
}
