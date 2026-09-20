"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  ArrowUpRight,
  Bot,
  Brain,
  CheckCircle2,
  Library,
  TriangleAlert,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { JobSummary } from "@/lib/jobStore";
import { AgentRosterOverlay } from "@/components/workspace/AgentRosterOverlay";
import { ExecutiveFunnel } from "@/components/workspace/ExecutiveFunnel";
import { NeedsAttention } from "@/components/workspace/NeedsAttention";
import { ProjectCanvas } from "@/components/workspace/ProjectCanvas";
import { SettingsOverlay } from "@/components/workspace/SettingsOverlay";
import { SystemHealth } from "@/components/workspace/SystemHealth";
import { UserProfileOverlay } from "@/components/workspace/UserProfileOverlay";
import { ByokOnboardingBanner } from "@/components/workspace/ByokOnboardingBanner";
import { useAppState, type ActiveView } from "@/lib/appState";
import { useLiveAgents } from "@/lib/useLiveAgents";

const NeuralBrainCanvas = dynamic(
  () => import("@/components/brain/NeuralBrainCanvas").then((m) => m.NeuralBrainCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-96 w-full flex-col items-center justify-center rounded-2xl border border-border-metal bg-[#070b14] text-slate-400">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-electric border-t-transparent" />
        <p className="mt-3 font-mono text-xs text-sky-400">Initializing 3D Neural Canvas...</p>
      </div>
    ),
  }
);

interface WorkspaceUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role: "owner" | "employee";
}

const JOB_POLL_INTERVAL_MS = 5000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** All three cards below used to be sourced from a 7-entry hardcoded agent
 *  list — "Successful Runs (24h)" was a bare literal `128` that never
 *  changed, and the other two just counted fake statuses with no real
 *  24h window at all. These now come from real job records (the same
 *  pipeline the Live Projects canvas shows), computed fresh from
 *  /api/jobs on every poll — see the effect below. */
function computeSummary(jobs: JobSummary[]) {
  const now = Date.now();
  const within24h = (iso?: string) => !!iso && now - new Date(iso).getTime() < DAY_MS;
  return {
    activeAgents: jobs.filter((j) => j.status === "running" && j.activeStep).length,
    successfulRuns24h: jobs.filter((j) => j.status === "done" && within24h(j.finishedAt)).length,
    errors24h: jobs.filter((j) => j.status === "error" && within24h(j.finishedAt ?? j.updatedAt)).length,
  };
}

const TONE_CLASSES: Record<"electric" | "emerald" | "crimson", string> = {
  electric: "text-electric bg-electric/10 ring-electric/25",
  emerald: "text-emerald bg-emerald/10 ring-emerald/25",
  crimson: "text-crimson bg-crimson/10 ring-crimson/25",
};

/** Views with no dedicated dashboard section yet fall back to a placeholder card. */
const PLACEHOLDER_CONTENT: Partial<Record<ActiveView, { icon: LucideIcon; title: string; body: string }>> = {
  vault: {
    icon: Library,
    title: "Vault Library",
    body: "279 cataloged agent persona files, stored in .claude/vault/. This is a general-purpose reference library (academic, engineering, design, and other generic personas), not GrowForge's own departments (see Live Projects for those) — none of it is wired into the app. Browse the .md files directly in the repo; there's no in-app browsing UI planned for this (Phase 2 decision, 2026-09-17).",
  },
};

/** Maps a nav selection to the dashboard section it should scroll to.
 *  "chat" has no scroll target — the AI Assistant lives in its own
 *  always-visible docked/maximized surface (see ChatView.tsx), not a
 *  section of this scrolling dashboard. */
function sectionIdFor(view: ActiveView): string | null {
  switch (view) {
    case "chat":
      return null;
    case "activity":
      return "section-activity";
    case "workflows":
      return "section-projects";
    case "brain":
      return "section-brain";
    case "vault":
      return "section-placeholder";
    case "dashboard":
    default:
      return "section-top";
  }
}

