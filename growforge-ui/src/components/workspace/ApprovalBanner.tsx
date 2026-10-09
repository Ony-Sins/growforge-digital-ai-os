"use client";

import { useEffect, useState } from "react";
import { Check, ShieldAlert, X } from "lucide-react";
import { useAppState } from "@/lib/appState";
import type { PendingApproval } from "@/lib/approvalStore";
import styles from "./ApprovalBanner.module.css";

/**
 * The human side of the tool loop's approval gate (see tools.ts /
 * orchestrator.ts's waitForApproval) — a department paused mid-task,
 * waiting on a real connector call, shows up here for any signed-in team
 * member to see and an owner to decide. Polls rather than pushes, same as
 * every other live surface in this app (ProjectCanvas, JobNotifier).
 */
export function ApprovalBanner({ isOpen = false, onClose, missionId, onSelectMission }: { isOpen?: boolean; onClose?: () => void; missionId?: string | null; onSelectMission?: (id: string) => void }) {
  const { openJob } = useAppState();
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorById, setErrorById] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/approvals");
        if (!res.ok) throw new Error("Unable to load approvals");
        const data = await res.json();
        if (!Array.isArray(data.approvals)) throw new Error("Invalid approvals response");
        if (!cancelled) {
          setApprovals(missionId ? data.approvals.filter((approval: PendingApproval) => approval.jobId === missionId) : data.approvals);
          setLoadState("ready");
        }
      } catch {
        if (!cancelled) setLoadState("error");
      }
    }

    poll();
    const t = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [isOpen, missionId]);

  async function decide(id: string, decision: "approved" | "denied") {
    setBusyId(id);
    setErrorById((prev) => ({ ...prev, [id]: "" }));
    try {
      const res = await fetch(`/api/approvals/${encodeURIComponent(id)}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorById((prev) => ({ ...prev, [id]: data.error ?? "Couldn't record that decision." }));
        return;
      }
      setApprovals((prev) => prev.filter((a) => a.id !== id));
    } catch {
      setErrorById((prev) => ({ ...prev, [id]: "Could not reach the server. Please retry." }));
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen, onClose]);

  if (!isOpen && (onClose || approvals.length === 0)) return null;

  return (
    <section role="region" aria-label="Approvals" className={`approval-surface ${styles.surface}`}>
      <div className={styles.head}>
        <h2 className={styles.title}>Approvals</h2>
        {isOpen && <button type="button" onClick={onClose} aria-label="Close approvals" className={styles.close}><X className="h-4 w-4" /></button>}
      </div>
      {loadState === "loading" && <p role="status" className={styles.note}>Loading approvals…</p>}
      {loadState === "error" && <p role="alert" className={styles.alert}>Unable to refresh approvals. Retrying automatically; previously loaded items may be out of date.</p>}
      {loadState === "ready" && approvals.length === 0 && <p className={styles.note}>No pending approvals.</p>}
      {approvals.map((a) => (
        <div key={a.id} className={styles.request}>
          <div className={styles.body}>
            <p className={styles.kicker}><ShieldAlert aria-hidden="true" />Approval needed — a real action, on hold</p>
            <button
              type="button"
              onClick={() => onSelectMission ? onSelectMission(a.jobId) : openJob(a.jobId)}
              className={styles.mission}
            >
              {a.jobTitle} → {a.stepLabel}
            </button>
            <p className={styles.payload}>
              {a.toolName}({JSON.stringify(a.args)})
            </p>
            <div className={styles.actions}>
              <button
                type="button"
                disabled={busyId === a.id}
                onClick={() => decide(a.id, "approved")}
                className={styles.action}
              >
                <Check /> Approve
              </button>
              <button
                type="button"
                disabled={busyId === a.id}
                onClick={() => decide(a.id, "denied")}
                className={`${styles.action} ${styles.quiet}`}
              >
                <X /> Deny
              </button>
            </div>
            {errorById[a.id] && <p className={styles.error}>{errorById[a.id]}</p>}
          </div>
        </div>
      ))}
    </section>
  );
}
