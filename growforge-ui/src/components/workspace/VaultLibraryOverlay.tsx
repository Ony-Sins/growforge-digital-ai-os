"use client";

import { useMemo, useState, useEffect } from "react";
import {
  AlertCircle,
  BookOpen,
  Bot,
  Boxes,
  Info,
  Library,
  Search,
  ShieldCheck,
  Wrench,
  X,
} from "lucide-react";
import vaultDataRaw from "@/data/vaultCapabilities.json";
import { useAppState } from "@/lib/appState";

export interface VaultAgentRecord {
  id: string;
  filename: string;
  name: string;
  emoji: string;
  color: string;
  category: string;
  summary: string;
  tools: string[];
  approvalTier: "read-only" | "needs-approval-to-act";
}

const vaultData = vaultDataRaw as VaultAgentRecord[];

type SortOption = "name-asc" | "name-desc" | "category" | "tools-desc" | "approval";
type ToolFilterOption = "all" | "with-tools" | "no-tools";

export function VaultLibraryOverlay() {
  const { isVaultLibraryOpen, closeVaultLibrary } = useAppState();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedTier, setSelectedTier] = useState<"all" | "read-only" | "needs-approval-to-act">("all");
  const [selectedToolFilter, setSelectedToolFilter] = useState<ToolFilterOption>("all");
  const [sortBy, setSortBy] = useState<SortOption>("name-asc");
  const [selectedAgent, setSelectedAgent] = useState<VaultAgentRecord | null>(null);

  // Close detail modal on Escape key
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (selectedAgent) {
          setSelectedAgent(null);
        } else if (isVaultLibraryOpen) {
          closeVaultLibrary();
        }
      }
    }
    if (isVaultLibraryOpen) {
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }
  }, [isVaultLibraryOpen, selectedAgent, closeVaultLibrary]);

  // Derive categories and counts
  const { categoryCounts, tierCounts, withToolsCount } = useMemo(() => {
    const catMap: Record<string, number> = {};
    let readOnlyCount = 0;
    let needsApprovalCount = 0;
    let withTools = 0;

    for (const agent of vaultData) {
      catMap[agent.category] = (catMap[agent.category] || 0) + 1;
      if (agent.approvalTier === "read-only") readOnlyCount++;
      if (agent.approvalTier === "needs-approval-to-act") needsApprovalCount++;
      if (agent.tools && agent.tools.length > 0) withTools++;
    }

    return {
      categoryCounts: catMap,
      tierCounts: { "read-only": readOnlyCount, "needs-approval-to-act": needsApprovalCount },
      withToolsCount: withTools,
    };
  }, []);

  const sortedCategories = useMemo(() => {
    return Object.keys(categoryCounts).sort((a, b) => categoryCounts[b] - categoryCounts[a]);
  }, [categoryCounts]);

  // Filtered and sorted agents
  const filteredAgents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return vaultData
      .filter((agent) => {
        // Search filter
        if (query) {
          const matchName = agent.name.toLowerCase().includes(query);
          const matchSummary = agent.summary.toLowerCase().includes(query);
          const matchCategory = agent.category.toLowerCase().includes(query);
          const matchId = agent.id.toLowerCase().includes(query);
          const matchTools = agent.tools?.some((t) => t.toLowerCase().includes(query));
          if (!matchName && !matchSummary && !matchCategory && !matchId && !matchTools) {
            return false;
          }
        }

        // Category filter
        if (selectedCategory !== "all" && agent.category !== selectedCategory) {
          return false;
        }

        // Approval tier filter
        if (selectedTier !== "all" && agent.approvalTier !== selectedTier) {
          return false;
        }

        // Tool filter
        if (selectedToolFilter === "with-tools" && (!agent.tools || agent.tools.length === 0)) {
          return false;
        }
        if (selectedToolFilter === "no-tools" && agent.tools && agent.tools.length > 0) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "name-asc") return a.name.localeCompare(b.name);
        if (sortBy === "name-desc") return b.name.localeCompare(a.name);
        if (sortBy === "category") return a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
        if (sortBy === "tools-desc") return (b.tools?.length || 0) - (a.tools?.length || 0);
        if (sortBy === "approval") return a.approvalTier.localeCompare(b.approvalTier);
        return 0;
      });
  }, [searchQuery, selectedCategory, selectedTier, selectedToolFilter, sortBy]);

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    selectedCategory !== "all" ||
    selectedTier !== "all" ||
    selectedToolFilter !== "all";

  function resetFilters() {
    setSearchQuery("");
    setSelectedCategory("all");
    setSelectedTier("all");
    setSelectedToolFilter("all");
    setSortBy("name-asc");
  }

  if (!isVaultLibraryOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0B1220] text-white">
      {/* Top Header Bar */}
      <div className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-[#333333] bg-[#0B1220]/95 px-4 backdrop-blur-xl md:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#0078FF]/30 bg-[#0078FF]/10 text-[#0078FF]">
            <Library className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-heading text-base md:text-lg font-bold text-white tracking-wide">
                Vault Capability Library
              </h1>
              <span className="rounded-full border border-[#0078FF]/40 bg-[#0078FF]/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-[#0078FF]">
                {vaultData.length} AGENTS
              </span>
            </div>
            <p className="text-xs text-[#CCCCCC] hidden sm:block">
              {vaultData.length} specialized agency agents, tooling declarations, and authorization gates.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={closeVaultLibrary}
            aria-label="Close Vault Library"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#333333] bg-[#0B1220] text-[#CCCCCC] transition-all hover:border-[#0078FF] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main Filter & Stats Ribbon */}
      <div className="border-b border-[#333333] bg-[#0E1726]/80 px-4 py-3 backdrop-blur-md md:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Search bar */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search agents by name, domain role, or tool dependency..."
              className="w-full rounded-xl border border-[#333333] bg-[#0B1220] py-2 pl-10 pr-10 text-xs md:text-sm text-white placeholder-[#94a3b8] transition-colors focus:border-[#0078FF] focus:outline-none focus:ring-1 focus:ring-[#0078FF]/40"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Filters and Sort */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Category Dropdown */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-[#CCCCCC] hidden sm:inline">Category:</span>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="rounded-lg border border-[#333333] bg-[#0B1220] px-2.5 py-1.5 text-xs text-white transition-colors hover:border-[#0078FF] focus:border-[#0078FF] focus:outline-none"
              >
                <option value="all">All Categories ({vaultData.length})</option>
                {sortedCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)} ({categoryCounts[cat]})
                  </option>
                ))}
              </select>
            </div>

            {/* Approval Tier Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-[#CCCCCC] hidden sm:inline">Tier:</span>
              <select
                value={selectedTier}
                onChange={(e) => setSelectedTier(e.target.value as "all" | "read-only" | "needs-approval-to-act")}
                className="rounded-lg border border-[#333333] bg-[#0B1220] px-2.5 py-1.5 text-xs text-white transition-colors hover:border-[#0078FF] focus:border-[#0078FF] focus:outline-none"
              >
                <option value="all">All Gates ({vaultData.length})</option>
                <option value="read-only">Read-Only ({tierCounts["read-only"]})</option>
                <option value="needs-approval-to-act">Action-Gated ({tierCounts["needs-approval-to-act"]})</option>
              </select>
            </div>

            {/* Tool Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-[#CCCCCC] hidden sm:inline">Tools:</span>
              <select
                value={selectedToolFilter}
                onChange={(e) => setSelectedToolFilter(e.target.value as ToolFilterOption)}
                className="rounded-lg border border-[#333333] bg-[#0B1220] px-2.5 py-1.5 text-xs text-white transition-colors hover:border-[#0078FF] focus:border-[#0078FF] focus:outline-none"
              >
                <option value="all">All Roles</option>
                <option value="with-tools">Tool-Connected ({withToolsCount})</option>
                <option value="no-tools">Direct Reasoning ({vaultData.length - withToolsCount})</option>
              </select>
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-[#CCCCCC] hidden sm:inline">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="rounded-lg border border-[#333333] bg-[#0B1220] px-2.5 py-1.5 text-xs text-white transition-colors hover:border-[#0078FF] focus:border-[#0078FF] focus:outline-none"
              >
                <option value="name-asc">Name (A-Z)</option>
                <option value="name-desc">Name (Z-A)</option>
                <option value="category">Category</option>
                <option value="tools-desc">Most Tools</option>
                <option value="approval">Approval Tier</option>
              </select>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Results Bar */}
        <div className="mx-auto mt-2.5 flex max-w-7xl items-center justify-between text-[11px] text-[#CCCCCC]">
          <div>
            Showing <span className="font-semibold text-white">{filteredAgents.length}</span> of{" "}
            <span className="font-semibold text-white">{vaultData.length}</span> cataloged agents
            {selectedCategory !== "all" && (
              <span className="ml-1.5 rounded bg-[#0078FF]/10 px-1.5 py-0.5 text-[#0078FF]">
                in {selectedCategory}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald" />
              <span>{tierCounts["read-only"]} Read-Only</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              <span>{tierCounts["needs-approval-to-act"]} Action-Gated</span>
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid View */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-7xl">
          {filteredAgents.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#333333] bg-[#0E1726]/40 p-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#0B1220] border border-[#333333] text-[#94a3b8]">
                <Search className="h-6 w-6" />
              </div>
              <h3 className="mt-4 font-heading text-base font-semibold text-white">No agents match these filters</h3>
              <p className="mt-1 text-xs text-[#CCCCCC] max-w-md">
                No catalog entries found for this keyword or gate selection. Clear filters to view the full roster.
              </p>
              <button
                type="button"
                onClick={resetFilters}
                className="mt-4 rounded-xl border border-[#0078FF] bg-[#0078FF]/10 px-4 py-2 text-xs font-semibold text-[#0078FF] transition-all hover:bg-[#0078FF] hover:text-white"
              >
                Reset all filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredAgents.map((agent) => {
                const isReadOnly = agent.approvalTier === "read-only";
                const toolCount = agent.tools?.length || 0;

                return (
                  <div
                    key={agent.id}
                    onClick={() => setSelectedAgent(agent)}
                    className="group flex flex-col justify-between rounded-2xl border border-[#333333] bg-[#0E1726]/70 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#0078FF] hover:bg-[#0E1726] hover:shadow-lg hover:shadow-[#0078FF]/5 cursor-pointer"
                  >
                    <div>
                      {/* Top Row: Emoji, Name, Badges */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg shadow-sm border border-white/10 text-white"
                            style={{ backgroundColor: `${agent.color}20` }}
                          >
                            {agent.emoji || <Bot className="h-4.5 w-4.5 text-white/80" />}
                          </span>
                          <div className="min-w-0">
                            <h3 className="font-heading text-sm font-semibold text-white truncate group-hover:text-[#0078FF] transition-colors">
                              {agent.name}
                            </h3>
                            <span className="font-mono text-[10px] text-[#94a3b8] uppercase tracking-wider block truncate">
                              {agent.category}
                            </span>
                          </div>
                        </div>

                        {/* Approval Tier Badge */}
                        <span
                          className={`shrink-0 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium border ${
                            isReadOnly
                              ? "bg-emerald/10 text-emerald border-emerald/20"
                              : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          }`}
                          title={isReadOnly ? "Read-Only Analysis Agent" : "Action-Gated (Needs Approval to Act)"}
                        >
                          {isReadOnly ? (
                            <ShieldCheck className="h-3 w-3" />
                          ) : (
                            <AlertCircle className="h-3 w-3" />
                          )}
                          <span className="hidden sm:inline">
                            {isReadOnly ? "Read-Only" : "Gated"}
                          </span>
                        </span>
                      </div>

                      {/* Summary */}
                      <p className="mt-3 text-xs leading-relaxed text-[#CCCCCC] line-clamp-3 font-inter">
                        {agent.summary}
                      </p>
                    </div>

                    {/* Bottom Area: Tools & File info */}
                    <div className="mt-4 pt-3 border-t border-[#333333]/50">
                      <div className="flex flex-wrap items-center gap-1.5 min-h-[22px]">
                        {toolCount > 0 ? (
                          <>
                            {agent.tools.slice(0, 2).map((tool) => (
                              <span
                                key={tool}
                                className="rounded bg-[#1B283F] px-1.5 py-0.5 font-mono text-[10px] text-[#93c5fd] border border-[#333333]"
                              >
                                {tool}
                              </span>
                            ))}
                            {toolCount > 2 && (
                              <span className="font-mono text-[10px] text-[#94a3b8]">
                                +{toolCount - 2} more
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-[10px] text-[#64748b] italic">
                            Direct model reasoning (no external tools)
                          </span>
                        )}
                      </div>

                      <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-[#64748b]">
                        <span className="truncate max-w-[140px]" title={agent.filename}>
                          {agent.filename}
                        </span>
                        <span className="text-[#0078FF] group-hover:underline">
                          Inspect agent →
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Detail Slide-over / Modal Inspector */}
      {selectedAgent && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-[#333333] bg-[#0B1220] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#333333] bg-[#0E1726] px-6 py-4">
              <div className="flex items-center gap-3">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl shadow-sm border border-white/10 text-white"
                  style={{ backgroundColor: `${selectedAgent.color}25` }}
                >
                  {selectedAgent.emoji || <Bot className="h-6 w-6 text-white/80" />}
                </span>
                <div>
                  <h2 className="font-heading text-lg font-bold text-white flex items-center gap-2">
                    {selectedAgent.name}
                  </h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono text-xs uppercase tracking-wider text-[#0078FF]">
                      {selectedAgent.category}
                    </span>
                    <span className="text-[#64748b]">•</span>
                    <span className="font-mono text-xs text-[#94a3b8]">
                      {selectedAgent.filename}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedAgent(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#333333] bg-[#0B1220] text-[#CCCCCC] hover:text-white hover:border-[#0078FF]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Approval Tier Card */}
              <div
                className={`rounded-xl border p-4 flex items-start gap-3.5 ${
                  selectedAgent.approvalTier === "read-only"
                    ? "bg-emerald/5 border-emerald/20 text-emerald"
                    : "bg-amber-500/5 border-amber-500/20 text-amber-400"
                }`}
              >
                {selectedAgent.approvalTier === "read-only" ? (
                  <ShieldCheck className="h-5 w-5 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                )}
                <div>
                  <h4 className="font-heading text-sm font-semibold">
                    {selectedAgent.approvalTier === "read-only"
                      ? "Read-Only Reasoning Gate"
                      : "Action-Gated Execution"}
                  </h4>
                  <p className="mt-1 text-xs text-[#CCCCCC] leading-relaxed">
                    {selectedAgent.approvalTier === "read-only"
                      ? "Researches and formulates plans without writing to external services or executing destructive actions."
                      : "Can create files, call APIs, or push changes to third-party platforms. Requires explicit operator confirmation before dispatch."}
                  </p>
                </div>
              </div>

              {/* Role & Summary */}
              <div>
                <h4 className="font-heading text-xs font-semibold uppercase tracking-wider text-[#94a3b8] mb-2 flex items-center gap-1.5">
                  <BookOpen className="h-3.5 w-3.5 text-[#0078FF]" /> Role Directive &amp; Capability Brief
                </h4>
                <div className="rounded-xl border border-[#333333] bg-[#0E1726]/60 p-4 text-sm text-[#E2E8F0] leading-relaxed font-inter">
                  {selectedAgent.summary}
                </div>
              </div>

              {/* Required Tools / APIs */}
              <div>
                <h4 className="font-heading text-xs font-semibold uppercase tracking-wider text-[#94a3b8] mb-2 flex items-center gap-1.5">
                  <Wrench className="h-3.5 w-3.5 text-[#0078FF]" /> Tool Dependencies &amp; Integrations
                </h4>
                {selectedAgent.tools && selectedAgent.tools.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedAgent.tools.map((tool) => (
                      <span
                        key={tool}
                        className="rounded-lg border border-[#333333] bg-[#1B283F] px-3 py-1.5 font-mono text-xs text-[#93c5fd] flex items-center gap-1.5"
                      >
                        <Boxes className="h-3 w-3 text-[#0078FF]" />
                        {tool}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-[#333333] bg-[#0E1726]/40 p-3.5 text-xs text-[#94a3b8] italic">
                    Operates via direct LLM reasoning without third-party tool dependencies.
                  </div>
                )}
              </div>

              {/* Operational Status Notice */}
              <div className="rounded-xl border border-[#333333] bg-[#0E1726]/40 p-4 flex items-start gap-3 text-xs text-[#94a3b8]">
                <Info className="h-4 w-4 text-[#0078FF] shrink-0 mt-0.5" />
                <div>
                  <span className="font-medium text-white">Reference Catalog Entry: </span>
                  Catalog definition loaded from `.claude/vault/{selectedAgent.filename}`. Autonomous job routing and tool execution are orchestrated by HQ.
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end border-t border-[#333333] bg-[#0E1726] px-6 py-3">
              <button
                type="button"
                onClick={() => setSelectedAgent(null)}
                className="rounded-xl border border-[#333333] bg-[#0B1220] px-4 py-2 text-xs font-semibold text-white hover:border-[#0078FF] transition-colors"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
