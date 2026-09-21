"use client";

import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  Clock,
  FolderKanban,
  Send,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import type { JobSummary } from "@/lib/jobStore";
import { AgentRosterOverlay } from "@/components/workspace/AgentRosterOverlay";
import { NeedsAttention } from "@/components/workspace/NeedsAttention";
import { ProjectInspectorDrawer } from "@/components/workspace/ProjectCanvas";
import { SettingsOverlay } from "@/components/workspace/SettingsOverlay";
import { SystemHealth } from "@/components/workspace/SystemHealth";
import { UserProfileOverlay } from "@/components/workspace/UserProfileOverlay";
import { VaultLibraryOverlay } from "@/components/workspace/VaultLibraryOverlay";
import { ByokOnboardingBanner } from "@/components/workspace/ByokOnboardingBanner";
import { useAppState, type ActiveView } from "@/lib/appState";

interface WorkspaceUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role: "owner" | "employee";
}

const JOB_POLL_INTERVAL_MS = 5000;

const STARTER_PROMPTS = [
  "Deploy Google & Meta Ads for P&E Flooring",
  "Dhaka Drug Store GTM Launch Blueprint",
  "Run cross-department strategic audit",
  "Draft high-ticket B2B sales sequence",
];

function sectionIdFor(view: ActiveView): string | null {
  switch (view) {
    case "chat":
      return null;
    case "activity":
      return "section-operational";
    case "workflows":
      return "section-projects";
    case "dashboard":
    default:
      return "section-top";
  }
}

function resolveGreetingName(userPropName?: string | null, memoryProfileName?: string | null): string {
  const candidate = (memoryProfileName || userPropName || "").trim();

  if (!candidate || candidate.toLowerCase().startsWith("dev") || candidate.toLowerCase() === "preview") {
    return "Ony";
  }

  if (
    /arif\s+md\.?\s*anjum\s+ony/i.test(candidate) ||
    /\bony\b/i.test(candidate)
  ) {
    return "Ony";
  }

  const first = candidate.split(/\s+/)[0];
  if (first.toLowerCase().startsWith("dev") || first.toLowerCase() === "preview") {
    return "Ony";
  }

  return first || "Ony";
}

