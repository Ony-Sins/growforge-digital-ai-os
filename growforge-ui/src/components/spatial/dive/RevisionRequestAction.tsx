"use client";

/**
 * "Request a change" in the Mission Workbench's Requested changes section (C1b.2). A thin surface over the existing `POST /api/jobs/:id/revise`; the server is the only authority (session,
 * owner or creator, public preview refused), the client rule is a UX offer. It says before submitting that a revision may make mission work run again, shows the server's own error and keeps the
 * typed request for a retry, and cannot be submitted twice (a synchronous single-flight lock plus disabled controls). It never claims a change or a re-run: the recorded request is shown by the
 * section once the canonical data is re-read.
 */
import { useEffect, useMemo, useState } from "react";
import { useAppState } from "@/lib/appState";
import type { MissionWorktree } from "./missionWorktree";
import { requestRevision, revisionMessageValid, revisionOffered } from "./missionWorktreeRevision";
import { singleFlight } from "./missionWorktreePlanApproval";
import { useViewerIdentity } from "./useViewerIdentity";
import styles from "./RevisionRequestAction.module.css";

export function RevisionRequestAction({ worktree, onRequested, onActive }: { worktree: MissionWorktree; /** Re-read the canonical Worktree data now (not on the next poll). */ onRequested: () => void; /** C8 / S2: true while a request is being typed or saved (a host that can be closed asks before discarding it). */ onActive?: (active: boolean) => void }) {
  const { role } = useAppState();
  const viewer = useViewerIdentity();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The number of recorded changes when the request was accepted: the "sent" note stays until the re-read shows a new record, never longer.
  const [sentAt, setSentAt] = useState<number | null>(null);
  const jobId = worktree.missionId;
  const active = busy || (open && message.trim().length > 0);
  useEffect(() => { onActive?.(active); return () => onActive?.(false); }, [active, onActive]);
  const recorded = worktree.mission.requestedChanges.length;
  const submit = useMemo(() => singleFlight(async (text: string, before: number) => {
    setBusy(true); setError(null);
    const result = await requestRevision(jobId, text);
    if (result.ok) { setSentAt(before); setMessage(""); setOpen(false); onRequested(); } else setError(result.error);
    setBusy(false);
    return result;
  }), [jobId, onRequested]);
  const waiting = sentAt !== null && recorded <= sentAt; // derived: once the re-read shows a new record the note is simply gone
  if (!waiting && !revisionOffered(worktree, role, viewer)) return null;
  if (waiting) return <div className={styles.root}><p role="status" className={styles.note}>Change request sent. Reading the recorded state…</p></div>;
  const valid = revisionMessageValid(message);
  return <div className={styles.root} data-revision-request>
    {!open
      ? <button className={styles.action} onClick={() => { setOpen(true); setError(null); }}><span>Request a change</span></button>
      : <form onSubmit={event => { event.preventDefault(); if (valid) void submit(message, recorded); }} aria-label="Request a change">
        <label className={styles.label} htmlFor="mission-change-request">Change request</label>
        <textarea id="mission-change-request" className={styles.input} rows={3} required minLength={5} value={message} disabled={busy} onChange={event => setMessage(event.target.value)} />
        <p className={styles.warn}>This records a revision and may make this mission’s work run again. It is not a discussion-only message and not a harmless note.</p>
        <div className={styles.row}>
          <button className={styles.action} type="submit" disabled={busy || !valid}><span>{busy ? "Saving…" : "Submit change request"}</span></button>
          <button className={styles.quiet} type="button" disabled={busy} onClick={() => { setOpen(false); setError(null); }}>Cancel</button>
        </div>
      </form>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </div>;
}
