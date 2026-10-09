import type { CoreStepView } from "@/lib/coreState";
import { canonicalDepartmentId, canonicalizeDepartmentText, departmentDisplayName, departmentScopeLabel } from "@/lib/departmentTaxonomy";

/**
 * Department -> steps. A step belongs to a department only when its recorded `departmentId` resolves (same resolver as
 * coreState and the department layer) to that canonical department. Every field here is a recorded value or a pure
 * restatement of one: no agents, tools, workflows, deliverables, providers, models, timestamps or dependencies.
 */
export type StepStatus = CoreStepView["status"];
export const STEP_STATUS_LABELS: Record<StepStatus, string> = { pending: "Pending", active: "Active", done: "Done", error: "Error", skipped: "Skipped" };

/**
 * Canonical wording for each RECORDED step kind (jobStore.StepKind: the pipeline stages brief -> plan -> research -> departments ->
 * team review -> QA -> final plan). The wording only restates the recorded kind; it never infers a task from a department or a sequence.
 */
export const STEP_KIND_LABELS: Record<string, string> = {
  brief: "Client brief", plan: "Planning", research: "Research", department: "Department", reconcile: "Team review", qa: "QA", final: "Final plan",
};
export type StepLabelSource = "recorded-label" | "kind" | "position";

/**
 * Primary visible label for a step, strongest real signal first:
 *  1. the recorded step label (canonicalized) when it says something beyond restating the department it belongs to;
 *  2. otherwise the canonical wording of the recorded step kind;
 *  3. otherwise (no usable label and an unrecognised/missing kind) the recorded position, "Step N".
 */
export function stepPrimaryLabel(step: Pick<CoreStepView, "label" | "kind" | "departmentId">, ordinal: number): { text: string; source: StepLabelSource } {
  const recorded = canonicalizeDepartmentText(typeof step.label === "string" ? step.label : "").trim();
  const departmentId = step.departmentId ? canonicalDepartmentId(step.departmentId) : null;
  // The Core projection names stage-owner steps after their oversight owner ("Executive Orchestration" for planning/team review/final, the QA owner for QA).
  // That names who owns the stage, not the stage, so it is treated like restating a department and the recorded kind's wording is used instead.
  const owners = [departmentDisplayName("hq"), departmentDisplayName("qa")];
  const restatesDepartment = !recorded || owners.some(name => name.trim().toLowerCase() === recorded.toLowerCase())
    || (departmentId !== null && [departmentDisplayName(departmentId), departmentScopeLabel(step.departmentId ?? departmentId)].some(name => name.trim().toLowerCase() === recorded.toLowerCase()));
  if (!restatesDepartment) return { text: recorded, source: "recorded-label" };
  const kind = typeof step.kind === "string" ? STEP_KIND_LABELS[step.kind] : undefined;
  if (kind) return { text: kind, source: "kind" };
  return { text: `Step ${ordinal}`, source: "position" };
}
