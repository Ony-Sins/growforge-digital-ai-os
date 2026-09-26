"use client";

import { Lock, X } from "lucide-react";
import { StatusDot, statusLabel, statusTextClass } from "@/components/ui/StatusDot";
import { useAppState } from "@/lib/appState";
import { isAgentLocked } from "@/lib/security";
import { useLiveAgents } from "@/lib/useLiveAgents";

/**
 * Agent Roster overlay — the full live roster, off the main dashboard scroll
 * as of the Phase 3.5 dashboard IA reorg (the dashboard itself now keeps only
 * a compact "view all" strip, see Workspace.tsx). Same full-screen-takeover
 * pattern as Settings/Admin Drawer/User Profile, not a new interaction model.
 */
export function AgentRosterOverlay() {
  const { isAgentRosterOpen, closeAgentRoster, openAgentPanel, canAccessAgent } = useAppState();
  const liveAgents = useLiveAgents();

  if (!isAgentRosterOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#070B14] text-white">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-white/10 bg-[#0B1220]/95 px-4 backdrop-blur-xl md:px-6">
        <h1 className="font-heading text-sm font-semibold text-white">Quick Agent Roster</h1>
        <span className="font-mono text-[11px] text-muted">{liveAgents.length} agents</span>
        <div className="ml-auto">
          <button
            type="button"
            onClick={closeAgentRoster}
            aria-label="Close Agent Roster"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-4xl">
          <ul className="divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-[#0B1220]">
            {liveAgents.map((agent) => (
              <li key={agent.id}>
                <button
                  type="button"
                  onClick={() => openAgentPanel(agent.id)}
                  className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-white/5"
                >
                  <StatusDot status={agent.status} pulse={agent.status === "active"} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium text-white">
                      {agent.name}
                      {isAgentLocked(agent.id) && !canAccessAgent(agent.id) && (
                        <Lock className="h-3 w-3 shrink-0 text-muted" />
                      )}
                    </p>
                    <p className="truncate text-xs text-muted">{agent.division}</p>
                  </div>
                  <span className={`shrink-0 text-xs font-medium ${statusTextClass(agent.status)}`}>
                    {statusLabel(agent.status)}
                  </span>
                  <span className="hidden shrink-0 font-mono text-xs text-muted sm:inline">{agent.lastRun}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
