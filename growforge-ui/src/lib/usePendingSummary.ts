"use client";

import { useEffect, useState } from "react";
import type { JobSummary } from "@/lib/jobStore";

export interface PendingSummary {
  approvals: number;
  consultations: number;
  unapprovedPlans: number;
}

const EMPTY_PENDING: PendingSummary = { approvals: 0, consultations: 0, unapprovedPlans: 0 };

/** Real pending-item breakdown — approvals awaiting an owner's decision,
 *  operator consultations, and completed plans not yet approved (see
 *  ProjectCanvas.tsx's FinalPlanModal). Shared by Header's notification bell
 *  and the dashboard's "Needs Attention" panel so both surfaces reflect the
 *  exact same real state instead of drifting apart with duplicated polling. */
export function usePendingSummary(): PendingSummary {
  const [summary, setSummary] = useState<PendingSummary>(EMPTY_PENDING);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const [approvalsRes, consultationsRes, jobsRes] = await Promise.all([
          fetch("/api/approvals"),
          fetch("/api/consultations"),
          fetch("/api/jobs"),
        ]);
        if (cancelled) return;

        const approvals = approvalsRes.ok ? ((await approvalsRes.json()).approvals ?? []) : [];
        const consultations = consultationsRes.ok ? ((await consultationsRes.json()).consultations ?? []) : [];
        const jobs: JobSummary[] = jobsRes.ok ? ((await jobsRes.json()).jobs ?? []) : [];
        const unapprovedPlans = jobs.filter((j) => j.status === "done" && j.hasFinalOutput && !j.approvedAt);

        if (!cancelled) {
          setSummary({ approvals: approvals.length, consultations: consultations.length, unapprovedPlans: unapprovedPlans.length });
        }
      } catch {
        // next tick retries
      }
    }

    poll();
    const t = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return summary;
}
