import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { Workspace } from "@/components/layout/Workspace";
import { AgentDetailPanel } from "@/components/workspace/AgentDetailPanel";
import { PinPromptModal } from "@/components/workspace/PinPromptModal";
import { AppStateProvider } from "@/lib/appState";

export default function Home() {
  return (
    <AppStateProvider>
      <div className="flex h-screen w-full overflow-hidden bg-app">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header />
          <Workspace />
        </div>
      </div>
      <AgentDetailPanel />
      <PinPromptModal />
    </AppStateProvider>
  );
}
