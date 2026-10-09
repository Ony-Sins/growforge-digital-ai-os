"use client";

/**
 * Missions adapter for the workspace shell, STAGE S2: the REAL recorded Workbench / Focus content inside the shell. It adds no data model and no business logic: the rail is `workbenchCapabilities`, the
 * content is `workbenchContentOf` rendered by the same `WorkbenchReading` the legacy planes use, the identity is `intelIdentityOf` + `contextThread`, and the approval actions are the same components.
 *
 * What differs from the legacy planes is only presentation and the navigation model:
 *  - the workspace keeps its OWN entity / section / trail (picking a step, department or dependency inside it retargets the workspace, "Back" returns along the trail); the Graph underneath keeps its selection and
 *    geometry untouched. It follows an external selection change (NORA) while open.
 *  - Focus is the shell's reading mode (the same blocks at the larger reading scale); it is offered for every section.
 *  - while an approval or change request is being confirmed / typed / saved the workspace asks before it is closed, and it does not navigate away from the record that holds it.
 * Legacy Workbench and Focus stay in place (flag OFF) until S2 is verified.
 */
import { useCallback, useRef, useState } from "react";
import { WorkspaceShell, useWorkspaceViewport, WORKSPACE_BREAKPOINTS, type WorkspaceMode } from "../workspace-shell";
import type { MissionWorktree } from "./missionWorktree";
import { intelIdentityOf } from "./missionIntelHeader";
import { contextThread } from "./missionWorktreeSelection";
import { workbenchCapabilities, type WorkbenchSectionId } from "./missionWorkbench";
import { workbenchContentOf } from "./missionWorkbenchContent";
import { WorkbenchReading } from "./WorkbenchReading";
import { PlanApprovalAction } from "./PlanApprovalAction";
import { ToolApprovalsEntry } from "./ToolApprovalsEntry";
import { RevisionRequestAction } from "./RevisionRequestAction";
import styles from "./MissionWorkspace.module.css";

/** What the workspace puts under glass (the Mission Graph, the Intelligence sidebar, the contextual header) and what stays live beside it (the NORA companion). */
export const MISSION_BACKGROUND = ["[data-worktree]", "aside[data-intel-panel]", "header[data-mission-header]"] as const;
/** S2.2A: the workspace grows out of (and contracts back into) the Intelligence Panel. */
const intelPanel = () => document.querySelector<HTMLElement>("aside[data-intel-panel]");
export const NORA_COMPANION = [".studio-command-dock-wrapper", ".nora-conversation"] as const;

interface Step { entityId: string; section: WorkbenchSectionId }
interface Nav { entityId: string | null; section: WorkbenchSectionId | null; trail: Step[] }

