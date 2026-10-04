import type { CoreJobView, CoreState } from "@/lib/coreState";
import { canonicalizeDepartmentText } from "@/lib/departmentTaxonomy";
import type { DiveObject } from "./overviewModel";
import type { Job } from "@/lib/jobStore";

export function missionObject(job: CoreState["jobs"][number]): DiveObject {
  return { id: job.id, name: canonicalizeDepartmentText(job.title), kind: "mission", status: job.status === "done" ? "Completed" : job.status === "error" ? "Error" : "Active", context: `${job.percent}% recorded progress.`, evidence: "Source: authenticated Core job snapshot." };
}

export function missionLifecycle(job: Job, approvals: MissionApproval[] = []): string {
  if (job.status === "done") return "Completed";
  if (job.status === "error") return "Error";
  if (approvals.some(approval => approval.jobId === job.id && approval.status === "pending")) return "Awaiting Approval · Tool action";
  if (job.steps.some(step => step.kind === "plan" && step.status === "active")) return "Planning";
  return "Active";
}

export function activeMissions(core: CoreState | null): DiveObject[] {
  return (core?.jobs ?? []).filter(job => job.status === "running" && !job.isTest).map(job => ({
    id: job.id, name: canonicalizeDepartmentText(job.title), kind: "mission", status: "Active",
    context: `${job.percent}% recorded progress.`, evidence: "Source: authenticated Core job snapshot.",
  }));
}

/** A requested ID can fall back in the incumbent Core API. Never display that fallback. */
export function selectedMission(snapshot: CoreState, id: string): CoreJobView {
  if (!snapshot.job || snapshot.job.id !== id) throw new Error("Selected mission is unavailable.");
  return snapshot.job;
}

export interface MissionApproval { id: string; jobId: string; stepId: string; toolName: string; status: string }
export function missionApprovals(records: MissionApproval[], id: string): MissionApproval[] {
  return records.filter(record => record.jobId === id).map(({ id, jobId, stepId, toolName, status }) => ({ id, jobId, stepId, toolName, status }));
}

export function missionCost(job: CoreJobView): string {
  if (!job.usage) return "No recorded model usage.";
  // CoreState costUsd is computed by estimateCost, not stored billing evidence.
  return "API cost not recorded. Model cost estimates are not billing receipts.";
}
