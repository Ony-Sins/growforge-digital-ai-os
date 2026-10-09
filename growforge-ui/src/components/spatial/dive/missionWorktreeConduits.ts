import type { MissionWorktree } from "./missionWorktree";
import { activePhaseKey, ancestryOf, type LayoutEdge, type LayoutRelation, type WorktreeLayout, type WorktreeView } from "./missionWorktreeLayout";

/**
 * W3: the GrowForge signal conduit system as a PURE plan. Geometry (nodes) is W2's and is never changed here; this module decides how each recorded
 * relationship is drawn (filament / optical sheath / junctions / arrowheads) and, separately, which conduits may carry motion.
 *
 * W5.4B motion model (three optical states, truth-ordered):
 *   A idle structure             static. No ambient motion.
 *   B selection / focus          ONE slim packet per conduit on the path (ancestry + incoming dependencies, capped), then it stops. On a conduit whose target is
 *                                recorded blocked/error the one-shot is a "stall": it travels part-way, fades, and does not arrive.
 *   C flow
 *     executor-confirmed live    repeating packets (short period, tail), ONLY on conduits whose target is recorded-ACTIVE while the Mission has executor
 *                                confirmation. (Per-step executor evidence does not exist: Mission-level confirmation + a recorded-active target.)
 *     recorded-running           NO autonomous or repeating movement at all (recorded activity is not execution): static dotted conduit + hollow seat only. It may
 *                                receive the ordinary one-shot selection packet, because that represents the user's inspection, not execution.
 *     blocked / error            no autoplay: static interrupted conduit (segmented) + a fault seat; the stall one-shot runs only when it is selected.
 *     completed / pending        static.
 *   Ambiguous dependency         no conduit exists (W2 draws none); the marker stays the truth (it gets its own one-shot, in the view).
 *   Reduced motion / phones      no packets at all; every state keeps its STATIC emphasis (overlay style + seats), so nothing depends on motion.
 * Nothing here reads progress to infer success or liveness.
 */
export type ConduitRole = "idle" | "path" | "receded";
export type ConduitTone = "settled" | "alert" | "recorded-active" | "quiet";
export type ConduitLevel = "full" | "light" | "minimal";

export interface ConduitSegment {
  edgeId: string; relation: LayoutRelation; from: string; to: string;
  d: string; role: ConduitRole; tone: ConduitTone;
  start: { x: number; y: number }; end: { x: number; y: number };
  /** Graph fan only (C3): 0 at the reference end, 1 at the farthest sibling; drives the depth fade. */
  fade: number;
  /** Graph fan only (C3): this conduit is on the selected route (the core -> active phase conduit, and the ancestry of the selection). */
  route: boolean;
}
export type JunctionKind = "fan-out" | "selected" | "live" | "socket" | "fault";
/** `socket`: a small seat where a path / recorded-active conduit meets a node; `fault`: the seat of a conduit into a recorded blocked/error node. */
export interface ConduitJunction { id: string; kind: JunctionKind; x: number; y: number; tone: ConduitTone; role: ConduitRole; edgeIds: string[] }
export interface ConduitPacket {
  /** Stable per conduit; selection packets are re-keyed by the pulse serial so a re-selection replays once. */
  id: string; edgeId: string; d: string; kind: "selection" | "live" | "stall";
  /** Selection: position along the path (ancestors first). Live: stagger index. */
  order: number; delayMs: number; durationMs: number; repeats: boolean;
}
export interface ConduitPlan {
  view: WorktreeView; level: ConduitLevel; segments: ConduitSegment[]; junctions: ConduitJunction[]; packets: ConduitPacket[];
  /** Mission-level executor confirmation, so static emphasis (reduced motion, phones) can still tell live from recorded. */
  liveConfirmed: boolean;
}
export interface ConduitInput {
  layout: WorktreeLayout; worktree: MissionWorktree;
  /** The selected entity (drives path/receded roles). */
  selectedId: string | null;
  /** The entity whose selection or keyboard focus just happened, with a serial that increments on every such event (drives the one-shot packet). */
  pulse: { subject: string | null; serial: number; view: WorktreeView } | null;
  reducedMotion: boolean;
}

const STYLE_BASE = { selectionMs: 820, selectionStaggerMs: 300, maxSelectionPackets: 5, stallMs: 900, liveMs: 3400, liveStaggerMs: 520, maxLivePackets: 12 } as const;
export const CONDUIT_TIMING = STYLE_BASE;

