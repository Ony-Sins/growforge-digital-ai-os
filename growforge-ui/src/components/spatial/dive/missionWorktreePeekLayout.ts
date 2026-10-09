import type { LayoutNode, WorktreeLayout } from "./missionWorktreeLayout";

/**
 * Deterministic Peek placement from the layout geometry only (no DOM measurement, no polling). The Peek hangs off the selected node on a short attachment
 * filament. Candidate sides are tried in a fixed order (right, left, below, above, with alignment variants); the first one that is inside the stage and
 * covers nothing (no node, gap marker, region or ambiguity marker other than the selected node's own ancestors) wins. If none is clear, a deterministic scan of
 * free space nearest the node is used; only if the stage is genuinely full does the least-overlapping candidate win and `crowded` say so.
 * On phones the Peek is a sheet in the flow: the layout reserved its slot under the selected row (layout.peekSlot) and it simply occupies it.
 */
export interface PeekPlacement {
  x: number; y: number; w: number; h: number;
  side: "right" | "left" | "below" | "above" | "free" | "slot" | "scroll";
  /** single column, or the wide two-column plane used when the single column has no clear spot. */
  variant: "single" | "double" | "triple";
  /** Attachment filament, in stage px: from the selected entity to the Peek edge. */
  attach: { from: { x: number; y: number }; to: { x: number; y: number } };
  /** Kept for diagnostics: always false now (a stage too small for any clear spot places the Peek below the content instead of over neighbours; see side "scroll"). */
  crowded: boolean;
  /** The size entry that was placed was the compact instrument (three instruments, one fact). */
  compact?: boolean;
}
interface Box { x: number; y: number; w: number; h: number }
const overlap = (a: Box, b: Box, margin = 0) => Math.max(0, Math.min(a.x + a.w + margin, b.x + b.w) - Math.max(a.x - margin, b.x)) * Math.max(0, Math.min(a.y + a.h + margin, b.y + b.h) - Math.max(a.y - margin, b.y));
const FILAMENT = 22, PAD = 12, BUS_CLEARANCE = 44;

