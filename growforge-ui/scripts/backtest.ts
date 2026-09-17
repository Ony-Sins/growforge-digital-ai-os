/**
 * Backtest / validation harness for the orchestrator pipeline
 * (src/lib/orchestrator.ts).
 *
 * Runs a fixed set of representative client briefs through the REAL
 * pipeline — same createAndStartJob() the live app calls, same LLM
 * provider chain, no mocking — and checks the finished job against
 * deterministic structural invariants (every department completed, the
 * UNVERIFIED banner appears exactly when no research ran, QA actually
 * produced output, etc).
 *
 * This is deliberately NOT an LLM-judged "is this a good plan" grader —
 * that would be a second unreliable model grading a first one. It only
 * checks things the orchestrator's own code guarantees structurally, so a
 * failure here means the pipeline's *contract* broke, not that a model
 * had an off day.
 *
 * Two side effects of running the real pipeline are corralled, not
 * disabled: it writes docs/brain/CURRENT_STATE.md as it goes (restored to
 * its pre-run content when the backtest finishes) and it persists synthetic
 * jobs into data/jobs.json (deleted when the backtest finishes).
 *
 * A per-fixture baseline (shape only: department count, output length
 * bucket, verified flag) is written to data/backtests/baseline/ on first
 * run and compared against on every run after, to catch silent regressions
 * (e.g. a plan that used to get 5 departments now only gets 2).
 *
 * Usage: npm run backtest
 */
import fs from "node:fs";
import path from "node:path";

// tsx doesn't auto-load Next's .env.local the way `next dev`/`next build` do,
// so a standalone script sees none of it unless loaded here — without this,
// every provider key (and VAULT_MASTER_KEY) silently reads as unset.
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

import { getJob, deleteJob, type Job } from "../src/lib/jobStore";
import { createAndStartJob } from "../src/lib/orchestrator";

const UI_DIR = process.cwd();
const ROOT_DIR = path.resolve(UI_DIR, "..");
const BRAIN_FILES = ["CURRENT_STATE.md", "DECISION_REGISTRY.md"].flatMap((f) => [
  path.join(UI_DIR, "docs", "brain", f),
  path.join(ROOT_DIR, "docs", "brain", f),
]);
const BASELINE_DIR = path.join(UI_DIR, "data", "backtests", "baseline");
const REPORT_DIR = path.join(UI_DIR, "data", "backtests", "reports");

const POLL_INTERVAL_MS = 4_000;
const JOB_TIMEOUT_MS = 25 * 60 * 1000; // generous: worst case includes two 10-min HITL waits

interface Fixture {
  slug: string;
  brief: string;
}

const FIXTURES: Fixture[] = [
  {
    slug: "ecommerce-skincare-dtc",
    brief: [
      "# CLIENT & BUSINESS: Lumen & Co — DTC Skincare Brand",
      "Location: Austin, TX, USA (ships nationwide)",
      "Stage: Post-launch, $40k/mo revenue, 8 months old",
      "Target Customers: Women 25-45 interested in clean-ingredient skincare",
      "Offer & Pricing: Serum + moisturizer bundle, $68 AOV",
      "Budget: $6,000/month across paid + retention",
      "Goals: Grow to $80k/mo revenue in 6 months, reduce CAC below $35",
      "Deliverables: Growth marketing plan, Meta/TikTok ad strategy, email/SMS retention plan",
    ].join("\n"),
  },
  {
    slug: "b2b-saas-scheduling-tool",
    brief: [
      "# CLIENT & BUSINESS: Rosterly — B2B Shift-Scheduling SaaS",
      "Location: Toronto, Canada (sells to US + Canada SMBs)",
      "Stage: Seed-stage, 40 paying customers, $9k MRR",
      "Target Customers: Restaurant and retail managers with 10-50 hourly staff",
      "Offer & Pricing: $49-$199/mo tiered SaaS subscription",
      "Budget: $3,000/month marketing + outbound",
      "Goals: Reach $25k MRR in 6 months via inbound content + outbound sales",
      "Deliverables: GTM plan, website/landing conversion plan, outbound sales motion, automation for onboarding",
    ].join("\n"),
  },
];

interface ValidationResult {
  name: string;
  ok: boolean;
  severity: "fail" | "warn";
  detail?: string;
}

interface Baseline {
  departmentCount: number;
  departmentIds: string[];
  verified: boolean;
  finalOutputLength: number;
}

