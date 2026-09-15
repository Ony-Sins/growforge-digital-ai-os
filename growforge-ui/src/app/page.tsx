import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { Workspace } from "@/components/layout/Workspace";
import { AgentDetailPanel } from "@/components/workspace/AgentDetailPanel";
import { PinPromptModal } from "@/components/workspace/PinPromptModal";
import { JobNotifier } from "@/components/workspace/JobNotifier";
import { ApprovalBanner } from "@/components/workspace/ApprovalBanner";
import { ConsultationBanner } from "@/components/workspace/ConsultationBanner";
import { HITLDrawer } from "@/components/workspace/HITLDrawer";
import { AdminDrawer } from "@/components/workspace/AdminDrawer";
import { AppStateProvider } from "@/lib/appState";
import { getSession } from "@/lib/session";

export default async function Home() {
  // middleware.ts guarantees a session exists for every request that
  // reaches this page (real or, in development only, the auto-login
  // bypass — see src/lib/session.ts), so this is only for display
  // (avatar/email/role).
  const session = await getSession();

  return (
    <AppStateProvider>
      <div className="flex h-screen w-full overflow-hidden bg-app">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header user={session?.user ?? null} />
          <Workspace />
        </div>
      </div>
      <AgentDetailPanel />
      <PinPromptModal />
      <JobNotifier />
      <ApprovalBanner />
      {/* ConsultationBanner kept as lightweight fallback; HITLDrawer is the primary HITL surface */}
      <ConsultationBanner />
      <HITLDrawer />
      <AdminDrawer />
    </AppStateProvider>
  );
}
