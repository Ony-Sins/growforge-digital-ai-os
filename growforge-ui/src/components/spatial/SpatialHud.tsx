"use client";

import Image from "next/image";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Search, Settings2, X, Network, ShieldCheck, Box, Link2, Grid3X3, UserRound, ChevronRight, Scan, PanelLeftClose, PanelLeftOpen, MessageCircle, Maximize2, Minimize2 } from "lucide-react";
import type { GraphNode, GraphCategory } from "@/lib/spatial/obsidianReader";
import type { ZoomTierName } from "./spatialGeometry";
import { useAppState } from "@/lib/appState";
import { ApprovalBanner } from "@/components/workspace/ApprovalBanner";
import { CoreCommandCenter } from "./CoreCommandCenter";

import { SYSTEM_INDEX, systemIndexRecords, type SystemIndexCategory } from "@/lib/spatial/systemIndex";
import { departmentMatchesQuery } from "@/lib/departmentTaxonomy";
import { useShellVisibility } from "@/lib/useShellVisibility";


interface SpatialHudProps {
  currentTier: ZoomTierName;
  visualMode?: "core" | "brain" | "missions";
  coreZoomProgress?: number;
  onSelectTier: (tier: ZoomTierName) => void;
  /** In the DIVE IN space (highlights the Dive In button, hides the Explore panel). */
  diveActive?: boolean;
  onDiveIn?: () => void;
  categories: GraphCategory[];
  activeCategories: Set<string>;
  onToggleCategory: (catId: string) => void;
  onSoloCategory: (catId: string) => void;
  allNodes: GraphNode[];
  selectedNode?: GraphNode | null;
  onSelectNode: (node: GraphNode) => void;
  onFocusNode?: (node: GraphNode) => void;
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
  onHoverNodes?: (ids: string[]) => void;
  onFitGraph?: () => void;
}

const NAV = [
  { id: "core", label: "CORE" },
  { id: "brain", label: "Explore" },
  { id: "dive", label: "Dive In" },
  { id: "systems", label: "Systems" },
] as const;

