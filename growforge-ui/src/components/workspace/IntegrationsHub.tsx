"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDot,
  ExternalLink,
  FileText,
  Frame,
  GitBranch,
  Grid2x2,
  HardDrive,
  Key,
  Loader2,
  Lock,
  Mail,
  MessagesSquare,
  Pencil,
  Plug,
  Plus,
  RefreshCw,
  Server,
  ShieldAlert,
  Sparkles,
  Target,
  Trash2,
  Triangle,
  Users,
  X,
  XCircle,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { MCP_CATALOG, type CatalogEntry } from "@/lib/mcp/catalog";
import { CONNECTOR_BRAND_ICONS } from "@/lib/connectorIcons";
import { useAppState } from "@/lib/appState";
import { AiModelManager } from "./AiModelManager";

interface N8nConfig {
  host: { value: string; source: "vault" | "env" | "default" };
  apiKey: { configured: boolean; source: "vault" | "env" | "none" };
}

interface N8nHealth {
  status: "connected" | "offline" | "checking";
  latencyMs?: number;
  detail?: string;
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

/** n8n connection card — ported from the orphaned, unreachable /settings
 *  page (2026-09-17 Settings consolidation): that page had zero links to it
 *  anywhere in the app, but was the only place a user could configure
 *  N8N_HOST/N8N_API_KEY through the UI at all. This is real, working
 *  functionality that belongs on the one reachable Settings surface. */
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
    } catch {
      // retry on next poll
    }
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
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
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-electric to-gold text-white shadow-sm">
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
            onClick={() => {
              setPolling((v) => !v);
              checkHealth();
            }}
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
          <span>{health.detail}. Start your local n8n instance, then refresh.</span>
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
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-electric to-gold px-4 py-1.5 text-xs font-semibold text-white shadow-sm disabled:opacity-50"
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

interface ConnectorRow {
  id: string;
  name: string;
  method: string;
  url: string;
  authMode: "none" | "bearer" | "header";
  authHeaderName?: string;
  hasSecret: boolean;
  createdAt: string;
}

type TestResult = { ok: boolean; message: string } | null;

