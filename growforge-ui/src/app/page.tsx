import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { Workspace } from "@/components/layout/Workspace";
import { AgentDetailPanel } from "@/components/workspace/AgentDetailPanel";
import { ChatView } from "@/components/workspace/ChatView";
import { PinPromptModal } from "@/components/workspace/PinPromptModal";
import { JobNotifier } from "@/components/workspace/JobNotifier";
import { ApprovalBanner } from "@/components/workspace/ApprovalBanner";
import { HITLDrawer } from "@/components/workspace/HITLDrawer";
import { AdminDrawer } from "@/components/workspace/AdminDrawer";
import { AppStateProvider } from "@/lib/appState";
import { getSession } from "@/lib/session";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; panel?: string; tab?: string }>;
}) {
  // middleware.ts guarantees a session exists for every request that
  // reaches this page (real or, in development only, the auto-login
  // bypass — see src/lib/session.ts), so this is only for display
  // (avatar/email/role).
  const session = await getSession();
  const initialLocation = await searchParams;

  return (
    <AppStateProvider initialLocation={initialLocation}>
      <div className="flex h-screen w-full overflow-hidden bg-app">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header user={session?.user ?? null} />
          <Workspace user={session?.user ?? null} />
        </div>
      </div>
      <ChatView />
      <AgentDetailPanel />
      <PinPromptModal />
      <JobNotifier />
      <ApprovalBanner />
      <HITLDrawer />
      <AdminDrawer />
    </AppStateProvider>
  );
}
