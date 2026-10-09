import type { MissionWorktree } from "./missionWorktree";
import { missionActionAvailability } from "./missionModel";

/**
 * Plan approval in the Worktree (C1b.1). Pure helpers; the surface is `PlanApprovalAction`.
 *
 * "Plan approval" is the owner's approval of the recorded FINAL PLAN (`POST /api/jobs/:id/approve`, sets `approvedAt` / `approvedBy`, executes nothing). It is a different thing from tool
 * approval requests (`/api/approvals`, decided in the approvals banner). Nothing here creates a permission rule or a second approval state: the only state is the job's own
 * `approvedAt` / `approvedBy`, read from the same canonical Worktree data; the server alone decides who may approve.
 */
export interface PlanApprovalState {
  /** Present ONLY when the record carries `approvedAt`. `by` only when `approvedBy` is recorded. Never inferred. */
  approved: { at: string; by?: string } | null;
  /** A final plan (final output) is recorded: the precondition the server also enforces. */
  hasFinalPlan: boolean;
}
export function planApprovalOf(worktree: MissionWorktree): PlanApprovalState {
  const m = worktree.mission;
  return { approved: m.approvedAt ? { at: m.approvedAt, ...(m.approvedBy ? { by: m.approvedBy } : {}) } : null, hasFinalPlan: Boolean(m.finalOutputId) };
}

/** Whether the viewer is OFFERED the action. UX only: this is the existing `missionActionAvailability` rule (owner, a final plan, not yet approved); the server re-checks everything. */
export function planApprovalOffered(worktree: MissionWorktree, role: string): boolean {
  const m = worktree.mission;
  return missionActionAvailability({ role, record: { finalOutput: m.finalOutputId ? "recorded" : undefined, ...(m.approvedAt ? { approvedAt: m.approvedAt } : {}) } }).approve;
}

export type PlanApprovalResult = { ok: true } | { ok: false; error: string };
type Fetcher = (input: string, init: { method: string }) => Promise<Pick<Response, "ok" | "status" | "json">>;

/** The existing endpoint, unchanged: `POST /api/jobs/:id/approve`, no body. Returns the REAL server error when it refuses (401 / 403 / 404 / 400 ...). */
export async function approvePlan(jobId: string, fetcher: Fetcher = (input, init) => fetch(input, init)): Promise<PlanApprovalResult> {
  try {
    const response = await fetcher(`/api/jobs/${encodeURIComponent(jobId)}/approve`, { method: "POST" });
    let body: { error?: unknown } | null = null;
    try { body = await response.json(); } catch { /* a non-JSON body: fall through to the status */ }
    if (!response.ok) return { ok: false, error: typeof body?.error === "string" && body.error ? body.error : `Approval failed (HTTP ${response.status}).` };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error && error.message ? error.message : "Approval failed: the request could not be sent." };
  }
}

/** Wraps an async action so a second call while the first is still pending is ignored (returns null). The lock is synchronous, so a double click cannot slip between renders. */
export function singleFlight<A extends unknown[], R>(action: (...args: A) => Promise<R>): ((...args: A) => Promise<R | null>) & { pending: () => boolean } {
  let pending = false;
  const run = async (...args: A): Promise<R | null> => {
    if (pending) return null;
    pending = true;
    try { return await action(...args); } finally { pending = false; }
  };
  return Object.assign(run, { pending: () => pending });
}
