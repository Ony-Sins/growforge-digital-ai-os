import type { MissionWorktree, Step } from "./missionWorktree";
import { isAmbiguityId } from "./missionWorktreeAncestry";
import { stepPrimaryLabel } from "./missionStepModel";

/** Truthful labels for Worktree entities. Extracted from the selection module (W6.1) so the content model and the Focus rules can use them without an import cycle. Pure. */
/** The label and WHERE it came from (the recorded label, the canonical wording of the recorded kind, or the recorded position), for surfaces that must not mistake generic kind wording for a name. */
export function stepLabelOf(worktree: MissionWorktree, step: Step): { text: string; source: "recorded-label" | "kind" | "position" } {
  const department = step.departmentId ? worktree.departments.find(d => d.id === step.departmentId) : undefined;
  return stepPrimaryLabel({ label: step.label, kind: step.kind, departmentId: department?.canonicalId }, step.ordinal);
}
export function stepDisplayLabel(worktree: MissionWorktree, step: Step): string {
  // C5D: ONE canonical label for an entity everywhere (graph row, panel, Workbench, Peek): the recorded label, else the canonical wording of its recorded kind (the same text the graph row shows).
  // Only a step with neither a usable label nor a recognised kind falls back to its recorded position, "Step N" (no invented task name).
  return stepLabelOf(worktree, step).text;
}
export interface ThreadSegment { id: string; label: string; kind: "mission" | "phase" | "department" | "step" | "ambiguity" }
export function entityLabel(worktree: MissionWorktree, id: string): ThreadSegment | null {
  if (id === worktree.mission.id) return { id, label: worktree.mission.title, kind: "mission" };
  if (isAmbiguityId(id)) return { id, label: "Unresolved dependency", kind: "ambiguity" };
  const phase = worktree.phases.find(p => p.id === id); if (phase) return { id, label: phase.label, kind: "phase" };
  const department = worktree.departments.find(d => d.id === id); if (department) return { id, label: department.name, kind: "department" };
  const step = worktree.steps.find(s => s.id === id); return step ? { id, label: stepDisplayLabel(worktree, step), kind: "step" } : null;
}