function snapshotBrainFiles(): Map<string, string | null> {
  const snap = new Map<string, string | null>();
  for (const f of BRAIN_FILES) snap.set(f, fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null);
  return snap;
}

function restoreBrainFiles(snap: Map<string, string | null>): void {
  for (const [f, content] of snap) {
    if (content === null) continue; // didn't exist before — leave whatever the run created
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, content, "utf8");
  }
}

async function waitForCompletion(jobId: string): Promise<Job> {
  const deadline = Date.now() + JOB_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const job = getJob(jobId);
    if (!job) throw new Error(`Job ${jobId} vanished from the store mid-run.`);
    if (job.status === "done" || job.status === "error") return job;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  const job = getJob(jobId);
  throw new Error(
    `Job ${jobId} did not finish within ${JOB_TIMEOUT_MS / 60000} minutes ` +
      `(last known status: ${job?.status}, ${job?.percent}%, active step: ` +
      `${job?.steps.find((s) => s.status === "active")?.id ?? "none"}).`,
  );
}

function validateJob(job: Job): ValidationResult[] {
  const results: ValidationResult[] = [];
  const push = (name: string, ok: boolean, severity: ValidationResult["severity"] = "fail", detail?: string) =>
    results.push({ name, ok, severity, detail });

  push("job finished with status 'done'", job.status === "done", "fail", job.error);

  const nonSkipped = job.steps.filter((s) => s.status !== "skipped");
  const incomplete = nonSkipped.filter((s) => s.status !== "done" && s.status !== "error");
  push("no step left pending/active at completion", incomplete.length === 0, "fail", incomplete.map((s) => s.id).join(", "));

  const deptSteps = job.steps.filter((s) => s.kind === "department");
  push("at least 3 departments assigned", deptSteps.length >= 3, "fail", `got ${deptSteps.length}`);
  push(
    "every department step produced output",
    deptSteps.every((s) => s.status !== "done" || (s.output && s.output.trim().length > 0)),
    "fail",
    deptSteps.filter((s) => s.status === "done" && !s.output?.trim()).map((s) => s.id).join(", "),
  );

  const qaStep = job.steps.find((s) => s.kind === "qa");
  push("QA step ran and produced output", !!qaStep && qaStep.status === "done" && !!qaStep.output?.trim(), "fail");

  push("final deliverable is non-trivial (>500 chars)", (job.finalOutput?.length ?? 0) > 500, "fail", `got ${job.finalOutput?.length ?? 0} chars`);

  // The estimate-mode banner is appended by orchestrator code, never by a
  // model (see orchestrator.ts final-plan step) — so it must be present
  // exactly when verified is false, and absent when true.
  const hasUnverifiedBanner = (job.finalOutput ?? "").includes("UNVERIFIED");
  push(
    "UNVERIFIED banner presence matches job.verified flag",
    hasUnverifiedBanner === !job.verified,
    "fail",
    `verified=${job.verified}, bannerPresent=${hasUnverifiedBanner}`,
  );

  const researchStep = job.steps.find((s) => s.kind === "research");
  push(
    "research step reached a terminal state",
    researchStep?.status === "done" || researchStep?.status === "error" || researchStep?.status === "skipped",
    "warn",
  );

  return results;
}

