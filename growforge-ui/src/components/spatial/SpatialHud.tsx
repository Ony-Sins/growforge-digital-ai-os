"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Brain, BriefcaseBusiness, CircleUserRound, Database, Film, RotateCcw, Search, Settings2, Sparkles, X } from "lucide-react";
import type { GraphNode, GraphCategory } from "@/lib/spatial/obsidianReader";
import type { ZoomTierName } from "./spatialGeometry";
import { useAppState } from "@/lib/appState";
import { ApprovalBanner } from "@/components/workspace/ApprovalBanner";
import { CoreCommandCenter } from "./CoreCommandCenter";

import { useLiveAgents } from "@/lib/useLiveAgents";
import vaultDataRaw from "@/data/vaultCapabilities.json";

const CORE_DEPARTMENT_COUNT = 8;

interface SpatialHudProps {
  currentTier: ZoomTierName;
  visualMode?: "core" | "brain" | "missions";
  coreZoomProgress?: number;
  onSelectTier: (tier: ZoomTierName) => void;
  categories: GraphCategory[];
  activeCategories: Set<string>;
  onToggleCategory: (catId: string) => void;
  onSoloCategory: (catId: string) => void;
  allNodes: GraphNode[];
  onSelectNode: (node: GraphNode) => void;
  isCinema: boolean;
  onToggleCinema: () => void;
  isReplaying: boolean;
  replayTime: number;
  onToggleReplay: () => void;
  onResetReplay: () => void;
  telemetryData: {
    activeJobCount: number;
    totalJobCount: number;
    pendingApprovals?: number;
    recentJobs: { id: string; title: string; status: string; currentStep: string; percent: number }[];
    mcp: { totalConnected: number; servers: { id: string; name: string; toolCount: number }[]; connectors: Record<string, { connected: boolean; name: string }> };
    models: { totalConfigured: number; active: { id: string; name: string; isPrimary: boolean; latencyMs: number | null }[] };
    telemetry: { executionState: string };
  } | null;
  onOpenBusinessHub: () => void;
  isNoteOpen?: boolean;
  onEnterCore?: () => void;
  useGpuCore?: boolean;
  onListeningChange?: (listening: boolean) => void;
  onHoverNode?: (id: string | null) => void;
  onOpenNode?: (node: GraphNode) => void;
}

const NAV = [
  { id: "core", label: "CORE", icon: Sparkles },
  { id: "brain", label: "Brain", icon: Brain },
  { id: "missions", label: "Missions", icon: BriefcaseBusiness },
  { id: "systems", label: "Systems", icon: Settings2 },
] as const;

