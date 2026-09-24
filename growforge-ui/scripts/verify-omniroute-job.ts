/**
 * scripts/verify-omniroute-job.ts
 *
 * Launches a real end-to-end multi-agent job via POST http://localhost:3000/api/jobs
 * and polls http://localhost:3000/api/core/state and /api/jobs/{id} to monitor
 * execution, timing, provider routing (OmniRoute Tier 1 / Ollama Tier 2 fallback),
 * token metrics, and output quality.
 */

import { createAndStartJob } from "../src/lib/orchestrator";
import { getJob } from "../src/lib/jobStore";
import { listPendingApprovals, decideApproval } from "../src/lib/approvalStore";

const BRIEF = `Launch and scale a high-efficiency residential heat pump and electrical HVAC retrofit service in Austin, TX called "Apex Thermal Labs".

Goals:
- Acquire 30 high-ticket residential installation clients in Q4 2026.
- Target homeowners in Austin metro area with aging HVAC units (>10 years).
- Budget: $8,500/month for marketing, paid advertising, and lead acquisition.
- Need complete business architecture: market research, competitive pricing model, paid search & social ad funnels, CRM/booking automation, and technical operations plan.`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("==================================================================");
  console.log("🚀 GrowForge Live Multi-Agent Job Verification with OmniRoute");
  console.log("==================================================================");
  console.log(`Brief: Apex Thermal Labs (Austin, TX HVAC / Heat Pump retrofit)`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Pipeline Engine: Durable Job Engine + OmniRoute Tier 1 / Ollama Tier 2\n`);

  const startTime = Date.now();
  console.log("Dispatching createAndStartJob...");
  const initialJob = createAndStartJob(BRIEF, "owner@growforge.local");
  const jobId = initialJob.id;
  console.log(`Created Job ID: ${jobId}`);
  console.log(`Monitoring pipeline progress in real-time...\n`);

  let lastActivity = "";
  let lastCompletedSteps = 0;

  while (true) {
    await sleep(2000);

    // Auto-approve confirm-band blueprint requests during automated test runs
    const pendings = listPendingApprovals();
    for (const p of pendings) {
      if (p.jobId === jobId) {
        decideApproval(p.id, "approved", "test-operator");
        console.log(`[test-operator] Auto-approved blueprint confirmation: ${p.toolName} (${p.stepLabel})`);
      }
    }

    const job = getJob(jobId);
    if (!job) {
      console.warn(`[warning] Job ${jobId} not found in store yet...`);
      continue;
    }
    const elapsedSec = Math.round((Date.now() - startTime) / 1000);

    const completedSteps = job.steps.filter((s) => s.status === "done" || s.status === "error" || s.status === "skipped").length;
    const activeStep = job.steps.find((s) => s.status === "active");

    const statusLine = `[+${elapsedSec}s] Status: ${job.status.toUpperCase()} (${job.percent}%) | Steps: ${completedSteps}/${job.steps.length} | Active: ${activeStep ? `${activeStep.label} ("${activeStep.activity}")` : "None"}`;

    if (statusLine !== lastActivity || completedSteps !== lastCompletedSteps) {
      console.log(statusLine);
      lastActivity = statusLine;
      lastCompletedSteps = completedSteps;
    }

    if (job.status === "done" || job.status === "error") {
      const totalTimeSec = Math.round((Date.now() - startTime) / 1000);
      console.log("\n==================================================================");
      console.log(`🏁 Job Finished with Status: ${job.status.toUpperCase()}`);
      console.log(`⏱ Wall-Clock Duration: ${totalTimeSec} seconds (${(totalTimeSec / 60).toFixed(2)} minutes)`);
      console.log(`🔍 Verified Research Sources: ${job.verified}`);
      console.log("==================================================================\n");

      console.log("📊 Step-by-Step Provider & Execution Breakdown:");
      const providerStats: Record<string, { calls: number; inTokens: number; outTokens: number; durationMs: number }> = {};

      for (const step of job.steps) {
        const stepUsages = step.usage ?? [];
        const stepProvider = step.provider || (stepUsages.length > 0 ? stepUsages[0].provider : "n/a");
        const stepTokens = stepUsages.reduce((sum, u) => sum + ((u.inputTokens ?? 0) + (u.outputTokens ?? 0)), 0);
        const stepDuration = stepUsages.reduce((sum, u) => sum + u.durationMs, 0);

        for (const u of stepUsages) {
          if (!providerStats[u.provider]) {
            providerStats[u.provider] = { calls: 0, inTokens: 0, outTokens: 0, durationMs: 0 };
          }
          providerStats[u.provider].calls++;
          providerStats[u.provider].inTokens += (u.inputTokens ?? 0);
          providerStats[u.provider].outTokens += (u.outputTokens ?? 0);
          providerStats[u.provider].durationMs += u.durationMs;
        }

        console.log(
          `  • [${step.id.padEnd(16)}] status: ${step.status.padEnd(7)} | provider: ${stepProvider.padEnd(10)} | tokens: ${String(stepTokens).padStart(5)} | step duration: ${stepDuration}ms | ${step.activity || ""}`
        );
      }

      console.log("\n📈 Aggregated Provider Usage:");
      for (const [prov, stat] of Object.entries(providerStats)) {
        console.log(
          `  • ${prov.padEnd(12)}: ${stat.calls} calls | ${stat.inTokens + stat.outTokens} total tokens (${stat.inTokens} in / ${stat.outTokens} out) | ${stat.durationMs}ms total latency`
        );
      }

      console.log("\n📑 Final Output Preview (First 1000 chars):");
      console.log("------------------------------------------------------------------");
      console.log(job.finalOutput ? job.finalOutput.slice(0, 1000) + "\n..." : "(No final output)");
      console.log("------------------------------------------------------------------");

      break;
    }
  }
}

main().catch((err) => {
  console.error("Verification script error:", err);
  process.exit(1);
});
