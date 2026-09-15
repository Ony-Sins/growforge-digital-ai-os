"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Plug, ShieldAlert, Sparkles, Trash2, XCircle } from "lucide-react";

interface ProviderStatus {
  id: string;
  label: string;
  source: "vault" | "env" | "none";
  configured: boolean;
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

const SOURCE_LABEL: Record<ProviderStatus["source"], string> = {
  vault: "set here",
  env: "from server env",
  none: "not configured",
};

const SOURCE_CLASS: Record<ProviderStatus["source"], string> = {
  vault: "bg-emerald/10 text-emerald ring-emerald/25",
  env: "bg-electric/10 text-electric ring-electric/25",
  none: "bg-sunken text-muted ring-border-metal",
};

function ProviderRow({
  provider,
  onChanged,
}: {
  provider: ProviderStatus;
  onChanged: () => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<TestResult>(null);

  async function handleSave() {
    if (!value.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/vault/system", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: provider.id, value: value.trim() }),
      });
      if (res.ok) {
        setValue("");
        setTest(null);
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleTest() {
    setBusy(true);
    setTest(null);
    try {
      const res = await fetch("/api/vault/system/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: provider.id }),
      });
      const data = await res.json();
      setTest(data);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/vault/system/${encodeURIComponent(provider.id)}`, { method: "DELETE" });
      if (res.ok) {
        setTest(null);
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-lg border border-border-metal bg-white/70 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-navy">{provider.label}</span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${SOURCE_CLASS[provider.source]}`}>
          {SOURCE_LABEL[provider.source]}
        </span>
        {provider.configured && (
          <button
            type="button"
            onClick={handleTest}
            disabled={busy}
            className="shrink-0 rounded-md border border-border-metal px-2 py-1 text-[11px] font-medium text-secondary transition-colors hover:border-electric/40 hover:text-electric disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Test"}
          </button>
        )}
        {provider.source === "vault" && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={busy}
            aria-label={`Remove ${provider.label} key`}
            className="shrink-0 rounded-md p-1 text-muted transition-colors hover:bg-crimson/10 hover:text-crimson disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="mt-2 flex gap-2">
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={provider.configured ? "Replace key…" : "Paste API key…"}
          className="min-w-0 flex-1 rounded-lg border border-border-metal bg-white/80 px-2.5 py-1.5 font-mono text-xs text-navy outline-none focus:border-electric/50"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={!value.trim() || busy}
          className="shrink-0 rounded-lg bg-gradient-to-r from-electric to-gold px-3 py-1.5 text-xs font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          Save
        </button>
      </div>

      {test && (
        <p className={`mt-2 flex items-center gap-1.5 text-xs ${test.ok ? "text-emerald" : "text-crimson"}`}>
          {test.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
          {test.message}
        </p>
      )}
    </li>
  );
}

function ConnectorsSection() {
  const [connectors, setConnectors] = useState<ConnectorRow[]>([]);
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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
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
        setName("");
        setUrl("");
        setAuthHeaderName("");
        setSecretValue("");
        setAuthMode("none");
        await refresh();
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
    if (res.ok) await refresh();
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

      <form onSubmit={handleCreate} className="mt-3 space-y-2 rounded-lg border border-dashed border-border-metal p-3">
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
            placeholder="Token / key value"
            className="w-full rounded-lg border border-border-metal bg-white/80 px-2.5 py-2 font-mono text-xs text-navy outline-none focus:border-electric/50"
          />
        )}
        <button
          type="submit"
          disabled={!name.trim() || !url.trim() || busy}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-electric to-gold px-3 py-2 text-xs font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Sparkles className="h-3.5 w-3.5" /> Add Connector
        </button>
        {error && <p className="text-xs text-crimson">{error}</p>}
      </form>
    </div>
  );
}

export function IntegrationsHub() {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [forbidden, setForbidden] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function refresh() {
    const res = await fetch("/api/vault/system");
    if (res.status === 403) {
      setForbidden(true);
      setLoaded(true);
      return;
    }
    setForbidden(false);
    const data = await res.json().catch(() => ({}));
    setProviders(Array.isArray(data.providers) ? data.providers : []);
    setLoaded(true);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    refresh();
  }, []);

  if (!loaded) return null;

  if (forbidden) {
    return (
      <div className="glass-card flex items-start gap-3 rounded-xl p-5">
        <ShieldAlert className="h-5 w-5 shrink-0 text-crimson" />
        <div>
          <h2 className="font-heading text-sm font-semibold text-navy">Integrations</h2>
          <p className="mt-1 text-sm text-secondary">
            Only owners can view or manage AI provider keys and connectors.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-xl p-5">
      <h2 className="font-heading text-sm font-semibold text-navy">AI Providers</h2>
      <p className="mt-1 text-xs text-secondary">
        Bring your own key for any provider. Keys saved here live in the encrypted server vault and override the
        server&apos;s deploy-time environment variable — no redeploy needed to swap one out.
      </p>
      <ul className="mt-3 space-y-2">
        {providers.map((p) => (
          <ProviderRow key={p.id} provider={p} onChanged={refresh} />
        ))}
      </ul>

      <ConnectorsSection />
    </div>
  );
}
