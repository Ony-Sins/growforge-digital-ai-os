"use client";

import { GrowForgeGlyph } from "../GrowForgeGlyph";
import type { DiveLens } from "./overviewModel";
import {
  RECENT_ROWS_VISIBLE, type ActivityGraph, type AttentionRow, type HealthRow, type NowView, type RecentRow, type RecentState, type SnapshotCounts, type StripCell,
} from "./overviewBriefingModel";
import styles from "./OverviewBriefing.module.css";

/**
 * Overview regions. Every value shown is a field of the Overview Snapshot (see overviewBriefingModel.ts); nothing here
 * computes a fact. Each region carries `data-surface` so a future NORA briefing can expand, focus or dismiss it, and
 * entity rows carry `data-entity-type` / `data-entity-id` so NORA can focus the same entity the row represents.
 * Symbols are GrowForge glyphs only (GrowForgeGlyph.tsx): no icon library.
 */

function PanelHead({ title }: { title: string }) {
  return <header className={styles.head}><h2>{title}</h2></header>;
}

/** Top summary: type and thin separators, never cards. */
export function OperationalStrip({ cells, onLens }: { cells: StripCell[]; onLens: (lens: DiveLens) => void }) {
  return (
    <div className={styles.strip} data-surface="summary" role="group" aria-label="Operational summary">
      {cells.map((cell) => {
        const body = cell.id === "state" ? (cell.value === "—" ? "State unavailable" : cell.value)
          : cell.id === "executing" ? (cell.value === "—" ? "Live execution unconfirmed" : cell.value === "0" ? "No confirmed live execution" : `${cell.value} executing · confirmed`)
          : cell.id === "approvals" ? (cell.value === "—" ? "Approvals unavailable" : `${cell.value} ${cell.value === "1" ? "approval" : "approvals"}${cell.value === "0" ? "" : " waiting"}`)
          : cell.value === "—" ? "Services unmeasured" : cell.caption === "All reachable" ? "All measured services reachable" : `${cell.caption.replace(" unreachable", "")} services unreachable`;
        const lens = cell.lens;
        return lens
          ? <button key={cell.id} type="button" className={styles.cell} data-cell={cell.id} data-tone={cell.tone === "live" ? "live" : "neutral"} title={cell.title} onClick={() => onLens(lens)}>{body}</button>
          : <div key={cell.id} className={styles.cell} data-cell={cell.id} data-tone={cell.tone} title={cell.title}>{body}</div>;
      })}
    </div>
  );
}


/**
 * Recorded mission outcomes per day. Every point is a count of real job records (see ActivitySeries): completed as a
 * line with area, errors as amber markers, on one shared scale. Quiet days are real zeros. With no or too little
 * history it says so and draws no trend.
 */
