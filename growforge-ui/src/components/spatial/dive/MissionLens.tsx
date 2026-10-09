"use client";

import { useEffect, useMemo, useState } from "react";
import type { CoreState } from "@/lib/coreState";
import type { DiveObject } from "./overviewModel";
import type { OverviewSnapshot } from "@/lib/overviewSnapshot";
import { DIVE_TIMING } from "./diveDepthModel";
import { MissionWorktreeLens } from "./MissionWorktreeLens";
import { MissionsIndexHeader } from "./MissionWorktreeHeader";
import { useLensPresence } from "./useLensPresence";
import { MissionField } from "./MissionField";
import { MISSION_STATES, MISSION_STATE_LABELS, errorKindOf, missionState, missionStateCounts, type ErrorKind, type MissionState } from "./missionStates";

/** Presentation only: the one-word forms a phone shows in the single filter strip. The full recorded label stays the accessible name. */
const PHONE_FILTER_LABELS: Record<MissionState, string> = { running: "Running", waiting: "Queued", blocked: "Blocked", completed: "Completed", unverified: "Unverified" };

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

/**
 * The Missions lens: the Mission Field (all missions) and, once one is chosen, the Mission Worktree (the canonical Mission Graph). This is the only Missions
 * presentation; the selected mission's selection, NORA context and actions live in `MissionWorktreeLens`.
 */
export function MissionLens({ jobs, available, missions, selectedRecord, selectedId, closing, snapshot, scopeActive, onSelect, onClose }: {
  jobs: CoreState["jobs"]; available: boolean; missions: DiveObject[]; selectedRecord: DiveObject | null; selectedId: string | null; closing: boolean; snapshot: OverviewSnapshot | null; /** false while the layer is fading out: it must not publish NORA scope any more. */ scopeActive: boolean;
  onSelect: (id: string) => void; onClose: () => void;
}) {
  const [filter, setFilter] = useState<MissionState | "all">("all");
  const recorded = useMemo(() => jobs.filter(job => !job.isTest), [jobs]);
  const approvals = usePendingApprovalJobs(available);
  const { kinds, version } = useErrorKinds(useMemo(() => recorded.filter(job => job.status === "error").map(job => job.id), [recorded]));
  const counts = useMemo(() => missionStateCounts(recorded, approvals, kinds), [recorded, approvals, kinds, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const selected = selectedRecord ?? missions.find(mission => mission.id === selectedId);
  const selectedJob = selected ? recorded.find(job => job.id === selected.id) : undefined;
  const rows = useMemo(() => recorded.filter(job => filter === "all" || missionState(job, approvals, kinds) === filter), [recorded, filter, approvals, kinds, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const metrics = available ? [
    { label: "running", value: counts.running, tone: counts.running ? ("live" as const) : undefined },
    { label: "waiting", value: counts.waiting },
    { label: "need attention", value: counts.blocked === null || counts.unverified === null ? null : counts.blocked + counts.unverified, tone: counts.blocked || counts.unverified ? ("warn" as const) : undefined },
    { label: "completed", value: counts.completed },
  ] : undefined;
  // The selector walks ALL recorded missions (not the Field's current filter), in the order the lens holds them.
  const reel = useMemo(() => recorded.map(job => { const state = missionState(job, approvals, kinds); return { id: job.id, title: job.title, state, stateLabel: MISSION_STATE_LABELS[state], percent: job.percent }; }), [recorded, approvals, kinds, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const showSelected = Boolean(selected && selectedJob);
  // Choosing a mission: the Field lingers (inert) for the handoff window so the chosen stratum's last frames overlap the Worktree resolving; reduced motion hands off at once.
  const fieldPresence = useLensPresence(!showSelected, typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : DIVE_TIMING.pick - DIVE_TIMING.handoff + 60);
  return <>
    {!showSelected && <MissionsIndexHeader recorded={available ? recorded.length : null} metrics={metrics} note={available ? undefined : "Operational state unavailable"} />}
    {showSelected && selected && <MissionWorktreeLens missionId={selected.id} reel={reel} onSwitch={onSelect} snapshot={snapshot} scopeActive={scopeActive} onClose={onClose} />}
    {/* On "All missions" the field mounts while the Worktree is still releasing (they overlap), so there is no empty beat between them. */}
    {(!showSelected || closing || fieldPresence.leaving) && <MissionField returning={closing} leaving={showSelected && !closing && fieldPresence.leaving}
      items={rows.map(job => { const state = missionState(job, approvals, kinds); return { id: job.id, title: job.title, state, stateLabel: MISSION_STATE_LABELS[state], percent: job.percent }; })}
      filters={[{ key: "all", label: "All", short: "All", count: available ? recorded.length : "—" }, ...MISSION_STATES.map(state => ({ key: state, label: MISSION_STATE_LABELS[state], short: PHONE_FILTER_LABELS[state], count: available ? (counts[state] ?? "—") : "—" }))]}
      filter={filter} onFilter={key => setFilter(key as MissionState | "all")} onSelect={onSelect}
      status={!available ? { kind: "unavailable" } : !recorded.length ? { kind: "empty" } : !rows.length ? { kind: "no-match", message: `No ${filter === "all" ? "" : `${MISSION_STATE_LABELS[filter].toLowerCase()} `}missions recorded.` } : { kind: "ready" }}
      approvalsUnreadable={available && approvals === null && recorded.some(job => job.status === "running")} />}
  </>;
}
