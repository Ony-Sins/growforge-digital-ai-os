"use client";

/**
 * The Peek plane (W4): a compact information plane attached to the selected entity (smoked glass, thin optical edge, one attachment filament). Not a tooltip, not a
 * card, no tabs: 4-6 facts and, for work items with dependencies, a few real navigation links. Depth belongs to the Workbench (W5).
 */
import { useId } from "react";
import { visibleFacts, type PeekModel } from "./missionWorktreePeek";
import { AnalyticsInstrument } from "./AnalyticsInstrument";
import type { PeekPlacement } from "./missionWorktreePeekLayout";
import styles from "./MissionPeek.module.css";

const PROVENANCE_LABEL = { parsed: "Parsed from text", derived: "Derived" } as const;
const DIRECTION_LABEL = { needs: "Needs first", waits: "Waits on this", ambiguity: "Unresolved" } as const;

export function MissionPeek({ model, placement, phone, compact, onSelect, onClose, onInspect }: { model: PeekModel; placement: PeekPlacement; phone: boolean; compact?: boolean; onSelect: (targetId: string) => void; onClose: () => void; onInspect?: () => void }) {
  const uid = useId().replace(/:/g, "");
  return <aside className={styles.peek} id={`peek-${uid}`} data-peek data-for={model.entityId} data-kind={model.kind} data-side={placement.side} data-variant={placement.variant} data-crowded={placement.crowded || undefined} data-phone={phone || undefined}
    role="region" aria-labelledby={`peek-title-${uid}`} style={{ transform: `translate(${placement.x}px,${placement.y}px)`, width: placement.w, height: placement.h }}>
    {onInspect && <button className={styles.inspect} onClick={onInspect} aria-label={`Open workbench for ${model.title}`} title="Open workbench (Enter)"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 2.5L8 7L3 11.5M7 2.5L12 7L7 11.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg></button>}
    <button className={styles.close} onClick={onClose} aria-label={`Close details for ${model.title}`}>×</button>
    <p className={styles.eyebrow}>{model.typeLabel}</p>
    <h3 id={`peek-title-${uid}`} className={styles.title} title={model.title}>{model.title}</h3>
    {model.analytics && <AnalyticsInstrument analytics={model.analytics} variant="peek" compact={compact} />}
    <dl className={styles.facts}>
      {visibleFacts(model, compact).map(fact => <div key={fact.label} className={styles.fact} data-tone={fact.tone} data-lines={fact.lines ?? 1}>
        <dt>{fact.label}</dt>
        <dd title={fact.value}>{fact.value}{fact.provenance && fact.provenance !== "recorded" && <small className={styles.prov} data-provenance={fact.provenance}> {PROVENANCE_LABEL[fact.provenance]}</small>}</dd>
      </div>)}
    </dl>
    {model.links.length > 0 && <ul className={styles.links} aria-label="Related work">
      {model.links.map(link => <li key={`${link.direction}:${link.targetId}`}><button data-link={link.direction} data-target={link.targetId} onClick={() => onSelect(link.targetId)}>
        <i aria-hidden="true">{link.direction === "waits" ? "→" : link.direction === "needs" ? "←" : "?"}</i><span><small>{DIRECTION_LABEL[link.direction]}</small>{link.label}</span>
      </button></li>)}
    </ul>}
    {model.linksOverflow > 0 && <p className={styles.more}>+{model.linksOverflow} more recorded dependencies</p>}
  </aside>;
}
