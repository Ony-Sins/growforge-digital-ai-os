import React from "react";
import { AppStateProvider } from "@/lib/appState";
import { getSession } from "@/lib/session";
import { SpatialCanvasWrapper } from "@/components/spatial/SpatialCanvasWrapper";

export default async function CanvasPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; panel?: string; tab?: string; tier?: "home" | "brain" | "dashboard" }>;
}) {
  await getSession();
  const initialLocation = await searchParams;
  const initialTier = initialLocation.tier || "brain";

  return (
    <AppStateProvider initialLocation={initialLocation}>
      <main className="relative w-screen h-screen overflow-hidden bg-[#070B14]">
        <SpatialCanvasWrapper initialTier={initialTier} />
      </main>
    </AppStateProvider>
  );
}
