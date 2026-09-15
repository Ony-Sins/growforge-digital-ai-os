"use client";

import { useEffect, useState } from "react";
import {
  ArrowRightLeft,
  Bot,
  Code2,
  FlaskConical,
  Loader2,
  Lock,
  Play,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAppState } from "@/lib/appState";
import { agents as seedAgents, type Agent } from "@/lib/agents";
import { StatusDot, statusLabel, statusTextClass } from "@/components/ui/StatusDot";
import { isAgentLocked } from "@/lib/security";
import { ApiKeyVault } from "@/components/workspace/ApiKeyVault";
import type { HandoffSuggestion } from "@/lib/handoff";

const ICONS: Record<string, LucideIcon> = {
  Bot,
  Code2,
  Sparkles,
  ShieldCheck,
  Send,
  Target,
  FlaskConical,
};

type DispatchState =
  | { phase: "idle" }
  | { phase: "dispatching" }
  | { phase: "dispatched"; message: string }
  | { phase: "error"; message: string }
  | { phase: "hand-off"; suggestion: HandoffSuggestion & { params: Record<string, unknown> } };

export function AgentDetailPanel() {
  const { selectedAgentId, closeAgentPanel, canAccessAgent, requestAgentUnlock, role, unlockedAgentIds } =
    useAppState();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(false);
  const [dispatch, setDispatch] = useState<DispatchState>({ phase: "idle" });

  const isOpen = selectedAgentId !== null;
  const locked = selectedAgentId ? isAgentLocked(selectedAgentId) && !canAccessAgent(selectedAgentId) : false;

  // Load (and re-load) live agent data whenever the panel opens for a new id.
  useEffect(() => {
    if (!selectedAgentId) return;

    // Reset panel state for the newly-selected agent and seed it with the
    // static fallback immediately, then replace with live data below.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets local UI state in response to the selectedAgentId prop-like value changing
    setDispatch({ phase: "idle" });
    setAgent(seedAgents.find((a) => a.id === selectedAgentId) ?? null);
    setLoading(true);

    let cancelled = false;
    fetch(`/api/agents/${encodeURIComponent(selectedAgentId)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`status ${res.status}`))))
      .then((data: { agent: Agent }) => {
        if (!cancelled) setAgent(data.agent);
      })
      .catch(() => {
        // keep the seed fallback already set above
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedAgentId]);

  // Close on Escape.
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeAgentPanel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, closeAgentPanel]);

  async function refetchAgent(id: string) {
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(id)}`);
      if (!res.ok) return;
      const data: { agent: Agent } = await res.json();
      setAgent(data.agent);
    } catch {
      // best-effort refresh only
    }
  }

  async function handleRun() {
    if (!selectedAgentId) return;
    setDispatch({ phase: "dispatching" });
    try {
      // Provider *names* only — the actual key values live server-side in
      // the encrypted vault (see src/lib/serverVault.ts) and never reach
      // this browser. This just tells the (simulated) agent run to prefer
      // these over default system keys.
      const vaultRes = await fetch(`/api/vault/${encodeURIComponent(selectedAgentId)}`);
      const usingCustomKeys: string[] = vaultRes.ok
        ? ((await vaultRes.json()).providers ?? [])
        : [];

      const res = await fetch(`/api/agents/${encodeURIComponent(selectedAgentId)}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "agent-detail-panel",
          role,
          unlockedAgentIds,
          usingCustomKeys,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `request failed (${res.status})`);

      if (data.status === "hand-off") {
        setDispatch({ phase: "hand-off", suggestion: data });
        return;
      }

      setDispatch({ phase: "dispatched", message: data.log?.message ?? "Dispatched." });
      setAgent(data.agent);

      // The orchestrator resolves active -> success/error ~1.5s after
      // dispatch (see agentStore.ts) — refresh once to reflect that live.
      setTimeout(() => refetchAgent(selectedAgentId), 1800);
    } catch (err) {
      setDispatch({
        phase: "error",
        message: err instanceof Error ? err.message : "Failed to dispatch agent.",
      });
    }
  }

  async function dispatchDirect(targetAgentId: string, params: Record<string, unknown>) {
    setDispatch({ phase: "dispatching" });
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(targetAgentId)}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...params, role, unlockedAgentIds, skipHandoffCheck: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `request failed (${res.status})`);

      setDispatch({ phase: "dispatched", message: data.log?.message ?? "Dispatched." });
      // Only refresh the header's live status if we dispatched the agent
      // currently open in this panel — a hand-off target may be a
      // different agent entirely, and shouldn't overwrite what's shown.
      if (targetAgentId === selectedAgentId) {
        setAgent(data.agent);
        setTimeout(() => refetchAgent(targetAgentId), 1800);
      }
    } catch (err) {
      setDispatch({
        phase: "error",
        message: err instanceof Error ? err.message : "Failed to dispatch agent.",
      });
    }
  }

  if (!isOpen) return null;

  const Icon = agent ? (ICONS[agent.icon] ?? Bot) : Bot;
  const isDispatching = dispatch.phase === "dispatching";

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close agent details"
        onClick={closeAgentPanel}
        className="absolute inset-0 bg-navy/30 backdrop-blur-sm"
      />

      {/* Slide-over panel */}
      <div className="glass-card-strong absolute right-0 top-0 flex h-full w-full max-w-sm flex-col border-l border-border-metal-strong shadow-2xl">
        <div className="flex items-center gap-3 border-b border-border-metal px-5 py-4">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              agent?.hub ? "bg-navy" : "bg-sunken"
            }`}
          >
            <Icon className={`h-5 w-5 ${agent?.hub ? "text-gold" : "text-electric"}`} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-heading text-sm font-semibold text-navy">
              {agent?.name ?? selectedAgentId}
            </p>
            <p className="truncate text-xs text-muted">{agent?.division ?? "—"}</p>
          </div>
          <button
            type="button"
            onClick={closeAgentPanel}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-sunken hover:text-navy"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {locked ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-border-metal bg-white/70 px-4 py-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-sunken text-muted">
                <Lock className="h-5 w-5" />
              </span>
              <p className="text-sm font-medium text-navy">This agent is locked</p>
              <p className="text-xs text-muted">
                {agent?.name ?? "This agent"} is restricted to the {agent?.division ?? ""} department. Enter the
                security key to access it for the rest of your session.
              </p>
              <button
                type="button"
                onClick={() => selectedAgentId && requestAgentUnlock(selectedAgentId)}
                className="mt-2 flex items-center gap-2 rounded-lg bg-gradient-to-r from-electric to-gold px-4 py-2 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.02]"
              >
                <Lock className="h-3.5 w-3.5" /> Enter Security Key
              </button>
            </div>
          ) : (
            <>
              {/* Status */}
              <div className="flex items-center justify-between rounded-xl border border-border-metal bg-white/70 px-4 py-3">
                <div className="flex items-center gap-2">
                  <StatusDot status={agent?.status ?? "idle"} pulse={agent?.status === "active"} />
                  <span className={`text-sm font-medium ${statusTextClass(agent?.status ?? "idle")}`}>
                    {statusLabel(agent?.status ?? "idle")}
                  </span>
                </div>
                <span className="font-mono text-xs text-muted">{agent?.lastRun ?? (loading ? "…" : "—")}</span>
              </div>

              {/* Meta */}
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-muted">Agent ID</dt>
                  <dd className="font-mono text-xs text-secondary">{selectedAgentId}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted">Division</dt>
                  <dd className="text-secondary">{agent?.division ?? "—"}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted">Role</dt>
                  <dd className="text-secondary">{agent?.hub ? "Orchestrator (hub)" : "Spoke agent"}</dd>
                </div>
              </dl>

              {/* Run action */}
              <div className="mt-6 border-t border-border-metal pt-5">
                <button
                  type="button"
                  onClick={handleRun}
                  disabled={isDispatching}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-electric to-gold px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
                >
                  {isDispatching ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Dispatching…
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" /> Run Agent
                    </>
                  )}
                </button>

                {dispatch.phase === "dispatched" && (
                  <p className="mt-3 rounded-lg bg-emerald/10 px-3 py-2 font-mono text-xs text-emerald ring-1 ring-emerald/25">
                    {dispatch.message}
                  </p>
                )}
                {dispatch.phase === "error" && (
                  <p className="mt-3 rounded-lg bg-crimson/10 px-3 py-2 font-mono text-xs text-crimson ring-1 ring-crimson/25">
                    {dispatch.message}
                  </p>
                )}
                {dispatch.phase === "hand-off" &&
                  (() => {
                    const { suggestion } = dispatch;
                    return (
                      <div className="mt-3 rounded-lg border border-gold/30 bg-gold/5 px-3 py-2.5">
                        <p className="flex items-start gap-1.5 text-xs text-secondary">
                          <ArrowRightLeft className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
                          <span>
                            Best handled by{" "}
                            <span className="font-medium text-navy">{suggestion.targetAgentName}</span>.{" "}
                            {suggestion.reason}
                          </span>
                        </p>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => dispatchDirect(suggestion.targetAgentId, suggestion.params)}
                            className="flex-1 rounded-md bg-gradient-to-r from-electric to-gold px-2.5 py-1.5 text-xs font-semibold text-white"
                          >
                            Hand off
                          </button>
                          <button
                            type="button"
                            onClick={() => selectedAgentId && dispatchDirect(selectedAgentId, suggestion.params)}
                            className="flex-1 rounded-md border border-border-metal bg-white/70 px-2.5 py-1.5 text-xs font-medium text-secondary"
                          >
                            Run anyway
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                <p className="mt-3 text-xs text-muted">
                  Status updates automatically here and in the Execution Logs panel a moment after dispatch.
                </p>
              </div>

              {selectedAgentId && <ApiKeyVault agentId={selectedAgentId} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
