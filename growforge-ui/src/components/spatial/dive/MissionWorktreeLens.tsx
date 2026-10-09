"use client";

/**
 * Container for the selected Mission: the Missions presentation. Owns the ONE canonical selection state (missionWorktreeSelection) and derives from it
 * everything else: the contextual header's Context Thread, NORA's mission-context + detail events, the ancestry / conduit path and the Peek. Replaced the temporary
 * view-local selection of W2/W3.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { OverviewSnapshot } from "@/lib/overviewSnapshot";
import { DIVE_DETAIL_EVENT } from "@/lib/diveLenses";
import { useMissionWorktree } from "./useMissionWorktree";
import type { MissionWorktree } from "./missionWorktree";
import { captureGhosts, presentGhosts, type Ghost } from "./missionSwitchGhost";
import { initialSelection, inspectionOf, noraContextFor, reduceSelection, type SelectionAction, type WorktreeSelection } from "./missionWorktreeSelection";
import { peekOf } from "./missionWorktreePeek";
import { selectableFor } from "./missionWorktreeAncestry";
import { workbenchCapabilities } from "./missionWorkbench";
import { MISSION_ACTION_EVENT, missionActionPlan, parseMissionAction } from "./missionWorktreeAction";
import { MissionWorktreeHeader } from "./MissionWorktreeHeader";
import { MissionWorktreeView, useViewportSize } from "./MissionWorktreeView";
import { MissionSelector } from "./MissionSelector";
import { MissionIntelPanel } from "./MissionIntelPanel";
import { useWorkspaceFlag } from "../workspace-shell";
import { MissionWorkspace } from "./MissionWorkspace";
import { intelPanelInset } from "./missionIntelLayout";
import type { ReelItem } from "./missionSelectorModel";
import { missionLayoutFor } from "./missionFlowModel";
import styles from "./MissionWorktreeView.module.css";

export function MissionWorktreeLens({ missionId, reel, onSwitch, snapshot, scopeActive, onClose }: { missionId: string; /** The recorded missions the selector walks, and the one switch path (the same `onSelect` the Mission Field uses). */ reel: ReelItem[]; onSwitch: (id: string) => void; snapshot: OverviewSnapshot | null; scopeActive: boolean; onClose: () => void }) {
  const { worktree: fresh, reload } = useMissionWorktree(missionId, snapshot);
  // C7E.6 / C7E.6.1: the Lens stays MOUNTED across a mission switch (the chassis never remounts). The previous mission's recorded data stays fully visible until the next record is read; the outgoing mission-dependent
  // layers are then cross-faded against the incoming ones using inert clones of only those layers (missionSwitchGhost.ts, globals.css). The incoming state is always the real next record (never an interpolation).
  // Reduced motion: no clones and no animation; the previous content stays until the next record is ready, then swaps atomically.
  const [worktree, setHeld] = useState<MissionWorktree | null>(null);
  const heldId = worktree?.mission.id, switching = worktree !== null && heldId !== missionId;
  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ghostRef = useRef<Ghost[] | null>(null);
  const { w, h } = useViewportSize();
  const phone = missionLayoutFor(w, h) === "stack";
  const [raw, setRaw] = useState<WorktreeSelection>(() => initialSelection(null, "graph"));
  const switchMission = (id: string) => { if (!reduced && worktree && id !== missionId) ghostRef.current = captureGhosts(); onSwitch(id); };
  // Take the next record as soon as it is read (state adjusted during render: no frame shows the old chassis with a blank graph).
  if (fresh && fresh !== worktree) {
    setHeld(fresh);
    if (worktree && fresh.mission.id !== heldId) setRaw(initialSelection(null, "graph")); // the next recorded mission becomes the incoming state
  }
  useLayoutEffect(() => {
    if (!heldId) return;
    const ghosts = ghostRef.current; ghostRef.current = null;
    if (!ghosts || reduced) return;
    return presentGhosts(ghosts);
  }, [heldId, reduced]);
  // A mission whose record cannot be read must not stay dressed as the previous one: after a while the loading state is honest.
  useEffect(() => {
    if (!switching || fresh) return;
    const timer = setTimeout(() => setHeld(null), 6000);
    return () => clearTimeout(timer);
  }, [switching, fresh]);
  // A data refresh may remove what was selected: derive the effective selection by falling back to its nearest valid ancestor (never to something unrelated).
  const selection = useMemo(() => (worktree ? reduceSelection(raw, { type: "reconcile" }, worktree) : raw), [raw, worktree]);
  // The phone's responsive stack draws no step under a non-Departments phase, so there a step resolves to its phase (desktop Graph rows are selectable as themselves, see the reducer).
  const dispatch = useMemo(() => (action: SelectionAction) => setRaw(current => reduceSelection(reduceSelection(current, { type: "reconcile" }, worktree), phone && worktree && action.type === "select" ? { ...action, id: selectableFor(worktree, action.id) } : action, worktree)), [worktree, phone]);

  // ---- NORA's context, derived from the SAME selection. (Contract unchanged: growforge:mission-context + the Dive detail event.)
  const selectedId = selection.selectedId ?? worktree?.mission.id ?? null;
  // Workbench depth (W5.1) is part of the same context: "Mission / Live Research / Sources". Present only while the Workbench is open.
  const { peekOpen, depth, section } = selection;
  const nora = useMemo(() => (worktree ? noraContextFor(worktree, selectedId, peekOf(worktree, selectedId)?.facts ?? [], inspectionOf(worktree, { selectedId, peekOpen, depth, section })) : null), [worktree, selectedId, peekOpen, depth, section]);
  const missionJson = nora ? JSON.stringify(nora.mission) : "";
  const detailJson = nora?.detail ? JSON.stringify(nora.detail) : "";
  useEffect(() => { if (scopeActive && missionJson) window.dispatchEvent(new CustomEvent("growforge:mission-context", { detail: JSON.parse(missionJson) })); }, [missionJson, scopeActive]);
  useEffect(() => { if (scopeActive) window.dispatchEvent(new CustomEvent(DIVE_DETAIL_EVENT, { detail: detailJson ? JSON.parse(detailJson) : null })); }, [detailJson, scopeActive]);
  useEffect(() => () => {
    window.dispatchEvent(new CustomEvent(DIVE_DETAIL_EVENT, { detail: null }));
    window.dispatchEvent(new CustomEvent("growforge:mission-context", { detail: null }));
  }, []);

  // ---- NORA / voice actions (`growforge:mission-action`): translated to the SAME canonical selection actions a click or key dispatches (missionWorktreeAction). Unknown targets change nothing.
  const live = useRef({ worktree, selection, dispatch });
  useEffect(() => { live.current = { worktree, selection, dispatch }; });
  useEffect(() => {
    const onAction = (event: Event) => {
      const { worktree: current, selection: now, dispatch: send } = live.current;
      const action = parseMissionAction((event as CustomEvent<unknown>).detail);
      const plan = action && current ? missionActionPlan(action, current, now) : null;
      if (plan) plan.forEach(send);
    };
    window.addEventListener(MISSION_ACTION_EVENT, onAction);
    return () => window.removeEventListener(MISSION_ACTION_EVENT, onAction);
  }, []);

  // C5C: Explore details = the existing Workbench for the CURRENT selection (select it, then open: the same two actions a click and Enter dispatch).
  // C8 / S1: behind the rollout flag, Explore details opens the new workspace shell (placeholder content) instead of the legacy Workbench. It belongs to the mission it was opened on (a switch closes it).
  const workspaceFlag = useWorkspaceFlag();
  const [workspaceFor, setWorkspaceFor] = useState<string | null>(null);
  const workspaceOpen = workspaceFlag && workspaceFor === missionId;
  // C8 / S2: behind the flag EVERY way into the Workbench (Peek "details", Enter on the selected node, NORA / voice) opens the workspace instead; the selection is unchanged by it.
  const routed = useMemo(() => (workspaceFlag ? (action: SelectionAction) => { if (action.type === "openWorkbench") setWorkspaceFor(missionId); else dispatch(action); } : dispatch), [workspaceFlag, dispatch, missionId]);
  useEffect(() => { live.current.dispatch = routed; });
  const exploreOf = worktree && selectedId ? { state: (workspaceFlag ? (workspaceOpen ? "open" : "ready") : selection.peekOpen && (selection.depth === "workbench" || selection.depth === "focus") ? "open" : workbenchCapabilities(worktree, selectedId) ? "ready" : "none") as "ready" | "open" | "none", onOpen: () => { dispatch({ type: "select", id: selectedId }); if (workspaceFlag) setWorkspaceFor(missionId); else dispatch({ type: "openWorkbench" }); } } : undefined;
  if (!worktree) return <p className={styles.loading} role="status">Reading recorded mission…</p>;
  return <>
    <MissionWorktreeHeader worktree={worktree} selection={selection} dispatch={dispatch} onBack={onClose} phone={phone} />
    {!phone && <MissionIntelPanel worktree={worktree} viewportWidth={w} selectedId={selectedId} explore={exploreOf} />}
    <MissionWorktreeView worktree={worktree} selection={selection} dispatch={routed} onReload={reload} rightInset={phone ? 0 : intelPanelInset(w)}
      coreAddon={phone ? undefined : <MissionSelector embedded reel={reel} currentId={missionId} onSelect={switchMission} hidden={selection.peekOpen && selection.depth !== "peek"} />} />
    {workspaceFlag && <MissionWorkspace worktree={worktree} selectedId={selectedId} open={workspaceOpen} onClose={() => setWorkspaceFor(null)} onReload={reload} />}
  </>;
}
