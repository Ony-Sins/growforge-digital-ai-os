"use client";

import { useEffect, useState } from "react";
import { Check, ShieldAlert, X } from "lucide-react";
import { useAppState } from "@/lib/appState";
import type { PendingApproval } from "@/lib/approvalStore";

/**
 * The human side of the tool loop's approval gate (see tools.ts /
 * orchestrator.ts's waitForApproval) — a department paused mid-task,
 * waiting on a real connector call, shows up here for any signed-in team
 * member to see and an owner to decide. Polls rather than pushes, same as
 * every other live surface in this app (ProjectCanvas, JobNotifier).
 */
export function ApprovalBanner({ isOpen = false, onClose }: { isOpen?: boolean; onClose?: () => void }) {
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
          setApprovals(data.approvals);
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
  }, [isOpen]);

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
    <section role="region" aria-label="Approvals" className="approval-surface pointer-events-auto fixed left-1/2 top-20 z-[60] flex w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2 flex-col gap-2 overflow-y-auto rounded-2xl border border-cyan-400/25 bg-[#060e1d]/95 p-4 text-slate-100 shadow-2xl backdrop-blur-xl">
      <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-3 bg-[#060e1d] pb-2">
        <h2 className="text-sm font-semibold">Approvals</h2>
        {isOpen && <button type="button" onClick={onClose} aria-label="Close approvals" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-white/10"><X className="h-4 w-4" /></button>}
      </div>
      {loadState === "loading" && <p role="status" className="text-sm text-slate-300">Loading approvals…</p>}
      {loadState === "error" && <p role="alert" className="text-sm text-amber-200">Unable to refresh approvals. Retrying automatically; previously loaded items may be out of date.</p>}
      {loadState === "ready" && approvals.length === 0 && <p className="py-4 text-sm text-slate-300">No pending approvals.</p>}
      {approvals.map((a) => (
        <div key={a.id} className="glass-card-strong rounded-2xl p-4 shadow-2xl ring-1 ring-gold/40">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold/10 text-gold">
              <ShieldAlert className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-navy">Approval needed — a real action, on hold</p>
              <button
                type="button"
                onClick={() => openJob(a.jobId)}
                className="mt-0.5 block truncate text-left text-xs text-electric underline underline-offset-2"
              >
                {a.jobTitle} → {a.stepLabel}
              </button>
              <p className="mt-1.5 rounded-lg bg-sunken px-2.5 py-1.5 break-all font-mono text-[11px] text-secondary">
                {a.toolName}({JSON.stringify(a.args)})
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={busyId === a.id}
                  onClick={() => decide(a.id, "approved")}
                  className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-electric to-gold px-3 py-1.5 text-xs font-semibold text-white shadow-sm disabled:opacity-60"
                >
                  <Check className="h-3.5 w-3.5" /> Approve
                </button>
                <button
                  type="button"
                  disabled={busyId === a.id}
                  onClick={() => decide(a.id, "denied")}
                  className="flex items-center gap-1.5 rounded-lg border border-border-metal bg-white/80 px-3 py-1.5 text-xs font-medium text-secondary hover:text-crimson disabled:opacity-60"
                >
                  <X className="h-3.5 w-3.5" /> Deny
                </button>
              </div>
              {errorById[a.id] && <p className="mt-1.5 text-xs text-crimson">{errorById[a.id]}</p>}
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