const f = (n: number) => Math.round(n * 10) / 10;
/** First and last point of a layout path ("M x y ... x y"), for edges whose geometry W2 supplies. */
export function pathEnds(d: string): { start: { x: number; y: number }; end: { x: number; y: number } } {
  const nums = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  return { start: { x: nums[0] ?? 0, y: nums[1] ?? 0 }, end: { x: nums[nums.length - 2] ?? 0, y: nums[nums.length - 1] ?? 0 } };
}
export function planConduits(input: ConduitInput): ConduitPlan {
  const { layout, worktree } = input;
  const view = layout.view, stack = layout.mode === "stack";
  const level: ConduitLevel = stack ? "minimal" : layout.mode === "wide" ? "light" : "full";
  const nodes = new Map(layout.nodes.map(n => [n.id, n]));
  const allLines = layout.edges.filter((e): e is LayoutEdge => e.rendering === "line" && nodes.has(e.from) && nodes.has(e.to));

  // ---- roles: what the selection makes dominant (the rest recedes, never vanishes)
  // The Mission at rest is "nothing selected": it must not recede the whole graph.
  // C1: an entity the Graph does not draw (a step: the columnar Graph has no third column) is represented by its nearest drawn ancestor, so its ancestry still lights up.
  const drawnOf = (id: string | null): string | null => { if (!id) return null; if (nodes.has(id)) return id; const chain = ancestryOf(worktree, id); for (let i = chain.length - 1; i >= 0; i--) if (nodes.has(chain[i])) return chain[i]; return null; };
  const drawnSelected = drawnOf(input.selectedId);
  const selected = drawnSelected && drawnSelected !== worktree.mission.id ? drawnSelected : null;
  // W7: an expanded department with no other subject is itself the focus: its sector (Mission -> Departments -> that department -> its steps) is lit and the unrelated sectors recede.
  const expanded = !selected && layout.state.expandedDepartmentId && nodes.has(layout.state.expandedDepartmentId) ? layout.state.expandedDepartmentId : null;
  const focus = selected ?? expanded;
  const ancestry = focus ? ancestryOf(worktree, focus) : [];
  const inAncestry = new Set(ancestry);
  // A node stands for the drawn entities inside it too (a department for its steps, the Departments phase for its departments): their conduits are the node's conduits.
  const subjectSet = (subject: string | null): Set<string> => {
    const set = new Set<string>(subject && nodes.has(subject) ? [subject] : []);
    for (let grew = true; grew;) { grew = false; layout.nodes.forEach(n => { if (n.parentId && set.has(n.parentId) && !set.has(n.id)) { set.add(n.id); grew = true; } }); }
    return set;
  };
  const selectedSet = subjectSet(selected);
  if (expanded) subjectSet(expanded).forEach(id => inAncestry.add(id));
  const roleOf = (e: LayoutEdge): ConduitRole => {
    if (!focus) return "idle";
    const containment = e.relation !== "dependency";
    if (containment) return inAncestry.has(e.from) && inAncestry.has(e.to) ? "path" : "receded";
    return selectedSet.has(e.from) || selectedSet.has(e.to) || (inAncestry.has(e.to) && e.to !== worktree.mission.id) || (inAncestry.has(e.from) && e.from !== worktree.mission.id) ? "path" : "receded";
  };
  // W7: a dependency is a cross-link, not hierarchy. In the Graph it is drawn only when the subject makes it relevant (selected / inspected / ancestry), never as ambient structure.
  const lines = allLines.filter(e => e.relation !== "dependency" || roleOf(e) === "path");
  // ---- tone: the recorded state of the TARGET, by edge treatment only (never a recolour of the whole object)
  const toneOf = (e: LayoutEdge): ConduitTone => { const s = nodes.get(e.to)?.status; return s === "done" ? "settled" : s === "error" ? "alert" : s === "active" ? "recorded-active" : "quiet"; };

  // ---- geometry per conduit: the layout supplies every path
  const segments: ConduitSegment[] = lines.map(e => {
    const { start, end } = pathEnds(e.d);
    return { edgeId: e.id, relation: e.relation, from: e.from, to: e.to, d: e.d, role: roleOf(e), tone: toneOf(e), start, end, fade: 0, route: false };
  });

  // ---- C3 Graph fan: which conduit is the selected route, and how far each sibling is from the reference (depth fade). Pure geometry + the recorded ancestry.
  if (!stack) {
    const activeId = worktree.phases.find(p => p.key === activePhaseKey(worktree, layout.state))?.id;
    const cy = (id: string) => { const n = nodes.get(id); return n ? n.y + n.h / 2 : 0; };
    const spread = (relation: LayoutRelation, anchorId: string | undefined) => Math.max(1, ...segments.filter(s => s.relation === relation).map(s => Math.abs(cy(s.to) - (anchorId ? cy(anchorId) : cy(s.from)))));
    const ownSpread = spread("ownership", activeId), memSpread = Math.max(1, ...segments.filter(s => s.relation === "phase-membership").map(s => Math.abs(cy(s.to) - cy(s.from))));
    const referenceRow = selected && nodes.get(selected)?.kind === "department" ? selected : null;
    segments.forEach(s => {
      if (s.relation === "ownership") { s.fade = Math.min(1, Math.abs(cy(s.to) - (activeId ? cy(activeId) : cy(s.to))) / ownSpread); s.route = s.to === activeId || s.role === "path"; }
      else if (s.relation === "phase-membership") { s.fade = Math.min(1, Math.abs(cy(s.to) - (referenceRow ? cy(referenceRow) : cy(s.from))) / memSpread); s.route = s.role === "path"; }
    });
  }

  // ---- motion
  const packets: ConduitPacket[] = [];
  if (!input.reducedMotion && !stack) {
    // Selection / focus: ONE packet per conduit on the path to the subject, ancestors first, then it stops.
    const pulseSubject = input.pulse ? drawnOf(input.pulse.subject) : null;
    const pulse = input.pulse && input.pulse.view === view && pulseSubject ? { ...input.pulse, subject: pulseSubject } : null;
    if (pulse) {
      const chain = ancestryOf(worktree, pulse.subject!);
      const subjectNodes = subjectSet(pulse.subject);
      const order = (e: ConduitSegment) => Math.max(chain.indexOf(e.to), 0);
      const onPath = segments.filter(s => (s.relation !== "dependency" && chain.includes(s.from) && chain.includes(s.to)) || (s.relation === "dependency" && subjectNodes.has(s.to)))
        .sort((a, b) => order(a) - order(b) || (a.edgeId < b.edgeId ? -1 : 1));
      onPath.slice(0, STYLE_BASE.maxSelectionPackets).forEach((s, i) => packets.push(s.tone === "alert"
        ? { id: `sel:${pulse.serial}:${s.edgeId}`, edgeId: s.edgeId, d: s.d, kind: "stall", order: i, delayMs: i * STYLE_BASE.selectionStaggerMs, durationMs: STYLE_BASE.stallMs, repeats: false }
        : { id: `sel:${pulse.serial}:${s.edgeId}`, edgeId: s.edgeId, d: s.d, kind: "selection", order: i, delayMs: i * STYLE_BASE.selectionStaggerMs, durationMs: STYLE_BASE.selectionMs, repeats: false }));
    }
    // Executor-confirmed live execution only: conduits leading to a recorded-ACTIVE target.
    if (worktree.mission.execution.liveConfirmed) {
      segments.filter(s => nodes.get(s.to)?.status === "active").slice().sort((a, b) => (a.edgeId < b.edgeId ? -1 : 1)).slice(0, STYLE_BASE.maxLivePackets)
        .forEach((s, i) => packets.push({ id: `live:${s.edgeId}`, edgeId: s.edgeId, d: s.d, kind: "live", order: i, delayMs: i * STYLE_BASE.liveStaggerMs, durationMs: STYLE_BASE.liveMs, repeats: true }));
    }
  }

  // ---- junctions from real topology: the shared origin of a fan, the end of the selected path, the end of live conduits
  const junctions: ConduitJunction[] = [];
  const cluster = (kind: "fan-out", pointOf: (s: ConduitSegment) => { x: number; y: number }) => {
    const groups = new Map<string, ConduitSegment[]>();
    segments.filter(s => s.relation !== "ownership").forEach(s => { const p = pointOf(s); const k = `${Math.round(p.x)}:${Math.round(p.y)}`; groups.set(k, [...(groups.get(k) ?? []), s]); });
    groups.forEach((list, k) => {
      if (list.length < 2) return;
      const p = pointOf(list[0]);
      junctions.push({ id: `${kind}:${k}`, kind, x: f(p.x), y: f(p.y), tone: list.some(s => s.tone === "alert") ? "alert" : list.every(s => s.tone === "settled") ? "settled" : list.some(s => s.tone === "recorded-active") ? "recorded-active" : "quiet", role: list.some(s => s.role === "path") ? "path" : list.every(s => s.role === "receded") ? "receded" : "idle", edgeIds: list.map(s => s.edgeId).sort() });
    });
  };
  if (level !== "minimal") {
    cluster("fan-out", s => s.start);
    // ambiguity never produces a conduit, so it can never produce a junction either
    const pathSegments = segments.filter(s => s.role === "path" && s.to === selected);
    if (selected && pathSegments.length) { const s = pathSegments[0]; junctions.push({ id: `selected:${selected}`, kind: "selected", x: f(s.end.x), y: f(s.end.y), tone: s.tone, role: "path", edgeIds: pathSegments.map(p => p.edgeId).sort() }); }
    packets.filter(p => p.kind === "live").forEach(p => { const s = segments.find(x => x.edgeId === p.edgeId)!; junctions.push({ id: `live:${s.edgeId}`, kind: "live", x: f(s.end.x), y: f(s.end.y), tone: "recorded-active", role: s.role, edgeIds: [s.edgeId] }); });
  }
  // sockets: a small seat where a conduit meets its node. Only on the selected path and on conduits whose target carries a recorded running / error state (never on every edge).
  if (level !== "minimal") {
    const near = (x: number, y: number) => junctions.some(j => Math.abs(j.x - x) < 3 && Math.abs(j.y - y) < 3);
    const seat = (id: string, kind: "socket" | "fault", p: { x: number; y: number }, s: ConduitSegment) => { if (junctions.length < 60 && !near(p.x, p.y)) junctions.push({ id, kind, x: f(p.x), y: f(p.y), tone: s.tone, role: s.role, edgeIds: [s.edgeId] }); };
    segments.filter(s => s.relation !== "ownership").forEach(s => {
      if (s.tone === "alert") seat(`fault:${s.edgeId}`, "fault", s.end, s);
      else if (s.role === "path" || s.tone === "recorded-active") seat(`socket:end:${s.edgeId}`, "socket", s.end, s);
      if (s.role === "path" && s.tone !== "alert") seat(`socket:start:${s.edgeId}`, "socket", s.start, s);
    });
  }
  return { view, level, segments, junctions, packets, liveConfirmed: worktree.mission.execution.liveConfirmed };
}

