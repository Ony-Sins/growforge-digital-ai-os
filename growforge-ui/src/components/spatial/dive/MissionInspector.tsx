"use client";

import { useEffect, useState } from "react";
import type { CoreJobView, CoreState } from "@/lib/coreState";
import type { Job } from "@/lib/jobStore";
import { canonicalizeDepartmentText, departmentScopeLabel, departmentStepLabel } from "@/lib/departmentTaxonomy";
import { missionApprovals, missionCost, missionLifecycle, selectedMission, type MissionApproval } from "./missionModel";
import type { DiveObject } from "./overviewModel";
import { MissionActions } from "./MissionActions";
import styles from "./DiveOverview.module.css";

const CATEGORIES = ["Identity", "Steps", "Dependencies", "Agents", "Context", "Tools", "Evidence", "Cost", "Telemetry", "Outputs", "Files", "History", "Next steps", "Quality", "Approvals"] as const;
type Category = typeof CATEGORIES[number];

export function MissionInspector({ mission, closing, onClose }: { mission: DiveObject; closing: boolean; onClose: () => void }) {
  const [deep, setDeep] = useState(false);
  const [category, setCategory] = useState<Category>("Steps");
  const [job, setJob] = useState<CoreJobView | null>(null);
  const [record, setRecord] = useState<Job | null>(null);
  const [stepView, setStepView] = useState<"List" | "Timeline">("List");
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [approvals, setApprovals] = useState<MissionApproval[] | null>(null);
  const [approvalError, setApprovalError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    async function load() {
      if (busy) return;
      busy = true;
      try {
        const [response, rawResponse] = await Promise.all([fetch(`/api/core/state?jobId=${encodeURIComponent(mission.id)}`, { signal: controller.signal, cache: "no-store" }), fetch(`/api/jobs/${encodeURIComponent(mission.id)}`, { signal: controller.signal, cache: "no-store" })]);
        if (!response.ok || !rawResponse.ok) throw new Error("Unavailable");
        const snapshot: CoreState = await response.json();
        const raw: { job: Job } = await rawResponse.json();
        const next = selectedMission(snapshot, mission.id);
        if (raw.job.id !== mission.id) throw new Error("Wrong mission");
        if (!controller.signal.aborted) { setJob(next); setRecord(raw.job); setError(false); }
      } catch { if (!controller.signal.aborted) { setJob(null); setRecord(null); setError(true); } }
      finally { busy = false; }
    }
    void load(); const timer = setInterval(() => void load(), 10000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [mission.id, attempt]);
  useEffect(() => {
    if (!job) return;
    window.dispatchEvent(new CustomEvent("growforge:mission-context", { detail: { id: job.id, title: job.title, context: JSON.stringify({ missionId: job.id, title: job.title, status: job.status, brief: job.brief.slice(0, 6000), steps: job.steps.map(step => ({ id: step.id, label: step.label, status: step.status, percent: step.percent })) }) } }));
    return () => { window.dispatchEvent(new CustomEvent("growforge:mission-context", { detail: null })); };
  }, [job]);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/approvals", { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Unavailable");
        const data: { approvals: MissionApproval[] } = await response.json();
        if (!controller.signal.aborted) { setApprovals(missionApprovals(data.approvals ?? [], mission.id)); setApprovalError(false); }
      } catch { if (!controller.signal.aborted) { setApprovals(null); setApprovalError(true); } }
    }
    void load(); const timer = setInterval(() => void load(), 10000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [mission.id, attempt]);
  const activeSteps = job?.steps.filter(step => step.status === "active") ?? [];
  return <aside className={`${styles.inspector} ${styles.missionInspector} ${deep ? styles.deepInspection : ""} ${closing ? styles.dissolving : ""}`} aria-label="Mission execution inspection" aria-hidden={closing} inert={closing ? true : undefined} data-dive-inspector data-nora-side-inspector>
    <button className={styles.close} onClick={onClose} aria-label="Dismiss mission inspection">×</button>
    <p className={styles.eyebrow}>MISSION · {record ? missionLifecycle(record, approvals ?? []) : mission.status}</p><h2>{mission.name}</h2>
    {error ? <div className={styles.detail}>Selected mission state is unavailable. <button className={styles.inspectionAction} onClick={() => setAttempt(value => value + 1)}>Retry</button></div> : !job ? <p className={styles.detail} role="status">Reading recorded execution…</p> : <>
      {!deep ? <div className={styles.detail}><p>{job.percent}% recorded progress</p><p>{activeSteps.length ? activeSteps.map(step => step.label).join(" · ") : "No active step recorded."}</p><button className={styles.inspectionAction} onClick={() => setDeep(true)}>Inspect execution</button></div> : <>
        <div className={styles.inspectionControls}><button className={styles.inspectionAction} onClick={() => setDeep(false)}>Summary</button><select aria-label="Mission inspection category" value={category} onChange={event => setCategory(event.target.value as Category)}>{CATEGORIES.map(name => <option key={name}>{name}</option>)}</select></div>
        <div key={category} className={`${styles.detail} ${styles.missionContent}`} aria-label={`${category} details`}>
          {category === "Steps" && <div className={styles.tabs}>{(["List", "Timeline"] as const).map(view => <button key={view} aria-pressed={stepView === view} onClick={() => setStepView(view)}>{view}</button>)}</div>}
          <MissionCategory category={category} job={job} record={record} stepView={stepView} approvals={approvals} approvalError={approvalError} />
          {category === "History" && <MissionActions id={mission.id} mode="revision" onUpdated={() => setAttempt(value => value + 1)} />}
          {category === "Approvals" && record?.finalOutput && !job.approvedAt && <MissionActions id={mission.id} mode="approval" onUpdated={() => setAttempt(value => value + 1)} />}
        </div>
      </>}
    </>}
    <p className={styles.identity}>{mission.id}</p>
  </aside>;
}

