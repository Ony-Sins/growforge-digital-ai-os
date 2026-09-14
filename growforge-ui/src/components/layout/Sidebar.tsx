"use client";

import Image from "next/image";
import {
  Activity,
  Bot,
  LayoutDashboard,
  Library,
  Lock,
  MessageSquare,
  ScrollText,
  Settings,
  Terminal,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { agents, navSections } from "@/lib/agents";
import { StatusDot } from "@/components/ui/StatusDot";
import { useAppState, type ActiveView } from "@/lib/appState";
import { isAgentLocked } from "@/lib/security";

const ICONS: Record<string, LucideIcon> = {
  MessageSquare,
  LayoutDashboard,
  Activity,
  Bot,
  Library,
  Workflow,
  Terminal,
  ScrollText,
  Settings,
};

export function Sidebar() {
  const { activeView, setActiveView, selectedAgentId, openAgentPanel, canAccessAgent } = useAppState();

  return (
    <aside className="hidden md:flex md:w-64 lg:w-72 shrink-0 flex-col border-r border-border-metal bg-white/70 backdrop-blur-xl">
      {/* Brand */}
      <div className="flex h-16 items-center gap-3 border-b border-border-metal px-5">
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-navy shadow-sm">
          <Image
            src="/logo.png"
            alt="GrowForge Digital"
            fill
            className="scale-[1.85] object-cover"
            sizes="40px"
            priority
          />
        </span>
        <div className="leading-tight">
          <p className="font-heading text-sm font-bold tracking-wide text-navy">GrowForge</p>
          <p className="text-[11px] font-mono uppercase tracking-widest text-muted">
            Digital AI OS
          </p>
        </div>
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

        {/* Active agents roster */}
        <div>
          <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-widest text-muted">
            Agent Roster
          </p>
          <ul className="space-y-0.5">
            {agents.map((agent) => {
              const isSelected = selectedAgentId === agent.id;
              const locked = isAgentLocked(agent.id) && !canAccessAgent(agent.id);
              return (
                <li key={agent.id}>
                  <button
                    type="button"
                    onClick={() => openAgentPanel(agent.id)}
                    aria-current={isSelected ? "true" : undefined}
                    className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                      isSelected
                        ? "bg-sunken text-navy ring-1 ring-border-metal-strong"
                        : "text-secondary hover:bg-sunken hover:text-navy"
                    }`}
                  >
                    <StatusDot status={agent.status} pulse={agent.status === "active"} />
                    <span className="min-w-0 flex-1 truncate">{agent.name}</span>
                    {locked && <Lock className="h-3 w-3 shrink-0 text-muted" />}
                    <span className="shrink-0 font-mono text-[10px] text-muted">
                      {agent.lastRun}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-border-metal p-4">
        <RoleSwitcher />
        <div className="mt-3 flex items-center gap-3 rounded-xl bg-gradient-to-r from-electric/10 to-gold/10 px-3 py-2.5 ring-1 ring-border-metal">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-navy font-mono text-xs font-semibold text-gold">
            GF
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-medium text-navy">GrowForge Ops</p>
            <p className="truncate text-[11px] text-muted">7 agents online</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

/** Demo role switcher — there's no backend auth/session in this app, so
 *  stepping down to Employee is instant while stepping up to Owner requires
 *  the owner PIN (see src/lib/security.ts). */
function RoleSwitcher() {
  const { role, setRole, requestOwnerUnlock } = useAppState();

  return (
    <div className="flex items-center justify-between rounded-lg border border-border-metal bg-sunken px-2.5 py-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted">Viewing as</span>
      <div className="flex overflow-hidden rounded-md border border-border-metal-strong">
        <button
          type="button"
          onClick={() => setRole("employee")}
          className={`px-2 py-1 text-[11px] font-medium transition-colors ${
            role === "employee" ? "bg-white text-navy" : "bg-transparent text-muted hover:text-navy"
          }`}
        >
          Employee
        </button>
        <button
          type="button"
          onClick={() => (role === "owner" ? undefined : requestOwnerUnlock())}
          className={`px-2 py-1 text-[11px] font-medium transition-colors ${
            role === "owner" ? "bg-navy text-gold" : "bg-transparent text-muted hover:text-navy"
          }`}
        >
          Owner
        </button>
      </div>
    </div>
  );
}
