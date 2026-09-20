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
    <div className="bg-[#0B1220]/75 backdrop-blur-xl border border-[#333333] hover:border-[#0078FF]/40 rounded-2xl p-5 shadow-2xl transition-all flex h-full flex-col justify-between">
      <div>
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-sora text-xs font-bold uppercase tracking-tight text-white">
            <ShieldAlert className="h-4 w-4 text-crimson" /> Needs Attention
          </h2>
          {total > 0 ? (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-crimson px-2 font-mono text-[11px] font-bold text-white shadow">
              {total}
            </span>
          ) : (
            <span className="rounded-md bg-emerald/15 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald uppercase">
              Operational
            </span>
          )}
        </div>

        {total === 0 ? (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-[#333333]/60 bg-[#0B1220]/80 p-3 font-inter text-xs text-[#CCCCCC]">
            <CheckCircle2 className="h-4 w-4 text-emerald shrink-0" />
            <span>All systems nominal — zero human-in-the-loop blockers.</span>
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {pending.approvals > 0 && (
              <li className="rounded-xl border border-gold/30 bg-gold/10 p-2.5 font-inter text-xs text-[#CCCCCC]">
                <span className="font-bold text-gold">{pending.approvals}</span> real-action approval
                {pending.approvals === 1 ? "" : "s"} waiting — see the gold banner above.
              </li>
            )}
            {pending.consultations > 0 && (
              <li className="rounded-xl border border-electric/30 bg-electric/10 p-2.5 font-inter text-xs text-[#CCCCCC]">
                <span className="font-bold text-electric">{pending.consultations}</span> operator question
                {pending.consultations === 1 ? "" : "s"} waiting — check the HITL drawer.
              </li>
            )}
            {pending.unapprovedPlans > 0 && (
              <li>
                <button
                  type="button"
                  onClick={() => setActiveView("workflows")}
                  className="flex w-full items-center justify-between rounded-xl border border-[#333333] bg-[#0B1220] p-2.5 text-left font-inter text-xs text-[#CCCCCC] transition-colors hover:border-electric hover:text-white"
                >
                  <span>
                    <span className="font-bold text-white">{pending.unapprovedPlans}</span> plan
                    {pending.unapprovedPlans === 1 ? "" : "s"} finished, ready for review
                  </span>
                  <span className="text-electric font-semibold">Review →</span>
                </button>
              </li>
            )}
          </ul>
        )}
      </div>

      <div className="mt-4 pt-2.5 border-t border-[#333333]/60 flex items-center justify-between font-inter text-xs text-[#CCCCCC]">
        <span>HITL Operational Queue</span>
        <span className="font-mono text-[10px] text-[#CCCCCC]">Real-time Polling</span>
      </div>
    </div>
  );
}
