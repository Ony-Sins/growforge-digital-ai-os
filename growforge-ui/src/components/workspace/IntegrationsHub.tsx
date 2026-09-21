"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDot,
  ExternalLink,
  FileText,
  Frame,
  GitBranch,
  Grid2x2,
  HardDrive,
  Key,
  Loader2,
  Mail,
  MessagesSquare,
  Pencil,
  Plug,
  Plus,
  Search,
  Server,
  ShieldAlert,
  Sparkles,
  Target,
  Trash2,
  Triangle,
  Users,
  X,
  XCircle,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { MCP_CATALOG, type CatalogEntry } from "@/lib/mcp/catalog";
import { CONNECTOR_BRAND_ICONS } from "@/lib/connectorIcons";
import { useAppState } from "@/lib/appState";
import { AiModelManager } from "./AiModelManager";
import { Integrations } from "./Integrations";

export interface N8nConfig {
  host: { value: string; source: "vault" | "env" | "default" };
  apiKey: { configured: boolean; source: "vault" | "env" | "none" };
}

export interface N8nHealth {
  status: "connected" | "offline" | "checking";
  latencyMs?: number;
  detail?: string;
}

export interface ConnectorRow {
  id: string;
  name: string;
  method: string;
  url: string;
  authMode: "none" | "bearer" | "header";
  authHeaderName?: string;
  hasSecret: boolean;
  createdAt: string;
}

export interface McpServerRow {
  id: string;
  name: string;
  transport: "stdio" | "http";
  command?: string;
  args?: string[];
  url?: string;
  allowedDepartments: string[];
  hasCredential: boolean;
  catalogId?: string;
  authHeader?: string;
  origin?: "catalog" | "custom" | "byo-mcp";
}

/** Catalog-token and manual-connect flows never set `origin` on the
 *  backend def (see mcp/store.ts) — only the BYO-MCP auto-discovery drawer
 *  does. `catalogId` presence is what actually distinguishes a curated
 *  catalog entry from the freeform "Add a custom MCP server" form. */
function originBadge(server: McpServerRow): { label: string; className: string } {
  if (server.origin === "byo-mcp") {
    return { label: "BYO-MCP", className: "bg-electric/10 text-electric border-electric/30" };
  }
  if (server.catalogId) {
    return { label: "Catalog", className: "bg-emerald/10 text-emerald border-emerald/30" };
  }
  return { label: "Custom", className: "bg-[#1F2937] text-secondary border-[#333333]" };
}

export interface DepartmentOption {
  id: string;
  name: string;
}

type McpTestResult = { ok: true; tools: { name: string; description: string }[] } | { ok: false; error: string } | null;
type ConnectorTestResult = { ok: boolean; message: string } | null;

const CATALOG_ICONS: Record<string, LucideIcon> = {
  CircleDot,
  CheckCircle2,
  FileText,
  Users,
  HardDrive,
  Mail,
  Calendar,
  MessagesSquare,
  Grid2x2,
  Frame,
  GitBranch,
  Target,
  Triangle,
};

type ActiveTab = "installed" | "discover" | "byo-mcp";
type FilterType = "all" | "mcp" | "rest" | "automation";

