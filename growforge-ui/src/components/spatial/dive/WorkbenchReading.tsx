"use client";

/**
 * Renderer for the W5.3A reading content. It understands the semantic block kinds of missionWorkbenchContent (fact bands, record groups, relationship rows,
 * output text, usage records, approval / consultation records, step rows, empty / unavailable states); it is NOT a generic JSON renderer and never prints raw JSON.
 * Editorial / forensic: fact bands -> structured records -> output blocks -> relationships. No cards, no KPI tiles, no pills.
 */
import { useState, type ReactNode } from "react";
import type { Block, Fact, FindingRow, LedgerRow, RelationItem, ReviewRow, SourceRow, StepRow, UsageRow, WorkbenchContent } from "./missionWorkbenchContent";
import { AnalyticsInstrument } from "./AnalyticsInstrument";
import { breakdownCostText, compactNumber, formatDuration, type ExecutionTimeline, type UsageBreakdown } from "./missionAnalytics";
import styles from "./WorkbenchReading.module.css";

/* ------------------------------------------------------------------ output text (plain, or light markdown: headings, lists, fences, tables, **bold**, `code`) */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g).map((part, i) => part.startsWith("**") && part.endsWith("**") && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : part.startsWith("`") && part.endsWith("`") && part.length > 2 ? <code key={i}>{part.slice(1, -1)}</code> : part);
}
function Formatted({ text, format }: { text: string; format: "plain" | "markdown" }) {
  if (format === "plain") return <p className={styles.plain}>{text}</p>;
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let i = 0, k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*```/.test(line)) { const body: string[] = []; i++; while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++]); i++; out.push(<pre key={k++} className={styles.fence}>{body.join("\n")}</pre>); continue; }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) { out.push(<h5 key={k++} className={styles.md} data-level={Math.min(heading[1].length, 4)}>{inline(heading[2])}</h5>); i++; continue; }
    if (/^\s*\|/.test(line)) { const rows: string[] = []; while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]); out.push(<pre key={k++} className={styles.fence}>{rows.join("\n")}</pre>); continue; }
    const item = /^\s*([-*•]|\d+[.)])\s+/.exec(line);
    if (item) {
      const ordered = /\d/.test(item[1]), items: ReactNode[] = [];
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) { items.push(<li key={items.length}>{inline(lines[i].replace(/^\s*([-*•]|\d+[.)])\s+/, ""))}</li>); i++; }
      out.push(ordered ? <ol key={k++} className={styles.list}>{items}</ol> : <ul key={k++} className={styles.list}>{items}</ul>); continue;
    }
    if (!line.trim()) { i++; continue; }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(\s*```|#{1,6}\s|\s*\||\s*([-*•]|\d+[.)])\s+)/.test(lines[i])) para.push(lines[i++]);
    out.push(<p key={k++} className={styles.para}>{inline(para.join("\n"))}</p>);
  }
  return <div className={styles.md}>{out}</div>;
}

