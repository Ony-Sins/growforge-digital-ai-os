"use client";

import { useState } from "react";
import {
  BarChart3,
  BookOpen,
  Bot,
  Brain,
  CheckCircle2,
  Cpu,
  CreditCard,
  ExternalLink,
  Key,
  Layers,
  Lock,
  Palette,
  Plug,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  User,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useAppState } from "@/lib/appState";
import { InterfaceAccessCard } from "@/components/workspace/InterfaceAccessCard";
import { IntegrationsHub } from "@/components/workspace/IntegrationsHub";
import { AiModelManager } from "@/components/workspace/AiModelManager";

interface SettingsCategory {
  id: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
  description: string;
}

interface SettingsGroup {
  title: string;
  items: SettingsCategory[];
}

const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    title: "General & Preferences",
    items: [
      {
        id: "account",
        label: "Account",
        icon: User,
        description: "Profile identity, workspace assignment, and authentication credentials.",
      },
      {
        id: "privacy",
        label: "Privacy & Security",
        icon: Shield,
        description: "Data boundary isolation, local vault encryption, and zero-retention rules.",
      },
      {
        id: "billing",
        label: "Billing & Plans",
        icon: CreditCard,
        description: "GrowForge Enterprise subscription, seat allocation, and resource quotas.",
      },
      {
        id: "usage",
        label: "Usage & Limits",
        icon: BarChart3,
        description: "Execution telemetry, job throughput, and active API dispatch volume.",
      },
    ],
  },
  {
    title: "Capabilities & Customization",
    items: [
      {
        id: "capabilities",
        label: "Core Capabilities",
        icon: Cpu,
        description: "Autonomous multi-agent orchestration, pipeline rules, and QA gates.",
      },
      {
        id: "memory",
        label: "Memory & Rules",
        icon: Brain,
        description: "Strategic preference weights, persona nuances, and brand guardrails.",
      },
      {
        id: "design-systems",
        label: "Design Systems",
        icon: Palette,
        description: "Command Deck visual tokens, typography hierarchy, and glass themes.",
      },
      {
        id: "skills",
        label: "Agent Skills",
        icon: BookOpen,
        description: "8 specialist department execution playbooks and autonomous directives.",
      },
      {
        id: "connectors",
        label: "Connectors & Plugins",
        icon: Plug,
        badge: "Unified",
        description: "Master hub for MCP tools, custom REST endpoints, and n8n workflows.",
      },
    ],
  },
  {
    title: "Platform & Developer",
    items: [
      {
        id: "ai-providers",
        label: "AI Models & API Keys",
        icon: Key,
        badge: "Active",
        description: "Cloud LLMs, private local Ollama/vLLM endpoints, and routing chains.",
      },
      {
        id: "developer",
        label: "Developer Settings",
        icon: SlidersHorizontal,
        description: "Simple vs. Advanced mode, Owner PIN unlocking, and terminal access.",
      },
    ],
  },
];

