/**
 * Workspace shell model (C8 / S1). PURE logic, no React, no lens knowledge: this file (and the rest of this folder) must never import from a lens (`dive/`, `workspace/`...).
 * A lens adapts itself to the shell; the shell never learns what a mission, an agent or a department is.
 *
 * The shell is a large, viewport-centred detail workspace layered ABOVE a lens: the lens underneath stays mounted with its geometry unchanged and is only made inert + dimmed. A companion (NORA)
 * stays interactive: it is a peer inside the workspace's focus scope, not an outsider to be locked.
 */

export type WorkspaceMode = "workspace" | "reading";
export interface Viewport { w: number; h: number }

/** Below `full` the workspace is a full-screen sheet; below `inset` it is inset with a small margin; below `centred` it is a wide centred panel; from `centred` up it is the large centred workspace. */
export const WORKSPACE_BREAKPOINTS = { full: 700, inset: 1024, centred: 1280 } as const;
/** Room kept free for the global shell: the top navigation, and the NORA companion (its input row + a little air) along the bottom. */
/** At 900px and below the companion sits higher (the app's `--dock-base` is 162px there), so more room is kept clear under the workspace. */
export const WORKSPACE_RESERVE = { top: 92, bottom: 104, compactBottom: 236, compactBelow: 900, sheetTop: 60 } as const;
export const WORKSPACE_MAX = { width: 1240, height: 880, readingWidth: 1360 } as const;

export interface WorkspaceGeometry {
  kind: "full" | "inset" | "wide" | "centred";
  left: number; top: number; width: number; height: number;
  /** Space the content keeps clear at the bottom so the companion never covers it (a full-screen sheet runs under the companion). */
  padBottom: number;
}
export function workspaceGeometry(v: Viewport, mode: WorkspaceMode = "workspace"): WorkspaceGeometry {
  const { w, h } = v;
  // the full-screen sheet starts below the app's own top bar (brand, settings): those controls stay reachable and never sit on top of the workspace's Close button
  if (w <= WORKSPACE_BREAKPOINTS.full) return { kind: "full", left: 0, top: WORKSPACE_RESERVE.sheetTop, width: w, height: h - WORKSPACE_RESERVE.sheetTop, padBottom: WORKSPACE_RESERVE.compactBottom };
  const reserveBottom = w <= WORKSPACE_RESERVE.compactBelow ? WORKSPACE_RESERVE.compactBottom : WORKSPACE_RESERVE.bottom;
  const top = WORKSPACE_RESERVE.top, avail = Math.max(320, h - top - reserveBottom);
  if (w < WORKSPACE_BREAKPOINTS.inset) return { kind: "inset", left: 12, top: Math.min(top, 84), width: w - 24, height: Math.max(320, h - Math.min(top, 84) - reserveBottom), padBottom: 0 };
  const max = mode === "reading" ? WORKSPACE_MAX.readingWidth : WORKSPACE_MAX.width;
  const width = Math.min(max, w - (w < WORKSPACE_BREAKPOINTS.centred ? 48 : 96)), height = Math.min(WORKSPACE_MAX.height, avail);
  return { kind: w < WORKSPACE_BREAKPOINTS.centred ? "wide" : "centred", left: Math.round((w - width) / 2), top, width, height, padBottom: 0 };
}

/* ------------------------------------------------------------------ closing */
export type CloseReason = "backdrop" | "escape" | "button" | "programmatic";
/** A close is only ever immediate when no consequential work is in flight; otherwise the shell asks first (the guard returns the sentence to show, or null). */
export function closeDecision(reason: CloseReason, guardMessage: string | null): { action: "close" } | { action: "confirm"; message: string } {
  if (reason === "programmatic" || !guardMessage) return { action: "close" };
  return { action: "confirm", message: guardMessage };
}
/** Escape peels one layer at a time: the discard confirmation, then reading mode, then the workspace. */
export function escapeStep(state: { mode: WorkspaceMode; confirming: boolean }): "dismiss-confirm" | "exit-reading" | "request-close" {
  return state.confirming ? "dismiss-confirm" : state.mode === "reading" ? "exit-reading" : "request-close";
}

/* ------------------------------------------------------------------ focus scope */
/** Tab moves through the workspace, then through the companion, then back: one scope, wrap-around. `index` -1 = focus is outside the scope. */
export function cycleFocus(count: number, index: number, backwards: boolean): number {
  if (count <= 0) return -1;
  if (index < 0) return backwards ? count - 1 : 0;
  return backwards ? (index - 1 + count) % count : (index + 1) % count;
}
export const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';

/* ------------------------------------------------------------------ rollout flag */
export const WORKSPACE_FLAG_KEY = "growforge.workspace";
/** The shell is the DEFAULT. It is switched off only on request: `?workspace=0` (also `off` / `false`) in the URL, or `growforge.workspace=0` in localStorage. The URL wins over storage, so `?workspace=1` re-enables it for a session that stored 0. */
const OFF = new Set(["0", "off", "false"]);
export function workspaceFlagFrom(search: string, stored: string | null): boolean {
  const q = new URLSearchParams(search).get("workspace");
  if (q !== null) return !OFF.has(q.toLowerCase());
  return !(stored !== null && OFF.has(stored.toLowerCase()));
}

/* ------------------------------------------------------------------ roving rail */
export function railTarget(count: number, index: number, key: string): number {
  if (count <= 0) return -1;
  if (key === "ArrowDown" || key === "ArrowRight") return (index + 1) % count;
  if (key === "ArrowUp" || key === "ArrowLeft") return (index - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return -1;
}
