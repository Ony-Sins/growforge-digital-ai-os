"use client";

import { useState } from "react";
import { useAppState } from "@/lib/appState";
import styles from "./DiveOverview.module.css";

/** Existing revision/plan-approval endpoints remain the sole mutation authority. */
export function MissionActions({ id, mode, onUpdated }: { id: string; mode: "revision" | "approval"; onUpdated: () => void }) {
  const { role } = useAppState();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  if (mode === "approval" && role !== "owner") return <p>Plan decisions require an owner.</p>;
  async function submit() {
    if (busy) return;
    setBusy(true); setFeedback(null);
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(id)}/${mode === "revision" ? "revise" : "approve"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: mode === "revision" ? JSON.stringify({ message }) : undefined });
      const body: { error?: string } = await response.json();
      if (!response.ok) throw new Error(body.error || "Request failed.");
      setFeedback(mode === "revision" ? "Change request recorded. Affected work may re-run." : "Plan approval recorded."); setOpen(false); setMessage(""); onUpdated();
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Request failed."); }
    finally { setBusy(false); }
  }
  return <div>{!open ? <button className={styles.inspectionAction} onClick={() => setOpen(true)}>{mode === "revision" ? "Request a change" : "Review plan decision"}</button> : <form onSubmit={event => { event.preventDefault(); void submit(); }}>
    {mode === "revision" ? <><label htmlFor="mission-change-request">Change request</label><textarea id="mission-change-request" className={styles.actionInput} minLength={5} required rows={3} value={message} disabled={busy} onChange={event => setMessage(event.target.value)} /><p>This records a revision and may re-run affected execution. It is not a discussion-only message.</p></> : <p>Approve the recorded final plan? This records owner approval and does not execute external tools.</p>}
    <button className={styles.inspectionAction} type="submit" disabled={busy || mode === "revision" && message.trim().length < 5}>{busy ? "Saving…" : mode === "revision" ? "Submit change request" : "Approve final plan"}</button><button type="button" className={styles.inspectionAction} disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
  </form>}{feedback && <p role="status">{feedback}</p>}</div>;
}
