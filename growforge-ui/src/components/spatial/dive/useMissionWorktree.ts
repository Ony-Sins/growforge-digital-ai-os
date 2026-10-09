"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Job } from "@/lib/jobStore";
import type { PendingApproval } from "@/lib/approvalStore";
import type { PendingConsultation } from "@/lib/consultationStore";
import type { OverviewSnapshot } from "@/lib/overviewSnapshot";
import { buildMissionWorktree, type MissionWorktree } from "./missionWorktree";

async function list<T>(url: string, key: string, signal: AbortSignal): Promise<T[] | null> {
  try {
    const response = await fetch(url, { signal, cache: "no-store" });
    if (!response.ok) return null;
    const body: Record<string, unknown> = await response.json();
    return Array.isArray(body[key]) ? (body[key] as T[]) : null;
  } catch { return null; }
}

/**
 * Composes the MissionWorktree from the reads the Missions lens already makes (/api/jobs/:id, /api/approvals, /api/consultations) plus the
 * overview executor facts. No new endpoint. null while loading or when the mission record cannot be read.
 */
export function useMissionWorktree(missionId: string | null, snapshot: OverviewSnapshot | null): { worktree: MissionWorktree | null; /** Re-read the canonical data NOW (after a mutation), instead of waiting for the next 10 s poll. */ reload: () => void } {
  const [state, setState] = useState<{ id: string; job: Job; approvals: PendingApproval[] | null; consultations: PendingConsultation[] | null } | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick(value => value + 1), []);
  useEffect(() => {
    if (!missionId) return;
    const controller = new AbortController();
    async function load(id: string) {
      try {
        const [response, approvals, consultations] = await Promise.all([
          fetch(`/api/jobs/${encodeURIComponent(id)}`, { signal: controller.signal, cache: "no-store" }),
          list<PendingApproval>("/api/approvals", "approvals", controller.signal),
          list<PendingConsultation>("/api/consultations", "consultations", controller.signal),
        ]);
        if (!response.ok) return;
        const body: { job?: Job } = await response.json();
        if (body.job?.id === id && !controller.signal.aborted) setState({ id, job: body.job, approvals, consultations });
      } catch { /* keep the last good read */ }
    }
    void load(missionId);
    const timer = setInterval(() => void load(missionId), 10000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [missionId, tick]);
  const confirmable = snapshot?.executingNow.confirmable ?? null;
  const executingIds = snapshot ? snapshot.executingNow.missionIds.join(",") : "";
  const worktree = useMemo(() => {
    if (!state || state.id !== missionId) return null;
    // Dev-only review aid (?wtLive, never honoured in a production build): SIMULATES executor confirmation for this mission so live-conduit semantics can be inspected. The view labels it a test fixture.
    const devAids = process.env.NODE_ENV !== "production" && typeof window !== "undefined";
    const simulateLive = devAids && new URLSearchParams(window.location.search).has("wtLive");
    const executor = simulateLive ? { confirmable: true, missionIds: [state.id] } : confirmable === null ? null : { confirmable, missionIds: executingIds ? executingIds.split(",") : [] };
    // Dev-only review aid (?wtUnknown, never honoured in a production build): re-types the QA step and the first department step as an unrecognised kind so the Unclassified
    // fallback can be inspected on a real mission. Never active without the parameter.
    const unknown = devAids && new URLSearchParams(window.location.search).has("wtUnknown");
    let firstDepartment = true;
    const job = unknown ? { ...state.job, steps: state.job.steps.map(step => (step.kind === "qa" ? { ...step, kind: "legacy-kind" as never } : step.kind === "department" && firstDepartment ? (firstDepartment = false, { ...step, kind: "legacy-kind" as never }) : step)) } : state.job;
    return buildMissionWorktree({ job, approvals: state.approvals, consultations: state.consultations, executor });
  }, [state, missionId, confirmable, executingIds]);
  return { worktree, reload };
}