export function Workspace({ user }: { user: WorkspaceUser | null }) {
  const {
    activeView,
    activeViewToken,
    setActiveView,
    openAdminDrawer,
    openUserProfile,
    openAgentRoster,
    openVaultLibrary,
    chatViewMode,
    profileName,
  } = useAppState();
  const [flashSection, setFlashSection] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [directiveText, setDirectiveText] = useState("");
  const [isSubmittingDirective, setIsSubmittingDirective] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorJobId, setInspectorJobId] = useState<string | null>(null);
  const [inspectorShowFinal, setInspectorShowFinal] = useState(false);

  const displayName = resolveGreetingName(user?.name, profileName);

  useEffect(() => {
    if (activeView === "brain") {
      openUserProfile("brain");
      return;
    }
    if (activeView === "roster") {
      openAgentRoster();
      return;
    }
    if (activeView === "vault") {
      openVaultLibrary();
      return;
    }
    const id = sectionIdFor(activeView);
    if (!id) return;
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- drives a CSS highlight in response to nav clicks, not derived render state
    setFlashSection(id);
    const t = setTimeout(() => setFlashSection(null), 1000);
    return () => clearTimeout(t);
  }, [activeView, activeViewToken, openUserProfile, openAgentRoster, openVaultLibrary]);

  useEffect(() => {
    let cancelled = false;
    async function loadJobs() {
      try {
        const res = await fetch("/api/jobs");
        if (!res.ok || cancelled) return;
        const data: { jobs: JobSummary[] } = await res.json();
        if (!cancelled && Array.isArray(data.jobs)) {
          setJobs(data.jobs);
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

  function openInspector(jobId?: string, showFinal: boolean = false) {
    setInspectorJobId(jobId ?? null);
    setInspectorShowFinal(showFinal);
    setInspectorOpen(true);
  }

  async function handleDirectiveSubmit(e: React.FormEvent, customPrompt?: string) {
    e?.preventDefault?.();
    const promptToSend = customPrompt || directiveText.trim();
    if (!promptToSend) return;
    setIsSubmittingDirective(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptToSend }),
      });
      if (res.ok) {
        const data = await res.json();
        setDirectiveText("");
        if (data.job?.id) {
          openInspector(data.job.id, false);
        }
      } else {
        setActiveView("chat");
      }
    } catch {
      setActiveView("chat");
    } finally {
      setIsSubmittingDirective(false);
    }
  }

  const liveRunningJob = jobs.find((j) => j.status === "running");
  const liveDoneJob = jobs.find((j) => j.status === "done");

  return (
    <main
      className={`flex-1 overflow-y-auto bg-[#0B1220] transition-[margin] duration-200 ${
        chatViewMode === "docked" ? "pb-[45vh] lg:pb-0 lg:mr-96" : ""
      }`}
    >
      <div className="mx-auto max-w-7xl space-y-4 md:space-y-5 p-4 md:p-6">
        {/* Local Model or BYOK Onboarding Banner */}
        <ByokOnboardingBanner />

        {/* 1. Hero Command Bar — Clean, high-impact initial viewport */}
        <div id="section-top" className={`space-y-3 rounded-2xl ${flash("section-top")}`}>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald animate-pulse" />
                <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-emerald">
                  GrowForge AI OS Online
                </span>
              </div>
              <h1 className="mt-1 font-heading text-2xl md:text-3xl font-bold tracking-tight text-white">
                Good morning, {displayName}
              </h1>
              <p className="mt-0.5 text-xs md:text-sm text-[#CCCCCC] font-inter">
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
          <form
            onSubmit={(e) => handleDirectiveSubmit(e)}
            className="relative flex items-center rounded-2xl border border-[#333333] bg-[#0B1220]/80 backdrop-blur-xl p-1.5 shadow-2xl transition-all focus-within:border-electric/70 focus-within:ring-2 focus-within:ring-electric/20"
          >
            <div className="flex items-center pl-3 text-electric">
              <Sparkles className="h-4 w-4" />
            </div>
            <input
              type="text"
              value={directiveText}
              onChange={(e) => setDirectiveText(e.target.value)}
              placeholder="Enter directive or client goal (e.g. 'Deploy Google Ads and marketing campaign for P&E Flooring')..."
              className="w-full bg-transparent px-3 py-2 text-xs sm:text-sm text-white placeholder:text-muted outline-none font-inter"
            />
            <button
              type="submit"
              disabled={isSubmittingDirective || !directiveText.trim()}
              className="btn-primary-cta shrink-0 flex items-center gap-1.5 px-4 py-2 text-xs transition-all disabled:opacity-40"
            >
              {isSubmittingDirective ? (
                <span className="animate-spin text-sm">↻</span>
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">Dispatch Team →</span>
            </button>
          </form>

          {/* Starter Prompt Chips */}
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <span className="font-inter text-xs text-[#CCCCCC]">Quick directives:</span>
            {STARTER_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => {
                  setDirectiveText(prompt);
                }}
                className="rounded-lg border border-[#333333] bg-[#0B1220]/75 backdrop-blur-sm px-2.5 py-1 font-inter text-xs text-[#CCCCCC] transition-colors hover:border-electric hover:bg-electric/10 hover:text-white"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        {/* 2. Compact 2-Column "Active Pipelines" Card Grid */}
        <div id="section-projects" className={`space-y-3 ${flash("section-projects")}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderKanban className="h-4 w-4 text-electric" />
              <h2 className="font-sora font-bold text-white tracking-tight text-xs uppercase">Active Pipelines</h2>
            </div>
            <button
              type="button"
              onClick={() => openInspector(jobs[0]?.id)}
              className="flex items-center gap-1 font-inter text-xs font-medium text-electric hover:underline"
            >
              <span>Explore All Pipelines</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Card 1: Active Execution Pipeline */}
            <div className="rounded-2xl border border-[#333333] bg-[#0B1220]/75 backdrop-blur-xl hover:border-[#0078FF]/40 p-5 shadow-2xl transition-all flex flex-col justify-between space-y-4">
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
                      <span className="flex items-center gap-1 font-inter text-xs text-[#CCCCCC]">
                        <Clock className="h-3 w-3 text-[#CCCCCC]" />
                        1h 14m elapsed
                      </span>
                    </div>
                    <h3 className="font-sora text-sm md:text-base font-bold text-white">
                      {liveRunningJob?.title || "P&E Flooring Solutions — Automated Web Deployment"}
                    </h3>
                  </div>
                  <span className="font-mono text-sm font-bold text-electric">
                    {liveRunningJob ? `${liveRunningJob.percent}%` : "68%"}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between font-inter text-xs text-[#CCCCCC]">
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 text-electric" />
                      <span>3 agents active</span>
                    </span>
                    <span className="font-inter text-xs text-[#CCCCCC]">HQ Strategy · Web Dev · Meta Ads</span>
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
                <p className="font-inter text-xs text-[#CCCCCC] truncate max-w-[180px] sm:max-w-xs">
                  {liveRunningJob ? "Autonomous cross-department review in progress" : "Deploying frontend codebase and syncing analytics"}
                </p>
                <button
                  type="button"
                  onClick={() => openInspector(liveRunningJob?.id || jobs[0]?.id, false)}
                  className="flex items-center gap-1.5 rounded-xl border border-[#333333] bg-[#0B1220] px-3.5 py-1.5 font-inter text-xs font-semibold text-white hover:border-electric hover:bg-electric/10 transition-colors shrink-0"
                >
                  <span>Inspect Execution Graph</span>
                  <ArrowUpRight className="h-3.5 w-3.5 text-electric" />
                </button>
              </div>
            </div>

            {/* Card 2: Completed Growth Strategy */}
            <div className="rounded-2xl border border-[#333333] bg-[#0B1220]/75 backdrop-blur-xl hover:border-[#0078FF]/40 p-5 shadow-2xl transition-all flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald" />
                      <span className="rounded bg-emerald/15 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald uppercase">
                        Verified & Ready
                      </span>
                      <span className="flex items-center gap-1 font-inter text-xs text-[#CCCCCC]">
                        <CheckCircle2 className="h-3 w-3 text-emerald" />
                        8 departments finished
                      </span>
                    </div>
                    <h3 className="font-sora text-sm md:text-base font-bold text-white">
                      {liveDoneJob?.title || "Drug Store Launch in Dhaka"}
                    </h3>
                  </div>
                  <span className="font-mono text-sm font-bold text-emerald">100%</span>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between font-inter text-xs text-[#CCCCCC]">
                    <span className="flex items-center gap-1">
                      <Trophy className="h-3.5 w-3.5 text-gold" />
                      <span>Executive Blueprint Ready</span>
                    </span>
                    <span className="font-inter text-xs text-[#CCCCCC]">Sales · Marketing · Ops · QA</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[#1F2937]">
                    <div className="h-full rounded-full bg-emerald transition-all duration-500 w-full" />
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-[#333333]/60 flex items-center justify-between">
                <p className="font-inter text-xs text-[#CCCCCC] truncate max-w-[180px] sm:max-w-xs">
                  Full multi-department strategy verified with live research
                </p>
                <button
                  type="button"
                  onClick={() => openInspector(liveDoneJob?.id || jobs.find((j) => j.status === "done")?.id, true)}
                  className="btn-primary-cta flex items-center gap-1.5 px-3.5 py-1.5 text-xs transition-transform hover:scale-105 shrink-0"
                >
                  <Trophy className="h-3.5 w-3.5" />
                  <span>View Final Plan →</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Operational Row (Left: Needs Attention HITL queue; Right: Connected Ecosystem Status) */}
        <div id="section-operational" className={`grid grid-cols-1 gap-4 lg:grid-cols-2 ${flash("section-operational")}`}>
          <NeedsAttention />
          <SystemHealth />
        </div>
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
      <VaultLibraryOverlay />
    </main>
  );
}
