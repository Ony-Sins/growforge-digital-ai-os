import type { MissionLayoutMode } from "./missionFlowModel";
import type { StageBox, WorktreeLayout } from "./missionWorktreeLayout";

/**
 * Workbench instrument geometry (W5.2 / W5.2R). Pure, deterministic, derived only from the Worktree layout + the stage box (no DOM measurement, no polling).
 *
 * Two explicit composition modes, chosen by the Worktree's own layout mode (never by shrinking):
 *  - "side"  (desktop "graph" / "wide" modes, viewport >= 1180): the instrument stands in a reserved column of the stage. The Graph is laid out by the SAME
 *    W2 engine in the remaining stage (`graphStage`; tier 1 / 2 = progressively tighter node density, never smaller than 80 px nodes) and shifted clear of the instrument.
 *    The side is a function of the selected entity: the half of the yielded layout it sits in, so the attachment is short; the geometry mirrors when it flips.
 *  - "sheet" (the "stack" mode, viewport < 1180, phones included): no side column. The instrument is an inline sheet in the slot the Peek used, under the selected row.
 *
 * The instrument itself is three connected strata drawn as one SVG: the FRAME (identity header + section index rail, an L-shaped titanium-edged piece nearest the
 * entity), the READING plane (a darker, quieter inset that unfolds from the frame) and the JOINT (the socket where the attachment from the entity arrives).
 */
export type WorkbenchSide = "left" | "right";
export type WorkbenchMode = "side" | "sheet";
export const workbenchModeFor = (mode: MissionLayoutMode): WorkbenchMode => (mode === "stack" ? "sheet" : "side");

export const WORKBENCH = {
  /** Bounded reading instrument, not a column: ~31% of the root, 440..500 px, never below the floor. */
  minPlane: 440, maxPlane: 500, share: 0.31, floorPlane: 380,
  /** Narrowest yielded graph the tier-2 Graph can draw without collisions or clipping. */
  minGraph: 740,
  /** A yielded graph narrower than this uses tier-2 density (tier 1 above). */
  tier2Below: 870,
  /** Space kept between the yielded graph and the instrument (the attachment bridge crosses it). */
  gap: 8,
  /** Clear strip on the root's right edge so the scroll region's own scrollbar is never under the instrument. */
  scrollbar: 12,
  /** Inline sheet height bounds. */
  sheetMin: 360, sheetMax: 560,
  /** Strata metrics shared by the SVG and the CSS (passed to the CSS as variables). */
  chamfer: 14, head: 116, rail: 150, farInset: 10, bottomInset: 8, cut: 14, strip: 50, headPhone: 104,
  /** Narrower sheets than this use the horizontal index strip instead of the vertical rail. */
  railMinWidth: 600,
} as const;

export interface WorkbenchFootprint { planeW: number; tier: 1 | 2; /** The stage handed to layoutWorktree while the Workbench is open. */ graphStage: StageBox }
export function workbenchFootprint(stage: StageBox): WorkbenchFootprint {
  const spare = stage.width - WORKBENCH.gap - WORKBENCH.scrollbar;
  let planeW = Math.min(WORKBENCH.maxPlane, Math.max(WORKBENCH.minPlane, Math.round(stage.width * WORKBENCH.share)));
  if (spare - planeW < WORKBENCH.minGraph) planeW = Math.max(WORKBENCH.floorPlane, spare - WORKBENCH.minGraph);
  const graphW = Math.max(WORKBENCH.minGraph, spare - planeW);
  return { planeW, tier: graphW < WORKBENCH.tier2Below ? 2 : 1, graphStage: { width: graphW, height: stage.height } };
}
/** Height of the inline sheet: as tall as the stage allows after the selected row (the content region scrolls inside it), bounded. */
export const workbenchSheetHeight = (stage: StageBox) => Math.round(Math.max(WORKBENCH.sheetMin, Math.min(WORKBENCH.sheetMax, stage.height - 128)));

export interface WorkbenchPlacement {
  side: WorkbenchSide;
  /** Root coordinates (the instrument is a sibling of the scroll region, so it stays in view while the graph scrolls). */
  plane: { x: number; y: number; w: number; h: number };
  /** translateX applied to the yielded graph stage so it sits on the far side of the instrument. */
  graphOffset: number;
  /** Attachment bridge in STAGE coordinates (inside the scroll region): from the selected entity's facing edge to the instrument's joint. */
  attach: { x1: number; x2: number; y: number };
  /** The anchor's vertical centre in stage coordinates (the joint follows it, clamped to the instrument, from this). */
  anchorCy: number;
}