/** Unified Connectors & Plugins Directory with Click-to-Inspect Pattern */
export function IntegrationsHub() {
  const { uiMode } = useAppState();
  const [servers, setServers] = useState<McpServerRow[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [connectors, setConnectors] = useState<ConnectorRow[]>([]);
  const [n8nConfig, setN8nConfig] = useState<N8nConfig | null>(null);
  const [n8nHealth, setN8nHealth] = useState<N8nHealth>({ status: "checking" });
  const [forbidden, setForbidden] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Directory UI states
  const [activeTab, setActiveTab] = useState<ActiveTab>("installed");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<FilterType>("all");

  // Inspect Modal States
  const [inspectedMcp, setInspectedMcp] = useState<McpServerRow | null>(null);
  const [inspectedCatalog, setInspectedCatalog] = useState<CatalogEntry | null>(null);
  const [inspectedCustom, setInspectedCustom] = useState<ConnectorRow | null>(null);
  const [isN8nInspectOpen, setIsN8nInspectOpen] = useState(false);
  const [isNewCustomModalOpen, setIsNewCustomModalOpen] = useState(false);
  const [isNewMcpModalOpen, setIsNewMcpModalOpen] = useState(false);

  // Load Data
  const loadAll = useCallback(async () => {
    try {
      const [mcpRes, connRes, n8nRes, vaultRes] = await Promise.all([
        fetch("/api/mcp").catch(() => null),
        fetch("/api/connectors").catch(() => null),
        fetch("/api/vault/system/n8n").catch(() => null),
        fetch("/api/vault/system").catch(() => null),
      ]);

      if (vaultRes?.status === 403) {
        setForbidden(true);
        setLoaded(true);
        return;
      }

      if (mcpRes?.ok) {
        const d = await mcpRes.json();
        setServers(Array.isArray(d.servers) ? d.servers : []);
        setDepartments(Array.isArray(d.departments) ? d.departments : []);
      }
      if (connRes?.ok) {
        const d = await connRes.json();
        setConnectors(Array.isArray(d.connectors) ? d.connectors : []);
      }
      if (n8nRes?.ok) {
        const d = await n8nRes.json();
        setN8nConfig(d);
      }
    } finally {
      setLoaded(true);
    }
  }, []);

  const checkN8nHealth = useCallback(async () => {
    try {
      setN8nHealth((h) => ({ ...h, status: "checking" }));
      const res = await fetch("/api/vault/system/n8n/health");
      if (res.ok) {
        const d = await res.json();
        setN8nHealth(d as N8nHealth);
      } else {
        setN8nHealth({ status: "offline", detail: `HTTP ${res.status}` });
      }
    } catch {
      setN8nHealth({ status: "offline", detail: "Network error" });
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void Promise.all([loadAll(), checkN8nHealth()]);
    }, 0);

    return () => window.clearTimeout(initialLoad);
  }, [loadAll, checkN8nHealth]);

  const connectedCatalogIds = useMemo(
    () => new Set(servers.map((s) => s.catalogId).filter(Boolean)),
    [servers]
  );

  const installedCount = servers.length + connectors.length + (n8nConfig?.apiKey.configured ? 1 : 0);

  // Filtered lists
  const filteredCatalog = useMemo(() => {
    return MCP_CATALOG.filter((entry) => {
      if (filterType !== "all" && filterType !== "mcp") return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return entry.name.toLowerCase().includes(q) || entry.description.toLowerCase().includes(q);
    });
  }, [filterType, searchQuery]);

  const filteredServers = useMemo(() => {
    return servers.filter((s) => {
      if (filterType !== "all" && filterType !== "mcp") return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return s.name.toLowerCase().includes(q) || s.transport.includes(q) || (s.url && s.url.toLowerCase().includes(q));
    });
  }, [servers, filterType, searchQuery]);

  const filteredConnectors = useMemo(() => {
    return connectors.filter((c) => {
      if (filterType !== "all" && filterType !== "rest") return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return c.name.toLowerCase().includes(q) || c.url.toLowerCase().includes(q) || c.method.toLowerCase().includes(q);
    });
  }, [connectors, filterType, searchQuery]);

  const isN8nVisible = filterType === "all" || filterType === "automation";

  if (!loaded) return null;

  if (forbidden) {
    return (
      <div className="glass-card flex items-start gap-3 rounded-xl p-5">
        <ShieldAlert className="h-5 w-5 shrink-0 text-crimson" />
        <div>
          <h2 className="font-heading text-sm font-semibold text-navy">Connectors & Plugins</h2>
          <p className="mt-1 text-sm text-secondary">Only workspace owners can configure system integrations.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header & Search */}
      <div className="glass-card rounded-2xl border border-border-metal p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Plug className="h-4 w-4 text-electric" />
              <h2 className="font-heading text-sm font-semibold text-navy">Connectors & Plugins Hub</h2>
            </div>
            <p className="mt-1 text-xs text-secondary">
              Unified control center for MCP tools, custom REST endpoints, and automation engines.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveTab("byo-mcp")}
              className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/20 transition-all shrink-0"
            >
              <Sparkles className="h-3.5 w-3.5 text-cyan-500" />
              <span>BYO-MCP Hub</span>
            </button>
            <button
              type="button"
              onClick={() => setIsNewCustomModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-[#333333] bg-[#111827] px-3 py-1.5 text-xs font-medium text-white hover:border-electric/50 hover:bg-electric/5 transition-all shrink-0"
            >
              <Plus className="h-3.5 w-3.5 text-electric" />
              <span>Custom REST</span>
            </button>
            <button
              type="button"
              onClick={() => setIsNewMcpModalOpen(true)}
              className="btn-primary-cta !px-3.5 !py-1.5 text-xs font-semibold shadow-sm hover:opacity-90 transition-all shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add MCP Server</span>
            </button>
          </div>
        </div>

        {/* Directory Controls: Search, Tabs & Filter Pills */}
        <div className="mt-5 flex flex-col md:flex-row md:items-center justify-between gap-3 pt-4 border-t border-[#333333]">
          {/* Main Tabs */}
          <div className="flex rounded-lg border border-[#333333] bg-[#0B1220] p-1">
            <button
              type="button"
              onClick={() => setActiveTab("installed")}
              className={`flex items-center gap-2 rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                activeTab === "installed"
                  ? "bg-[#111827] text-white shadow-sm border border-[#333333]"
                  : "text-secondary hover:text-white"
              }`}
            >
              <span>Your Connectors</span>
              <span className="rounded-full bg-electric/15 text-electric px-1.5 py-0.2 text-[10px]">
                {installedCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("discover")}
              className={`flex items-center gap-2 rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                activeTab === "discover"
                  ? "bg-[#111827] text-white shadow-sm border border-[#333333]"
                  : "text-secondary hover:text-white"
              }`}
            >
              <span>Discover Directory</span>
              <span className="rounded-full bg-sunken text-muted px-1.5 py-0.2 text-[10px]">
                {MCP_CATALOG.length + 2}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("byo-mcp")}
              className={`flex items-center gap-2 rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                activeTab === "byo-mcp"
                  ? "bg-[#111827] text-white shadow-sm border border-[#333333]"
                  : "text-secondary hover:text-white"
              }`}
            >
              <Sparkles className="h-3 w-3 text-cyan-500" />
              <span>BYO-MCP Hub</span>
            </button>
          </div>

          {/* Search Input */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tools, protocols, or vendors…"
              className="w-full rounded-lg border border-[#333333] bg-[#111827] pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-muted outline-none focus:border-electric/60"
            />
          </div>
        </div>

        {/* Filter Badges */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(
            [
              { id: "all", label: "All Types" },
              { id: "mcp", label: "MCP Protocol" },
              { id: "rest", label: "Custom REST" },
              { id: "automation", label: "Automations" },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilterType(f.id)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium border transition-colors ${
                filterType === f.id
                  ? "bg-electric/10 text-electric border-electric/30 font-semibold"
                  : "bg-[#111827] text-secondary border-[#333333] hover:text-white"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Directory Grid View */}
      {activeTab === "byo-mcp" ? (
        <Integrations />
      ) : activeTab === "installed" ? (
        <div className="space-y-4">
          {installedCount === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#333333] p-12 text-center bg-[#111827]/40">
              <Plug className="mx-auto h-8 w-8 text-muted" />
              <p className="mt-2 text-sm font-semibold text-white">No connectors active yet</p>
              <p className="mt-1 text-xs text-secondary max-w-sm mx-auto">
                Explore the Discover Directory to connect Linear, Notion, HubSpot, GitHub, or add a custom REST webhook.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab("discover")}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-electric px-4 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Browse Directory
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Connected MCP Servers */}
              {filteredServers.map((server) => {
                const brand = server.catalogId ? CONNECTOR_BRAND_ICONS[server.catalogId] : null;
                const badge = originBadge(server);
                return (
                  <div
                    key={server.id}
                    onClick={() => setInspectedMcp(server)}
                    className="group relative cursor-pointer rounded-xl border border-[#333333] bg-[#111827] p-4 transition-all hover:border-electric/50 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0B1220] border border-[#333333] text-white">
                          {brand ? (
                            <svg role="img" viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-label={brand.title}>
                              <path d={brand.path} />
                            </svg>
                          ) : (
                            <Server className="h-5 w-5 text-electric" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-xs font-semibold text-white truncate group-hover:text-electric transition-colors">
                            {server.name}
                          </h3>
                          <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                            <span className="rounded bg-[#0B1220] border border-[#333333] px-1.5 py-0.2 font-mono text-[9px] font-bold text-white uppercase">
                              MCP {server.transport}
                            </span>
                            <span className={`rounded border px-1.5 py-0.2 text-[9px] font-bold uppercase ${badge.className}`}>
                              {badge.label}
                            </span>
                            <span className="flex items-center gap-1 text-[10px] font-medium text-emerald">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald animate-pulse" />
                              Active
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <p className="mt-3 truncate font-mono text-[11px] text-muted">
                      {server.transport === "stdio" ? `${server.command} ${(server.args ?? []).join(" ")}` : server.url}
                    </p>

                    <div className="mt-3 flex items-center justify-between pt-2.5 border-t border-[#333333] text-[11px] text-secondary">
                      <span>Click to inspect & test</span>
                      <span className="font-semibold text-electric group-hover:translate-x-0.5 transition-transform">→</span>
                    </div>
                  </div>
                );
              })}

              {/* Connected Custom REST Connectors */}
              {filteredConnectors.map((connector) => (
                <div
                  key={connector.id}
                  onClick={() => setInspectedCustom(connector)}
                  className="group relative cursor-pointer rounded-xl border border-[#333333] bg-[#111827] p-4 transition-all hover:border-electric/50 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-electric/20 to-gold/20 text-electric border border-electric/30">
                        <Plug className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-xs font-semibold text-white truncate group-hover:text-electric transition-colors">
                          {connector.name}
                        </h3>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <span className="rounded bg-[#0B1220] border border-[#333333] px-1.5 py-0.2 font-mono text-[9px] font-bold text-white uppercase">
                            {connector.method}
                          </span>
                          <span className="rounded bg-emerald/10 text-emerald px-1.5 py-0.2 text-[9px] font-medium">
                            REST
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <p className="mt-3 truncate font-mono text-[11px] text-muted">{connector.url}</p>

                  <div className="mt-3 flex items-center justify-between pt-2.5 border-t border-[#333333] text-[11px] text-secondary">
                    <span>Inspect payload & auth</span>
                    <span className="font-semibold text-electric group-hover:translate-x-0.5 transition-transform">→</span>
                  </div>
                </div>
              ))}

              {/* n8n Automation Card (if configured or searched) */}
              {isN8nVisible && n8nConfig?.apiKey.configured && (
                <div
                  onClick={() => setIsN8nInspectOpen(true)}
                  className="group relative cursor-pointer rounded-xl border border-[#333333] bg-[#111827] p-4 transition-all hover:border-electric/50 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-electric/20 to-gold/20 text-electric border border-electric/30">
                        <Zap className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-xs font-semibold text-white truncate group-hover:text-electric transition-colors">
                          n8n Workflow Automation
                        </h3>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <span className="rounded bg-[#0B1220] border border-[#333333] px-1.5 py-0.2 font-mono text-[9px] font-bold text-white uppercase">
                            Engine
                          </span>
                          <span className={`flex items-center gap-1 text-[10px] font-medium ${n8nHealth.status === "connected" ? "text-emerald" : "text-crimson"}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${n8nHealth.status === "connected" ? "bg-emerald" : "bg-crimson"}`} />
                            {n8nHealth.status === "connected" ? "Connected" : "Offline"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <p className="mt-3 truncate font-mono text-[11px] text-muted">{n8nConfig.host.value}</p>

                  <div className="mt-3 flex items-center justify-between pt-2.5 border-t border-[#333333] text-[11px] text-secondary">
                    <span>Inspect host & webhook routes</span>
                    <span className="font-semibold text-electric group-hover:translate-x-0.5 transition-transform">→</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Discover Directory Grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* n8n Automation Engine Card */}
          {isN8nVisible && (
            <div
              onClick={() => setIsN8nInspectOpen(true)}
              className="group cursor-pointer rounded-xl border border-[#333333] bg-[#111827] p-4 transition-all hover:border-electric/50 hover:shadow-md flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-electric/20 to-gold/20 text-electric border border-electric/30">
                    <Zap className="h-5 w-5" />
                  </div>
                  {n8nConfig?.apiKey.configured ? (
                    <span className="flex items-center gap-1 rounded-full bg-emerald/10 px-2 py-0.5 text-[10px] font-semibold text-emerald">
                      <Check className="h-3 w-3" /> Connected
                    </span>
                  ) : (
                    <span className="rounded-full bg-[#0B1220] border border-[#333333] px-2 py-0.5 text-[10px] font-medium text-secondary">
                      Self-Hosted
                    </span>
                  )}
                </div>
                <h3 className="mt-3 text-xs font-semibold text-white group-hover:text-electric transition-colors">
                  n8n Automation Engine
                </h3>
                <p className="mt-1 text-[11px] text-muted line-clamp-2">
                  Multi-step autonomous workflow automation engine and trigger webhooks.
                </p>
              </div>
              <div className="mt-4 pt-2.5 border-t border-[#333333] flex items-center justify-between text-[11px] text-secondary">
                <span>Configure Engine</span>
                <span className="font-semibold text-electric">→</span>
              </div>
            </div>
          )}

          {/* MCP Catalog Entries */}
          {filteredCatalog.map((entry) => {
            const isConnected = connectedCatalogIds.has(entry.id);
            const brand = CONNECTOR_BRAND_ICONS[entry.id];
            const Icon = CATALOG_ICONS[entry.icon] ?? Server;

            return (
              <div
                key={entry.id}
                onClick={() => setInspectedCatalog(entry)}
                className="group cursor-pointer rounded-xl border border-[#333333] bg-[#111827] p-4 transition-all hover:border-electric/50 hover:shadow-md flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B1220] border border-[#333333] text-white`}>
                      {brand ? (
                        <svg role="img" viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-label={brand.title}>
                          <path d={brand.path} />
                        </svg>
                      ) : (
                        <Icon className="h-5 w-5 text-electric" />
                      )}
                    </div>
                    {isConnected ? (
                      <span className="flex items-center gap-1 rounded-full bg-emerald/10 px-2 py-0.5 text-[10px] font-semibold text-emerald">
                        <Check className="h-3 w-3" /> Connected
                      </span>
                    ) : (
                      <span className="rounded-full bg-[#0B1220] border border-[#333333] px-2 py-0.5 text-[10px] font-bold text-white uppercase">
                        MCP
                      </span>
                    )}
                  </div>
                  <h3 className="mt-3 text-xs font-semibold text-white group-hover:text-electric transition-colors">
                    {entry.name}
                  </h3>
                  <p className="mt-1 text-[11px] text-muted line-clamp-2">{entry.description}</p>
                </div>
                <div className="mt-4 pt-2.5 border-t border-[#333333] flex items-center justify-between text-[11px] text-secondary">
                  <span>{isConnected ? "Inspect & Manage" : "Connect Tool"}</span>
                  <span className="font-semibold text-electric">→</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* INSPECTOR MODAL: Connected MCP Server */}
      {inspectedMcp && (
        <McpInspectorModal
          server={inspectedMcp}
          departments={departments}
          uiMode={uiMode}
          onClose={() => setInspectedMcp(null)}
          onChanged={() => {
            setInspectedMcp(null);
            loadAll();
          }}
        />
      )}

      {/* INSPECTOR MODAL: Catalog Setup / Connect */}
      {inspectedCatalog && (
        <CatalogInspectorModal
          entry={inspectedCatalog}
          connectedServer={servers.find((s) => s.catalogId === inspectedCatalog.id)}
          departments={departments}
          uiMode={uiMode}
          onClose={() => setInspectedCatalog(null)}
          onChanged={() => {
            setInspectedCatalog(null);
            loadAll();
          }}
        />
      )}

      {/* INSPECTOR MODAL: Custom REST Connector */}
      {inspectedCustom && (
        <CustomConnectorInspectorModal
          connector={inspectedCustom}
          onClose={() => setInspectedCustom(null)}
          onChanged={() => {
            setInspectedCustom(null);
            loadAll();
          }}
        />
      )}

      {/* INSPECTOR MODAL: n8n Configuration */}
      {isN8nInspectOpen && (
        <N8nInspectorModal
          config={n8nConfig}
          health={n8nHealth}
          onClose={() => setIsN8nInspectOpen(false)}
          onChanged={() => {
            loadAll();
            checkN8nHealth();
          }}
        />
      )}

      {/* MODAL: New Custom REST Connector */}
      {isNewCustomModalOpen && (
        <NewCustomConnectorModal
          onClose={() => setIsNewCustomModalOpen(false)}
          onCreated={() => {
            setIsNewCustomModalOpen(false);
            loadAll();
          }}
        />
      )}

      {/* MODAL: New Custom MCP Server */}
      {isNewMcpModalOpen && (
        <NewMcpServerModal
          onClose={() => setIsNewMcpModalOpen(false)}
          onCreated={() => {
            setIsNewMcpModalOpen(false);
            loadAll();
          }}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------
// MODALS / INSPECTORS
// -------------------------------------------------------------

function McpInspectorModal({
  server,
  departments,
  uiMode,
  onClose,
  onChanged,
}: {
  server: McpServerRow;
  departments: DepartmentOption[];
  uiMode: "simple" | "advanced";
  onClose: () => void;
  onChanged: () => void;
}) {
  const brand = server.catalogId ? CONNECTOR_BRAND_ICONS[server.catalogId] : null;
  const [test, setTest] = useState<McpTestResult>(null);
  const [testing, setTesting] = useState(false);
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const [busy, setBusy] = useState(false);

  // Edit Mode
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(server.name);
  const [url, setUrl] = useState(server.url || "");
  const [command, setCommand] = useState(server.command || "");
  const [args, setArgs] = useState((server.args ?? []).join(" "));
  const [authHeader, setAuthHeader] = useState(server.authHeader || "");
  const [bearerToken, setBearerToken] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleTest() {
    setTesting(true);
    setTest(null);
    try {
      const res = await fetch(`/api/mcp/${encodeURIComponent(server.id)}/test`, { method: "POST" });
      const data = await res.json();
      setTest(data);
    } finally {
      setTesting(false);
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/mcp/${encodeURIComponent(server.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          url: server.transport === "http" ? url.trim() : undefined,
          command: server.transport === "stdio" ? command.trim() : undefined,
          args: server.transport === "stdio" ? args.split(/\s+/).filter(Boolean) : undefined,
          bearerToken: server.transport === "http" && bearerToken ? bearerToken.trim() : undefined,
          authHeader: server.transport === "http" ? authHeader.trim() || undefined : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to update MCP server.");
      } else {
        setIsEditing(false);
        onChanged();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving changes.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleDepartment(deptId: string) {
    const has = server.allowedDepartments.includes(deptId);
    const next = has ? server.allowedDepartments.filter((d) => d !== deptId) : [...server.allowedDepartments, deptId];
    setBusy(true);
    try {
      await fetch(`/api/mcp/${encodeURIComponent(server.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowedDepartments: next }),
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Are you sure you want to disconnect ${server.name}?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/mcp/${encodeURIComponent(server.id)}`, { method: "DELETE" });
      if (res.ok) onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg rounded-2xl border border-[#333333] bg-[#0B1220] shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-[#333333]">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#111827] text-white border border-[#333333] shadow-sm">
              {brand ? (
                <svg role="img" viewBox="0 0 24 24" className="h-6 w-6 fill-current" aria-label={brand.title}>
                  <path d={brand.path} />
                </svg>
              ) : (
                <Server className="h-6 w-6 text-electric" />
              )}
            </div>
            <div>
              <h3 className="font-heading text-base font-semibold text-white">{server.name}</h3>
              <div className="mt-0.5 flex items-center gap-2">
                <span className="rounded bg-[#111827] border border-[#333333] px-1.5 py-0.2 font-mono text-[10px] font-bold text-secondary uppercase">
                  MCP {server.transport}
                </span>
                {server.hasCredential && (
                  <span className="rounded-full bg-emerald/10 text-emerald px-2 py-0.2 text-[10px] font-semibold border border-emerald/20">
                    Vault Authenticated
                  </span>
                )}
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-[#111827] hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Configuration Details or Edit Form */}
        {isEditing ? (
          <form onSubmit={handleSaveEdit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-white">Server Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#333333] bg-[#111827] px-3 py-2 text-xs text-white placeholder:text-muted outline-none focus:border-electric"
                required
              />
            </div>
            {server.transport === "http" ? (
              <>
                <div>
                  <label className="block text-xs font-medium text-white">MCP Server URL</label>
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#333333] bg-[#111827] px-3 py-2 font-mono text-xs text-white placeholder:text-muted outline-none focus:border-electric"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-white">Auth Header Name</label>
                    <input
                      type="text"
                      value={authHeader}
                      onChange={(e) => setAuthHeader(e.target.value)}
                      placeholder="e.g. X-Api-Key"
                      className="mt-1 w-full rounded-lg border border-[#333333] bg-[#111827] px-3 py-2 text-xs text-white placeholder:text-muted outline-none focus:border-electric"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-white">Bearer Token</label>
                    <input
                      type="password"
                      value={bearerToken}
                      onChange={(e) => setBearerToken(e.target.value)}
                      placeholder="•••••••• (leave blank to keep)"
                      className="mt-1 w-full rounded-lg border border-[#333333] bg-[#111827] px-3 py-2 font-mono text-xs text-white placeholder:text-muted outline-none focus:border-electric"
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-white">Command</label>
                  <input
                    type="text"
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#333333] bg-[#111827] px-3 py-2 font-mono text-xs text-white placeholder:text-muted outline-none focus:border-electric"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-white">Args</label>
                  <input
                    type="text"
                    value={args}
                    onChange={(e) => setArgs(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#333333] bg-[#111827] px-3 py-2 font-mono text-xs text-white placeholder:text-muted outline-none focus:border-electric"
                  />
                </div>
              </div>
            )}
            {error && <p className="text-xs text-crimson">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="rounded-lg border border-[#333333] bg-[#111827] px-3 py-1.5 text-xs text-muted hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="btn-primary-cta px-4 py-1.5 text-xs disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1" /> : null}
                Save Changes
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl border border-[#333333] bg-[#111827] p-3 space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Endpoint Target</span>
              <p className="font-mono text-xs text-white break-all">
                {server.transport === "stdio" ? `${server.command} ${(server.args ?? []).join(" ")}` : server.url}
              </p>
            </div>

            {/* Live Test & Tool Count */}
            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={handleTest}
                disabled={testing}
                className="flex items-center gap-1.5 rounded-lg border border-[#333333] bg-[#111827] px-3 py-1.5 text-xs font-medium text-white hover:border-electric hover:text-electric transition-colors"
              >
                {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5 text-electric" />}
                <span>{testing ? "Testing Ping…" : "Test Connection"}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1 text-xs text-secondary hover:text-electric transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit Details
              </button>
            </div>

            {test && (
              <div className={`flex items-start gap-2 rounded-lg p-2.5 text-xs border ${test.ok ? "bg-emerald/10 text-emerald border-emerald/20" : "bg-crimson/10 text-crimson border-crimson/20"}`}>
                {test.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" /> : <XCircle className="h-4 w-4 shrink-0 mt-0.5" />}
                <div>
                  <span className="font-medium">{test.ok ? `Connected · ${test.tools.length} tools discovered.` : test.error}</span>
                </div>
              </div>
            )}

            {test?.ok && (
              <div>
                <button
                  type="button"
                  onClick={() => setToolsExpanded((v) => !v)}
                  className="flex items-center gap-1 text-[11px] font-medium text-electric hover:underline"
                >
                  {toolsExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  {toolsExpanded ? "Hide Discovered Tools" : `View ${test.tools.length} Tools`}
                </button>
                {toolsExpanded && (
                  <ul className="mt-2 space-y-1.5 rounded-lg bg-[#111827] p-3 max-h-48 overflow-y-auto border border-[#333333]">
                    {test.tools.map((t) => (
                      <li key={t.name} className="text-xs text-secondary">
                        <span className="font-mono font-semibold text-white">{t.name}</span>
                        {t.description && <p className="text-[11px] text-muted">{t.description}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Department Access in Advanced Mode */}
            {uiMode === "advanced" && (
              <div className="pt-2 border-t border-[#333333]">
                <span className="text-[11px] font-semibold text-white">Department Access Permissions</span>
                <p className="text-[10px] text-muted">Toggle which specialist departments can invoke this server.</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {departments.map((d) => {
                    const active = server.allowedDepartments.includes(d.id);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => toggleDepartment(d.id)}
                        disabled={busy}
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium border transition-colors ${
                          active
                            ? "bg-electric text-white border-electric"
                            : "bg-[#111827] text-secondary border-[#333333] hover:border-electric/40"
                        }`}
                      >
                        {d.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-[#333333]">
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className="flex items-center gap-1.5 text-xs text-crimson hover:underline"
          >
            <Trash2 className="h-3.5 w-3.5" /> Disconnect Server
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#333333] bg-[#111827] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#1f2937] transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function CatalogInspectorModal({
  entry,
  connectedServer,
  departments,
  uiMode,
  onClose,
  onChanged,
}: {
  entry: CatalogEntry;
  connectedServer?: McpServerRow;
  departments: DepartmentOption[];
  uiMode: "simple" | "advanced";
  onClose: () => void;
  onChanged: () => void;
}) {
  const brand = CONNECTOR_BRAND_ICONS[entry.id];
  const Icon = CATALOG_ICONS[entry.icon] ?? Server;
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Manual configuration inputs
  const [manualTransport, setManualTransport] = useState<"http" | "stdio">("http");
  const [manualUrl, setManualUrl] = useState("");
  const [manualSecret, setManualSecret] = useState("");
  const [manualCommand, setManualCommand] = useState("");
  const [manualArgs, setManualArgs] = useState("");

  if (connectedServer) {
    return (
      <McpInspectorModal
        server={connectedServer}
        departments={departments}
        uiMode={uiMode}
        onClose={onClose}
        onChanged={onChanged}
      />
    );
  }

  async function handleConnectToken(e: React.FormEvent) {
    e.preventDefault();
    if (!entry.recipe || !token.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const body =
        entry.recipe.transport === "http"
          ? {
              name: entry.name,
              transport: "http",
              url: entry.recipe.url,
              bearerToken: token.trim(),
              authHeader: entry.recipe.authHeader,
              catalogId: entry.id,
            }
          : {
              name: entry.name,
              transport: "stdio",
              command: entry.recipe.command,
              args: entry.recipe.args,
              env: { [entry.recipe.envVar]: token.trim() },
              catalogId: entry.id,
            };
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to connect.");
      } else {
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleManualConnect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body =
        manualTransport === "http"
          ? {
              name: entry.name,
              transport: "http",
              url: manualUrl.trim(),
              bearerToken: manualSecret.trim() || undefined,
              catalogId: entry.id,
            }
          : {
              name: entry.name,
              transport: "stdio",
              command: manualCommand.trim(),
              args: manualArgs.split(/\s+/).filter(Boolean),
              catalogId: entry.id,
            };
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to connect.");
      } else {
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg rounded-2xl border border-[#333333] bg-[#0B1220] shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between pb-3 border-b border-[#333333]">
          <div className="flex items-center gap-3">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white ${entry.tint}`}>
              {brand ? (
                <svg role="img" viewBox="0 0 24 24" className="h-6 w-6 fill-current" aria-label={brand.title}>
                  <path d={brand.path} />
                </svg>
              ) : (
                <Icon className="h-6 w-6" />
              )}
            </div>
            <div>
              <h3 className="font-heading text-base font-semibold text-white">Connect {entry.name}</h3>
              <p className="text-xs text-secondary">{entry.description}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-[#111827] hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {entry.authKind === "token" ? (
          <form onSubmit={handleConnectToken} className="space-y-3.5">
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-white">{entry.tokenLabel || "API / Access Token"}</label>
                {entry.tokenHelpUrl && (
                  <a
                    href={entry.tokenHelpUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-[11px] text-electric hover:underline"
                  >
                    <span>Get token</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste token or key..."
                autoFocus
                required
                className="mt-1 w-full rounded-lg border border-[#333333] bg-[#111827] px-3 py-2 font-mono text-xs text-white placeholder:text-muted outline-none focus:border-electric"
              />
            </div>
            {error && <p className="text-xs text-crimson">{error}</p>}
            <button
              type="submit"
              disabled={!token.trim() || busy}
              className="btn-primary-cta flex w-full items-center justify-center gap-1.5 px-4 py-2.5 text-xs disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Connect {entry.name}
            </button>
          </form>
        ) : (
          <form onSubmit={handleManualConnect} className="space-y-3">
            <select
              value={manualTransport}
              onChange={(e) => setManualTransport(e.target.value as "http" | "stdio")}
              className="w-full rounded-lg border border-[#333333] bg-[#111827] px-3 py-2 text-xs text-white outline-none focus:border-electric"
            >
              <option value="http">Remote (HTTP MCP Server)</option>
              <option value="stdio">Local Process (command via npx/etc)</option>
            </select>
            {manualTransport === "http" ? (
              <>
                <input
                  type="url"
                  value={manualUrl}
                  onChange={(e) => setManualUrl(e.target.value)}
                  placeholder="MCP server URL (https://...)"
                  required
                  className="w-full rounded-lg border border-[#333333] bg-[#111827] px-3 py-2 font-mono text-xs text-white placeholder:text-muted outline-none focus:border-electric"
                />
                <input
                  type="password"
                  value={manualSecret}
                  onChange={(e) => setManualSecret(e.target.value)}
                  placeholder="Bearer token or API key"
                  className="w-full rounded-lg border border-[#333333] bg-[#111827] px-3 py-2 font-mono text-xs text-white placeholder:text-muted outline-none focus:border-electric"
                />
              </>
            ) : (
              <>
                <input
                  type="text"
                  value={manualCommand}
                  onChange={(e) => setManualCommand(e.target.value)}
                  placeholder="Command, e.g. npx"
                  required
                  className="w-full rounded-lg border border-[#333333] bg-[#111827] px-3 py-2 font-mono text-xs text-white placeholder:text-muted outline-none focus:border-electric"
                />
                <input
                  type="text"
                  value={manualArgs}
                  onChange={(e) => setManualArgs(e.target.value)}
                  placeholder="Args, e.g. -y @vendor/mcp-server"
                  className="w-full rounded-lg border border-[#333333] bg-[#111827] px-3 py-2 font-mono text-xs text-white placeholder:text-muted outline-none focus:border-electric"
                />
              </>
            )}
            {error && <p className="text-xs text-crimson">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="btn-primary-cta flex w-full items-center justify-center gap-1.5 px-4 py-2.5 text-xs disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Connect {entry.name}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function CustomConnectorInspectorModal({
  connector,
  onClose,
  onChanged,
}: {
  connector: ConnectorRow;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [testResult, setTestResult] = useState<ConnectorTestResult>(null);
  const [testing, setTesting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(connector.name);
  const [method, setMethod] = useState(connector.method);
  const [url, setUrl] = useState(connector.url);
  const [authMode, setAuthMode] = useState(connector.authMode);
  const [authHeaderName, setAuthHeaderName] = useState(connector.authHeaderName || "");
  const [secretValue, setSecretValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/connectors/${encodeURIComponent(connector.id)}/test`, { method: "POST" });
      const data = await res.json();
      setTestResult(data);
    } finally {
      setTesting(false);
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/connectors/${encodeURIComponent(connector.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          method,
          url,
          authMode,
          authHeaderName: authMode === "header" ? authHeaderName : undefined,
          secretValue: authMode !== "none" && secretValue ? secretValue : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to update connector.");
      } else {
        setIsEditing(false);
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Remove connector "${connector.name}"?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/connectors/${encodeURIComponent(connector.id)}`, { method: "DELETE" });
      if (res.ok) onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg rounded-2xl border border-[#333333] bg-[#0B1220] shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between pb-3 border-b border-[#333333]">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-electric/20 to-gold/20 text-electric border border-electric/30">
              <Plug className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-heading text-base font-semibold text-white">{connector.name}</h3>
              <span className="rounded bg-[#111827] border border-[#333333] px-1.5 py-0.2 font-mono text-[9px] font-bold text-white uppercase">
                {connector.method} REST Endpoint
              </span>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-[#111827] hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {isEditing ? (
          <form onSubmit={handleSaveEdit} className="space-y-3">
            <div className="grid grid-cols-[5rem_1fr] gap-2">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="rounded-lg border border-[#333333] bg-[#111827] px-2 py-2 text-xs text-white outline-none focus:border-electric"
              >
                {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-lg border border-[#333333] bg-[#111827] px-3 py-2 text-xs text-white placeholder:text-muted outline-none focus:border-electric"
                required
              />
            </div>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full rounded-lg border border-[#333333] bg-[#111827] px-3 py-2 font-mono text-xs text-white placeholder:text-muted outline-none focus:border-electric"
              required
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={authMode}
                onChange={(e) => setAuthMode(e.target.value as typeof authMode)}
                className="rounded-lg border border-[#333333] bg-[#111827] px-2.5 py-2 text-xs text-white outline-none focus:border-electric"
              >
                <option value="none">No auth</option>
                <option value="bearer">Bearer token</option>
                <option value="header">Custom header</option>
              </select>
              {authMode === "header" && (
                <input
                  type="text"
                  value={authHeaderName}
                  onChange={(e) => setAuthHeaderName(e.target.value)}
                  placeholder="Header name (e.g. X-Api-Key)"
                  className="rounded-lg border border-[#333333] bg-[#111827] px-2.5 py-2 text-xs text-white placeholder:text-muted outline-none focus:border-electric"
                />
              )}
            </div>
            {authMode !== "none" && (
              <input
                type="password"
                value={secretValue}
                onChange={(e) => setSecretValue(e.target.value)}
                placeholder="•••••••• (leave blank to keep current secret)"
                className="w-full rounded-lg border border-[#333333] bg-[#111827] px-3 py-2 font-mono text-xs text-white placeholder:text-muted outline-none focus:border-electric"
              />
            )}
            {error && <p className="text-xs text-crimson">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="rounded-lg border border-[#333333] bg-[#111827] px-3 py-1.5 text-xs text-muted hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="btn-primary-cta px-4 py-1.5 text-xs disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1" /> : null}
                Save Changes
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl border border-[#333333] bg-[#111827] p-3 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Endpoint URL</span>
              <p className="font-mono text-xs text-white break-all">{connector.url}</p>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={handleTest}
                disabled={testing}
                className="flex items-center gap-1.5 rounded-lg border border-[#333333] bg-[#111827] px-3 py-1.5 text-xs font-medium text-white hover:border-electric hover:text-electric transition-colors"
              >
                {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5 text-electric" />}
                <span>{testing ? "Testing Ping…" : "Test Endpoint"}</span>
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1 text-xs text-secondary hover:text-electric transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit Configuration
              </button>
            </div>

            {testResult && (
              <div className={`flex items-start gap-2 rounded-lg p-2.5 text-xs border ${testResult.ok ? "bg-emerald/10 text-emerald border-emerald/20" : "bg-crimson/10 text-crimson border-crimson/20"}`}>
                {testResult.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" /> : <XCircle className="h-4 w-4 shrink-0 mt-0.5" />}
                <span className="text-white">{testResult.message}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-[#333333]">
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className="flex items-center gap-1.5 text-xs text-crimson hover:underline"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete Connector
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#333333] bg-[#111827] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#1f2937] transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function N8nInspectorModal({
  config,
  health,
  onClose,
  onChanged,
}: {
  config: N8nConfig | null;
  health: N8nHealth;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [host, setHost] = useState(config?.host.value || "");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/vault/system/n8n", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: host.trim() || undefined, apiKey: apiKey.trim() || undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Failed to save n8n config.");
      setSaved(true);
      setApiKey("");
      onChanged();
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg rounded-2xl border border-[#333333] bg-[#0B1220] shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between pb-3 border-b border-[#333333]">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#EA4B71] to-[#FF6D5A] text-white shadow-sm">
              <Zap className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-heading text-base font-semibold text-white">n8n Automation Engine</h3>
              <div className="mt-0.5 flex items-center gap-2">
                <span
                  className={`flex items-center gap-1 text-[10px] font-semibold ${
                    health.status === "connected" ? "text-emerald" : "text-crimson"
                  }`}
                >
                  <span className="h-2 w-2 rounded-full bg-current animate-pulse" />
                  {health.status === "connected" ? `Online (${health.latencyMs ?? 0}ms)` : "Offline / Unreachable"}
                </span>
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-[#111827] hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-white">N8N_HOST URL</label>
            <input
              type="url"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="http://localhost:5678"
              className="mt-1 w-full rounded-lg border border-[#333333] bg-[#111827] px-3 py-2 font-mono text-xs text-white placeholder:text-muted outline-none focus:border-electric"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-white">N8N_API_KEY</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={config?.apiKey.configured ? "•••••••• (enter to replace existing key)" : "Paste API key from n8n Settings"}
              className="mt-1 w-full rounded-lg border border-[#333333] bg-[#111827] px-3 py-2 font-mono text-xs text-white placeholder:text-muted outline-none focus:border-electric"
            />
          </div>
          {err && <p className="text-xs text-crimson">{err}</p>}
          <div className="flex items-center justify-between pt-2">
            <a
              href={host || "http://localhost:5678"}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs text-electric hover:underline"
            >
              <span>Open Local n8n Dashboard</span>
              <ExternalLink className="h-3 w-3" />
            </a>
            <button
              type="submit"
              disabled={saving || (!host.trim() && !apiKey.trim())}
              className="btn-primary-cta flex items-center gap-1.5 px-4 py-2 text-xs disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : <Key className="h-3.5 w-3.5" />}
              <span>{saved ? "Saved!" : saving ? "Saving…" : "Save n8n Config"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NewCustomConnectorModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [method, setMethod] = useState("GET");
  const [url, setUrl] = useState("");
  const [authMode, setAuthMode] = useState<"none" | "bearer" | "header">("none");
  const [authHeaderName, setAuthHeaderName] = useState("");
  const [secretValue, setSecretValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          method,
          url,
          authMode,
          authHeaderName: authMode === "header" ? authHeaderName : undefined,
          secretValue: authMode !== "none" ? secretValue : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create custom connector.");
      } else {
        onCreated();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg rounded-2xl border border-[#333333] bg-[#0B1220] shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-[#333333]">
          <div className="flex items-center gap-2">
            <Plug className="h-5 w-5 text-electric" />
            <h3 className="font-heading text-base font-semibold text-white">Add Custom REST Connector</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-[#111827] hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleCreate} className="space-y-3.5">
          <div className="grid grid-cols-[5rem_1fr] gap-2">
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="rounded-lg border border-[#333333] bg-[#111827] px-2 py-2 text-xs text-white outline-none focus:border-electric"
            >
              {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Connector display label"
              className="rounded-lg border border-[#333333] bg-[#111827] px-3 py-2 text-xs text-white placeholder:text-muted outline-none focus:border-electric"
              required
            />
          </div>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://api.example.com/endpoint"
            className="w-full rounded-lg border border-[#333333] bg-[#111827] px-3 py-2 font-mono text-xs text-white placeholder:text-muted outline-none focus:border-electric"
            required
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={authMode}
              onChange={(e) => setAuthMode(e.target.value as typeof authMode)}
              className="rounded-lg border border-[#333333] bg-[#111827] px-2.5 py-2 text-xs text-white outline-none focus:border-electric"
            >
              <option value="none">No Auth</option>
              <option value="bearer">Bearer Token</option>
              <option value="header">Custom Header</option>
            </select>
            {authMode === "header" && (
              <input
                type="text"
                value={authHeaderName}
                onChange={(e) => setAuthHeaderName(e.target.value)}
                placeholder="Header (e.g. X-Api-Key)"
                className="rounded-lg border border-[#333333] bg-[#111827] px-2.5 py-2 text-xs text-white placeholder:text-muted outline-none focus:border-electric"
              />
            )}
          </div>
          {authMode !== "none" && (
            <input
              type="password"
              value={secretValue}
              onChange={(e) => setSecretValue(e.target.value)}
              placeholder="Secret / Key value"
              className="w-full rounded-lg border border-[#333333] bg-[#111827] px-3 py-2 font-mono text-xs text-white placeholder:text-muted outline-none focus:border-electric"
            />
          )}
          {error && <p className="text-xs text-crimson">{error}</p>}
          <div className="flex justify-end gap-2 pt-2 border-t border-[#333333]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#333333] bg-[#111827] px-4 py-2 text-xs text-muted hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !name.trim() || !url.trim()}
              className="btn-primary-cta flex items-center gap-1.5 px-4 py-2 text-xs disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              <span>Create Connector</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NewMcpServerModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<"stdio" | "http">("stdio");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [url, setUrl] = useState("");
  const [bearerToken, setBearerToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          transport,
          command: transport === "stdio" ? command : undefined,
          args: transport === "stdio" ? args.split(/\s+/).filter(Boolean) : undefined,
          url: transport === "http" ? url : undefined,
          bearerToken: transport === "http" ? bearerToken : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create MCP server.");
      } else {
        onCreated();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg rounded-2xl border border-[#333333] bg-[#0B1220] shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-[#333333]">
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5 text-electric" />
            <h3 className="font-heading text-base font-semibold text-white">Add MCP Server (Custom)</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-[#111827] hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleCreate} className="space-y-3.5">
          <div className="grid grid-cols-[7rem_1fr] gap-2">
            <select
              value={transport}
              onChange={(e) => setTransport(e.target.value as "stdio" | "http")}
              className="rounded-lg border border-[#333333] bg-[#111827] px-2 py-2 text-xs text-white outline-none focus:border-electric"
            >
              <option value="stdio">Local (stdio)</option>
              <option value="http">Remote (http)</option>
            </select>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Server display label"
              className="rounded-lg border border-[#333333] bg-[#111827] px-3 py-2 text-xs text-white placeholder:text-muted outline-none focus:border-electric"
              required
            />
          </div>
          {transport === "stdio" ? (
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="Command, e.g. npx"
                className="rounded-lg border border-[#333333] bg-[#111827] px-3 py-2 font-mono text-xs text-white placeholder:text-muted outline-none focus:border-electric"
                required
              />
              <input
                type="text"
                value={args}
                onChange={(e) => setArgs(e.target.value)}
                placeholder="Args, e.g. -y @vendor/mcp-server"
                className="rounded-lg border border-[#333333] bg-[#111827] px-3 py-2 font-mono text-xs text-white placeholder:text-muted outline-none focus:border-electric"
              />
            </div>
          ) : (
            <>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://... (MCP server URL)"
                className="w-full rounded-lg border border-[#333333] bg-[#111827] px-3 py-2 font-mono text-xs text-white placeholder:text-muted outline-none focus:border-electric"
                required
              />
              <input
                type="password"
                value={bearerToken}
                onChange={(e) => setBearerToken(e.target.value)}
                placeholder="Bearer token (optional)"
                className="w-full rounded-lg border border-[#333333] bg-[#111827] px-3 py-2 font-mono text-xs text-white placeholder:text-muted outline-none focus:border-electric"
              />
            </>
          )}
          {error && <p className="text-xs text-crimson">{error}</p>}
          <div className="flex justify-end gap-2 pt-2 border-t border-[#333333]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#333333] bg-[#111827] px-4 py-2 text-xs text-muted hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="btn-primary-cta flex items-center gap-1.5 px-4 py-2 text-xs disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              <span>Add Server</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Language-model provider & custom model connectors wrapper */
export function AiProvidersCard() {
  return <AiModelManager />;
}
