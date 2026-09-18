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
  ShieldAlert,
  Globe,
  Zap,
  X,
  SlidersHorizontal,
} from "lucide-react";
import { getAiBrandIcon } from "@/lib/aiBrandIcons";
import type { ClientAiModel, TaskRole, ProviderType } from "@/lib/aiModelStore";

interface Preset {
  label: string;
  name: string;
  baseUrl: string;
  modelName: string;
  providerType: ProviderType;
  taskRole: TaskRole;
}

const PRESETS: Preset[] = [
  {
    label: "OpenAI (GPT-4o Mini)",
    name: "OpenAI GPT-4o Mini",
    baseUrl: "https://api.openai.com/v1",
    modelName: "gpt-4o-mini",
    providerType: "openai-compatible",
    taskRole: "planning",
  },
  {
    label: "Anthropic (Claude 3.5)",
    name: "Anthropic Claude 3.5 Sonnet",
    baseUrl: "https://api.anthropic.com/v1",
    modelName: "claude-3-5-sonnet-latest",
    providerType: "anthropic",
    taskRole: "coding",
  },
  {
    label: "Google Gemini",
    name: "Google Gemini 3.6 Flash",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    modelName: "gemini-3.6-flash",
    providerType: "gemini",
    taskRole: "general",
  },
  {
    label: "Groq (Llama 3.3)",
    name: "Groq Llama 3.3 70B",
    baseUrl: "https://api.groq.com/openai/v1",
    modelName: "llama-3.3-70b-versatile",
    providerType: "groq",
    taskRole: "utility",
  },
  {
    label: "Local Ollama (Private)",
    name: "Local Ollama Llama 3.2",
    baseUrl: "http://localhost:11434/v1",
    modelName: "llama3.2:1b",
    providerType: "ollama",
    taskRole: "utility",
  },
  {
    label: "DeepSeek API",
    name: "DeepSeek Chat",
    baseUrl: "https://api.deepseek.com/v1",
    modelName: "deepseek-chat",
    providerType: "openai-compatible",
    taskRole: "coding",
  },
  {
    label: "Mistral AI",
    name: "Mistral Large",
    baseUrl: "https://api.mistral.ai/v1",
    modelName: "mistral-large-latest",
    providerType: "openai-compatible",
    taskRole: "general",
  },
  {
    label: "LM Studio / vLLM",
    name: "Local Private Model",
    baseUrl: "http://localhost:1234/v1",
    modelName: "local-model",
    providerType: "openai-compatible",
    taskRole: "general",
  },
  {
    label: "OpenRouter Gateway",
    name: "OpenRouter Auto",
    baseUrl: "https://openrouter.ai/api/v1",
    modelName: "openrouter/auto",
    providerType: "openrouter",
    taskRole: "general",
  },
];

