import crypto from "node:crypto";
import type { Job } from "@/lib/jobStore";
import { canonicalDepartmentId, resolveRuntimeRoute } from "@/lib/departmentTaxonomy";
import { listInstructionExecutions, selectOriginalBundles, type InstructionReplayMode } from "@/lib/instructionSnapshots";

export function originalRerunAvailability(source: Job) {
  try {
    buildRerunJob(source, "original");
    return { available: true, scope: "stored-plan-downstream-stages", reason: null };
  } catch (error) {
    return { available: false, scope: "stored-plan-downstream-stages", reason: error instanceof Error ? error.message : "Original instructions unavailable." };
  }
}

/** Pure record construction. The caller authorizes, persists and dispatches separately. */
export function buildRerunJob(source: Job, mode: InstructionReplayMode): Job {
  if (mode !== "original" && mode !== "current") throw new Error("Select original or current instructions explicitly.");
  if (source.status === "running") throw new Error("Wait for the running job to finish before rerunning.");
  if (mode === "original" && !source.planSnapshot) throw new Error("Original plan checkpoint unavailable.");
  const required = source.steps.flatMap(step => {
    if (["brief", "plan", "research"].includes(step.kind)) return [];
    return [{ stepId: step.id, phase: "draft" }, ...(step.kind === "department" ? [{ stepId: step.id, phase: "tool-gather" }] : [])];
  });
  // Include every captured grounded-research phase; non-model search has no instructions.
  const researchPhases = [...new Set(listInstructionExecutions(source.id).filter(record => record.stepId === "research").map(record => record.phase))];
  required.push(...researchPhases.map(phase => ({ stepId: "research", phase })));
  const originalInstructionBundles = mode === "original" ? selectOriginalBundles(source.id, required) : undefined;
  const timestamp = new Date().toISOString();
  const job: Job = {
    ...structuredClone(source), id: `job-${crypto.randomUUID()}`, identitySchemaVersion: 2, rerunOf: source.id,
    instructionReplayMode: mode, originalInstructionBundles, status: "running", percent: 0, verified: false,
    createdAt: timestamp, updatedAt: timestamp, finishedAt: undefined, finalOutput: undefined,
    media: undefined, error: undefined, approvedAt: undefined, approvedBy: undefined, revisions: [], dossierSnapshot: undefined,
    steps: source.steps.filter(step => mode === "original" || step.kind !== "department").map(step => {
      const reused = step.kind === "brief" || (mode === "original" && step.kind === "plan");
      return { ...step, departmentId: step.departmentId ? canonicalDepartmentId(step.departmentId) : undefined,
        runtimeRouteId: step.runtimeRouteId ?? (step.departmentId ? resolveRuntimeRoute(step.departmentId) : undefined),
        instructionExecutions: undefined, instructionsHash: undefined, provider: undefined, usage: undefined,
        status: reused ? "done" : "pending", percent: reused ? 100 : 0,
        output: reused ? step.output : undefined, media: undefined, sources: undefined, error: undefined, startedAt: undefined, finishedAt: undefined,
      };
    }),
    planSnapshot: mode === "original" ? { ...structuredClone(source.planSnapshot!), assignments: source.planSnapshot!.assignments.map(assignment => ({ ...structuredClone(assignment),
      stepId: assignment.stepId ?? `dept:${assignment.departmentId}`,
      runtimeRouteId: assignment.runtimeRouteId ?? resolveRuntimeRoute(assignment.departmentId),
      departmentId: canonicalDepartmentId(assignment.departmentId),
    })) } : undefined,
  };
  return job;
}