export function placePeek(layout: WorktreeLayout, anchorNodeId: string, sizes: { w: number; h: number; variant: "single" | "double" | "triple"; compact?: boolean }[], markerAt?: { x: number; y: number }): PeekPlacement | null {
  const anchor = layout.nodes.find(n => n.id === anchorNodeId);
  if (!anchor) return null;
  if (layout.mode === "stack") {
    const slot = layout.peekSlot;
    if (!slot) return null;
    return { x: slot.x, y: slot.y, w: slot.w, h: slot.h, side: "slot", variant: "single", crowded: false, attach: { from: { x: slot.x + 14, y: slot.y - 6 }, to: { x: slot.x + 14, y: slot.y } } };
  }
  const byId = new Map(layout.nodes.map(n => [n.id, n]));
  // Only ancestors that GEOMETRICALLY contain the selected node (the Departments group) are exempt: a parent drawn elsewhere (the Graph's Departments hub) is a normal obstacle.
  const contains = (o: Box, i: Box) => o.x <= i.x + 1 && o.y <= i.y + 1 && o.x + o.w >= i.x + i.w - 1 && o.y + o.h >= i.y + i.h - 1;
  const ancestors = new Set<string>();
  for (let p = anchor.parentId ? byId.get(anchor.parentId) : undefined, n = 0; p && n < 6; p = p.parentId ? byId.get(p.parentId) : undefined, n++) if (contains(p, anchor)) ancestors.add(p.id);
  // Obstacles: everything drawn except the selected node and the containers it sits in (those necessarily lie under it).
  const obstacles: Box[] = [
    ...layout.nodes.filter((n: LayoutNode) => n.id !== anchor.id && !ancestors.has(n.id)),
    ...layout.gaps, ...layout.regions.map(r => ({ x: r.x, y: r.y, w: r.w, h: r.h })),
    ...layout.ambiguities.filter(m => m.nodeId !== anchor.id).map(m => ({ x: m.x - 9, y: m.y - 9, w: 18, h: 18 })),
  ];
  const keep: Box[] = [anchor, ...(markerAt ? [{ x: markerAt.x - 10, y: markerAt.y - 10, w: 20, h: 20 }] : [])];
  const W = layout.stage.width;
  const lowAnchor = anchor.y + anchor.h / 2 > layout.stage.height;
  const maxY = (lowAnchor ? layout.contentHeight : layout.stage.height) - PAD;
  const cx = anchor.x + anchor.w / 2, cy = anchor.y + anchor.h / 2;
  const f = (n: number) => Math.round(n * 10) / 10;
  // Filament: from the point of the selected entity facing the Peek to the nearest point of the Peek edge.
  const attachOf = (box: Box) => {
    const dx = box.x + box.w / 2 - cx, dy2 = box.y + box.h / 2 - cy;
    const horizontal = Math.abs(dx) * anchor.h >= Math.abs(dy2) * anchor.w;
    const from = horizontal ? { x: dx > 0 ? anchor.x + anchor.w : anchor.x, y: Math.min(Math.max(cy, box.y + 10), box.y + box.h - 10) } : { x: Math.min(Math.max(cx, box.x + 10), box.x + box.w - 10), y: dy2 > 0 ? anchor.y + anchor.h : anchor.y };
    const to = horizontal ? { x: dx > 0 ? box.x : box.x + box.w, y: from.y } : { x: from.x, y: dy2 > 0 ? box.y : box.y + box.h };
    return { from, to };
  };
  // A segment that crosses a drawn node is not a clean attachment (W7.2): the Peek then goes where its filament runs through open space.
  const crosses = (a: { x: number; y: number }, b: { x: number; y: number }, r: Box) => {
    let t0 = 0, t1 = 1; const dx = b.x - a.x, dy = b.y - a.y;
    for (const [p, q] of [[-dx, a.x - (r.x + 2)], [dx, r.x + r.w - 2 - a.x], [-dy, a.y - (r.y + 2)], [dy, r.y + r.h - 2 - a.y]] as const) {
      if (p === 0) { if (q < 0) return false; } else { const t = q / p; if (p < 0) { if (t > t1) return false; t0 = Math.max(t0, t); } else { if (t < t0) return false; t1 = Math.min(t1, t); } }
    }
    return t0 < t1;
  };
  const cost = (box: Box) => {
    const { from, to } = attachOf(box);
    return keep.reduce((a, k) => a + overlap(box, k, 4) * 4, 0) + obstacles.reduce((a, o) => a + overlap(box, o, 6) + (crosses(from, to, o) ? 5000 : 0), 0);
  };
  const finish = (box: Box, side: PeekPlacement["side"], variant: "single" | "double" | "triple", compact?: boolean): PeekPlacement => {
    const { from, to } = attachOf(box);
    return { ...(compact ? { compact: true } : {}), ...box, x: f(box.x), y: f(box.y), side, variant, crowded: false, attach: { from: { x: f(from.x), y: f(from.y) }, to: { x: f(to.x), y: f(to.y) } } };
  };
  for (const { w, h, variant, compact } of sizes) {
    if (h + 2 * PAD > maxY) continue; // taller than the stage itself: it can never sit clear, so a smaller variant is tried instead of clamping it into overlap / scroll
    const clampBox = (x: number, y: number): Box => ({ x: Math.min(Math.max(PAD, x), Math.max(PAD, W - w - PAD)), y: Math.min(Math.max(PAD, y), Math.max(PAD, maxY - h)), w, h });
    const candidates: { box: Box; side: PeekPlacement["side"] }[] = [];
    const dys = [0, anchor.h - h, (anchor.h - h) / 2];
    const dxs = [0, anchor.w - w, (anchor.w - w) / 2];
    // A selected node inside a container (the Departments group) starts its Peek beyond the container and the conduit bus that leaves it.
    const holders = [...ancestors].map(id => byId.get(id)!).filter(Boolean);
    const rightEdge = Math.max(anchor.x + anchor.w, ...holders.map(c => c.x + c.w)), leftEdge = Math.min(anchor.x, ...holders.map(c => c.x));
    const reach = holders.length ? BUS_CLEARANCE : 0;
    dys.forEach(dy => candidates.push({ box: clampBox(rightEdge + FILAMENT + reach, anchor.y + dy), side: "right" }));
    dys.forEach(dy => candidates.push({ box: clampBox(leftEdge - FILAMENT - reach - w, anchor.y + dy), side: "left" }));
    dxs.forEach(dx => candidates.push({ box: clampBox(anchor.x + dx, anchor.y + anchor.h + FILAMENT), side: "below" }));
    dxs.forEach(dx => candidates.push({ box: clampBox(anchor.x + dx, anchor.y - FILAMENT - h), side: "above" }));
    // Of the clear candidates, the one with the SHORTEST attachment wins (ties keep the fixed order): the instrument sits as close to its entity as the free space allows.
    const clearCandidates = candidates.filter(c => cost(c.box) === 0);
    const length = (box: Box) => { const { from, to } = attachOf(box); return Math.hypot(to.x - from.x, to.y - from.y); };
    const pick = clearCandidates.reduce<(typeof candidates)[number] | undefined>((best, c) => (!best || length(c.box) < length(best.box) - 0.5 ? c : best), undefined);
    if (pick) return finish(pick.box, pick.side, variant, compact);
    // Deterministic free-space scan, nearest to the selected node first.
    const scan: { box: Box; d: number }[] = [];
    for (let y = PAD; y <= maxY - h; y += 20) for (let x = PAD; x <= W - w - PAD; x += 20) scan.push({ box: { x, y, w, h }, d: Math.hypot(x + w / 2 - cx, y + h / 2 - cy) });
    scan.sort((a, b) => a.d - b.d || a.box.y - b.box.y || a.box.x - b.box.x);
    const clear = scan.find(s => cost(s.box) === 0);
    if (clear) return finish(clear.box, "free", variant, compact);
  }
  // No clear spot (W7.3): the stage never scrolls to reach the Peek. It takes the position inside the stage that covers the least of the drawn work (receded nodes sit under it),
  // nearest the entity first. Only a stage that is smaller than the Peek itself falls back to below the content.
  {
    const { w, h, variant, compact } = sizes[sizes.length - 1];
    if (h + 2 * PAD <= maxY && w + 2 * PAD <= W) {
      const overlapOnly = (box: Box) => keep.reduce((a, k) => a + overlap(box, k, 4) * 40, 0) + obstacles.reduce((a, o) => a + overlap(box, o, 0), 0);
      let best: { box: Box; c: number; d: number } | null = null;
      for (let y = PAD; y <= maxY - h; y += 10) for (let x = PAD; x <= W - w - PAD; x += 10) {
        const box = { x, y, w, h };
        if (keep.some(k => overlap(box, k, 4) > 0)) continue; // never over the selected entity itself
        const c = overlapOnly(box), d = Math.hypot(x + w / 2 - cx, y + h / 2 - cy);
        if (!best || c < best.c - 1 || (Math.abs(c - best.c) <= 1 && d < best.d)) best = { box, c, d };
      }
      if (best) return { ...finish(best.box, "free", variant, compact), crowded: true };
    }
  }
  const { w, h, variant } = sizes[0];
  const box: Box = { x: Math.min(Math.max(PAD, cx - 24), Math.max(PAD, W - w - PAD)), y: layout.contentHeight + 10, w, h };
  return finish(box, "scroll", variant);
}
