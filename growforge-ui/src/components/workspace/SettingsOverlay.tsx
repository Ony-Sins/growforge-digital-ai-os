"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Check,
  ExternalLink,
  Key,
  Loader2,
  Plug,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useAppState } from "@/lib/appState";
import { InterfaceAccessCard } from "@/components/workspace/InterfaceAccessCard";
import { IntegrationsHub } from "@/components/workspace/IntegrationsHub";
import { AiModelManager } from "@/components/workspace/AiModelManager";

interface SettingsCategory {
  id: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
  description: string;
}

const SETTINGS_CATEGORIES: SettingsCategory[] = [
  {
    id: "connectors",
    label: "Connectors & Plugins",
    icon: Plug,
    badge: "Unified",
    description: "Master hub for MCP tools, custom REST endpoints, and dynamic capabilities.",
  },
  {
    id: "ai-providers",
    label: "AI Models & Gateways",
    icon: Key,
    badge: "Active",
    description: "Local Ollama (Qwen 2.5), OpenRouter gateway, cloud LLMs, and custom BYO endpoints.",
  },
  {
    id: "automation",
    label: "Automation (n8n)",
    icon: Zap,
    description: "Autonomous workflow trigger engine with real-time /healthz connectivity probing.",
  },
  {
    id: "preferences",
    label: "Preferences & Access",
    icon: SlidersHorizontal,
    description: "Workspace mode (Simple vs. Advanced) and developer PIN access controls.",
  },
];

function resolveCategoryId(tab?: string): string {
  if (!tab) return "connectors";
  const t = tab.toLowerCase();
  if (t === "ai-providers" || t === "ai" || t === "models") return "ai-providers";
  if (t === "automation" || t === "n8n") return "automation";
  if (t === "preferences" || t === "developer" || t === "access") return "preferences";
  if (t === "connectors" || t === "plugins" || t === "byo-mcp" || t === "mcp") return "connectors";
  return "connectors";
}

