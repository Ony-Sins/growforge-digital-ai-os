import type { MissionWorktree } from "./missionWorktree";

/**
 * Request a change in the Worktree (C1b.2). Pure helpers; the surface is `RevisionRequestAction`.
 *
 * A change request is NOT a note: `POST /api/jobs/:id/revise` records a revision and, when the mission is not running, resets the affected steps so they run again; while it runs the message is
 * queued as a live note. The recorded result is the job's own `revisions` (the Worktree's `requestedChanges`). Nothing here adds a permission rule or a second revision state: the server alone decides
 * who may revise (owner, or the recorded creator), and the client only decides whether to OFFER the control.
 */
export const MIN_REVISION_LENGTH = 5;

/** The authenticated viewer as the app's existing auth session reports it (`/api/auth/session`). `null` fields mean "not known": never guessed. */
export interface ViewerIdentity { email: string | null; role: string | null }

/**
 * Whether the viewer is OFFERED the action. UX only; the server re-checks. It mirrors the server rule exactly (`/api/jobs/:id/revise`): an owner, or the viewer whose email IS the mission's
 * recorded creator. "The mission records a creator" alone is NOT enough - that would offer the action to every employee. `role` is the workspace role the UI already holds
 * (`useAppState().role`); `viewer` is the authenticated identity. An unknown viewer is never treated as the creator.
 */
export function revisionOffered(worktree: MissionWorktree, role: string, viewer: ViewerIdentity | null): boolean {
  if (role === "owner" || viewer?.role === "owner") return true;
  const creator = worktree.mission.createdBy;
  const email = viewer?.email?.trim().toLowerCase();
  return Boolean(creator && email && creator === email);
}

/** The same minimum the old action and the server apply: at least 5 characters after trimming. */
export const revisionMessageValid = (message: string): boolean => message.trim().length >= MIN_REVISION_LENGTH;

export type RevisionResult = { ok: true } | { ok: false; error: string };
type Fetcher = (input: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<Pick<Response, "ok" | "status" | "json">>;

/** The existing endpoint, unchanged: `POST /api/jobs/:id/revise` with `{ message }`. Returns the REAL server error when it refuses (401 / 403 / 404 / 400 / 500 ...). */
export async function requestRevision(jobId: string, message: string, fetcher: Fetcher = (input, init) => fetch(input, init)): Promise<RevisionResult> {
  const text = message.trim();
  if (!revisionMessageValid(text)) return { ok: false, error: `Describe the change in at least ${MIN_REVISION_LENGTH} characters.` };
  try {
    const response = await fetcher(`/api/jobs/${encodeURIComponent(jobId)}/revise`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text }) });
    let body: { error?: unknown } | null = null;
    try { body = await response.json(); } catch { /* a non-JSON body: fall through to the status */ }
    if (!response.ok) return { ok: false, error: typeof body?.error === "string" && body.error ? body.error : `Change request failed (HTTP ${response.status}).` };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error && error.message ? error.message : "Change request failed: the request could not be sent." };
  }
}
