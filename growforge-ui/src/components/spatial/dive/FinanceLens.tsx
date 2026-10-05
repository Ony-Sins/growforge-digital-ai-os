"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { FINANCE_MODE_NOTES, FINANCE_MODES, financeModulesFor, financeTrackedCount, type FinanceMode, type FinanceModule } from "@/lib/financeFoundation";
import { FINANCE_CONTEXT_EVENT } from "./diveScope";
import { FoundationAreas, type FoundationArea } from "./FoundationAreas";
import { LensHeader } from "./LensHeader";
import { LensState } from "./LensState";
import styles from "./FinanceLens.module.css";

/**
 * Finance foundation. There is no financial backend: every module is "not tracked yet"
 * and no value, estimate or sparkline is ever drawn. Personal finance is a separate
 * privacy scope and is never merged into Business implicitly.
 */
export function FinanceLens({ dismissalVersion, closing, onInspect, onClose, onOpenIntelligence }: {
  dismissalVersion: number; closing: boolean; onInspect: () => void; onClose: () => void; onOpenIntelligence: () => void;
}) {
  const [mode, setMode] = useState<FinanceMode>("Business");
  const [selection, setSelection] = useState<{ id: string; version: number } | null>(null);
  const modules = financeModulesFor(mode);
  const selected = !closing && selection?.version === dismissalVersion ? modules.find(module => module.id === selection.id) : undefined;
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(FINANCE_CONTEXT_EVENT, { detail: selected ? { id: selected.id, title: selected.label } : null }));
    return () => { window.dispatchEvent(new CustomEvent(FINANCE_CONTEXT_EVENT, { detail: null })); };
  }, [selected]);
  const summary = (module: FinanceModule) => mode === "Business" ? module.unavailable : mode === "Personal" ? "No personal financial data connected." : "Needs both Business and Personal sources. Neither is connected.";
  const areas: FoundationArea[] = modules.map(module => ({
    id: module.id, label: module.label, state: "not-tracked", summary: summary(module),
    action: { label: "Inspect", onClick: () => { onInspect(); setSelection({ id: module.id, version: dismissalVersion }); } },
  }));
  return <>
    <LensHeader lensId="lens.finance" metrics={[{ label: "modules tracked", value: `${financeTrackedCount()} of ${modules.length}` }]} />
    <div className={styles.field} data-finance-lens data-dive-inspector>
      <div className={styles.modes} role="group" aria-label="Finance scope" data-semantic-id="finance.mode">
        {FINANCE_MODES.map(name => <button key={name} aria-pressed={mode === name} data-semantic-id={`finance.mode.${name.toLowerCase()}`} onClick={() => { setMode(name); setSelection(null); }}>{name}</button>)}
      </div>
      <p className={styles.modeNote}>{FINANCE_MODE_NOTES[mode]}</p>
      {mode !== "Business" && <LensState kind="unavailable" label="SEPARATE PRIVACY SCOPE" message={mode === "Personal" ? "Personal finance is not connected." : "Combined view is unavailable."} detail="No personal source exists yet. When one does, it will need its own explicit connection and permission." compact />}
      <FoundationAreas areas={areas} label={`${mode} finance modules`} />
    </div>
    {selected && <aside className={`${styles.inspector} surface-glass`} data-dive-inspector data-nora-side-inspector data-semantic-id={selected.id} aria-label="Finance module inspection">
      <button className={styles.close} aria-label="Dismiss finance inspection" onClick={onClose}><X size={14} /></button>
      <p className={styles.kind}>{mode.toUpperCase()} · FINANCE MODULE</p>
      <h2>{selected.label}</h2>
      <p className={styles.purpose}>{selected.purpose}</p>
      <FoundationAreas variant="list" label="Module detail" areas={[
        { id: `${selected.id}.source`, label: "Source", state: "not-tracked", summary: summary(selected) },
        { id: `${selected.id}.breakdown`, label: "Breakdown", state: "not-tracked", summary: `Planned detail: ${selected.breakdown}.` },
        { id: `${selected.id}.evidence`, label: "Evidence", state: "empty", summary: "Nothing recorded to evidence a value." },
      ]} />
      {selected.id === "finance.api_cost" && <button className={styles.link} onClick={onOpenIntelligence}>Open recorded token usage in Intelligence</button>}
    </aside>}
  </>;
}
