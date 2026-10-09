"use client";

/**
 * The Mission Worktree view (the canonical Graph), CONTROLLED (W4): selection / expansion / view live in the lens (one canonical state, see
 * missionWorktreeSelection) and arrive as props. This component only draws: nodes (keyed by entity id, so a re-layout re-arranges the same elements and DOM
 * focus survives), W3 conduits, the attached Peek plane, ambiguity markers and department expanders. It is not the final node styling.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import type { MissionWorktree } from "./missionWorktree";
import { activePhaseKey, ancestryOf, layoutWorktree, type LayoutNode, type ViewState } from "./missionWorktreeLayout";
import { ambiguityId, ambiguityNodeId, isAmbiguityId, selectableFor, selectableIn } from "./missionWorktreeAncestry";
import { peekOf, peekSize } from "./missionWorktreePeek";
import { placePeek } from "./missionWorktreePeekLayout";
import { isWorktreeNavKey, navigateWorktree, WORKTREE_NAV_HELP } from "./missionWorktreeNav";
import { contextThread, type SelectionAction, type WorktreeSelection } from "./missionWorktreeSelection";
import { intelIdentityOf } from "./missionIntelHeader";
import { workbenchCapabilities, workbenchSectionLabel } from "./missionWorkbench";
import { focusAvailability } from "./missionWorktreeFocus";
import { placeFocus, placeWorkbench, seamY, stageInsets, workbenchFootprint, workbenchSheetHeight } from "./missionWorkbenchLayout";
import { MissionWorkbenchPlane } from "./MissionWorkbenchPlane";
import { MissionFocusPlane } from "./MissionFocusPlane";
import { PlanApprovalAction } from "./PlanApprovalAction";
import { RevisionRequestAction } from "./RevisionRequestAction";
import { ToolApprovalsEntry } from "./ToolApprovalsEntry";
import { workbenchContentOf } from "./missionWorkbenchContent";
import { MissionCoreGlass } from "./MissionCoreGlass";
import { MissionConduits } from "./MissionConduits";
import { MissionPeek } from "./MissionPeek";
import { missionLayoutFor } from "./missionFlowModel";
import styles from "./MissionWorktreeView.module.css";

const subscribe = (onChange: () => void) => { window.addEventListener("resize", onChange); return () => window.removeEventListener("resize", onChange); };
export const useViewportSize = () => {
  const key = useSyncExternalStore(subscribe, () => `${window.innerWidth}x${window.innerHeight}`, () => "1440x900");
  return useMemo(() => { const [w, h] = key.split("x").map(Number); return { w, h }; }, [key]);
};
const subscribeMotion = (onChange: () => void) => { const q = window.matchMedia("(prefers-reduced-motion: reduce)"); q.addEventListener("change", onChange); return () => q.removeEventListener("change", onChange); };
export const useReducedMotion = () => useSyncExternalStore(subscribeMotion, () => window.matchMedia("(prefers-reduced-motion: reduce)").matches, () => false);
/** Dev-only review aids (`?wtLive`, `?wtDepth`): honoured only outside production builds, so no URL can simulate state in a production Missions route. */
const searchHas = (key: string) => process.env.NODE_ENV !== "production" && typeof window !== "undefined" && new URLSearchParams(window.location.search).has(key);


/** Tiny status badge text for a level-2 row: the department's own RECORDED state (derived from its steps), never a judgement. */
const BADGE_TEXT: Record<string, string> = { done: "Done", active: "Running", pending: "Pending", error: "Error", skipped: "Skipped", mixed: "Mixed", assigned: "Assigned" };
const TYPE_LABEL = { mission: "Mission", phase: "Phase", department: "Department", step: "Step" } as const;

