"use client";

import { CheckCircle2, ShieldAlert } from "lucide-react";
import { useAppState } from "@/lib/appState";
import { usePendingSummary } from "@/lib/usePendingSummary";

/** Dashboard-level "Needs Attention" panel — Phase 3.5 item 14 (dashboard IA
 *  reorg). Surfaces the exact same real pending state Header's notification
 *  bell already computes (usePendingSummary), as an always-visible section
 *  instead of something the user has to click a bell to discover. */
export function NeedsAttention() {
  const { setActiveView } = useAppState();
  const pending = usePendingSummary();
  const total = pending.approvals + pending.consultations + pending.unapprovedPlans;

  return (
    <div className="glass-card rounded-xl p-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 font-heading text-sm font-semibold text-navy">
          <ShieldAlert className="h-4 w-4 text-crimson" /> Needs Attention
        </h2>
        {total > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-crimson px-1.5 text-[11px] font-bold text-white">
            {total}
          </span>
        )}
      </div>

      {total === 0 ? (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-secondary">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald" /> Nothing pending — you&apos;re all caught up.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {pending.approvals > 0 && (
            <li className="rounded-lg bg-gold/10 px-3 py-2 text-xs text-secondary">
              <span className="font-semibold text-navy">{pending.approvals}</span> real-action approval
              {pending.approvals === 1 ? "" : "s"} waiting — see the gold banner at the top of the screen.
            </li>
          )}
          {pending.consultations > 0 && (
            <li className="rounded-lg bg-electric/10 px-3 py-2 text-xs text-secondary">
              <span className="font-semibold text-navy">{pending.consultations}</span> operator question
              {pending.consultations === 1 ? "" : "s"} waiting — check the HITL drawer.
            </li>
          )}
          {pending.unapprovedPlans > 0 && (
            <li>
              <button
                type="button"
                onClick={() => setActiveView("workflows")}
                className="flex w-full items-center justify-between rounded-lg bg-sunken px-3 py-2 text-left text-xs text-secondary transition-colors hover:bg-white hover:text-navy"
              >
                <span>
                  <span className="font-semibold text-navy">{pending.unapprovedPlans}</span> plan
                  {pending.unapprovedPlans === 1 ? "" : "s"} finished, not yet approved
                </span>
                <span className="text-electric">Review →</span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
