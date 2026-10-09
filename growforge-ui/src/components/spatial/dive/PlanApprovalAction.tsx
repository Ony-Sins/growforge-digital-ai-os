"use client";

/**
 * "Approve final plan" in the Mission Workbench's Approvals section (C1b.1). A thin surface over the existing `POST /api/jobs/:id/approve`; the server is the only authority (owner-only,
 * final plan required, public preview refused), the client rule is a UX offer. It never renders unless the mission is eligible (owner, a recorded final plan, not yet approved), never
 * claims approval itself (the recorded state is shown by the section from `approvedAt` / `approvedBy` once the canonical data is re-read), shows the server's own error, and cannot be
 * submitted twice (a synchronous single-flight lock plus a disabled control).
 */
import { useEffect, useMemo, useState } from "react";
import { useAppState } from "@/lib/appState";
import type { MissionWorktree } from "./missionWorktree";
import { approvePlan, planApprovalOf, planApprovalOffered, singleFlight } from "./missionWorktreePlanApproval";
import styles from "./PlanApprovalAction.module.css";

export function PlanApprovalAction({ worktree, onApproved, onActive }: { worktree: MissionWorktree; /** Re-read the canonical Worktree data now (not on the next poll). */ onApproved: () => void; /** C8 / S2: true while an approval is being confirmed or saved (a host that can be closed asks before discarding it). */ onActive?: (active: boolean) => void }) {
  const { role } = useAppState();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const jobId = worktree.missionId;
  const active = confirming || busy;
  useEffect(() => { onActive?.(active); return () => onActive?.(false); }, [active, onActive]);
  const submit = useMemo(() => singleFlight(async () => {
    setBusy(true); setError(null);
    const result = await approvePlan(jobId);
    if (result.ok) { setSubmitted(true); setConfirming(false); onApproved(); } else setError(result.error);
    setBusy(false);
    return result;
  }), [jobId, onApproved]);
  // Offered only to an eligible viewer; after a success the control stays gone until the re-read shows the recorded approval (so a stale view can never submit a second approval).
  if (planApprovalOf(worktree).approved) return null; // the recorded approval (shown by the section) replaces this control
  if (!submitted && !planApprovalOffered(worktree, role)) return null;
  if (submitted) return <div className={styles.root}><p role="status" className={styles.note}>Approval sent. Reading the recorded state…</p></div>;
  return <div className={styles.root} data-plan-approval>
    {!confirming
      ? <button className={styles.action} onClick={() => { setConfirming(true); setError(null); }}><span>Approve final plan</span></button>
      : <form onSubmit={event => { event.preventDefault(); void submit(); }} aria-label="Confirm plan approval">
        <p className={styles.note}>Approve the recorded final plan? This records owner approval and does not execute external tools.</p>
        <div className={styles.row}>
          <button className={styles.action} type="submit" disabled={busy}><span>{busy ? "Saving…" : "Approve final plan"}</span></button>
          <button className={styles.quiet} type="button" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
        </div>
      </form>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </div>;
}