export function Workspace({ user }: { user: WorkspaceUser | null }) {
  const {
    activeView,
    activeViewToken,
    setActiveView,
    openAdminDrawer,
    openAgentRoster,
    openUserProfile,
    chatViewMode,
  } = useAppState();
  const [flashSection, setFlashSection] = useState<string | null>(null);
  const [summary, setSummary] = useState({ activeAgents: 0, successfulRuns24h: 0, errors24h: 0 });
  const liveAgents = useLiveAgents();

  // activeViewToken bumps on every nav click, even to the same view, so a
  // repeat click still re-scrolls/re-flashes.
  useEffect(() => {
    const id = sectionIdFor(activeView);
    if (!id) return;
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- drives a CSS highlight in response to nav clicks, not derived render state
    setFlashSection(id);
    const t = setTimeout(() => setFlashSection(null), 1000);
    return () => clearTimeout(t);
  }, [activeView, activeViewToken]);

  useEffect(() => {
    let cancelled = false;
    async function loadJobs() {
      try {
        const res = await fetch("/api/jobs");
        if (!res.ok || cancelled) return;
        const data: { jobs: JobSummary[] } = await res.json();
        if (!cancelled) setSummary(computeSummary(data.jobs ?? []));
      } catch {
        // best-effort refresh — keep whatever was last shown
      }
    }
    loadJobs();
    const interval = setInterval(loadJobs, JOB_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const flash = (id: string) => (flashSection === id ? "section-flash" : "");
  const placeholder = PLACEHOLDER_CONTENT[activeView];
  const summaryCards = [
    {
      label: "Active Agents",
      value: summary.activeAgents,
      icon: Zap,
      tone: "electric" as const,
      onClick: () => setActiveView("roster"),
      title: "View the agent roster",
    },
    {
      label: "Successful Runs (24h)",
      value: summary.successfulRuns24h,
      icon: CheckCircle2,
      tone: "emerald" as const,
      onClick: () => openAdminDrawer("logs"),
      title: "View execution logs",
    },
    {
      label: "Errors (24h)",
      value: summary.errors24h,
      icon: TriangleAlert,
      tone: "crimson" as const,
      onClick: () => openAdminDrawer("logs"),
      title: "View execution logs",
    },
  ];

  return (
    <main
      // The docked AI Assistant panel reserves a right-side column at lg+
      // and a bottom-sheet strip below that (see ChatView.tsx) — using
      // Tailwind's responsive prefixes here, not a JS viewport check, so
      // this stays correct across resizes without a resize listener.
      className={`flex-1 overflow-y-auto bg-app transition-[margin] duration-200 ${
        chatViewMode === "docked" ? "pb-[45vh] lg:pb-0 lg:mr-96" : ""
      }`}
    >
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
        {/* Local Model or BYOK Onboarding Banner */}
        <ByokOnboardingBanner />

        {/* Live multi-agent projects — the main surface */}
        <div id="section-projects" className={`rounded-2xl ${flash("section-projects")}`}>
          <ProjectCanvas />
        </div>

        {/* Live 3D Microscopic Neural Brain Canvas */}
        <div id="section-brain" className={`rounded-2xl ${flash("section-brain")}`}>
          <div className="glass-card overflow-hidden rounded-2xl border border-border-metal p-1 shadow-sm">
            <div className="flex items-center justify-between border-b border-border-metal bg-slate-900/40 px-4 py-2.5 backdrop-blur">
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/20 text-sky-400 ring-1 ring-sky-400/30">
                  <Brain className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="font-heading text-sm font-semibold text-slate-100">
                    Live 3D Neural Canvas
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Dual-hemisphere biological network with real-time axon firing
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => openUserProfile("brain")}
                className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-xs font-medium text-slate-200 transition-colors hover:border-sky-400/50 hover:text-sky-300"
              >
                Expand Hologram
                <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <NeuralBrainCanvas className="h-[460px] w-full" />
          </div>
        </div>

        {/* Page heading */}
        <div id="section-top" className={`flex flex-wrap items-end justify-between gap-3 rounded-xl ${flash("section-top")}`}>
          <div>
            <h1 className="font-heading text-xl font-bold tracking-tight text-white">
              Agent Dashboard
            </h1>
            <p className="mt-1 text-sm text-[#CCCCCC] font-inter">
              Live status across the GrowForge Digital agent roster.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openAdminDrawer("logs")}
            className="flex items-center gap-1.5 rounded-xl border border-[#333333] bg-[#111c34]/80 px-3.5 py-2 text-xs font-medium text-[#CCCCCC] backdrop-blur-xl transition-colors hover:border-electric/50 hover:text-white"
          >
            <span>View all runs</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-electric" />
          </button>
        </div>

        {/* Placeholder for nav destinations without dedicated content yet */}
        {placeholder && (
          <div
            id="section-placeholder"
            className={`glass-card flex items-start gap-4 rounded-xl p-5 ${flash("section-placeholder")}`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-electric/15 to-gold/15 text-electric ring-1 ring-border-metal">
              <placeholder.icon className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-heading text-sm font-semibold text-navy">{placeholder.title}</h2>
              <p className="mt-1 text-sm text-secondary">{placeholder.body}</p>
            </div>
          </div>
        )}

        {/* Real-time Activity — live counters + the Needs Attention panel.
         *  This is what the "Real-time Activity" nav item points at. */}
        <div id="section-activity" className={`grid grid-cols-1 gap-4 lg:grid-cols-4 ${flash("section-activity")}`}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:col-span-3">
            {summaryCards.map((card) => {
              const Icon = card.icon;
              return (
                <button
                  key={card.label}
                  type="button"
                  onClick={card.onClick}
                  title={card.title}
                  className="glass-card rounded-xl p-4 text-left transition-transform hover:scale-[1.01] hover:ring-1 hover:ring-electric/30"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted">
                      {card.label}
                    </p>
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-lg ring-1 ${TONE_CLASSES[card.tone]}`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                  </div>
                  <p className="mt-3 font-heading text-2xl font-bold text-navy">{card.value}</p>
                </button>
              );
            })}
          </div>
          <NeedsAttention />
        </div>

        {/* Execution pipeline — provisioned → executing → completed */}
        <ExecutiveFunnel />

        {/* Agent Roster — a single summary card, not a second copy of the
         *  same list the overlay already shows. The Execution Pipeline
         *  above already states the provisioned count; this just adds the
         *  one thing that isn't there yet (how many are active right now)
         *  and the one real entry point into the full roster. */}
        <button
          type="button"
          id="section-roster"
          onClick={openAgentRoster}
          className={`glass-card flex w-full items-center justify-between rounded-xl p-4 text-left transition-transform hover:scale-[1.01] hover:ring-1 hover:ring-electric/30 ${flash("section-roster")}`}
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-electric/10 text-electric ring-1 ring-border-metal">
              <Bot className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-heading text-sm font-semibold text-navy">Agent Roster</h2>
              <p className="text-xs text-secondary">
                {liveAgents.length} agents registered
                {liveAgents.some((a) => a.status === "active")
                  ? ` · ${liveAgents.filter((a) => a.status === "active").length} active now`
                  : ""}
              </p>
            </div>
          </div>
          <span className="flex items-center gap-1 text-xs font-medium text-electric">
            View roster
            <ArrowUpRight className="h-3.5 w-3.5" />
          </span>
        </button>

        {/* System Health — real, already-computable connection/reachability
         *  states, not invented uptime percentages. */}
        <SystemHealth />
      </div>

      <UserProfileOverlay user={user} />
      <SettingsOverlay />
      <AgentRosterOverlay />
    </main>
  );
}
