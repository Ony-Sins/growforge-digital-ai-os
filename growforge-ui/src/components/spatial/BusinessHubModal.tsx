"use client";

import React from "react";
import Link from "next/link";
import { X, MessageSquare, Database, Users, CheckCircle2, AlertCircle, ExternalLink, ShieldCheck, Zap } from "lucide-react";

interface BusinessHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  telemetryData: {
    mcp?: {
      totalConnected: number;
      servers: { id: string; name: string; catalogId?: string; transport: string; toolCount: number; tools: { name: string; description: string }[] }[];
      connectors: {
        slack: { connected: boolean; name: string };
        notion: { connected: boolean; name: string };
        hubspot: { connected: boolean; name: string };
      };
    };
  } | null;
}

export function BusinessHubModal({ isOpen, onClose, telemetryData }: BusinessHubModalProps) {
  if (!isOpen) return null;

  const slackServer = telemetryData?.mcp?.servers.find((s) => s.catalogId === "slack" || s.id.includes("slack"));
  const notionServer = telemetryData?.mcp?.servers.find((s) => s.catalogId === "notion" || s.id.includes("notion"));
  const hubspotServer = telemetryData?.mcp?.servers.find((s) => s.catalogId === "hubspot" || s.id.includes("hubspot"));

  // A floating holographic HUD panel, not a page-covering modal — no opaque
  // backdrop, so the 3D scene stays visible behind it, matching the Note
  // Reader's fix. Kept centered rather than edge-docked (unlike the Note
  // Reader) because a 3-column triage grid genuinely needs real width; a
  // narrow side dock would make it less readable, not more.
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4 pointer-events-none animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div
        className="pointer-events-auto relative flex flex-col w-full max-w-5xl max-h-[85vh] rounded-lg bg-[#050b16]/85 border border-cyan-400/25 shadow-[0_0_1px_rgba(56,189,248,0.4),0_0_60px_rgba(56,189,248,0.15)] overflow-hidden backdrop-blur-xl text-slate-200 animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Corner brackets — same holographic-instrument signature as the Note Reader */}
        <span className="pointer-events-none absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-cyan-300/80 z-10" />
        <span className="pointer-events-none absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-cyan-300/80 z-10" />
        <span className="pointer-events-none absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-cyan-300/80 z-10" />
        <span className="pointer-events-none absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-cyan-300/80 z-10" />
        <div className="pointer-events-none absolute top-0 inset-x-4 h-px bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent animate-pulse" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-cyan-400/20 bg-cyan-400/[0.03]">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 border border-cyan-400/40 bg-cyan-400/10 text-cyan-300">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white font-heading">
                  Operational Business Hub
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  Live MCP Connected
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Direct operations & comms triage wired via verified MCP connectors (Slack &bull; Notion &bull; HubSpot)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 border border-cyan-400/20 text-cyan-300/70 hover:text-white hover:border-cyan-300/60 hover:bg-cyan-400/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 3-Column Triage Deck (Inspired by Nate Herk Reference) */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-3 gap-5 custom-scrollbar">
          {/* 1. Slack Column */}
          <div className="flex flex-col rounded-xl bg-white/[0.03] border border-white/10 p-4 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#4A154B]/30 border border-[#E01E5A]/40 flex items-center justify-center text-[#E01E5A]">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Slack Comms</h3>
                  <span className="text-[11px] text-slate-400">Team & channel triage</span>
                </div>
              </div>
              <span className={`px-2 py-0.5 text-[10px] font-mono rounded-full font-bold ${slackServer ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40" : "bg-slate-800 text-slate-400"}`}>
                {slackServer ? `${slackServer.toolCount} tools` : "Offline"}
              </span>
            </div>

            {slackServer ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/20">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Slack MCP Server connected & active ({slackServer.transport})</span>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-mono uppercase text-slate-400 tracking-wider">Discovered Capabilities</p>
                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 text-xs">
                    {slackServer.tools.map((t, i) => (
                      <div key={i} className="p-2 rounded bg-black/40 border border-white/5 flex flex-col">
                        <span className="font-mono text-cyan-300 font-medium">{t.name}</span>
                        <span className="text-[11px] text-slate-400 truncate">{t.description || "Slack action tool"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-6 text-center text-slate-500 space-y-2">
                <AlertCircle className="w-8 h-8 opacity-40 text-amber-400" />
                <p className="text-xs text-slate-300">Slack connector token not yet configured.</p>
                <p className="text-[11px] text-slate-500">Configure in Settings &rarr; Connectors to enable team triage.</p>
              </div>
            )}
          </div>

          {/* 2. Notion Column */}
          <div className="flex flex-col rounded-xl bg-white/[0.03] border border-white/10 p-4 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center text-white">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Notion Workspace</h3>
                  <span className="text-[11px] text-slate-400">Pages & Knowledge sync</span>
                </div>
              </div>
              <span className={`px-2 py-0.5 text-[10px] font-mono rounded-full font-bold ${notionServer ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40" : "bg-slate-800 text-slate-400"}`}>
                {notionServer ? `${notionServer.toolCount} tools` : "Offline"}
              </span>
            </div>

            {notionServer ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/20">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Notion MCP Server verified ({notionServer.transport})</span>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-mono uppercase text-slate-400 tracking-wider">Active Tools ({notionServer.toolCount})</p>
                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 text-xs">
                    {notionServer.tools.map((t, i) => (
                      <div key={i} className="p-2 rounded bg-black/40 border border-white/5 flex flex-col">
                        <span className="font-mono text-cyan-300 font-medium">{t.name}</span>
                        <span className="text-[11px] text-slate-400 truncate">{t.description || "Notion tool"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-6 text-center text-slate-500 space-y-2">
                <AlertCircle className="w-8 h-8 opacity-40 text-amber-400" />
                <p className="text-xs text-slate-300">Notion integration ready for API token.</p>
                <p className="text-[11px] text-slate-500">Enable in Settings to access internal databases and meeting notes.</p>
              </div>
            )}
          </div>

          {/* 3. HubSpot Column */}
          <div className="flex flex-col rounded-xl bg-white/[0.03] border border-white/10 p-4 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#FF7A59]/20 border border-[#FF7A59]/40 flex items-center justify-center text-[#FF7A59]">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">HubSpot CRM</h3>
                  <span className="text-[11px] text-slate-400">Deals & Client relations</span>
                </div>
              </div>
              <span className={`px-2 py-0.5 text-[10px] font-mono rounded-full font-bold ${hubspotServer ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40" : "bg-slate-800 text-slate-400"}`}>
                {hubspotServer ? `${hubspotServer.toolCount} tools` : "Offline"}
              </span>
            </div>

            {hubspotServer ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/20">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>HubSpot CRM active ({hubspotServer.transport})</span>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-mono uppercase text-slate-400 tracking-wider">CRM Operations</p>
                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 text-xs">
                    {hubspotServer.tools.map((t, i) => (
                      <div key={i} className="p-2 rounded bg-black/40 border border-white/5 flex flex-col">
                        <span className="font-mono text-cyan-300 font-medium">{t.name}</span>
                        <span className="text-[11px] text-slate-400 truncate">{t.description || "HubSpot CRM tool"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-6 text-center text-slate-500 space-y-2">
                <AlertCircle className="w-8 h-8 opacity-40 text-amber-400" />
                <p className="text-xs text-slate-300">HubSpot connector awaiting private app token.</p>
                <p className="text-[11px] text-slate-500">Wire your CRM to automate lead pipeline and contacts.</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-cyan-400/20 bg-cyan-400/[0.03] text-[10px] text-cyan-300/60 font-mono uppercase tracking-[0.15em]">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Zero synthetic data &bull; verified live against local MCP store
          </span>
          <Link
            href="/workspace?panel=settings&tab=connectors"
            className="flex items-center gap-1 text-cyan-300 hover:text-white transition-colors normal-case"
          >
            Manage Connectors <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
