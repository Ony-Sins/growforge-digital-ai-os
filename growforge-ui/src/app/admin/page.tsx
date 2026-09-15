import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { TerminalConsole } from "@/components/workspace/TerminalConsole";
import { LogViewer } from "@/components/workspace/LogViewer";
import { IntegrationsHub } from "@/components/workspace/IntegrationsHub";
import { AgentDetailPanel } from "@/components/workspace/AgentDetailPanel";
import { PinPromptModal } from "@/components/workspace/PinPromptModal";
import { AdminDrawer } from "@/components/workspace/AdminDrawer";
import { AppStateProvider } from "@/lib/appState";
import { getSession } from "@/lib/session";
import { Lock, Shield, Terminal, ScrollText, KeyRound } from "lucide-react";
import Link from "next/link";

export default async function AdminPage() {
  const session = await getSession();
  const isOwner = session?.user?.role === "owner";

  return (
    <AppStateProvider>
      <div className="flex h-screen w-full overflow-hidden bg-app">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header user={session?.user ?? null} />
          <main className="flex-1 overflow-y-auto bg-app p-4 md:p-6">
            <div className="mx-auto max-w-7xl space-y-6">
              {/* Header Title Bar */}
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-white p-5 shadow-sm border border-slate-100">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy text-gold shadow-sm">
                    <Shield className="h-5 w-5" />
                  </span>
                  <div>
                    <h1 className="font-heading text-lg font-bold text-navy">Admin Console &amp; Developer Tools</h1>
                    <p className="text-xs text-secondary">
                      Permission-gated operations surface for Terminal, Execution Streams, and System Diagnostics.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-navy/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-navy">
                    {isOwner ? "Owner Mode Active" : "Restricted Role"}
                  </span>
                  <Link
                    href="/"
                    className="rounded-lg border border-border-metal bg-sunken px-3 py-1.5 text-xs font-medium text-secondary hover:bg-white hover:text-navy"
                  >
                    Back to Dashboard
                  </Link>
                </div>
              </div>

              {!isOwner ? (
                <div className="flex flex-col items-center justify-center rounded-2xl bg-white p-12 text-center shadow-sm border border-slate-100">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-50 p-4 shadow-sm border border-slate-100 ring-1 ring-gold/30">
                    <Lock className="h-8 w-8 text-gold" />
                  </div>
                  <h2 className="mt-4 font-heading text-xl font-bold text-navy">Owner Permission Required</h2>
                  <p className="mt-2 max-w-md text-sm text-secondary">
                    You are currently signed in as an employee. Access to execution logs, raw terminal commands, and system key vaults requires owner authorization.
                  </p>
                  <div className="mt-6">
                    <Link
                      href="/"
                      className="rounded-xl bg-navy px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-navy/90"
                    >
                      Return to Dashboard
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Operations Grid */}
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    {/* Terminal Section */}
                    <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-100">
                      <div className="mb-4 flex items-center justify-between border-b border-border-metal pb-3">
                        <div className="flex items-center gap-2">
                          <Terminal className="h-4 w-4 text-electric" />
                          <h2 className="font-heading text-sm font-semibold text-navy">Terminal Command Console</h2>
                        </div>
                        <span className="font-mono text-[11px] text-muted">Direct Agent Dispatch</span>
                      </div>
                      <TerminalConsole />
                    </div>

                    {/* Execution Logs Section */}
                    <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-100">
                      <div className="mb-4 flex items-center justify-between border-b border-border-metal pb-3">
                        <div className="flex items-center gap-2">
                          <ScrollText className="h-4 w-4 text-emerald" />
                          <h2 className="font-heading text-sm font-semibold text-navy">Live Execution Logs</h2>
                        </div>
                        <span className="font-mono text-[11px] text-muted">Filtered Stream</span>
                      </div>
                      <LogViewer />
                    </div>
                  </div>

                  {/* Integrations & Vault */}
                  <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-100">
                    <div className="mb-4 flex items-center justify-between border-b border-border-metal pb-3">
                      <div className="flex items-center gap-2">
                        <KeyRound className="h-4 w-4 text-electric" />
                        <h2 className="font-heading text-sm font-semibold text-navy">AI Providers &amp; Encrypted Vault</h2>
                      </div>
                      <span className="font-mono text-[11px] text-muted">AES-256-GCM Secure Storage</span>
                    </div>
                    <IntegrationsHub />
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
      <AgentDetailPanel />
      <PinPromptModal />
      <AdminDrawer />
    </AppStateProvider>
  );
}
