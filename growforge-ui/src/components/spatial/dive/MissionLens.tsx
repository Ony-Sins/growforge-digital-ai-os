"use client";

import { useEffect, useMemo, useState } from "react";
import type { CoreState } from "@/lib/coreState";
import type { DiveObject } from "./overviewModel";
import { MissionInspector } from "./MissionInspector";
import { LensHeader, type LensMetric } from "./LensHeader";
import { LensState } from "./LensState";
import { MISSION_STATES, MISSION_STATE_LABELS, errorKindOf, missionState, missionStateCounts, type ErrorKind, type MissionState } from "./missionStates";
import styles from "./DiveOverview.module.css";
import foundation from "./MissionsFoundation.module.css";

/** Pending approvals per mission. null = could not be read (waiting becomes undeterminable). */
function usePendingApprovalJobs(enabled: boolean): ReadonlySet<string> | null {
  const [jobs, setJobs] = useState<ReadonlySet<string> | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/approvals", { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error();
        const data: { approvals?: { jobId?: string; status?: string }[] } = await response.json();
        if (!Array.isArray(data.approvals)) throw new Error();
        if (!controller.signal.aborted) setJobs(new Set(data.approvals.filter(item => item.status === "pending" && item.jobId).map(item => item.jobId as string)));
      } catch { if (!controller.signal.aborted) setJobs(null); }
    }
    void load();
    const timer = setInterval(() => void load(), 10000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [enabled]);
  return enabled ? jobs : null;
}

/** Errored missions are terminal, so each one's own record is read once and cached. */
const errorKindCache = new Map<string, ErrorKind>();
function useErrorKinds(ids: string[]): { kinds: ReadonlyMap<string, ErrorKind>; version: number } {
  const [version, setVersion] = useState(0);
  const key = ids.join("|");
  useEffect(() => {
    const missing = ids.filter(id => !errorKindCache.has(id)).slice(0, 40);
    if (!missing.length) return;
    const controller = new AbortController();
    void (async () => {
      for (const id of missing) {
        try {
          const response = await fetch(`/api/jobs/${encodeURIComponent(id)}`, { signal: controller.signal, cache: "no-store" });
          if (!response.ok) continue;
          const data: { job?: { id?: string; error?: unknown; steps?: unknown } } = await response.json();
          if (data.job?.id !== id) continue;
          errorKindCache.set(id, errorKindOf(data.job));
          if (!controller.signal.aborted) setVersion(value => value + 1);
        } catch { if (controller.signal.aborted) return; }
      }
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { kinds: errorKindCache, version };
}

export function MissionLens({ jobs, available, missions, selectedRecord, selectedId, closing, onSelect, onClose }: {
  jobs: CoreState["jobs"]; available: boolean; missions: DiveObject[]; selectedRecord: DiveObject | null; selectedId: string | null; closing: boolean;
  onSelect: (id: string) => void; onClose: () => void;
}) {
  const [filter, setFilter] = useState<MissionState | "all">("all");
  const recorded = useMemo(() => jobs.filter(job => !job.isTest), [jobs]);
  const approvals = usePendingApprovalJobs(available);
  const { kinds, version } = useErrorKinds(useMemo(() => recorded.filter(job => job.status === "error").map(job => job.id), [recorded]));
  const counts = useMemo(() => missionStateCounts(recorded, approvals, kinds), [recorded, approvals, kinds, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const selected = selectedRecord ?? missions.find(mission => mission.id === selectedId);
  const rows = useMemo(() => recorded.filter(job => filter === "all" || missionState(job, approvals, kinds) === filter), [recorded, filter, approvals, kinds, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const metrics: LensMetric[] | undefined = available ? [
    { label: "running", value: counts.running, tone: counts.running ? "live" : undefined },
    { label: "waiting", value: counts.waiting },
    { label: "need attention", value: counts.blocked === null || counts.unverified === null ? null : counts.blocked + counts.unverified, tone: counts.blocked || counts.unverified ? "warn" : undefined },
    { label: "completed", value: counts.completed },
  ] : undefined;
  return <>
    <LensHeader lensId="lens.missions" metrics={metrics} note={available ? undefined : "Operational state unavailable"} />
    {selected ? <div className={styles.missionAnchor} style={{ left: "50%" }}>
      <button className={`${styles.node} ${styles.missionNode}`} aria-pressed={!closing} aria-label={`Inspect mission ${selected.name}`} onClick={() => onSelect(selected.id)}>
        <span className={styles.nodeMark} aria-hidden /><span>{selected.name}</span><small>{selected.status}</small>
      </button>
      <MissionInspector key={selected.id} mission={selected} closing={closing} onClose={onClose} />
    </div> : <section className={foundation.field} data-missions-lens data-dive-inspector aria-label="Missions">
      <div className={foundation.filters} role="group" aria-label="Mission state" data-semantic-id="missions.filter">
        <button aria-pressed={filter === "all"} data-semantic-id="missions.filter.all" onClick={() => setFilter("all")}>All<span>{available ? recorded.length : "—"}</span></button>
        {MISSION_STATES.map(state => <button key={state} aria-pressed={filter === state} data-mission-state={state} data-semantic-id={`missions.filter.${state}`} onClick={() => setFilter(state)}>
          {MISSION_STATE_LABELS[state]}<span>{available ? (counts[state] ?? "—") : "—"}</span>
        </button>)}
      </div>
      {!available ? <LensState kind="unavailable" message="Operational state unavailable." detail="Mission activity is not inferred." />
        : !recorded.length ? <LensState kind="empty" message="No recorded missions." detail="Create one from Mission controls." />
        : !rows.length ? <LensState kind="empty" compact message={`No ${filter === "all" ? "" : `${MISSION_STATE_LABELS[filter].toLowerCase()} `}missions recorded.`} />
        : <ul className={foundation.list} aria-label="Recorded missions">{rows.map(job => {
          const state = missionState(job, approvals, kinds);
          return <li key={job.id}><button data-mission-id={job.id} data-semantic-id={`lens.missions/mission:${job.id}`} data-mission-state={state} onClick={() => onSelect(job.id)}>
            <i aria-hidden="true" /><span>{job.title}</span><small>{MISSION_STATE_LABELS[state]} · {job.percent}%</small>
          </button></li>;
        })}</ul>}
      {available && approvals === null && recorded.some(job => job.status === "running") && <LensState kind="degraded" compact message="Approval state unavailable." detail="Queued / waiting cannot be told apart from running right now." />}
    </section>}
  </>;
}
