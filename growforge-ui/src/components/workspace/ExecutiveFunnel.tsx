"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Bot, CheckCircle2, Cpu, Library, ShieldAlert, type LucideIcon } from "lucide-react";
import { agents as seedAgents, type Agent } from "@/lib/agents";
import { useAppState } from "@/lib/appState";

/** Files under .claude/vault/ — the master agent catalog. Not exposed via
 *  an API (it's a static repo artifact, not app state), so this mirrors the
 *  same figure used in the Vault Library placeholder card. */
const CATALOGED_AGENTS = 279;

const POLL_INTERVAL_MS = 5000;

interface FunnelStep {
  label: string;
  value: number;
  icon: LucideIcon;
  tint: string;
  iconColor: string;
}

function FunnelCard({ step }: { step: FunnelStep }) {
  const Icon = step.icon;
  return (
    <div className="glass-card-strong flex min-w-0 flex-1 flex-col items-center rounded-2xl px-5 py-6 text-center">
      <span className={`flex h-12 w-12 items-center justify-center rounded-full ${step.tint}`}>
        <Icon className={`h-5 w-5 ${step.iconColor}`} />
      </span>
      <p className="mt-4 font-heading text-3xl font-bold text-navy">{step.value}</p>
      <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">{step.label}</p>
    </div>
  );
}

function InterventionBanner({ blocked, onResolve }: { blocked: Agent[]; onResolve: () => void }) {
  const count = blocked.length;
  const description =
    count === 1
      ? `${blocked[0].name} requires CEO approval / attention.`
      : `${count} agents require CEO approval / attention: ${blocked.map((a) => a.name).join(", ")}.`;

  return (
    <div className="mt-4 flex flex-col items-start gap-4 rounded-2xl bg-indigo-500 p-5 text-white shadow-lg sm:flex-row sm:items-center">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/15 font-heading text-xl font-bold ring-2 ring-white/30">
        {count}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 font-heading text-sm font-semibold uppercase tracking-wide text-white/90">
          <ShieldAlert className="h-4 w-4" /> CEO Action Required
        </p>
        <p className="mt-1 text-sm text-white/80">{description}</p>
      </div>
      <button
        type="button"
        onClick={onResolve}
        className="flex w-full shrink-0 items-center justify-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-indigo-600 shadow-sm transition-transform hover:scale-[1.02] sm:w-auto"
      >
        Resolve Blockers <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}

export function ExecutiveFunnel() {
  const { openAgentPanel } = useAppState();
  // Seeded from the static roster for an instant, hydration-safe first
  // paint (deterministic on both server and client); replaced with live
  // data from the API right after mount.
  const [liveAgents, setLiveAgents] = useState<Agent[]>(seedAgents);
  const [logsTotal, setLogsTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [agentsRes, logsRes] = await Promise.all([
          fetch("/api/agents"),
          fetch("/api/logs?limit=1"), // only need the `total` field, not the entries
        ]);
        if (!cancelled && agentsRes.ok) {
          const data: { agents: Agent[] } = await agentsRes.json();
          setLiveAgents(data.agents);
        }
        if (!cancelled && logsRes.ok) {
          const data: { total: number } = await logsRes.json();
          setLogsTotal(data.total);
        }
      } catch {
        // best-effort refresh — keep whatever was last shown
      }
    }

    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const provisionedRoster = liveAgents.length;
  const executingNow = liveAgents.filter((a) => a.status === "active").length;
  const blocked = liveAgents.filter((a) => a.status === "error");

  const steps: FunnelStep[] = [
    { label: "Cataloged Agents", value: CATALOGED_AGENTS, icon: Library, tint: "bg-violet-100", iconColor: "text-violet-500" },
    { label: "Provisioned Roster", value: provisionedRoster, icon: Bot, tint: "bg-sky-100", iconColor: "text-sky-500" },
    { label: "Executing Now", value: executingNow, icon: Cpu, tint: "bg-amber-100", iconColor: "text-amber-500" },
    { label: "Completed Runs", value: logsTotal, icon: CheckCircle2, tint: "bg-emerald-100", iconColor: "text-emerald-500" },
  ];

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-base font-semibold text-navy">Executive Funnel</h2>
          <p className="text-xs text-secondary">From cataloged capability to completed execution.</p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-emerald/10 px-3 py-1 ring-1 ring-emerald/25">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald animate-pulse" />
          <span className="font-mono text-[11px] font-semibold uppercase tracking-wide text-emerald">
            Autopilot On
          </span>
        </span>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        {steps.map((step, i) => (
          // `contents` keeps this wrapper out of the flex layout entirely —
          // the card and arrow become direct flex siblings, so arrows sit
          // truly *between* cards without a wrapper skewing their widths.
          <div key={step.label} className="contents">
            <FunnelCard step={step} />
            {i < steps.length - 1 && (
              <div className="hidden shrink-0 items-center justify-center lg:flex">
                <ArrowRight className="h-5 w-5 text-muted" />
              </div>
            )}
          </div>
        ))}
      </div>

      {blocked.length > 0 && (
        <InterventionBanner blocked={blocked} onResolve={() => openAgentPanel(blocked[0].id)} />
      )}
    </section>
  );
}
