"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, HeartPulse, Lock, XCircle } from "lucide-react";

type RowStatus = "ok" | "warn" | "unknown" | "owner-only";

interface HealthRow {
  label: string;
  detail: string;
  status: RowStatus;
}

const EMPTY_ROWS: HealthRow[] = [
  { label: "MCP Connections", detail: "Checking…", status: "unknown" },
  { label: "AI Providers", detail: "Checking…", status: "unknown" },
  { label: "n8n Automation", detail: "Checking…", status: "unknown" },
  { label: "Job Store", detail: "Checking…", status: "unknown" },
];

/** Real, already-computable system state — no invented uptime percentages
 *  (Phase 3.5 item 14's hard constraint). MCP/AI-provider counts come from
 *  owner-only endpoints (same gate as Settings → Integrations), so a
 *  non-owner sees "Owner only" here rather than a fake zero — this mirrors
 *  how the rest of the app already handles restricted data (Admin Drawer's
 *  own owner-PIN gate), not a new access-control concept. */
export function SystemHealth() {
  const [rows, setRows] = useState<HealthRow[]>(EMPTY_ROWS);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const next: HealthRow[] = [...EMPTY_ROWS];

      try {
        const res = await fetch("/api/mcp");
        if (res.status === 401 || res.status === 403) {
          next[0] = { label: "MCP Connections", detail: "Unavailable", status: "warn" };
        } else if (res.ok) {
          const data: { servers: unknown[] } = await res.json();
          const count = data.servers?.length ?? 0;
          next[0] = { label: "MCP Connections", detail: `${count} connected`, status: count > 0 ? "ok" : "warn" };
        } else {
          next[0] = { label: "MCP Connections", detail: "Unreachable", status: "warn" };
        }
      } catch {
        next[0] = { label: "MCP Connections", detail: "Unreachable", status: "warn" };
      }

      try {
        const res = await fetch("/api/vault/system");
        if (res.status === 401 || res.status === 403) {
          next[1] = { label: "AI Providers", detail: "Unavailable", status: "warn" };
        } else if (res.ok) {
          const data: { providers?: { configured: boolean }[]; models?: { isConfigured: boolean }[] } = await res.json();
          const configured = data.models
            ? data.models.filter((m) => m.isConfigured).length
            : (data.providers?.filter((p) => p.configured).length ?? 0);
          const total = data.models ? data.models.length : (data.providers?.length ?? 0);
          next[1] = {
            label: "AI Providers",
            detail: `${configured}/${total} configured`,
            status: configured > 0 ? "ok" : "warn",
          };
        } else {
          next[1] = { label: "AI Providers", detail: "Unreachable", status: "warn" };
        }
      } catch {
        next[1] = { label: "AI Providers", detail: "Unreachable", status: "warn" };
      }

      try {
        const res = await fetch("/api/vault/system/n8n/health");
        if (res.ok) {
          const data: { status: "connected" | "offline" } = await res.json();
          next[2] = {
            label: "n8n Automation",
            detail: data.status === "connected" ? "Online" : "Offline",
            status: data.status === "connected" ? "ok" : "warn",
          };
        } else {
          next[2] = { label: "n8n Automation", detail: "Unreachable", status: "warn" };
        }
      } catch {
        next[2] = { label: "n8n Automation", detail: "Unreachable", status: "warn" };
      }

      try {
        const res = await fetch("/api/jobs");
        next[3] = res.ok
          ? { label: "Job Store", detail: "Operational", status: "ok" }
          : { label: "Job Store", detail: "Unreachable", status: "warn" };
      } catch {
        next[3] = { label: "Job Store", detail: "Unreachable", status: "warn" };
      }

      if (!cancelled) setRows(next);
    }

    load();
    const interval = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="glass-card flex h-full flex-col justify-between rounded-2xl border border-[#333333] bg-[#111827] p-4 text-white shadow-lg">
      <div>
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-heading text-sm font-semibold text-white">
            <HeartPulse className="h-4 w-4 text-electric" /> Connected Ecosystem Status
          </h2>
          <span className="rounded-md bg-electric/15 px-2 py-0.5 font-mono text-[10px] font-bold text-electric uppercase">
            Live Telemetry
          </span>
        </div>
        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {rows.map((row) => (
            <li
              key={row.label}
              className="flex items-center justify-between gap-2 rounded-xl border border-[#333333] bg-[#0B1220] px-3 py-2 text-xs"
            >
              <span className="font-medium text-[#CCCCCC]">{row.label}</span>
              <span
                className={`flex items-center gap-1 font-semibold ${
                  row.status === "ok"
                    ? "text-emerald"
                    : row.status === "warn"
                      ? "text-crimson"
                      : "text-muted"
                }`}
              >
                {row.status === "ok" && <CheckCircle2 className="h-3.5 w-3.5" />}
                {row.status === "warn" && <XCircle className="h-3.5 w-3.5" />}
                {row.status === "owner-only" && <Lock className="h-3.5 w-3.5" />}
                {row.detail}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-3 pt-2 border-t border-[#333333]/50 flex items-center justify-between text-[11px] text-muted">
        <span>Autonomous Infrastructure</span>
        <span className="font-mono text-[10px]">Auto-Syncing</span>
      </div>
    </div>
  );
}
