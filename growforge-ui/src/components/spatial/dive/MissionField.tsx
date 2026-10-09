"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { LensState } from "./LensState";
import { DIVE_TIMING, convergencePoint, pickTravel, strataPlacement } from "./diveDepthModel";
import type { MissionRowState } from "./missionStates";
import styles from "./MissionField.module.css";

/**
 * The Mission Field: mission selection as thin dark-glass strata suspended at slightly different depths inside the shared Dive environment.
 * Presentation only. Every value is handed in already derived from recorded state (title, recorded state label, recorded percent); nothing is
 * invented here, and the filter semantics and counts are exactly those of the previous list.
 *
 * Selecting a stratum does not swap a screen: the chosen stratum comes forward, the others recede, and its trace converges toward the point where
 * the Mission Nucleus resolves; only then is the selection handed to the lens. Reduced motion selects immediately.
 */
export interface StratumItem { id: string; title: string; state: MissionRowState; stateLabel: string; percent: number }
export interface FieldFilter { key: string; label: string; /** What a phone shows (the full label stays the accessible name). */ short?: string; count: number | string }
export type FieldStatus =
  | { kind: "unavailable" }
  | { kind: "empty" }
  | { kind: "no-match"; message: string }
  | { kind: "ready" };

export function MissionField({ items, filters, filter, status, approvalsUnreadable, returning, leaving, onFilter, onSelect }: {
  items: StratumItem[]; filters: FieldFilter[]; filter: string; status: FieldStatus; approvalsUnreadable: boolean; /** Mounted while a mission is being left ("All missions"): the strata unfold at once, overlapping the nucleus' release. */ returning?: boolean; /** A mission was just chosen: the Field stays (inert) while the chosen stratum finishes converging under the resolving nucleus. */ leaving?: boolean;
  onFilter: (key: string) => void; onSelect: (id: string) => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [isReturn] = useState(Boolean(returning));
  const [picked, setPicked] = useState<{ id: string; dx: number; dy: number } | null>(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const pick = (id: string, element: HTMLElement) => {
    if (picked) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const shell = element.closest<HTMLElement>("[data-dive-overview]");
    if (reduced || !shell || DIVE_TIMING.pick <= 0) { onSelect(id); return; }
    const box = element.getBoundingClientRect(), room = shell.getBoundingClientRect();
    // converge on where the nucleus will actually resolve for THIS viewport (graph: centre line; wide / stack: their own nucleus block; see convergencePoint)
    const target = convergencePoint(window.innerWidth, window.innerHeight, room);
    setPicked({ id, dx: target.horizontal ? Math.round(target.x - (box.left + box.width / 2)) : 0, dy: pickTravel(box.top + box.height / 2, target.y) });
    timer.current = setTimeout(() => onSelect(id), DIVE_TIMING.handoff);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
    const buttons = [...(listRef.current?.querySelectorAll<HTMLButtonElement>("button[data-mission-id]") ?? [])];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : Math.min(buttons.length - 1, Math.max(0, at + (event.key === "ArrowDown" ? 1 : -1)));
    event.preventDefault();
    buttons[next]?.focus();
  };

  return <section className={styles.field} data-missions-lens data-dive-inspector data-picking={picked ? "" : undefined} data-return={isReturn || undefined} inert={leaving || undefined} aria-label="Missions">
    <div className={styles.filters} role="group" aria-label="Mission state" data-semantic-id="missions.filter">
      {filters.map(item => <button key={item.key} aria-pressed={filter === item.key} data-mission-state={item.key === "all" ? undefined : item.key} data-semantic-id={`missions.filter.${item.key}`} onClick={() => onFilter(item.key)}>
        <b className={styles.full}>{item.label}</b>{item.short && <b className={styles.short} aria-hidden="true">{item.short}</b>}<span>{item.count}</span>
      </button>)}
    </div>
    {status.kind === "unavailable" ? <LensState kind="unavailable" message="Operational state unavailable." detail="Mission activity is not inferred." />
      : status.kind === "empty" ? <LensState kind="empty" message="No recorded missions." detail="Create one from Mission controls." />
      : status.kind === "no-match" ? <LensState kind="empty" compact message={status.message} />
      : <ul ref={listRef} className={styles.list} aria-label="Recorded missions" onKeyDown={onKeyDown}>{items.map((item, index) => {
        const place = strataPlacement(index);
        return <li key={item.id} className={styles.item} data-plane={place.plane}
          style={{ "--left": place.left, "--w": place.width, "--sl": `${place.slantL}px`, "--sr": `${place.slantR}px`, "--gap": `${place.gap}px`, "--catch": place.catchAt, "--i": index } as CSSProperties}>
          <button className={styles.stratum} data-mission-id={item.id} data-semantic-id={`lens.missions/mission:${item.id}`} data-mission-state={item.state}
            data-picked={picked?.id === item.id ? "" : undefined} style={picked?.id === item.id ? ({ "--dx": `${picked.dx}px`, "--dy": `${picked.dy}px` } as CSSProperties) : undefined}
            tabIndex={picked ? -1 : undefined} title={item.title} onClick={event => pick(item.id, event.currentTarget)}>
            <i className={styles.notch} aria-hidden="true" />
            <i className={styles.catch} aria-hidden="true" /><i className={styles.sweep} aria-hidden="true" />
            <span className={styles.name}>{item.title}</span>
            <small className={styles.meta}>{item.stateLabel} · {item.percent}%</small>
            <b className={styles.trace} aria-hidden="true" style={{ "--p": Math.max(0, Math.min(100, item.percent)) } as CSSProperties} />
          </button>
        </li>;
      })}</ul>}
    {approvalsUnreadable && <LensState kind="degraded" compact message="Approval state unavailable." detail="Queued / waiting cannot be told apart from running right now." />}
  </section>;
}