const TASK_ROLE_LABELS: Record<TaskRole, { label: string; color: string }> = {
  general: { label: "General", color: "bg-electric/10 text-electric border-electric/25" },
  planning: { label: "Planning", color: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/25" },
  coding: { label: "Coding", color: "bg-emerald/10 text-emerald border-emerald/25" },
  utility: { label: "Utility", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25" },
};

export function AiModelManager() {
  const [models, setModels] = useState<ClientAiModel[]>([]);
  const [routingChains, setRoutingChains] = useState<Record<string, string[]>>({});
  const [strategy, setStrategy] = useState<string>("auto");
  const [loaded, setLoaded] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  // Modal drawer state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [modelName, setModelName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [taskRole, setTaskRole] = useState<TaskRole>("general");
  const [providerType, setProviderType] = useState<ProviderType>("openai-compatible");
  const [isPrimary, setIsPrimary] = useState(false);

  // Action feedback states
  const [saving, setSaving] = useState(false);
  const [builderError, setBuilderError] = useState<string | null>(null);
  const [builderTestResult, setBuilderTestResult] = useState<{ ok: boolean; message: string; latencyMs?: number } | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string; latencyMs?: number }>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Advanced Mode (Diagnostics & Routing hidden by default)
  const [advancedMode, setAdvancedMode] = useState(false);

  async function loadData() {
    try {
      const res = await fetch("/api/vault/system");
      if (res.status === 401 || res.status === 403) {
        setForbidden(true);
        setLoaded(true);
        return;
      }
      setForbidden(false);
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

  function openBuilderWithPreset(preset?: Preset) {
    setEditingId(null);
    if (preset) {
      setName(preset.name);
      setBaseUrl(preset.baseUrl);
      setModelName(preset.modelName);
      setProviderType(preset.providerType);
      setTaskRole(preset.taskRole);
    } else {
      setName("");
      setBaseUrl("");
      setModelName("");
      setApiKey("");
      setTaskRole("general");
      setProviderType("openai-compatible");
      setIsPrimary(false);
    }
    setBuilderError(null);
    setBuilderTestResult(null);
    setIsModalOpen(true);
  }

  function handleEditModel(model: ClientAiModel) {
    setEditingId(model.id);
    setName(model.name);
    setBaseUrl(model.baseUrl);
    setModelName(model.modelName);
    setApiKey("");
    setTaskRole(model.taskRole);
    setProviderType(model.providerType);
    setIsPrimary(Boolean(model.isPrimary));
    setBuilderError(null);
    setBuilderTestResult(null);
    setIsModalOpen(true);
  }

  async function handleTestBuilder() {
    if (!baseUrl.trim() || !modelName.trim()) {
      setBuilderError("Please enter a Base URL and Model Name before testing.");
      return;
    }
    setSaving(true);
    setBuilderError(null);
    setBuilderTestResult(null);

    try {
      const res = await fetch("/api/vault/system/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: baseUrl.trim(),
          modelName: modelName.trim(),
          apiKey: apiKey.trim() || undefined,
          providerType,
        }),
      });
      const data = await res.json();
      setBuilderTestResult(data);
      if (!data.ok) {
        setBuilderError(data.message || "Connection test failed.");
      }
    } catch (err) {
      setBuilderError(err instanceof Error ? err.message : "Network error testing endpoint.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveModel(e: React.FormEvent) {
    e.preventDefault();
    if (!baseUrl.trim() || !modelName.trim()) {
      setBuilderError("Base URL and Model Name are required.");
      return;
    }

    setSaving(true);
    setBuilderError(null);

    try {
      const res = await fetch("/api/vault/system", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId || undefined,
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
        setBuilderError(data.error || "Failed to save AI model.");
      } else {
        setIsModalOpen(false);
        setEditingId(null);
        setBuilderTestResult(null);
        await loadData();
      }
    } catch (err) {
      setBuilderError(err instanceof Error ? err.message : "Error saving model.");
    } finally {
      setSaving(false);
    }
  }

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

  if (forbidden) {
    return (
      <div className="glass-card flex items-start gap-3 rounded-xl p-5">
        <ShieldAlert className="h-5 w-5 shrink-0 text-crimson" />
        <div>
          <h2 className="font-heading text-sm font-semibold text-navy">AI Providers & Models</h2>
          <p className="mt-1 text-sm text-secondary">Only owners can configure AI model providers and vault keys.</p>
        </div>
      </div>
    );
  }

  const isPrivateUrl = (url: string) =>
    url.includes("localhost") ||
    url.includes("127.0.0.1") ||
    url.includes("192.168.") ||
    url.includes("10.") ||
    url.includes("172.");

  return (
    <div className="space-y-4">
      {/* Top Header & Prominent Add AI Model Action Card */}
      <div className="glass-card rounded-xl p-5 border border-border-metal">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-electric" />
              <h2 className="font-heading text-sm font-semibold text-navy">AI Model Connectors</h2>
            </div>
            <p className="mt-1 text-xs text-secondary">
              Connect and orchestrate cloud APIs and private local LLM endpoints (Ollama, vLLM, LM Studio) seamlessly.
            </p>
          </div>

          <button
            type="button"
            onClick={() => openBuilderWithPreset()}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-electric to-gold px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:opacity-90 active:scale-95 shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add AI Model</span>
          </button>
        </div>

        {/* Minimalist, Clean Model List */}
        <div className="mt-5 space-y-2">
          {models.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-metal p-8 text-center bg-sunken/40">
              <Server className="mx-auto h-7 w-7 text-muted" />
              <p className="mt-2 text-xs font-medium text-navy">No AI models connected yet</p>
              <p className="mt-1 text-[11px] text-secondary">
                Click &quot;Add AI Model&quot; to connect your first cloud or local endpoint.
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
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-metal bg-white/90 px-3.5 py-3 transition-all hover:border-electric/40 hover:bg-white"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Authentic Brand Logo */}
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${brand.bgClass} ${brand.borderClass} ${brand.textClass}`}
                      >
                        <svg className="h-4.5 w-4.5 fill-current" viewBox="0 0 24 24">
                          <path d={brand.path} />
                        </svg>
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-navy truncate">{m.name}</span>
                          {m.isPrimary && (
                            <span className="rounded bg-gold/15 px-1.5 py-0.5 text-[9px] font-bold text-gold border border-gold/30">
                              PRIMARY
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
                          <code className="font-mono text-navy font-medium">{m.modelName}</code>
                          <span>•</span>
                          <span className="truncate max-w-[240px] font-mono text-secondary" title={m.baseUrl}>
                            {m.baseUrl}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right-aligned Test Button & Controls */}
                    <div className="flex items-center gap-2 ml-auto">
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
                        className="flex items-center gap-1 rounded-md border border-border-metal bg-white px-2.5 py-1 text-xs font-medium text-secondary transition-colors hover:border-electric/50 hover:text-electric disabled:opacity-50"
                      >
                        {isTesting ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Zap className="h-3 w-3 text-electric" />
                        )}
                        <span>{isTesting ? "Testing…" : "Test Connection"}</span>
                      </button>

                      {/* Edit Model */}
                      <button
                        type="button"
                        onClick={() => handleEditModel(m)}
                        disabled={isTesting || isDeleting}
                        title={`Edit ${m.name}`}
                        aria-label={`Edit ${m.name}`}
                        className="rounded-md p-1.5 text-muted transition-colors hover:bg-sunken hover:text-electric disabled:opacity-50"
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

      {/* Advanced Mode Toggle & Inspector (Strictly Hidden by Default) */}
      <div className="glass-card rounded-xl p-4 border border-border-metal">
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
                <span className="text-xs font-semibold text-navy">Global Dispatch Strategy</span>
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
                        : "bg-white text-secondary hover:text-navy border border-border-metal"
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
                  <span className="text-xs font-semibold text-purple-700 dark:text-purple-300">Strategic Planning</span>
                  <span className="text-[10px] text-purple-600 font-mono">HQ & PM</span>
                </div>
                <ol className="space-y-1 text-xs">
                  {(routingChains.planning || ["openrouter/free", "meta-llama/llama-3.1-8b-instruct", "local/ollama"]).map((slug, idx) => (
                    <li key={slug} className="flex items-center gap-1.5 font-mono text-[11px] text-navy">
                      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-[9px] font-bold text-purple-700">
                        {idx + 1}
                      </span>
                      <span className="truncate">{slug}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Coding */}
              <div className="rounded-lg border border-emerald/20 bg-emerald/5 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-emerald">Coding & Automations</span>
                  <span className="text-[10px] text-emerald font-mono">AI Systems</span>
                </div>
                <ol className="space-y-1 text-xs">
                  {(routingChains.coding || ["cohere/north-mini-code:free", "openrouter/free", "local/ollama"]).map((slug, idx) => (
                    <li key={slug} className="flex items-center gap-1.5 font-mono text-[11px] text-navy">
                      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-emerald/20 text-[9px] font-bold text-emerald">
                        {idx + 1}
                      </span>
                      <span className="truncate">{slug}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Utility */}
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">Fast Utility</span>
                  <span className="text-[10px] text-amber-600 font-mono">Router & QA</span>
                </div>
                <ol className="space-y-1 text-xs">
                  {(routingChains.utility || ["openrouter/free", "nvidia/nemotron-3.5-lightning:free", "local/ollama"]).map((slug, idx) => (
                    <li key={slug} className="flex items-center gap-1.5 font-mono text-[11px] text-navy">
                      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[9px] font-bold text-amber-700">
                        {idx + 1}
                      </span>
                      <span className="truncate">{slug}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Clean 'Add/Edit AI Model' Modal / Drawer Overlay */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="relative w-full max-w-xl rounded-2xl border border-border-metal bg-white shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-border-metal">
              <div className="flex items-center gap-2">
                <Cpu className="h-5 w-5 text-electric" />
                <div>
                  <h3 className="font-heading text-base font-semibold text-navy">
                    {editingId ? "Edit AI Model Connector" : "Add AI Model Connector"}
                  </h3>
                  {editingId && (
                    <p className="text-[11px] text-muted">Update configuration, endpoint URL, or authentication key.</p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingId(null);
                }}
                className="rounded-lg p-1.5 text-muted hover:bg-sunken hover:text-navy"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Quick 1-Click Preset Tags (Only when adding new model) */}
            {!editingId && (
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">1-Click Presets</span>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => openBuilderWithPreset(p)}
                      className="rounded-md border border-border-metal bg-sunken/50 px-2.5 py-1 text-xs font-medium text-navy transition-colors hover:border-electric/50 hover:bg-electric/10 hover:text-electric"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSaveModel} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-navy">Display Label</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. My Local vLLM, DeepSeek API"
                  className="mt-1 w-full rounded-lg border border-border-metal bg-white px-3 py-2 text-xs text-navy outline-none focus:border-electric/60"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-navy">Custom Base URL</label>
                  <span className="text-[10px] text-emerald font-semibold flex items-center gap-1">
                    <Globe className="h-3 w-3" /> Local & private endpoints supported
                  </span>
                </div>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="http://localhost:11434/v1 or https://api.openai.com/v1"
                  required
                  className="mt-1 w-full rounded-lg border border-border-metal bg-white px-3 py-2 font-mono text-xs text-navy outline-none focus:border-electric/60"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-navy">Model Name / Slug</label>
                  <input
                    type="text"
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    placeholder="e.g. llama3.2:1b, gpt-4o-mini"
                    required
                    className="mt-1 w-full rounded-lg border border-border-metal bg-white px-3 py-2 font-mono text-xs text-navy outline-none focus:border-electric/60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-navy">API Key / Token</label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={editingId ? "•••••••• (enter new key to replace, or blank to keep)" : "Leave blank for local Ollama"}
                    className="mt-1 w-full rounded-lg border border-border-metal bg-white px-3 py-2 font-mono text-xs text-navy outline-none focus:border-electric/60"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-medium text-navy">Assigned Task Role</label>
                  <select
                    value={taskRole}
                    onChange={(e) => setTaskRole(e.target.value as TaskRole)}
                    className="mt-1 w-full rounded-lg border border-border-metal bg-white px-3 py-2 text-xs text-navy outline-none focus:border-electric/60"
                  >
                    <option value="general">General Purpose & Briefs</option>
                    <option value="planning">Strategic Planning (HQ & PM)</option>
                    <option value="coding">Code Generation (AI Systems)</option>
                    <option value="utility">Fast Utility & Triage (Router & QA)</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 pt-6">
                  <input
                    type="checkbox"
                    id="isPrimaryModelModal"
                    checked={isPrimary}
                    onChange={(e) => setIsPrimary(e.target.checked)}
                    className="h-4 w-4 rounded border-border-metal text-electric focus:ring-electric"
                  />
                  <label htmlFor="isPrimaryModelModal" className="text-xs font-medium text-navy cursor-pointer">
                    Set as Primary Default Model
                  </label>
                </div>
              </div>

              {/* Error or Test Result in Modal */}
              {builderError && (
                <div className="flex items-center gap-2 rounded-lg bg-crimson/10 border border-crimson/20 p-2.5 text-xs text-crimson">
                  <XCircle className="h-4 w-4 shrink-0" />
                  <span>{builderError}</span>
                </div>
              )}
              {builderTestResult?.ok && (
                <div className="flex items-center gap-2 rounded-lg bg-emerald/10 border border-emerald/20 p-2.5 text-xs text-emerald">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>
                    Connection Verified! Responded in {builderTestResult.latencyMs ?? 0}ms.
                  </span>
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-border-metal">
                <button
                  type="button"
                  onClick={handleTestBuilder}
                  disabled={saving || !baseUrl.trim() || !modelName.trim()}
                  className="flex items-center gap-1.5 rounded-lg border border-border-metal bg-white px-3.5 py-2 text-xs font-medium text-navy hover:border-electric/50 hover:bg-electric/5 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5 text-electric" />}
                  Test Endpoint
                </button>

                <button
                  type="submit"
                  disabled={saving || !baseUrl.trim() || !modelName.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-electric to-gold px-4 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : editingId ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  <span>{editingId ? "Save Changes" : "Connect AI Model"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
