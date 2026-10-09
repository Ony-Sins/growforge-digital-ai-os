import type { MissionWorktree, Step } from "./missionWorktree";

/**
 * Ownership ancestry, independent of any layout geometry. This is the chain "who contains this work item", built only from W1 ownership / membership:
 *   ordinary department step   Mission -> Departments phase -> Department -> Step
 *   typed phase (Live Research, Team Review, ...)   Mission -> Phase
 *   step with no phase or department (unknown kind)  Mission -> Step
 *   ambiguity marker           the ancestry of the node that carries it -> the marker
 * A recorded dependency (this step needs that step) is NEVER part of ancestry: navigating along a dependency changes the subject, not the ownership chain.
 */
export const AMBIGUITY_PREFIX = "ambiguity:";
export const ambiguityId = (nodeId: string) => `${AMBIGUITY_PREFIX}${nodeId}`;
export const isAmbiguityId = (id: string) => id.startsWith(AMBIGUITY_PREFIX);
export const ambiguityNodeId = (id: string) => id.slice(AMBIGUITY_PREFIX.length);

/** Steps that make up the work item a node stands for (a phase, a department, or the step itself). */
export function stepsOfNode(worktree: MissionWorktree, nodeId: string): Step[] {
  const phase = worktree.phases.find(p => p.id === nodeId);
  if (phase) return phase.stepIds.map(id => worktree.steps.find(s => s.id === id)).filter((s): s is Step => !!s);
  const department = worktree.departments.find(d => d.id === nodeId);
  if (department) return department.stepIds.map(id => worktree.steps.find(s => s.id === id)).filter((s): s is Step => !!s);
  const step = worktree.steps.find(s => s.id === nodeId);
  return step ? [step] : [];
}

/** Dependency issues (ambiguous / unresolved / ...) recorded by the steps a node stands for. */
export function issuesOfNode(worktree: MissionWorktree, nodeId: string) {
  return stepsOfNode(worktree, nodeId).flatMap(step => step.dependencies.issues.map(issue => ({ stepId: step.id, ...issue })));
}

/** Is this id something the Worktree can select? (An ambiguity id is valid only while its node still carries an issue.) */
export function isKnownEntity(worktree: MissionWorktree, id: string): boolean {
  if (isAmbiguityId(id)) { const nodeId = ambiguityNodeId(id); return nodeId !== worktree.mission.id && isKnownEntity(worktree, nodeId) && issuesOfNode(worktree, nodeId).length > 0; }
  return id === worktree.mission.id || worktree.phases.some(p => p.id === id) || worktree.departments.some(d => d.id === id) || worktree.steps.some(s => s.id === id);
}

export function ownershipAncestry(worktree: MissionWorktree, id: string): string[] {
  const chain: string[] = [worktree.mission.id];
  if (id === worktree.mission.id) return chain;
  if (isAmbiguityId(id)) { const base = ownershipAncestry(worktree, ambiguityNodeId(id)); return base.length ? [...base, id] : []; }
  const phase = worktree.phases.find(p => p.id === id);
  if (phase) return [...chain, phase.id];
  const department = worktree.departments.find(d => d.id === id);
  if (department) { const departments = worktree.phases.find(p => p.key === "departments"); return departments ? [...chain, departments.id, department.id] : [...chain, department.id]; }
  const step = worktree.steps.find(s => s.id === id);
  if (!step) return [];
  const out = [...chain];
  if (step.phaseId) out.push(step.phaseId);
  if (step.departmentId) out.push(step.departmentId);
  out.push(step.id);
  return out;
}

/**
 * The selectable entity that stands for a work item. A typed phase with exactly one step (Live Research, Team Review, QA, ...) IS that step: the phase node
 * is its representation, so a step id resolves to the phase id. A step of the Departments phase, an unclassified step, or a step of a multi-step phase keeps its own id
 * (multi-step phases other than Departments have no step nodes, so they resolve to their phase).
 */
/** What a click / key selects in a given view: in the desktop Graph a non-Departments phase's recorded step IS a drawn row, so it stays itself; everywhere else it resolves as `selectableFor`. */
export function selectableIn(worktree: MissionWorktree, id: string, graphSteps: boolean): string {
  if (graphSteps && worktree.steps.some(s => s.id === id && s.phaseKey && s.phaseKey !== "departments")) return id;
  return selectableFor(worktree, id);
}
export function selectableFor(worktree: MissionWorktree, id: string): string {
  if (isAmbiguityId(id)) return id;
  const step = worktree.steps.find(s => s.id === id);
  if (!step || !step.phaseKey || step.phaseKey === "departments") return id;
  return step.phaseId ?? id;
}
