import type { DiveLens } from "./overviewModel";
import { missionLayoutFor } from "./missionFlowModel";

/**
 * One persistent Dive environment. Overview is the front layer of the SAME room; Missions is a deeper layer of it, not another page.
 * The shared environment (atmosphere + NORA) stays mounted across the lenses listed here and only changes depth. Other lenses join by being added
 * to this list once their content has been designed for it (they keep their own backdrop until then).
 *
 *   front   Overview: its own cards, heading and brief are present, NORA is the focal object.
 *   recede  Missions (mission selection field): the Overview layer dissolves, NORA stays alive, softer and deeper, behind the Mission Field.
 *   deep    Missions with a mission selected: NORA recedes one step further so the Mission Nucleus is the hero.
 */
export type SharedDepth = "front" | "recede" | "deep";

export const SHARED_ENVIRONMENT_LENSES: readonly DiveLens[] = ["Overview", "Missions"];

export function sharedDepth(lens: DiveLens, missionSelected: boolean): SharedDepth | null {
  if (!SHARED_ENVIRONMENT_LENSES.includes(lens)) return null;
  if (lens === "Overview") return "front";
  return missionSelected ? "deep" : "recede";
}

/** Timings (ms). The reduced-motion values replace the choreography with a very short opacity change. */
export const DIVE_TIMING = {
  /** How long the Mission layer stays mounted (fading, inert) while the Overview layer returns. */
  leave: 420,
  /** Selected stratum converging into the nucleus before the nucleus mounts. */
  pick: 420,
  /** When the selection is committed (the nucleus starts resolving): the stratum is still finishing its convergence, so the two overlap instead of leaving an empty beat. The Field lingers (inert) to let it finish. */
  handoff: 140,
  reducedLeave: 140,
  reducedPick: 0,
} as const;

/**
 * Spatial placement of a stratum in the Mission Field. Purely compositional: it depends on the stratum's position in the list and on nothing about the
 * mission (no importance, ordering or data is implied), and it is deterministic so server and client markup match.
 *   plane   0 = nearest, 2 = deepest: clarity, height and a few px of depth differ slightly
 *   offset  asymmetric horizontal shift (% of the corridor); left/width are clamped so a stratum never leaves the corridor
 *   slant   chamfer of the leading / trailing end (px): restrained perspective variation
 *   gap     extra negative space before the stratum: strata come in shallow groups of two or three
 *   catchAt where along the top seam the specular lobe sits (% of its length): it leans toward the centre, where NORA is
 */
export interface StrataPlacement { plane: 0 | 1 | 2; left: number; width: number; slantL: number; slantR: number; gap: number; catchAt: number }
const STRATA_PLAN: readonly { plane: 0 | 1 | 2; offset: number; width: number; slantL: number; slantR: number; gap: number }[] = [
  { plane: 0, offset: -3, width: 100, slantL: 12, slantR: 5, gap: 0 },
  { plane: 1, offset: 5, width: 93, slantL: 6, slantR: 11, gap: 0 },
  { plane: 0, offset: -5, width: 98, slantL: 11, slantR: 6, gap: 0 },
  { plane: 2, offset: 9, width: 88, slantL: 5, slantR: 10, gap: 18 },
  { plane: 1, offset: 1, width: 95, slantL: 9, slantR: 5, gap: 0 },
  { plane: 0, offset: -7, width: 99, slantL: 12, slantR: 7, gap: 18 },
  { plane: 2, offset: 6, width: 90, slantL: 6, slantR: 12, gap: 0 },
];
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export function strataPlacement(index: number): StrataPlacement {
  const slot = ((index % STRATA_PLAN.length) + STRATA_PLAN.length) % STRATA_PLAN.length;
  const { plane, offset, width, slantL, slantR, gap } = STRATA_PLAN[slot];
  return { plane, width, slantL, slantR, gap: index === 0 ? 0 : gap, left: clamp(50 - width / 2 + offset, 0, 100 - width), catchAt: clamp(50 - offset * 4, 18, 82) };
}

/** Where the Mission Nucleus (and everything anchored to it) sits, in percent of the shell height. Phase 12: 48 balances it between the compact header and the composer. */
export const MISSION_ANCHOR_TOP = 48;

/** Pixels a stratum travels (vertically) to reach the nucleus centre. */
export const pickTravel = (stratumCentreY: number, nucleusCentreY: number): number => Math.round(nucleusCentreY - stratumCentreY) || 0;

/**
 * Phase 14: where the selected stratum's trace converges, i.e. where the Mission Nucleus will actually resolve for the current viewport. The graph keeps the original
 * vertical-only travel (the nucleus is on the centre line); the responsive flows place the nucleus elsewhere (wide: the left column; stack: the hero below the compact header),
 * so those also get a horizontal component. Mirrors the CSS in MissionFlow.module.css; the numbers are the same clamp()s, evaluated for the viewport.
 */
export function convergencePoint(viewportWidth: number, viewportHeight: number, shell: { left: number; top: number; width: number; height: number }): { x: number; y: number; horizontal: boolean } {
  const layout = missionLayoutFor(viewportWidth, viewportHeight);
  const clampPx = (low: number, value: number, high: number) => Math.min(high, Math.max(low, value));
  if (layout === "graph") return { x: shell.left + shell.width / 2, y: shell.top + shell.height * (MISSION_ANCHOR_TOP / 100), horizontal: false };
  if (layout === "wide") {
    const inset = clampPx(20, viewportWidth * 0.03, 48), column = clampPx(210, viewportWidth * 0.18, 260), nucleus = clampPx(200, viewportWidth * 0.16, 236);
    return { x: shell.left + inset + column - nucleus / 2, y: shell.top + 206 + nucleus / 2, horizontal: true };
  }
  const nucleus = clampPx(176, viewportWidth * 0.48, 216);
  return { x: shell.left + shell.width / 2, y: shell.top + (viewportWidth <= 900 ? 192 : 206) + 4 + nucleus / 2, horizontal: true };
}
