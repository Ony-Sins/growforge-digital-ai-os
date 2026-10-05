import type { OverviewSnapshot } from "@/lib/overviewSnapshot";
import type { InnerCorePhase } from "./overviewCommandModel";

/**
 * How the NORA stage object (the temporary visual presence of the future NORA briefing / Morph Field) reacts to the
 * Overview Snapshot. Pure and tiny on purpose: it maps the snapshot's own status words to a handful of restrained
 * rendering parameters. It encodes no operational NUMBER (no counts, rates or scores); the object is presence, not a chart.
 */

export type NoraStageLevel = "unknown" | "idle" | "executing" | "degraded" | "attention" | "critical";

export interface NoraStageParams {
  /** Overall luminous energy of filaments and core (1 = idle baseline). */
  energy: number;
  /** Core breathing rate in Hz. Slow by design. */
  pulseHz: number;
  /** Fraction of connecting lines drawn (denser = more filament activity). */
  filament: number;
  /** Light pulses travelling along filaments. Only confirmed execution produces them. */
  travellers: number;
  /** 0 = pure cyan, 1 = fully warm: a hairline tint on the core halo for attention/critical. */
  warmth: number;
  /** Rotation speed multiplier. */
  drift: number;
}

const LEVEL_PARAMS: Record<NoraStageLevel, NoraStageParams> = {
  unknown: { energy: 0.7, pulseHz: 0.08, filament: 0.7, travellers: 0, warmth: 0, drift: 0.6 },
  idle: { energy: 0.9, pulseHz: 0.12, filament: 1, travellers: 0, warmth: 0, drift: 1 },
  executing: { energy: 1.2, pulseHz: 0.26, filament: 1, travellers: 14, warmth: 0, drift: 1.25 },
  degraded: { energy: 0.8, pulseHz: 0.1, filament: 0.8, travellers: 0, warmth: 0.14, drift: 0.85 },
  attention: { energy: 0.95, pulseHz: 0.16, filament: 1, travellers: 0, warmth: 0.26, drift: 1 },
  critical: { energy: 1.05, pulseHz: 0.2, filament: 1, travellers: 0, warmth: 0.5, drift: 1 },
};

/** The stage level, from the snapshot's own state words. */
export function noraStageLevel(snapshot: OverviewSnapshot | null): NoraStageLevel {
  if (!snapshot || snapshot.status.level === "unknown") return "unknown";
  if (snapshot.status.level === "critical") return "critical";
  if (snapshot.executingNow.missionIds.length > 0) return "executing";
  if (snapshot.status.level === "attention") {
    // Attention that is only unreachable services reads as degraded, not as work needing a decision.
    return snapshot.attention.every((item) => item.kind === "services.unreachable" || item.priority === "informational") ? "degraded" : "attention";
  }
  return "idle";
}

/** NORA conversation phases add a brief lift on top of the operational baseline. */
const CONVERSATION_LIFT: Partial<Record<InnerCorePhase, { energy: number; pulseHz: number }>> = {
  listening: { energy: 0.12, pulseHz: 0.1 }, thinking: { energy: 0.16, pulseHz: 0.2 }, responding: { energy: 0.14, pulseHz: 0.12 }, speaking: { energy: 0.18, pulseHz: 0.14 }, success: { energy: 0.2, pulseHz: 0.1 },
};

export function noraStageParams(level: NoraStageLevel, phase: InnerCorePhase = "idle"): NoraStageParams {
  const base = LEVEL_PARAMS[level];
  const lift = CONVERSATION_LIFT[phase];
  return lift ? { ...base, energy: base.energy + lift.energy, pulseHz: base.pulseHz + lift.pulseHz } : base;
}