/** The style of one conduit class. Differences are weight / opacity / segmentation / sheath, never a different bright colour. */
export interface ConduitStyle { width: number; opacity: number; dash?: string; sheathWidth: number; sheathOpacity: number }
export function conduitStyle(relation: LayoutRelation, role: ConduitRole, tone: ConduitTone, level: ConduitLevel): ConduitStyle {
  let s: ConduitStyle;
  // W7 relationship weight: the Mission's own spokes to its phases are the heaviest structure, phase -> department is medium, department -> step is fine, and a dependency is the quietest
  // (a segmented cross-link). Hierarchy reads from line weight before any label is read.
  if (relation === "dependency") s = { width: 0.9, opacity: 0.3, dash: "3 6", sheathWidth: 0, sheathOpacity: 0 };
  else if (relation === "ownership") s = { width: 1.7, opacity: 0.44, sheathWidth: 7, sheathOpacity: 0.08 };
  else if (relation === "phase-membership") s = { width: 1.15, opacity: 0.36, sheathWidth: 4.5, sheathOpacity: 0.06 };
  else s = { width: 0.85, opacity: 0.3, sheathWidth: 2.5, sheathOpacity: 0.04 };
  if (tone === "settled") s = { ...s, opacity: s.opacity * 1.2, sheathOpacity: s.sheathOpacity * 1.2 };
  if (tone === "recorded-active") s = { ...s, opacity: s.opacity * 1.25 };
  if (tone === "quiet") s = { ...s, opacity: s.opacity * 0.85 };
  if (role === "path") {
    if (relation === "dependency") s = { ...s, width: s.width + 0.3, opacity: Math.min(0.62, s.opacity * 2), sheathWidth: 0, sheathOpacity: 0 }; // a revealed cross-link stays segmented and quieter than the ownership path
    else s = { ...s, width: s.width + 0.5, opacity: Math.min(0.9, s.opacity * 2), sheathWidth: s.sheathWidth, sheathOpacity: Math.min(0.1, Math.max(0.06, s.sheathOpacity * 1.5)), dash: undefined }; // the selected path carries more light, never a glow tube
  }
  if (role === "receded") s = { ...s, opacity: s.opacity * 0.5, sheathOpacity: s.sheathOpacity * 0.4 };
  if (level === "minimal") s = { ...s, sheathWidth: 0, sheathOpacity: 0 };
  if (level === "light") s = { ...s, sheathWidth: s.sheathWidth * 0.7 };
  return { ...s, opacity: Math.round(s.opacity * 1000) / 1000, sheathOpacity: Math.round(s.sheathOpacity * 1000) / 1000 };
}
