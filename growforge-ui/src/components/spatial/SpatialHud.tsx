"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Search,
  Zap,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  Layers,
  Activity,
  ChevronDown,
  LayoutDashboard,
  Brain,
  Home,
  CheckCircle2,
  ExternalLink,
  MessageSquare,
  Send,
  Bot,
  Radio,
} from "lucide-react";
import type { GraphNode, GraphCategory } from "@/lib/spatial/obsidianReader";
import type { ZoomTierName } from "./spatialGeometry";

interface SpatialHudProps {
  currentTier: ZoomTierName;
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
    recentJobs: { id: string; title: string; status: string; currentStep: string; percent: number }[];
    mcp: {
      totalConnected: number;
      servers: { id: string; name: string; toolCount: number }[];
      connectors: {
        slack: { connected: boolean; name: string };
        notion: { connected: boolean; name: string };
        hubspot: { connected: boolean; name: string };
      };
    };
    models: { totalConfigured: number; active: { id: string; name: string; isPrimary: boolean; latencyMs: number | null }[] };
    telemetry: { executionState: string };
  } | null;
  onOpenBusinessHub: () => void;
  isNoteOpen?: boolean;
  isChatOpen?: boolean;
  onOpenChat: (prompt?: string) => void;
  /** Dive the camera through the core and arrive on the CORE page. */
  onEnterCore?: () => void;
}