function MissionCategory({ category, job, record, stepView, approvals, approvalError }: { category: Category; job: CoreJobView; record: Job | null; stepView: "List" | "Timeline"; approvals: MissionApproval[] | null; approvalError: boolean }) {
  if (category === "Identity") return <><p>{job.id}<br />{job.status} · {job.percent}%</p><p>Created {job.createdAt}<br />Mission type: not recorded<br />Due date: not recorded<br />Business metrics: not recorded</p></>;
  if (category === "Dependencies") return <>{record?.steps.map(step => <p key={step.id}>{departmentStepLabel(step)}<br />{step.dependsOn.length ? step.dependsOn.map(id => { const prerequisite = record.steps.find(candidate => candidate.id === id); return prerequisite ? departmentStepLabel(prerequisite) : id; }).join(" · ") : "No recorded prerequisites"}</p>)}</>;
  if (category === "History") return <><p>Created {job.createdAt}{job.finishedAt && <><br />Finished {job.finishedAt}</>}</p>{record?.revisions.map(revision => <p key={revision.id}>{revision.createdAt} · {revision.effect}<br />{canonicalizeDepartmentText(revision.message)}</p>)}{record?.liveNotes.map((note, index) => <p key={index}>{canonicalizeDepartmentText(note)}</p>)}<p>Recorded notes/revisions only. No separate discussion thread is stored.</p></>;
  if (category === "Next steps") return <>{record?.steps.filter(step => step.status === "pending" || step.status === "error").map(step => <p key={step.id}>{departmentStepLabel(step)} · {step.status}<br />{step.dependsOn.length ? "Requires recorded prerequisites" : "No recorded prerequisites"}</p>)}{!record?.steps.some(step => step.status === "pending" || step.status === "error") && <p>No pending execution steps recorded.</p>}</>;
  if (category === "Files") { const media = [...(record?.media ?? []), ...(record?.steps.flatMap(step => step.media ?? []) ?? [])]; return <>{media.map((item, index) => <p key={index}><a href={item.url.startsWith("/api/media/") || /^https?:\/\//i.test(item.url) ? item.url : undefined} target="_blank" rel="noreferrer">{item.label ?? item.type}</a></p>)}{!media.length && <p>No file/media deliverables recorded.</p>}</>; }
  if (category === "Context") return <p>{canonicalizeDepartmentText(job.brief) || "No recorded brief."}</p>;
  if (category === "Quality") return <>{job.steps.filter(step => step.kind === "qa" || step.kind === "reconcile").map(step => <details key={step.id}><summary>{step.label} · {step.status}</summary><p>{canonicalizeDepartmentText(record?.steps.find(raw => raw.id === step.id)?.output ?? "No review output recorded.")}</p></details>)}{!job.steps.some(step => step.kind === "qa" || step.kind === "reconcile") && <p>No review or QA stage recorded.</p>}</>;
  if (category === "Cost") return <><p>{missionCost(job)}</p>{job.usage && <p>{job.usage.totalTokens.toLocaleString()} reported tokens · {job.usage.calls} model calls. This token aggregate may be partial when providers omit usage. Total economic cost is not recorded.</p>}</>;
  if (category === "Agents") return <><p>Assigned department execution scopes. These are not proof that a standalone specialist was dispatched.</p>{job.departments.filter(department => department.assigned).map(department => <p key={department.id}>{departmentScopeLabel(department.id)} · {department.step?.status ?? "Assigned"}</p>)}{!job.departments.some(department => department.assigned) && <p>No department assignment recorded.</p>}</>;
  if (category === "Steps") return <>{job.steps.map(step => <p key={step.id}>{step.label}<br /><span>{step.status} · {step.percent}%</span>{stepView === "Timeline" && <><br />{step.startedAt ? `Started ${step.startedAt}` : step.status === "pending" ? "Not started" : "Start time not recorded"}{step.finishedAt && <><br />Finished {step.finishedAt}</>}</>}{step.error && <><br />{step.error}</>}</p>)}{!job.steps.length && <p>No recorded steps.</p>}</>;
  if (category === "Evidence") return <><p>{job.research.sourceCount} recorded research sources · {job.research.verified ? "Grounded research recorded" : "Research not verified"}</p>{job.research.sources.map((source, index) => <p key={`${source.url}:${index}`}><a href={/^https?:\/\//i.test(source.url) ? source.url : undefined} target="_blank" rel="noreferrer">{source.title}</a></p>)}{job.research.sourceCount > job.research.sources.length && <p>Showing {job.research.sources.length} source previews.</p>}</>;
  if (category === "Telemetry") return <>{job.steps.filter(step => step.startedAt || step.finishedAt || step.provider).map(step => <p key={step.id}>{step.label}<br />{step.provider ?? "Provider unrecorded"}{step.startedAt && <><br />Started {step.startedAt}</>}{step.finishedAt && <><br />Finished {step.finishedAt}</>}</p>)}{!job.steps.some(step => step.startedAt || step.finishedAt || step.provider) && <p>No recorded step telemetry.</p>}<p>Recorded timestamps and providers only; no inferred transfer traffic.</p></>;
  if (category === "Outputs") return <>{record?.finalOutput && <details><summary>Final deliverable</summary><p>{canonicalizeDepartmentText(record.finalOutput)}</p></details>}{record?.steps.filter(step => step.output).map(step => <details key={step.id}><summary>{departmentStepLabel(step)}</summary><p>{canonicalizeDepartmentText(step.output ?? "")}</p></details>)}{!record?.finalOutput && !record?.steps.some(step => step.output) && <p>No output recorded.</p>}</>;
  return <>{category === "Tools" && <p>Approval requests are not executed tool calls. This snapshot has no tool-execution receipts.</p>}{approvalError ? <p>Approval state unavailable.</p> : approvals === null ? <p>Reading mission approval queue…</p> : approvals.length ? approvals.map(approval => <p key={approval.id}>{approval.toolName} · {approval.status}<br />{approval.stepId}</p>) : <p>No pending tool approvals for this mission.</p>}{category === "Approvals" && <><p>{job.approvedAt ? `Plan approval recorded ${job.approvedAt}.` : "No plan approval recorded."} Inspection does not approve or execute an action.</p>{Boolean(approvals?.length) && <button className={styles.inspectionAction} onClick={() => window.dispatchEvent(new CustomEvent("growforge:mission-approvals", { detail: job.id }))}>Review tool approval requests</button>}</>}</>;
}