function ConnectorsSection() {
  const [connectors, setConnectors] = useState<ConnectorRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [method, setMethod] = useState("GET");
  const [url, setUrl] = useState("");
  const [authMode, setAuthMode] = useState<"none" | "bearer" | "header">("none");
  const [authHeaderName, setAuthHeaderName] = useState("");
  const [secretValue, setSecretValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});

  async function refresh() {
    const res = await fetch("/api/connectors");
    if (!res.ok) return;
    const data = await res.json();
    setConnectors(Array.isArray(data.connectors) ? data.connectors : []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    refresh();
  }, []);

  function handleEdit(c: ConnectorRow) {
    setEditingId(c.id);
    setName(c.name);
    setMethod(c.method);
    setUrl(c.url);
    setAuthMode(c.authMode);
    setAuthHeaderName(c.authHeaderName || "");
    setSecretValue("");
    setError(null);
  }

  function handleCancelEdit() {
    setEditingId(null);
    setName("");
    setUrl("");
    setAuthHeaderName("");
    setSecretValue("");
    setAuthMode("none");
    setError(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (editingId) {
        const res = await fetch(`/api/connectors/${encodeURIComponent(editingId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            method,
            url,
            authMode,
            authHeaderName: authMode === "header" ? authHeaderName : undefined,
            secretValue: authMode !== "none" && secretValue ? secretValue : undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Couldn't update the connector.");
        } else {
          handleCancelEdit();
          await refresh();
        }
      } else {
        const res = await fetch("/api/connectors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            method,
            url,
            authMode,
            authHeaderName: authMode === "header" ? authHeaderName : undefined,
            secretValue: authMode !== "none" ? secretValue : undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Couldn't create the connector.");
        } else {
          handleCancelEdit();
          await refresh();
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleTest(id: string) {
    setTestResults((prev) => ({ ...prev, [id]: null }));
    const res = await fetch(`/api/connectors/${encodeURIComponent(id)}/test`, { method: "POST" });
    const data = await res.json();
    setTestResults((prev) => ({ ...prev, [id]: data }));
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/connectors/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) {
      if (editingId === id) handleCancelEdit();
      await refresh();
    }
  }

  return (
    <div className="mt-6 border-t border-border-metal pt-5">
      <div className="mb-3 flex items-center gap-2">
        <Plug className="h-4 w-4 text-electric" />
        <h3 className="font-heading text-sm font-semibold text-navy">Custom Connectors</h3>
      </div>
      <p className="text-xs text-secondary">
        Wire in any REST endpoint — a webhook, an internal tool, a third-party API HubSpot doesn&apos;t cover. Credentials
        are encrypted server-side the same way as provider keys, never returned to the browser.
      </p>

      {connectors.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {connectors.map((c) => (
            <li key={c.id} className="rounded-lg border border-border-metal bg-white/70 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="shrink-0 rounded bg-navy px-1.5 py-0.5 font-mono text-[10px] font-semibold text-on-navy">
                  {c.method}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-navy">{c.name}</span>
                {c.hasSecret && (
                  <span className="shrink-0 rounded-full bg-emerald/10 px-2 py-0.5 text-[10px] font-medium text-emerald ring-1 ring-emerald/25">
                    auth set
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleTest(c.id)}
                  className="shrink-0 rounded-md border border-border-metal px-2 py-1 text-[11px] font-medium text-secondary transition-colors hover:border-electric/40 hover:text-electric"
                >
                  Test
                </button>
                <button
                  type="button"
                  onClick={() => handleEdit(c)}
                  title={`Edit ${c.name}`}
                  aria-label={`Edit ${c.name}`}
                  className="shrink-0 rounded-md p-1 text-muted transition-colors hover:bg-sunken hover:text-electric"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(c.id)}
                  aria-label={`Remove ${c.name}`}
                  className="shrink-0 rounded-md p-1 text-muted transition-colors hover:bg-crimson/10 hover:text-crimson"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-1 truncate font-mono text-[11px] text-muted">{c.url}</p>
              {testResults[c.id] && (
                <p className={`mt-1.5 flex items-center gap-1.5 text-xs ${testResults[c.id]!.ok ? "text-emerald" : "text-crimson"}`}>
                  {testResults[c.id]!.ok ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5" />
                  )}
                  {testResults[c.id]!.message}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSave} className="mt-3 space-y-2 rounded-lg border border-dashed border-border-metal p-3">
        <div className="flex items-center justify-between pb-1">
          <span className="text-xs font-semibold text-navy">
            {editingId ? "Edit Custom Connector" : "Add Custom Connector"}
          </span>
          {editingId && (
            <button
              type="button"
              onClick={handleCancelEdit}
              className="flex items-center gap-1 text-[11px] text-muted hover:text-navy"
            >
              <X className="h-3 w-3" /> Cancel Edit
            </button>
          )}
        </div>

        <div className="grid grid-cols-[5rem_1fr] gap-2">
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="rounded-lg border border-border-metal bg-white/80 px-2 py-2 text-xs text-navy outline-none focus:border-electric/50"
          >
            {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Connector name"
            className="rounded-lg border border-border-metal bg-white/80 px-2.5 py-2 text-xs text-navy outline-none focus:border-electric/50"
          />
        </div>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://api.example.com/endpoint (https only, no internal/private hosts)"
          className="w-full rounded-lg border border-border-metal bg-white/80 px-2.5 py-2 font-mono text-xs text-navy outline-none focus:border-electric/50"
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            value={authMode}
            onChange={(e) => setAuthMode(e.target.value as typeof authMode)}
            className="rounded-lg border border-border-metal bg-white/80 px-2.5 py-2 text-xs text-navy outline-none focus:border-electric/50"
          >
            <option value="none">No auth</option>
            <option value="bearer">Bearer token</option>
            <option value="header">Custom header</option>
          </select>
          {authMode === "header" ? (
            <input
              type="text"
              value={authHeaderName}
              onChange={(e) => setAuthHeaderName(e.target.value)}
              placeholder="Header name (e.g. X-Api-Key)"
              className="rounded-lg border border-border-metal bg-white/80 px-2.5 py-2 text-xs text-navy outline-none focus:border-electric/50"
            />
          ) : (
            <div />
          )}
        </div>
        {authMode !== "none" && (
          <input
            type="password"
            value={secretValue}
            onChange={(e) => setSecretValue(e.target.value)}
            placeholder={editingId ? "•••••••• (enter new secret to replace, or blank to keep)" : "Token / key value"}
            className="w-full rounded-lg border border-border-metal bg-white/80 px-2.5 py-2 font-mono text-xs text-navy outline-none focus:border-electric/50"
          />
        )}
        <button
          type="submit"
          disabled={!name.trim() || !url.trim() || busy}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-electric to-gold px-3 py-2 text-xs font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : editingId ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          <span>{editingId ? "Save Connector" : "Add Connector"}</span>
        </button>
        {error && <p className="text-xs text-crimson">{error}</p>}
      </form>
    </div>
  );
}

interface McpServerRow {
  id: string;
  name: string;
  transport: "stdio" | "http";
  command?: string;
  args?: string[];
  url?: string;
  allowedDepartments: string[];
  hasCredential: boolean;
  catalogId?: string;
  authHeader?: string;
}

interface DepartmentOption {
  id: string;
  name: string;
}

type McpTestResult = { ok: true; tools: { name: string; description: string }[] } | { ok: false; error: string } | null;

function McpServerRowItem({
  server,
  departments,
  onChanged,
}: {
  server: McpServerRow;
  departments: DepartmentOption[];
  onChanged: () => void;
}) {
  const { uiMode } = useAppState();
  const [test, setTest] = useState<McpTestResult>(null);
  const [testing, setTesting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);

  // In-place edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(server.name);
  const [editUrl, setEditUrl] = useState(server.url || "");
  const [editCommand, setEditCommand] = useState(server.command || "");
  const [editArgs, setEditArgs] = useState((server.args ?? []).join(" "));
  const [editBearerToken, setEditBearerToken] = useState("");
  const [editAuthHeader, setEditAuthHeader] = useState(server.authHeader || "");
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  function startEdit() {
    setEditName(server.name);
    setEditUrl(server.url || "");
    setEditCommand(server.command || "");
    setEditArgs((server.args ?? []).join(" "));
    setEditBearerToken("");
    setEditAuthHeader(server.authHeader || "");
    setEditError(null);
    setIsEditing(true);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    setEditError(null);
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/mcp/${encodeURIComponent(server.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          url: server.transport === "http" ? editUrl.trim() : undefined,
          command: server.transport === "stdio" ? editCommand.trim() : undefined,
          args: server.transport === "stdio" ? editArgs.split(/\s+/).filter(Boolean) : undefined,
          bearerToken: server.transport === "http" && editBearerToken ? editBearerToken.trim() : undefined,
          authHeader: server.transport === "http" ? editAuthHeader.trim() || undefined : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error ?? "Failed to update MCP server.");
      } else {
        setIsEditing(false);
        onChanged();
      }
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Error saving changes.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTest(null);
    try {
      const res = await fetch(`/api/mcp/${encodeURIComponent(server.id)}/test`, { method: "POST" });
      const data = await res.json();
      setTest(data);
      // Keep collapsed by default to avoid layout shifts
      setExpanded(false);
    } finally {
      setTesting(false);
    }
  }

  async function toggleDepartment(deptId: string) {
    const has = server.allowedDepartments.includes(deptId);
    const next = has ? server.allowedDepartments.filter((d) => d !== deptId) : [...server.allowedDepartments, deptId];
    setBusy(true);
    try {
      await fetch(`/api/mcp/${encodeURIComponent(server.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowedDepartments: next }),
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      const res = await fetch(`/api/mcp/${encodeURIComponent(server.id)}`, { method: "DELETE" });
      if (res.ok) onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-lg border border-border-metal bg-white/70 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="shrink-0 rounded bg-navy px-1.5 py-0.5 font-mono text-[10px] font-semibold text-on-navy">
          {server.transport}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-navy">{server.name}</span>
        {server.hasCredential && (
          <span className="shrink-0 rounded-full bg-emerald/10 px-2 py-0.5 text-[10px] font-medium text-emerald ring-1 ring-emerald/25">
            credential set
          </span>
        )}
        <button
          type="button"
          onClick={handleTest}
          disabled={testing || busy}
          className="shrink-0 rounded-md border border-border-metal px-2 py-1 text-[11px] font-medium text-secondary transition-colors hover:border-electric/40 hover:text-electric disabled:opacity-50"
        >
          {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : "Test"}
        </button>
        <button
          type="button"
          onClick={startEdit}
          disabled={busy}
          title={`Edit ${server.name}`}
          aria-label={`Edit ${server.name}`}
          className="shrink-0 rounded-md p-1 text-muted transition-colors hover:bg-sunken hover:text-electric disabled:opacity-50"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={busy}
          aria-label={`Remove ${server.name}`}
          className="shrink-0 rounded-md p-1 text-muted transition-colors hover:bg-crimson/10 hover:text-crimson disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="mt-1 truncate font-mono text-[11px] text-muted">
        {server.transport === "stdio" ? `${server.command} ${(server.args ?? []).join(" ")}` : server.url}
      </p>

      {/* In-place Edit Form */}
      {isEditing && (
        <form onSubmit={handleSaveEdit} className="mt-2.5 space-y-2 rounded-lg border border-dashed border-border-metal bg-sunken/40 p-3">
          <div className="flex items-center justify-between pb-1">
            <span className="text-xs font-semibold text-navy">Edit MCP Server</span>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="flex items-center gap-1 text-[11px] text-muted hover:text-navy"
            >
              <X className="h-3 w-3" /> Cancel
            </button>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-navy">Server Name</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="mt-0.5 w-full rounded-lg border border-border-metal bg-white px-2.5 py-1.5 text-xs text-navy outline-none focus:border-electric/50"
              required
            />
          </div>
          {server.transport === "http" ? (
            <>
              <div>
                <label className="block text-[11px] font-medium text-navy">MCP Server URL</label>
                <input
                  type="url"
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  className="mt-0.5 w-full rounded-lg border border-border-metal bg-white px-2.5 py-1.5 font-mono text-xs text-navy outline-none focus:border-electric/50"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-navy">Auth Header (Optional)</label>
                  <input
                    type="text"
                    value={editAuthHeader}
                    onChange={(e) => setEditAuthHeader(e.target.value)}
                    placeholder="e.g. X-Api-Key"
                    className="mt-0.5 w-full rounded-lg border border-border-metal bg-white px-2.5 py-1.5 text-xs text-navy outline-none focus:border-electric/50"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-navy">Bearer Token / Credential</label>
                  <input
                    type="password"
                    value={editBearerToken}
                    onChange={(e) => setEditBearerToken(e.target.value)}
                    placeholder="•••••••• (leave blank to keep)"
                    className="mt-0.5 w-full rounded-lg border border-border-metal bg-white px-2.5 py-1.5 font-mono text-xs text-navy outline-none focus:border-electric/50"
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-navy">Command</label>
                <input
                  type="text"
                  value={editCommand}
                  onChange={(e) => setEditCommand(e.target.value)}
                  className="mt-0.5 w-full rounded-lg border border-border-metal bg-white px-2.5 py-1.5 font-mono text-xs text-navy outline-none focus:border-electric/50"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-navy">Args</label>
                <input
                  type="text"
                  value={editArgs}
                  onChange={(e) => setEditArgs(e.target.value)}
                  className="mt-0.5 w-full rounded-lg border border-border-metal bg-white px-2.5 py-1.5 font-mono text-xs text-navy outline-none focus:border-electric/50"
                />
              </div>
            </div>
          )}
          {editError && <p className="text-xs text-crimson">{editError}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded-md border border-border-metal px-3 py-1 text-xs text-muted hover:text-navy"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingEdit || !editName.trim()}
              className="flex items-center gap-1 rounded-md bg-gradient-to-r from-electric to-gold px-3 py-1 text-xs font-semibold text-white shadow-sm disabled:opacity-60"
            >
              {savingEdit ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Save Changes
            </button>
          </div>
        </form>
      )}

      {test && (
        <div className={`mt-1.5 flex items-start gap-1.5 text-xs ${test.ok ? "text-emerald" : "text-crimson"}`}>
          {test.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          <span>{test.ok ? `Connected — ${test.tools.length} tool${test.tools.length === 1 ? "" : "s"} available` : test.error}</span>
        </div>
      )}
      {test?.ok && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 flex items-center gap-1 text-[11px] text-muted hover:text-secondary font-medium"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? "Hide tools" : `Show ${test.tools.length} tool${test.tools.length === 1 ? "" : "s"}`}
        </button>
      )}
      {test?.ok && expanded && (
        <ul className="mt-1.5 space-y-1 rounded-lg bg-sunken px-2.5 py-2 max-h-36 overflow-y-auto border border-border-metal/50">
          {test.tools.map((t) => (
            <li key={t.name} className="text-[11px] text-secondary">
              <span className="font-mono font-medium text-navy">{t.name}</span>
              {t.description ? ` — ${t.description}` : ""}
            </li>
          ))}
        </ul>
      )}

      {uiMode === "advanced" && (
        <>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {departments.map((d) => {
              const active = server.allowedDepartments.includes(d.id);
              return (
                <button
                  key={d.id}
                  type="button"
                  disabled={busy}
                  onClick={() => toggleDepartment(d.id)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 transition-colors disabled:opacity-50 ${
                    active ? "bg-electric text-white ring-electric/40" : "bg-white/70 text-secondary ring-border-metal hover:ring-electric/30"
                  }`}
                >
                  {d.name}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-[10px] text-muted">
            {server.allowedDepartments.length === 0 ? "Every department can use this server." : "Highlighted departments can use this server."}
          </p>
        </>
      )}
    </li>
  );
}

const CATALOG_ICONS: Record<string, LucideIcon> = {
  CircleDot,
  CheckCircle2,
  FileText,
  Users,
  HardDrive,
  Mail,
  Calendar,
  MessagesSquare,
  Grid2x2,
  Frame,
  GitBranch,
  Target,
  Triangle,
};

function CatalogCard({
  entry,
  connected,
  onConnected,
}: {
  entry: CatalogEntry;
  connected: boolean;
  onConnected: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const brandIcon = CONNECTOR_BRAND_ICONS[entry.id];
  const Icon = CATALOG_ICONS[entry.icon] ?? Server;

  // Manual-connect form state (entries with no single verified recipe —
  // see catalog.ts's file header). Mirrors the freeform "Add a custom MCP
  // server" fields, just scoped to one card and pre-labeled with the vendor.
  const [manualTransport, setManualTransport] = useState<"http" | "stdio">("http");
  const [manualUrl, setManualUrl] = useState("");
  const [manualAuthMode, setManualAuthMode] = useState<"none" | "bearer" | "header">("bearer");
  const [manualAuthHeaderName, setManualAuthHeaderName] = useState("");
  const [manualSecret, setManualSecret] = useState("");
  const [manualCommand, setManualCommand] = useState("");
  const [manualArgs, setManualArgs] = useState("");
  const [manualEnvVar, setManualEnvVar] = useState("");
  const [manualEnvValue, setManualEnvValue] = useState("");

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!entry.recipe || !token.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const body =
        entry.recipe.transport === "http"
          ? {
              name: entry.name,
              transport: "http",
              url: entry.recipe.url,
              bearerToken: token.trim(),
              authHeader: entry.recipe.authHeader,
              catalogId: entry.id,
            }
          : {
              name: entry.name,
              transport: "stdio",
              command: entry.recipe.command,
              args: entry.recipe.args,
              env: { [entry.recipe.envVar]: token.trim() },
              catalogId: entry.id,
            };
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't connect.");
      } else {
        setToken("");
        setOpen(false);
        onConnected();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleManualConnect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body =
        manualTransport === "http"
          ? {
              name: entry.name,
              transport: "http",
              url: manualUrl.trim(),
              bearerToken: manualAuthMode !== "none" ? manualSecret.trim() : undefined,
              authHeader: manualAuthMode === "header" ? manualAuthHeaderName.trim() : undefined,
              catalogId: entry.id,
            }
          : {
              name: entry.name,
              transport: "stdio",
              command: manualCommand.trim(),
              args: manualArgs.split(/\s+/).filter(Boolean),
              env: manualEnvVar.trim() ? { [manualEnvVar.trim()]: manualEnvValue.trim() } : undefined,
              catalogId: entry.id,
            };
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't connect.");
      } else {
        setManualUrl("");
        setManualSecret("");
        setManualCommand("");
        setManualArgs("");
        setManualEnvVar("");
        setManualEnvValue("");
        setOpen(false);
        onConnected();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border-metal bg-white/70 p-3">
      <div className="flex items-center gap-2.5">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white ${entry.tint}`}>
          {brandIcon ? (
            <svg role="img" viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-label={brandIcon.title}>
              <path d={brandIcon.path} />
            </svg>
          ) : (
            <Icon className="h-4 w-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-navy">{entry.name}</p>
          <p className="truncate text-[11px] text-muted">{entry.description}</p>
        </div>
        {connected ? (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald/15 text-emerald">
            <CheckCircle2 className="h-3.5 w-3.5" />
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={`Connect ${entry.name}`}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-metal text-secondary transition-colors hover:border-electric/40 hover:text-electric"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && entry.authKind === "token" && (
        <form onSubmit={handleConnect} className="mt-3 space-y-1.5 border-t border-border-metal pt-3">
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={entry.tokenLabel}
            autoFocus
            className="w-full rounded-lg border border-border-metal bg-white/80 px-2.5 py-1.5 font-mono text-xs text-navy outline-none focus:border-electric/50"
          />
          <div className="flex items-center justify-between gap-2">
            {entry.tokenHelpUrl && (
              <a href={entry.tokenHelpUrl} target="_blank" rel="noreferrer" className="text-[11px] text-electric underline underline-offset-2">
                Get your token
              </a>
            )}
            <button
              type="submit"
              disabled={!token.trim() || busy}
              className="ml-auto flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-electric to-gold px-3 py-1.5 text-xs font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Connect"}
            </button>
          </div>
          {error && <p className="text-xs text-crimson">{error}</p>}
        </form>
      )}

      {open && entry.authKind === "manual" && (
        <form onSubmit={handleManualConnect} className="mt-3 space-y-1.5 border-t border-border-metal pt-3">
          <p className="flex items-start gap-1.5 text-[11px] text-muted">
            <Lock className="mt-0.5 h-3 w-3 shrink-0" />
            No single official recipe for {entry.name} — wire up your own server URL/command and credential below.
            {entry.manualHelpUrl && (
              <a href={entry.manualHelpUrl} target="_blank" rel="noreferrer" className="shrink-0 text-electric underline underline-offset-2">
                Where do I get this?
              </a>
            )}
          </p>
          <select
            value={manualTransport}
            onChange={(e) => setManualTransport(e.target.value as "http" | "stdio")}
            className="w-full rounded-lg border border-border-metal bg-white/80 px-2.5 py-1.5 text-xs text-navy outline-none focus:border-electric/50"
          >
            <option value="http">Remote (http) — MCP server URL</option>
            <option value="stdio">Local (stdio) — command run via npx/etc.</option>
          </select>

          {manualTransport === "http" ? (
            <>
              <input
                type="url"
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                placeholder={`${entry.name} MCP server URL (https only, localhost exempted)`}
                autoFocus
                className="w-full rounded-lg border border-border-metal bg-white/80 px-2.5 py-1.5 font-mono text-xs text-navy outline-none focus:border-electric/50"
              />
              <div className="grid grid-cols-2 gap-1.5">
                <select
                  value={manualAuthMode}
                  onChange={(e) => setManualAuthMode(e.target.value as typeof manualAuthMode)}
                  className="rounded-lg border border-border-metal bg-white/80 px-2.5 py-1.5 text-xs text-navy outline-none focus:border-electric/50"
                >
                  <option value="bearer">Bearer token</option>
                  <option value="header">Custom header</option>
                  <option value="none">No auth</option>
                </select>
                {manualAuthMode === "header" ? (
                  <input
                    type="text"
                    value={manualAuthHeaderName}
                    onChange={(e) => setManualAuthHeaderName(e.target.value)}
                    placeholder="Header name (e.g. X-Api-Key)"
                    className="rounded-lg border border-border-metal bg-white/80 px-2.5 py-1.5 text-xs text-navy outline-none focus:border-electric/50"
                  />
                ) : (
                  <div />
                )}
              </div>
              {manualAuthMode !== "none" && (
                <input
                  type="password"
                  value={manualSecret}
                  onChange={(e) => setManualSecret(e.target.value)}
                  placeholder="Token / key value"
                  className="w-full rounded-lg border border-border-metal bg-white/80 px-2.5 py-1.5 font-mono text-xs text-navy outline-none focus:border-electric/50"
                />
              )}
            </>
          ) : (
            <>
              <input
                type="text"
                value={manualCommand}
                onChange={(e) => setManualCommand(e.target.value)}
                placeholder="Command, e.g. npx"
                autoFocus
                className="w-full rounded-lg border border-border-metal bg-white/80 px-2.5 py-1.5 font-mono text-xs text-navy outline-none focus:border-electric/50"
              />
              <input
                type="text"
                value={manualArgs}
                onChange={(e) => setManualArgs(e.target.value)}
                placeholder="Args, e.g. -y @vendor/mcp-server"
                className="w-full rounded-lg border border-border-metal bg-white/80 px-2.5 py-1.5 font-mono text-xs text-navy outline-none focus:border-electric/50"
              />
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="text"
                  value={manualEnvVar}
                  onChange={(e) => setManualEnvVar(e.target.value)}
                  placeholder="Env var name"
                  className="rounded-lg border border-border-metal bg-white/80 px-2.5 py-1.5 font-mono text-xs text-navy outline-none focus:border-electric/50"
                />
                <input
                  type="password"
                  value={manualEnvValue}
                  onChange={(e) => setManualEnvValue(e.target.value)}
                  placeholder="Value"
                  className="rounded-lg border border-border-metal bg-white/80 px-2.5 py-1.5 font-mono text-xs text-navy outline-none focus:border-electric/50"
                />
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={busy || (manualTransport === "http" ? !manualUrl.trim() : !manualCommand.trim())}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-electric to-gold px-3 py-1.5 text-xs font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Connect"}
          </button>
          {error && <p className="text-xs text-crimson">{error}</p>}
        </form>
      )}
    </div>
  );
}

function McpServersSection() {
  const { uiMode } = useAppState();
  const [servers, setServers] = useState<McpServerRow[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [transport, setTransport] = useState<"stdio" | "http">("stdio");
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [url, setUrl] = useState("");
  const [bearerToken, setBearerToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const res = await fetch("/api/mcp");
    if (!res.ok) return;
    const data = await res.json();
    setServers(Array.isArray(data.servers) ? data.servers : []);
    setDepartments(Array.isArray(data.departments) ? data.departments : []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    refresh();
  }, []);

  const connectedCatalogIds = new Set(servers.map((s) => s.catalogId).filter((id): id is string => Boolean(id)));
  const customServers = servers.filter((s) => !s.catalogId);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          transport,
          command: transport === "stdio" ? command : undefined,
          args: transport === "stdio" ? args.split(/\s+/).filter(Boolean) : undefined,
          url: transport === "http" ? url : undefined,
          bearerToken: transport === "http" ? bearerToken : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't create this server.");
      } else {
        setName("");
        setCommand("");
        setArgs("");
        setUrl("");
        setBearerToken("");
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 border-t border-border-metal pt-5">
      <div className="mb-3 flex items-center gap-2">
        <Server className="h-4 w-4 text-electric" />
        <h3 className="font-heading text-sm font-semibold text-navy">Connectors (MCP)</h3>
      </div>
      <p className="text-xs text-secondary">
        Real MCP (Model Context Protocol) connectors — the same protocol Claude Desktop and ChatGPT use. Just click
        connect below{uiMode === "advanced" ? ", then toggle which departments can use each one." : "."}
      </p>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {MCP_CATALOG.map((entry) => (
          <CatalogCard key={entry.id} entry={entry} connected={connectedCatalogIds.has(entry.id)} onConnected={refresh} />
        ))}
      </div>

      {servers.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
            {uiMode === "advanced" ? "Connected — department access" : "Connected"}
          </p>
          <ul className="space-y-1.5">
            {servers.map((s) => (
              <McpServerRowItem key={s.id} server={s} departments={departments} onChanged={refresh} />
            ))}
          </ul>
        </div>
      )}

      {uiMode === "advanced" && (
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="mt-3 flex items-center gap-1 text-xs text-muted hover:text-secondary"
        >
          {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {showAdvanced ? "Hide custom server setup" : "Add a custom MCP server (not in the list above)"}
        </button>
      )}

      {uiMode === "advanced" && showAdvanced && (
        <form onSubmit={handleCreate} className="mt-2 space-y-2 rounded-lg border border-dashed border-border-metal p-3">
          <div className="grid grid-cols-[7rem_1fr] gap-2">
            <select
              value={transport}
              onChange={(e) => setTransport(e.target.value as "stdio" | "http")}
              className="rounded-lg border border-border-metal bg-white/80 px-2 py-2 text-xs text-navy outline-none focus:border-electric/50"
            >
              <option value="stdio">Local (stdio)</option>
              <option value="http">Remote (http)</option>
            </select>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Server name"
              className="rounded-lg border border-border-metal bg-white/80 px-2.5 py-2 text-xs text-navy outline-none focus:border-electric/50"
            />
          </div>
          {transport === "stdio" ? (
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="Command, e.g. npx"
                className="rounded-lg border border-border-metal bg-white/80 px-2.5 py-2 font-mono text-xs text-navy outline-none focus:border-electric/50"
              />
              <input
                type="text"
                value={args}
                onChange={(e) => setArgs(e.target.value)}
                placeholder="Args, e.g. -y @modelcontextprotocol/server-filesystem /path"
                className="rounded-lg border border-border-metal bg-white/80 px-2.5 py-2 font-mono text-xs text-navy outline-none focus:border-electric/50"
              />
            </div>
          ) : (
            <>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://... MCP server URL (https only, localhost exempted)"
                className="w-full rounded-lg border border-border-metal bg-white/80 px-2.5 py-2 font-mono text-xs text-navy outline-none focus:border-electric/50"
              />
              <input
                type="password"
                value={bearerToken}
                onChange={(e) => setBearerToken(e.target.value)}
                placeholder="Bearer token (optional)"
                className="w-full rounded-lg border border-border-metal bg-white/80 px-2.5 py-2 font-mono text-xs text-navy outline-none focus:border-electric/50"
              />
            </>
          )}
          <button
            type="submit"
            disabled={!name.trim() || busy || (transport === "stdio" ? !command.trim() : !url.trim())}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-electric to-gold px-3 py-2 text-xs font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Sparkles className="h-3.5 w-3.5" /> Add MCP Server
          </button>
          {error && <p className="text-xs text-crimson">{error}</p>}
        </form>
      )}
      {customServers.length === 0 && servers.length === 0 && (
        <p className="mt-3 text-[11px] text-muted">No connectors yet — pick one above to get started.</p>
      )}
    </div>
  );
}

/** Language-model provider & custom model connectors — self-contained
 *  dynamic model manager with custom Base URLs, private endpoints,
 *  real-time test buttons, and Advanced routing telemetry. */
export function AiProvidersCard() {
  return <AiModelManager />;
}

export function IntegrationsHub() {
  const { uiMode } = useAppState();
  const [forbidden, setForbidden] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function check() {
      const res = await fetch("/api/vault/system");
      if (res.status === 403) {
        setForbidden(true);
      }
      setLoaded(true);
    }
    check();
  }, []);

  if (!loaded) return null;

  if (forbidden) {
    return (
      <div className="glass-card flex items-start gap-3 rounded-xl p-5">
        <ShieldAlert className="h-5 w-5 shrink-0 text-crimson" />
        <div>
          <h2 className="font-heading text-sm font-semibold text-navy">Integrations</h2>
          <p className="mt-1 text-sm text-secondary">Only owners can view or manage connectors.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div id="settings-ai-providers">
        <AiProvidersCard />
      </div>
      <div id="settings-connectors" className="glass-card rounded-xl p-5">
        <McpServersSection />
      </div>
      {uiMode === "advanced" ? (
        <>
          <div id="settings-n8n" className="glass-card rounded-xl p-5">
            <h2 className="mb-4 font-heading text-sm font-semibold text-navy">n8n Automation</h2>
            <N8nCard />
          </div>
          <div id="settings-custom" className="glass-card rounded-xl p-5">
            <ConnectorsSection />
          </div>
        </>
      ) : (
        <p className="px-1 text-xs text-muted">
          Raw automation config (n8n, custom REST connectors, per-department access) lives in{" "}
          <span className="font-semibold text-secondary">Advanced mode</span> — switch it on above to see it.
        </p>
      )}
    </div>
  );
}
