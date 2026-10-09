"use client";

/**
 * The selection-aware analytics instrument (W7.2). One renderer for two depths of the SAME model (missionAnalytics):
 *   peek  the contextual intelligence attached to the selection: headline percent, a state composition bar, six key instruments, the cost line.
 *   full  the Workbench Overview header: every group, the token split, the real distributions, and where each value comes from.
 * No cards, no pills, no KPI tiles with chrome: hairline-separated instruments, thin bars. Billed cost and the price-table estimate are always two separate lines.
 */
import type { Analytics, Distribution, Metric, StatusSegment } from "./missionAnalytics";
import { compactNumber, PEEK_COMPACT_TILES } from "./missionAnalytics";
import { costMetric } from "./missionIntelHeader";
import styles from "./AnalyticsInstrument.module.css";

export function StateBar({ segments, total }: { segments: StatusSegment[]; total: number }) {
  return <span className={styles.bar} role="img" aria-label={segments.map(s => `${s.count} ${s.label}`).join(", ")}>
    {segments.map(s => <i key={s.status} data-s={s.status} style={{ flexGrow: s.count }} title={`${s.count} of ${total} ${s.label}`} />)}
  </span>;
}
const legend = (segments: StatusSegment[]) => segments.map(s => `${s.count} ${s.label}`).join(" · ");

function Tile({ m }: { m: Metric }) {
  return <div className={styles.tile} data-tone={m.tone} title={m.source}><dt>{m.label}</dt><dd>{m.value}</dd>{m.sub && <small>{m.sub}</small>}</div>;
}
function CostLine({ a }: { a: Analytics }) {
  return <p className={styles.cost}><span><b>Billed</b> {a.cost.billed}</span><span title={a.cost.estimateNote}><b>Estimate</b> {a.cost.estimate}</span></p>;
}
function Distributions({ list, onSelect }: { list: Distribution[]; onSelect?: (id: string) => void }) {
  return <>{list.map(d => {
    const max = Math.max(...d.rows.map(r => r.value));
    return <section key={d.title} className={styles.dist} title={d.source}>
      <h6>{d.title}</h6>
      <ul>{d.rows.map(r => <li key={r.label}>
        {r.target && onSelect ? <button onClick={() => onSelect(r.target!)} data-target={r.target}>{r.label}</button> : <span>{r.label}</span>}
        <i style={{ ["--w" as string]: `${Math.max(3, (100 * r.value) / max)}%` }} aria-hidden="true" /><b>{r.display}</b>
      </li>)}</ul>
    </section>;
  })}</>;
}

/** C7F: the Workbench shows the SAME model in three places. `overview` = the compact summary row (Completion, Elapsed, Steps, API cost), the recorded state bar and the decisions; `execution` = progress, state and timing detail;
 *  `usage` = provider / model, the token split and the distributions (the totals, estimate and billed-cost line are the section's own facts). Together they carry every metric the old single Overview instrument showed. */
export type AnalyticsPart = "overview" | "execution" | "usage";
const PART_GROUPS: Record<AnalyticsPart, string[]> = { overview: ["Decisions"], execution: ["Progress", "State", "Time", "Structure"], usage: [] };
/** C7G: the Usage section's canonical breakdown (UsageBreakdownView) carries calls, tokens, provider / model and cost; its instrument keeps only the distributions over OTHER dimensions (department / phase / step). */
const allMetrics = (a: Analytics) => [...a.tiles, ...a.groups.flatMap(g => g.metrics)];
/** The four cells of the Overview's one summary row. Every value is an existing recorded metric; a step has no step count, so its cell is its recorded state. */
export function summaryCells(a: Analytics): Metric[] {
  const all = allMetrics(a);
  const pick = (labels: string[]) => all.find(m => labels.includes(m.label));
  const missing = (label: string): Metric => ({ label, value: "Not recorded", tone: "quiet", source: "Nothing is recorded for this." });
  const time = pick(["Elapsed", "Duration"]);
  const steps = pick(["Steps"]) ?? (a.kind === "step" ? (() => { const st = a.groups.flatMap(g => g.metrics).find(m => m.label === "Recorded state"); return st ? { ...st, label: "State" } : missing("State"); })() : missing("Steps"));
  return [
    { label: "Completion", value: a.headline.text, sub: a.headline.label, tone: a.headline.percent === null ? "quiet" : undefined, source: a.headline.source },
    { ...(time ?? missing("Elapsed")), label: "Elapsed" },
    steps,
    costMetric(a.cost),
  ];
}
function SummaryRow({ a }: { a: Analytics }) {
  return <dl className={styles.summary} aria-label="Summary">{summaryCells(a).map(m => <div key={m.label} className={styles.sum} data-tone={m.tone} title={m.source}><dt>{m.label}</dt><dd>{m.value}</dd>{m.sub && <small>{m.sub}</small>}</div>)}</dl>;
}