export function MissionWorktreeView({ worktree, selection, dispatch, onReload, rightInset = 0, coreAddon }: { /** Mounted directly beneath the Mission Core (desktop Graph only): the Mission selector. */ coreAddon?: ReactNode; /** Space the graph yields on the right for the permanent Intelligence panel (px). */ rightInset?: number; worktree: MissionWorktree; selection: WorktreeSelection; dispatch: (action: SelectionAction) => void; /** Re-read the canonical data now (after a mutation). */ onReload?: () => void }) {
  const { w, h } = useViewportSize();
  const mode = missionLayoutFor(w, h);
  const reducedMotion = useReducedMotion();
  const insets = stageInsets(mode);
  const rootStage = { width: w - 24 - rightInset, height: Math.max(240, h - insets.top - insets.bottom) };
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const focusRequest = useRef<string | null>(null);
  const suppressFocusPulse = useRef(false);

  const missionId = worktree.mission.id;
  const selectedId = selection.selectedId ?? missionId;
  const ambiguity = isAmbiguityId(selectedId);
  const anchorNodeId = ambiguity ? ambiguityNodeId(selectedId) : selectedId;
  const phone = mode === "stack";
  // Inspection depth (W5.1 state): the Workbench is the Peek unfolded for the SAME selection. Desktop: a side plane; the graph is laid out by the same engine in the narrower stage
  // (it yields). Phone: an inline sheet in the slot the Peek used. Either way the Peek model supplies the identity header.
  // C5A: the desktop Graph has no floating Peek at all: selecting a phase or department only selects / highlights it (the right Intelligence panel carries the reading). The Workbench / Focus depths are unchanged.
  const noFloatingPeek = !phone && selection.depth === "peek";
  const peek = selection.peekOpen && !noFloatingPeek ? peekOf(worktree, selectedId) : null;
  // W6.1: Focus is a third depth of the same inspection. Until its surface exists (W6.2) the Workbench stays drawn underneath, exactly as it was.
  const wbOpen = !!peek && (selection.depth === "workbench" || selection.depth === "focus");
  const wbCaps = wbOpen ? workbenchCapabilities(worktree, selectedId) : null;
  // C7F: the Workbench's identity header reads the same recorded identity as the Intelligence panel, plus where the entity sits (the context thread without itself).
  const wbIdentity = useMemo(() => (wbOpen ? intelIdentityOf(worktree, selectedId) : undefined), [wbOpen, worktree, selectedId]);
  const wbParent = useMemo(() => (wbOpen ? contextThread(worktree, selectedId ?? null).slice(0, -1).map(seg => seg.label).join(" › ") : ""), [wbOpen, worktree, selectedId]);
  const wbContent = useMemo(() => (wbOpen ? workbenchContentOf(worktree, selectedId, selection.section) : null), [wbOpen, worktree, selectedId, selection.section]);
  const footprint = wbOpen && !phone ? workbenchFootprint(rootStage) : null;
  const stage = footprint ? footprint.graphStage : rootStage;
  // A stage narrowed by the Workbench OR by the permanent Intelligence panel is laid out with the same narrower node tiers (never overlapping nodes, never a cut label).
  const stageTier: 1 | 2 | undefined = footprint ? footprint.tier : stage.width < 860 ? 2 : stage.width < 1180 ? 1 : undefined;
  const sheet = wbOpen && phone;
  // A short stage (small desktops) cannot hold six instruments beside the entity: the Peek carries the first three there (the Workbench has them all).
  const compactPeek = !phone && stage.height < 560;
  const sizes = peek ? (phone ? [sheet ? { ...peekSize(peek, "stack", stage.width), h: workbenchSheetHeight(rootStage) } : peekSize(peek, "stack", stage.width)] : (["single", "double", "triple"] as const).flatMap(v => (compactPeek ? [true] : [false, true]).map(c => ({ ...peekSize(peek, mode === "wide" ? "wide" : "desktop", stage.width, v, c), compact: c }))).sort((a, b) => Number(a.compact) - Number(b.compact))) : null;
  const viewState: ViewState = { view: selection.view, selectedId: anchorNodeId, expandedDepartmentId: selection.expandedDepartmentId };
  const sizeH = sizes?.[0].h;
  const layout = layoutWorktree(worktree, stage, mode, viewState, phone && sizeH ? { afterId: anchorNodeId, height: sizeH } : undefined, stageTier ? { tight: stageTier } : undefined);
  const marker = ambiguity ? layout.ambiguities.find(m => m.nodeId === anchorNodeId) : undefined;
  const placement = peek && sizes && (phone || !wbOpen) ? placePeek(layout, anchorNodeId, sizes, marker ? { x: marker.x, y: marker.y } : undefined) : null;
  const contentHeight = Math.max(layout.contentHeight, placement ? Math.ceil(placement.y + placement.h + 12) : 0);
  // The graph while the Workbench is open: the selected entity and its ownership path are fully clear, its direct neighbours (siblings, direct dependencies) stay readable, the rest recedes.
  const near = new Set<string>();
  if (peek && !phone) {
    const a = layout.nodes.find(n => n.id === anchorNodeId);
    layout.nodes.forEach(n => { if (n.id !== anchorNodeId && a && ((a.parentId !== undefined && n.parentId === a.parentId) || n.parentId === a.id || n.dependsOn.includes(a.id) || a.dependsOn.includes(n.id))) near.add(n.id); });
  }
  const wbPlacement = footprint && wbCaps ? placeWorkbench(layout, anchorNodeId, rootStage, footprint) : null;
  const peekRef = useRef<HTMLDivElement>(null);
  // Yielded tiers: a row's dot rides inside its label's text flow (see the badge markup). A name over the 2-line clamp is cut by the clamp (with its ellipsis), and a dot inside the cut flow would be cut too, so
  // for such a label (and only such a label) one measurement pass places the dot 6px after the END of the final VISIBLE line (its text plus the ellipsis, less the glyph's side bearing): `--dot-x / --dot-y`, in the head's own coordinates.
  // Event-driven (after a layout / tier change), DOM style properties only: no state, no polling, no truncation, no change to the label's lines.
  const ellipsisProbe = useRef<HTMLCanvasElement | null>(null);
  useLayoutEffect(() => {
    rootRef.current?.querySelectorAll<HTMLElement>('button[data-kind="department"],button[data-kind="step"]').forEach(row => {
      const label = row.querySelector("b"), clipped = !!stageTier && !!label && label.scrollHeight > label.clientHeight + 6; // a whole extra line is cut off by the clamp
      if (!clipped || !label) { row.removeAttribute("data-clip"); row.style.removeProperty("--dot-x"); row.style.removeProperty("--dot-y"); return; }
      row.setAttribute("data-clip", "");
      const head = label.parentElement, flow = label.querySelector(":scope > span"), text = flow && [...flow.childNodes].find(n => n.nodeType === 3);
      if (!head || !text) return;
      const range = document.createRange(); range.selectNodeContents(text);
      const rects = [...range.getClientRects()].filter(r => r.width > 0), tops = [...new Set(rects.map(r => Math.round(r.top)))].sort((x, y) => x - y);
      const line = rects.filter(r => Math.round(r.top) === tops[Math.min(1, tops.length - 1)]); // the 2-line clamp: the second line is the last one painted
      if (!line.length) return;
      const ctx = (ellipsisProbe.current ??= document.createElement("canvas")).getContext("2d");
      if (ctx) ctx.font = getComputedStyle(label).font;
      const ellipsis = ctx?.measureText("\u2026").width ?? 0, end = Math.max(...line.map(r => r.right)) + ellipsis, mid = (line[0].top + line[0].bottom) / 2;
      const box = head.getBoundingClientRect(), scale = head.offsetWidth ? box.width / head.offsetWidth : 1; // the head may carry a small depth scale
      row.style.setProperty("--dot-x", `${(end + 5.2 - box.left) / scale}px`);
      row.style.setProperty("--dot-y", `${(mid - box.top) / scale}px`);
    });
  }, [layout, stageTier]);
  const scrollPeek = placement?.side === "scroll";
  const lit = new Set(ancestryOf(worktree, selectedId));
  // W7: an expanded department with no open inspection: its sector (Mission -> Departments -> that department) stays clear, the unrelated phases step back.
  const sectorLit = !selection.peekOpen && selection.expandedDepartmentId ? new Set(ancestryOf(worktree, selection.expandedDepartmentId)) : null;
  // The Mission plinth: one tick per canonical phase position (recorded status, or a hollow gap when the phase is not recorded).
  const phaseTicks = worktree.canonicalPhaseOrder.map((key, i) => ({ key, status: layout.nodes.find(n => n.kind === "phase" && n.order === i + 1)?.status ?? "gap" }));
  // W6.2 Focus: the Workbench expanded outward from the same side. The graph keeps the Workbench's layout; it is only nudged so the selected entity + ancestry stay in the free strip.
  const focusOpen = !!peek && selection.depth === "focus";
  const focusPlacement = focusOpen && !phone && wbPlacement ? placeFocus(layout, anchorNodeId, lit, rootStage, wbPlacement) : null;
  const bridge = focusPlacement ?? wbPlacement;
  const canFocus = wbOpen && !focusOpen && focusAvailability(worktree, selectedId, selection.section).available;
  const openFocus = (scrollTop: number) => dispatch({ type: "openFocus", scrollTop });
  // C1b.1: the plan decision belongs to the MISSION's Approvals section only (never a step's or phase's).
  const missionAction = wbOpen && !focusOpen && selectedId === missionId && onReload;
  const planAction = missionAction && selection.section === "approvals" ? <><PlanApprovalAction worktree={worktree} onApproved={onReload} /><ToolApprovalsEntry worktree={worktree} /></>
    // C1b.2: the change request belongs to the MISSION's Requested changes section only; one slot, chosen by section.
    : missionAction && selection.section === "requestedChanges" ? <RevisionRequestAction worktree={worktree} onRequested={onReload} /> : undefined;
  // C2 node styling inputs (presentation of recorded data only): the active level-1 phase, and each level-2 row's normalised distance from the reference row (the selected department, else the row nearest the fan origin).
  const activePhaseId = worktree.phases.find(p => p.key === activePhaseKey(worktree, viewState))?.id;
  const isRow = (n: LayoutNode) => n.kind === "department" || (n.kind === "step" && !phone); // level-2 rows of the desktop Graph: departments, or the active phase's steps
  const rowNodes = layout.nodes.filter(isRow);
  const fanNode = layout.nodes.find(n => n.id === activePhaseId);
  const refRow = rowNodes.find(n => n.id === anchorNodeId) ?? (fanNode ? rowNodes.reduce<LayoutNode | undefined>((best, n) => (!best || Math.abs(n.y + n.h / 2 - (fanNode.y + fanNode.h / 2)) < Math.abs(best.y + best.h / 2 - (fanNode.y + fanNode.h / 2)) ? n : best), undefined) : undefined);
  const rowSpan = refRow ? Math.max(1, ...rowNodes.map(n => Math.abs(n.y - refRow.y))) : 1;
  const tabStop = layout.nodes.some(n => n.id === anchorNodeId) ? anchorNodeId : missionId;

  // After a keyboard move, DOM focus follows the selection (the elements persist across layouts, so focus survives a re-layout).
  useEffect(() => {
    const id = focusRequest.current;
    if (!id) return;
    const target = isAmbiguityId(id) ? rootRef.current?.querySelector<HTMLElement>(`[data-ambiguity="${CSS.escape(ambiguityNodeId(id))}"]`) : rootRef.current?.querySelector<HTMLElement>(`button[data-id="${CSS.escape(id)}"]`);
    if (target && selection.selectedId === id) { suppressFocusPulse.current = true; target.focus(); suppressFocusPulse.current = false; focusRequest.current = null; }
  }, [selection.selectedId, layout]);

  // A stage too small for any clear spot places the Peek below the content: bring it into view once per selection (event-driven, no polling).
  useEffect(() => { if (scrollPeek) peekRef.current?.querySelector("[data-peek]")?.scrollIntoView({ block: "nearest" }); }, [scrollPeek, selection.selectedId, selection.pulse?.serial]);

  const focusNode = () => { suppressFocusPulse.current = true; rootRef.current?.querySelector<HTMLElement>(`button[data-id="${CSS.escape(tabStop)}"]`)?.focus(); suppressFocusPulse.current = false; };
  // The plane's seam tick follows the selected entity. Event-driven only (a scroll listener writing one CSS variable): no polling, no rAF, no React state.
  const anchorCy = wbPlacement?.anchorCy, planeH = wbPlacement?.plane.h;
  useLayoutEffect(() => {
    const planes = [...(rootRef.current?.querySelectorAll<HTMLElement>("[data-workbench],[data-focus-plane]") ?? [])], scroller = scrollRef.current;
    if (!planes.length || !scroller || anchorCy === undefined || planeH === undefined) return;
    const set = () => planes.forEach(plane => plane.style.setProperty("--seam", `${seamY(anchorCy, scroller.scrollTop, planeH)}px`));
    set();
    scroller.addEventListener("scroll", set, { passive: true });
    return () => scroller.removeEventListener("scroll", set);
  }, [anchorCy, planeH, focusOpen]);
  // Keep the selected entity in view when the Workbench opens or its context moves (deterministic from layout numbers, not from measurements).
  const anchorBox = layout.nodes.find(n => n.id === anchorNodeId);
  const anchorY = anchorBox?.y, anchorH = anchorBox?.h, viewH = stage.height;
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || !wbOpen || anchorY === undefined || anchorH === undefined) return;
    if (phone) { scroller.scrollTo({ top: Math.max(0, anchorY - 8), behavior: reducedMotion ? "auto" : "smooth" }); return; }
    if (anchorY < scroller.scrollTop + 8) scroller.scrollTop = Math.max(0, anchorY - 24);
    else if (anchorY + anchorH > scroller.scrollTop + viewH - 8) scroller.scrollTop = anchorY + anchorH - viewH + 24;
  }, [wbOpen, phone, selectedId, anchorY, anchorH, viewH, reducedMotion]);
  // W7.3 phone: the sector in focus comes to the top of the reading area (smoothly); Mission and ancestry stay one scroll above. Not used while the Workbench sheet owns the scroll.
  const hasPeek = !!peek;
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!phone || !hasPeek || wbOpen || !scroller || anchorY === undefined) return;
    scroller.scrollTo({ top: Math.max(0, anchorY - 8), behavior: reducedMotion ? "auto" : "smooth" });
  }, [phone, hasPeek, wbOpen, anchorNodeId, anchorY, reducedMotion]);
  // Clicking anywhere outside the open Workbench closes it (Workbench -> Peek, exactly like Esc / Back). Not on: the Workbench itself, a Graph node (that re-targets it), the panel's Explore details,
  // the NORA dock / conversation (typing to NORA must not dismiss it) or another dialog. Desktop only; the Focus plane (a deeper reading surface) is left to its own Back / Esc.
  useEffect(() => {
    if (!wbOpen || phone || selection.depth !== "workbench") return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target || event.button !== 0) return;
      if (target.closest("#worktree-workbench,button[data-id],[data-explore],.studio-command-dock-wrapper,.nora-conversation,[role='dialog'],[data-mission-selector]")) return;
      dispatch({ type: "closeWorkbench" });
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [wbOpen, phone, selection.depth, dispatch]);
  // Esc is Workbench -> Peek only, wherever focus is (e.g. on the header's view switch, outside this group). Inside the group the key handler below owns it.
  useEffect(() => {
    if (!wbOpen) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key !== "Escape" || event.defaultPrevented || rootRef.current?.contains(target)) return;
      if (target?.closest("input,textarea,select,[contenteditable='true'],[role='dialog']")) return;
      event.preventDefault();
      dispatch({ type: selection.depth === "focus" ? "closeFocus" : "closeWorkbench" });
      rootRef.current?.querySelector<HTMLElement>('button[data-id][tabindex="0"]')?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [wbOpen, selection.depth, dispatch]);
  // Opening the Workbench moves keyboard focus to its active section marker; closing it (Back / Esc) returns focus to the selected entity.
  const lastDepth = useRef(selection.depth);
  useEffect(() => {
    if (lastDepth.current === "focus" && selection.depth === "workbench") rootRef.current?.querySelector<HTMLElement>('[data-workbench] [role="tab"][aria-selected="true"]')?.focus();
    lastDepth.current = selection.depth;
  }, [selection.depth]);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wbOpen && !wasOpen.current) rootRef.current?.querySelector<HTMLElement>('[data-workbench] [role="tab"][aria-selected="true"]')?.focus();
    wasOpen.current = wbOpen;
  }, [wbOpen]);

  const select = (id: string, focus = false) => { if (focus) focusRequest.current = isAmbiguityId(id) ? id : selectableIn(worktree, id, !phone); dispatch({ type: "select", id }); };
  const graphKeys = !phone;
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const el = (event.target as HTMLElement).closest<HTMLElement>("[data-id],[data-ambiguity],[data-peek]");
    if (event.key === "Escape") {
      // Closes the Peek first, then climbs one level; at mission level with the Peek closed it does nothing here (leaving the mission is the back control).
      if (selection.peekOpen || selection.trail.length > 1) {
        event.preventDefault(); event.stopPropagation(); focusRequest.current = null; dispatch({ type: "escape" });
        if (selection.depth !== "focus") rootRef.current?.querySelector<HTMLElement>(`button[data-id="${CSS.escape(tabStop)}"]`)?.focus();
      }
      return;
    }
    // Enter on the already-selected node while its Peek is open is the explicit inspect action: Peek -> Workbench (W5.1; state only, no Workbench surface yet).
    if (event.key === "Enter" && el && !el.hasAttribute("data-peek") && selection.peekOpen && selection.depth === "peek" && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      const id = el.dataset.ambiguity ? ambiguityId(el.dataset.ambiguity) : el.dataset.id;
      if (id === selectedId || (id && selectableFor(worktree, id) === selectedId)) { event.preventDefault(); dispatch({ type: "openWorkbench" }); return; }
    }
    if (!el || !isWorktreeNavKey(event.key) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || el.hasAttribute("data-peek")) return;
    const currentId = el.dataset.ambiguity ? ambiguityId(el.dataset.ambiguity) : el.dataset.id!;
    event.preventDefault();
    // Tree behaviour: Left on an expanded department collapses it first, then goes to the ancestor.
    // (the desktop Graph has no expansion: a drawn child row's Left is always one press to its parent)
    if (event.key === "ArrowLeft" && !graphKeys && currentId === selection.expandedDepartmentId) { dispatch({ type: "toggleExpand", departmentId: currentId }); return; }
    const next = navigateWorktree(event.key, currentId, worktree, { graphSteps: graphKeys });
    if (next) select(next, true);
  };

  // A level-2 row's status badge: on the yielded (narrow) tiers it lives INSIDE the label's text flow, so the dot follows the final rendered line of a wrapped name; otherwise it follows the meta line.
  const badge = (n: LayoutNode, fallback = false) => n.status ? <em className={styles.badge} data-status={n.status} data-fallback={fallback || undefined} aria-hidden="true">{BADGE_TEXT[n.status] ?? n.status}</em> : null;
  const nodeLabel = (n: LayoutNode) => `${n.kind === "step" && n.kindUnknown ? "Step, type not recorded" : TYPE_LABEL[n.kind]}: ${n.label}. ${n.detail}${n.ambiguousCount ? `. ${n.ambiguousCount} dependency reference${n.ambiguousCount === 1 ? "" : "s"} could not be resolved uniquely` : ""}`;
  const peekId = peek ? `peek-for-${anchorNodeId}` : undefined;
  const expandedDept = selection.expandedDepartmentId;
  return <div className={styles.root} ref={rootRef} data-worktree data-depth={selection.peekOpen && !noFloatingPeek ? (selection.depth === "focus" ? "workbench" : selection.depth) : undefined} data-focus={(selection.peekOpen && selection.depth === "focus") || undefined} data-wb-side={wbPlacement?.side} data-section={wbOpen ? selection.section : undefined} data-view={layout.view} data-yield={stageTier} data-mode={mode} style={{ top: insets.top, bottom: insets.bottom, left: 12, right: 12 + rightInset }} onKeyDown={onKeyDown} role="group" aria-label="Mission worktree" aria-describedby="worktree-help">
    <p id="worktree-help" className={styles.srOnly}>{WORKTREE_NAV_HELP}</p>
    {searchHas("wtLive") && <p className={styles.fixture} role="note">TEST FIXTURE: executor confirmation is simulated for this mission (?wtLive). Not a live execution.</p>}
    {searchHas("wtDepth") && <p className={styles.devDepth} role="note" data-workbench-debug>DEV: depth {selection.peekOpen ? selection.depth : "closed"}{wbOpen ? ` · section ${selection.section} · available ${(workbenchCapabilities(worktree, selectedId)?.sections ?? []).map(c => c.id).join(", ")}` : ""}</p>}
    <div className={styles.scroll} ref={scrollRef} inert={focusOpen ? true : undefined} aria-hidden={focusOpen ? true : undefined}>
      <div className={styles.stage} data-stage style={{ width: layout.stage.width, height: contentHeight, ...(bridge ? { transform: `translateX(${bridge.graphOffset}px)` } : {}) }}>
        {bridge && <i className={styles.wbAttach} data-side={bridge.side} aria-hidden="true" style={{ left: Math.min(bridge.attach.x1, bridge.attach.x2), top: bridge.attach.y, width: Math.abs(bridge.attach.x2 - bridge.attach.x1) }} />}
        <MissionConduits layout={layout} worktree={worktree} selectedId={selection.selectedId} pulse={selection.pulse} reducedMotion={reducedMotion} />
        {layout.regions.map(region => <div key={region.key} className={styles.region} data-region={region.key} title={`${region.label}: ${region.caption}`} style={{ transform: `translate(${region.x}px,${region.y}px)`, width: region.w, height: region.h }}><b>{region.label}</b></div>)}
        {layout.gaps.map(gap => <div key={gap.key} className={styles.gap} data-gap={gap.key} style={{ transform: `translate(${gap.x}px,${gap.y}px)`, width: gap.w, height: gap.h }}><b>{gap.label}</b><span>{gap.caption}</span></div>)}
        {layout.nodes.map(node => <button key={node.kind === "mission" ? "core" : node.kind === "phase" && node.order ? `phase:${node.order}` : node.id} className={styles.node} data-id={node.id} data-kind={node.kind} data-mass={node.kind === "mission" ? (node.h >= 108 ? "full" : node.h >= 72 ? "compact" : "chip") : undefined} data-status={node.status} data-selected={node.id === anchorNodeId || undefined} data-active={node.id === activePhaseId || undefined} data-facing={node.kind === "step" && !isRow(node) ? undefined : node.facing} data-lit={lit.has(node.id) || undefined} data-near={near.has(node.id) || undefined} data-recede={(sectorLit && node.kind === "phase" && !sectorLit.has(node.id)) || undefined} data-live={(node.status === "active" && worktree.mission.execution.liveConfirmed) || undefined}
          data-container={node.h > node.headerH + 1 || undefined} data-tight={node.headerH < 34 || undefined} data-kind-unknown={node.kindUnknown || undefined} data-stacked={(node.kind === "step" && node.h >= 34 && /^Step \d+ · /.test(node.detail)) || undefined} data-has-expander={(node.kind === "department" && (node.stepCount ?? 0) > 0 && (layout.view !== "graph" || phone)) || undefined}
          style={{ transform: `translate(${node.x}px,${node.y}px)${node.id === anchorNodeId && !phone ? " scale(1.035)" : ""}`, width: node.w, height: node.h, ["--head" as string]: `${node.headerH}px`, ...(node.kind === "mission" && node.percent !== undefined ? { ["--pct" as string]: node.percent } : {}), ...(isRow(node) && refRow ? { ["--dist" as string]: (Math.abs(node.y - refRow.y) / rowSpan).toFixed(3) } : {}) }}
          tabIndex={node.id === tabStop ? 0 : -1} aria-label={nodeLabel(node)} aria-current={node.id === anchorNodeId ? "true" : undefined} aria-describedby={node.id === anchorNodeId ? (wbOpen && !phone ? "worktree-workbench" : peekId) : undefined}
          title={`${node.label} · ${node.detail}`} onClick={() => select(node.id)}
          onFocus={event => { if (!suppressFocusPulse.current && event.currentTarget.matches(":focus-visible")) dispatch({ type: "pulse", subject: node.id }); }}>
          {node.kind === "phase" && node.stepCount !== undefined && <b className={styles.count} aria-hidden="true">{node.stepCount}</b>}
          {node.kind === "phase" && node.order && <i className={styles.ord} aria-hidden="true">{String(node.order).padStart(2, "0")}</i>}
          {node.kind === "mission" && <i className={styles.orb} aria-hidden="true"><MissionCoreGlass /></i>}
          <span className={styles.head}>{node.kind === "mission" && <i className={styles.eyebrow} aria-hidden="true">Mission</i>}<b>{isRow(node) && stageTier ? <span className={styles.flow}>{node.label}{badge(node)}</span> : node.label}</b><small>{node.detail}</small>{isRow(node) && badge(node, !!stageTier)}</span>
          {node.kind === "phase" && node.percent !== undefined && node.h <= node.headerH + 1 && <span className={styles.rail} aria-hidden="true" style={{ ["--p" as string]: `${node.percent}%` }} />}
          {(node.kind === "department" || node.kind === "phase") && node.percent === undefined && node.h <= node.headerH + 1 && !!node.statuses?.length && <span className={styles.micro} aria-hidden="true">{node.statuses.map((st, i) => <i key={i} data-s={st} />)}</span>}
          {node.kind === "mission" && node.h >= 72 && <span className={styles.ticks} aria-hidden="true">{phaseTicks.map(t => <i key={t.key} data-s={t.status} />)}</span>}
        </button>)}
        {(phone ? layout.nodes.filter(n => n.kind === "department" && (n.stepCount ?? 0) > 0) : []).map(n => { const open = expandedDept === n.id, box = phone ? 44 : 26; return <button key={`x:${n.id}`} className={styles.expander} data-expander={n.id} aria-expanded={open} tabIndex={-1}
          aria-label={`${open ? "Collapse" : "Expand"} steps of ${n.label}`} style={{ transform: `translate(${n.x + n.w - box - 4}px,${n.y + Math.max(2, (Math.min(n.headerH, n.h) - box) / 2)}px)`, width: box, height: box }}
          onClick={() => dispatch({ type: "toggleExpand", departmentId: n.id })}><i aria-hidden="true">{open ? "▾" : "▸"}</i></button>; })}
        {layout.ambiguities.map(m => <button key={m.nodeId} className={styles.ambiguity} data-ambiguity={m.nodeId} data-selected={selectedId === ambiguityId(m.nodeId) || undefined} tabIndex={-1}
          aria-label={`Unresolved dependency: ${m.issues.length} reference${m.issues.length === 1 ? "" : "s"} could not be resolved uniquely`} title={`${m.issues.length} dependency reference${m.issues.length === 1 ? "" : "s"} could not be resolved uniquely`}
          style={{ transform: `translate(${m.x - (phone ? 16 : 10)}px,${m.y - (phone ? 16 : 10)}px)`, width: phone ? 32 : 20, height: phone ? 32 : 20 }} onClick={() => select(ambiguityId(m.nodeId))}>{m.issues.length}</button>)}
        {placement && peek && (phone || !wbOpen) && <>
          <svg className={styles.filament} width={layout.stage.width} height={contentHeight} aria-hidden="true">
            <defs><linearGradient id="wt-leader" gradientUnits="userSpaceOnUse" x1={placement.attach.from.x} y1={placement.attach.from.y} x2={placement.attach.to.x} y2={placement.attach.to.y + (placement.attach.to.y === placement.attach.from.y && placement.attach.to.x === placement.attach.from.x ? 0.01 : 0)}><stop offset="0" stopColor="#a8e8f4" stopOpacity=".8" /><stop offset=".4" stopColor="#a8e8f4" stopOpacity=".26" /><stop offset="1" stopColor="#a8e8f4" stopOpacity=".5" /></linearGradient></defs>
            <path d={`M${placement.attach.from.x} ${placement.attach.from.y}L${placement.attach.to.x} ${placement.attach.to.y}`} stroke="url(#wt-leader)" />
            <circle cx={placement.attach.from.x} cy={placement.attach.from.y} r="2.4" />
          </svg>
          <div id={peekId} ref={peekRef} className={styles.peekSlot}>{sheet && wbCaps
            ? <MissionWorkbenchPlane identity={wbIdentity} parent={wbParent} model={peek} caps={wbCaps} section={selection.section} box={placement} side="slot" phone reduced={reducedMotion} content={wbContent} onPick={target => select(target)} onSection={section => dispatch({ type: "setSection", section })} onBack={() => { dispatch({ type: "closeWorkbench" }); focusNode(); }} canFocus={canFocus} onFocus={openFocus} resume={selection.resume} covered={focusOpen} above={planAction} />
            : <MissionPeek model={peek} placement={placement} phone={phone} compact={placement.compact ?? compactPeek} onSelect={id => select(id, true)} onClose={() => dispatch({ type: "escape" })} onInspect={() => dispatch({ type: "openWorkbench" })} />}</div>
        </>}
      </div>
    </div>
    {coreAddon && !phone && (() => { const core = layout.nodes.find(n => n.kind === "mission"); return core ? <div className={styles.coreAddon} data-tier={stageTier || undefined} style={{ left: core.x + core.w / 2, top: core.y + core.h + 16, ["--core-h" as string]: `${core.h}px` }}>{coreAddon}</div> : null; })()}
    {wbOpen && !phone && wbPlacement && wbCaps && peek && <MissionWorkbenchPlane identity={wbIdentity} parent={wbParent} id="worktree-workbench" model={peek} caps={wbCaps} section={selection.section} box={wbPlacement.plane} side={wbPlacement.side} phone={false} reduced={reducedMotion}
      content={wbContent} onPick={target => select(target)} onSection={section => dispatch({ type: "setSection", section })} onBack={() => { dispatch({ type: "closeWorkbench" }); focusNode(); }} canFocus={canFocus} onFocus={openFocus} resume={selection.resume} covered={focusOpen} above={planAction} />}
    {focusOpen && peek && wbContent && (phone
      ? <MissionFocusPlane identity={wbIdentity} parent={wbParent} model={peek} sectionLabel={workbenchSectionLabel(selection.section)} content={wbContent} box={{ x: 0, y: 0, w: rootStage.width, h: rootStage.height }} side="slot" phone reduced={reducedMotion} onBack={() => dispatch({ type: "closeFocus" })} onNavigate={id => dispatch({ type: "focusNavigate", id })} />
      : focusPlacement && <MissionFocusPlane identity={wbIdentity} parent={wbParent} model={peek} sectionLabel={workbenchSectionLabel(selection.section)} content={wbContent} box={focusPlacement.plane} side={focusPlacement.side} phone={false} reduced={reducedMotion} from={focusPlacement.from} onBack={() => dispatch({ type: "closeFocus" })} onNavigate={id => dispatch({ type: "focusNavigate", id })} />)}
  </div>;
}
