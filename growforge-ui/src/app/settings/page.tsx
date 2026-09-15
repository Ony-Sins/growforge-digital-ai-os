"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Book,
  Check,
  ChevronRight,
  CircleDot,
  Copy,
  ExternalLink,
  Globe,
  Key,
  Loader2,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  Webhook,
  X,
  Zap,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProviderStatus {
  id: string;
  label: string;
  source: "vault" | "env" | "none";
  configured: boolean;
}

interface N8nConfig {
  host: { value: string; source: "vault" | "env" | "default" };
  apiKey: { configured: boolean; source: "vault" | "env" | "none" };
}

interface N8nHealth {
  status: "connected" | "offline" | "checking";
  latencyMs?: number;
  detail?: string;
}

interface ConnectorDef {
  id: string;
  name: string;
  method: string;
  url: string;
  authMode: "none" | "bearer" | "header";
  authHeaderName?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CORE_PROVIDERS = [
  {
    id: "gemini",
    label: "Gemini",
    icon: "✦",
    color: "from-blue-500 to-indigo-600",
    badge: "Google DeepMind",
    hint: "GEMINI_API_KEY",
    docsUrl: "https://aistudio.google.com/app/apikey",
  },
  {
    id: "openai",
    label: "OpenAI",
    icon: "◎",
    color: "from-emerald-500 to-teal-600",
    badge: "GPT-4o · o3",
    hint: "OPENAI_API_KEY",
    docsUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    icon: "◈",
    color: "from-orange-500 to-amber-600",
    badge: "Claude Sonnet",
    hint: "ANTHROPIC_API_KEY",
    docsUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "groq",
    label: "Groq",
    icon: "⚡",
    color: "from-purple-500 to-violet-600",
    badge: "Llama 3 · Mixtral",
    hint: "GROQ_API_KEY",
    docsUrl: "https://console.groq.com/keys",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    icon: "⇄",
    color: "from-pink-500 to-rose-600",
    badge: "Multi-model gateway",
    hint: "OPENROUTER_API_KEY",
    docsUrl: "https://openrouter.ai/settings/keys",
  },
] as const;

const EXTERNAL_PROVIDERS = [
  {
    id: "kimi",
    label: "Kimi (Moonshot AI)",
    icon: "🌙",
    color: "from-sky-400 to-blue-500",
    badge: "moonshot-v1-128k",
    baseUrl: "https://api.moonshot.cn/v1",
    docsUrl: "https://platform.moonshot.cn/console/api-keys",
    hint: "OpenAI-compatible — use Custom API slot",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    icon: "🔍",
    color: "from-slate-500 to-slate-700",
    badge: "deepseek-chat · coder",
    baseUrl: "https://api.deepseek.com/v1",
    docsUrl: "https://platform.deepseek.com/api_keys",
    hint: "OpenAI-compatible — use Custom API slot",
  },
  {
    id: "manus",
    label: "Manus / Agentic API",
    icon: "🤖",
    color: "from-violet-500 to-purple-700",
    badge: "Agentic workflows",
    baseUrl: "https://api.manus.im/v1",
    docsUrl: "https://manus.im/docs",
    hint: "OpenAI-compatible — use Custom API slot",
  },
] as const;

const CONNECTOR_PRESETS = [
  {
    label: "HubSpot",
    icon: "🟠",
    method: "POST" as const,
    url: "https://api.hubapi.com/crm/v3/objects/contacts",
    authMode: "bearer" as const,
  },
  {
    label: "Slack",
    icon: "💬",
    method: "POST" as const,
    url: "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
    authMode: "none" as const,
  },
  {
    label: "Webhook",
    icon: "🪝",
    method: "POST" as const,
    url: "https://your-endpoint.com/webhook",
    authMode: "bearer" as const,
  },
];

const GUIDE_TABS = ["n8n API Keys", "MCP Servers", "REST / Webhooks"] as const;
type GuideTab = (typeof GUIDE_TABS)[number];

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-navy/5 text-navy">
        {icon}
      </span>
      <div>
        <h2 className="font-heading text-base font-bold text-navy">{title}</h2>
        {subtitle && <p className="text-xs text-secondary">{subtitle}</p>}
      </div>
    </div>
  );
}

