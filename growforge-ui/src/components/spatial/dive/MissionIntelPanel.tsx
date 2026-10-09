"use client";

/**
 * The permanent Mission Intelligence panel, in the Control AI reference's structure (C7A): 1. identity (type, title, recorded description), 2. a status / context row holding the recorded status,
 * one recorded timestamp and `Explore details`, 3. one headline metric, 4. a 2 x 2 grid of key figures, 5. one compact analysis card (the body, see MissionIntelBody). It follows the Graph selection and shows
 * recorded facts only; a reference field with no truthful GrowForge equivalent is simply absent.
 */
import { useEffect } from "react";
import type { MissionWorktree } from "./missionWorktree";
import { intelIdentityOf, intelSummaryOf } from "./missionIntelHeader";
import { intelOccupied, intelPanelWidth, INTEL_MARGIN, INTEL_TOP } from "./missionIntelLayout";
import { IntelBody } from "./MissionIntelBody";
import styles from "./MissionIntelPanel.module.css";

export function MissionIntelPanel({ worktree, viewportWidth, selectedId, explore }: { worktree: MissionWorktree; viewportWidth: number; /** The Graph's current selection: everything here follows it. */ selectedId?: string | null; /** Opens the EXISTING Workbench for the current selection (the lens owns the selection state); `open` while it is already open, `none` when this entity has no detail surface. */ explore?: { state: "ready" | "open" | "none"; onOpen: () => void }; }) {
  const header = intelIdentityOf(worktree, selectedId), summary = intelSummaryOf(worktree, selectedId);
  // While the panel is mounted the NORA chatbar and the lens rail re-centre in the space left of it (globals.css / DiveOverview.module.css read `--intel-inset`).
  const occupied = intelOccupied(viewportWidth);
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-intel-inset", ""); root.style.setProperty("--intel-inset", `${occupied}px`);
    return () => { root.removeAttribute("data-intel-inset"); root.style.removeProperty("--intel-inset"); };
  }, [occupied]);
  return <aside className={styles.panel} data-intel-panel role="region" aria-label={`Mission intelligence: ${header.eyebrow.toLowerCase()} ${header.title}`} style={{ width: intelPanelWidth(viewportWidth), top: INTEL_TOP, bottom: INTEL_MARGIN, right: INTEL_MARGIN }}>
    <header className={styles.head}>
      <p className={styles.eyebrow}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.4 13.7 4.7v6.6L8 14.6 2.3 11.3V4.7Z" /><circle cx="8" cy="8" r="1.8" /></svg>{header.eyebrow.toUpperCase()}</p>
    </header>
    <h2 className={styles.title} title={header.title}>{header.title}</h2>
    {header.brief ? <p className={styles.brief} title={header.brief}>{header.brief}</p> : <p className={styles.brief} data-empty>{header.eyebrow === "Mission" ? "No brief is recorded." : "No description is recorded."}</p>}
    <div className={styles.status} data-slot="status">
      <span className={styles.pill} data-tone={header.status.tone} title={header.status.note}><i aria-hidden="true" />{header.status.label}</span>
      <span className={styles.context} title={summary.context}>{summary.context}</span>
      {explore && explore.state !== "none" && <button type="button" className={styles.explore} data-explore data-open={explore.state === "open" || undefined} aria-pressed={explore.state === "open"} onClick={explore.state === "ready" ? explore.onOpen : undefined}
        aria-label={`Explore details of ${header.eyebrow.toLowerCase()} ${header.title}`}>Explore details<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h8.2M8.2 4.4 11.8 8l-3.6 3.6" /></svg></button>}
    </div>
    <IntelBody summary={summary} />
  </aside>;
}
