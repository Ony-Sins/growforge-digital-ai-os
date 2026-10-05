import type { InnerCorePhase } from "./overviewCommandModel";
import type { NoraStageLevel } from "./noraStageModel";

/**
 * NORA Morph Field: state → motion. Pure and tiny. The field is presence, never a chart: nothing here encodes a count,
 * rate or score. Motion states describe what NORA is doing, and each one changes how the filament topology MOVES
 * (deformation, reach, flow, convergence, flattening), never the whole object's size.
 */
export type NoraMorphState = "idle" | "listening" | "thinking" | "retrieving" | "speaking" | "presenting" | "executing" | "attention";

export const NORA_MORPH_STATES: readonly NoraMorphState[] = ["idle", "listening", "thinking", "retrieving", "speaking", "presenting", "executing", "attention"];

export interface NoraMorphParams {
  /** Local deformation amplitude (fraction of field extent). */
  amp: number;
  /** Time scale of the deformation. */
  speed: number;
  /** Filament reach: how far apart two nodes may be and still connect. */
  reach: number;
  /** Light pulses travelling along filaments (count scale). Only states that mean real activity use them. */
  flow: number;
  /** Maximum number of white-hot intersections. */
  hot: number;
  /** Pull of every node toward a focus node (retrieval gathers). */
  converge: number;
  /** Flattening of depth toward a plane facing the viewer (presenting lays the field out). */
  flat: number;
  /** Lean toward the viewer (attentive listening). */
  lean: number;
  /** Amplitude of a travelling wave driven by live audio energy (speaking). */
  wave: number;
  /** Hairline amber tint on a few filaments (attention). 0 = none. */
  warm: number;
  /** Overall luminance of filaments. */
  energy: number;
}

export const NORA_MORPH_PARAMS: Record<NoraMorphState, NoraMorphParams> = {
  idle:       { amp: 0.085, speed: 1.0, reach: 0.40, flow: 0,    hot: 6,  converge: 0,    flat: 0,    lean: 0,    wave: 0,    warm: 0,    energy: 0.85 },
  listening:  { amp: 0.07,  speed: 0.8, reach: 0.43, flow: 0,    hot: 7,  converge: 0,    flat: 0,    lean: 0.16, wave: 0.02, warm: 0,    energy: 1.0 },
  thinking:   { amp: 0.12,  speed: 1.9, reach: 0.49, flow: 0.35, hot: 10, converge: 0,    flat: 0,    lean: 0,    wave: 0,    warm: 0,    energy: 1.05 },
  retrieving: { amp: 0.09,  speed: 1.3, reach: 0.47, flow: 0.5,  hot: 9,  converge: 0.34, flat: 0,    lean: 0,    wave: 0,    warm: 0,    energy: 1.0 },
  speaking:   { amp: 0.1,   speed: 1.3, reach: 0.45, flow: 0,    hot: 8,  converge: 0,    flat: 0,    lean: 0.05, wave: 0.07, warm: 0,    energy: 1.05 },
  presenting: { amp: 0.06,  speed: 0.7, reach: 0.5,  flow: 0,    hot: 7,  converge: 0,    flat: 0.5,  lean: 0.08, wave: 0,    warm: 0,    energy: 1.1 },
  executing:  { amp: 0.1,   speed: 1.5, reach: 0.49, flow: 0.7,  hot: 11, converge: 0,    flat: 0,    lean: 0,    wave: 0,    warm: 0,    energy: 1.05 },
  attention:  { amp: 0.08,  speed: 0.9, reach: 0.40, flow: 0,    hot: 6,  converge: 0,    flat: 0,    lean: 0,    wave: 0,    warm: 0.85, energy: 0.9 },
};

/** Motion state from the Overview stage level and the live NORA conversation phase. `retrieving` has no live source yet. */
export function noraMorphState(level: NoraStageLevel, phase: InnerCorePhase): NoraMorphState {
  if (phase === "thinking") return "thinking";
  if (phase === "listening") return "listening";
  if (phase === "responding" || phase === "speaking") return "speaking";
  if (phase === "success") return "presenting";
  if (phase === "executing" || level === "executing") return "executing";
  if (phase === "awaiting" || level === "attention" || level === "critical") return "attention";
  return "idle";
}

/** Quiet baseline where the stage level is only a degraded/unknown reading: dimmer, no other change. */
export function noraMorphParams(state: NoraMorphState, level: NoraStageLevel): NoraMorphParams {
  const base = NORA_MORPH_PARAMS[state];
  return level === "unknown" || level === "degraded" ? { ...base, energy: base.energy * 0.85 } : base;
}
