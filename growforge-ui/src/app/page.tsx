import React from "react";
import { AppStateProvider } from "@/lib/appState";
import { getSession } from "@/lib/session";
import { SpatialCanvasWrapper } from "@/components/spatial/SpatialCanvasWrapper";
import { JobNotifier } from "@/components/workspace/JobNotifier";
import { SettingsOverlay } from "@/components/workspace/SettingsOverlay";
import { UserProfileOverlay } from "@/components/workspace/UserProfileOverlay";
import { VaultLibraryOverlay } from "@/components/workspace/VaultLibraryOverlay";
import { AgentRosterOverlay } from "@/components/workspace/AgentRosterOverlay";
import { AgentDetailPanel } from "@/components/workspace/AgentDetailPanel";
import { PinPromptModal } from "@/components/workspace/PinPromptModal";

/** The dashboard: the spatial canvas (Home → Brain → Dashboard tiers).
 *  Approvals and job-finished notices are mounted here too, so the
 *  propose-then-approve gate is reachable from the front page. */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tier?: "home" | "brain" | "dashboard" | "core"; panel?: string; tab?: string; job?: string }>;
}) {
  const session = await getSession();
  const { tier, panel, tab } = await searchParams;
  const initialTier = tier === "brain" || tier === "core" ? tier : "home";

  return (
    <AppStateProvider initialLocation={{ panel, tab }}>
      <main className="relative h-screen w-screen overflow-hidden bg-[#070B14]">
        <SpatialCanvasWrapper initialTier={initialTier} />
      </main>
      <JobNotifier />
      <SettingsOverlay />
      <UserProfileOverlay user={session?.user ?? null} />
      <VaultLibraryOverlay />
      <AgentRosterOverlay />
      <AgentDetailPanel />
      <PinPromptModal />
    </AppStateProvider>
  );
}
