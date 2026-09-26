"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Server,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  Pencil,
  Cpu,
  ChevronDown,
  ChevronUp,
  Zap,
  X,
  SlidersHorizontal,
  ShieldCheck,
  ExternalLink,
  Sparkles,
  Check,
} from "lucide-react";
import { getAiBrandIcon } from "@/lib/aiBrandIcons";
import type { ClientAiModel, TaskRole, ProviderType } from "@/lib/aiModelStore";

export interface Preset {
  id: string;
  label: string;
  name: string;
  baseUrl: string;
  modelName: string;
  providerType: ProviderType;
  taskRole: TaskRole;
  helpUrl?: string;
  tokenLabel?: string;
}

export const PRESETS: Preset[] = [
  {
    id: "openai",
    label: "OpenAI (GPT-4o Mini)",
    name: "OpenAI GPT-4o Mini",
    baseUrl: "https://api.openai.com/v1",
    modelName: "gpt-4o-mini",
    providerType: "openai-compatible",
    taskRole: "planning",
    tokenLabel: "OpenAI API Key (sk-...)",
    helpUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude 3.5)",
    name: "Anthropic Claude 3.5 Sonnet",
    baseUrl: "https://api.anthropic.com/v1",
    modelName: "claude-3-5-sonnet-latest",
    providerType: "anthropic",
    taskRole: "coding",
    tokenLabel: "Anthropic API Key (sk-ant-...)",
    helpUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    name: "Google Gemini 3.6 Flash",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    modelName: "gemini-3.6-flash",
    providerType: "gemini",
    taskRole: "general",
    tokenLabel: "Google AI Studio API Key",
    helpUrl: "https://aistudio.google.com/app/apikey",
  },
  {
    id: "groq",
    label: "Groq (Llama 3.3)",
    name: "Groq Llama 3.3 70B",
    baseUrl: "https://api.groq.com/openai/v1",
    modelName: "llama-3.3-70b-versatile",
    providerType: "groq",
    taskRole: "utility",
    tokenLabel: "Groq API Key (gsk_...)",
    helpUrl: "https://console.groq.com/keys",
  },
  {
    id: "openrouter",
    label: "OpenRouter Gateway",
    name: "OpenRouter Auto",
    baseUrl: "https://openrouter.ai/api/v1",
    modelName: "openrouter/auto",
    providerType: "openrouter",
    taskRole: "general",
    tokenLabel: "OpenRouter API Key (sk-or-...)",
    helpUrl: "https://openrouter.ai/keys",
  },
  {
    id: "deepseek",
    label: "DeepSeek API",
    name: "DeepSeek Chat",
    baseUrl: "https://api.deepseek.com/v1",
    modelName: "deepseek-chat",
    providerType: "openai-compatible",
    taskRole: "coding",
    tokenLabel: "DeepSeek API Key (sk-...)",
    helpUrl: "https://platform.deepseek.com/api_keys",
  },
  {
    id: "mistral",
    label: "Mistral AI",
    name: "Mistral Large",
    baseUrl: "https://api.mistral.ai/v1",
    modelName: "mistral-large-latest",
    providerType: "openai-compatible",
    taskRole: "general",
    tokenLabel: "Mistral API Key",
    helpUrl: "https://console.mistral.ai/api-keys/",
  },
  {
    id: "higgsfield",
    label: "Higgsfield AI (Image)",
    name: "Higgsfield AI",
    baseUrl: "https://api.higgsfield.ai/v1",
    modelName: "higgsfield-v1",
    providerType: "custom",
    taskRole: "image",
    tokenLabel: "Higgsfield API Key",
    helpUrl: "https://higgsfield.ai/",
  },
  {
    id: "dalle3",
    label: "OpenAI DALL-E 3 (Image)",
    name: "OpenAI DALL-E 3",
    baseUrl: "https://api.openai.com/v1",
    modelName: "dall-e-3",
    providerType: "openai-compatible",
    taskRole: "image",
    tokenLabel: "OpenAI API Key (sk-...)",
    helpUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "imagen3",
    label: "Google Imagen 3 (Image)",
    name: "Google Imagen 3",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    modelName: "imagen-3.0-generate-002",
    providerType: "gemini",
    taskRole: "image",
    tokenLabel: "Google AI Studio API Key",
    helpUrl: "https://aistudio.google.com/app/apikey",
  },
  {
    id: "ollama",
    label: "Local Ollama (Private)",
    name: "Local Ollama (Qwen 2.5 7B)",
    baseUrl: "http://localhost:11434/v1",
    modelName: "qwen2.5:7b-instruct",
    providerType: "ollama",
    taskRole: "general",
    tokenLabel: "Optional Authorization Token",
    helpUrl: "https://ollama.com",
  },
];