/** `layout` is the layout computed in `footprint.graphStage`; `stage` the full root box. */
export function placeWorkbench(layout: WorktreeLayout, anchorNodeId: string, stage: StageBox, footprint: WorkbenchFootprint): WorkbenchPlacement | null {
  const anchor = layout.nodes.find(n => n.id === anchorNodeId);
  if (!anchor) return null;
  const cx = anchor.x + anchor.w / 2, cy = anchor.y + anchor.h / 2;
  const side: WorkbenchSide = cx < layout.stage.width / 2 ? "left" : "right";
  const { planeW } = footprint;
  const plane = side === "left" ? { x: 0, y: 0, w: planeW, h: stage.height } : { x: stage.width - WORKBENCH.scrollbar - planeW, y: 0, w: planeW, h: stage.height };
  const graphOffset = side === "left" ? planeW + WORKBENCH.gap : 0;
  const attach = side === "left"
    ? { x1: anchor.x, x2: -WORKBENCH.gap, y: cy }
    : { x1: anchor.x + anchor.w, x2: layout.stage.width + WORKBENCH.gap, y: cy };
  return { side, plane, graphOffset, attach, anchorCy: cy };
}

/** Joint position inside the instrument (root y), clamped to the part of it a reader can see, so the socket never leaves the instrument. */
export const seamY = (anchorCy: number, scrollTop: number, planeH: number) => Math.round(Math.min(Math.max(anchorCy - scrollTop, 34), Math.max(34, planeH - 34)));

export type WorkbenchVariant = "rail" | "strip";
/** Vertical rail (desktop and wide sheets) or a horizontal strip (narrow sheets). */
export const workbenchVariant = (width: number, sheet: boolean): WorkbenchVariant => (sheet && width < WORKBENCH.railMinWidth ? "strip" : "rail");
export const headerHeight = (variant: WorkbenchVariant, sheet: boolean) => (sheet && variant === "strip" ? WORKBENCH.headPhone : WORKBENCH.head);

/**
 * The instrument's strata, in the NEAR = left drawing frame (the graph-facing edge is x = 0); the component mirrors the group for a left-hand instrument.
 * `frame` is an L (header across the top, rail down the near edge) whose header projects past the reading plane; `reading` is the inset plane with one controlled cut.
 * The edge paths are PARTIAL strokes (never a uniform border): a titanium near edge, a fading top edge, faint far / bevel lines and short specular catches.
 */
export function instrumentShape(w: number, h: number, variant: WorkbenchVariant, sheet: boolean) {
  const { chamfer: c, farInset: far, bottomInset: bot, cut, rail: R, strip: S } = WORKBENCH;
  const H = headerHeight(variant, sheet);
  const left = variant === "rail" ? R : 0, top = variant === "rail" ? H : H + S;
  const frame = variant === "rail"
    ? `M${c} 0H${w}V${H}H${R}V${h}H${c}L0 ${h - c}V${c}Z`
    : `M${c} 0H${w}V${top}H0V${c}Z`;
  const reading = `M${left} ${top}H${w - far}V${h - bot - cut}L${w - far - cut} ${h - bot}H${left}Z`;
  return {
    H, top, left, frame, reading,
    titanium: variant === "rail" ? `M${c + 18} 0H${c}L0 ${c}V${h - c}L${c} ${h}H${c + 18}` : `M${c + 18} 0H${c}L0 ${c}V${h}`,
    topEdge: `M${c + 20} 0.5H${w - 6}`,
    farEdge: `M${w - 0.5} 6V${H - 4}`,
    bevelTop: `M${left} ${top + 0.5}H${w - far}`,
    bevelSide: `M${left + 0.5} ${top}V${h - bot - 6}`,
    catches: [`M${c} 0.5H${c + 18}`, `M${w - far} ${h - bot - cut}L${w - far - cut} ${h - bot}`],
  };
}

/* ---------------------------------------------------------------------------------------------------------------- W6.2: Focus (the full-reading depth) */
/**
 * Focus geometry. Focus is the Workbench expanded outward, from the SAME side and the SAME seam, into a much larger reading field; it is never a modal or a drawer. The graph is NOT re-laid-out
 * (nodes keep the Workbench's positions): it is only nudged sideways so that the selected entity and its ownership ancestry stay in the strip Focus leaves free, and it is receded + inert by the view.
 * On phones (sheet mode) Focus is a dedicated full-width reader over the stage (no side column), so there is no placement to compute.
 */
export const FOCUS = {
  /** Share of the root, bounded: a reading instrument, not a page. */
  share: 0.62, minPlane: 720, maxPlane: 1100,
  /** The free strip beside Focus never gets narrower than this (it must still hold the selected entity). */
  minStrip: 340,
  /** Breathing room between the strip's edge and the lit nodes. */
  margin: 24,
  /** Comfortable measure of the reading column inside the instrument (px). */
  readingMax: 760,
  /** Strata: a thin near rim (where the joint sits), a header band, far / bottom insets. */
  rim: 22, head: 112,
} as const;

