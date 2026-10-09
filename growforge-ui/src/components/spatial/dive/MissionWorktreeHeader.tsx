"use client";

/**
 * Contextual Missions header (W4). The top navigation already says "Dive In" and the lens rail already says "Missions", so no eyebrow / large title /
 * purpose line: the space shows information. Index: recorded-mission counts. Selected: the mission's identity, state and counts, the
 * Context Thread: NORA's current working context, rendered from the SAME canonical selection that drives NORA, the ancestry highlight and the Peek.
 */
import type { MissionWorktree } from "./missionWorktree";
import { contextThread } from "./missionWorktreeSelection";
import type { SelectionAction, WorktreeSelection } from "./missionWorktreeSelection";
import styles from "./MissionWorktreeHeader.module.css";

export interface IndexMetric { label: string; value: number | string | null; tone?: "live" | "warn" | "ok" }

export function MissionsIndexHeader({ metrics, recorded, note }: { metrics?: IndexMetric[]; recorded: number | null; note?: string }) {
  return <header className={styles.header} data-mission-header="index">
    <h1 className={styles.srOnly}>Missions</h1>
    <ul className={styles.metrics} aria-label="Missions state">
      <li><strong>{recorded ?? "—"}</strong> recorded</li>
      {metrics?.map(m => <li key={m.label} data-tone={m.tone}><strong>{m.value ?? "—"}</strong> {m.label}</li>)}
    </ul>
    {note && <span className={styles.note} role="status">{note}</span>}
  </header>;
}

const STATE_TEXT: Record<string, string> = { running: "recorded running", done: "done", error: "error" };

export function MissionWorktreeHeader({ worktree, selection, dispatch, onBack, phone }: {
  worktree: MissionWorktree; selection: WorktreeSelection; dispatch: (action: SelectionAction) => void; onBack: () => void; phone: boolean;
}) {
  const mission = worktree.mission, live = mission.execution.liveEvidence;
  const thread = contextThread(worktree, selection.selectedId);
  const state = mission.status === "running" && live === "confirmed" ? "running · executor confirmed" : STATE_TEXT[mission.status] ?? mission.status;
  return <header className={styles.header} data-mission-header="selected" data-phone={phone || undefined}>
    <h1 className={styles.srOnly}>Missions: {mission.title}</h1>
    <button className={styles.back} data-mission-back onClick={onBack} aria-label="Back to mission selection">
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M9.8 3.2 5 8l4.8 4.8" /></svg><span>All missions</span>
    </button>
    <p className={styles.identity} title={mission.title}>
      <b>{mission.title}</b>
      <span data-state={mission.status} data-live={live === "confirmed" || undefined}>{state} · {mission.percent}% recorded</span>
    </p>
    <p className={styles.counts} aria-label="Recorded counts">{worktree.phases.length} of {worktree.canonicalPhaseOrder.length} phases · {worktree.departments.length} departments · {worktree.steps.length} steps</p>
    <nav className={styles.thread} aria-label="NORA's current working context" data-context-thread>
      <span className={styles.srOnly}>NORA&apos;s current working context: </span>
      <span className={styles.nora} aria-hidden="true">NORA</span>
      <ol>
        {thread.map((segment, i) => <li key={segment.id} data-kind={segment.kind}>
          <button onClick={() => dispatch({ type: "select", id: segment.id })} aria-current={i === thread.length - 1 ? "location" : undefined} title={segment.label}>{segment.label}</button>
        </li>)}
      </ol>
    </nav>
  </header>;
}