export function MissionWorkspace({ worktree, selectedId, open, onClose, onReload }: { worktree: MissionWorktree; selectedId: string | null; open: boolean; onClose: () => void; onReload?: () => void }) {
  const [mode, setMode] = useState<WorkspaceMode>("workspace");
  const [nav, setNav] = useState<Nav>({ entityId: selectedId, section: null, trail: [] });
  const [seen, setSeen] = useState({ open, selectedId });
  const [notice, setNotice] = useState<string | null>(null);
  // Opening (or an external selection change while open, e.g. a NORA action) starts the workspace on that entity; closing leaves the state to be reset by the next opening.
  if (seen.open !== open || (open && seen.selectedId !== selectedId)) {
    setSeen({ open, selectedId });
    if (open) { setNav({ entityId: selectedId, section: null, trail: [] }); setNotice(null); if (!seen.open) setMode("workspace"); }
  }
  const viewport = useWorkspaceViewport();
  const phone = viewport.w <= WORKSPACE_BREAKPOINTS.full;

  const caps = workbenchCapabilities(worktree, nav.entityId) ?? workbenchCapabilities(worktree, selectedId) ?? workbenchCapabilities(worktree, worktree.mission.id);
  const entityId = caps?.entityId ?? worktree.mission.id;
  const section: WorkbenchSectionId = caps ? (nav.section && caps.sections.some(s => s.id === nav.section) ? nav.section : caps.defaultSection) : "overview";
  const active = caps?.sections.find(s => s.id === section);
  const content = open ? workbenchContentOf(worktree, entityId, section) : null;
  const identity = intelIdentityOf(worktree, entityId);
  const context = contextThread(worktree, entityId).slice(0, -1).map(seg => seg.label).join(" › ");

  // approvals / change requests in progress: the actions report here; closing and leaving the record are guarded
  const busy = useRef(new Map<string, string>());
  const reportPlan = useCallback((on: boolean) => { if (on) busy.current.set("plan", "A plan approval is in progress. Closing now discards it."); else busy.current.delete("plan"); }, []);
  const reportRevision = useCallback((on: boolean) => { if (on) busy.current.set("revision", "An unsent change request will be discarded."); else busy.current.delete("revision"); }, []);
  const guard = () => Array.from(busy.current.values())[0] ?? null;

  const go = (target: string) => {
    if (busy.current.size) { setNotice("Finish or cancel the approval in progress before leaving this record."); return; }
    if (target === entityId || !workbenchCapabilities(worktree, target)) return;
    setNotice(null);
    setNav(current => ({ entityId: target, section: null, trail: [...current.trail, { entityId, section }] }));
  };
  const back = () => {
    if (busy.current.size) { setNotice("Finish or cancel the approval in progress before leaving this record."); return; }
    setNotice(null);
    setNav(current => { const last = current.trail[current.trail.length - 1]; return last ? { entityId: last.entityId, section: last.section, trail: current.trail.slice(0, -1) } : current; });
  };
  const choose = (id: string) => { setNotice(null); setNav(current => ({ ...current, entityId, section: id as WorkbenchSectionId })); };
  const previous = nav.trail[nav.trail.length - 1];
  const previousTitle = previous ? intelIdentityOf(worktree, previous.entityId).title : null;

  const isMission = entityId === worktree.mission.id;
  const meta = active ? [active.provenance, active.count !== undefined ? `${active.count} recorded` : undefined, active.secondaryRead ? `from ${active.secondaryRead}` : undefined].filter(Boolean).join(" · ") : "";
  const rail = (caps?.sections ?? []).map(s => ({ id: s.id as string, label: s.label }));
  return <WorkspaceShell open={open} onClose={onClose} eyebrow={`${identity.eyebrow} · Workspace`} title={identity.title} context={context || undefined}
    status={<span className={styles.pill} data-tone={identity.status.tone} title={identity.status.note}><i aria-hidden="true" />{identity.status.label}</span>}
    rail={rail} section={section} onSection={choose} mode={mode} onMode={setMode} guard={guard}
    returnTo={() => document.querySelector<HTMLElement>("[data-explore]") ?? document.querySelector<HTMLElement>("[data-worktree] button[data-id][aria-pressed=\"true\"], [data-worktree] button[data-id][aria-current]")}
    backgroundSelectors={MISSION_BACKGROUND} companionSelectors={NORA_COMPANION} origin={intelPanel}>
    <div className={styles.page} data-entity={entityId} data-section={section} data-kind={caps?.profile} data-mode={mode}>
      {previousTitle && <p className={styles.trail}><button type="button" className={styles.back} data-back onClick={back}><i aria-hidden="true">‹</i><span>Back to {previousTitle}</span></button></p>}
      {notice && <p className={styles.notice} role="status" data-notice>{notice}</p>}
      {identity.brief && section === "overview" && <p className={styles.purpose}>{identity.brief}</p>}
      <h3 className={styles.section}>{active?.label ?? "Overview"}</h3>
      {/* the plan decision / change request belong to the MISSION's own sections only (as in the legacy Workbench). They stay mounted while the mission is shown, so a half-finished one survives a section switch. */}
      {isMission && onReload && <>
        <div hidden={section !== "approvals"}><PlanApprovalAction worktree={worktree} onApproved={onReload} onActive={reportPlan} />{/* the tool-approvals banner is a global HUD surface outside this layer: using its entry hands over to it (the workspace closes; it holds no unsaved work of its own here) */}
          <div onClick={event => { if ((event.target as HTMLElement).closest("button")) onClose(); }}><ToolApprovalsEntry worktree={worktree} /></div></div>
        <div hidden={section !== "requestedChanges"}><RevisionRequestAction worktree={worktree} onRequested={onReload} onActive={reportRevision} /></div>
      </>}
      {content
        ? <WorkbenchReading content={content} phone={phone} scale={mode === "reading" ? "focus" : undefined} onSelect={go} />
        : <div className={styles.empty} data-empty>
          {meta && <p className={styles.meta}>{meta}</p>}
          <p>{active?.reason ?? "No recorded content is available for this section."}</p>
        </div>}
    </div>
  </WorkspaceShell>;
}
