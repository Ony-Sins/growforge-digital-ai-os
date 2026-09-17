import fs from "node:fs";
import path from "node:path";
import type { Source } from "@/lib/research";

/**
 * Persisted orchestration jobs (data/jobs.json). A job is one brief moving
 * through the pipeline HQ plan → research → departments → team review → QA
 * → final plan; each stage is a `JobStep`, which is exactly one node on the
 * live project canvas. The canvas polls these records, so every progress
 * number shown there is written here by the orchestrator as real work
 * completes — nothing on screen is animated independently of it.
 */

export type StepStatus = "pending" | "active" | "done" | "error" | "skipped";
export type StepKind = "brief" | "plan" | "research" | "department" | "reconcile" | "qa" | "final";
export type JobStatus = "running" | "done" | "error";

export interface JobStep {
  id: string;
  kind: StepKind;
  label: string;
  departmentId?: string;
  /** Plain-English description of what this agent is doing right now. */
  activity: string;
  status: StepStatus;
  percent: number;
  /** Share of the job's overall progress this step accounts for. */
  weight: number;
  dependsOn: string[];
  output?: string;
  sources?: Source[];
  error?: string;
  provider?: string;
  /** Short hash of the exact constitution+department instructions text this
   *  step's model call was given — see hashInstructions() in departments.ts.
   *  Lets a plan answer "which version of the rules produced this" without
   *  anyone needing to check git log. */
  instructionsHash?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface RevisionEntry {
  id: string;
  message: string;
  createdAt: string;
  /** "queued" while the job was still running (applied to whatever hadn't
   *  started yet); "reran" once it triggered a real selective redo. */
  effect: "queued" | "reran";
  /** Present only for a "reran" entry — which steps HQ decided to redo. */
  redoneSteps?: string[];
}

export interface Job {
  id: string;
  title: string;
  brief: string;
  status: JobStatus;
  percent: number;
  /** True only when live search-grounded research actually ran. */
  verified: boolean;
  steps: JobStep[];
  finalOutput?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
  /** Change requests made after launch — see reviseJob() in orchestrator.ts.
   *  While the job is still running, each note here is read fresh by any
   *  stage that hasn't started its model call yet, so a live change reaches
   *  everything still ahead of it without touching in-flight work. */
  liveNotes: string[];
  revisions: RevisionEntry[];
  /** Email of the signed-in user who launched it. Projects are visible to the
   *  whole authorized team, but only the creator or an owner may change one. */
  createdBy?: string;
  /** Set once an owner clicks Approve on the finished plan (see
   *  /api/jobs/[id]/approve) — real state backing the "pending CEO
   *  approval" language in the final plan, not just decorative text. */
  approvedAt?: string;
  approvedBy?: string;
  /** Snapshots that let resumePipeline() redo just one stage without
   *  re-deriving everything from scratch — see orchestrator.ts. */
  planSnapshot?: { title: string; assignments: { departmentId: string; task: string; activity: string }[] };
  dossierSnapshot?: { text: string; sources: Source[]; verified: boolean };
}

export type JobSummary = Pick<
  Job,
  "id" | "title" | "status" | "percent" | "verified" | "createdAt" | "updatedAt" | "finishedAt" | "approvedAt"
> & { activeStep: string | null; hasFinalOutput: boolean };

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "jobs.json");
const MAX_JOBS = 50;

const globalForStore = globalThis as unknown as { __growforgeJobs?: Job[] };

