"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  CheckCircle2,
  KeyRound,
  ScrollText,
  Shield,
  Terminal,
  X,
  Zap,
} from "lucide-react";
import { useAppState } from "@/lib/appState";
import { TerminalConsole } from "@/components/workspace/TerminalConsole";
import { LogViewer } from "@/components/workspace/LogViewer";
import { agents } from "@/lib/agents";

export function AdminDrawer() {
  const {
    role,
    isAdminDrawerOpen,
    adminDrawerTab,
    openAdminDrawer,
    closeAdminDrawer,
  } = useAppState();

  const [activeTab, setActiveTab] = useState<"terminal" | "logs" | "diagnostics">(adminDrawerTab);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the locally-selected tab in response to the adminDrawerTab prop-like value changing, not derived render state
    setActiveTab(adminDrawerTab);
  }, [adminDrawerTab]);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isAdminDrawerOpen) {
        closeAdminDrawer();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAdminDrawerOpen, closeAdminDrawer]);

  if (!isAdminDrawerOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-navy/40 backdrop-blur-sm transition-opacity">
      {/* Backdrop click to close */}
      <div className="fixed inset-0" onClick={closeAdminDrawer} aria-hidden="true" />

      {/* Drawer panel */}
      <aside
        role="dialog"
        aria-label="Admin Drawer"
        className="relative z-10 flex h-full w-full max-w-3xl flex-col border-l border-border-metal bg-sunken/95 shadow-2xl backdrop-blur-2xl md:w-[700px] lg:w-[820px]"
      >
        {/* Header */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-border-metal bg-white/80 px-6 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-navy text-gold shadow-sm">
              <Shield className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-heading text-sm font-bold text-navy">Admin &amp; Dev Console</h2>
                <span className="rounded-full bg-navy/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-navy">
                  {role === "owner" ? "Owner Mode" : "Employee Mode"}
                </span>
              </div>
              <p className="text-[11px] font-mono text-muted">
                System Diagnostics • Raw Terminal • Execution Logs
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={closeAdminDrawer}
              aria-label="Close admin drawer"
              className="rounded-lg p-2 text-secondary transition-colors hover:bg-slate-100 hover:text-navy"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex shrink-0 items-center gap-2 border-b border-border-metal bg-white/60 px-6 py-2.5">
              <button
                type="button"
                onClick={() => {
                  setActiveTab("terminal");
                  openAdminDrawer("terminal");
                }}
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  activeTab === "terminal"
                    ? "bg-navy text-white shadow-sm"
                    : "text-secondary hover:bg-white hover:text-navy"
                }`}
              >
                <Terminal className="h-3.5 w-3.5" />
                Terminal Console
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("logs");
                  openAdminDrawer("logs");
                }}
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  activeTab === "logs"
                    ? "bg-navy text-white shadow-sm"
                    : "text-secondary hover:bg-white hover:text-navy"
                }`}
              >
                <ScrollText className="h-3.5 w-3.5" />
                Execution Logs
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("diagnostics");
                  openAdminDrawer("diagnostics");
                }}
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  activeTab === "diagnostics"
                    ? "bg-navy text-white shadow-sm"
                    : "text-secondary hover:bg-white hover:text-navy"
                }`}
              >
                <Activity className="h-3.5 w-3.5" />
                System Diagnostics
              </button>
            </div>

            {/* Tab content area */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6">
              {activeTab === "terminal" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-xl bg-[#111c34] p-3.5 shadow-sm border border-[#333333]">
                    <div className="flex items-center gap-2 text-xs text-secondary">
                      <Zap className="h-4 w-4 text-electric" />
                      <span>Direct agent invocation &amp; JSON payload dispatcher</span>
                    </div>
                    <span className="font-mono text-[11px] text-muted">Admin Mode Active</span>
                  </div>
                  <TerminalConsole />
                </div>
              )}

              {activeTab === "logs" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-xl bg-[#111c34] p-3.5 shadow-sm border border-[#333333]">
                    <div className="flex items-center gap-2 text-xs text-secondary">
                      <ScrollText className="h-4 w-4 text-emerald" />
                      <span>Live system stream with severity filtering</span>
                    </div>
                    <span className="font-mono text-[11px] text-muted">Auto-tail enabled</span>
                  </div>
                  <LogViewer />
                </div>
              )}

              {activeTab === "diagnostics" && <DiagnosticsPanel />}
            </div>
      </aside>
    </div>
  );
}

function DiagnosticsPanel() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-[#111c34] p-4 shadow-sm border border-[#333333]">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Agent Network</p>
          <p className="mt-2 font-heading text-2xl font-bold text-navy">{agents.length} Online</p>
          <p className="mt-1 text-[11px] text-emerald flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> All systems nominal
          </p>
        </div>

        <div className="rounded-xl bg-[#111c34] p-4 shadow-sm border border-[#333333]">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Encrypted Vault</p>
          <p className="mt-2 font-heading text-2xl font-bold text-navy">AES-256-GCM</p>
          <p className="mt-1 text-[11px] text-secondary">Master key authenticated</p>
        </div>

        <div className="rounded-xl bg-[#111c34] p-4 shadow-sm border border-[#333333]">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">RBAC Policy</p>
          <p className="mt-2 font-heading text-2xl font-bold text-navy">Creator / Owner</p>
          <p className="mt-1 text-[11px] text-secondary">Strict job revision gate</p>
        </div>
      </div>

      <div className="rounded-xl bg-[#111c34] p-5 shadow-sm border border-[#333333]">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-electric" />
          <h3 className="font-heading text-sm font-semibold text-navy">Security &amp; API Vault Status</h3>
        </div>
        <p className="mt-1 text-xs text-secondary">
          Credentials are fully encapsulated in server-side encrypted storage. No secrets reach the browser bundle.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-border-metal bg-sunken p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-navy">LLM Router Strategy</span>
              <span className="rounded-full bg-electric/10 px-2 py-0.5 text-[10px] font-semibold text-electric">
                Auto Failover
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted">Ollama (Local) → Gemini → Groq → Cloud Providers</p>
          </div>

          <div className="rounded-lg border border-border-metal bg-sunken p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-navy">Custom Connectors Guard</span>
              <span className="rounded-full bg-emerald/10 px-2 py-0.5 text-[10px] font-semibold text-emerald">
                SSRF Protected
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted">Private IPs, loopbacks &amp; cloud metadata blocked</p>
          </div>
        </div>
      </div>

    </div>
  );
}
