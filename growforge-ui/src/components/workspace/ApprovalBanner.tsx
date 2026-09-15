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
export function ApprovalBanner() {
  const { openJob } = useAppState();
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorById, setErrorById] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/approvals");
        if (res.ok && !cancelled) {
          const data = await res.json();
          setApprovals(Array.isArray(data.approvals) ? data.approvals : []);
        }
      } catch {
        // next tick retries
      }
    }

    poll();
    const t = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

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
    } finally {
      setBusyId(null);
    }
  }

  if (approvals.length === 0) return null;

  return (
    <div className="fixed left-1/2 top-4 z-50 flex w-full max-w-xl -translate-x-1/2 flex-col gap-2 px-4">
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
              <p className="mt-1.5 rounded-lg bg-sunken px-2.5 py-1.5 font-mono text-[11px] text-secondary">
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
    </div>
  );
}