export function focusPlaneWidth(stage: StageBox): number {
  const cap = stage.width - WORKBENCH.scrollbar - FOCUS.minStrip;
  return Math.round(Math.max(WORKBENCH.minPlane, Math.min(FOCUS.maxPlane, Math.max(FOCUS.minPlane, stage.width * FOCUS.share), cap)));
}

export interface FocusPlacement extends Omit<WorkbenchPlacement, "plane"> {
  plane: { x: number; y: number; w: number; h: number };
  /** The root-coordinate strip Focus leaves free for the graph. */
  strip: { x0: number; x1: number };
  /** How far the old Workbench plane sits inside the new one, per side, so the growth can be drawn from it (clip-path only). */
  from: { top: number; right: number; bottom: number; left: number };
}

/** `layout` = the layout in the Workbench's graph stage (unchanged by Focus); `wb` = the Workbench placement; `litIds` = the selected entity + its ownership ancestry. */
export function placeFocus(layout: WorktreeLayout, anchorNodeId: string, litIds: ReadonlySet<string>, stage: StageBox, wb: WorkbenchPlacement): FocusPlacement | null {
  const anchor = layout.nodes.find(n => n.id === anchorNodeId);
  if (!anchor) return null;
  const w = focusPlaneWidth(stage), side = wb.side;
  const plane = side === "left" ? { x: 0, y: 0, w, h: stage.height } : { x: stage.width - WORKBENCH.scrollbar - w, y: 0, w, h: stage.height };
  const strip = side === "left" ? { x0: w + WORKBENCH.gap, x1: stage.width - WORKBENCH.scrollbar } : { x0: 0, x1: plane.x - WORKBENCH.gap };
  // The nodes that must stay readable: the whole lit ancestry when it fits the strip, else just the selected entity.
  const span = (nodes: { x: number; w: number }[]) => ({ x0: Math.min(...nodes.map(n => n.x)), x1: Math.max(...nodes.map(n => n.x + n.w)) });
  const lit = layout.nodes.filter(n => litIds.has(n.id));
  const room = strip.x1 - strip.x0 - 2 * FOCUS.margin;
  let box = lit.length ? span(lit) : span([anchor]);
  if (box.x1 - box.x0 > room) box = span([anchor]);
  const lo = strip.x0 + FOCUS.margin - box.x0, hi = strip.x1 - FOCUS.margin - box.x1;
  const graphOffset = Math.round(lo > hi ? lo : Math.min(Math.max(wb.graphOffset, lo), hi));
  const cy = anchor.y + anchor.h / 2;
  const attach = side === "left" ? { x1: anchor.x, x2: plane.x + plane.w - graphOffset, y: cy } : { x1: anchor.x + anchor.w, x2: plane.x - graphOffset, y: cy };
  const grow = w - wb.plane.w;
  const from = side === "left" ? { top: 0, right: grow, bottom: 0, left: 0 } : { top: 0, right: 0, bottom: 0, left: grow };
  return { side, plane, graphOffset, attach, anchorCy: cy, strip, from };
}

/** The Focus instrument's strata in the NEAR = left drawing frame (graph-facing edge at x = 0; the component mirrors it for a left-hand instrument): a slab with a header band and one inset reading field. */
export function focusShape(w: number, h: number, phone: boolean) {
  const { chamfer: c, farInset: far, bottomInset: bot, cut } = WORKBENCH;
  const H = FOCUS.head, near = phone ? 0 : FOCUS.rim, f = phone ? 0 : far, b = phone ? 0 : bot, k = phone ? 0 : cut;
  return {
    H, near,
    frame: `M${c} 0H${w}V${h}H${c}L0 ${h - c}V${c}Z`,
    reading: `M${near} ${H}H${w - f}V${h - b - k}${k ? `L${w - f - k} ${h - b}` : ""}H${near}Z`,
    titanium: `M${c + 18} 0H${c}L0 ${c}V${h - c}L${c} ${h}H${c + 18}`,
    topEdge: `M${c + 20} 0.5H${w - 6}`,
    farEdge: `M${w - 0.5} 6V${H - 4}`,
    bevelTop: `M${near} ${H + 0.5}H${w - f}`,
    bevelSide: `M${near + 0.5} ${H}V${h - b - 6}`,
    catches: [`M${c} 0.5H${c + 18}`, k ? `M${w - f} ${h - b - k}L${w - f - k} ${h - b}` : `M${w - 18} ${h - 0.5}H${w}`],
  };
}

/** Space under the contextual header and above the composer / lens rail (the Worktree root sits between them, so nothing here can overlap either). */
export function stageInsets(mode: MissionLayoutMode) { return mode === "stack" ? { top: 184, bottom: 168 } : mode === "wide" ? { top: 186, bottom: 176 } : { top: 140, bottom: 176 }; }
