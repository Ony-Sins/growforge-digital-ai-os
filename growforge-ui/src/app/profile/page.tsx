import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { ProfileDashboard } from "@/components/workspace/ProfileDashboard";
import { AgentDetailPanel } from "@/components/workspace/AgentDetailPanel";
import { PinPromptModal } from "@/components/workspace/PinPromptModal";
import { JobNotifier } from "@/components/workspace/JobNotifier";
import { AdminDrawer } from "@/components/workspace/AdminDrawer";
import { AppStateProvider } from "@/lib/appState";
import { getSession } from "@/lib/session";
import { Brain, ChevronRight, UserCircle } from "lucide-react";
import Link from "next/link";

export default async function ProfilePage() {
  const session = await getSession();

  return (
    <AppStateProvider>
      <div className="flex h-screen w-full overflow-hidden bg-app">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header user={session?.user ?? null} />
          <main className="flex-1 overflow-y-auto bg-app p-4 md:p-6">
            <div className="mx-auto max-w-6xl space-y-6">
              {/* Breadcrumb & Navigation */}
              <div className="flex items-center gap-2 text-xs text-secondary">
                <Link href="/" className="hover:text-navy">
                  Dashboard
                </Link>
                <ChevronRight className="h-3 w-3 text-muted" />
                <span className="font-semibold text-navy">Operator Memory Profile</span>
              </div>

              {/* Profile Dashboard */}
              <ProfileDashboard user={session?.user ?? null} />
            </div>
          </main>
        </div>
      </div>
      <AgentDetailPanel />
      <PinPromptModal />
      <JobNotifier />
      <AdminDrawer />
    </AppStateProvider>
  );
}
