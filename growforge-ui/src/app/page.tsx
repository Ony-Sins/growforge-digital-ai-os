import React from "react";
import { AppStateProvider } from "@/lib/appState";
import { getSession } from "@/lib/session";
import { isBetaMode } from "@/lib/beta/access";
import { SpatialCanvasWrapper } from "@/components/spatial/SpatialCanvasWrapper";
import { JobNotifier } from "@/components/workspace/JobNotifier";
import { SettingsOverlay } from "@/components/workspace/SettingsOverlay";
import { BetaByokOverlay } from "@/app/beta/BetaByokOverlay";
import { UserProfileOverlay } from "@/components/workspace/UserProfileOverlay";
import { VaultLibraryOverlay } from "@/components/workspace/VaultLibraryOverlay";
import { AgentRosterOverlay } from "@/components/workspace/AgentRosterOverlay";
import { AgentDetailPanel } from "@/components/workspace/AgentDetailPanel";
import { PinPromptModal } from "@/components/workspace/PinPromptModal";
import { parseSurfaceLocation } from "@/lib/surfaceLocation";

/** The dashboard: the spatial canvas (Home → Brain → Dashboard tiers).
 *  Approvals and job-finished notices are mounted here too, so the
 *  propose-then-approve gate is reachable from the front page. */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tier?: "home" | "brain" | "dashboard" | "core"; lens?: string; panel?: string; tab?: string; job?: string }>;
}) {
  const session = await getSession();
  const { tier, lens, panel, tab } = await searchParams;
  const initialTier = tier === "brain" || tier === "core" ? tier : "home";
  // The URL is the durable source of truth for the surface: a lens means Dive In on that lens (invalid lens → Overview).
  const location = parseSurfaceLocation({ tier, lens });
  const initialDiveLensId = location.surface === "dive" ? location.lensId : undefined;

  return (
    <AppStateProvider initialLocation={{ panel, tab }}>
      <main className="relative h-screen w-screen overflow-hidden bg-[#070B14]">
        <SpatialCanvasWrapper initialTier={initialDiveLensId ? "home" : initialTier} initialDiveLensId={initialDiveLensId} />
      </main>
      <JobNotifier />
      {/* Settings / Connections Hub: In beta mode, mount ONLY the isolated BYOK overlay */}
      {!isBetaMode() ? (
        <>
          <SettingsOverlay />
          <UserProfileOverlay user={session?.user ? { ...session.user, role: session.user.role === "owner" ? "owner" : "employee" } : null} />
          <VaultLibraryOverlay />
          <AgentRosterOverlay />
          <AgentDetailPanel />
          <PinPromptModal />
        </>
      ) : (
        <BetaByokOverlay testerEmail={session?.user?.email ?? "tester@growforge.ai"} />
      )}
    </AppStateProvider>
  );
}
