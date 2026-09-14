"use client";

import { useEffect, useState } from "react";
import { KeyRound, Plus, ShieldAlert, Trash2 } from "lucide-react";
import {
  getVaultKey,
  listVaultProviders,
  maskKey,
  purgeAgentVault,
  removeVaultKey,
  setVaultKey,
} from "@/lib/apiVault";

const SUGGESTED_PROVIDERS = ["Kling AI", "Higgsfield", "Runway", "Fal.ai", "Midjourney", "OpenAI"];

interface VaultRow {
  provider: string;
  masked: string;
}

export function ApiKeyVault({ agentId }: { agentId: string }) {
  const [rows, setRows] = useState<VaultRow[]>([]);
  const [provider, setProvider] = useState(SUGGESTED_PROVIDERS[0]);
  const [customProvider, setCustomProvider] = useState("");
  const [keyValue, setKeyValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [purged, setPurged] = useState(false);

  async function refresh() {
    const providers = listVaultProviders(agentId);
    const withMasks = await Promise.all(
      providers.map(async (p) => {
        const value = await getVaultKey(agentId, p);
        return { provider: p, masked: value ? maskKey(value) : "••••" };
      }),
    );
    setRows(withMasks);
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

    try {
      await setVaultKey(agentId, name, value);
      setKeyValue("");
      setCustomProvider("");
      setError(null);
      await refresh();
    } catch {
      setError("Couldn't encrypt this key — Web Crypto may be unavailable in this browser context.");
    }
  }

  async function handleRemove(name: string) {
    removeVaultKey(agentId, name);
    await refresh();
  }

  function handlePurge() {
    purgeAgentVault(agentId);
    setRows([]);
    setPurged(true);
  }

  return (
    <div className="mt-6 border-t border-border-metal pt-5">
      <div className="mb-3 flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-electric" />
        <h3 className="font-heading text-sm font-semibold text-navy">Custom API Vault</h3>
      </div>
      <p className="text-xs text-secondary">
        Bring your own key for a third-party tool this agent uses. Stored encrypted, this browser tab only —
        never sent to our servers.
      </p>

      {rows.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {rows.map((row) => (
            <li
              key={row.provider}
              className="flex items-center gap-2 rounded-lg border border-border-metal bg-white/70 px-3 py-2"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-navy">{row.provider}</span>
              <span className="shrink-0 font-mono text-xs text-muted">{row.masked}</span>
              <button
                type="button"
                onClick={() => handleRemove(row.provider)}
                aria-label={`Remove ${row.provider} key`}
                className="shrink-0 rounded-md p-1 text-muted transition-colors hover:bg-crimson/10 hover:text-crimson"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

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
            disabled={!keyValue.trim()}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-gradient-to-r from-electric to-gold px-3 py-2 text-xs font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
      </form>

      {error && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-crimson">
          <ShieldAlert className="h-3.5 w-3.5" /> {error}
        </p>
      )}

      {rows.length > 0 && (
        <button
          type="button"
          onClick={handlePurge}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-crimson/30 bg-crimson/5 px-3 py-2 text-xs font-semibold text-crimson transition-colors hover:bg-crimson/10"
        >
          <Trash2 className="h-3.5 w-3.5" /> Purge &amp; Remove Keys
        </button>
      )}
      {purged && <p className="mt-2 text-xs text-emerald">Keys purged from this session.</p>}
    </div>
  );
}
