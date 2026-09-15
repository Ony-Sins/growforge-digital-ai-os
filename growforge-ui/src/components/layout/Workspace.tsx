"use client";

import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  Library,
  Lock,
  TriangleAlert,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { agents } from "@/lib/agents";
import { StatusDot, statusLabel, statusTextClass } from "@/components/ui/StatusDot";
import { NodeWorkflowCanvas } from "@/components/workspace/NodeWorkflowCanvas";
import { ChatView } from "@/components/workspace/ChatView";
import { ExecutiveFunnel } from "@/components/workspace/ExecutiveFunnel";
import { IntegrationsHub } from "@/components/workspace/IntegrationsHub";
import { ProjectCanvas } from "@/components/workspace/ProjectCanvas";
import { useAppState, type ActiveView } from "@/lib/appState";
import { isAgentLocked } from "@/lib/security";

const SUMMARY_CARDS = [
  {
    label: "Active Agents",
    value: agents.filter((a) => a.status === "active").length,
    icon: Zap,
    tone: "electric" as const,
  },
  {
    label: "Successful Runs (24h)",
    value: 128,
    icon: CheckCircle2,
    tone: "emerald" as const,
  },
  {
    label: "Errors (24h)",
    value: agents.filter((a) => a.status === "error").length,
    icon: TriangleAlert,
    tone: "crimson" as const,
  },
];

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
    body: "279 cataloged agents across 18 divisions, stored in .claude/vault/. A full browsing UI is coming soon — for now, open the files directly.",
  },
};

/** Maps a nav selection to the dashboard section it should scroll to. */
function sectionIdFor(view: ActiveView): string {
  switch (view) {
    case "chat":
      return "section-chat";
    case "activity":
      return "section-canvas";
    case "roster":
      return "section-roster";
    case "workflows":
      return "section-projects";
    case "vault":
      return "section-placeholder";
    case "settings":
      return "section-settings";
    case "dashboard":
    default:
      return "section-top";
  }
}

export function Workspace() {
  const { activeView, activeViewToken, openAgentPanel, canAccessAgent } = useAppState();
  const [flashSection, setFlashSection] = useState<string | null>(null);

  // activeViewToken bumps on every nav click, even to the same view, so a
  // repeat click still re-scrolls/re-flashes.
  useEffect(() => {
    const id = sectionIdFor(activeView);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- drives a CSS highlight in response to nav clicks, not derived render state
    setFlashSection(id);
    const t = setTimeout(() => setFlashSection(null), 1000);
    return () => clearTimeout(t);
  }, [activeView, activeViewToken]);

  const flash = (id: string) => (flashSection === id ? "section-flash" : "");
  const placeholder = PLACEHOLDER_CONTENT[activeView];

  return (
    <main className="flex-1 overflow-y-auto bg-app">
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
        {/* AI Assistant — primary conversational entry point */}
        <div id="section-chat" className={`rounded-2xl ${flash("section-chat")}`}>
          <ChatView />
        </div>

        {/* Live multi-agent projects — the main surface */}
        <div id="section-projects" className={`rounded-2xl ${flash("section-projects")}`}>
          <ProjectCanvas />
        </div>

        {/* Page heading */}
        <div id="section-top" className={`flex flex-wrap items-end justify-between gap-3 rounded-xl ${flash("section-top")}`}>
          <div>
            <h1 className="font-heading text-xl font-bold tracking-tight text-navy">
              Agent Dashboard
            </h1>
            <p className="mt-1 text-sm text-secondary">
              Live status across the GrowForge Digital agent roster.
            </p>
          </div>
          <button className="flex items-center gap-1.5 rounded-lg border border-border-metal bg-white/70 px-3 py-2 text-xs font-medium text-secondary backdrop-blur-xl transition-colors hover:border-electric/40 hover:text-electric">
            View all runs
            <ArrowUpRight className="h-3.5 w-3.5" />
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

        {/* Summary cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {SUMMARY_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="glass-card rounded-xl p-4">
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
              </div>
            );
          })}
        </div>

        {/* Executive funnel — cataloged → provisioned → executing → completed */}
        <ExecutiveFunnel />

        {/* Agent network overview */}
        <div id="section-canvas" className={`rounded-2xl ${flash("section-canvas")}`}>
          <NodeWorkflowCanvas />
        </div>

        {/* Agent roster table */}
        <div id="section-roster" className={`glass-card rounded-xl ${flash("section-roster")}`}>
          <div className="flex items-center justify-between border-b border-border-metal px-4 py-3">
            <h2 className="font-heading text-sm font-semibold text-navy">Agent Roster</h2>
            <span className="font-mono text-[11px] text-muted">{agents.length} agents</span>
          </div>
          <ul className="divide-y divide-border-metal">
            {agents.map((agent) => (
              <li key={agent.id}>
                <button
                  type="button"
                  onClick={() => openAgentPanel(agent.id)}
                  className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-sunken"
                >
                  <StatusDot status={agent.status} pulse={agent.status === "active"} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium text-navy">
                      {agent.name}
                      {isAgentLocked(agent.id) && !canAccessAgent(agent.id) && (
                        <Lock className="h-3 w-3 shrink-0 text-muted" />
                      )}
                    </p>
                    <p className="truncate text-xs text-muted">{agent.division}</p>
                  </div>
                  <span className={`shrink-0 text-xs font-medium ${statusTextClass(agent.status)}`}>
                    {statusLabel(agent.status)}
                  </span>
                  <span className="hidden shrink-0 font-mono text-xs text-muted sm:inline">
                    {agent.lastRun}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Settings — AI provider keys + custom connectors */}
        <div id="section-settings" className={`rounded-2xl ${flash("section-settings")}`}>
          <IntegrationsHub />
        </div>
      </div>
    </main>
  );
}