/* ------------------------------------------------------------------ primitives */
function FactBand({ facts, onSelect }: { facts: Fact[]; onSelect: (id: string) => void }) {
  return <dl className={styles.facts}>{facts.map((f, i) => <div key={`${f.label}:${i}`} className={styles.fact} data-tone={f.tone}>
    <dt>{f.label}</dt>
    <dd>{f.target ? <button className={styles.inline} onClick={() => onSelect(f.target!)} data-target={f.target}>{f.value}</button> : f.value}{f.provenance && <small className={styles.prov}> {f.provenance}</small>}</dd>
  </div>)}</dl>;
}
function Relations({ items, onSelect }: { items: RelationItem[]; onSelect: (id: string) => void }) {
  return <ul className={styles.relations}>{items.map((r, i) => <li key={`${r.label}:${i}`}>
    {r.target
      ? <button className={styles.row} data-tone={r.tone} data-target={r.target} onClick={() => onSelect(r.target!)}><i aria-hidden="true" /><span><b>{r.label}</b>{r.detail && <small>{r.detail}</small>}</span></button>
      : <div className={styles.row} data-tone={r.tone} data-unresolved={r.unresolved || undefined}><i aria-hidden="true" /><span><b>{r.label}</b>{r.detail && <small>{r.detail}</small>}</span></div>}
  </li>)}</ul>;
}
function StepRows({ rows, onSelect }: { rows: StepRow[]; onSelect: (id: string) => void }) {
  return <ul className={styles.steps} aria-label="Recorded steps">{rows.map(r => <li key={r.target}>
    <button className={styles.stepRow} data-tone={r.tone} data-target={r.target} onClick={() => onSelect(r.target)}>
      <i aria-hidden="true" />
      <span className={styles.stepMain}><b>{r.label}</b><small>{[r.type, r.provider].filter(Boolean).join(" · ")}</small>{r.activity && <small className={styles.activity}>{r.activity}</small>}{r.note && <em>{r.note}</em>}</span>
      <span className={styles.stepState}>{r.status}<small>{r.progress}</small></span>
    </button>
  </li>)}</ul>;
}
function UsageRows({ rows, onSelect }: { rows: UsageRow[]; onSelect: (id: string) => void }) {
  return <ul className={styles.usage} aria-label="Recorded usage">{rows.map((u, i) => <li key={i}>
    {u.step && (u.step.target ? <button className={styles.inline} onClick={() => onSelect(u.step!.target!)}>{u.step.label}</button> : <span className={styles.quiet}>{u.step.label}</span>)}
    <b>{u.title}</b><span>{u.meta}</span><small>{u.estimate}</small>
  </li>)}</ul>;
}

/* research ledgers: index marks + thin rules, no boxes. Marks (Q01 / F01 / [n]) are presentation only. */
function Inquiry({ rows }: { rows: LedgerRow[] }) {
  return <ol className={styles.ledger} aria-label="Research questions">{rows.map(r => <li key={r.mark}><b className={styles.mark}>{r.mark}</b><p>{r.text}</p></li>)}</ol>;
}
function Findings({ rows }: { rows: FindingRow[] }) {
  return <ol className={styles.ledger} aria-label="Parsed findings">{rows.map(f => <li key={f.mark}>
    <b className={styles.mark}>{f.mark}</b>
    <div className={styles.entry}>
      {f.heading && <h6>{f.heading}</h6>}
      <Formatted text={f.text} format="markdown" />
      {f.refs.length > 0 && <small className={styles.refs}>References appearing in recorded text: {f.refs.map(n => `[${n}]`).join(", ")}{f.unmatched.length > 0 && <> · no recorded source at {f.unmatched.map(n => `[${n}]`).join(", ")}</>}</small>}
      {f.textSaysNoSources && <small className={styles.refs} data-tone="alert">The recorded text says no sources were returned.</small>}
    </div>
  </li>)}</ol>;
}
function Review({ rows }: { rows: ReviewRow[] }) {
  return <ol className={styles.ledger} aria-label="Parsed review sections">{rows.map(r => <li key={r.mark}>
    <b className={styles.mark}>{r.mark}</b>
    <div className={styles.entry}>
      <h6>{r.heading}</h6>
      <small className={styles.refs}>Parsed from text{r.recognisedAs ? ` · recognised as ${r.recognisedAs}` : ""}{!r.recognised && " · Unrecognised recorded section"}</small>
      <Formatted text={r.text} format="markdown" />
    </div>
  </li>)}</ol>;
}
function Sources({ rows }: { rows: SourceRow[] }) {
  return <ol className={styles.ledger} aria-label="Recorded sources" data-kind="sources">{rows.map(s => <li key={s.mark}>
    <b className={styles.mark}>{s.mark}</b>
    <div className={styles.entry}>
      <span className={styles.srcTitle}>{s.title}</span>
      {s.href ? <a className={styles.inline} href={s.href} target="_blank" rel="noopener noreferrer" title={s.href}>{s.domain}<span aria-hidden="true"> ↗</span><span className={styles.sr}> (opens in a new tab)</span></a> : <span className={styles.rawUri}>{s.uri}</span>}
      <small className={styles.refs}>{s.origin}</small>
    </div>
  </li>)}</ol>;
}


/* C7G: the canonical provider / model / API usage breakdown. Real recorded calls only. Several contributors: one segmented bar of token share (call share when no tokens were reported) over a row each; one contributor:
   the compact total instrument and its single row, no chart. Estimated cost (price table) and billed cost are always separate; $0.00 appears only where every call is on a model the table lists at zero. */