function loadFromDisk(): Job[] {
  try {
    if (!fs.existsSync(STORE_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
    if (!Array.isArray(parsed)) return [];
    // A job still "running" on load was cut off by a server restart — its
    // in-memory pipeline is gone, so say so rather than show it stuck forever.
    return (parsed as Job[]).map((raw) => ({ ...raw, liveNotes: raw.liveNotes ?? [], revisions: raw.revisions ?? [] })).map((job) =>
      job.status === "running"
        ? {
            ...job,
            status: "error" as const,
            error: "Interrupted by a server restart before it finished.",
            steps: job.steps.map((s) => (s.status === "active" ? { ...s, status: "error" as const, error: "Interrupted" } : s)),
          }
        : job,
    );
  } catch (err) {
    console.error("[jobStore] failed to read jobs.json — starting empty:", err);
    return [];
  }
}

let writeQueue: Promise<void> = Promise.resolve();

function persist() {
  const json = JSON.stringify(getStore(), null, 2);
  const tmp = STORE_FILE + ".tmp";
  writeQueue = writeQueue
    .then(async () => {
      await fs.promises.mkdir(DATA_DIR, { recursive: true });
      await fs.promises.writeFile(tmp, json, "utf8");
      await fs.promises.rename(tmp, STORE_FILE);
    })
    .catch((err) => console.error("[jobStore] failed to persist jobs.json:", err));
}

function getStore(): Job[] {
  if (!globalForStore.__growforgeJobs) globalForStore.__growforgeJobs = loadFromDisk();
  return globalForStore.__growforgeJobs;
}

function computePercent(steps: JobStep[]): number {
  const total = steps.reduce((sum, s) => sum + s.weight, 0) || 1;
  const done = steps.reduce((sum, s) => {
    const p = s.status === "done" || s.status === "skipped" || s.status === "error" ? 100 : s.percent;
    return sum + (s.weight * p) / 100;
  }, 0);
  return Math.min(100, Math.round((done / total) * 100));
}

export function saveJob(job: Job): Job {
  const store = getStore();
  const idx = store.findIndex((j) => j.id === job.id);
  if (idx === -1) store.unshift(job);
  else store[idx] = job;
  if (store.length > MAX_JOBS) store.length = MAX_JOBS;
  persist();
  return job;
}

export function getJob(id: string): Job | undefined {
  return getStore().find((j) => j.id === id);
}

/** Removes a job outright — for synthetic/backtest jobs that should never
 *  show up in the real project list, not for anything a real client saw. */
export function deleteJob(id: string): void {
  const store = getStore();
  const idx = store.findIndex((j) => j.id === id);
  if (idx === -1) return;
  store.splice(idx, 1);
  persist();
}

export function listJobSummaries(): JobSummary[] {
  return getStore().map((j) => ({
    id: j.id,
    title: j.title,
    status: j.status,
    percent: j.percent,
    verified: j.verified,
    createdAt: j.createdAt,
    updatedAt: j.updatedAt,
    finishedAt: j.finishedAt,
    approvedAt: j.approvedAt,
    hasFinalOutput: !!j.finalOutput,
    activeStep: j.steps.find((s) => s.status === "active")?.label ?? null,
  }));
}

/** Applies a patch to one step, recomputes overall progress, and persists. */
export function updateStep(jobId: string, stepId: string, patch: Partial<JobStep>): void {
  const job = getJob(jobId);
  if (!job) return;
  job.steps = job.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s));
  job.percent = computePercent(job.steps);
  job.updatedAt = new Date().toISOString();
  persist();
}

export function updateJob(jobId: string, patch: Partial<Job>): void {
  const job = getJob(jobId);
  if (!job) return;
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  job.percent = patch.status === "done" ? 100 : computePercent(job.steps);
  persist();
}

/** Appends a live note a not-yet-started stage will pick up on its next
 *  model call (see loadBriefWithNotes in orchestrator.ts) — safe to call
 *  on a running job because it never touches an in-flight step. */
export function addLiveNote(jobId: string, note: string): void {
  const job = getJob(jobId);
  if (!job) return;
  job.liveNotes = [...job.liveNotes, note];
  job.updatedAt = new Date().toISOString();
  persist();
}

/** Records a completed revision (queued-while-running, or a real redo) in
 *  the job's history — shown on the canvas so "what changed and when" is
 *  never silent. */
export function addRevisionEntry(jobId: string, entry: Omit<RevisionEntry, "id" | "createdAt">): void {
  const job = getJob(jobId);
  if (!job) return;
  job.revisions = [
    ...job.revisions,
    { ...entry, id: `rev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, createdAt: new Date().toISOString() },
  ];
  job.updatedAt = new Date().toISOString();
  persist();
}

/** Resets exactly the given steps back to pending so resumePipeline() can
 *  redo just that slice — everything else (including other departments'
 *  finished drafts) is left untouched and reused as-is. The caller
 *  (orchestrator.reviseJob) is responsible for including every downstream
 *  synthesis step (reconcile/qa/final) whose inputs changed; this function
 *  does no cascading of its own. Only valid on a job that's DONE or ERROR —
 *  never call this on a running job, since that would race in-flight work. */
export function resetStepsForRedo(jobId: string, stepIds: string[]): string[] {
  const job = getJob(jobId);
  if (!job) return [];

  const idSet = new Set(stepIds);
  const reset: string[] = [];
  job.steps = job.steps.map((s) => {
    if (!idSet.has(s.id)) return s;
    reset.push(s.id);
    return { ...s, status: "pending" as const, percent: 0, output: undefined, sources: undefined, error: undefined, startedAt: undefined, finishedAt: undefined };
  });
  job.status = "running";
  job.finalOutput = undefined;
  job.finishedAt = undefined;
  job.percent = computePercent(job.steps);
  job.updatedAt = new Date().toISOString();
  persist();
  return reset;
}