export function SpatialHud({
  currentTier, visualMode, coreZoomProgress = 0, onSelectTier, categories, activeCategories, onToggleCategory, onSoloCategory,
  allNodes, onSelectNode, isCinema, onToggleCinema, onResetReplay, telemetryData,
  isNoteOpen = false, useGpuCore = true, onListeningChange, onHoverNode, onOpenNode,
}: SpatialHudProps) {
  const { openSettings, openUserProfile, openVaultLibrary, openAgentRoster } = useAppState();
  const liveAgents = useLiveAgents();
  const blueprintCount = Array.isArray(vaultDataRaw) ? vaultDataRaw.length : 0;
  const [conversationView, setConversationView] = useState<"closed" | "compact" | "expanded">("closed");
  const [approvalsOpen, setApprovalsOpen] = useState(false);
  const hudRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const approvalsRef = useRef<HTMLButtonElement>(null);

  // Measure real chrome; visualViewport also covers keyboards that overlay the layout viewport.
  useEffect(() => {
    const hud = hudRef.current;
    if (!hud) return;
    const vv = window.visualViewport;
    const measure = () => {
      const height = vv?.height ?? window.innerHeight;
      const top = vv?.offsetTop ?? 0;
      hud.style.setProperty("--kb-offset", Math.max(0, window.innerHeight - height - top) + "px");
      hud.style.setProperty("--visible-height", height + "px");
      hud.style.setProperty("--workspace-top", Math.max(0, Math.max(headerRef.current?.getBoundingClientRect().bottom ?? 54, approvalsRef.current?.getBoundingClientRect().bottom ?? 0) - top) + 12 + "px");
      hud.style.setProperty("--mobile-nav-height", (navRef.current?.getBoundingClientRect().height ?? 65) + "px");
    };
    const observer = new ResizeObserver(measure);
    if (navRef.current) observer.observe(navRef.current);
    if (headerRef.current) observer.observe(headerRef.current);
    if (approvalsRef.current) observer.observe(approvalsRef.current);
    vv?.addEventListener("resize", measure);
    vv?.addEventListener("scroll", measure);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      observer.disconnect();
      vv?.removeEventListener("resize", measure);
      vv?.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, []);

  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const surface = visualMode ?? (currentTier === "core" ? "missions" : currentTier === "brain" || currentTier === "dashboard" ? "brain" : "core");

  // Knowledge search belongs to BRAIN: leaving BRAIN closes it and drops the query.
  const [prevSurface, setPrevSurface] = useState(surface);
  if (surface !== prevSurface) {
    setPrevSurface(surface);
    if (surface !== "brain") {
      setSearchOpen(false);
      setQuery("");
    }
  }

  const selectSurface = (id: (typeof NAV)[number]["id"]) => {
    if (id === "systems") return openSettings("connectors");
    onSelectTier(id === "missions" ? "core" : id === "brain" ? "brain" : "home");
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "/" && surface === "brain") {
        event.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchRef.current?.focus(), 20);
      }
      if (event.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [surface]);

  const results = useMemo(
    () => query.trim()
      ? allNodes.filter((node) => `${node.title} ${node.excerpt}`.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
      : [],
    [allNodes, query],
  );

  return (
    <div ref={hudRef} className={`spatial-hud pointer-events-none fixed inset-0 z-30 text-slate-100 ${isNoteOpen ? "opacity-40" : ""}`}>
      {/* FLOATING COMMAND SPINE */}
      <header ref={headerRef} className="spatial-header pointer-events-none absolute inset-x-0 top-3 sm:top-4 z-50 flex items-center justify-between px-3 sm:px-6 md:px-8">
        {/* STRUCTURAL DATA RAIL & SIGNAL PULSE CONDUIT */}
        <div className="pointer-events-none absolute inset-x-4 sm:inset-x-8 top-1/2 -z-10 -translate-y-1/2 flex items-center">
          {/* Main datum rail layer */}
          <div className="relative w-full h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent">
            {/* Secondary layered cyan beam */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-400/25 to-transparent" />

            {/* Micro segmented data track lines */}
            <div className="hidden sm:block absolute inset-x-16 inset-y-0 opacity-35 bg-[linear-gradient(90deg,rgba(34,211,238,0.5)_2px,transparent_2px)] bg-[length:14px_1px]" />

            {/* Glowing Anchor Nodes / Junction Diamonds along the rail */}
            <span className="node-breathe hidden md:block absolute left-[19%] -top-[2.5px] h-1.5 w-1.5 rotate-45 rounded-[0.5px] border border-cyan-400/60 bg-[#030712] shadow-[0_0_6px_rgba(34,211,238,0.7)]" />
            <span className="node-breathe hidden md:block absolute left-[33%] -top-[2.5px] h-1.5 w-1.5 rotate-45 rounded-[0.5px] border border-cyan-400/60 bg-[#030712] shadow-[0_0_6px_rgba(34,211,238,0.7)]" />
            <span className="node-breathe hidden md:block absolute right-[33%] -top-[2.5px] h-1.5 w-1.5 rotate-45 rounded-[0.5px] border border-cyan-400/60 bg-[#030712] shadow-[0_0_6px_rgba(34,211,238,0.7)]" />
            <span className="node-breathe hidden md:block absolute right-[19%] -top-[2.5px] h-1.5 w-1.5 rotate-45 rounded-[0.5px] border border-cyan-400/60 bg-[#030712] shadow-[0_0_6px_rgba(34,211,238,0.7)]" />

            {/* Animated Signal Pulse packet traveling between pods */}
            <div className="spine-pulse hidden sm:flex absolute -top-[4px] items-center">
              <span className="h-[1.5px] w-14 bg-gradient-to-r from-transparent via-cyan-400/50 to-cyan-300" />
              <span className="relative -ml-1 h-2.5 w-2.5 rounded-full bg-cyan-200 shadow-[0_0_8px_#22d3ee,0_0_16px_rgba(6,182,212,0.85)]">
                <span className="absolute inset-0 rounded-full bg-white opacity-70 animate-ping" />
              </span>
            </div>
          </div>
        </div>

        {/* LEFT INSTRUMENT: Brand Identity Anchor (Calibrated ~52-54px high, ~220px wide) */}
        <div className="pointer-events-auto relative flex items-center">
          {/* Connector socket on the right side of Brand Pod */}
          <span className="hidden md:flex pointer-events-none absolute -right-2 top-1/2 -translate-y-1/2 items-center z-20">
            <span className="h-3.5 w-1.5 rounded-r-[2px] border-r border-y border-cyan-400/40 bg-[#050b14] shadow-[0_0_6px_rgba(34,211,238,0.25)]" />
            <span className="h-1 w-1 -ml-0.5 rounded-full bg-cyan-400/80 shadow-[0_0_4px_#22d3ee]" />
          </span>

          <button
            type="button"
            onClick={() => selectSurface("core")}
            className="group relative flex h-[50px] sm:h-[54px] min-w-[190px] sm:min-w-[220px] items-center gap-3 rounded-2xl border border-white/12 ring-1 ring-cyan-500/15 bg-[#040813]/90 px-3.5 sm:px-4 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-1px_0_rgba(6,182,212,0.18),0_10px_28px_rgba(0,0,0,0.55)] backdrop-blur-2xl transition hover:border-cyan-400/50 hover:bg-[#071122]/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
            aria-label="GrowForge CORE home"
          >
            {/* Top highlight line */}
            <span className="pointer-events-none absolute inset-x-3 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-300/45 to-transparent" />
            {/* Bottom subtle underglow edge */}
            <span className="pointer-events-none absolute inset-x-4 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/25 to-transparent" />
            {/* Chamfered corner brackets */}
            <span className="pointer-events-none absolute top-1 left-1.5 h-2 w-2 border-t border-l border-cyan-400/45" />
            <span className="pointer-events-none absolute bottom-1 right-1.5 h-2 w-2 border-b border-r border-cyan-400/45" />

            <span className="grid h-8 w-8 sm:h-9 sm:w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-cyan-500 text-slate-950 shadow-[0_0_14px_rgba(6,182,212,0.45)] transition group-hover:shadow-[0_0_18px_rgba(6,182,212,0.65)]">
              <Sparkles className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
            </span>
            <div className="flex flex-col text-left">
              <span className="font-sora font-semibold text-sm sm:text-[15px] tracking-tight text-white leading-tight">
                GrowForge AI
              </span>
              <span className="font-mono text-[10px] sm:text-[11.5px] tracking-wide text-cyan-400/85 leading-tight mt-0.5">
                <span className="hidden sm:inline">Operating </span>Ecosystem
              </span>
            </div>
          </button>
        </div>

        {/* CENTER INSTRUMENT: Four-Environment Navigation Instrument (Calibrated ~52-54px high, ~450-480px wide) */}
        <div className="pointer-events-auto absolute left-1/2 -translate-x-1/2 hidden md:flex items-center">
          {/* Left connector socket */}
          <span className="pointer-events-none absolute -left-2 top-1/2 -translate-y-1/2 flex items-center z-20">
            <span className="h-1 w-1 rounded-full bg-cyan-400/80 shadow-[0_0_4px_#22d3ee]" />
            <span className="h-3.5 w-1.5 -ml-0.5 rounded-l-[2px] border-l border-y border-cyan-400/40 bg-[#050b14] shadow-[0_0_6px_rgba(34,211,238,0.25)]" />
          </span>

          {/* Right connector socket */}
          <span className="pointer-events-none absolute -right-2 top-1/2 -translate-y-1/2 flex items-center z-20">
            <span className="h-3.5 w-1.5 -mr-0.5 rounded-r-[2px] border-r border-y border-cyan-400/40 bg-[#050b14] shadow-[0_0_6px_rgba(34,211,238,0.25)]" />
            <span className="h-1 w-1 rounded-full bg-cyan-400/80 shadow-[0_0_4px_#22d3ee]" />
          </span>

          <nav
            className="relative flex h-[50px] sm:h-[54px] min-w-[430px] lg:min-w-[460px] items-center gap-1.5 rounded-2xl border border-white/14 ring-1 ring-cyan-500/20 bg-[#040813]/92 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.2),inset_0_-1px_0_rgba(6,182,212,0.22),0_16px_40px_rgba(0,0,0,0.65)] backdrop-blur-2xl"
            aria-label="Primary navigation"
          >
            {/* Top highlight edge */}
            <span className="pointer-events-none absolute inset-x-5 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-300/50 to-transparent" />
            {/* Bottom underglow edge */}
            <span className="pointer-events-none absolute inset-x-6 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/35 to-transparent" />
            {/* Corner brackets */}
            <span className="pointer-events-none absolute top-1 left-2 h-2 w-2 border-t border-l border-cyan-400/45" />
            <span className="pointer-events-none absolute top-1 right-2 h-2 w-2 border-t border-r border-cyan-400/45" />
            <span className="pointer-events-none absolute bottom-1 left-2 h-2 w-2 border-b border-l border-cyan-400/45" />
            <span className="pointer-events-none absolute bottom-1 right-2 h-2 w-2 border-b border-r border-cyan-400/45" />

            {/* Center Nav Underside Detail: Floating Ventral Keel & Support Brackets */}
            <div className="pointer-events-none absolute -bottom-1.5 left-1/2 -translate-x-1/2 flex items-center justify-center gap-1 z-20">
              <span className="h-1 w-1 rotate-45 border border-cyan-400/50 bg-[#050b14]" />
              <span className="h-[2px] w-24 rounded-full bg-gradient-to-r from-transparent via-cyan-400/80 to-transparent shadow-[0_2px_8px_rgba(34,211,238,0.6)]" />
              <span className="h-1 w-1 rotate-45 border border-cyan-400/50 bg-[#050b14]" />
            </div>
            {/* Downward diffused soft ambient glow */}
            <div className="pointer-events-none absolute -bottom-2.5 left-1/2 -translate-x-1/2 h-3.5 w-44 -z-10 rounded-full bg-cyan-400/20 blur-sm" />

            {NAV.map((item) => {
              const Icon = item.icon;
              const active = surface === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectSurface(item.id)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-xs sm:text-[13px] font-semibold transition-[background-color,border-color,box-shadow,filter,color] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 motion-reduce:transition-none ${
                    active
                      ? "bg-gradient-to-b from-cyan-200 via-cyan-300 to-cyan-400 text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_0_16px_rgba(34,211,238,0.5)] hover:brightness-110 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_0_24px_rgba(34,211,238,0.75)]"
                      : "text-slate-300 hover:bg-white/10 hover:text-white hover:shadow-[0_0_12px_rgba(34,211,238,0.18)]"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* RIGHT INSTRUMENT: Settings & Persistent Assistant Controls (Calibrated ~52-54px high, ~200-220px wide) */}
        <div className="pointer-events-auto relative flex items-center">
          {/* Connector socket on the left side of Right Pod */}
          <span className="hidden md:flex pointer-events-none absolute -left-2 top-1/2 -translate-y-1/2 items-center z-20">
            <span className="h-1 w-1 rounded-full bg-cyan-400/80 shadow-[0_0_4px_#22d3ee]" />
            <span className="h-3.5 w-1.5 -ml-0.5 rounded-l-[2px] border-l border-y border-cyan-400/40 bg-[#050b14] shadow-[0_0_6px_rgba(34,211,238,0.25)]" />
          </span>

          <div className="relative flex h-[50px] sm:h-[54px] min-w-[180px] sm:min-w-[205px] items-center gap-2 rounded-2xl border border-white/12 ring-1 ring-cyan-500/15 bg-[#040813]/90 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-1px_0_rgba(6,182,212,0.18),0_10px_28px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
            {/* Top highlight line */}
            <span className="pointer-events-none absolute inset-x-3 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-300/45 to-transparent" />
            {/* Bottom subtle underglow edge */}
            <span className="pointer-events-none absolute inset-x-4 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/25 to-transparent" />
            {/* Corner brackets */}
            <span className="pointer-events-none absolute top-1 right-1.5 h-2 w-2 border-t border-r border-cyan-400/45" />
            <span className="pointer-events-none absolute bottom-1 left-1.5 h-2 w-2 border-b border-l border-cyan-400/45" />

            <button
              type="button"
              onClick={() => openSettings()}
              aria-label="Settings"
              title="Settings"
              className="grid h-9 w-9 sm:h-10 sm:w-10 place-items-center rounded-xl text-slate-300 transition duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
            >
              <Settings2 className="h-4.5 w-4.5" />
            </button>

            {/* Inset panel divider */}
            <span className="h-5 w-[1px] bg-white/12 mx-0.5" />

            <button
              type="button"
              onClick={() => {
                if (surface !== "core") onSelectTier("home");
                setConversationView((prev) => (prev === "expanded" ? "closed" : "expanded"));
              }}
              aria-expanded={conversationView === "expanded"}
              aria-controls="core-conversation"
              aria-label="Toggle AI Assistant Conversation"
              title="Toggle Assistant Conversation Workspace"
              className={`flex items-center gap-2 rounded-xl border px-3 sm:px-3.5 py-2 text-xs sm:text-[13px] font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 ${
                conversationView !== "closed"
                  ? "border-cyan-400 bg-cyan-500/25 text-white shadow-[0_0_14px_rgba(34,211,238,0.35)]"
                  : "border-cyan-400/30 bg-cyan-500/10 text-cyan-200 hover:border-cyan-400/50 hover:bg-cyan-500/20 hover:text-white"
              }`}
            >
              <Bot className="h-4 w-4 text-cyan-300" />
              <span className="hidden sm:inline">Assistant</span>
            </button>
          </div>
        </div>
      </header>

      {/* CORE Command Center — preserved state, smooth opacity fade during zoom/dive */}
      <div
        className={`transition-all duration-500 ease-out ${
          surface === "core" && coreZoomProgress < 0.20
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
        aria-hidden={surface !== "core" || coreZoomProgress >= 0.20}
      >
        <CoreCommandCenter
          telemetryData={telemetryData}
          zoomProgress={coreZoomProgress}
          conversationView={conversationView}
          onConversationViewChange={setConversationView}
          onOpenMissions={() => onSelectTier("core")}
          onOpenSystems={() => openSettings("connectors")}
          onOpenApprovals={() => setApprovalsOpen((prev) => !prev)}
          useGpuCore={useGpuCore}
          onListeningChange={onListeningChange}
        />
      </div>

      {/* Brain Knowledge Architecture Sidebar — animated entrance upon arriving at Brain */}
      <aside
        className={`pointer-events-auto absolute bottom-24 left-3 top-24 flex w-[min(340px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-white/12 ring-1 ring-cyan-500/15 bg-[#040813]/92 shadow-[0_16px_40px_rgba(0,0,0,0.65)] backdrop-blur-2xl sm:left-5 transition-all duration-500 ease-out ${
          surface === "brain" && coreZoomProgress >= 0.93
            ? "opacity-100 translate-x-0 pointer-events-auto"
            : "opacity-0 -translate-x-4 pointer-events-none"
        }`}
        aria-hidden={surface !== "brain" || coreZoomProgress < 0.93}
      >
        <div className="border-b border-white/10 p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-300">Knowledge architecture</p>
          <h2 className="mt-1 text-xl font-semibold text-white">Brain</h2>
          <p className="mt-1 text-xs leading-5 text-slate-400">Memory, departments, specialists, and the connected knowledge graph.</p>
        </div>
        <div className="grid grid-cols-3 gap-2 border-b border-white/10 p-3">
          <button onClick={openAgentRoster} className="rounded-xl bg-white/5 p-2 text-left hover:bg-white/10 transition">
            <strong className="block text-cyan-300">{liveAgents.length}</strong>
            <span className="text-[10px] text-slate-400">Agent Templates</span>
          </button>
          <div className="rounded-xl bg-white/5 p-2">
            <strong className="block text-violet-300">{CORE_DEPARTMENT_COUNT}</strong>
            <span className="text-[10px] text-slate-400">Departments</span>
          </div>
          <button onClick={openVaultLibrary} className="rounded-xl bg-white/5 p-2 text-left hover:bg-white/10 transition">
            <strong className="block text-amber-300">{blueprintCount}</strong>
            <span className="text-[10px] text-slate-400">Blueprint Catalog</span>
          </button>
        </div>
        <div className="flex gap-2 p-3">
          <button onClick={() => openUserProfile("profile")} className="flex flex-1 items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs hover:bg-white/10 transition"><CircleUserRound className="h-4 w-4 text-cyan-300" />Memory</button>
          <button onClick={openVaultLibrary} className="flex flex-1 items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs hover:bg-white/10 transition"><Database className="h-4 w-4 text-cyan-300" />Library</button>
        </div>
        <div className="px-3 pb-2">
          <button onClick={() => setSearchOpen((value) => !value)} className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300 hover:border-cyan-400/40 hover:text-white transition"><Search className="h-4 w-4 text-cyan-400" />Search knowledge <kbd className="ml-auto text-slate-500 font-mono text-[10px] border border-white/10 rounded px-1.5 py-0.5">/</kbd></button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          {allNodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-6 text-center text-slate-400">
              <Brain className="h-8 w-8 text-cyan-400/40 mb-2" />
              <p className="text-xs font-medium text-slate-300">No Knowledge Nodes Connected</p>
              <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">
                Connect your Obsidian vault or knowledge sources to populate the spatial graph. The atmospheric particle field remains active.
              </p>
            </div>
          ) : (
            <>
              <p className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">Graph layers</p>
              <div className="flex flex-wrap gap-1.5">{categories.map((category) => (
                <button key={category.id} onClick={() => onToggleCategory(category.id)} onDoubleClick={() => onSoloCategory(category.id)} className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition ${activeCategories.has(category.id) ? "border-cyan-400/50 bg-cyan-400/15 text-cyan-200 shadow-[0_0_8px_rgba(34,211,238,0.2)]" : "border-white/10 text-slate-500 hover:text-slate-300"}`}>{category.label}</button>
              ))}</div>
              <p className="mb-2 mt-4 text-[10px] uppercase tracking-wider text-slate-500">Nodes in field <span className="text-slate-600">· hover to locate</span></p>
              <ul className="space-y-0.5" onMouseLeave={() => onHoverNode?.(null)}>
                {[...allNodes]
                  .filter((node) => activeCategories.has(node.source))
                  .sort((a, b) => b.degree - a.degree || a.categoryLabel.localeCompare(b.categoryLabel) || a.title.localeCompare(b.title))
                  .map((node) => {
                    const cat = categories.find((c) => c.id === node.source);
                    return (
                      <li key={node.id}>
                        <button
                          onMouseEnter={() => onHoverNode?.(node.id)}
                          onFocus={() => onHoverNode?.(node.id)}
                          onBlur={() => onHoverNode?.(null)}
                          onClick={() => (onOpenNode ?? onSelectNode)(node)}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[11px] text-slate-300 transition hover:bg-cyan-400/10 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/50"
                        >
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: cat?.color ?? "#38bdf8", boxShadow: `0 0 4px ${cat?.color ?? "#38bdf8"}` }} />
                          <span className="min-w-0 flex-1 truncate">{node.title}</span>
                          {node.degree > 0 && <span className="shrink-0 font-mono text-[9px] text-cyan-300/70">{node.degree}</span>}
                        </button>
                      </li>
                    );
                  })}
              </ul>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 border-t border-white/10 p-3">
          <button onClick={onToggleCinema} className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-medium transition ${isCinema ? "bg-cyan-400 text-slate-950 font-semibold shadow-[0_0_10px_rgba(34,211,238,0.4)]" : "bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"}`}><Film className="h-3.5 w-3.5" />Explore</button>
          <button onClick={onResetReplay} className="rounded-lg bg-white/5 p-1.5 text-slate-400 hover:text-white hover:bg-white/10 transition" aria-label="Reset view"><RotateCcw className="h-3.5 w-3.5" /></button>
        </div>
      </aside>

      {searchOpen && surface === "brain" && (
        <div className="pointer-events-auto absolute left-1/2 top-24 w-[min(560px,92vw)] -translate-x-1/2 overflow-hidden rounded-2xl border border-cyan-400/30 bg-[#07101f]/95 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center gap-2 border-b border-white/10 p-3"><Search className="h-4 w-4 text-cyan-300" /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notes and knowledge…" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-500 text-white" /><button onClick={() => setSearchOpen(false)} className="text-slate-400 hover:text-white transition"><X className="h-4 w-4" /></button></div>
          <div className="max-h-80 overflow-y-auto p-2">{results.map((node) => <button key={node.id} onClick={() => { onSelectNode(node); setSearchOpen(false); }} className="block w-full rounded-xl p-3 text-left hover:bg-white/5 transition"><span className="block text-sm font-medium text-white">{node.title}</span><span className="mt-1 line-clamp-2 text-xs text-slate-400">{node.excerpt}</span></button>)}{query && results.length === 0 && <p className="p-6 text-center text-sm text-slate-500">No matching knowledge found.</p>}</div>
        </div>
      )}

      <ApprovalBanner isOpen={approvalsOpen} onClose={() => setApprovalsOpen(false)} />
      <button ref={approvalsRef} type="button" onClick={() => setApprovalsOpen((prev) => !prev)} aria-label="Open approvals"
        className="mobile-approvals pointer-events-auto absolute right-3 rounded-lg border border-amber-400/25 bg-[#07101f]/90 px-3 py-2 text-xs text-amber-200 lg:hidden">
        Approvals{telemetryData?.pendingApprovals !== undefined ? " · " + telemetryData.pendingApprovals : ""}
      </button>
      <nav
        ref={navRef}
        className="spatial-mobile-nav pointer-events-auto absolute inset-x-3 bottom-3 z-40 grid grid-cols-4 gap-1 rounded-2xl border border-white/10 bg-[#07101f]/95 p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.8),0_0_20px_rgba(0,0,0,0.6)] backdrop-blur-xl md:hidden"
        aria-label="Primary navigation"
      >
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = surface === item.id;
          return (
            <button
              key={item.id}
              onClick={() => selectSurface(item.id)}
              className={`flex min-w-0 flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-semibold transition ${
                active ? "bg-cyan-400 text-slate-950 shadow-[0_0_12px_rgba(34,211,238,0.5)]" : "text-slate-400 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