function UsageBreakdownView({ b }: { b: UsageBreakdown }) {
  const many = b.contributors.length > 1, t = b.total;
  const share = (c: UsageBreakdown["contributors"][number]) => (t.totalTokens > 0 ? c.totalTokens / t.totalTokens : c.calls / Math.max(1, t.calls));
  const cost = breakdownCostText(t.cost);
  const priced = b.contributors.filter(c => (c.cost.usd ?? 0) > 0), pricedSum = priced.reduce((n, c) => n + (c.cost.usd ?? 0), 0);
  return <section className={styles.ubd} aria-label="Usage by provider and model" title={b.source}>
    <dl className={styles.ubdTotal}>
      <div><dt>API calls</dt><dd>{t.calls}</dd><small>{formatDuration(t.apiMs)} API</small></div>
      <div><dt>Input tokens</dt><dd>{compactNumber(t.inputTokens)}</dd></div>
      <div><dt>Output tokens</dt><dd>{compactNumber(t.outputTokens)}</dd></div>
      <div data-state={t.cost.state}><dt>Estimated cost</dt><dd>{cost}</dd><small>price table, not spend</small></div>
      <div data-quiet><dt>Billed cost</dt><dd>{b.billed}</dd></div>
    </dl>
    {t.tokensComplete && t.totalTokens > 0 && <div className={styles.ubdComp}>
      <span className={styles.ubdSplit} role="img" aria-label={`Input ${compactNumber(t.inputTokens)} tokens, output ${compactNumber(t.outputTokens)} tokens`}><i data-p="in" style={{ flexGrow: t.inputTokens }} /><i data-p="out" style={{ flexGrow: t.outputTokens }} /></span>
      <small>Token composition · input {Math.round((100 * t.inputTokens) / t.totalTokens)}% · output {Math.round((100 * t.outputTokens) / t.totalTokens)}%</small>
    </div>}
    {many && <span className={styles.ubdBar} role="img" aria-label={b.contributors.map(c => `${c.key} ${Math.round(share(c) * 100)}%`).join(", ")}>
      {b.contributors.map((c, i) => <i key={c.key} data-i={i % 5} style={{ flexGrow: share(c) }} title={`${c.key}: ${Math.round(share(c) * 100)}% of ${t.totalTokens > 0 ? "tokens" : "calls"}`} />)}
    </span>}
    {many && priced.length > 1 && <div className={styles.ubdComp}>
      <span className={styles.ubdSplit} role="img" aria-label={`Estimated cost share: ${priced.map(c => `${c.key} ${Math.round((100 * (c.cost.usd ?? 0)) / pricedSum)}%`).join(", ")}`}>{priced.map(c => <i key={c.key} data-p={b.contributors.indexOf(c) % 2 ? "out" : "in"} style={{ flexGrow: c.cost.usd ?? 0 }} />)}</span>
      <small>Cost composition (price-table estimate) · {priced.map(c => `${c.model} ${Math.round((100 * (c.cost.usd ?? 0)) / pricedSum)}%`).join(" · ")}</small>
    </div>}
    <ul className={styles.ubdRows}>{b.contributors.map((c, i) => <li key={c.key} data-state={c.cost.state}>
      <span className={styles.ubdName} title={c.key}>{many && <i data-i={i % 5} aria-hidden="true" />}{c.key}</span>
      <b>{c.calls} {c.calls === 1 ? "call" : "calls"}</b>
      <span className={styles.ubdTok}>in {compactNumber(c.inputTokens)} · out {compactNumber(c.outputTokens)}{c.tokensComplete ? "" : " · partial"}</span>
      <em>{breakdownCostText(c.cost)}</em>
    </li>)}</ul>
    {!t.tokensComplete && <p className={styles.note} data-tone="quiet">Some calls reported no token count, so the token totals are partial.</p>}
    {t.cost.state === "partial" && <p className={styles.note} data-tone="quiet">{t.cost.unpricedCalls} {t.cost.unpricedCalls === 1 ? "call is" : "calls are"} on a model with no price-table entry (or without token counts) and {t.cost.unpricedCalls === 1 ? "is" : "are"} not in the estimate; the figure is a minimum.</p>}
    {t.cost.state === "unknown" && <p className={styles.note} data-tone="quiet">No call could be priced, so no estimate exists. This is not a $0.00 cost.</p>}
  </section>;
}