function ConfiguredBadge({ source }: { source: "vault" | "env" | "none" }) {
  if (source === "none") return <span className="rounded-full bg-sunken px-2 py-0.5 text-[10px] font-medium text-muted">Not set</span>;
  return (
    <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${source === "vault" ? "bg-emerald/10 text-emerald" : "bg-electric/10 text-electric"}`}>
      <Check className="h-2.5 w-2.5" />
      {source === "vault" ? "Vault" : "Env"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// AI Providers section
// ---------------------------------------------------------------------------

function ProviderCard({
  providerId,
  label,
  icon,
  color,
  badge,
  hint,
  docsUrl,
  status,
  onSave,
  onDelete,
}: {
  providerId: string;
  label: string;
  icon: string;
  color: string;
  badge: string;
  hint: string;
  docsUrl: string;
  status?: ProviderStatus;
  onSave: (id: string, value: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  async function handleSave() {
    if (!apiKey.trim()) return;
    setSaving(true);
    setErr("");
    try {
      await onSave(providerId, apiKey.trim());
      setApiKey("");
      setSaved(true);
      setTimeout(() => { setSaved(false); setExpanded(false); }, 1500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  const configured = status?.source !== "none";

  return (
    <div className="glass-card rounded-2xl border border-border-metal p-4 transition-all">
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${color} text-lg text-white shadow-sm`}>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-navy text-sm">{label}</span>
            {status && <ConfiguredBadge source={status.source} />}
          </div>
          <p className="text-[11px] text-muted mt-0.5">{badge}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {configured && (
            <button
              type="button"
              onClick={() => onDelete(providerId)}
              className="rounded-lg p-1.5 text-muted hover:bg-sunken hover:text-crimson transition-colors"
              title="Remove key"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          <a
            href={docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg p-1.5 text-muted hover:bg-sunken hover:text-electric transition-colors"
            title="Get API key"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-lg border border-border-metal-strong bg-white px-2.5 py-1 text-xs font-medium text-secondary hover:text-navy transition-colors"
          >
            {configured ? "Update" : "Add Key"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2 border-t border-border-metal pt-3">
          <label className="block text-[11px] font-medium text-secondary uppercase tracking-wide">
            {hint}
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            placeholder="sk-…"
            className="w-full rounded-lg border border-border-metal-strong bg-sunken px-3 py-2 font-mono text-xs text-navy placeholder-muted outline-none focus:border-electric focus:ring-1 focus:ring-electric/20"
          />
          {err && <p className="text-xs text-crimson">{err}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving || !apiKey.trim()}
              onClick={handleSave}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-electric to-electric/80 px-3 py-1.5 text-xs font-semibold text-white shadow-sm disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : saved ? <Check className="h-3 w-3" /> : <Key className="h-3 w-3" />}
              {saved ? "Saved!" : saving ? "Saving…" : "Save Key"}
            </button>
            <button type="button" onClick={() => setExpanded(false)} className="rounded-lg px-3 py-1.5 text-xs text-muted hover:text-navy">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ExternalProviderCard({
  label,
  icon,
  color,
  badge,
  baseUrl,
  docsUrl,
  hint,
  onFillCustom,
}: {
  label: string;
  icon: string;
  color: string;
  badge: string;
  baseUrl: string;
  docsUrl: string;
  hint: string;
  onFillCustom: (baseUrl: string) => void;
}) {
  return (
    <div className="glass-card rounded-2xl border border-border-metal/60 p-4 opacity-90">
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${color} text-lg text-white shadow-sm`}>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-navy text-sm">{label}</span>
            <span className="rounded-full bg-gold/10 px-2 py-0.5 text-[10px] font-semibold text-gold">
              OpenAI-compatible
            </span>
          </div>
          <p className="text-[11px] text-muted mt-0.5">{badge}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <a href={docsUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg p-1.5 text-muted hover:bg-sunken hover:text-electric transition-colors">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <button
            type="button"
            onClick={() => onFillCustom(baseUrl)}
            className="flex items-center gap-1 rounded-lg border border-border-metal-strong bg-white px-2.5 py-1 text-xs font-medium text-secondary hover:text-electric transition-colors"
          >
            Use <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-muted">{hint}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom OpenAI-Compatible API card
// ---------------------------------------------------------------------------

function CustomApiCard() {
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  // Allow external providers to pre-fill this card
  const ref = useRef<{ fill: (url: string) => void }>(null);
  (ref as React.MutableRefObject<{ fill: (url: string) => void }>).current = {
    fill: (url: string) => {
      setBaseUrl(url);
      document.getElementById("custom-api-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
    },
  };

  async function handleSave() {
    if (!baseUrl.trim() || !apiKey.trim()) return;
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/vault/system", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "openrouter", value: apiKey.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Failed to save.");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div id="custom-api-card" className="glass-card rounded-2xl border border-dashed border-electric/40 bg-electric/5 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Globe className="h-4 w-4 text-electric" />
        <span className="font-semibold text-navy text-sm">Custom OpenAI-Compatible API</span>
        <span className="rounded-full bg-electric/10 px-2 py-0.5 text-[10px] font-semibold text-electric">Proxy</span>
      </div>
      <p className="mb-3 text-xs text-secondary">
        Use any OpenAI-compatible endpoint — Kimi, DeepSeek, Manus, LM Studio, vLLM, or your own proxy.
        Click <strong>Use →</strong> on a provider card above to pre-fill the Base URL.
      </p>
      <div className="space-y-2">
        <input
          type="url"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.moonshot.cn/v1"
          className="w-full rounded-lg border border-border-metal-strong bg-white/80 px-3 py-2 text-xs text-navy placeholder-muted outline-none focus:border-electric focus:ring-1 focus:ring-electric/20"
        />
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="API key for this endpoint"
          className="w-full rounded-lg border border-border-metal-strong bg-white/80 px-3 py-2 font-mono text-xs text-navy placeholder-muted outline-none focus:border-electric focus:ring-1 focus:ring-electric/20"
        />
        {err && <p className="text-xs text-crimson">{err}</p>}
        <button
          type="button"
          disabled={saving || !baseUrl.trim() || !apiKey.trim()}
          onClick={handleSave}
          className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-electric to-electric/80 px-3 py-1.5 text-xs font-semibold text-white shadow-sm disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : saved ? <Check className="h-3 w-3" /> : <Key className="h-3 w-3" />}
          {saved ? "Saved!" : saving ? "Saving…" : "Save Custom API"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// n8n Automation Engine card
// ---------------------------------------------------------------------------

function N8nCard() {
  const [config, setConfig] = useState<N8nConfig | null>(null);
  const [health, setHealth] = useState<N8nHealth>({ status: "checking" });
  const [host, setHost] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");
  const [polling, setPolling] = useState(true);

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/vault/system/n8n");
      if (res.ok) {
        const data: N8nConfig = await res.json();
        setConfig(data);
        if (!host) setHost(data.host.value);
      }
    } catch { /* retry on next poll */ }
  }, [host]);

  const checkHealth = useCallback(async () => {
    try {
      setHealth((h) => ({ ...h, status: "checking" }));
      const res = await fetch("/api/vault/system/n8n/health");
      if (res.ok) {
        const data = await res.json();
        setHealth(data as N8nHealth);
      } else {
        setHealth({ status: "offline", detail: `HTTP ${res.status}` });
      }
    } catch {
      setHealth({ status: "offline", detail: "Network error" });
    }
  }, []);

  useEffect(() => {
    loadConfig();
    checkHealth();
  }, [loadConfig, checkHealth]);

  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(checkHealth, 15000);
    return () => clearInterval(interval);
  }, [polling, checkHealth]);

  async function handleSave() {
    const hostVal = host.trim();
    const keyVal = apiKey.trim();
    if (!hostVal && !keyVal) return;
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/vault/system/n8n", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: hostVal || undefined, apiKey: keyVal || undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Save failed.");
      setSaved(true);
      setApiKey("");
      await loadConfig();
      await checkHealth();
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed.");
    } finally {
      setSaving(false);
    }
  }

  const statusColors = {
    connected: "bg-emerald text-white",
    offline: "bg-crimson/10 text-crimson",
    checking: "bg-muted/20 text-muted",
  };
  const statusLabels = {
    connected: `● Connected${health.latencyMs !== undefined ? ` · ${health.latencyMs}ms` : ""}`,
    offline: "○ Offline",
    checking: "◌ Checking…",
  };

  return (
    <div className="glass-card rounded-2xl border border-border-metal p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-rose-600 text-white shadow-sm">
            <Zap className="h-5 w-5" />
          </span>
          <div>
            <span className="font-semibold text-navy text-sm">n8n Self-Hosted</span>
            <p className="text-[11px] text-muted">Automation workflow engine</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setPolling((v) => !v); checkHealth(); }}
            className="rounded-lg p-1.5 text-muted hover:bg-sunken hover:text-electric transition-colors"
            title="Refresh health"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${health.status === "checking" ? "animate-spin" : ""}`} />
          </button>
          <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${statusColors[health.status]}`}>
            {statusLabels[health.status]}
          </span>
        </div>
      </div>

      {health.status === "offline" && health.detail && (
        <div className="mb-3 flex items-start gap-2 rounded-xl bg-crimson/5 p-3 text-xs text-crimson">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{health.detail}. Start n8n with: <code className="font-mono">docker compose -f docker/n8n/docker-compose.yml up -d</code></span>
        </div>
      )}

      <div className="space-y-2">
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-secondary">N8N_HOST</label>
          <input
            type="url"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="http://localhost:5678"
            className="w-full rounded-lg border border-border-metal-strong bg-sunken px-3 py-2 text-xs text-navy placeholder-muted outline-none focus:border-electric focus:ring-1 focus:ring-electric/20"
          />
          {config && (
            <p className="mt-0.5 text-[10px] text-muted">
              Current: <code className="font-mono">{config.host.value}</code> · source: {config.host.source}
            </p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-secondary">
            N8N_API_KEY
            {config?.apiKey.configured && <ConfiguredBadge source={config.apiKey.source} />}
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={config?.apiKey.configured ? "••••••••••• (already set — enter to replace)" : "Paste API key from n8n Settings → API"}
            className="w-full rounded-lg border border-border-metal-strong bg-sunken px-3 py-2 font-mono text-xs text-navy placeholder-muted outline-none focus:border-electric focus:ring-1 focus:ring-electric/20"
          />
        </div>
        {err && <p className="text-xs text-crimson">{err}</p>}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            disabled={saving || (!host.trim() && !apiKey.trim())}
            onClick={handleSave}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-orange-500 to-rose-500 px-4 py-1.5 text-xs font-semibold text-white shadow-sm disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : saved ? <Check className="h-3 w-3" /> : <Key className="h-3 w-3" />}
            {saved ? "Saved!" : saving ? "Saving…" : "Save n8n Config"}
          </button>
          <a
            href="http://localhost:5678"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-electric hover:underline"
          >
            Open n8n <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connectors section
// ---------------------------------------------------------------------------

function ConnectorCard({ connector, onDelete }: { connector: ConnectorDef; onDelete: (id: string) => void }) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/connectors/${encodeURIComponent(connector.id)}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const d = await res.json().catch(() => ({}));
      setTestResult({ ok: res.ok, msg: d.message ?? (res.ok ? "Connection successful." : `HTTP ${res.status}`) });
    } catch (e) {
      setTestResult({ ok: false, msg: e instanceof Error ? e.message : "Network error." });
    } finally {
      setTesting(false);
    }
    setTimeout(() => setTestResult(null), 4000);
  }

  const methodColors: Record<string, string> = {
    GET: "text-emerald",
    POST: "text-electric",
    PUT: "text-gold",
    PATCH: "text-purple-500",
    DELETE: "text-crimson",
  };

  return (
    <div className="glass-card rounded-2xl border border-border-metal p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sunken">
          <Webhook className="h-4 w-4 text-secondary" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-navy">{connector.name}</span>
            <span className={`font-mono text-[10px] font-bold ${methodColors[connector.method] ?? "text-muted"}`}>
              {connector.method}
            </span>
            {connector.authMode !== "none" && (
              <span className="flex items-center gap-0.5 rounded-full bg-gold/10 px-1.5 py-0.5 text-[10px] font-medium text-gold">
                <Shield className="h-2.5 w-2.5" /> Auth
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate font-mono text-[10px] text-muted">{connector.url}</p>
          {testResult && (
            <p className={`mt-1 text-xs ${testResult.ok ? "text-emerald" : "text-crimson"}`}>
              {testResult.ok ? "✓" : "✗"} {testResult.msg}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            disabled={testing}
            onClick={handleTest}
            className="flex items-center gap-1 rounded-lg border border-border-metal-strong bg-white px-2.5 py-1 text-xs font-medium text-secondary hover:text-electric transition-colors disabled:opacity-50"
          >
            {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <CircleDot className="h-3 w-3" />}
            Test
          </button>
          <button
            type="button"
            onClick={() => onDelete(connector.id)}
            className="rounded-lg p-1.5 text-muted hover:bg-sunken hover:text-crimson transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function NewConnectorForm({
  onCreated,
  onCancel,
}: {
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState("POST");
  const [authMode, setAuthMode] = useState<"none" | "bearer" | "header">("none");
  const [authHeaderName, setAuthHeaderName] = useState("");
  const [secretValue, setSecretValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  function applyPreset(preset: (typeof CONNECTOR_PRESETS)[number]) {
    setName(preset.label);
    setUrl(preset.url);
    setMethod(preset.method);
    setAuthMode(preset.authMode);
  }

  async function handleCreate() {
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, url, method, authMode, authHeaderName, secretValue }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Failed.");
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-electric/30 bg-electric/5 p-4 space-y-3">
      <p className="text-xs font-semibold text-navy">Quick-start presets:</p>
      <div className="flex flex-wrap gap-2">
        {CONNECTOR_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => applyPreset(p)}
            className="flex items-center gap-1.5 rounded-full border border-border-metal bg-white px-3 py-1 text-xs font-medium text-secondary hover:border-electric hover:text-electric transition-colors"
          >
            {p.icon} {p.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-secondary">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="HubSpot CRM"
            className="w-full rounded-lg border border-border-metal-strong bg-white/80 px-3 py-2 text-xs text-navy placeholder-muted outline-none focus:border-electric"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-secondary">Method</label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="w-full rounded-lg border border-border-metal-strong bg-white/80 px-3 py-2 text-xs text-navy outline-none focus:border-electric"
          >
            {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-secondary">Endpoint URL (https only)</label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://api.hubapi.com/…"
          className="w-full rounded-lg border border-border-metal-strong bg-white/80 px-3 py-2 text-xs text-navy placeholder-muted outline-none focus:border-electric"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-secondary">Auth</label>
          <select
            value={authMode}
            onChange={(e) => setAuthMode(e.target.value as "none" | "bearer" | "header")}
            className="w-full rounded-lg border border-border-metal-strong bg-white/80 px-3 py-2 text-xs text-navy outline-none focus:border-electric"
          >
            <option value="none">No auth</option>
            <option value="bearer">Bearer token</option>
            <option value="header">Custom header</option>
          </select>
        </div>
        {authMode === "header" && (
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-secondary">Header name</label>
            <input
              value={authHeaderName}
              onChange={(e) => setAuthHeaderName(e.target.value)}
              placeholder="X-API-Key"
              className="w-full rounded-lg border border-border-metal-strong bg-white/80 px-3 py-2 text-xs text-navy outline-none focus:border-electric"
            />
          </div>
        )}
      </div>
      {authMode !== "none" && (
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-secondary">Secret / Token</label>
          <input
            type="password"
            value={secretValue}
            onChange={(e) => setSecretValue(e.target.value)}
            placeholder="Stored encrypted in vault"
            className="w-full rounded-lg border border-border-metal-strong bg-white/80 px-3 py-2 font-mono text-xs text-navy placeholder-muted outline-none focus:border-electric"
          />
        </div>
      )}
      {err && <p className="text-xs text-crimson">{err}</p>}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          disabled={saving || !name.trim() || !url.trim()}
          onClick={handleCreate}
          className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-electric to-electric/80 px-4 py-1.5 text-xs font-semibold text-white shadow-sm disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          {saving ? "Creating…" : "Create Connector"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-xs text-muted hover:text-navy">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Setup & MCP Guide drawer
// ---------------------------------------------------------------------------

const GUIDE_CONTENT: Record<GuideTab, React.ReactNode> = {
  "n8n API Keys": (
    <div className="space-y-4 text-sm text-secondary">
      <h3 className="font-bold text-navy">Connecting n8n to GrowForge AI OS</h3>
      <ol className="space-y-3 list-decimal list-inside">
        <li>
          <strong>Start n8n via Docker:</strong>
          <pre className="mt-1 rounded-lg bg-code p-3 font-mono text-[11px] text-on-navy overflow-x-auto">
            {`docker compose -f docker/n8n/docker-compose.yml up -d`}
          </pre>
        </li>
        <li>
          <strong>Open n8n</strong> at{" "}
          <a href="http://localhost:5678" target="_blank" rel="noopener noreferrer" className="text-electric underline">
            http://localhost:5678
          </a>{" "}
          and create your admin account.
        </li>
        <li>
          <strong>Generate an API key:</strong> go to{" "}
          <kbd className="rounded bg-sunken px-1.5 py-0.5 text-[11px] font-mono text-navy">Settings → n8n API → Create API Key</kbd>
        </li>
        <li>
          <strong>Paste the key</strong> into the N8N_API_KEY field in the Automation Engines card on this page.
        </li>
        <li>
          The health badge will turn <span className="font-semibold text-emerald">● Connected</span> once saved and n8n is reachable.
        </li>
      </ol>
      <div className="rounded-xl bg-gold/10 p-3 text-xs text-navy">
        <strong>Tip:</strong> GrowForge sub-agents can autonomously create, patch, and execute n8n workflows via the{" "}
        <code className="font-mono">manage_n8n_workflow</code> tool — no manual n8n editing needed once the key is set.
      </div>
    </div>
  ),
  "MCP Servers": (
    <div className="space-y-4 text-sm text-secondary">
      <h3 className="font-bold text-navy">Model Context Protocol (MCP) Servers</h3>
      <p>
        MCP servers extend GrowForge agents with additional tools — file access, databases, browser control, etc. — via a
        standardised JSON-RPC protocol.
      </p>
      <h4 className="font-semibold text-navy">Adding an MCP Server</h4>
      <ol className="space-y-2 list-decimal list-inside">
        <li>Install the MCP server package (e.g. <code className="font-mono text-xs bg-sunken px-1 rounded">npm i @modelcontextprotocol/server-filesystem</code>)</li>
        <li>
          Add the server config to{" "}
          <code className="font-mono text-xs bg-sunken px-1 rounded">mcp_config.json</code> in the project root:
          <pre className="mt-1 rounded-lg bg-code p-3 font-mono text-[11px] text-on-navy overflow-x-auto">
{`{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"]
    }
  }
}`}
          </pre>
        </li>
        <li>Restart the AI OS dev server — tools registered by the MCP server appear automatically in the tool loop.</li>
      </ol>
      <div className="rounded-xl bg-electric/5 p-3 text-xs text-navy">
        <strong>Popular servers:</strong> filesystem, puppeteer (browser), sqlite, postgres, github, slack, google-maps
      </div>
    </div>
  ),
  "REST / Webhooks": (
    <div className="space-y-4 text-sm text-secondary">
      <h3 className="font-bold text-navy">Custom REST & Webhook Connectors</h3>
      <p>
        Connectors let GrowForge agents fire real outbound HTTP requests to external services — CRMs, ticketing systems,
        Slack, or any REST API. Every connector call requires <strong>owner approval</strong> before it executes.
      </p>
      <h4 className="font-semibold text-navy">Connector Authentication Options</h4>
      <ul className="space-y-2 list-disc list-inside">
        <li><strong>No auth</strong> — for public webhooks (e.g. Slack incoming webhooks)</li>
        <li><strong>Bearer token</strong> — standard OAuth2 / API key as <code className="font-mono text-xs">Authorization: Bearer …</code></li>
        <li><strong>Custom header</strong> — for APIs that use a custom header name (e.g. <code className="font-mono text-xs">X-API-Key</code>, <code className="font-mono text-xs">apiKey</code>)</li>
      </ul>
      <h4 className="font-semibold text-navy">Security</h4>
      <ul className="space-y-1 list-disc list-inside text-xs">
        <li>Credentials are stored encrypted in the server vault — never sent to the browser</li>
        <li>SSRF protection blocks private/internal IPs and cloud metadata endpoints</li>
        <li>Only <code className="font-mono">https://</code> external URLs are allowed</li>
      </ul>
      <div className="rounded-xl bg-gold/10 p-3 text-xs text-navy">
        <strong>HubSpot example:</strong> set method = POST, URL = <code className="font-mono">https://api.hubapi.com/crm/v3/objects/contacts</code>,
        auth = Bearer, secret = your HubSpot private app token.
      </div>
    </div>
  ),
};

function GuideDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<GuideTab>("n8n API Keys");

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-navy/20 backdrop-blur-sm"
          onClick={onClose}
        />
      )}
      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col bg-white shadow-2xl transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-center justify-between border-b border-border-metal px-6 py-4">
          <div className="flex items-center gap-2">
            <Book className="h-5 w-5 text-electric" />
            <span className="font-heading font-bold text-navy">Setup & MCP Guide</span>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-sunken hover:text-navy transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex border-b border-border-metal">
          {GUIDE_TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors ${tab === t ? "border-b-2 border-electric text-electric" : "text-muted hover:text-navy"}`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {GUIDE_CONTENT[tab]}
        </div>

        <div className="border-t border-border-metal p-4">
          <div className="flex items-center gap-2 text-xs text-muted">
            <Copy className="h-3.5 w-3.5" />
            <span>All credentials are stored encrypted server-side — never exposed to the client.</span>
          </div>
        </div>
      </aside>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main Settings Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [connectors, setConnectors] = useState<ConnectorDef[]>([]);
  const [showNewConnector, setShowNewConnector] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const customApiRef = useRef<HTMLDivElement>(null);

  async function loadProviders() {
    try {
      const res = await fetch("/api/vault/system");
      if (res.ok) {
        const data = await res.json();
        setProviders(data.providers ?? []);
      }
    } catch { /* silently retry */ }
  }

  async function loadConnectors() {
    try {
      const res = await fetch("/api/connectors");
      if (res.ok) {
        const data = await res.json();
        setConnectors(data.connectors ?? []);
      }
    } catch { /* silently retry */ }
  }

  useEffect(() => {
    loadProviders();
    loadConnectors();
  }, []);

  async function saveProvider(providerId: string, value: string) {
    const res = await fetch("/api/vault/system", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: providerId, value }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error ?? "Failed to save.");
    await loadProviders();
  }

  async function deleteProvider(providerId: string) {
    await fetch(`/api/vault/system/${encodeURIComponent(providerId)}`, { method: "DELETE" });
    await loadProviders();
  }

  async function deleteConnector(id: string) {
    await fetch(`/api/connectors/${encodeURIComponent(id)}`, { method: "DELETE" });
    await loadConnectors();
  }

  function fillCustomApi(baseUrl: string) {
    setCustomBaseUrl(baseUrl);
    customApiRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* Guide drawer */}
      <GuideDrawer open={guideOpen} onClose={() => setGuideOpen(false)} />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-metal bg-white/80 px-6 py-4 backdrop-blur-sm">
        <div>
          <h1 className="font-heading text-xl font-bold text-navy">Integrations & Settings</h1>
          <p className="text-xs text-secondary">Manage AI providers, automation engines, and custom connectors.</p>
        </div>
        <button
          type="button"
          onClick={() => setGuideOpen(true)}
          className="flex items-center gap-2 rounded-xl border border-electric/30 bg-electric/5 px-4 py-2 text-sm font-medium text-electric hover:bg-electric/10 transition-colors"
        >
          <Book className="h-4 w-4" />
          📖 Setup &amp; MCP Guide
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-10">

        {/* ── AI Language Providers ──────────────────────────────────────── */}
        <section>
          <SectionHeader
            icon={<span className="text-lg">🤖</span>}
            title="AI Language Providers"
            subtitle="API keys stored encrypted in the server vault — never sent to the browser."
          />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {CORE_PROVIDERS.map((p) => {
              const status = providers.find((s) => s.id === p.id);
              return (
                <ProviderCard
                  key={p.id}
                  providerId={p.id}
                  label={p.label}
                  icon={p.icon}
                  color={p.color}
                  badge={p.badge}
                  hint={p.hint}
                  docsUrl={p.docsUrl}
                  status={status}
                  onSave={saveProvider}
                  onDelete={deleteProvider}
                />
              );
            })}
          </div>

          {/* External / OpenAI-compatible providers */}
          <div className="mt-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">
              OpenAI-Compatible Providers
            </p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {EXTERNAL_PROVIDERS.map((p) => (
                <ExternalProviderCard
                  key={p.id}
                  label={p.label}
                  icon={p.icon}
                  color={p.color}
                  badge={p.badge}
                  baseUrl={p.baseUrl}
                  docsUrl={p.docsUrl}
                  hint={p.hint}
                  onFillCustom={fillCustomApi}
                />
              ))}
            </div>
          </div>

          {/* Custom OpenAI-Compatible API card */}
          <div className="mt-4" ref={customApiRef}>
            <CustomApiCardWithUrl prefillUrl={customBaseUrl} />
          </div>
        </section>

        {/* ── Automation Engines ─────────────────────────────────────────── */}
        <section>
          <SectionHeader
            icon={<Zap className="h-5 w-5" />}
            title="Automation Engines"
            subtitle="n8n self-hosted workflow automation — agents can build and run workflows autonomously."
          />
          <N8nCard />
        </section>

        {/* ── Custom Connectors ──────────────────────────────────────────── */}
        <section>
          <div className="mb-5 flex items-center justify-between">
            <SectionHeader
              icon={<Webhook className="h-5 w-5" />}
              title="Custom Connectors"
              subtitle="Outbound REST calls to external services — require owner approval before firing."
            />
            <button
              type="button"
              onClick={() => setShowNewConnector((v) => !v)}
              className="flex items-center gap-1.5 rounded-xl border border-electric/30 bg-electric/5 px-3 py-1.5 text-xs font-medium text-electric hover:bg-electric/10 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Connector
            </button>
          </div>

          {showNewConnector && (
            <div className="mb-4">
              <NewConnectorForm
                onCreated={() => { setShowNewConnector(false); loadConnectors(); }}
                onCancel={() => setShowNewConnector(false)}
              />
            </div>
          )}

          {connectors.length === 0 && !showNewConnector ? (
            <div className="rounded-2xl border border-dashed border-border-metal-strong bg-sunken p-8 text-center">
              <Webhook className="mx-auto mb-2 h-8 w-8 text-muted" />
              <p className="text-sm font-medium text-secondary">No connectors yet</p>
              <p className="mt-1 text-xs text-muted">Add a HubSpot, Slack, or custom webhook to let agents trigger real actions.</p>
              <button
                type="button"
                onClick={() => setShowNewConnector(true)}
                className="mt-4 flex items-center gap-1.5 mx-auto rounded-xl bg-gradient-to-r from-electric to-electric/80 px-4 py-2 text-xs font-semibold text-white shadow-sm"
              >
                <Plus className="h-3.5 w-3.5" /> Add First Connector
              </button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {connectors.map((c) => (
                <ConnectorCard key={c.id} connector={c} onDelete={deleteConnector} />
              ))}
            </div>
          )}
        </section>

        {/* Spacer */}
        <div className="h-8" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CustomApiCardWithUrl — wrapper that accepts the pre-fill URL as a prop
// ---------------------------------------------------------------------------

function CustomApiCardWithUrl({ prefillUrl }: { prefillUrl: string }) {
  const [baseUrl, setBaseUrl] = useState(prefillUrl);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (prefillUrl) setBaseUrl(prefillUrl);
  }, [prefillUrl]);

  async function handleSave() {
    if (!baseUrl.trim() || !apiKey.trim()) return;
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/vault/system", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "openrouter", value: apiKey.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Failed to save.");
      setSaved(true);
      setApiKey("");
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="glass-card rounded-2xl border border-dashed border-electric/40 bg-electric/5 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Globe className="h-4 w-4 text-electric" />
        <span className="font-semibold text-navy text-sm">Custom OpenAI-Compatible API</span>
        <span className="rounded-full bg-electric/10 px-2 py-0.5 text-[10px] font-semibold text-electric">Proxy</span>
      </div>
      <p className="mb-3 text-xs text-secondary">
        Use any OpenAI-compatible endpoint — Kimi, DeepSeek, Manus, LM Studio, vLLM, or your own proxy.
        Click <strong>Use →</strong> on a provider card above to pre-fill the Base URL.
      </p>
      <div className="space-y-2">
        <input
          type="url"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.moonshot.cn/v1"
          className="w-full rounded-lg border border-border-metal-strong bg-white/80 px-3 py-2 text-xs text-navy placeholder-muted outline-none focus:border-electric focus:ring-1 focus:ring-electric/20"
        />
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="API key for this endpoint"
          className="w-full rounded-lg border border-border-metal-strong bg-white/80 px-3 py-2 font-mono text-xs text-navy placeholder-muted outline-none focus:border-electric focus:ring-1 focus:ring-electric/20"
        />
        {err && <p className="text-xs text-crimson">{err}</p>}
        <button
          type="button"
          disabled={saving || !baseUrl.trim() || !apiKey.trim()}
          onClick={handleSave}
          className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-electric to-electric/80 px-3 py-1.5 text-xs font-semibold text-white shadow-sm disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : saved ? <Check className="h-3 w-3" /> : <Key className="h-3 w-3" />}
          {saved ? "Saved!" : saving ? "Saving…" : "Save Custom API"}
        </button>
      </div>
    </div>
  );
}
