"use client";

import { useEffect, useState } from "react";
import type { DiveObject } from "./overviewModel";
import styles from "./DiveOverview.module.css";

const TABS = ["Context", "Skills", "Tools", "Evidence"] as const;
export function DiveInspector({ object, closing, onClose }: { object: DiveObject; closing: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<typeof TABS[number]>("Context");
  useEffect(() => {
    if (closing || object.kind === 'system') return;
    const event = object.kind === 'mission' ? 'growforge:mission-context' : 'growforge:agent-context';
    window.dispatchEvent(new CustomEvent(event, { detail: {
      id: object.id, title: object.name, context: JSON.stringify({ source: 'Overview selection', status: object.status, context: object.context, evidence: object.evidence }),
      ...(object.kind === 'agent' ? { kind: 'recorded-run', departmentId: null } : {}),
    } }));
    return () => { window.dispatchEvent(new CustomEvent(event, { detail: null })); };
  }, [object, closing]);
  return <aside className={`${styles.inspector} ${closing ? styles.dissolving : ""}`} aria-label="Contextual inspection" aria-hidden={closing} inert={closing ? true : undefined} data-dive-inspector data-nora-side-inspector>
    <button className={styles.close} onClick={onClose} aria-label="Dismiss inspection">×</button>
    <p className={styles.eyebrow}>{object.kind} · {object.status}</p>
    <h2>{object.name}</h2>
    <div role="tablist" aria-label="Inspection categories" className={styles.tabs}>{TABS.map(name => <button key={name} role="tab" aria-selected={tab === name} aria-controls="dive-inspection-content" onClick={() => setTab(name)}>{name}</button>)}</div>
    <div id="dive-inspection-content" role="tabpanel" className={styles.detail}>
      {tab === "Context" ? object.context : tab === "Evidence" ? object.evidence : tab === "Skills" ? "No execution-linked skill record is available in this overview." : "No execution-linked tool call is available in this overview. Configured tools do not imply execution."}
    </div>
    <p className={styles.identity}>{object.id}</p>
  </aside>;
}

