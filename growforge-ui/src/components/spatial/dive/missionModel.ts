import type { CoreState } from "@/lib/coreState";
import { canonicalizeDepartmentText } from "@/lib/departmentTaxonomy";
import type { DiveObject } from "./overviewModel";
import type { Job } from "@/lib/jobStore";

export function missionObject(job: CoreState["jobs"][number]): DiveObject {
  return { id: job.id, name: canonicalizeDepartmentText(job.title), kind: "mission", status: job.status === "done" ? "Completed" : job.status === "error" ? "Error" : "Active", context: `${job.percent}% recorded progress.`, evidence: "Source: authenticated Core job snapshot." };
}

export function activeMissions(core: CoreState | null): DiveObject[] {
  return (core?.jobs ?? []).filter(job => job.status === "running" && !job.isTest).map(job => ({
    id: job.id, name: canonicalizeDepartmentText(job.title), kind: "mission", status: "Active",
    context: `${job.percent}% recorded progress.`, evidence: "Source: authenticated Core job snapshot.",
  }));
}

/**
 * Whether the viewer is OFFERED plan approval (UX only; the server stays the authority: owner only, a final plan required). Approve: an owner viewing a recorded final plan that has not been
 * approved yet. Request-a-change has its own rule in `missionWorktreeRevision` (it needs the authenticated viewer, not just the role).
 */
export function missionActionAvailability(input: { role: string; record: Pick<Job, "finalOutput" | "approvedAt"> | null }): { approve: boolean } {
  const { role, record } = input;
  return { approve: Boolean(record) && role === "owner" && Boolean(record?.finalOutput) && !record?.approvedAt };
}
