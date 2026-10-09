/**
 * Which Mission Worktree layout fits the viewport. Pure.
 *
 *  graph  the large desktop composition (Mission Worktree with a reserved Workbench column).
 *  wide   the same Worktree at the narrower desktop width (>= 1180).
 *  stack  phones and small tablets: one vertical flow, the Workbench is an inline sheet under the selected row.
 *
 * Every mode reads the same models and the same selection state; only the arrangement differs.
 */
export type MissionLayoutMode = "graph" | "wide" | "stack";
export const GRAPH_MIN_WIDTH = 1366;
export const GRAPH_MIN_HEIGHT = 820;
export const WIDE_MIN_WIDTH = 1180;

export function missionLayoutFor(width: number, height: number): MissionLayoutMode {
  if (width >= GRAPH_MIN_WIDTH && height >= GRAPH_MIN_HEIGHT) return "graph";
  if (width >= WIDE_MIN_WIDTH) return "wide";
  return "stack";
}

/**
 * What a phone shows of the scope: the CURRENT depth first ("Step 5 · Brand & Growth Marketing" instead of "Mission / <title> / Brand & Growth Marketing · Step 5").
 * Display only: the complete address stays in the DOM (the text node every reader gets) and in title/data attributes; NORA's scope contract is untouched.
 */
export function compactScopeText(text: string): string {
  const parts = text.split(" / ");
  if (parts.length < 3) return text;
  const last = parts[parts.length - 1];
  const step = /^(.*) · (Step \d+)$/.exec(last);
  return step ? `${step[2]} · ${step[1]}` : last;
}
