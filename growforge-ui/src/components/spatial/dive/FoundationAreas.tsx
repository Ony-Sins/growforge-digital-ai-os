"use client";

import type { ReactNode } from "react";
import styles from "./FoundationAreas.module.css";

/**
 * Structural areas of a lens (grid) or the anchors of a selected entity (list).
 * An area declares what it WILL hold and what is true right now. State drives
 * presentation: a zero is only shown when zero is a measured fact.
 */
export type FoundationAreaState = "loading" | "available" | "empty" | "unavailable" | "not-tracked" | "degraded";

export type FoundationArea = {
  id: string;
  label: string;
  state: FoundationAreaState;
  /** Truthful one-line status. Required: an area is never an unlabeled blank. */
  summary: string;
  /** null or undefined means unknown or not applicable, shown as nothing. */
  count?: number | null;
  action?: { label: string; onClick: () => void; disabled?: boolean; title?: string };
  /** Free content for an area that has real data. */
  children?: ReactNode;
};

const STATE_LABELS: Record<FoundationAreaState, string> = {
  loading: "Loading", available: "Recorded", empty: "None recorded", unavailable: "Unavailable", "not-tracked": "Not tracked yet", degraded: "Degraded",
};

/** Ordered structure of a procedure. States what a workflow is made of, never that any run happened. */
export function StageStrip({ stages, label, note }: { stages: { id: string; label: string }[]; label: string; note?: string }) {
  return <section className={styles.stages} aria-label={label} data-stage-strip>
    <ol>{stages.map(stage => <li key={stage.id} data-stage-id={stage.id}>{stage.label}</li>)}</ol>
    {note && <p>{note}</p>}
  </section>;
}

export function FoundationAreas({ areas, label, variant = "grid" }: { areas: FoundationArea[]; label: string; variant?: "grid" | "list" }) {
  return <section className={`${styles.areas} ${variant === "list" ? styles.list : styles.grid}`} aria-label={label} data-foundation-areas>
    {areas.map(area => <article key={area.id} className={styles.area} data-area-id={area.id} data-area-state={area.state}>
      <header><h3>{area.label}</h3>{typeof area.count === "number" && <span className={styles.count}>{area.count}</span>}</header>
      <p className={styles.summary}><i aria-hidden="true" /><span className={styles.stateLabel}>{STATE_LABELS[area.state]}</span>{area.summary}</p>
      {area.children}
      {area.action && <button type="button" className={styles.action} onClick={area.action.onClick} disabled={area.action.disabled} title={area.action.title} data-area-action={area.id}>{area.action.label}</button>}
    </article>)}
  </section>;
}