export function SpatialHud({
  currentTier, visualMode, coreZoomProgress = 0, onSelectTier,
  allNodes, selectedNode, onSelectNode, onFocusNode, telemetryData,
  useGpuCore = true, onListeningChange, onHoverNode, onOpenNode, onHoverNodes, onFitGraph, diveActive = false, onDiveIn,
}: SpatialHudProps) {
  const { openSettings, closeSettings, isSettingsOpen } = useAppState();
  const { state: visibility, panels, setPanel, toggleFocus } = useShellVisibility();
  const [viewOpen, setViewOpen] = useState(false);
  const viewRef = useRef<HTMLDivElement>(null);
  const viewTriggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!viewOpen) return;
    viewRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const dismiss = (event: PointerEvent) => { if (!viewRef.current?.contains(event.target as Node) && !viewTriggerRef.current?.contains(event.target as Node)) setViewOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); setViewOpen(false); viewTriggerRef.current?.focus(); } };
    window.addEventListener('pointerdown', dismiss);
    window.addEventListener('keydown', escape, true);
    return () => { window.removeEventListener('pointerdown', dismiss); window.removeEventListener('keydown', escape, true); };
  }, [viewOpen]);
  const [directoryExpanded, setDirectoryExpanded] = useState(false);
  const [indexCategory, setIndexCategory] = useState<SystemIndexCategory>("departments");
  const [conversationView, setConversationView] = useState<"closed" | "compact" | "expanded">("closed");
  const [approvalsOpen, setApprovalsOpen] = useState(false);
  const [approvalMissionId, setApprovalMissionId] = useState<string | null>(null);
  useEffect(() => {
    const open = (event: Event) => { setApprovalMissionId((event as CustomEvent<string>).detail); setApprovalsOpen(true); };
    window.addEventListener("growforge:mission-approvals", open);
    return () => window.removeEventListener("growforge:mission-approvals", open);
  }, []);
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
  const baseSurface = visualMode ?? (currentTier === "core" ? "missions" : currentTier === "brain" || currentTier === "dashboard" ? "brain" : "core");
  const surface: typeof baseSurface | "dive" = diveActive ? "dive" : baseSurface;
  const noraSurface = isSettingsOpen ? "Systems" : surface === "brain" ? "Explore" : surface === "dive" ? "Dive In" : "CORE";
  const noraVisible = panels.nora && conversationView !== "closed";
  const indexVisible = panels.index && !isSettingsOpen && surface === 'brain' && coreZoomProgress >= .93;
  useEffect(() => {
    if (!noraVisible || viewOpen) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (document.querySelector(".nora-menu")) return;
      event.preventDefault(); event.stopImmediatePropagation();
      setConversationView("closed");
    };
    window.addEventListener("keydown", dismiss, true);
    return () => window.removeEventListener("keydown", dismiss, true);
  }, [noraVisible, viewOpen]);

  // Close the search overlay on departure, but preserve the index query for return.
  const [prevSurface, setPrevSurface] = useState(surface);
  if (surface !== prevSurface) {
    setPrevSurface(surface);
    if (surface !== "brain") {
      setSearchOpen(false);
    }
  }

  const selectSurface = (id: (typeof NAV)[number]["id"]) => {
    if (id === "systems") return openSettings("connectors");
    closeSettings();
    if (id === "dive") return onDiveIn?.();
    onSelectTier(id === "brain" ? "brain" : "home");
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "/" && surface === "brain" && !(event.target instanceof HTMLElement && (event.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)))) {
        event.preventDefault();
        setPanel('index', true);
        setSearchOpen(true);
        setTimeout(() => searchRef.current?.focus(), 20);
      }
      if (event.key === "Escape") { setSearchOpen(false); setQuery(""); searchRef.current?.blur(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [surface, setPanel]);

  const indexedGroups = useMemo(() => SYSTEM_INDEX.map((category) => ({
    ...category, records: systemIndexRecords(allNodes, category.id),
  })), [allNodes]);
  const directoryNodes = indexedGroups.find((category) => category.id === indexCategory)!.records;
  const indexLabel = SYSTEM_INDEX.find((category) => category.id === indexCategory)!.label;
  const visibleDirectory = directoryExpanded || indexCategory === "departments" || indexCategory === "oversight"
    ? directoryNodes : directoryNodes.slice(0, 6);

  const results = useMemo(
    () => query.trim()
      ? allNodes.filter((node) => (`${node.title} ${node.excerpt}`.toLowerCase().includes(query.toLowerCase()) || departmentMatchesQuery(node.departmentId, query))).slice(0, 8)
      : [],
    [allNodes, query],
  );

  return (
    <div ref={hudRef} data-shell-focus={visibility.focus} data-index-hidden={!panels.index} className={`spatial-hud pointer-events-none fixed inset-0 ${isSettingsOpen ? "z-[60]" : noraVisible ? "z-40" : "z-30"} text-slate-100`}>
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
            <div style={diveActive ? { display: "none" } : undefined} className="spine-pulse hidden sm:flex absolute -top-[4px] items-center">
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
            className="surface-glass group relative flex h-[50px] sm:h-[54px] min-w-[190px] sm:min-w-[220px] items-center gap-3 rounded-2xl border border-white/12 ring-1 ring-cyan-500/15 bg-[#040813]/90 px-3.5 sm:px-4 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-1px_0_rgba(6,182,212,0.18),0_10px_28px_rgba(0,0,0,0.55)] transition hover:border-cyan-400/50 hover:bg-[#071122]/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
            aria-label="GrowForge CORE home"
          >
            {/* Top highlight line */}
            <span className="pointer-events-none absolute inset-x-3 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-300/45 to-transparent" />
            {/* Bottom subtle underglow edge */}
            <span className="pointer-events-none absolute inset-x-4 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/25 to-transparent" />
            {/* Chamfered corner brackets */}
            <span className="pointer-events-none absolute top-1 left-1.5 h-2 w-2 border-t border-l border-cyan-400/45" />
            <span className="pointer-events-none absolute bottom-1 right-1.5 h-2 w-2 border-b border-r border-cyan-400/45" />

            <span className="relative h-8 w-9 sm:h-9 sm:w-10 shrink-0">
              <Image src="/brand/growforge-mark.png" alt="" fill sizes="40px" priority className="object-contain drop-shadow-[0_1px_3px_rgba(30,130,230,0.22)]" />
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
        <div className="pointer-events-auto absolute left-1/2 -translate-x-1/2 hidden min-[901px]:flex items-center">
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
            className="surface-glass relative flex h-[50px] sm:h-[54px] min-w-[430px] lg:min-w-[460px] items-center gap-1.5 rounded-2xl border border-white/14 ring-1 ring-cyan-500/20 bg-[#040813]/92 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.2),inset_0_-1px_0_rgba(6,182,212,0.22),0_16px_40px_rgba(0,0,0,0.65)]"
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
              
              const active = isSettingsOpen ? item.id === "systems" : surface === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectSurface(item.id)}
                  className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-xs sm:text-[13px] font-semibold transition-[background-color,border-color,box-shadow,filter,color] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 motion-reduce:transition-none ${
                    active
                      ? "bg-gradient-to-b from-cyan-200 via-cyan-300 to-cyan-400 text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_0_16px_rgba(34,211,238,0.5)] hover:brightness-110 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_0_24px_rgba(34,211,238,0.75)]"
                      : "text-slate-300 hover:bg-white/10 hover:text-white hover:shadow-[0_0_12px_rgba(34,211,238,0.18)]"
                  }`}
                >
                  
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="pointer-events-auto">
          <button data-shell-visibility-control ref={viewTriggerRef} type="button" aria-label="Settings" title="View and settings" aria-expanded={viewOpen} aria-controls="shell-view-controls" onClick={()=>setViewOpen(value=>!value)} className="surface-glass grid h-10 w-10 place-items-center rounded-xl border border-cyan-400/20 bg-[#040813]/80 text-slate-300"><Settings2 size={18}/></button>
          {viewOpen && <div data-shell-visibility-control ref={viewRef} id="shell-view-controls" role="region" aria-label="View and settings" data-dive-inspector className="shell-view-controls surface-glass">
            <div className="shell-view-title"><span>View</span><button type="button" aria-label="Close view controls" onClick={()=>{setViewOpen(false);viewTriggerRef.current?.focus();}}><X size={14}/></button></div>
            <button type="button" aria-pressed={panels.nora} onClick={()=>setPanel('nora',!panels.nora)}><MessageCircle size={14}/><span>NORA Dock</span><small>{panels.nora?'Shown':'Hidden'}</small></button>
            {surface==='brain' && <button type="button" aria-pressed={panels.index} onClick={()=>setPanel('index',!panels.index)}><PanelLeftOpen size={14}/><span>System Index</span><small>{panels.index?'Shown':'Hidden'}</small></button>}
            <button type="button" aria-pressed={visibility.focus} onClick={toggleFocus}><Maximize2 size={14}/><span>Focus view</span><small>{visibility.focus?'On':'Off'}</small></button>
            <button type="button" className="shell-system-settings" onClick={()=>{setViewOpen(false);openSettings();}}><Settings2 size={14}/><span>System settings</span><ChevronRight size={12}/></button>
          </div>}
        </div>      </header>

      {/* One persistent bottom composer; transcript opens in place above it. */}
      <div data-dive-inspector className="pointer-events-none">        <CoreCommandCenter
          dockHidden={!panels.nora}
          onHideDock={()=>{setPanel('nora',false);requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('[data-nora-restore]')?.focus());}}
          telemetryData={telemetryData}
          zoomProgress={coreZoomProgress}
          conversationView={conversationView}
          onConversationViewChange={setConversationView}
          onOpenMissions={() => onSelectTier("core")}
          onOpenSystems={() => openSettings("connectors")}
          onOpenApprovals={() => setApprovalsOpen((prev) => !prev)}
          conversationOnly={surface !== "core" || isSettingsOpen}
          contextSurface={noraSurface}
          selectedRecord={noraSurface === "Explore" ? selectedNode : null}
          useGpuCore={useGpuCore}
          onListeningChange={onListeningChange}
        />
      </div>

      {/* Brain Knowledge Architecture Sidebar — animated entrance upon arriving at Brain */}
      <aside
        className={`atlas-panel surface-glass pointer-events-auto absolute bottom-60 md:bottom-24 left-3 top-24 flex w-[min(340px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-white/12 ring-1 ring-cyan-500/15 bg-[#040813]/92 shadow-[0_16px_40px_rgba(0,0,0,0.65)] sm:left-5 transition-all duration-500 ease-out ${
          indexVisible
            ? "opacity-100 translate-x-0 pointer-events-auto"
            : "opacity-0 -translate-x-4 pointer-events-none"
        }`}
        aria-label="Explore System Index"
        data-collapsed={!panels.index}
        aria-hidden={!indexVisible}
        inert={!indexVisible ? true : undefined}
      >
        <div className="shrink-0 border-b border-white/10 px-4 pb-4 pt-5">
          <div className="atlas-search flex items-center gap-2 rounded-lg border px-3 transition-colors">
            <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-cyan-300/80" />
            <input ref={searchRef} value={query} onFocus={() => setSearchOpen(true)} onChange={(event) => { setQuery(event.target.value); setSearchOpen(true); }} aria-label="Find a department, tool, or topic" placeholder="Find anything in the system…" className="h-11 min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-slate-400" />
            {query && <button type="button" aria-label="Clear search" onClick={() => { setQuery(""); searchRef.current?.focus(); }} className="flex h-8 w-8 shrink-0 items-center justify-center text-slate-400 hover:text-white"><X className="h-3.5 w-3.5" /></button>}
            <button type="button" data-shell-visibility-control className="shell-index-collapse" aria-label="Hide System Index" title="Hide System Index" onClick={()=>{setPanel('index',false);onHoverNodes?.([]);onHoverNode?.(null);requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('[data-index-restore]')?.focus());}}><PanelLeftClose size={14}/></button>
          </div>
        </div>
        <div className="atlas-index shrink-0 px-4 pt-4 pb-3">
          <p className="atlas-section-label mb-2">System index</p>
          <div aria-label="System index categories">{indexedGroups.map((category) => {
            const Icon = { departments: Network, oversight: ShieldCheck, models: Box, connectors: Link2, capabilities: Grid3X3, specialists: UserRound }[category.id];
            return <button key={category.id} aria-pressed={indexCategory === category.id} onMouseEnter={() => onHoverNodes?.(category.records.map((node) => node.id))} onMouseLeave={() => onHoverNodes?.([])} onFocus={() => onHoverNodes?.(category.records.map((node) => node.id))} onBlur={() => onHoverNodes?.([])} onClick={() => { setIndexCategory(category.id); setDirectoryExpanded(false); setSearchOpen(false); setQuery(""); }} className="atlas-category">
              <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span className="flex-1">{category.label}</span>
              <span title={`${category.records.length} indexed records`} className="atlas-count">{category.records.length}</span>
              <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
            </button>;
          })}</div>
        </div>
        <div className="atlas-records min-h-0 flex-1 overflow-y-auto px-4 pb-3">
          {searchOpen && query.trim() ? (
            <div aria-label="Search results">
              <p className="atlas-section-label mb-2">Search results</p>
              {results.map((node) => <button key={node.id} onClick={() => { (onFocusNode ?? onOpenNode ?? onSelectNode)(node); setSearchOpen(false); }} className="atlas-record block w-full px-2 py-3 text-left"><span className="block text-xs font-medium">{node.title}</span><span className="mt-1 block text-[11px] text-slate-400">{node.categoryLabel}</span></button>)}
              {results.length === 0 && <p className="py-4 text-xs leading-5 text-slate-400">No matching records. Try another name or topic.</p>}
            </div>
          ) : (
            <>
              <div className="mb-2 border-t border-white/10 pt-4">
                <p className="text-[10px] uppercase tracking-[0.14em] text-slate-300">{indexLabel}</p>
                
              </div>
              <ul className="space-y-0.5" onMouseLeave={() => onHoverNode?.(null)}>
                {visibleDirectory.map((node) => (
                  <li key={node.id}>
                    <button onMouseEnter={() => onHoverNode?.(node.id)} onMouseLeave={() => onHoverNode?.(null)} onFocus={() => onHoverNode?.(node.id)} onBlur={() => onHoverNode?.(null)} onClick={() => (onFocusNode ?? onOpenNode ?? onSelectNode)(node)} aria-current={selectedNode?.id === node.id ? "true" : undefined} title={`${node.title} · ${node.degree} recorded relationships`} className="atlas-record flex min-h-8 w-full items-center gap-3 px-2 text-left text-xs">
                      <span aria-hidden="true" className="atlas-record-marker" />
                      <span className="min-w-0 flex-1 truncate">{node.title}</span>
                      <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
              {directoryNodes.length === 0 && <p className="py-3 text-xs text-slate-400">No {indexLabel.toLowerCase()} records indexed yet.</p>}
              {directoryNodes.length > visibleDirectory.length || (directoryExpanded && directoryNodes.length > 6 && indexCategory !== "departments" && indexCategory !== "oversight") ? <button aria-expanded={directoryExpanded} onClick={() => setDirectoryExpanded((value) => !value)} className="mt-2 min-h-10 px-2 text-xs text-slate-400 transition-colors hover:text-cyan-200">{directoryExpanded ? "Show fewer" : `Show all ${directoryNodes.length}`}</button> : null}
            </>
          )}
        </div>
        <div className="atlas-footer flex shrink-0 items-center justify-between gap-2 border-t border-white/10 px-4 py-3">
          <span className="min-w-0 text-[9px] text-slate-400">{searchOpen && query.trim() ? `${results.length} search results` : `${visibleDirectory.length} of ${directoryNodes.length} indexed records`}</span>
          <div className="flex gap-1">
            <button onClick={onFitGraph} className="atlas-tool" title="Fit graph overview"><Scan className="h-3.5 w-3.5" />Fit</button>
            <button onClick={() => { setQuery(""); setSearchOpen(false); setDirectoryExpanded(false); setIndexCategory("departments"); onHoverNodes?.([]); onFitGraph?.(); }} className="atlas-tool" title="Reset index and graph overview"><RotateCcw className="h-3.5 w-3.5" />Reset</button>
          </div>
        </div>
      </aside>
      {surface==='brain' && !isSettingsOpen && !panels.index && <button data-shell-visibility-control data-index-restore type="button" className="shell-index-restore surface-glass" aria-label="Restore System Index" title="Restore System Index" onClick={()=>{setPanel('index',true);requestAnimationFrame(()=>searchRef.current?.focus());}}><PanelLeftOpen size={15}/></button>}
      {(!panels.nora || visibility.focus) && <div data-shell-visibility-control className="shell-bottom-restore" data-dive-inspector>
        {!panels.nora && <button data-nora-restore type="button" className="surface-glass" aria-label="Restore NORA Dock" title="Restore NORA Dock" onClick={()=>{setPanel('nora',true);requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('.shell-dock-collapse')?.focus());}}><MessageCircle size={15}/></button>}
        {visibility.focus && <button type="button" className="surface-glass" aria-label="Exit Focus view" title="Exit Focus view" onClick={toggleFocus}><Minimize2 size={14}/></button>}
      </div>}

      <ApprovalBanner isOpen={approvalsOpen} missionId={diveActive ? approvalMissionId : null} onSelectMission={diveActive ? () => setApprovalsOpen(false) : undefined} onClose={() => { setApprovalsOpen(false); setApprovalMissionId(null); }} />
      <button ref={approvalsRef} type="button" onClick={() => setApprovalsOpen((prev) => !prev)} aria-label="Open approvals"
        style={diveActive && !telemetryData?.pendingApprovals ? { display: "none" } : undefined}
        className="mobile-approvals pointer-events-auto absolute right-3 rounded-lg border border-amber-400/25 bg-[#07101f]/90 px-3 py-2 text-xs text-amber-200 lg:hidden">
        Approvals{telemetryData?.pendingApprovals !== undefined ? " · " + telemetryData.pendingApprovals : ""}
      </button>
      <nav
        ref={navRef}
            className="surface-glass spatial-mobile-nav pointer-events-auto absolute inset-x-3 bottom-3 z-40 grid grid-cols-4 gap-1 rounded-2xl border border-white/10 bg-[#07101f]/95 p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.8),0_0_20px_rgba(0,0,0,0.6)] min-[901px]:hidden"
        aria-label="Primary navigation"
      >
        {NAV.map((item) => {
          
          const active = isSettingsOpen ? item.id === "systems" : surface === item.id;
          return (
            <button
              key={item.id}
              onClick={() => selectSurface(item.id)}
              className={`flex min-h-12 min-w-0 items-center justify-center rounded-xl py-2 text-[10px] font-semibold transition ${
                active ? "bg-cyan-400 text-slate-950 shadow-[0_0_12px_rgba(34,211,238,0.5)]" : "text-slate-400 hover:text-white"
              }`}
            >
              
              {item.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