const TASK_ROLE_LABELS: Record<TaskRole, { label: string; color: string }> = {
  general: { label: "General", color: "bg-electric/10 text-electric border-electric/25" },
  planning: { label: "Planning", color: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/25" },
  coding: { label: "Coding", color: "bg-emerald/10 text-emerald border-emerald/25" },
  utility: { label: "Utility", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25" },
  image: { label: "Image Gen", color: "bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/25" },
};

export function AiModelManager() {
  const [models, setModels] = useState<ClientAiModel[]>([]);
  const [routingChains, setRoutingChains] = useState<Record<string, string[]>>({});
  const [strategy, setStrategy] = useState<string>("auto");
  const [loaded, setLoaded] = useState(false);

  // Minimal single-field token prompt state (PinPromptModal pattern)
  const [selectedPreset, setSelectedPreset] = useState<Preset | null>(null);

  // Custom / Deep Edit Modal State
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [inspectedModel, setInspectedModel] = useState<ClientAiModel | null>(null);

  // Action feedback states
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string; latencyMs?: number }>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Advanced Mode (Diagnostics & Routing hidden by default)
  const [advancedMode, setAdvancedMode] = useState(false);

  const effectiveChains: Record<"planning" | "coding" | "utility", ClientAiModel[]> = {
    planning: routingChains.planning?.length
      ? (routingChains.planning.map((id) => models.find((m) => m.id === id || m.modelName === id)).filter(Boolean) as ClientAiModel[])
      : models.filter((m) => m.taskRole === "planning" || m.taskRole === "general"),
    coding: routingChains.coding?.length
      ? (routingChains.coding.map((id) => models.find((m) => m.id === id || m.modelName === id)).filter(Boolean) as ClientAiModel[])
      : models.filter((m) => m.taskRole === "coding" || m.taskRole === "general"),
    utility: routingChains.utility?.length
      ? (routingChains.utility.map((id) => models.find((m) => m.id === id || m.modelName === id)).filter(Boolean) as ClientAiModel[])
      : models.filter((m) => m.taskRole === "utility" || m.taskRole === "general"),
  };

  async function loadData() {
    try {
      const res = await fetch("/api/vault/system");
      if (res.status === 401 || res.status === 403) {
        setLoaded(true);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (Array.isArray(data.models)) setModels(data.models);
      if (data.routingChains) setRoutingChains(data.routingChains);
      if (data.strategy) setStrategy(data.strategy);
    } catch {
      // Ignore network errors
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleTestModel(model: ClientAiModel) {
    setTestingId(model.id);
    try {
      const res = await fetch("/api/vault/system/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId: model.id }),
      });
      const data = await res.json();
      setTestResults((prev) => ({ ...prev, [model.id]: data }));
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [model.id]: { ok: false, message: err instanceof Error ? err.message : "Network error" },
      }));
    } finally {
      setTestingId(null);
    }
  }

  async function handleDeleteModel(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/vault/system/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await loadData();
      }
    } finally {
      setDeletingId(null);
    }
  }

  async function handleReactivateModel(model: ClientAiModel) {
    setTestingId(model.id);
    try {
      const res = await fetch("/api/vault/system", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: model.id,
          name: model.name,
          baseUrl: model.baseUrl,
          modelName: model.modelName,
          taskRole: model.taskRole,
          isPrimary: model.isPrimary,
          providerType: model.providerType,
          status: "active",
        }),
      });
      if (res.ok) {
        await loadData();
      }
    } finally {
      setTestingId(null);
    }
  }

  async function handleUpdateStrategy(newStrategy: string) {
    try {
      const res = await fetch("/api/router", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy: newStrategy }),
      });
      if (res.ok) {
        setStrategy(newStrategy);
      }
    } catch {
      // ignore
    }
  }

  if (!loaded) return null;

  const isPrivateUrl = (url: string) =>
    url.includes("localhost") ||
    url.includes("127.0.0.1") ||
    url.includes("192.168.") ||
    url.includes("10.") ||
    url.includes("172.");

  return (
    <div className="space-y-5">
      {/* 1. Curated Known API Connectors Grid */}
      <div className="glass-card rounded-2xl p-5 border border-border-metal shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#333333]">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-electric" />
              <h2 className="font-heading text-sm font-semibold text-white">Popular API Connectors</h2>
            </div>
            <p className="mt-1 text-xs text-secondary">
              Connect cloud intelligence or image models with a single API key.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsCustomModalOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-[#333333] bg-[#111827] px-3 py-1.5 text-xs font-semibold text-white hover:border-electric/50 hover:bg-electric/10 hover:text-electric transition-all shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Custom Endpoint</span>
          </button>
        </div>

        {/* Presets Cards Grid */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {PRESETS.map((preset) => {
            const brand = getAiBrandIcon(preset.providerType, preset.modelName, preset.baseUrl);
            const isConfigured = models.some(
              (m) =>
                m.status !== "archived" &&
                m.status !== "disconnected" &&
                m.modelName === preset.modelName ||
                (m.status !== "archived" &&
                  m.status !== "disconnected" &&
                  m.baseUrl === preset.baseUrl &&
                  m.providerType === preset.providerType)
            );
            const matchingModel = models.find(
              (m) =>
                m.modelName === preset.modelName ||
                (m.baseUrl === preset.baseUrl && m.providerType === preset.providerType)
            );

            return (
              <div
                key={preset.id}
                onClick={() => {
                  if (matchingModel) {
                    setInspectedModel(matchingModel);
                  } else {
                    setSelectedPreset(preset);
                  }
                }}
                className={`group cursor-pointer rounded-xl border p-3.5 transition-all flex flex-col justify-between ${
                  isConfigured
                    ? "border-emerald/30 bg-[#0B1220] hover:border-emerald/60"
                    : "border-[#333333] bg-[#111827] hover:border-electric/50 hover:shadow-md"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${brand.bgClass} ${brand.borderClass} ${brand.textClass}`}
                    >
                      <svg className="h-4.5 w-4.5 fill-current" viewBox="0 0 24 24">
                        <path d={brand.path} />
                      </svg>
                    </div>

                    {isConfigured ? (
                      <span className="flex items-center gap-1 rounded-full bg-emerald/10 border border-emerald/25 px-2 py-0.5 text-[10px] font-semibold text-emerald">
                        <Check className="h-3 w-3" /> Connected
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 rounded-full bg-electric/10 border border-electric/25 px-2 py-0.5 text-[10px] font-semibold text-electric group-hover:bg-electric group-hover:text-white transition-colors">
                        <Plus className="h-3 w-3" /> Connect
                      </span>
                    )}
                  </div>

                  <h3 className="mt-2.5 text-xs font-semibold text-white group-hover:text-electric transition-colors truncate">
                    {preset.name}
                  </h3>
                  <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`rounded px-1.5 py-0.2 text-[9px] font-medium border ${
                        TASK_ROLE_LABELS[preset.taskRole]?.color || TASK_ROLE_LABELS.general.color
                      }`}
                    >
                      {TASK_ROLE_LABELS[preset.taskRole]?.label || "General"}
                    </span>
                    <span className="text-[10px] text-muted font-mono truncate">{preset.modelName}</span>
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-[#333333] flex items-center justify-between text-[11px] text-secondary">
                  <span>{isConfigured ? "Inspect Model" : "Enter API Key"}</span>
                  <span className="font-semibold text-electric group-hover:translate-x-0.5 transition-transform">→</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Connected AI Models List */}
      <div className="glass-card rounded-2xl p-5 border border-border-metal shadow-sm">
        <div className="flex items-center justify-between pb-3 border-b border-[#333333]">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-electric" />
            <h2 className="font-heading text-sm font-semibold text-white">Active AI Models & Endpoints</h2>
          </div>
          <span className="rounded-full bg-electric/15 text-electric px-2 py-0.5 text-xs font-semibold">
            {models.length} active
          </span>
        </div>

        <div className="mt-4 space-y-2">
          {models.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#333333] p-8 text-center bg-[#111827]/40">
              <Server className="mx-auto h-7 w-7 text-muted" />
              <p className="mt-2 text-xs font-medium text-white">No AI models configured yet</p>
              <p className="mt-1 text-[11px] text-secondary">
                Click any connector above or add a custom model to activate intelligence.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {models.map((m) => {
                const brand = getAiBrandIcon(m.providerType, m.modelName, m.baseUrl);
                const isTesting = testingId === m.id;
                const isDeleting = deletingId === m.id;
                const test = testResults[m.id];
                const isPrivate = isPrivateUrl(m.baseUrl);
                const roleConfig = TASK_ROLE_LABELS[m.taskRole] || TASK_ROLE_LABELS.general;

                return (
                  <li
                    key={m.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#333333] bg-[#111827] px-3.5 py-3 transition-all hover:border-electric/50"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${brand.bgClass} ${brand.borderClass} ${brand.textClass}`}
                      >
                        <svg className="h-4.5 w-4.5 fill-current" viewBox="0 0 24 24">
                          <path d={brand.path} />
                        </svg>
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-white truncate">{m.name}</span>
                          {m.isPrimary && (
                            <span className="rounded bg-gold/15 px-1.5 py-0.5 text-[9px] font-bold text-gold border border-gold/30">
                              PRIMARY
                            </span>
                          )}
                          {(m.status === "archived" || m.status === "disconnected") && (
                            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-400 border border-amber-500/30">
                              ARCHIVED
                            </span>
                          )}
                          <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium border ${roleConfig.color}`}>
                            {roleConfig.label}
                          </span>
                          {isPrivate && (
                            <span className="rounded bg-emerald/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald">
                              LOCAL
                            </span>
                          )}
                        </div>

                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted flex-wrap">
                          <code className="font-mono text-white font-medium">{m.modelName}</code>
                          <span>•</span>
                          <span className="truncate max-w-[240px] font-mono text-secondary" title={m.baseUrl}>
                            {m.baseUrl}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right-aligned Test Button & Controls */}
                    <div className="flex items-center gap-2 ml-auto">
                      {(m.status === "archived" || m.status === "disconnected") && (
                        <button
                          type="button"
                          onClick={() => handleReactivateModel(m)}
                          disabled={isTesting || isDeleting}
                          title="Reactivate this model connector in the Brain"
                          className="flex items-center gap-1 rounded-md border border-electric/40 bg-electric/15 px-2.5 py-1 text-xs font-semibold text-electric hover:bg-electric/25 transition-colors disabled:opacity-50"
                        >
                          {isTesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                          <span>Reactivate</span>
                        </button>
                      )}

                      {/* Live Test Latency Feedback */}
                      {test && (
                        <div
                          className={`flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded border ${
                            test.ok
                              ? "bg-emerald/10 text-emerald border-emerald/20"
                              : "bg-crimson/10 text-crimson border-crimson/20"
                          }`}
                        >
                          {test.ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                          <span>{test.ok ? `${test.latencyMs ?? 0}ms` : "Error"}</span>
                        </div>
                      )}

                      {/* Real-time Test Button */}
                      <button
                        type="button"
                        onClick={() => handleTestModel(m)}
                        disabled={isTesting || isDeleting}
                        title="Ping endpoint to measure real-time latency"
                        className="flex items-center gap-1 rounded-md border border-[#333333] bg-[#0B1220] px-2.5 py-1 text-xs font-medium text-secondary transition-colors hover:border-electric/50 hover:text-white disabled:opacity-50"
                      >
                        {isTesting ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Zap className="h-3 w-3 text-electric" />
                        )}
                        <span>{isTesting ? "Testing…" : "Test Ping"}</span>
                      </button>

                      {/* Inspect / Edit Model */}
                      <button
                        type="button"
                        onClick={() => setInspectedModel(m)}
                        disabled={isTesting || isDeleting}
                        title={`Inspect ${m.name}`}
                        aria-label={`Inspect ${m.name}`}
                        className="rounded-md border border-[#333333] bg-[#0B1220] p-1.5 text-secondary transition-colors hover:border-electric/50 hover:text-white disabled:opacity-50"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>

                      {/* Remove Model */}
                      <button
                        type="button"
                        onClick={() => handleDeleteModel(m.id)}
                        disabled={isDeleting || isTesting}
                        aria-label={`Remove ${m.name}`}
                        className="rounded-md p-1.5 text-muted transition-colors hover:bg-crimson/10 hover:text-crimson disabled:opacity-50"
                      >
                        {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* 3. Advanced Mode Toggle & Inspector (Strictly Collapsed by Default) */}
      <div className="glass-card rounded-2xl p-4 border border-border-metal">
        <button
          type="button"
          onClick={() => setAdvancedMode((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-3.5 w-3.5 text-secondary" />
            <span className="font-heading text-xs font-medium text-secondary">
              Advanced Routing Telemetry & Diagnostic Chains
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted">
            <span>{advancedMode ? "Hide Details" : "Show Details"}</span>
            {advancedMode ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </div>
        </button>

        {advancedMode && (
          <div className="mt-4 space-y-4 pt-4 border-t border-border-metal animate-in fade-in duration-150">
            {/* Strategy Switcher */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sunken/60 p-3">
              <div>
                <span className="text-xs font-semibold text-white">Global Dispatch Strategy</span>
                <p className="text-[11px] text-muted">Defines execution cascade across local and cloud models.</p>
              </div>
              <div className="flex items-center gap-1.5">
                {(["auto", "cloud", "local"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleUpdateStrategy(s)}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                      strategy === s
                        ? "bg-electric text-white shadow-sm"
                        : "bg-[#111827] text-secondary hover:text-white border border-[#333333]"
                    }`}
                  >
                    {s.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Active Categorized Fallback Chains */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {/* Planning */}
              <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-purple-400">Strategic Planning</span>
                  <span className="text-[10px] text-purple-400 font-mono">HQ & PM</span>
                </div>
                <ol className="space-y-1 text-xs font-mono">
                  {effectiveChains.planning.map((m, idx) => (
                    <li key={m.id} className="flex items-center gap-1.5 text-secondary truncate">
                      <span className="text-[10px] text-muted">{idx + 1}.</span>
                      <span className="truncate text-white font-medium">{m.name}</span>
                      <span className="text-[10px] text-muted">({m.providerType})</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Coding */}
              <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-cyan-400">Code & Automation</span>
                  <span className="text-[10px] text-cyan-400 font-mono">Systems & Tools</span>
                </div>
                <ol className="space-y-1 text-xs font-mono">
                  {effectiveChains.coding.map((m, idx) => (
                    <li key={m.id} className="flex items-center gap-1.5 text-secondary truncate">
                      <span className="text-[10px] text-muted">{idx + 1}.</span>
                      <span className="truncate text-white font-medium">{m.name}</span>
                      <span className="text-[10px] text-muted">({m.providerType})</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Utility / QA */}
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-emerald-400">Fast Triage & QA</span>
                  <span className="text-[10px] text-emerald-400 font-mono">Utility</span>
                </div>
                <ol className="space-y-1 text-xs font-mono">
                  {effectiveChains.utility.map((m, idx) => (
                    <li key={m.id} className="flex items-center gap-1.5 text-secondary truncate">
                      <span className="text-[10px] text-muted">{idx + 1}.</span>
                      <span className="truncate text-white font-medium">{m.name}</span>
                      <span className="text-[10px] text-muted">({m.providerType})</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. Minimal Single-Field Token Prompt Modal (PinPromptModal pattern) */}
      {selectedPreset && (
        <AiModelTokenPromptModal
          preset={selectedPreset}
          onClose={() => setSelectedPreset(null)}
          onConnected={() => {
            setSelectedPreset(null);
            void loadData();
          }}
        />
      )}

      {/* 5. Custom / New Model Modal */}
      {isCustomModalOpen && (
        <CustomAiModelModal
          onClose={() => setIsCustomModalOpen(false)}
          onCreated={() => {
            setIsCustomModalOpen(false);
            void loadData();
          }}
        />
      )}

      {/* 6. Inspect / Edit Model Modal (Deeper Config) */}
      {inspectedModel && (
        <AiModelInspectorModal
          model={inspectedModel}
          onClose={() => setInspectedModel(null)}
          onSaved={() => {
            setInspectedModel(null);
            void loadData();
          }}
          onDeleted={() => {
            setInspectedModel(null);
            void loadData();
          }}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------
// MINIMAL SINGLE-FIELD TOKEN PROMPT MODAL (PinPromptModal Pattern)
// -------------------------------------------------------------

function AiModelTokenPromptModal({
  preset,
  onClose,
  onConnected,
}: {
  preset: Preset;
  onClose: () => void;
  onConnected: () => void;
}) {
  const brand = getAiBrandIcon(preset.providerType, preset.modelName, preset.baseUrl);
  const isOllama = preset.providerType === "ollama";
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isOllama && !apiKey.trim()) return;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/vault/system", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: preset.name,
          baseUrl: preset.baseUrl,
          modelName: preset.modelName,
          apiKey: apiKey.trim() || undefined,
          taskRole: preset.taskRole,
          providerType: preset.providerType,
          isPrimary: false,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to connect AI model.");
      } else {
        onConnected();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onClose}
        className="absolute inset-0 bg-transparent"
      />
      <form
        onSubmit={handleSubmit}
        className="glass-card-strong relative w-full max-w-sm rounded-2xl border border-[#333333] bg-[#0B1220] p-6 shadow-2xl animate-in zoom-in-95 duration-150"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-lg p-1.5 text-muted transition-colors hover:bg-sunken hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        <span
          className={`flex h-11 w-11 items-center justify-center rounded-xl border ${brand.bgClass} ${brand.borderClass} ${brand.textClass}`}
        >
          <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
            <path d={brand.path} />
          </svg>
        </span>

        <h2 className="mt-3 font-heading text-base font-semibold text-white">
          Connect {preset.name}
        </h2>
        <p className="mt-1 text-xs text-secondary">
          {isOllama
            ? "Connect your local private Ollama instance running on " + preset.baseUrl + "."
            : `Enter your API key to activate ${preset.label} across your GrowForge departments.`}
        </p>

        {!isOllama && preset.helpUrl && (
          <a
            href={preset.helpUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-[11px] text-electric hover:underline"
          >
            <span>Get your API key</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        )}

        {!isOllama ? (
          <input
            type="password"
            autoFocus
            required
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setError(null);
            }}
            placeholder={preset.tokenLabel || "Enter API Key (sk-...)"}
            className="mt-4 w-full rounded-lg border border-[#333333] bg-[#111827] px-3.5 py-2.5 font-mono text-xs text-white placeholder:text-muted outline-none focus:border-electric/60"
          />
        ) : (
          <div className="mt-4 rounded-lg border border-[#333333] bg-[#111827] p-2.5">
            <span className="text-[10px] text-muted uppercase font-bold">Endpoint</span>
            <p className="font-mono text-xs text-white truncate">{preset.baseUrl}</p>
          </div>
        )}

        {error && <p className="mt-2 text-xs text-crimson">{error}</p>}

        <button
          type="submit"
          disabled={(!isOllama && !apiKey.trim()) || busy}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-electric to-gold px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          <span>Connect {preset.label.split(" ")[0]}</span>
        </button>
      </form>
    </div>
  );
}

// -------------------------------------------------------------
// CUSTOM AI MODEL BUILDER MODAL (Small Form)
// -------------------------------------------------------------

function CustomAiModelModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [modelName, setModelName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [taskRole, setTaskRole] = useState<TaskRole>("general");
  const [providerType, setProviderType] = useState<ProviderType>("openai-compatible");
  const [isPrimary, setIsPrimary] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!baseUrl.trim() || !modelName.trim()) {
      setError("Base URL and Model Name are required.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/vault/system", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || modelName.trim(),
          baseUrl: baseUrl.trim(),
          modelName: modelName.trim(),
          apiKey: apiKey.trim() || undefined,
          taskRole,
          providerType,
          isPrimary,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save AI model.");
      } else {
        onCreated();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving custom model.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg rounded-2xl border border-[#333333] bg-[#0B1220] shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-[#333333]">
          <div className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-electric" />
            <h3 className="font-heading text-base font-semibold text-white">Add Custom Model / Endpoint</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-[#111827] hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-white">Display Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My Private vLLM Server"
              className="mt-1 w-full rounded-lg border border-[#333333] bg-[#111827] px-3 py-2 text-xs text-white placeholder:text-muted outline-none focus:border-electric"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-white">Endpoint Base URL</label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://localhost:11434/v1 or https://api.vendor.com/v1"
              required
              className="mt-1 w-full rounded-lg border border-[#333333] bg-[#111827] px-3 py-2 font-mono text-xs text-white placeholder:text-muted outline-none focus:border-electric"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-white">Model Slug</label>
              <input
                type="text"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                placeholder="e.g. llama3.3:70b"
                required
                className="mt-1 w-full rounded-lg border border-[#333333] bg-[#111827] px-3 py-2 font-mono text-xs text-white placeholder:text-muted outline-none focus:border-electric"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white">API Key (optional)</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Leave blank if none"
                className="mt-1 w-full rounded-lg border border-[#333333] bg-[#111827] px-3 py-2 font-mono text-xs text-white placeholder:text-muted outline-none focus:border-electric"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <div>
              <label className="block text-xs font-medium text-white">Provider Protocol</label>
              <select
                value={providerType}
                onChange={(e) => setProviderType(e.target.value as ProviderType)}
                className="mt-1 w-full rounded-lg border border-[#333333] bg-[#111827] px-2.5 py-2 text-xs text-white outline-none focus:border-electric"
              >
                <option value="openai-compatible">OpenAI Compatible (v1)</option>
                <option value="anthropic">Anthropic Messages API</option>
                <option value="gemini">Google Gemini API</option>
                <option value="ollama">Ollama Native</option>
                <option value="custom">Custom Protocol</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-white">Task Role</label>
              <select
                value={taskRole}
                onChange={(e) => setTaskRole(e.target.value as TaskRole)}
                className="mt-1 w-full rounded-lg border border-[#333333] bg-[#111827] px-2.5 py-2 text-xs text-white outline-none focus:border-electric"
              >
                <option value="general">General Purpose</option>
                <option value="planning">Strategic Planning</option>
                <option value="coding">Code & Automation</option>
                <option value="utility">Fast Triage & QA</option>
                <option value="image">Image Generation</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="customPrimaryCheckbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
              className="h-4 w-4 rounded border-[#333333] bg-[#111827] text-electric"
            />
            <label htmlFor="customPrimaryCheckbox" className="text-xs text-white cursor-pointer">
              Set as Primary Default Model
            </label>
          </div>

          {error && <p className="text-xs text-crimson">{error}</p>}

          <div className="flex justify-end gap-2 pt-3 border-t border-[#333333]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#333333] bg-[#111827] px-3.5 py-2 text-xs text-muted hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !baseUrl.trim() || !modelName.trim()}
              className="btn-primary-cta px-4 py-2 text-xs font-semibold disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1 inline" /> : <Plus className="h-3.5 w-3.5 mr-1 inline" />}
              <span>Save Custom Model</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// INSPECT / EDIT MODAL FOR ALREADY-CONNECTED MODEL (Deeper Config)
// -------------------------------------------------------------

function AiModelInspectorModal({
  model,
  onClose,
  onSaved,
  onDeleted,
}: {
  model: ClientAiModel;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const brand = getAiBrandIcon(model.providerType, model.modelName, model.baseUrl);
  const [name, setName] = useState(model.name);
  const [baseUrl, setBaseUrl] = useState(model.baseUrl);
  const [modelName, setModelName] = useState(model.modelName);
  const [apiKey, setApiKey] = useState("");
  const [taskRole, setTaskRole] = useState<TaskRole>(model.taskRole);
  const providerType = model.providerType;
  const [isPrimary, setIsPrimary] = useState(Boolean(model.isPrimary));
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; latencyMs?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/vault/system/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId: model.id }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : "Test failed" });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/vault/system", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: model.id,
          name: name.trim() || modelName.trim(),
          baseUrl: baseUrl.trim(),
          modelName: modelName.trim(),
          apiKey: apiKey.trim() || undefined,
          taskRole,
          providerType,
          isPrimary,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update AI model.");
      } else {
        onSaved();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Are you sure you want to disconnect ${model.name}?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/vault/system/${encodeURIComponent(model.id)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        onDeleted();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg rounded-2xl border border-[#333333] bg-[#0B1220] shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-[#333333]">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${brand.bgClass} ${brand.borderClass} ${brand.textClass}`}
            >
              <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                <path d={brand.path} />
              </svg>
            </div>
            <div>
              <h3 className="font-heading text-base font-semibold text-white">{model.name}</h3>
              <p className="text-xs text-muted font-mono">{model.modelName}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-[#111827] hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Live Test Ping Action */}
        <div className="flex items-center justify-between gap-2 p-3 rounded-xl border border-[#333333] bg-[#111827]">
          <div>
            <span className="text-xs font-medium text-white">Connection Verification</span>
            <p className="text-[11px] text-muted">Test active latency to {model.baseUrl}</p>
          </div>
          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            className="flex items-center gap-1.5 rounded-lg border border-[#333333] bg-[#0B1220] px-3 py-1.5 text-xs font-semibold text-white hover:border-electric hover:text-electric transition-colors disabled:opacity-50"
          >
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5 text-electric" />}
            <span>{testing ? "Testing…" : "Test Ping"}</span>
          </button>
        </div>

        {testResult && (
          <div
            className={`flex items-start gap-2 rounded-lg p-2.5 text-xs border ${
              testResult.ok ? "bg-emerald/10 text-emerald border-emerald/20" : "bg-crimson/10 text-crimson border-crimson/20"
            }`}
          >
            {testResult.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" /> : <XCircle className="h-4 w-4 shrink-0 mt-0.5" />}
            <span>{testResult.ok ? `Verified connection (${testResult.latencyMs ?? 0}ms)` : testResult.message}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-3 pt-2">
          <div>
            <label className="block text-xs font-medium text-white">Display Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#333333] bg-[#111827] px-3 py-2 text-xs text-white outline-none focus:border-electric"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-white">Endpoint Base URL</label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#333333] bg-[#111827] px-3 py-2 font-mono text-xs text-white outline-none focus:border-electric"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-white">Model Slug</label>
              <input
                type="text"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#333333] bg-[#111827] px-3 py-2 font-mono text-xs text-white outline-none focus:border-electric"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white">Update Key (leave blank to keep)</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="••••••••"
                className="mt-1 w-full rounded-lg border border-[#333333] bg-[#111827] px-3 py-2 font-mono text-xs text-white outline-none focus:border-electric"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-white">Task Role</label>
              <select
                value={taskRole}
                onChange={(e) => setTaskRole(e.target.value as TaskRole)}
                className="mt-1 w-full rounded-lg border border-[#333333] bg-[#111827] px-2.5 py-2 text-xs text-white outline-none focus:border-electric"
              >
                <option value="general">General Purpose</option>
                <option value="planning">Strategic Planning</option>
                <option value="coding">Code & Automation</option>
                <option value="utility">Fast Triage & QA</option>
                <option value="image">Image Generation</option>
              </select>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                id="inspectPrimaryCheckbox"
                checked={isPrimary}
                onChange={(e) => setIsPrimary(e.target.checked)}
                className="h-4 w-4 rounded border-[#333333] bg-[#111827] text-electric"
              />
              <label htmlFor="inspectPrimaryCheckbox" className="text-xs text-white cursor-pointer">
                Primary Model
              </label>
            </div>
          </div>

          {error && <p className="text-xs text-crimson">{error}</p>}

          <div className="flex items-center justify-between pt-3 border-t border-[#333333]">
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="flex items-center gap-1.5 text-xs text-crimson hover:underline"
            >
              <Trash2 className="h-3.5 w-3.5" /> Disconnect Model
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-[#333333] bg-[#111827] px-3.5 py-2 text-xs text-muted hover:text-white"
              >
                Done
              </button>
              <button
                type="submit"
                disabled={busy}
                className="btn-primary-cta px-4 py-2 text-xs font-semibold disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1 inline" /> : null}
                Save Changes
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