/* C7G: recorded step windows on one real time axis, grouped under the department that verifiably owns each step. A group's bar is its recorded window (earliest start to latest finish: never a sum) with each step's own
   interval drawn inside it (overlaps show as denser, so concurrency is visible); the group opens to its steps, each selectable with its own bar and duration. Nothing is synthesised (no pulse, no heartbeat). */
function TimelineView({ t, onSelect }: { t: ExecutionTimeline; onSelect: (id: string) => void }) {
  const span = t.toMs - t.fromMs;
  const [openKeys, setOpenKeys] = useState<ReadonlySet<string>>(new Set());
  const toggle = (key: string) => setOpenKeys(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const place = (startMs: number, endMs: number) => ({ left: `${(100 * (startMs - t.fromMs)) / span}%`, width: `${Math.max(1.2, (100 * (endMs - startMs)) / span)}%` });
  const hhmm = (ms: number) => new Date(ms).toISOString().slice(11, 19);
  return <section className={styles.tl} aria-label="Recorded step timeline" title={t.source}>
    <h5>Timeline</h5>
    <ul>{t.groups.map(g => {
      const single = g.rows.length === 1, open = openKeys.has(g.key), panel = `tl-${g.key.replace(/[^a-z0-9]/gi, "")}`;
      return <li key={g.key} data-group={g.departmentId ? "department" : "step"} data-record-ids={g.rows.map(r => r.stepId).join(" ")} data-open={open || undefined}>
        <div className={styles.tlHead}>
          {single ? <i className={styles.tlGap} aria-hidden="true" /> : <button type="button" className={styles.tlToggle} aria-expanded={open} aria-controls={panel} aria-label={`${open ? "Collapse" : "Expand"} the ${g.rows.length} steps of ${g.label ?? g.rows[0].label}`} onClick={() => toggle(g.key)}><span aria-hidden="true">{open ? "▾" : "▸"}</span></button>}
          <button type="button" className={styles.inline} onClick={() => onSelect(single ? g.rows[0].target : g.target)} data-target={single ? g.rows[0].target : g.target}>
            {g.label ?? g.rows[0].label}{single && g.label && g.rows[0].labelSource === "recorded-label" ? <small> · {g.rows[0].label}</small> : null}
          </button>
          <span className={styles.tlTrack} role="img" aria-label={`${g.label ?? g.rows[0].label}: ${formatDuration(g.endMs - g.startMs)} window${g.rows.length > 1 ? `, ${g.rows.length} steps${g.overlapping ? ", some overlapping" : ""}` : ""}`}>
            {g.rows.map(r => <i key={r.stepId} data-s={r.status} data-record-id={r.stepId} style={place(r.startMs, r.endMs)} />)}
          </span>
          <small>{g.rows.length > 1 ? `${g.rows.length} steps · ` : ""}{formatDuration(g.endMs - g.startMs)}{g.rows.length > 1 ? " window" : ""}</small>
        </div>
        {g.rows.length > 1 && open && <ul id={panel} className={styles.tlSteps}>{g.rows.map(r => <li key={r.stepId} data-s={r.status} data-record-id={r.stepId}>
          <button type="button" className={styles.inline} onClick={() => onSelect(r.target)} data-target={r.target} title={`${r.label}${r.activity ? ` · ${r.activity}` : ""} · ${r.start.slice(11, 19)}–${r.end.slice(11, 19)} UTC`}>{r.label}</button>
          <span className={styles.tlTrack} role="img" aria-label={`${r.label}: ${formatDuration(r.endMs - r.startMs)}`}><i data-s={r.status} style={place(r.startMs, r.endMs)} /></span>
          <small>{formatDuration(r.endMs - r.startMs)}</small>
        </li>)}</ul>}
      </li>;
    })}</ul>
    {t.omitted > 0 && <p className={styles.tlAxis} data-omitted>{t.omitted} of {t.total} recorded steps have no recorded start or finish, so they are not drawn here; they are in the Steps section of their department.</p>}
    <p className={styles.tlAxis}><span>{hhmm(t.fromMs)} UTC</span><span>{formatDuration(span)} window{t.groups.some(g => g.overlapping) ? " · overlapping steps are shown overlapping, never summed" : ""}</span></p>
  </section>;
}

function DepMap({ needs, waits, unresolved }: { needs: number; waits: number; unresolved: number }) {
  const dots = (n: number) => <span className={styles.depDots} aria-hidden="true">{Array.from({ length: Math.min(n, 10) }, (_, i) => <i key={i} />)}{n > 10 && <small>+{n - 10}</small>}</span>;
  return <div className={styles.dep} role="img" aria-label={`Needs ${needs}, waited on by ${waits}${unresolved ? `, ${unresolved} unresolved` : ""}`}>
    <span className={styles.depSide}>{dots(needs)}<small>needs {needs}</small></span>
    <i className={styles.depCore} aria-hidden="true" />
    <span className={styles.depSide} data-end>{dots(waits)}<small>waited on by {waits}</small></span>
    {unresolved > 0 && <em>{unresolved} recorded {unresolved === 1 ? "reference" : "references"} could not be resolved uniquely</em>}
  </div>;
}

function BlockView({ block, onSelect }: { block: Block; onSelect: (id: string) => void }): ReactNode {
  switch (block.kind) {
    case "facts": return <FactBand facts={block.facts} onSelect={onSelect} />;
    case "group": return <section className={styles.group}><h5>{block.title}</h5>{block.note && <p className={styles.note}>{block.note}</p>}{block.blocks.map((b, i) => <BlockView key={i} block={b} onSelect={onSelect} />)}</section>;
    case "relations": return <Relations items={block.items} onSelect={onSelect} />;
    case "text": return <section className={styles.text}>{(block.title || block.chars !== undefined) && <header><h5>{block.title}</h5>{block.chars !== undefined && <small>{block.chars.toLocaleString("en-US")} characters</small>}</header>}<Formatted text={block.text} format={block.format} /></section>;
    case "usage": return <UsageRows rows={block.rows} onSelect={onSelect} />;
    case "record": return <article className={styles.record}><header><h5>{block.title}</h5>{block.subtitle && (block.target ? <button className={styles.inline} onClick={() => onSelect(block.target!)}>{block.subtitle}</button> : <small>{block.subtitle}</small>)}</header>{block.facts.length > 0 && <FactBand facts={block.facts} onSelect={onSelect} />}{block.body && <p className={styles.plain}>{block.body}</p>}</article>;
    case "inquiry": return <Inquiry rows={block.rows} />;
    case "findings": return <Findings rows={block.rows} />;
    case "sources": return <Sources rows={block.rows} />;
    case "review": return <Review rows={block.rows} />;
    case "steps": return <StepRows rows={block.rows} onSelect={onSelect} />;
    case "depmap": return <DepMap needs={block.needs} waits={block.waits} unresolved={block.unresolved} />;
    case "timeline": return <TimelineView t={block.timeline} onSelect={onSelect} />;
    case "usageBreakdown": return <UsageBreakdownView b={block.breakdown} />;
    case "analytics": return <AnalyticsInstrument analytics={block.analytics} variant="full" part={block.part} onSelect={onSelect} />;
    case "empty": return <p className={styles.empty}>{block.text}</p>;
    case "unavailable": return <p className={styles.unavailable}><b>{block.label}</b> Not recorded · {block.reason}</p>;
    case "note": return <p className={styles.note} data-tone={block.tone}>{block.text}</p>;
  }
}

/** `scale="focus"` (W6.2) is typography only: the same blocks, a larger and more open reading measure for the Focus instrument. */
export function WorkbenchReading({ content, phone, onSelect, scale }: { content: WorkbenchContent; phone: boolean; onSelect: (id: string) => void; scale?: "focus" }) {
  return <div className={styles.root} data-phone={phone || undefined} data-section={content.section} data-scale={scale}>{content.blocks.map((b, i) => <BlockView key={i} block={b} onSelect={onSelect} />)}</div>;
}
