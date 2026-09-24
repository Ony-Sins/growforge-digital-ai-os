"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Send, X, Zap, Sparkles } from "lucide-react";
import { CoreRessonanceField } from "@/components/spatial/CoreRessonanceField";
import { TokenLedger, type AgentTokens } from "@/components/spatial/TokenLedger";
import type { CoreDeptView, CoreJobView, CoreState } from "@/lib/coreState";

const DEPT_META: Record<string, { short: string; icon: string }> = {
  "strategy": { short: "Strategy & Intelligence", icon: "🔍" },
  "marketing": { short: "Marketing & Brand", icon: "🎯" },
  "growth": { short: "Growth & Demand", icon: "📈" },
  "finance": { short: "Finance & Ops", icon: "💰" },
  "client-success": { short: "Client Success", icon: "👥" },
  "product": { short: "Product & UX", icon: "🎨" },
  "web-dev": { short: "Web Development", icon: "💻" },
  "ai-systems": { short: "AI Systems", icon: "🤖" },
};

export interface CoreZoomTierProps {
  jobState?: CoreState | null;
  initialJobId?: string | null;
  className?: string;
}

export function CoreZoomTier({
  jobState: externalState = null,
  initialJobId = null,
  className = "",
}: CoreZoomTierProps) {
  const [internalState, setInternalState] = useState<CoreState | null>(externalState);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(initialJobId);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [brief, setBrief] = useState("");
  const [launching, setLaunching] = useState(false);
  const [showLauncher, setShowLauncher] = useState(false);

  const state = externalState ?? internalState;
  const job = state?.job;
  const systems = state?.systems;
  const running = job?.status === "running";

  const load = useCallback(async () => {
    try {
      const qs = selectedJobId ? `?jobId=${encodeURIComponent(selectedJobId)}` : "";
      const res = await fetch(`/api/core/state${qs}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as CoreState;
      setInternalState(data);
    } catch (err) {
      console.error("Failed to load CORE state:", err);
    }
  }, [selectedJobId]);

  useEffect(() => {
    if (externalState) return;
    const first = setTimeout(() => void load(), 0);
    const id = setInterval(() => void load(), running ? 3000 : 12000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [load, running, externalState]);

  // Prepare department nodes for Ressonance Field
  const departments = useMemo(() => {
    if (!job) return [];
    const anglePerDept = 360 / job.departments.length;
    return job.departments.map((dept, i) => ({
      id: dept.id,
      name: DEPT_META[dept.id]?.short || dept.id,
      angle: i * anglePerDept,
      status: dept.step?.status === "active" ? ("active" as const) :
              dept.step?.status === "done" ? ("done" as const) :
              dept.step?.status === "error" ? ("blocked" as const) :
              dept.assigned ? ("waiting" as const) : ("idle" as const),
      agentCount: 1, // placeholder
    }));
  }, [job]);

  // Prepare agent perturbations for Ressonance Field
  const agents = useMemo(() => {
    if (!job) return [];
    return job.departments
      .filter((d) => d.assigned && d.step)
      .map((dept) => ({
        id: `agent-${dept.id}`,
        deptId: dept.id,
        progress: dept.step?.status === "done" ? 100 :
                 dept.step?.status === "active" ? 50 : 25,
        status: dept.step?.status === "active" ? ("active" as const) :
               dept.step?.status === "done" ? ("done" as const) :
               dept.step?.status === "error" ? ("blocked" as const) : ("waiting" as const),
        disturbanceIntensity: dept.step?.status === "active" ? 0.8 : 0.3,
      }));
  }, [job]);

  // Prepare token ledger data
  const agentTokens = useMemo(() => {
    if (!job) return [];
    return job.departments.map((dept) => ({
      agentId: `agent-${dept.id}`,
      agentName: DEPT_META[dept.id]?.short || dept.id,
      deptId: dept.id,
      deptName: DEPT_META[dept.id]?.short || dept.id,
      totalTokens: Math.floor(Math.random() * 20000) + 5000, // placeholder
      inputTokens: Math.floor(Math.random() * 10000) + 2000,
      outputTokens: Math.floor(Math.random() * 8000) + 1000,
      costUsd: Math.random() * 10 + 1,
      modelUsed: Math.random() > 0.5 ? "Claude 3.5 Sonnet" : "GPT-4",
      toolsCalled: ["API 1", "API 2"],
      duration: `${Math.floor(Math.random() * 120) + 30}m`,
      status: dept.step?.status === "active" ? ("active" as const) :
             dept.step?.status === "done" ? ("done" as const) :
             dept.assigned ? ("waiting" as const) : ("blocked" as const),
    })) as AgentTokens[];
  }, [job]);

  const totalTokens = agentTokens.reduce((sum, a) => sum + a.totalTokens, 0);
  const totalCost = agentTokens.reduce((sum, a) => sum + a.costUsd, 0);
  const modelBreakdown = { "Claude": 0.6, "GPT-4": 0.25, "Ollama": 0.15 };
  const deptBreakdown = departments.reduce((acc, dept) => {
    acc[dept.name] = 1 / departments.length;
    return acc;
  }, {} as Record<string, number>);

  const launch = async () => {
    setLaunching(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; job?: { id: string } };
      if (!res.ok || !body.job) throw new Error(body.error || `HTTP ${res.status}`);
      setBrief("");
      setShowLauncher(false);
      setSelectedJobId(body.job.id);
      void load();
    } catch (err) {
      console.error("Launch failed:", err);
    } finally {
      setLaunching(false);
    }
  };

  const selectedAgent = selectedAgentId ? agentTokens.find((a) => a.agentId === selectedAgentId) : null;

  return (
    <div className={`relative w-full h-full overflow-hidden bg-[#0a0e27] ${className}`}>
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-[#0a0e27] to-transparent p-4 md:p-6">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[#0078ff] to-[#ffc432] text-white shadow-lg shadow-[#0078ff]/20">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-bold text-white text-lg flex items-center gap-2">
                CORE Live Pipeline
                {running && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    EXECUTING
                  </span>
                )}
              </h1>
              <p className="text-xs text-slate-400">Resonance field: multi-agent execution pipeline</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {state?.jobs && state.jobs.length > 0 && (
              <select
                value={selectedJobId ?? state.jobs[0]?.id ?? ""}
                onChange={(e) => {
                  setSelectedJobId(e.target.value);
                  setSelectedAgentId(null);
                }}
                className="rounded-lg border border-slate-600/40 bg-slate-800/60 py-2 pl-3 pr-8 text-xs font-semibold text-white hover:border-[#0078ff]/60 transition-colors"
              >
                {state.jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title} ({j.status})
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => setShowLauncher(true)}
              className="flex items-center gap-2 rounded-lg bg-[#0078ff] px-4 py-2 text-xs font-bold text-white shadow-lg shadow-[#0078ff]/25 transition-all hover:bg-[#0066dc] active:scale-95"
            >
              <Plus className="h-4 w-4" />
              <span>New Brief</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Visualization */}
      <div className="w-full h-full flex items-center justify-center">
        {job ? (
          <CoreRessonanceField
            departments={departments}
            agents={agents}
            coreIntensity={running ? 0.9 : 0.5}
            onAgentClick={setSelectedAgentId}
          />
        ) : (
          <div className="text-center">
            <p className="text-slate-400 text-sm">No active job. Launch a new brief to begin.</p>
          </div>
        )}
      </div>

      {/* Token Ledger */}
      {job && <TokenLedger
        agents={agentTokens}
        totalTokens={totalTokens}
        totalCost={totalCost}
        modelBreakdown={modelBreakdown}
        deptBreakdown={deptBreakdown}
        expandedAgent={selectedAgentId || undefined}
        onAgentClick={setSelectedAgentId}
      />}

      {/* Selected Agent Detail Panel */}
      {selectedAgent && (
        <div className="absolute top-20 right-4 w-80 max-h-96 overflow-y-auto bg-white/95 border border-slate-200/80 rounded-lg shadow-xl backdrop-blur-md p-4 space-y-3 z-30">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className="font-bold text-slate-900">{selectedAgent.agentName}</h3>
              <p className="text-xs text-slate-500">{selectedAgent.deptName}</p>
            </div>
            <button
              onClick={() => setSelectedAgentId(null)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-2 text-xs text-slate-700 font-mono">
            <div className="bg-slate-50 p-2 rounded">
              <div className="font-semibold text-slate-900 mb-1">Status</div>
              <p>{selectedAgent.status.toUpperCase()}</p>
            </div>

            <div className="bg-slate-50 p-2 rounded">
              <div className="font-semibold text-slate-900 mb-1">Token Usage</div>
              <div className="space-y-0.5 text-[11px]">
                <div className="flex justify-between">
                  <span>Total:</span>
                  <span className="text-slate-900 font-bold">{selectedAgent.totalTokens.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Input:</span>
                  <span>{selectedAgent.inputTokens.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Output:</span>
                  <span>{selectedAgent.outputTokens.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 p-2 rounded">
              <div className="font-semibold text-slate-900 mb-1">Cost & Details</div>
              <div className="space-y-0.5 text-[11px]">
                <div className="flex justify-between">
                  <span>USD Cost:</span>
                  <span className="font-bold">${selectedAgent.costUsd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Model:</span>
                  <span>{selectedAgent.modelUsed}</span>
                </div>
                <div className="flex justify-between">
                  <span>Duration:</span>
                  <span>{selectedAgent.duration}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* System Status Footer */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[#0a0e27] to-transparent p-4 z-10">
        <div className="max-w-7xl mx-auto flex flex-wrap gap-4 text-[11px] font-mono text-slate-400">
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${systems?.probes.some((p) => p.id === "ollama" && p.online) ? "bg-emerald-500" : "bg-red-500"}`} />
            <span>Ollama {systems?.probes.find((p) => p.id === "ollama")?.online ? "Online" : "Offline"}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${systems?.probes.some((p) => p.id === "searxng" && p.online) ? "bg-emerald-500" : "bg-red-500"}`} />
            <span>SearXNG {systems?.probes.find((p) => p.id === "searxng")?.online ? "Online" : "Offline"}</span>
          </div>
          <div className="ml-auto">
            <span>Total Cost: ${totalCost.toFixed(2)} | Tokens: {totalTokens.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Launch Modal */}
      {showLauncher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-[#0078ff]" />
                <h3 className="font-bold text-base text-slate-900">Launch New Brief</h3>
              </div>
              <button
                onClick={() => setShowLauncher(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mb-3 text-xs text-slate-600">
              Describe your business brief. All 8 departments will plan, research, and execute concurrently.
            </p>

            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="e.g., Launch a high-efficiency solar installation firm in Austin, TX..."
              rows={5}
              className="mb-4 w-full rounded-lg border border-slate-200 p-3 text-xs text-slate-900 placeholder-slate-400 focus:border-[#0078ff] focus:outline-none focus:ring-1 focus:ring-[#0078ff]"
            />

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowLauncher(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={launch}
                disabled={launching || brief.trim().length < 20}
                className="flex items-center gap-2 rounded-lg bg-[#0078ff] px-5 py-2 text-xs font-bold text-white shadow-lg shadow-[#0078ff]/25 transition-all hover:bg-[#0066dc] disabled:opacity-50"
              >
                {launching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                <span>{launching ? "Launching..." : "Dispatch Pipeline"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
