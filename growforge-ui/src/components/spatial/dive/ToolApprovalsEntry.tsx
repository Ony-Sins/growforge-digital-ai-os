"use client";

/**
 * "Review tool approval requests" in the Mission Workbench's Approvals section: the in-mission entry to the EXISTING approvals banner (it does not decide anything and is not a second approval
 * UI). Shown only while the mission records pending tool approval requests; the banner and the server keep deciding who may approve or reject them.
 */
import type { MissionWorktree } from "./missionWorktree";
import { openToolApprovals, pendingToolApprovals } from "./missionWorktreeApprovalsEntry";
import styles from "./PlanApprovalAction.module.css";

export function ToolApprovalsEntry({ worktree }: { worktree: MissionWorktree }) {
  const pending = pendingToolApprovals(worktree);
  if (!pending) return null;
  return <div className={styles.root} data-tool-approvals-entry>
    <p className={styles.note}>{pending === 1 ? "1 tool approval request is waiting for a decision." : `${pending} tool approval requests are waiting for a decision.`} Opening them does not approve or run anything.</p>
    <button className={styles.action} onClick={() => openToolApprovals(worktree.missionId)}><span>Review tool approval requests</span></button>
  </div>;
}
