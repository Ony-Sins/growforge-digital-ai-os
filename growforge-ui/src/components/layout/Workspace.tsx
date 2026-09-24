"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CheckCircle2, FolderKanban, Plus, Trophy, Zap } from "lucide-react";
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
const TEST_JOB_ID = /^job-(test|crash-test|research-verify)/;

function sectionIdFor(view: ActiveView): string | null {
  switch (view) {
    case "chat":
      return null;
    case "activity":
      return "section-operational";
    default:
      return "section-projects";
  }
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function Workspace({ user }: { user: WorkspaceUser | null }) {
  const { activeView, activeViewToken, openUserProfile, openAgentRoster, openVaultLibrary, chatViewMode } = useAppState();
  const [flashSection, setFlashSection] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobSummary[] | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorJobId, setInspectorJobId] = useState<string | null>(null);
  const [inspectorShowFinal, setInspectorShowFinal] = useState(false);

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
    if (activeView === "profile") {
      openUserProfile("profile");
      return;
    }
    const id = sectionIdFor(activeView);
    if (!id) return;
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- drives a CSS highlight in response to nav clicks, not derived render state
    setFlashSection(id);
    const t = setTimeout(() => setFlashSection(null), 1000);
    return () => clearTimeout(t);
  }, [activeView, activeViewToken, openAgentRoster, openUserProfile, openVaultLibrary]);

  useEffect(() => {
    let unmounted = false;
    async function loadJobs() {
      try {
        const res = await fetch("/api/jobs");
        if (!unmounted && res.ok) {
          const data = await res.json();
          const list: JobSummary[] = Array.isArray(data.jobs) ? data.jobs : [];
          setJobs([...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
        }
      } catch (err) {
        console.error("Failed to load projects:", err);
      }
    }
    void loadJobs();
    const interval = setInterval(loadJobs, JOB_POLL_INTERVAL_MS);
    return () => {
      unmounted = true;
      clearInterval(interval);
    };
  }, []);

  const flash = (id: string) =>
    flashSection === id ? "ring-2 ring-electric/80 ring-offset-2 ring-offset-[#0B1220] transition-all duration-700" : "";

  function openInspector(jobId: string, showFinal: boolean) {
    setInspectorJobId(jobId);
    setInspectorShowFinal(showFinal);
    setInspectorOpen(true);
  }

  return (
    <main
      className={`flex-1 overflow-y-auto bg-[#0B1220] transition-[margin] duration-200 ${
        chatViewMode === "docked" ? "pb-[45vh] lg:pb-0 lg:mr-96" : ""
      }`}
    >
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
        <ByokOnboardingBanner />

        {/* Projects — every card is a real job from the job store */}
        <div id="section-projects" className={`space-y-4 rounded-2xl ${flash("section-projects")}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FolderKanban className="h-5 w-5 text-electric" />
              <h1 className="font-sora text-sm font-bold uppercase tracking-tight text-white">Projects</h1>
              {jobs && <span className="font-mono text-xs text-muted">{jobs.length} on record</span>}
            </div>
            <Link
              href="/core"
              className="flex items-center gap-1.5 rounded-xl border border-electric/40 bg-electric/10 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-electric/20"
            >
              <Plus className="h-3.5 w-3.5 text-electric" />
              New brief in CORE
            </Link>
          </div>

          {jobs === null && <p className="font-mono text-xs text-muted">Loading projects…</p>}

          {jobs?.length === 0 && (
            <div className="rounded-2xl border border-dashed border-[#333333] p-10 text-center">
              <p className="font-sora text-sm font-bold text-white">No projects yet</p>
              <p className="mt-1 text-xs text-[#CCCCCC]">
                Launch a brief from CORE, or describe a project to the AI Assistant, and it will appear here as real work completes.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {jobs?.map((job) => {
              const running = job.status === "running";
              const done = job.status === "done";
              const isTest = TEST_JOB_ID.test(job.id);
              return (
                <div
                  key={job.id}
                  className="flex flex-col justify-between space-y-4 rounded-2xl border border-[#333333] bg-[#0B1220]/75 p-5 shadow-2xl backdrop-blur-xl transition-all hover:border-[#0078FF]/40"
                >
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
                          running ? "bg-electric/15 text-electric" : done ? "bg-emerald/15 text-emerald" : "bg-red-500/15 text-red-300"
                        }`}
                      >
                        {running ? "Running" : done ? "Finished" : "Error"}
                      </span>
                      <span className={`font-mono text-[10px] ${job.verified ? "text-emerald" : "text-amber-300"}`}>
                        {job.verified ? "live research verified" : "unverified research"}
                      </span>
                      {isTest && <span className="rounded border border-[#333333] px-1.5 py-0.5 font-mono text-[10px] text-muted">test</span>}
                      {done && job.approvedAt && (
                        <span className="flex items-center gap-1 font-mono text-[10px] text-emerald">
                          <CheckCircle2 className="h-3 w-3" /> approved
                        </span>
                      )}
                    </div>
                    <h3 className="font-sora text-sm font-bold text-white md:text-base">{job.title || "Untitled project"}</h3>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between font-inter text-xs text-[#CCCCCC]">
                        <span className="truncate">{running ? (job.activeStep ?? "Working") : formatWhen(job.finishedAt ?? job.createdAt)}</span>
                        <span className="font-mono font-bold text-white">{job.percent}%</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-[#1F2937]">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${done ? "bg-emerald" : "bg-gradient-to-r from-electric to-gold"}`}
                          style={{ width: `${job.percent}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t border-[#333333]/60 pt-3">
                    <button
                      type="button"
                      onClick={() => openInspector(job.id, false)}
                      className="flex items-center gap-1.5 rounded-xl border border-[#333333] bg-[#0B1220] px-3.5 py-1.5 font-inter text-xs font-semibold text-white transition-colors hover:border-electric hover:bg-electric/10"
                    >
                      Inspect execution graph
                      <ArrowUpRight className="h-3.5 w-3.5 text-electric" />
                    </button>
                    {job.hasFinalOutput && (
                      <button
                        type="button"
                        onClick={() => openInspector(job.id, true)}
                        className="btn-primary-cta flex items-center gap-1.5 px-3.5 py-1.5 text-xs"
                      >
                        <Trophy className="h-3.5 w-3.5" />
                        View final plan
                      </button>
                    )}
                    <Link
                      href={`/core?job=${encodeURIComponent(job.id)}`}
                      className="ml-auto flex items-center gap-1 font-mono text-xs text-electric hover:underline"
                    >
                      <Zap className="h-3 w-3" />
                      Open in CORE
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Operational row: human-in-the-loop queue + live system health */}
        <div id="section-operational" className={`grid grid-cols-1 gap-4 lg:grid-cols-2 ${flash("section-operational")}`}>
          <NeedsAttention />
          <SystemHealth />
        </div>
      </div>

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
