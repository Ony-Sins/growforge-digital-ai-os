"use client";

/**
 * The body of the Intelligence panel (C7A), in the Control AI reference's structure, for every selection: one headline metric card, a 2 x 2 grid of key figures, one compact analysis card.
 * Every value comes from `intelSummaryOf` (recorded facts only). The detailed lists (phases, department steps, fact tables) live in Explore details / the Workbench.
 */
import type { IntelSummary } from "./missionIntelHeader";
import styles from "./MissionIntelBody.module.css";

export function IntelBody({ summary }: { summary: IntelSummary }) {
  const { headline, segments, instrument, tiles, analysis } = summary;
  return <div className={styles.wrap} data-slot="intel-body">
    <section className={styles.headline} data-slot="headline" aria-label={headline.label} title={headline.note}>
      <div className={styles.fig}><span>{headline.label}</span><b>{headline.text}</b>{headline.meta && <small>{headline.meta}</small>}</div>
      <div className={styles.state}>
        {instrument?.kind === "distribution" && <span className={styles.dots} data-instrument="distribution" role="img" aria-label={`Recorded states: ${segments.map(seg => `${seg.count} ${seg.label}`).join(", ")}`}>
          {instrument.columns.map(col => <span key={col.status} className={styles.col} data-s={col.status} data-empty={col.dots === 0 || undefined}>{Array.from({ length: col.dots }, (_, n) => <i key={n} />)}</span>)}</span>}
        {instrument?.kind === "progress" && <span className={styles.track} data-instrument="progress" role="img" aria-label={`Recorded progress ${instrument.percent}%`}>
          {Array.from({ length: instrument.dots }, (_, n) => <i key={n} data-on={n < instrument.filled || undefined} />)}</span>}
        <span className={styles.legend}>{segments.length ? segments.map(seg => <em key={seg.status} data-s={seg.status}><i aria-hidden="true" />{seg.count} {seg.label}</em>) : null}{instrument?.kind === "distribution" && instrument.unit > 1 && <em className={styles.unit}>1 dot = {instrument.unit}</em>}</span>
      </div>
    </section>
    {tiles.length > 0 && <div className={styles.tiles} data-slot="kpis">{tiles.map(tile => <section key={tile.label} className={styles.tile} data-tone={tile.tone} title={tile.source}><b>{tile.value}</b><span>{tile.label}</span>{tile.sub && <small>{tile.sub}</small>}</section>)}</div>}
    <section className={styles.analysis} data-slot="analysis" aria-label="Analysis">
      <h3><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 1.8 7.1 5 10.3 6.1 7.1 7.2 6 10.4 4.9 7.2 1.7 6.1 4.9 5Z" /><path d="M11.6 8.4 12.3 10.3 14.2 11 12.3 11.7 11.6 13.6 10.9 11.7 9 11 10.9 10.3Z" /></svg>Analysis</h3>
      <div className={styles.card}><b>{analysis.lead}</b>{analysis.lines.map(line => <p key={line}>{line}</p>)}</div>
    </section>
  </div>;
}