function ActivityChart({ graph }: { graph: ActivityGraph }) {
  // The viewBox keeps a fixed aspect (no stretching), so points stay round at every width.
  const W = 280, H = 76, PAD = 6, BASE = H - 7;
  // Completed scales on its own recorded maximum; an error day is one baseline tick (the real count is in its label).
  const completedMax = Math.max(1, ...graph.points.map((p) => p.completed));
  const x = (p: { x: number }) => PAD + p.x * (W - PAD * 2);
  const y = (v: number) => BASE - (v / completedMax) * (BASE - 13);
  const label = `Recorded mission outcomes, ${graph.caption}: ${graph.totals.completed} completed, ${graph.totals.errors} errors`;
  if (graph.state === "unavailable" || graph.state === "empty") {
    return <p className={styles.chartNote} data-graph={graph.state}>{graph.caption}</p>;
  }
  const line = graph.points.map((p, i) => `${i ? "L" : "M"}${x(p).toFixed(1)} ${y(p.completed).toFixed(1)}`).join(" ");
  const area = `${line} L${x(graph.points[graph.points.length - 1]).toFixed(1)} ${BASE} L${x(graph.points[0]).toFixed(1)} ${BASE} Z`;
  const hasCompleted = graph.totals.completed > 0, hasErrors = graph.totals.errors > 0; // legend keys appear only for series that exist
  const first = graph.points[0], lastPoint = graph.points[graph.points.length - 1];
  return (
    <figure className={styles.chart} data-graph={graph.state} data-surface="activity-graph">
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={label}>
        <defs><radialGradient id="gf-glow"><stop offset="0" stopColor="#8fe6f8" stopOpacity="1" /><stop offset=".45" stopColor="#5fd3ee" stopOpacity=".38" /><stop offset="1" stopColor="#5fd3ee" stopOpacity="0" /></radialGradient><radialGradient id="gf-node" cx=".38" cy=".34" r=".7"><stop offset="0" stopColor="#ffffff" /><stop offset=".4" stopColor="#d9f6ff" /><stop offset="1" stopColor="#58bedd" /></radialGradient><linearGradient id="gf-activity-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5fd3ee" stopOpacity=".18" /><stop offset="1" stopColor="#5fd3ee" stopOpacity="0" /></linearGradient></defs>
        <line x1={PAD} x2={W - PAD} y1={BASE} y2={BASE} className={styles.chartBase} />
        {graph.state === "series" && <><path d={area} fill="url(#gf-activity-area)" /><path d={line} className={styles.chartLine} vectorEffect="non-scaling-stroke" /></>}
        {graph.points.filter((p) => p.completed > 0).map((p) => {
          // Glow is data-driven: its size and strength follow this day's real completed count against the window's maximum.
          const k = p.completed / completedMax;
          return (
            <g key={`c${p.day}`} className={styles.chartPoint} tabIndex={0} role="img" aria-label={`${p.label}: ${p.completed} completed`} style={{ "--k": k } as React.CSSProperties}>
              <title>{`${p.label} · ${p.completed} completed`}</title>
              <circle cx={x(p)} cy={y(p.completed)} r={4.5 + k * 4} className={styles.chartGlow} />
              <circle cx={x(p)} cy={y(p.completed)} r="2.6" className={styles.chartDot} />
              <circle cx={x(p)} cy={y(p.completed)} r="9" className={styles.chartHit} />
            </g>
          );
        })}
        {graph.points.filter((p) => p.errors > 0).map((p) => (
          <g key={`e${p.day}`} className={styles.chartErr} data-errors={p.errors} aria-label={`${p.label}: ${p.errors} ${p.errors === 1 ? "error" : "errors"}`}>
            <title>{`${p.label} · ${p.errors} ${p.errors === 1 ? "error" : "errors"}`}</title>
            <rect x={x(p) - 0.9} y={BASE - 8.5} width="1.8" height="9.5" rx=".9" />
          </g>
        ))}
      </svg>
      <figcaption><span>{first.label}</span>{graph.state === "sparse" ? <em>{graph.caption}</em> : <em className={styles.legend} aria-hidden="true">{hasCompleted && <b><i className={styles.keyDot} />Completed</b>}{hasErrors && <b><i className={styles.keyErr} />Error day</b>}</em>}<span>{lastPoint.label}</span></figcaption>
    </figure>
  );
}

/** Recorded counts plus what is happening now. Recorded status and confirmed execution are kept visibly apart. */
export function SnapshotPanel({ counts, graph, now, selectedStageId, onStage, onMission, onLens }: {
  counts: SnapshotCounts | null; graph: ActivityGraph; now: NowView; selectedStageId: string | null; onStage: (id: string) => void; onMission: (id: string) => void; onLens: (lens: DiveLens) => void;
}) {
  const { mission } = now;
  return (
    <section className={`${styles.panel} ${styles.snapshot}`} data-surface="snapshot" aria-label="Operational snapshot">
      <PanelHead title="Operational snapshot" />
      <dl className={styles.counts}>
        <div><dd>{counts ? counts.recordedRunning : "—"}</dd><dt>Running</dt></div>
        <div><dd>{counts ? counts.completed : "—"}</dd><dt>Completed</dt></div>
        <div><dd data-tone={counts && counts.errors ? "attention" : undefined}>{counts ? counts.errors : "—"}</dd><dt>Errors</dt></div>
      </dl>
      <ActivityChart graph={graph} />
      {mission ? (
        <div className={styles.now}>
          <button type="button" className={styles.nowTitle} title={mission.title} onClick={() => onMission(mission.id)}>{mission.title}</button>
          <p className={styles.evidence} data-evidence={mission.evidence}><i aria-hidden="true" />{mission.evidenceLabel}</p>
          <div className={styles.steps}>
            <span className={styles.stageLine} title={now.nextStage ? `${mission.stage ?? "—"} → ${now.nextStage}` : mission.stage ?? undefined}><b>{mission.stage ?? "—"}</b>{now.nextStage && <><GrowForgeGlyph name="reach" size={11} /><em>{now.nextStage}</em></>}</span>
            {now.stages.length > 0 && (
              <ol aria-label={`Recorded stages, ${now.stagesDone} of ${now.stages.length} complete`}>
                {now.stages.map((stage) => (
                  <li key={stage.id}>
                    <button type="button" data-status={stage.status} aria-pressed={selectedStageId === stage.id} aria-label={`${stage.label}: ${stage.statusLabel}`} title={`${stage.label} · ${stage.statusLabel}`} onClick={() => onStage(stage.id)} />
                  </li>
                ))}
              </ol>
            )}
          </div>
          {mission.waiting && <p className={styles.flag}>Waiting on approval</p>}
          {now.more > 0 && <p className={styles.more}>+{now.more} more recorded as running</p>}
          {now.nextStep && <button type="button" className={styles.next} onClick={() => onLens(now.nextStep!.lens)}>{now.nextStep.label}<GrowForgeGlyph name="reach" size={13} /></button>}
        </div>
      ) : (
        <p className={styles.quiet}>No recorded work in progress</p>
      )}
    </section>
  );
}