function loadBaseline(slug: string): Baseline | null {
  const file = path.join(BASELINE_DIR, `${slug}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as Baseline;
  } catch {
    return null;
  }
}

function saveBaseline(slug: string, baseline: Baseline): void {
  fs.mkdirSync(BASELINE_DIR, { recursive: true });
  fs.writeFileSync(path.join(BASELINE_DIR, `${slug}.json`), JSON.stringify(baseline, null, 2), "utf8");
}

function compareToBaseline(slug: string, current: Baseline): ValidationResult[] {
  const prior = loadBaseline(slug);
  if (!prior) {
    saveBaseline(slug, current);
    return [{ name: "baseline established (first run)", ok: true, severity: "warn" }];
  }
  const results: ValidationResult[] = [];
  results.push({
    name: "department count did not shrink vs baseline",
    ok: current.departmentCount >= prior.departmentCount,
    severity: "warn",
    detail: `baseline=${prior.departmentCount}, now=${current.departmentCount}`,
  });
  results.push({
    name: "final output length within 50% of baseline",
    ok: current.finalOutputLength >= prior.finalOutputLength * 0.5,
    severity: "warn",
    detail: `baseline=${prior.finalOutputLength} chars, now=${current.finalOutputLength} chars`,
  });
  return results;
}

// If this process is killed mid-fixture (Ctrl+C, or an external
// TaskStop/kill) the normal try/catch cleanup below never runs, leaving
// CURRENT_STATE.md overwritten with synthetic job data and an orphaned job
// stuck in "running" — exactly what happened once during development. This
// tracks whatever's currently in flight so a signal handler can still clean
// up on the way out.
let inFlight: { brainSnapshot: Map<string, string | null>; jobId: string } | null = null;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (inFlight) {
      console.warn(`\nInterrupted mid-fixture — restoring brain files and removing job ${inFlight.jobId} before exit.`);
      restoreBrainFiles(inFlight.brainSnapshot);
      deleteJob(inFlight.jobId);
    }
    process.exit(1);
  });
}

async function runFixture(fixture: Fixture): Promise<{ slug: string; results: ValidationResult[]; durationMs: number; error?: string }> {
  console.log(`\n=== Fixture: ${fixture.slug} ===`);
  const brainSnapshot = snapshotBrainFiles();
  const started = Date.now();
  let job: Job;
  let jobId: string | undefined;

  try {
    const created = createAndStartJob(fixture.brief, "backtest@growforgedigital.com");
    jobId = created.id;
    inFlight = { brainSnapshot, jobId };
    console.log(`  launched ${jobId}, polling every ${POLL_INTERVAL_MS / 1000}s (timeout ${JOB_TIMEOUT_MS / 60000}m)...`);
    job = await waitForCompletion(jobId);
    inFlight = null;
  } catch (err) {
    inFlight = null;
    restoreBrainFiles(brainSnapshot);
    if (jobId) deleteJob(jobId);
    return { slug: fixture.slug, results: [], durationMs: Date.now() - started, error: err instanceof Error ? err.message : String(err) };
  }

  const durationMs = Date.now() - started;
  const results = validateJob(job);

  const baseline: Baseline = {
    departmentCount: job.steps.filter((s) => s.kind === "department").length,
    departmentIds: job.steps.filter((s) => s.kind === "department").map((s) => s.departmentId ?? s.id),
    verified: job.verified,
    finalOutputLength: job.finalOutput?.length ?? 0,
  };
  results.push(...compareToBaseline(fixture.slug, baseline));
  if (results.some((r) => r.ok && r.name.startsWith("baseline established"))) {
    // first run: nothing to compare, baseline already saved above
  } else {
    saveBaseline(fixture.slug, baseline);
  }

  restoreBrainFiles(brainSnapshot);
  deleteJob(job.id);

  return { slug: fixture.slug, results, durationMs };
}

async function main() {
  const runs: Awaited<ReturnType<typeof runFixture>>[] = [];
  for (const fixture of FIXTURES) {
    runs.push(await runFixture(fixture));
  }

  console.log(`\n${"=".repeat(65)}`);
  console.log("  BACKTEST SUMMARY");
  console.log("=".repeat(65));

  let totalFail = 0;
  let totalWarn = 0;
  const reportLines: string[] = [`# Backtest report — ${new Date().toISOString()}`, ""];

  for (const run of runs) {
    console.log(`\n${run.slug}  (${(run.durationMs / 1000).toFixed(0)}s)`);
    reportLines.push(`## ${run.slug} — ${(run.durationMs / 1000).toFixed(0)}s`, "");
    if (run.error) {
      console.log(`  ✗ CRASHED: ${run.error}`);
      reportLines.push(`- ✗ CRASHED: ${run.error}`, "");
      totalFail++;
      continue;
    }
    for (const r of run.results) {
      const icon = r.ok ? "✓" : r.severity === "fail" ? "✗" : "⚠";
      console.log(`  ${icon} ${r.name}${r.detail ? ` (${r.detail})` : ""}`);
      reportLines.push(`- ${icon} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
      if (!r.ok && r.severity === "fail") totalFail++;
      if (!r.ok && r.severity === "warn") totalWarn++;
    }
    reportLines.push("");
  }

  console.log(`\n${"=".repeat(65)}`);
  console.log(`  ${totalFail} failing checks, ${totalWarn} warnings, across ${runs.length} fixture(s)`);
  console.log("=".repeat(65));

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const reportFile = path.join(REPORT_DIR, `${new Date().toISOString().replace(/[:.]/g, "-")}.md`);
  fs.writeFileSync(reportFile, reportLines.join("\n"), "utf8");
  console.log(`\nFull report written to ${path.relative(UI_DIR, reportFile)}`);

  if (totalFail > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Backtest harness crashed:", err);
  process.exit(1);
});
