import type { MissionWorktree } from "./missionWorktree";

/**
 * The in-mission entry point to TOOL approval requests (C1b / cutover). Tool approvals are decided in the existing global approvals banner (`ApprovalBanner`, owned by `SpatialHud`), which
 * opens when it hears `growforge:mission-approvals` with a mission id (the same event the previous Missions presentation sent). This module only counts what the mission records and names the
 * event; it renders no decision UI, keeps no approval state and changes no permission: the banner and the server decide who may decide.
 */
export const MISSION_APPROVALS_EVENT = "growforge:mission-approvals";

/** Pending tool approval requests recorded for this mission; `null` when the approvals could not be read (never reported as zero). */
export function pendingToolApprovals(worktree: MissionWorktree): number | null {
  return worktree.approvals ? worktree.approvals.filter(approval => approval.status === "pending").length : null;
}

export function openToolApprovals(missionId: string): void {
  window.dispatchEvent(new CustomEvent(MISSION_APPROVALS_EVENT, { detail: missionId }));
}
