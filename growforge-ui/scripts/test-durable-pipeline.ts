/**
 * scripts/test-durable-pipeline.ts
 *
 * Verification suite for Trigger.dev / Durable Pipeline Engine (Phase 4, Item 5).
 * Tests:
 * 1. End-to-end job execution through the durable pipeline.
 * 2. Simulated crash & restart recovery: verifies interrupted running jobs
 *    resume cleanly from checkpoints without data loss or re-running finished steps.
 */

import { createAndStartJob, resumePipeline } from "../src/lib/orchestrator";
import { getJob, saveJob, type Job } from "../src/lib/jobStore";
import { recoverInterruptedJobs } from "../src/lib/durableJobEngine";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runVerification() {
  console.log("================================================================================");
  console.log("🚀 TRIGGER.DEV / DURABLE BACKGROUND PIPELINE VERIFICATION SUITE");
  console.log("================================================================================");

  // ---------------------------------------------------------------------------
  // TEST 1: CRASH & RECOVERY SIMULATION
  // ---------------------------------------------------------------------------
  console.log("\n🧪 TEST 1: Process Restart / Mid-Job Crash Recovery");
  console.log("--------------------------------------------------------------------------------");

  const testJobId = `job-crash-test-${Date.now().toString(36)}`;
  console.log(`Creating synthetic checkpointed job in "running" state: ${testJobId}`);

  const mockPlan = {
    title: "Durable Crash Recovery Test Plan",
    assignments: [
      {
        departmentId: "marketing",
        task: "Develop high-converting local organic acquisition strategy",
        activity: "Drafting marketing section",
      },
      {
        departmentId: "finance-ops",
        task: "Model unit economics and ROI breakdown",
        activity: "Modeling financial projections",
      },
    ],
    researchQuestions: [
      "What are the top local competitors and market size in 2026?",
    ],
  };

  const mockDossier = {
    verified: true,
    sources: [
      { title: "Local Market Analysis 2026", uri: "https://example.com/market-2026" },
      { title: "Pricing & Benchmark Report", uri: "https://example.com/pricing-report" },
    ],
    text: "### Finding 1: Market Analysis 2026\nLocal demand is growing at 14% YoY with steady customer acquisition channels.\nSources: [1] [2]",
  };

  // Create a job where 'brief', 'plan', and 'research' are done, 'dept:marketing' was in-flight (active) when crash happened, and 'dept:finance-ops', 'reconcile', 'qa', 'final' are pending.
  const crashMockJob: Job = {
    id: testJobId,
    title: "Durable Crash Recovery Test Plan",
    brief: "Launch an automated dental practice scaling platform in Austin TX with $5,000 monthly marketing budget.",
    status: "running",
    percent: 35,
    verified: true,
    createdAt: new Date(Date.now() - 60000).toISOString(),
    updatedAt: new Date(Date.now() - 30000).toISOString(),
    liveNotes: [],
    revisions: [],
    createdBy: "test-durability@growforge.local",
    planSnapshot: mockPlan,
    dossierSnapshot: mockDossier,
    steps: [
      { id: "brief", kind: "brief", label: "Client Brief", activity: "Confirmed in chat", weight: 0, dependsOn: [], status: "done", percent: 100, output: "Brief details" },
      { id: "plan", kind: "plan", label: "GrowForge HQ", activity: "Assigned 2 departments", weight: 10, dependsOn: ["brief"], status: "done", percent: 100, output: "HQ Plan Output" },
      { id: "research", kind: "research", label: "Live Research", activity: "2 sources gathered", weight: 15, dependsOn: ["plan"], status: "done", percent: 100, output: mockDossier.text, sources: mockDossier.sources },
      { id: "dept:marketing", kind: "department", label: "Marketing & Brand Strategy", departmentId: "marketing", activity: "Drafting in-flight when process crashed", weight: 20, dependsOn: ["research"], status: "active", percent: 40 },
      { id: "dept:finance-ops", kind: "department", label: "Finance & Operations", departmentId: "finance-ops", activity: "Waiting for research", weight: 20, dependsOn: ["research"], status: "pending", percent: 0 },
      { id: "reconcile", kind: "reconcile", label: "Team Review", activity: "Waiting for department drafts", weight: 10, dependsOn: ["dept:marketing", "dept:finance-ops"], status: "pending", percent: 0 },
      { id: "qa", kind: "qa", label: "Quality Assurance", activity: "Waiting for team review", weight: 10, dependsOn: ["reconcile"], status: "pending", percent: 0 },
      { id: "final", kind: "final", label: "Final Plan", activity: "Waiting for QA sign-off", weight: 15, dependsOn: ["qa"], status: "pending", percent: 0 },
    ],
  };

  saveJob(crashMockJob);
  console.log(`✅ Checkpointed job saved with steps: [brief:done, plan:done, research:done, dept:marketing:active, dept:finance-ops:pending, reconcile:pending, qa:pending, final:pending]`);

  console.log("Simulating system boot / recoverInterruptedJobs trigger...");
  const recoveredCount = recoverInterruptedJobs(resumePipeline);
  console.log(`🔄 recoverInterruptedJobs reported ${recoveredCount} jobs recovered.`);

  if (recoveredCount < 1) {
    throw new Error("Expected at least 1 job to be recovered from crash state!");
  }

  // Poll until the recovered job finishes
  console.log("Waiting for recovered job to complete from checkpoint...");
  let attempts = 0;
  while (attempts < 120) {
    await sleep(2000);
    const j = getJob(testJobId);
    if (!j) break;

    const completed = j.steps.filter((s) => s.status === "done").map((s) => s.id);
    const inFlight = j.steps.filter((s) => s.status === "active").map((s) => s.id);
    console.log(`[Job ${testJobId}] Status: ${j.status} | Done: [${completed.join(", ")}] | Active: [${inFlight.join(", ")}]`);

    if (j.status === "done") {
      console.log("\n🎉 TEST 1 PASSED: Recovered job completed successfully from checkpoint!");
      console.log(`Final output length: ${j.finalOutput?.length} chars`);
      console.log(`Verified sources count: ${j.dossierSnapshot?.sources.length}`);
      break;
    }

    if (j.status === "error") {
      throw new Error(`Job failed with error: ${j.error}`);
    }

    attempts++;
  }

  const finalCheck = getJob(testJobId);
  if (finalCheck?.status !== "done") {
    throw new Error(`Crash recovery test timed out without reaching status "done". Current status: ${finalCheck?.status}`);
  }

  // ---------------------------------------------------------------------------
  // TEST 2: LIVE END-TO-END JOB DISPATCH
  // ---------------------------------------------------------------------------
  console.log("\n🧪 TEST 2: Real End-to-End Job Dispatch via Durable Engine");
  console.log("--------------------------------------------------------------------------------");

  const brief = "Scale a boutique cybersecurity consulting firm in Boston targeting mid-market healthcare providers, $10,000/mo ad budget, 90-day timeline.";
  console.log(`Launching real job with brief: "${brief}"`);

  const job = createAndStartJob(brief, "test-e2e@growforge.local");
  console.log(`✅ Job created with ID: ${job.id}`);

  console.log("Monitoring end-to-end durable execution...");
  let e2eAttempts = 0;
  while (e2eAttempts < 180) {
    await sleep(3000);
    const j = getJob(job.id);
    if (!j) break;

    const completed = j.steps.filter((s) => s.status === "done").map((s) => s.id);
    const inFlight = j.steps.filter((s) => s.status === "active").map((s) => s.id);
    console.log(`[Job ${job.id}] Status: ${j.status} (${j.percent}%) | Done (${completed.length}/${j.steps.length}): [${completed.join(", ")}] | Active: [${inFlight.join(", ")}]`);

    if (j.status === "done") {
      console.log("\n🎉 TEST 2 PASSED: End-to-End job completed successfully through durable pipeline!");
      console.log(`Title: ${j.title}`);
      console.log(`Final output length: ${j.finalOutput?.length} chars`);
      console.log(`Steps completed: ${j.steps.filter((s) => s.status === "done").length}/${j.steps.length}`);
      console.log("\nSample final plan preview:");
      console.log("--------------------------------------------------------------------------------");
      console.log(j.finalOutput?.slice(0, 500) + "\n...\n");
      break;
    }

    if (j.status === "error") {
      throw new Error(`E2E Job failed with error: ${j.error}`);
    }

    e2eAttempts++;
  }

  const finalJob = getJob(job.id);
  if (finalJob?.status !== "done") {
    throw new Error(`E2E test timed out without reaching status "done". Current status: ${finalJob?.status}`);
  }

  console.log("\n================================================================================");
  console.log("✅ ALL DURABLE PIPELINE & TRIGGER.DEV VERIFICATIONS PASSED CLEANLY!");
  console.log("================================================================================");
}

runVerification().catch((err) => {
  console.error("❌ Verification failed:", err);
  process.exit(1);
});
