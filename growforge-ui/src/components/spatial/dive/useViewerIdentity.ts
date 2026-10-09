"use client";

import { useEffect, useState } from "react";
import type { ViewerIdentity } from "./missionWorktreeRevision";

/**
 * The authenticated viewer, read once from the app's existing auth session endpoint (NextAuth `/api/auth/session`; no new API, no new identity model). Used only to decide what to OFFER;
 * every server route re-checks the real session. Unknown (signed out, dev bypass, network failure) stays `null`, which offers nothing identity-dependent.
 */
let pending: Promise<ViewerIdentity | null> | null = null;
function readViewer(): Promise<ViewerIdentity | null> {
  pending ??= fetch("/api/auth/session", { cache: "no-store" })
    .then(response => (response.ok ? response.json() : null))
    .then((body: { user?: { email?: unknown; role?: unknown } } | null) => body?.user ? { email: typeof body.user.email === "string" ? body.user.email : null, role: typeof body.user.role === "string" ? body.user.role : null } : null)
    .catch(() => null);
  return pending;
}

export function useViewerIdentity(): ViewerIdentity | null {
  const [viewer, setViewer] = useState<ViewerIdentity | null>(null);
  useEffect(() => { let live = true; void readViewer().then(v => { if (live) setViewer(v); }); return () => { live = false; }; }, []);
  return viewer;
}