export function AnalyticsInstrument({ analytics: a, variant, onSelect, compact, part }: { analytics: Analytics; variant: "peek" | "full"; onSelect?: (id: string) => void; /** Peek on a short stage: the first three instruments only. */ compact?: boolean; /** The Workbench part (full variant only); omitted = everything. */ part?: AnalyticsPart }) {
  const headline = <div className={styles.headline} title={a.headline.source}><b data-empty={a.headline.percent === null || undefined}>{a.headline.text}</b><span>{a.headline.label}</span></div>;
  const comp = a.composition && a.composition.total > 0 && <div className={styles.comp} title={a.composition.source}><StateBar segments={a.composition.segments} total={a.composition.total} /><small>{legend(a.composition.segments)}</small></div>;
  if (variant === "peek") return <div className={styles.an} data-variant="peek" data-analytics={a.kind}>
    {headline}{!compact && comp}
    <dl className={styles.tiles}>{(compact ? a.tiles.slice(0, PEEK_COMPACT_TILES) : a.tiles).map(m => <Tile key={m.label} m={m} />)}</dl>
    <CostLine a={a} />
  </div>;
  const groups = part ? a.groups.filter(g => PART_GROUPS[part].includes(g.title)) : a.groups;
  const showSplit = !part, showDist = !part || part === "usage";
  const dists = part === "usage" ? a.distributions.filter(d => !/provider · model/i.test(d.title)) : a.distributions;
  const derive = [...groups.flatMap(g => g.metrics), ...(showDist ? dists.map(d => ({ label: d.title, source: d.source })) : [])];
  return <div className={styles.an} data-variant="full" data-analytics={a.kind} data-part={part}>
    {part === "overview" ? <SummaryRow a={a} /> : !part && headline}{(!part || part === "overview") && comp}
    {groups.map(g => <section key={g.title} className={styles.group}>
      <h6>{g.title}</h6>
      <dl>{g.metrics.map(m => <div key={m.label} className={styles.row} data-tone={m.tone} data-wide={m.value.length > 16 || (m.sub?.length ?? 0) > 22 || undefined} title={m.source}><dt>{m.label}</dt><dd>{m.value}{m.sub && <small>{m.sub}</small>}</dd></div>)}</dl>
    </section>)}
    {showSplit && a.split && <section className={styles.dist} title={a.split.source}>
      <h6>Input vs output tokens</h6>
      <span className={styles.split} role="img" aria-label={`${a.split.input} input tokens, ${a.split.output} output tokens`}><i data-p="in" style={{ flexGrow: a.split.input }} /><i data-p="out" style={{ flexGrow: a.split.output }} /></span>
      <small className={styles.splitText}>in {compactNumber(a.split.input)} · out {compactNumber(a.split.output)}</small>
    </section>}
    {showDist && <Distributions list={dists} onSelect={onSelect} />}
    {derive.length > 0 && part !== "overview" && <details className={styles.derive}>
      <summary>Where these values come from</summary>
      <dl>{derive.map((m, i) => <div key={`${m.label}:${i}`}><dt>{m.label}</dt><dd>{m.source}</dd></div>)}</dl>
    </details>}
  </div>;
}