function N8nSettingsView() {
  const [host, setHost] = useState("http://localhost:5678");
  const [apiKey, setApiKey] = useState("");
  const [isConfigured, setIsConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");
  const [health, setHealth] = useState<{ status: "connected" | "offline" | "checking"; latencyMs?: number; detail?: string }>({
    status: "checking",
  });

  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/vault/system/n8n/health");
      if (res.ok) {
        const d = await res.json();
        setHealth({ status: d.status, latencyMs: d.latencyMs, detail: d.detail });
      } else {
        setHealth({ status: "offline", detail: `HTTP ${res.status}` });
      }
    } catch {
      setHealth({ status: "offline", detail: "Network probe error" });
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function init() {
      try {
        const [configRes, healthRes] = await Promise.allSettled([
          fetch("/api/vault/system/n8n"),
          fetch("/api/vault/system/n8n/health"),
        ]);
        if (!active) return;

        if (configRes.status === "fulfilled" && configRes.value.ok) {
          const d = await configRes.value.json().catch(() => ({}));
          if (active) {
            if (d.host?.value) setHost(d.host.value);
            setIsConfigured(Boolean(d.apiKey?.configured));
          }
        }

        if (healthRes.status === "fulfilled") {
          if (healthRes.value.ok) {
            const d = await healthRes.value.json().catch(() => ({ status: "offline" }));
            if (active) {
              setHealth({ status: d.status, latencyMs: d.latencyMs, detail: d.detail });
            }
          } else {
            if (active) {
              setHealth({ status: "offline", detail: `HTTP ${healthRes.value.status}` });
            }
          }
        } else {
          if (active) {
            setHealth({ status: "offline", detail: "Network probe error" });
          }
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void init();
    return () => {
      active = false;
    };
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/vault/system/n8n", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: host.trim() || undefined,
          apiKey: apiKey.trim() || undefined,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Failed to save n8n configuration.");
      setSaved(true);
      setApiKey("");
      setIsConfigured(true);
      void checkHealth();
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-[#333333] bg-[#0B1220]">
        <Loader2 className="h-6 w-6 animate-spin text-electric" />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Overview Banner */}
      <div className="rounded-2xl border border-[#333333] bg-[#0B1220] p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#EA4B71] to-[#FF6D5A] text-white shadow-md">
              <Zap className="h-6 w-6" />
            </div>
            <div>
              <h2 className="font-heading text-base font-semibold text-white">n8n Automation Engine</h2>
              <div className="mt-1 flex items-center gap-2">
                <span
                  className={`flex items-center gap-1.5 text-xs font-semibold font-inter ${
                    health.status === "connected" ? "text-emerald" : "text-crimson"
                  }`}
                >
                  <span className="h-2 w-2 rounded-full bg-current animate-pulse" />
                  {health.status === "connected"
                    ? `Online & Active (${health.latencyMs ?? 0}ms)`
                    : health.status === "checking"
                    ? "Probing connectivity..."
                    : `Offline / Unreachable (${health.detail || "Connection refused"})`}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={checkHealth}
            className="flex items-center gap-1.5 rounded-full border border-[#333333] bg-[#111c34] px-3.5 py-1.5 text-xs font-medium text-[#CCCCCC] hover:border-electric hover:text-white transition-colors self-start sm:self-auto"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Test /healthz Probe</span>
          </button>
        </div>

        <p className="text-xs text-[#CCCCCC] leading-relaxed font-inter">
          GrowForge agents trigger self-hosted or cloud n8n webhook nodes to execute complex multi-step automations, social scheduling, CRM syncs, and scraper loops.
        </p>
      </div>

      {/* Configuration Form */}
      <div className="rounded-2xl border border-[#333333] bg-[#0B1220] p-6 shadow-xl space-y-4">
        <h3 className="font-heading text-sm font-semibold text-white">Connection Credentials</h3>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#CCCCCC] mb-1.5 font-inter">
              n8n Host URL <span className="text-electric">*</span>
            </label>
            <input
              type="url"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="http://localhost:5678"
              className="w-full rounded-xl border border-[#333333] bg-[#111c34] px-3.5 py-2.5 font-mono text-xs text-white placeholder:text-slate-500 focus:border-electric focus:outline-none focus:ring-1 focus:ring-electric/30"
            />
            <p className="mt-1 text-[11px] text-[#CCCCCC]/80 font-inter">
              Default is <code className="text-sky-400">http://localhost:5678</code> for local desktop or Docker instances.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#CCCCCC] mb-1.5 font-inter flex items-center justify-between">
              <span>n8n API Key</span>
              <Key className="h-3 w-3 text-[#CCCCCC]" />
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={isConfigured ? "•••••••• (enter to overwrite existing vault key)" : "Paste API key from n8n Settings → API"}
              className="w-full rounded-xl border border-[#333333] bg-[#111c34] px-3.5 py-2.5 font-mono text-xs text-white placeholder:text-slate-500 focus:border-electric focus:outline-none focus:ring-1 focus:ring-electric/30"
            />
          </div>

          {err && <p className="text-xs text-crimson font-inter">{err}</p>}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-[#333333]">
            <a
              href={host || "http://localhost:5678"}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-xs text-electric hover:text-sky-300 font-inter"
            >
              <span>Open Local n8n Dashboard</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>

            <button
              type="submit"
              disabled={saving || (!host.trim() && !apiKey.trim())}
              className="flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#0078FF] to-[#FFC432] px-6 py-2.5 text-xs font-bold text-white shadow-lg shadow-[#0078FF]/20 hover:brightness-110 active:scale-95 disabled:opacity-50 transition-all font-inter"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Saving Configuration...</span>
                </>
              ) : saved ? (
                <>
                  <Check className="h-4 w-4" />
                  <span>Config Saved!</span>
                </>
              ) : (
                <>
                  <span>Save n8n Config →</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function SettingsOverlay() {
  const { isSettingsOpen, settingsTab, closeSettings } = useAppState();
  const [activeCategoryId, setActiveCategoryId] = useState<string>(() => resolveCategoryId(settingsTab));
  const [prevSettingsTab, setPrevSettingsTab] = useState(settingsTab);

  if (settingsTab !== prevSettingsTab) {
    setPrevSettingsTab(settingsTab);
    if (settingsTab) {
      setActiveCategoryId(resolveCategoryId(settingsTab));
    }
  }

  if (!isSettingsOpen) return null;

  const activeCategory =
    SETTINGS_CATEGORIES.find((c) => c.id === activeCategoryId) || SETTINGS_CATEGORIES[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-5 backdrop-blur-md animate-in fade-in duration-200"
      onClick={closeSettings}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[88vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-[#333333] bg-[#0B1220] text-white shadow-2xl backdrop-blur-2xl animate-in zoom-in-95 duration-200"
      >
        {/* Left Navigation Rail */}
        <div className="hidden w-64 shrink-0 flex-col border-r border-[#333333] bg-[#000000]/60 p-3.5 sm:flex overflow-y-auto">
          {/* Header */}
          <div className="flex items-center gap-2.5 px-2 pb-3.5 pt-1 border-b border-[#333333]">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-electric/15 text-electric border border-electric/30 shadow-sm">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="font-heading text-xs font-semibold text-white">Connections Hub</p>
              <p className="text-[10px] text-[#CCCCCC]">GrowForge AI OS</p>
            </div>
          </div>

          {/* Categories Navigation */}
          <div className="mt-4 space-y-1">
            <span className="px-2.5 text-[10px] font-bold uppercase tracking-wider text-[#CCCCCC] font-inter">
              Ecosystem &amp; Services
            </span>
            <ul className="mt-1 space-y-1">
              {SETTINGS_CATEGORIES.map((item) => {
                const Icon = item.icon;
                const active = activeCategoryId === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setActiveCategoryId(item.id)}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-medium font-inter transition-all ${
                        active
                          ? "bg-electric/20 text-white ring-1 ring-electric/40 font-semibold shadow-sm"
                          : "text-[#CCCCCC] hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon
                          className={`h-4 w-4 shrink-0 ${
                            active ? "text-electric" : "text-[#CCCCCC]"
                          }`}
                        />
                        <span className="truncate">{item.label}</span>
                      </div>
                      {item.badge && (
                        <span className="rounded-full bg-electric/15 text-sky-300 px-2 py-0.5 text-[9px] font-bold uppercase shrink-0 border border-electric/30">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* Right Content Pane */}
        <div className="flex flex-1 flex-col overflow-hidden bg-[#0B1220]">
          {/* Top Header Bar */}
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#333333] px-5 bg-[#111c34]/70 backdrop-blur-md">
            <div className="flex items-center gap-2.5">
              <activeCategory.icon className="h-4 w-4 text-electric" />
              <div>
                <h1 className="font-heading text-sm font-semibold text-white">{activeCategory.label}</h1>
                <p className="hidden md:block text-[11px] text-[#CCCCCC] truncate max-w-md font-inter">
                  {activeCategory.description}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={closeSettings}
              aria-label="Close Settings"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[#CCCCCC] hover:bg-white/10 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Active Category Content Panel */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-[#0B1220]">
            {/* 1. Unified Connectors & Plugins Directory */}
            {activeCategoryId === "connectors" && <IntegrationsHub />}

            {/* 2. AI Models & API Keys */}
            {activeCategoryId === "ai-providers" && <AiModelManager />}

            {/* 3. Automation Engine (n8n) */}
            {activeCategoryId === "automation" && <N8nSettingsView />}

            {/* 4. Interface & Access Preferences */}
            {activeCategoryId === "preferences" && (
              <div className="space-y-4 max-w-3xl">
                <InterfaceAccessCard />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
