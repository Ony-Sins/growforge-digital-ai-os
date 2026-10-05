"use client";

import React from "react";
import dynamic from "next/dynamic";
import type { ZoomTierName } from "./spatialGeometry";
import type { DiveLensId } from "@/lib/diveLenses";

const SpatialCanvasInternal = dynamic(
  () => import("./SpatialCanvas").then((m) => m.SpatialCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen w-screen items-center justify-center bg-[#070B14] text-cyan-400">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
          <span className="font-mono text-xs tracking-widest text-white/50">INITIALIZING 3D SPATIAL CANVAS...</span>
        </div>
      </div>
    ),
  }
);

interface SpatialCanvasWrapperProps {
  initialTier?: ZoomTierName;
  /** Set when the URL addresses a Dive lens: the canvas lands directly inside Dive In on that lens. */
  initialDiveLensId?: DiveLensId;
}

export function SpatialCanvasWrapper({ initialTier = "brain", initialDiveLensId }: SpatialCanvasWrapperProps) {
  return <SpatialCanvasInternal initialTier={initialTier} initialDiveLensId={initialDiveLensId} />;
}
