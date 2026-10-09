"use client";
import type { InnerCorePhase } from "./overviewCommandModel";
import type { NoraStageLevel } from "./noraStageModel";
import { NoraMorphField } from "./NoraMorphField";

/** The Overview's NORA slot. Every motion mode uses generated geometry; reduced motion renders a procedural still frame, never artwork. */
export function NoraStageField({ level, phase, onWake, quiet }: { level: NoraStageLevel; phase: InnerCorePhase; onWake: () => void; quiet?: boolean }) {
  return <NoraMorphField level={level} phase={phase} onWake={onWake} quiet={quiet} />;
}