export function SpatialHud({
  currentTier,
  onSelectTier,
  categories,
  activeCategories,
  onToggleCategory,
  onSoloCategory,
  allNodes,
  onSelectNode,
  isCinema,
  onToggleCinema,
  isReplaying,
  replayTime,
  onToggleReplay,
  onResetReplay,
  telemetryData,
  onOpenBusinessHub,
  isNoteOpen = false,
  isChatOpen = false,
  onOpenChat,
  onEnterCore,
}: SpatialHudProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNavDropdownOpen, setIsNavDropdownOpen] = useState(false);
  const [homePrompt, setHomePrompt] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Global keyboard shortcut '/' for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        setIsSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      } else if (e.key === "Escape") {
        setIsSearchOpen(false);
        setIsNavDropdownOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const searchResults = searchQuery.trim()
    ? allNodes
        .filter(
          (n) =>
            n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            n.excerpt.toLowerCase().includes(searchQuery.toLowerCase())
        )
        .slice(0, 8)
    : [];

  const primaryModel = telemetryData?.models.active.find((m) => m.isPrimary) || telemetryData?.models.active[0];

  const handleHomePromptSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!homePrompt.trim()) return;
    onOpenChat(homePrompt.trim());
    setHomePrompt("");
  };

  return (
    <div className="absolute inset-0 pointer-events-none z-30 flex flex-col justify-between p-4 md:p-6 select-none overflow-hidden font-sans">
      {/* 0. SOFT OVERHEAD AMBIENT LIGHT BAR */}
      <div className="fixed top-0 inset-x-0 h-1 pointer-events-none z-50 flex justify-center">
        <div className="w-full max-w-4xl h-full bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-90 shadow-[0_0_24px_rgba(56,189,248,0.9)] animate-pulse" />
      </div>

      {/* 1. TOP BAR */}
      <div className="flex items-center justify-between gap-4 w-full">
        {/* Left: 3D Hover-Glow Dropdown Nav */}
        <div className="relative pointer-events-auto">
          <button
            onClick={() => setIsNavDropdownOpen(!isNavDropdownOpen)}
            className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-[#0B1220]/80 hover:bg-[#0B1220]/95 border border-white/10 hover:border-cyan-400/40 backdrop-blur-xl shadow-lg transition-all group"
          >
            <div className="w-5 h-5 rounded-lg bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300 group-hover:scale-105 transition-transform">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <span className="font-heading font-bold text-xs tracking-wide text-white">GrowForge Canvas</span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                isNavDropdownOpen ? "rotate-180 text-white" : ""
              }`}
            />
          </button>

          {/* 3D Dropdown Navigation Menu */}
          {isNavDropdownOpen && (
            <div className="absolute top-full left-0 mt-2 w-64 rounded-2xl bg-[#0B1220]/95 border border-white/10 shadow-2xl backdrop-blur-2xl p-2 space-y-1 animate-in fade-in slide-in-from-top-2 duration-150 z-50">
              <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-400 border-b border-white/5">
                Spatial Operations
              </div>
              <button
                onClick={() => {
                  onSelectTier("home");
                  setIsNavDropdownOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-left transition-all ${
                  currentTier === "home"
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                    : "text-slate-300 hover:bg-white/5"
                }`}
              >
                <Home className="w-4 h-4 text-cyan-400" />
                <span>Home Assistant Core</span>
              </button>
              <button
                onClick={() => {
                  onSelectTier("brain");
                  setIsNavDropdownOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-left transition-all ${
                  currentTier === "brain"
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                    : "text-slate-300 hover:bg-white/5"
                }`}
              >
                <Brain className="w-4 h-4 text-pink-400" />
                <span>AI Brain Knowledge Graph</span>
              </button>
              <button
                onClick={() => {
                  onSelectTier("dashboard");
                  setIsNavDropdownOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-left transition-all ${
                  currentTier === "dashboard"
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                    : "text-slate-300 hover:bg-white/5"
                }`}
              >
                <LayoutDashboard className="w-4 h-4 text-emerald-400" />
                <span>Operational Dashboard</span>
              </button>
              <div className="pt-1 border-t border-white/5">
                <button
                  onClick={() => {
                    onOpenChat();
                    setIsNavDropdownOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-cyan-300 hover:bg-cyan-500/10 transition-all"
                >
                  <span className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-cyan-400" />
                    AI Assistant Chat
                  </span>
                  <span className="px-1.5 py-0.5 text-[9px] font-mono rounded bg-cyan-500/20 text-cyan-300">Live</span>
                </button>
                <button
                  onClick={() => {
                    onOpenBusinessHub();
                    setIsNavDropdownOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-slate-300 hover:bg-white/5 transition-all"
                >
                  <span className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    Business Comms Triage
                  </span>
                  <span className="px-1.5 py-0.5 text-[9px] font-mono rounded bg-amber-500/20 text-amber-300">MCP</span>
                </button>
                <Link
                  href="/core"
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-emerald-300 hover:bg-emerald-500/10 transition-all"
                >
                  <span className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-emerald-400" />
                    CORE
                  </span>
                </Link>
                <Link
                  href="/workspace"
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-slate-400 hover:text-white hover:bg-white/5 transition-all"
                >
                  <span>Workspace (projects, vault, settings)</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Center: Search Bar */}
        {!isCinema && (
          <div className="relative pointer-events-auto max-w-md w-full mx-auto">
            <div className="relative flex items-center">
              <Search className="absolute left-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsSearchOpen(true);
                }}
                onFocus={() => setIsSearchOpen(true)}
                placeholder="Search notes, agents, pipelines, skills... [ / ]"
                className="w-full pl-10 pr-9 py-2 rounded-xl bg-[#0B1220]/75 hover:bg-[#0B1220]/90 focus:bg-[#0B1220]/95 border border-white/10 focus:border-cyan-400/50 backdrop-blur-xl text-xs text-white placeholder-slate-400 focus:outline-none shadow-lg transition-all"
              />
              <span className="absolute right-3 px-1.5 py-0.5 text-[10px] font-mono rounded bg-white/10 text-slate-400 pointer-events-none">
                /
              </span>
            </div>

            {/* Search Results Dropdown */}
            {isSearchOpen && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 rounded-2xl bg-[#0B1220]/95 border border-white/10 shadow-2xl backdrop-blur-2xl p-2 space-y-1 z-50 animate-in fade-in duration-150">
                <div className="px-3 py-1 text-[10px] font-mono uppercase text-slate-400">
                  Matching Graph Nodes ({searchResults.length})
                </div>
                {searchResults.map((result) => (
                  <button
                    key={result.id}
                    onClick={() => {
                      onSelectNode(result);
                      setIsSearchOpen(false);
                      setSearchQuery("");
                    }}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-white/5 text-left transition-all group"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="text-xs font-medium text-white group-hover:text-cyan-300 truncate">
                        {result.title}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">{result.excerpt}</p>
                    </div>
                    <span
                      className="px-2 py-0.5 text-[10px] font-mono uppercase rounded shrink-0 border"
                      style={{
                        backgroundColor: `${result.color}15`,
                        borderColor: `${result.color}30`,
                        color: result.color,
                      }}
                    >
                      {result.categoryLabel}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Right: Quick Status Pill & Assistant Trigger */}
        {!isCinema && (
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              onClick={() => onOpenChat()}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/40 text-cyan-300 backdrop-blur-xl text-xs font-semibold shadow-[0_0_15px_rgba(6,182,212,0.2)] transition-all group"
              title="Open AI Assistant Chat"
            >
              <Bot className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
              <span className="hidden sm:inline">AI Assistant</span>
            </button>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#0B1220]/80 border border-white/10 backdrop-blur-xl text-xs text-slate-300">
              <span className="relative flex h-2 w-2">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full ${
                    telemetryData?.telemetry.executionState === "processing" ? "bg-amber-400 opacity-75" : "bg-emerald-400 opacity-75"
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    telemetryData?.telemetry.executionState === "processing" ? "bg-amber-400" : "bg-emerald-400"
                  }`}
                />
              </span>
              <span className="font-mono text-[11px] capitalize">
                {telemetryData?.telemetry.executionState || "Idle"}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 2. DISTINCT CORNER / PERIPHERAL CHROME BY TIER */}
      {!isCinema && (
        <>
          {/* A. HOME TIER DISTINCT PERIPHERAL TICKER CARDS */}
          {currentTier === "home" ? (
            <div className="flex items-start justify-between w-full pointer-events-none gap-4 animate-in fade-in duration-300 my-auto">
              {/* Top-Left Peripheral System Health Ticker */}
              <div className="pointer-events-auto flex flex-col p-3 rounded-2xl bg-[#0B1220]/85 border border-cyan-500/25 backdrop-blur-2xl shadow-xl max-w-xs w-full space-y-2 text-xs">
                <div className="flex items-center justify-between border-b border-white/5 pb-1.5">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 flex items-center gap-1.5 font-bold">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    AI Core // Online
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 capitalize">
                    {telemetryData?.telemetry.executionState || "Idle"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px]">
                  <div className="p-2 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col">
                    <span className="text-[9px] text-slate-400 uppercase">Pipelines</span>
                    <span className="text-white font-bold text-sm">{telemetryData?.activeJobCount ?? 0} active</span>
                  </div>
                  <div className="p-2 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col">
                    <span className="text-[9px] text-slate-400 uppercase">MCP Tools</span>
                    <span className="text-cyan-300 font-bold text-sm">{telemetryData?.mcp.totalConnected ?? 0} servers</span>
                  </div>
                </div>
                {primaryModel && (
                  <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-cyan-500/[0.04] border border-cyan-500/15 text-[10px] font-mono">
                    <span className="text-slate-300 truncate max-w-[130px]" title={primaryModel.name}>
                      {primaryModel.name}
                    </span>
                    <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                      <CheckCircle2 className="w-3 h-3" />
                      {primaryModel.latencyMs ? `${primaryModel.latencyMs}ms` : "Active"}
                    </span>
                  </div>
                )}
              </div>

              {/* Left-Side Operational Readiness / Channel Status Ticker */}
              <div className="pointer-events-auto flex flex-col p-3.5 rounded-2xl bg-[#0B1220]/85 border border-white/10 backdrop-blur-2xl shadow-xl max-w-xs w-full space-y-2.5 text-xs text-slate-300">
                <div className="flex items-center justify-between border-b border-white/5 pb-1.5">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-cyan-400" />
                    Operational Pulse
                  </span>
                  <button
                    onClick={onOpenBusinessHub}
                    className="text-[10px] font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5"
                  >
                    Comms &rarr;
                  </button>
                </div>
                <div className="space-y-1.5 font-mono text-[11px]">
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-400">Knowledge Nodes:</span>
                    <span className="font-bold text-white">{allNodes.length} Verified</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-400">Department Agents:</span>
                    <span className="font-bold text-cyan-300">10 Active</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 pt-1.5 border-t border-white/5">
                  <span
                    className={`px-2 py-0.5 rounded text-[9px] font-mono border ${
                      telemetryData?.mcp.connectors?.slack?.connected
                        ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                        : "bg-slate-800/40 text-slate-500 border-white/5"
                    }`}
                  >
                    Slack
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[9px] font-mono border ${
                      telemetryData?.mcp.connectors?.notion?.connected
                        ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                        : "bg-slate-800/40 text-slate-500 border-white/5"
                    }`}
                  >
                    Notion
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[9px] font-mono border ${
                      telemetryData?.mcp.connectors?.hubspot?.connected
                        ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                        : "bg-slate-800/40 text-slate-500 border-white/5"
                    }`}
                  >
                    HubSpot
                  </span>
                </div>
              </div>
            </div>
          ) : (
            /* B. BRAIN & DASHBOARD FLOATING CORNER DOCKS */
            <div className="flex items-end justify-between w-full pointer-events-none gap-4">
              {/* Bottom-Left: Source / Category Filter Dock */}
              <div className="pointer-events-auto flex flex-col p-3 rounded-2xl bg-[#0B1220]/80 border border-white/10 backdrop-blur-2xl shadow-xl max-w-xs w-full space-y-2">
                <div className="flex items-center justify-between px-1 pb-1 border-b border-white/5">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <Layers className="w-3 h-3 text-cyan-400" />
                    Knowledge Sources
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    {allNodes.length} notes &bull; {categories.length} sources
                  </span>
                </div>

                <div className="space-y-1 max-h-44 overflow-y-auto pr-1 custom-scrollbar">
                  {categories.map((cat) => {
                    const isActive = activeCategories.has(cat.id);
                    return (
                      <div
                        key={cat.id}
                        className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-white/5 transition-all text-xs group"
                      >
                        <button
                          onClick={() => onToggleCategory(cat.id)}
                          className="flex items-center gap-2 min-w-0 text-left"
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0 transition-opacity"
                            style={{
                              backgroundColor: cat.color,
                              opacity: isActive ? 1 : 0.25,
                            }}
                          />
                          <span className={`truncate text-xs ${isActive ? "text-slate-200" : "text-slate-500 line-through"}`}>
                            {cat.label}
                          </span>
                        </button>

                        <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-400 shrink-0">
                          <span>{cat.count}</span>
                          <button
                            onClick={() => onSoloCategory(cat.id)}
                            className="opacity-0 group-hover:opacity-100 text-[10px] px-1 rounded bg-white/10 hover:bg-white/20 text-slate-300 transition-opacity"
                            title="Solo this source"
                          >
                            solo
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Bottom-Right: Live Telemetry & Quick MCP Dock */}
              <div
                className={`flex flex-col p-3.5 rounded-2xl bg-[#0B1220]/80 border border-white/10 backdrop-blur-2xl shadow-xl max-w-xs w-full space-y-2.5 text-xs text-slate-300 transition-all duration-300 ${
                  isNoteOpen || isChatOpen ? "opacity-0 translate-x-4 pointer-events-none" : "opacity-100 translate-x-0 pointer-events-auto"
                }`}
              >
                <div className="flex items-center justify-between border-b border-white/5 pb-1.5">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <Activity className="w-3 h-3 text-emerald-400" />
                    Live Telemetry
                  </span>
                  <button
                    onClick={onOpenBusinessHub}
                    className="text-[10px] font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5"
                  >
                    Comms Hub &rarr;
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-center font-mono">
                  <div className="p-2 rounded-xl bg-white/[0.03] border border-white/5 flex flex-col">
                    <span className="text-base font-bold text-white">
                      {telemetryData?.activeJobCount ?? 0}
                    </span>
                    <span className="text-[10px] text-slate-400">Active Pipelines</span>
                  </div>
                  <div className="p-2 rounded-xl bg-white/[0.03] border border-white/5 flex flex-col">
                    <span className="text-base font-bold text-cyan-300">
                      {telemetryData?.mcp.totalConnected ?? 0}
                    </span>
                    <span className="text-[10px] text-slate-400">MCP Connectors</span>
                  </div>
                </div>

                {primaryModel && (
                  <div className="flex items-center justify-between p-2 rounded-xl bg-white/[0.02] border border-white/5 text-[11px] font-mono">
                    <span className="text-slate-400 truncate max-w-[120px]" title={primaryModel.name}>
                      {primaryModel.name}
                    </span>
                    <span className="text-emerald-400 flex items-center gap-1 shrink-0">
                      <CheckCircle2 className="w-3 h-3" />
                      {primaryModel.latencyMs ? `${primaryModel.latencyMs}ms` : "Active"}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* 3. BOTTOM AUDIO/FREQUENCY WAVEFORM DOCK (HOME TIER SPECIFIC) — hidden
          once the chat drawer is open, since it duplicates that drawer's own
          input once you're already looking at it. This is a "start talking"
          quick-launch affordance, not a second parallel chat. */}
      {!isCinema && currentTier === "home" && !isChatOpen && (
        <div className="pointer-events-auto flex flex-col items-center justify-center gap-2.5 w-full max-w-xl mx-auto my-2 animate-in fade-in slide-in-from-bottom-3 duration-300">
          {/* Audio Equalizer Waveform Bars */}
          <div className="flex items-center justify-center gap-1 px-4 py-1.5 rounded-full bg-[#050b16]/70 border border-cyan-400/20 backdrop-blur-xl shadow-[0_0_15px_rgba(6,182,212,0.15)]">
            <Radio className="w-3 h-3 text-cyan-400 animate-pulse mr-1" />
            <span className="text-[9px] font-mono uppercase tracking-widest text-cyan-300/80 mr-2">
              Neural Audio Resonance
            </span>
            <div className="flex items-center gap-[2px] h-3.5">
              {[6, 12, 9, 16, 22, 14, 8, 18, 24, 16, 10, 20, 26, 15, 9, 18, 22, 14, 8, 12, 19, 11, 7].map((h, idx) => (
                <span
                  key={idx}
                  className="w-[2px] rounded-full bg-cyan-400 animate-pulse"
                  style={{
                    height: `${h}px`,
                    animationDuration: `${0.6 + (idx % 5) * 0.25}s`,
                    animationDelay: `${idx * 0.04}s`,
                    opacity: 0.4 + ((idx * 7) % 6) * 0.1,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Quick Prompt Input Dock */}
          <form
            onSubmit={handleHomePromptSubmit}
            className="relative flex items-center w-full max-w-md shadow-2xl"
          >
            <Bot className="absolute left-3.5 w-4 h-4 text-cyan-400 pointer-events-none" />
            <input
              type="text"
              value={homePrompt}
              onChange={(e) => setHomePrompt(e.target.value)}
              placeholder="Ask GrowForge AI Assistant... [Press Enter or click Core]"
              className="w-full pl-10 pr-10 py-2.5 rounded-2xl bg-[#050b16]/90 border border-cyan-400/40 focus:border-cyan-400 text-xs text-white placeholder-slate-400 backdrop-blur-2xl shadow-[0_0_25px_rgba(6,182,212,0.15)] focus:outline-none transition-all"
            />
            <button
              type="submit"
              className="absolute right-2 p-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-all font-bold shadow-md shadow-cyan-500/30"
              title="Send to AI Assistant"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}

      {/* 4. FAST-TRAVEL BOTTOM DOCK & CINEMA/REPLAY CONTROLS */}
      <div className="flex items-center justify-center gap-3 w-full pointer-events-auto">
        {/* Fast-Travel Tier Switcher */}
        <div className="flex items-center p-1.5 rounded-2xl bg-[#0B1220]/90 border border-white/10 backdrop-blur-2xl shadow-2xl space-x-1">
          <button
            onClick={() => onSelectTier("home")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
              currentTier === "home"
                ? "bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20"
                : "text-slate-300 hover:text-white hover:bg-white/5"
            }`}
          >
            <Home className="w-3.5 h-3.5" />
            <span>Home Core</span>
          </button>

          <button
            onClick={() => onSelectTier("brain")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
              currentTier === "brain"
                ? "bg-gradient-to-r from-cyan-500 to-pink-500 text-white font-bold shadow-md shadow-pink-500/20"
                : "text-slate-300 hover:text-white hover:bg-white/5"
            }`}
          >
            <Brain className="w-3.5 h-3.5" />
            <span>AI Brain</span>
          </button>

          <button
            onClick={() => onSelectTier("dashboard")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
              currentTier === "dashboard"
                ? "bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20"
                : "text-slate-300 hover:text-white hover:bg-white/5"
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Dashboard</span>
          </button>
        </div>

        {/* Drill-down from the Dashboard tier into CORE */}
        {currentTier === "dashboard" && (
          <button
            type="button"
            onClick={onEnterCore}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl border border-emerald-400/50 bg-emerald-500/15 backdrop-blur-2xl text-xs font-bold text-emerald-300 shadow-xl shadow-emerald-500/10 transition-all hover:bg-emerald-500/25 animate-in fade-in slide-in-from-bottom-2 duration-300"
            title="Dive into CORE — the live execution pipeline"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Enter CORE</span>
            <span aria-hidden>&rarr;</span>
          </button>
        )}

        {/* AI Assistant Chat Quick Button */}
        <button
          onClick={() => onOpenChat()}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-2xl border backdrop-blur-2xl text-xs font-medium transition-all shadow-xl ${
            isChatOpen
              ? "bg-cyan-500 text-slate-950 font-bold border-cyan-400 shadow-cyan-500/30"
              : "bg-[#0B1220]/90 border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20"
          }`}
          title="Toggle AI Assistant Chat"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>AI Chat</span>
        </button>

        {/* Growth Replay & Cinema Toggle */}
        <div className="flex items-center p-1.5 rounded-2xl bg-[#0B1220]/90 border border-white/10 backdrop-blur-2xl shadow-2xl space-x-1.5">
          <button
            onClick={onToggleReplay}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              isReplaying
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                : "text-slate-300 hover:text-white hover:bg-white/5"
            }`}
            title="Play connectivity replay growth animation"
          >
            {isReplaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            <span>{isReplaying ? `Replaying (${Math.round(replayTime)}s)` : "Play Demo"}</span>
          </button>

          {isReplaying && (
            <button
              onClick={onResetReplay}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Reset Replay"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={onToggleCinema}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              isCinema
                ? "bg-white/20 text-white border border-white/30"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
            title="Toggle Cinema presentation mode"
          >
            Cinema
          </button>
        </div>
      </div>
    </div>
  );
}