/**
 * System health, by progressive disclosure. Healthy: collapsed to one line. Degraded: opened, listing only the services
 * that were measured unreachable. Reachability is a measurement; latency appears only if it was measured. Nothing derived
 * is shown, because nothing else is measured.
 */
export function HealthDisclosure({ rows, onOpen }: { rows: HealthRow[] | null; onOpen: () => void }) {
  const down = rows ? rows.filter((row) => !row.reachable) : [];
  const degraded = down.length > 0;
  return (
    <details className={`${styles.panel} ${styles.health}`} data-surface="health" data-degraded={degraded} open={degraded}>
      <summary><span>System health</span>{degraded && <b className={styles.healthState}>Degraded</b>}<GrowForgeGlyph name="fold" size={13} /></summary>
      {rows === null ? (
        <p className={styles.quiet}>Services not measured in this view.</p>
      ) : rows.length === 0 ? (
        <p className={styles.quiet}>No measured services.</p>
      ) : (
        <ul className={styles.services}>
          {(degraded ? down : rows).map((row) => (
            <li key={row.id} data-reachable={row.reachable} data-entity-type="service" data-entity-id={row.id}><span>{row.name}</span><em>{row.detail}</em></li>
          ))}
        </ul>
      )}
      <button type="button" className={styles.next} onClick={onOpen}>Open Tools</button>
    </details>
  );
}

/** Renders nothing when nothing needs attention: no empty placeholder. */
export function AttentionPanel({ rows, hidden, expanded, onReveal, onInspect }: { rows: AttentionRow[]; hidden: number; expanded: boolean; onReveal: () => void; onInspect: (row: AttentionRow) => void }) {
  if (!rows.length) return null;
  return (
    <section className={styles.panel} data-surface="attention" aria-label="Needs attention">
      <PanelHead title="Attention" />
      <ul className={styles.rows}>
        {rows.map((row) => (
          <li key={row.id} data-priority={row.priority} data-count={row.count} data-entity-type={row.entity.type} data-entity-id={row.entity.id}>
            <button type="button" onClick={() => onInspect(row)}>
              <span className={styles.rowMark} aria-hidden="true"><GrowForgeGlyph name={row.glyph} size={20} strokeWidth={1.3} /></span>
              <b>{row.headline}</b>
              <span className={styles.rowSub} title={row.subject}>{row.subject}</span>
            </button>
          </li>
        ))}
      </ul>
      {(hidden > 0 || expanded) && <button type="button" className={styles.reveal} aria-expanded={expanded} onClick={onReveal}>{expanded ? "Show top priorities" : `Reveal ${hidden} more ${hidden === 1 ? "priority" : "priorities"}`}<GrowForgeGlyph name="fold" size={13} /></button>}
    </section>
  );
}

/** Secondary: a few real events, newest first. Not a log. */
export function RecentPanel({ rows, state = "populated", onOpen }: { rows: RecentRow[]; state?: RecentState; onOpen: (row: RecentRow) => void }) {
  return (
    <section className={`${styles.panel} ${styles.recentCard}`} data-surface="recent" aria-label="Recent activity">
      <PanelHead title="Recent" />
      {state === "unavailable" ? (
        <p className={styles.quiet}>Activity unavailable in this view.</p>
      ) : rows.length === 0 ? (
        <p className={styles.quiet}>No recorded activity.</p>
      ) : (
        <ul className={styles.recent}>
          {rows.slice(0, RECENT_ROWS_VISIBLE).map((row) => (
            <li key={row.id} data-outcome={row.outcome} data-entity-id={row.missionId ?? undefined}>
              <button type="button" onClick={() => onOpen(row)}>
                <time dateTime={row.occurredAt ?? undefined} title={row.when}>{row.dateLabel}</time>
                <b title={row.subject}>{row.subject}</b>
                <span>{row.outcomeLabel}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * NORA Brief: the place the future briefing starts, set into the stage rather than standing as a card. Foundation only:
 * it speaks nothing, calls no model and shows no generated text. One state, one action. It carries no navigation: the
 * lens rail already does that.
 */
export function BriefPanel({ state }: { state: string }) {
  return (
    <section className={styles.brief} data-surface="brief" aria-label="NORA Brief">
      <span className={styles.briefMark} aria-hidden="true"><GrowForgeGlyph name="brief" size={22} strokeWidth={1.3} /></span>
      <div className={styles.briefBody}><h2>NORA Brief</h2><p className={styles.briefStatus}>{state}</p></div>
      <button type="button" className={styles.briefMe} data-brief-me data-foundation="true" aria-disabled="true" title="Briefing is not available yet" onClick={(event) => event.preventDefault()}>Brief me</button>
    </section>
  );
}
