import React from "react";
import { AppStateProvider } from "@/lib/appState";
import { getSession } from "@/lib/session";
import { SpatialCanvasWrapper } from "@/components/spatial/SpatialCanvasWrapper";
import { ApprovalBanner } from "@/components/workspace/ApprovalBanner";
import { JobNotifier } from "@/components/workspace/JobNotifier";

/** The dashboard: the spatial canvas (Home → Brain → Dashboard tiers).
 *  Approvals and job-finished notices are mounted here too, so the
 *  propose-then-approve gate is reachable from the front page. */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tier?: "home" | "brain" | "dashboard" | "core" }>;
}) {
  await getSession();
  const { tier } = await searchParams;
  const initialTier = tier === "home" || tier === "brain" || tier === "dashboard" || tier === "core" ? tier : "dashboard";

  return (
    <AppStateProvider initialLocation={{}}>
      <main className="relative h-screen w-screen overflow-hidden bg-[#070B14]">
        <SpatialCanvasWrapper initialTier={initialTier} />
      </main>
      <JobNotifier />
      <ApprovalBanner />
    </AppStateProvider>
  );
}
