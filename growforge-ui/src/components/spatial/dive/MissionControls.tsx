"use client";

import { useEffect, useRef, useState } from "react";
import type { CoreState } from "@/lib/coreState";
import { createMission } from "@/lib/missionClient";
import { missionObject } from "./missionModel";
import styles from "./DiveOverview.module.css";

export function MissionControls({ jobs, onSelect }: { jobs: CoreState["jobs"]; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyView, setHistoryView] = useState<"List" | "Timeline">("List");
  const records = jobs.filter(job => !job.isTest);
  const history = historyView === "Timeline" ? [...records].sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : records;
  const surface = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    let pressedAt: { x: number; y: number } | null = null;
    const press = (event: PointerEvent) => { pressedAt = { x: event.clientX, y: event.clientY }; };
    const outside = (event: MouseEvent) => {
      if (pressedAt && Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y) <= 5 && event.target instanceof Node && !surface.current?.contains(event.target)) setOpen(false);
    };
    window.addEventListener("keydown", dismiss);
    window.addEventListener("pointerdown", press); window.addEventListener("click", outside);
    return () => { window.removeEventListener("keydown", dismiss); window.removeEventListener("pointerdown", press); window.removeEventListener("click", outside); };
  }, [open]);
  return <div ref={surface} className={styles.missionControls} data-dive-inspector>
    <button className={styles.inspectionAction} aria-expanded={open} onClick={() => setOpen(value => !value)}>Mission controls</button>
    {open && <aside className={styles.controlSurface} aria-label="Mission controls">
      <button className={styles.close} onClick={() => setOpen(false)} aria-label="Close mission controls">×</button>
      <p className={styles.eyebrow}>MISSION CONTROLS</p>
      {!creating ? <><button className={styles.inspectionAction} onClick={() => setCreating(true)}>Create mission</button><p className={styles.detail}>Recorded missions · select to inspect. History stays out of the default execution map.</p><div className={styles.tabs}>{(["List", "Timeline"] as const).map(view => <button key={view} aria-pressed={historyView === view} onClick={() => setHistoryView(view)}>{view}</button>)}</div>{historyView === "Timeline" && <p className={styles.detail}>Creation timestamps only. Scheduled dates are not recorded.</p>}<div className={`${styles.missionHistory} ${historyView === "Timeline" ? styles.historyTimeline : ""}`}>{history.map(job => <button key={job.id} onClick={() => { onSelect(job.id); setOpen(false); }}>{missionObject(job).name}<small>{missionObject(job).status} · {job.percent}%{historyView === "Timeline" && <><br />Created {job.createdAt}</>}</small></button>)}</div>{!records.length && <p className={styles.detail}>No recorded missions.</p>}</> : <form onSubmit={async event => {
        event.preventDefault(); if (busy) return; setBusy(true); setError(null);
        try { const id = await createMission(brief); setBrief(""); setCreating(false); setOpen(false); onSelect(id); }
        catch (error) { setError(error instanceof Error ? error.message : "Creation failed."); }
        finally { setBusy(false); }
      }}><label className={styles.detail} htmlFor="dive-mission-brief">Mission brief</label><textarea id="dive-mission-brief" value={brief} onChange={event => setBrief(event.target.value)} rows={4} required minLength={20} disabled={busy} /><p className={styles.detail}>Submitting launches the existing real job pipeline. Due dates, mission types and business metrics are not stored by this runtime.</p><button className={styles.inspectionAction} type="submit" disabled={busy || brief.trim().length < 20}>{busy ? "Launching…" : "Launch mission"}</button><button className={styles.inspectionAction} type="button" disabled={busy} onClick={() => setCreating(false)}>Back</button>{error && <p className={styles.detail} role="alert">{error}</p>}</form>}
    </aside>}
  </div>;
}
