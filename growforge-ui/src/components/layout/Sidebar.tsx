"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { navSections } from "@/lib/agents";
import { useAppState, type ActiveView } from "@/lib/appState";
import { useLiveAgents } from "@/lib/useLiveAgents";
import { useTelemetry } from "@/lib/useTelemetry";

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
  const { activeView, setActiveView, companyName } = useAppState();
  const router = useRouter();
  const agents = useLiveAgents();
  const { telemetry } = useTelemetry();
  const isPipelineActive = telemetry.executionState === "processing";

  const brandInitials = companyName
    ? companyName.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : "OP";

  return (
    <aside className="hidden md:flex md:w-64 lg:w-72 shrink-0 flex-col border-r border-[#333333] bg-[#0B1220]/90 backdrop-blur-xl">
      {/* Brand — the platform mark, always GrowForge (distinct from the
       *  operator's own company identity, which lives in Profile and shows
       *  in the footer below). Also the way home, same as the header's
       *  console crumb. The glow ring reflects real telemetry state, not a
       *  decorative loop: dim/slow while idle, brighter/faster gold-blue
       *  while a pipeline is actually running. */}
      <div className="flex h-18 items-center border-b border-[#333333] px-3 py-3">
        <button
          type="button"
          onClick={() => router.push("/")}
          title="Back to the dashboard"
          className="flex w-full items-center gap-3 bg-[#111c34] shadow-sm border border-[#333333] rounded-xl px-3 py-2 text-left transition-colors hover:bg-[#18233c]"
        >
          <span className="relative flex h-9 w-9 shrink-0 items-center justify-center">
            <span
              className={`pointer-events-none absolute inset-0 rounded-full blur-md transition-all duration-700 ${
                isPipelineActive
                  ? "animate-[pulse_1.1s_ease-in-out_infinite] bg-gradient-to-br from-electric to-gold opacity-70"
                  : "animate-[pulse_3.2s_ease-in-out_infinite] bg-electric opacity-20"
              }`}
            />
            <Image src="/logo-mark.png" alt="GrowForge" fill className="relative object-contain drop-shadow-[0_0_6px_rgba(0,120,255,0.35)]" sizes="36px" priority />
          </span>
          <div className="leading-tight min-w-0">
            <p className="font-heading text-sm font-bold tracking-wide text-navy truncate">GrowForge Digital</p>
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted truncate">Digital AI OS</p>
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

        {/* 3D Spatial Canvas & CORE Pipeline */}
        <div className="mb-6 space-y-1.5">
          <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-widest text-muted">
            Spatial
          </p>
          <a
            href="/core"
            className="group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-medium bg-gradient-to-r from-emerald-500/15 via-teal-500/15 to-cyan-500/15 border border-emerald-500/30 text-white hover:border-emerald-400 shadow-sm transition-all"
          >
            <Zap className="h-4 w-4 shrink-0 text-emerald-400" />
            <span className="truncate">CORE</span>
          </a>
          <Link
            href="/"
            className="group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-medium bg-gradient-to-r from-cyan-500/15 via-pink-500/15 to-amber-500/15 border border-cyan-500/30 text-white hover:border-cyan-400 shadow-sm transition-all"
          >
            <Sparkles className="h-4 w-4 shrink-0 text-cyan-300" />
            <span className="truncate">Dashboard</span>
          </Link>
        </div>
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
        <div className="flex items-center gap-3 bg-[#111c34] shadow-sm border border-[#333333] rounded-xl px-3 py-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0B1220] border border-[#333333] font-mono text-xs font-semibold text-gold shadow-sm">
            {brandInitials}
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold text-navy">
              {companyName ? `${companyName} Ops` : "Operations"}
            </p>
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

