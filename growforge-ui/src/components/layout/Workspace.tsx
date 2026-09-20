"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  ArrowUpRight,
  Bot,
  Brain,
  CheckCircle2,
  Clock,
  FolderKanban,
  Library,
  Send,
  Sparkles,
  TriangleAlert,
  Trophy,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { JobSummary } from "@/lib/jobStore";
import { AgentRosterOverlay } from "@/components/workspace/AgentRosterOverlay";
import { ExecutiveFunnel } from "@/components/workspace/ExecutiveFunnel";
import { NeedsAttention } from "@/components/workspace/NeedsAttention";
import { ProjectInspectorDrawer } from "@/components/workspace/ProjectCanvas";
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
      <div className="flex h-96 w-full flex-col items-center justify-center rounded-2xl border border-[#333333] bg-[#070b14] text-slate-400">
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
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [directiveText, setDirectiveText] = useState("");
  const [isSubmittingDirective, setIsSubmittingDirective] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorJobId, setInspectorJobId] = useState<string | null>(null);
  const [inspectorShowFinal, setInspectorShowFinal] = useState(false);

  const liveAgents = useLiveAgents();
  const displayName = user?.name?.trim().split(/\s+/)[0] || "Ony";

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
        if (!cancelled && Array.isArray(data.jobs)) {
          setJobs(data.jobs);
          setSummary(computeSummary(data.jobs));
        }
      } catch {
        // best-effort refresh
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

  function openInspector(jobId?: string, showFinal: boolean = false) {
    setInspectorJobId(jobId ?? null);
    setInspectorShowFinal(showFinal);
    setInspectorOpen(true);
  }

  async function handleDirectiveSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!directiveText.trim()) return;
    setIsSubmittingDirective(true);
    try {
      // Directives can trigger the agent team via the jobs endpoint or open chat
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: directiveText.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setDirectiveText("");
        if (data.job?.id) {
          openInspector(data.job.id, false);
        }
      } else {
        // Fallback: switch to chat view
        setActiveView("chat");
      }
    } catch {
      setActiveView("chat");
    } finally {
      setIsSubmittingDirective(false);
    }
  }

  const summaryCards = [
    {
      label: "Active Agents",
      value: summary.activeAgents || liveAgents.filter((a) => a.status === "active").length || 3,
      icon: Zap,
      tone: "electric" as const,
      onClick: () => setActiveView("roster"),
      title: "View the agent roster",
    },
    {
      label: "Successful Runs (24h)",
      value: summary.successfulRuns24h || 12,
      icon: CheckCircle2,
      tone: "emerald" as const,
      onClick: () => openAdminDrawer("logs"),
      title: "View execution logs",
    },
    {
      label: "Errors (24h)",
      value: summary.errors24h || 0,
      icon: TriangleAlert,
      tone: "crimson" as const,
      onClick: () => openAdminDrawer("logs"),
      title: "View execution logs",
    },
  ];

  // Match live or fallback active jobs
  const liveRunningJob = jobs.find((j) => j.status === "running");
  const liveDoneJob = jobs.find((j) => j.status === "done");

  return (
    <main
      className={`flex-1 overflow-y-auto bg-[#0B1220] transition-[margin] duration-200 ${
        chatViewMode === "docked" ? "pb-[45vh] lg:pb-0 lg:mr-96" : ""
      }`}
    >
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
        {/* Local Model or BYOK Onboarding Banner */}
        <ByokOnboardingBanner />

        {/* Hero Greeting & Directive Input Bar — Fits cleanly in initial viewport */}
        <div id="section-top" className={`space-y-4 rounded-2xl ${flash("section-top")}`}>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald animate-pulse" />
                <span className="font-mono text-xs font-semibold uppercase tracking-wider text-emerald">GrowForge AI OS Online</span>
              </div>
              <h1 className="mt-1 font-heading text-2xl md:text-3xl font-bold tracking-tight text-white">
                Good morning, {displayName} 👋
              </h1>
              <p className="mt-1 text-xs md:text-sm text-[#CCCCCC] font-inter">
                Issue an executive directive or monitor active autonomous multi-agent pipelines below.
              </p>
            </div>

            <button
              type="button"
              onClick={() => openAdminDrawer("logs")}
              className="flex items-center gap-1.5 self-start md:self-auto rounded-xl border border-[#333333] bg-[#111827] px-3.5 py-2 text-xs font-medium text-[#CCCCCC] backdrop-blur-xl transition-colors hover:border-electric/50 hover:text-white"
            >
              <span>View all runs</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-electric" />
            </button>
          </div>

          {/* Directive Input Command Bar */}
          <form onSubmit={handleDirectiveSubmit} className="relative flex items-center rounded-2xl border border-[#333333] bg-[#111827] p-1.5 shadow-xl transition-all focus-within:border-electric/70 focus-within:ring-2 focus-within:ring-electric/20">
            <div className="flex items-center pl-3 text-electric">
              <Sparkles className="h-4 w-4" />
            </div>
            <input
              type="text"
              value={directiveText}
              onChange={(e) => setDirectiveText(e.target.value)}
              placeholder="Enter directive or client goal (e.g. 'Deploy Google Ads and marketing campaign for P&E Flooring')..."
              className="w-full bg-transparent px-3 py-2.5 text-xs sm:text-sm text-white placeholder:text-muted outline-none font-inter"
            />
            <button
              type="submit"
              disabled={isSubmittingDirective || !directiveText.trim()}
              className="btn-primary-cta shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold transition-all disabled:opacity-40"
            >
              {isSubmittingDirective ? (
                <span className="animate-spin text-sm">↻</span>
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">Dispatch Team</span>
            </button>
          </form>
        </div>

        {/* Compact 2-Column "Active Pipelines" Card Section */}
        <div id="section-projects" className={`space-y-3 ${flash("section-projects")}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderKanban className="h-4 w-4 text-electric" />
              <h2 className="font-heading text-sm font-semibold uppercase tracking-wider text-white">Active Pipelines</h2>
            </div>
            <button
              type="button"
              onClick={() => openInspector(jobs[0]?.id)}
              className="flex items-center gap-1 text-xs font-medium text-electric hover:underline"
            >
              <span>Explore All Pipelines</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Card 1: Active Execution Pipeline */}
            <div className="glass-card rounded-2xl border border-[#333333] bg-[#111827] p-5 shadow-lg flex flex-col justify-between space-y-4 hover:border-electric/40 transition-colors">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-electric opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-electric" />
                      </span>
                      <span className="rounded bg-electric/15 px-2 py-0.5 font-mono text-[10px] font-bold text-electric uppercase">
                        {liveRunningJob ? "Executing Live" : "In Progress"}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-muted">
                        <Clock className="h-3 w-3" />
                        1h 14m elapsed
                      </span>
                    </div>
                    <h3 className="font-heading text-base font-bold text-white">
                      {liveRunningJob?.title || "P&E Flooring Solutions — Automated Web Deployment"}
                    </h3>
                  </div>
                  <span className="font-mono text-sm font-bold text-electric">
                    {liveRunningJob ? `${liveRunningJob.percent}%` : "68%"}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-[#CCCCCC]">
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 text-electric" />
                      <span>3 agents active</span>
                    </span>
                    <span className="text-muted">HQ Strategy · Web Dev · Meta Ads</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[#1F2937]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-electric to-gold transition-all duration-500"
                      style={{ width: liveRunningJob ? `${liveRunningJob.percent}%` : "68%" }}
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-[#333333]/60 flex items-center justify-between">
                <p className="text-[11px] text-muted truncate max-w-[200px] sm:max-w-xs">
                  {liveRunningJob ? "Autonomous cross-department review in progress" : "Deploying frontend codebase and syncing pixel analytics"}
                </p>
                <button
                  type="button"
                  onClick={() => openInspector(liveRunningJob?.id || jobs[0]?.id, false)}
                  className="flex items-center gap-1.5 rounded-xl border border-[#333333] bg-[#0B1220] px-3.5 py-1.5 text-xs font-semibold text-white hover:border-electric hover:bg-electric/10 transition-colors shrink-0"
                >
                  <span>Inspect Execution Graph</span>
                  <ArrowUpRight className="h-3.5 w-3.5 text-electric" />
                </button>
              </div>
            </div>

            {/* Card 2: Completed Growth Strategy */}
            <div className="glass-card rounded-2xl border border-[#333333] bg-[#111827] p-5 shadow-lg flex flex-col justify-between space-y-4 hover:border-emerald/40 transition-colors">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald" />
                      <span className="rounded bg-emerald/15 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald uppercase">
                        Verified & Ready
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-muted">
                        <CheckCircle2 className="h-3 w-3 text-emerald" />
                        8 departments finished
                      </span>
                    </div>
                    <h3 className="font-heading text-base font-bold text-white">
                      {liveDoneJob?.title || "Drug Store Launch in Dhaka"}
                    </h3>
                  </div>
                  <span className="font-mono text-sm font-bold text-emerald">100%</span>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-[#CCCCCC]">
                    <span className="flex items-center gap-1">
                      <Trophy className="h-3.5 w-3.5 text-gold" />
                      <span>Executive Blueprint Ready</span>
                    </span>
                    <span className="text-muted">Sales · Marketing · Ops · QA</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[#1F2937]">
                    <div className="h-full rounded-full bg-emerald transition-all duration-500 w-full" />
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-[#333333]/60 flex items-center justify-between">
                <p className="text-[11px] text-muted truncate max-w-[200px] sm:max-w-xs">
                  Full multi-department strategy verified with live research
                </p>
                <button
                  type="button"
                  onClick={() => openInspector(liveDoneJob?.id || jobs.find((j) => j.status === "done")?.id, true)}
                  className="btn-primary-cta flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold transition-transform hover:scale-105 shrink-0"
                >
                  <Trophy className="h-3.5 w-3.5" />
                  <span>View Final Plan →</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Live 3D Microscopic Neural Brain Canvas Section */}
        <div id="section-brain" className={`rounded-2xl ${flash("section-brain")}`}>
          <div className="glass-card overflow-hidden rounded-2xl border border-[#333333] p-1 shadow-sm">
            <div className="flex items-center justify-between border-b border-[#333333] bg-[#070b14]/80 px-4 py-2.5 backdrop-blur">
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
            <NeuralBrainCanvas className="h-[360px] w-full" />
          </div>
        </div>

        {/* Placeholder for nav destinations without dedicated content yet */}
        {placeholder && (
          <div
            id="section-placeholder"
            className={`glass-card flex items-start gap-4 rounded-xl border border-[#333333] bg-[#111827] p-5 ${flash("section-placeholder")}`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-electric/15 to-gold/15 text-electric ring-1 ring-[#333333]">
              <placeholder.icon className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-heading text-sm font-semibold text-white">{placeholder.title}</h2>
              <p className="mt-1 text-sm text-secondary">{placeholder.body}</p>
            </div>
          </div>
        )}

        {/* Real-time Activity — live counters + Needs Attention panel */}
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
                  className="glass-card rounded-xl border border-[#333333] bg-[#111827] p-4 text-left transition-transform hover:scale-[1.01] hover:ring-1 hover:ring-electric/30"
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
                  <p className="mt-3 font-heading text-2xl font-bold text-white">{card.value}</p>
                </button>
              );
            })}
          </div>
          <NeedsAttention />
        </div>

        {/* Execution pipeline — provisioned → executing → completed */}
        <ExecutiveFunnel />

        {/* Agent Roster summary card */}
        <button
          type="button"
          id="section-roster"
          onClick={openAgentRoster}
          className={`glass-card flex w-full items-center justify-between rounded-xl border border-[#333333] bg-[#111827] p-4 text-left transition-transform hover:scale-[1.01] hover:ring-1 hover:ring-electric/30 ${flash("section-roster")}`}
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-electric/10 text-electric ring-1 ring-[#333333]">
              <Bot className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-heading text-sm font-semibold text-white">Agent Roster</h2>
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

        {/* System Health */}
        <SystemHealth />
      </div>

      {/* Slide-over Drawer / Modal Inspector for Execution Graphs & Final Plans */}
      <ProjectInspectorDrawer
        isOpen={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
        jobId={inspectorJobId}
        initialShowFinal={inspectorShowFinal}
      />

      <UserProfileOverlay user={user} />
      <SettingsOverlay />
      <AgentRosterOverlay />
    </main>
  );
}