export function SettingsOverlay() {
  const { isSettingsOpen, closeSettings, openUserProfile, openAdminDrawer } = useAppState();
  const [activeCategoryId, setActiveCategoryId] = useState<string>("connectors");

  if (!isSettingsOpen) return null;

  const activeCategory =
    SETTINGS_GROUPS.flatMap((g) => g.items).find((i) => i.id === activeCategoryId) ||
    SETTINGS_GROUPS[1].items[4];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy/60 p-3 sm:p-5 backdrop-blur-md animate-in fade-in duration-200"
      onClick={closeSettings}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[88vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-border-metal bg-white/95 shadow-2xl backdrop-blur-xl animate-in zoom-in-95 duration-200"
      >
        {/* Left Multi-Tier Sidebar Rail */}
        <div className="hidden w-64 shrink-0 flex-col border-r border-border-metal bg-sunken/40 p-3.5 sm:flex overflow-y-auto">
          {/* Header */}
          <div className="flex items-center gap-2 px-2 pb-3 pt-1 border-b border-border-metal">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-navy text-white shadow-sm">
              <Bot className="h-4 w-4 text-electric" />
            </div>
            <div>
              <p className="font-heading text-xs font-semibold text-navy">Preferences & Hub</p>
              <p className="text-[10px] text-muted">GrowForge AI OS</p>
            </div>
          </div>

          {/* Grouped Categories */}
          <div className="mt-3 space-y-4">
            {SETTINGS_GROUPS.map((group) => (
              <div key={group.title} className="space-y-1">
                <span className="px-2.5 text-[10px] font-bold uppercase tracking-wider text-muted">
                  {group.title}
                </span>
                <ul className="space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = activeCategoryId === item.id;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => setActiveCategoryId(item.id)}
                          className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-all ${
                            active
                              ? "bg-white text-navy shadow-sm ring-1 ring-border-metal-strong font-semibold"
                              : "text-secondary hover:bg-white/60 hover:text-navy"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Icon
                              className={`h-4 w-4 shrink-0 ${
                                active ? "text-electric" : "text-muted"
                              }`}
                            />
                            <span className="truncate">{item.label}</span>
                          </div>
                          {item.badge && (
                            <span className="rounded bg-electric/10 text-electric px-1.5 py-0.2 text-[9px] font-bold uppercase shrink-0">
                              {item.badge}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Right Content Pane */}
        <div className="flex flex-1 flex-col overflow-hidden bg-white/60">
          {/* Top Header Bar */}
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-border-metal px-5 bg-white/80">
            <div className="flex items-center gap-2.5">
              <activeCategory.icon className="h-4 w-4 text-electric" />
              <div>
                <h1 className="font-heading text-sm font-semibold text-navy">{activeCategory.label}</h1>
                <p className="hidden md:block text-[11px] text-muted truncate max-w-md">
                  {activeCategory.description}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={closeSettings}
              aria-label="Close Settings"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-secondary hover:bg-sunken hover:text-navy transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Active Category Content Panel */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            {/* 1. Account */}
            {activeCategoryId === "account" && (
              <div className="space-y-4 max-w-3xl">
                <div className="glass-card rounded-xl p-5 border border-border-metal">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-navy text-white font-heading font-semibold text-lg border-2 border-electric/30">
                        GF
                      </div>
                      <div>
                        <h2 className="font-heading text-sm font-semibold text-navy">Workspace Operator</h2>
                        <p className="text-xs text-muted font-mono">anjum.ony96@gmail.com</p>
                        <span className="mt-1 inline-block rounded bg-gold/15 px-2 py-0.5 text-[9px] font-bold text-gold border border-gold/30">
                          PRIMARY OWNER
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        closeSettings();
                        openUserProfile();
                      }}
                      className="flex items-center gap-1.5 rounded-lg bg-electric px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-90 transition-all shrink-0"
                    >
                      <span>Open Full Profile & Bio</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="glass-card rounded-xl p-4 border border-border-metal space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Organization</span>
                    <p className="text-sm font-semibold text-navy">GrowForge Digital Systems</p>
                    <p className="text-xs text-secondary">Autonomous multi-agent marketing & AI operations workspace.</p>
                  </div>
                  <div className="glass-card rounded-xl p-4 border border-border-metal space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Session Status</span>
                    <p className="text-sm font-semibold text-emerald flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald animate-pulse" />
                      Active Secure Session
                    </p>
                    <p className="text-xs text-secondary">Protected by server-side vault session token.</p>
                  </div>
                </div>
              </div>
            )}

            {/* 2. Privacy & Security */}
            {activeCategoryId === "privacy" && (
              <div className="space-y-4 max-w-3xl">
                <div className="glass-card rounded-xl p-5 border border-border-metal space-y-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-emerald" />
                    <h2 className="font-heading text-sm font-semibold text-navy">Data Boundary & Vault Encryption</h2>
                  </div>
                  <p className="text-xs text-secondary leading-relaxed">
                    GrowForge Digital AI OS is engineered on a strict zero-retention boundary. Your API keys, client briefs, and database credentials are encrypted with AES-GCM and stored exclusively in your local isolated server vault.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
                    <div className="rounded-lg border border-border-metal bg-sunken/40 p-3 text-center">
                      <Lock className="mx-auto h-4 w-4 text-electric mb-1" />
                      <span className="block text-xs font-semibold text-navy">AES-GCM Encryption</span>
                      <span className="text-[10px] text-muted">Active Vault Shield</span>
                    </div>
                    <div className="rounded-lg border border-border-metal bg-sunken/40 p-3 text-center">
                      <CheckCircle2 className="mx-auto h-4 w-4 text-emerald mb-1" />
                      <span className="block text-xs font-semibold text-navy">Zero Training</span>
                      <span className="text-[10px] text-muted">Data never leaked to LLMs</span>
                    </div>
                    <div className="rounded-lg border border-border-metal bg-sunken/40 p-3 text-center">
                      <Cpu className="mx-auto h-4 w-4 text-gold mb-1" />
                      <span className="block text-xs font-semibold text-navy">Local Isolation</span>
                      <span className="text-[10px] text-muted">Supports Private Subnets</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 3. Billing & Plans */}
            {activeCategoryId === "billing" && (
              <div className="space-y-4 max-w-3xl">
                <div className="glass-card rounded-xl p-5 border border-border-metal">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <span className="rounded bg-electric/15 text-electric px-2 py-0.5 text-[10px] font-bold uppercase border border-electric/30">
                        ENTERPRISE TIER
                      </span>
                      <h2 className="mt-2 font-heading text-base font-semibold text-navy">GrowForge AI OS Workspace</h2>
                      <p className="text-xs text-secondary">Unlimited multi-department agent pipelines and custom model connectors.</p>
                    </div>
                    <div className="text-right sm:text-right">
                      <span className="text-xs text-muted">Plan Billing</span>
                      <p className="font-heading text-lg font-bold text-navy">Active</p>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-border-metal">
                    <div className="p-2">
                      <span className="text-[10px] font-bold text-muted uppercase">Departments</span>
                      <p className="text-sm font-semibold text-navy">8 Specialists Active</p>
                    </div>
                    <div className="p-2">
                      <span className="text-[10px] font-bold text-muted uppercase">Local LLM Connectors</span>
                      <p className="text-sm font-semibold text-navy">Unlimited Private</p>
                    </div>
                    <div className="p-2">
                      <span className="text-[10px] font-bold text-muted uppercase">Agent Roster</span>
                      <p className="text-sm font-semibold text-navy">279 Cataloged</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 4. Usage & Limits */}
            {activeCategoryId === "usage" && (
              <div className="space-y-4 max-w-3xl">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="glass-card rounded-xl p-4 border border-border-metal">
                    <span className="text-[10px] font-bold uppercase text-muted">Active Pipeline Jobs</span>
                    <p className="mt-1 font-heading text-2xl font-bold text-navy">100%</p>
                    <p className="mt-0.5 text-[11px] text-emerald font-medium">Telemetry Operational</p>
                  </div>
                  <div className="glass-card rounded-xl p-4 border border-border-metal">
                    <span className="text-[10px] font-bold uppercase text-muted">Router Dispatch Latency</span>
                    <p className="mt-1 font-heading text-2xl font-bold text-electric">~140ms</p>
                    <p className="mt-0.5 text-[11px] text-secondary">Dynamic multi-provider failover</p>
                  </div>
                  <div className="glass-card rounded-xl p-4 border border-border-metal">
                    <span className="text-[10px] font-bold uppercase text-muted">Encrypted Vault Storage</span>
                    <p className="mt-1 font-heading text-2xl font-bold text-navy">Optimal</p>
                    <p className="mt-0.5 text-[11px] text-secondary">Zero credential leakage</p>
                  </div>
                </div>
              </div>
            )}

            {/* 5. Core Capabilities */}
            {activeCategoryId === "capabilities" && (
              <div className="space-y-4 max-w-3xl">
                <div className="glass-card rounded-xl p-5 border border-border-metal space-y-3">
                  <div className="flex items-center gap-2">
                    <Layers className="h-5 w-5 text-electric" />
                    <h2 className="font-heading text-sm font-semibold text-navy">Autonomous Pipeline Architecture</h2>
                  </div>
                  <p className="text-xs text-secondary leading-relaxed">
                    GrowForge orchestrates marketing, development, and growth operations through a standardized 7-phase execution funnel:
                  </p>
                  <ol className="mt-3 space-y-2 border-l-2 border-electric/30 pl-4 text-xs">
                    <li>
                      <span className="font-semibold text-navy">1. Client Brief Intake:</span> Structured goal extraction and parameter validation.
                    </li>
                    <li>
                      <span className="font-semibold text-navy">2. GrowForge HQ Planning:</span> Strategic scoping and specialist assignment.
                    </li>
                    <li>
                      <span className="font-semibold text-navy">3. Live Research Engine:</span> Grounded market, competitive, and technical data gathering.
                    </li>
                    <li>
                      <span className="font-semibold text-navy">4. Parallel Department Execution:</span> Concurrent execution across assigned domains.
                    </li>
                    <li>
                      <span className="font-semibold text-navy">5. Cross-Team Reconciliation:</span> Harmonization of cross-departmental deliverables.
                    </li>
                    <li>
                      <span className="font-semibold text-navy">6. Quality Assurance Gate:</span> Strict criteria verification and compliance check.
                    </li>
                    <li>
                      <span className="font-semibold text-navy">7. Final Deliverable:</span> Human-in-the-loop signoff and approval dispatch.
                    </li>
                  </ol>
                </div>
              </div>
            )}

            {/* 6. Memory & Rules */}
            {activeCategoryId === "memory" && (
              <div className="space-y-4 max-w-3xl">
                <div className="glass-card rounded-xl p-5 border border-border-metal space-y-3">
                  <div className="flex items-center gap-2">
                    <Brain className="h-5 w-5 text-electric" />
                    <h2 className="font-heading text-sm font-semibold text-navy">Persistent Memory Layers</h2>
                  </div>
                  <p className="text-xs text-secondary">
                    Your persona guidelines, hard brand rejections, and strategic nuances are injected into every agent prompt cycle.
                  </p>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        closeSettings();
                        openUserProfile();
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-electric to-gold px-4 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90"
                    >
                      <Brain className="h-3.5 w-3.5" />
                      <span>Manage Memory in Profile Dashboard</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 7. Design Systems */}
            {activeCategoryId === "design-systems" && (
              <div className="space-y-4 max-w-3xl">
                <div className="glass-card rounded-xl p-5 border border-border-metal space-y-3">
                  <div className="flex items-center gap-2">
                    <Palette className="h-5 w-5 text-electric" />
                    <h2 className="font-heading text-sm font-semibold text-navy">The Command Deck Design System</h2>
                  </div>
                  <p className="text-xs text-secondary">
                    GrowForge AI OS is styled with a bespoke dark/navy glassmorphic theme designed for maximum clarity, focus, and visual depth.
                  </p>
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="rounded-lg bg-[#0B132B] p-3 text-white text-center">
                      <span className="block text-xs font-semibold">Deep Navy</span>
                      <span className="text-[10px] text-gray-400 font-mono">#0B132B</span>
                    </div>
                    <div className="rounded-lg bg-electric p-3 text-white text-center">
                      <span className="block text-xs font-semibold">Instrument Blue</span>
                      <span className="text-[10px] text-blue-100 font-mono">#3B82F6</span>
                    </div>
                    <div className="rounded-lg bg-gold p-3 text-navy text-center font-semibold">
                      <span className="block text-xs font-semibold">Earned Gold</span>
                      <span className="text-[10px] text-navy font-mono">#F59E0B</span>
                    </div>
                    <div className="rounded-lg bg-emerald p-3 text-white text-center">
                      <span className="block text-xs font-semibold">Live Emerald</span>
                      <span className="text-[10px] text-emerald-100 font-mono">#10B981</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 8. Agent Skills */}
            {activeCategoryId === "skills" && (
              <div className="space-y-4 max-w-3xl">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { name: "Paid Media & Performance Ads", dept: "meta-ads", tools: "ROAS targeting, campaign briefs" },
                    { name: "Creative Strategy & Copywriting", dept: "creative", tools: "Angle matrix, hooks, headlines" },
                    { name: "Technical SEO & Schema", dept: "seo", tools: "SERP analysis, content clusters" },
                    { name: "AI Systems & Automation", dept: "ai-systems", tools: "n8n webhooks, MCP dispatch" },
                    { name: "Web Design & Conversion UX", dept: "web-design", tools: "Wireframes, layout audits" },
                    { name: "Client Success & Ops", dept: "client-success", tools: "SOWs, meeting agendas, deliverables" },
                  ].map((s) => (
                    <div key={s.dept} className="glass-card rounded-xl p-3.5 border border-border-metal space-y-1">
                      <h3 className="text-xs font-semibold text-navy">{s.name}</h3>
                      <p className="text-[11px] text-secondary font-mono">{s.dept}</p>
                      <p className="text-[11px] text-muted">{s.tools}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 9. Unified Connectors & Plugins Hub */}
            {activeCategoryId === "connectors" && <IntegrationsHub />}

            {/* 10. AI Models & API Keys */}
            {activeCategoryId === "ai-providers" && <AiModelManager />}

            {/* 11. Developer Settings */}
            {activeCategoryId === "developer" && (
              <div className="space-y-4 max-w-3xl">
                <InterfaceAccessCard />
                <div className="glass-card rounded-xl p-5 border border-border-metal space-y-3">
                  <div className="flex items-center gap-2">
                    <Terminal className="h-4 w-4 text-electric" />
                    <h3 className="font-heading text-sm font-semibold text-navy">Developer Tools & Terminal</h3>
                  </div>
                  <p className="text-xs text-secondary">
                    Access system execution logs, real-time command terminal, and router telemetry via the Admin Drawer.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      closeSettings();
                      openAdminDrawer("terminal");
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border-metal bg-white px-3.5 py-2 text-xs font-medium text-navy hover:border-electric/50 hover:bg-electric/5 transition-all"
                  >
                    <Terminal className="h-3.5 w-3.5 text-electric" />
                    <span>Open Admin Console & Logs</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
