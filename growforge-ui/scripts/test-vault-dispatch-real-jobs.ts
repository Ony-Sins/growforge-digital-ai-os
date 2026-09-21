/**
 * scripts/test-vault-dispatch-real-jobs.ts
 *
 * Evaluates `selectVaultAgent(brief, departmentId)` on real historical jobs stored in `data/jobs.json`.
 * Evaluates Laya's per-department specialist agent recommendations across every department
 * assigned in actual historical executions.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  selectVaultAgent,
  DEPARTMENT_VAULT_CATEGORIES,
  type VaultDispatchRecommendation,
} from "../src/lib/vaultDispatch";

interface StoredJob {
  id: string;
  title: string;
  brief: string;
  steps: Array<{
    id: string;
    kind: string;
    label: string;
    departmentId?: string;
  }>;
}

interface DeptDispatchResult {
  jobId: string;
  jobTitle: string;
  departmentId: string;
  departmentName: string;
  rec: VaultDispatchRecommendation;
  categorySanityMatch: boolean;
}

async function runRealJobsEvaluation() {
  console.log("==================================================================");
  console.log("🔍 Per-Department Vault Dispatch Evaluation on Real Historical Jobs");
  console.log("==================================================================\n");

  const jobsPath = path.resolve(__dirname, "../data/jobs.json");
  if (!fs.existsSync(jobsPath)) {
    throw new Error(`jobs.json not found at ${jobsPath}`);
  }

  const allJobs: StoredJob[] = JSON.parse(fs.readFileSync(jobsPath, "utf8"));
  console.log(`Loaded ${allJobs.length} total real historical jobs from data/jobs.json.\n`);

  const allResults: DeptDispatchResult[] = [];

  for (let i = 0; i < allJobs.length; i++) {
    const job = allJobs[i];
    const deptSteps = job.steps.filter(
      (s) => s.kind === "department" && s.departmentId
    );
    const assignedDeptIds = Array.from(
      new Set(deptSteps.map((s) => s.departmentId!))
    );

    console.log(`------------------------------------------------------------------`);
    console.log(`[Job ${i + 1}/${allJobs.length}] ${job.id}: "${job.title}"`);
    console.log(`Brief: "${job.brief.replace(/\n+/g, " ").slice(0, 140)}..."`);
    console.log(`Assigned Departments (${assignedDeptIds.length}): [${assignedDeptIds.join(", ")}]`);
    console.log(`\n  🎯 Per-Department Specialist Picks:`);

    for (const deptId of assignedDeptIds) {
      const deptConfig = DEPARTMENT_VAULT_CATEGORIES[deptId];
      const deptName = deptConfig?.name || deptId;
      const rec = await selectVaultAgent(job.brief, deptId);

      const isCategoryMatch = deptConfig
        ? deptConfig.categories.includes(rec.selectedAgentCategory)
        : false;

      allResults.push({
        jobId: job.id,
        jobTitle: job.title,
        departmentId: deptId,
        departmentName: deptName,
        rec,
        categorySanityMatch: isCategoryMatch,
      });

      const bandTag = `[${rec.band.toUpperCase()}]`.padEnd(11);
      const confTag = `${(rec.confidence * 100).toFixed(1)}%`.padStart(6);
      const matchTag = isCategoryMatch ? "✓ valid-category" : "⚠ category-mismatch";

      console.log(
        `   • [${deptId.padEnd(14)}] ${bandTag} ${confTag} -> "${rec.selectedAgentName}" (${rec.selectedAgentId}) [cat: ${rec.selectedAgentCategory}] (${matchTag}, ${rec.candidateCount} cands, ${rec.latencyMs}ms)`
      );
    }
    console.log();
  }

  console.log("==================================================================");
  console.log("📊 Summary of Per-Department Specialist Dispatch");
  console.log("==================================================================");

  const totalDispatches = allResults.length;
  const bandCounts = {
    direct: allResults.filter((r) => r.rec.band === "direct").length,
    confirm: allResults.filter((r) => r.rec.band === "confirm").length,
    escalate: allResults.filter((r) => r.rec.band === "escalate").length,
  };

  const validCategoryCount = allResults.filter((r) => r.categorySanityMatch).length;
  const avgConf =
    allResults.reduce((sum, r) => sum + r.rec.confidence, 0) / totalDispatches;
  const avgLat =
    allResults.reduce((sum, r) => sum + r.rec.latencyMs, 0) / totalDispatches;

  console.log(`Total Department Dispatches Evaluated: ${totalDispatches} across ${allJobs.length} real jobs`);
  console.log(`Category Filter Sanity Match:          ${validCategoryCount}/${totalDispatches} (${((validCategoryCount / totalDispatches) * 100).toFixed(1)}%)`);
  console.log(`Direct Dispatch Band (>=85%):         ${bandCounts.direct}/${totalDispatches} (${((bandCounts.direct / totalDispatches) * 100).toFixed(1)}%)`);
  console.log(`Confirm/HITL Band (50-85%):           ${bandCounts.confirm}/${totalDispatches} (${((bandCounts.confirm / totalDispatches) * 100).toFixed(1)}%)`);
  console.log(`Escalate to LLM Band (<50%):          ${bandCounts.escalate}/${totalDispatches} (${((bandCounts.escalate / totalDispatches) * 100).toFixed(1)}%)`);
  console.log(`Average Confidence:                   ${(avgConf * 100).toFixed(1)}%`);
  console.log(`Average Latency:                      ${Math.round(avgLat)}ms`);

  console.log("\n--- Breakdown by Department ---");
  const depts = Object.keys(DEPARTMENT_VAULT_CATEGORIES);
  for (const d of depts) {
    const dResults = allResults.filter((r) => r.departmentId === d);
    if (dResults.length === 0) continue;
    const dAvgConf =
      dResults.reduce((sum, r) => sum + r.rec.confidence, 0) / dResults.length;
    const dDirect = dResults.filter((r) => r.rec.band === "direct").length;
    const dConfirm = dResults.filter((r) => r.rec.band === "confirm").length;
    const dEscalate = dResults.filter((r) => r.rec.band === "escalate").length;
    console.log(
      `  • ${d.padEnd(15)} (${dResults.length} dispatches): Avg Conf ${(dAvgConf * 100).toFixed(1)}% | Direct: ${dDirect} | Confirm: ${dConfirm} | Escalate: ${dEscalate}`
    );
  }

  console.log("==================================================================\n");
}

runRealJobsEvaluation().catch((err) => {
  console.error("Evaluation failed:", err);
  process.exit(1);
});
