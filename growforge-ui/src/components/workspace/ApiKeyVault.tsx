"use client";

import { useEffect, useState } from "react";
import { KeyRound, Plus, ShieldAlert, Trash2 } from "lucide-react";

const SUGGESTED_PROVIDERS = ["Kling AI", "Higgsfield", "Runway", "Fal.ai", "Midjourney", "OpenAI"];

export function ApiKeyVault({ agentId }: { agentId: string }) {
  const [providers, setProviders] = useState<string[]>([]);
  const [provider, setProvider] = useState(SUGGESTED_PROVIDERS[0]);
  const [customProvider, setCustomProvider] = useState("");
  const [keyValue, setKeyValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [purged, setPurged] = useState(false);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const res = await fetch(`/api/vault/${encodeURIComponent(agentId)}`);
    if (res.status === 403) {
      setForbidden(true);
      setProviders([]);
      return;
    }
    setForbidden(false);
    const data = await res.json().catch(() => ({}));
    setProviders(Array.isArray(data.providers) ? data.providers : []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads vault entries for the newly-selected agent, not derived render state
    refresh();
    setPurged(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = (customProvider.trim() || provider).trim();
    const value = keyValue.trim();
    if (!name || !value) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/vault/${encodeURIComponent(agentId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: name, value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't store this key.");
      } else {
        setKeyValue("");
        setCustomProvider("");
        setProviders(data.providers ?? []);
      }
    } catch {
      setError("Couldn't reach the vault API.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(name: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/vault/${encodeURIComponent(agentId)}/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setProviders(data.providers ?? []);
    } finally {
      setBusy(false);
    }
  }

  async function handlePurge() {
    setBusy(true);
    try {
      const res = await fetch(`/api/vault/${encodeURIComponent(agentId)}`, { method: "DELETE" });
      if (res.ok) {
        setProviders([]);
        setPurged(true);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 border-t border-border-metal pt-5">
      <div className="mb-3 flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-electric" />
        <h3 className="font-heading text-sm font-semibold text-navy">Custom API Vault</h3>
      </div>
      <p className="text-xs text-secondary">
        Bring your own key for a third-party tool this agent uses. Encrypted at rest on the server (AES-256-GCM);
        key values are never sent back to the browser once stored — only the provider names you&apos;ve added.
      </p>

      {forbidden && (
        <p className="mt-3 flex items-center gap-1.5 rounded-lg border border-crimson/30 bg-crimson/5 px-3 py-2 text-xs text-crimson">
          <ShieldAlert className="h-3.5 w-3.5" /> Authentication required to view or manage the credential vault.
        </p>
      )}

      {!forbidden && providers.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {providers.map((name) => (
            <li
              key={name}
              className="flex items-center gap-2 rounded-lg border border-border-metal bg-white/70 px-3 py-2"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-navy">{name}</span>
              <span className="shrink-0 font-mono text-xs text-muted">••••••••</span>
              <button
                type="button"
                onClick={() => handleRemove(name)}
                disabled={busy}
                aria-label={`Remove ${name} key`}
                className="shrink-0 rounded-md p-1 text-muted transition-colors hover:bg-crimson/10 hover:text-crimson disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!forbidden && (
        <form onSubmit={handleAdd} className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <select
              name="vault-provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="rounded-lg border border-border-metal bg-white/80 px-2.5 py-2 text-xs text-navy outline-none focus:border-electric/50"
            >
              {SUGGESTED_PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <input
              type="text"
              name="vault-custom-provider"
              value={customProvider}
              onChange={(e) => setCustomProvider(e.target.value)}
              placeholder="Or custom name…"
              className="rounded-lg border border-border-metal bg-white/80 px-2.5 py-2 text-xs text-navy outline-none focus:border-electric/50"
            />
          </div>
          <div className="flex gap-2">
            <input
              type="password"
              name="vault-key-value"
              value={keyValue}
              onChange={(e) => setKeyValue(e.target.value)}
              placeholder="Paste API key"
              className="min-w-0 flex-1 rounded-lg border border-border-metal bg-white/80 px-3 py-2 font-mono text-xs text-navy outline-none focus:border-electric/50"
            />
            <button
              type="submit"
              disabled={!keyValue.trim() || busy}
              className="flex shrink-0 items-center gap-1 rounded-lg bg-gradient-to-r from-electric to-gold px-3 py-2 text-xs font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </div>
        </form>
      )}

      {error && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-crimson">
          <ShieldAlert className="h-3.5 w-3.5" /> {error}
        </p>
      )}

      {!forbidden && providers.length > 0 && (
        <button
          type="button"
          onClick={handlePurge}
          disabled={busy}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-crimson/30 bg-crimson/5 px-3 py-2 text-xs font-semibold text-crimson transition-colors hover:bg-crimson/10 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" /> Purge &amp; Remove Keys
        </button>
      )}
      {purged && <p className="mt-2 text-xs text-emerald">Keys purged from the server vault.</p>}
    </div>
  );
}
