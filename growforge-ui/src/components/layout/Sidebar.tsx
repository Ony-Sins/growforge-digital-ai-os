"use client";

import Image from "next/image";
import {
  Activity,
  Bot,
  Brain,
  LayoutDashboard,
  Library,
  MessageSquare,
  ScrollText,
  Settings,
  Terminal,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { navSections } from "@/lib/agents";
import { useAppState, type ActiveView } from "@/lib/appState";
import { useLiveAgents } from "@/lib/useLiveAgents";

const ICONS: Record<string, LucideIcon> = {
  MessageSquare,
  LayoutDashboard,
  Activity,
  Bot,
  Brain,
  Library,
  Workflow,
  Terminal,
  ScrollText,
  Settings,
  Zap,
};

export function Sidebar() {
  const { activeView, setActiveView } = useAppState();
  const agents = useLiveAgents();

  return (
    <aside className="hidden md:flex md:w-64 lg:w-72 shrink-0 flex-col border-r border-border-metal bg-white/70 backdrop-blur-xl">
      {/* Brand — also the way home, same as the header's console crumb */}
      <div className="flex h-18 items-center border-b border-border-metal px-3 py-3">
        <button
          type="button"
          onClick={() => setActiveView("dashboard")}
          title="Back to dashboard home"
          className="flex w-full items-center gap-3 bg-white shadow-sm border border-slate-100 rounded-xl px-3 py-2 text-left transition-colors hover:bg-slate-50"
        >
          <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white">
            <Image
              src="/logo-mark.png"
              alt="GrowForge Digital"
              fill
              className="object-contain"
              sizes="32px"
              priority
            />
          </span>
          <div className="leading-tight">
            <p className="font-heading text-sm font-bold tracking-wide text-navy">GrowForge</p>
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted">
              Digital AI OS
            </p>
          </div>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {navSections.map((section) => (
          <div key={section.label} className="mb-6">
            <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-widest text-muted">
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = ICONS[item.icon];
                const active = activeView === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setActiveView(item.id as ActiveView)}
                      aria-current={active ? "page" : undefined}
                      className={`group flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                        active
                          ? "bg-gradient-to-r from-electric/10 to-gold/10 text-navy ring-1 ring-border-metal-strong"
                          : "text-secondary hover:bg-sunken hover:text-navy"
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 shrink-0 ${
                          active ? "text-electric" : "text-muted group-hover:text-electric"
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                      {active && (
                        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-electric glow-electric" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {/* The full per-agent list used to render here permanently,
         *  competing with primary navigation for attention on every screen
         *  regardless of what the user was doing. Removed — "Agent Roster"
         *  in the Overview section above already links to the Roster page
         *  for anyone who wants that detail. */}
      </nav>

      {/* Footer */}
      <div className="border-t border-border-metal p-4">
        {/* The old "User Profile / AI Brain" button here duplicated the
         *  header's own avatar button (same overlay, same "profile" tab) —
         *  removed rather than kept as a second entry point to the same
         *  place. */}

        {/* Mode (Simple/Advanced) and role (Employee/Owner) switchers moved
         *  into Settings — configuration decisions, not everyday actions,
         *  so they don't need permanent sidebar real estate. See the
         *  "Interface & Access" card at the top of the Settings section. */}
        <div className="flex items-center gap-3 bg-white shadow-sm border border-slate-100 rounded-xl px-3 py-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-navy font-mono text-xs font-semibold text-gold shadow-sm">
            GF
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold text-navy">GrowForge Ops</p>
            <p className="truncate text-[11px] text-muted">
              {agents.length} agents
              {agents.some((a) => a.status === "active")
                ? ` · ${agents.filter((a) => a.status === "active").length} active`
                : " registered"}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}

