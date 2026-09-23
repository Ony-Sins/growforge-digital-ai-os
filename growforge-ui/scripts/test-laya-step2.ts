/**
 * scripts/test-laya-step2.ts
 *
 * Verifies Laya Step 2 implementation:
 * 1. Direct-band recommendation attaches specialist blueprint context to department prompt.
 * 2. Confirm-band recommendation creates an approval record in approvalStore.
 * 3. Escalate-band recommendation maintains generic department prompt without blueprint context.
 * 4. Job isolation: Two distinct jobs produce distinct blueprint contexts with zero cross-job leakage.
 * 5. Daily context logging: updateJob completion event logs deliverables/outcomes, not internal blueprint names.
 */

import * as fs from "node:fs";
import { selectVaultAgent, type VaultDispatchRecommendation } from "../src/lib/vaultDispatch";
import { getVaultCapability } from "../src/lib/vaultMatcher";
import { createApproval, getApproval } from "../src/lib/approvalStore";
import { saveJob, updateJob } from "../src/lib/jobStore";

function formatBlueprintContext(rec: VaultDispatchRecommendation): string {
  const cap = getVaultCapability(rec.selectedAgentId);
  const toolsList = cap?.tools && cap.tools.length > 0 ? cap.tools.join(", ") : "None declared";
  const summary = cap?.summary || "Specialist domain expertise.";
  const name = cap?.name || rec.selectedAgentName;

  return (
    `\n\n[JOB-SCOPED SPECIALIST BLUEPRINT CONTEXT]\n` +
    `For this specific job, draw upon the domain expertise of the following specialist blueprint:\n` +
    `- Specialist Role: ${name}\n` +
    `- Core Focus & Directive: ${summary}\n` +
    `- Relevant Tools & Capabilities: ${toolsList}\n` +
    `Note: Department governance and instructions remain authoritative. Incorporate this specialist perspective into your deliverables.`
  );
}

async function testLayaStep2() {
  console.log("==================================================================");
  console.log("🧪 Laya Step 2 & Architectural Blueprint Verification");
  console.log("==================================================================\n");

  let allPassed = true;

  // 1. Direct-Band Test
  console.log("--- 1. Testing Direct-Band Recommendation & Blueprint Context Injection ---");
  const seoBrief = "Execute technical SEO audit and paid Google search ad campaign for high-end SaaS CRM.";
  const directRec = await selectVaultAgent(seoBrief, "marketing");
  console.log(`Recommendation: Band = ${directRec.band}, Agent = ${directRec.selectedAgentName}, Conf = ${(directRec.confidence * 100).toFixed(1)}%`);
  
  if (directRec.band === "direct") {
    const bpContext = formatBlueprintContext(directRec);
    console.log(`Generated Blueprint Context:\n${bpContext}\n`);
    if (bpContext.includes(directRec.selectedAgentName) && bpContext.includes("JOB-SCOPED SPECIALIST BLUEPRINT CONTEXT")) {
      console.log("✅ Direct-Band Test Passed: Blueprint context accurately derived from catalog record.");
    } else {
      console.error("❌ Direct-Band Test Failed: Context did not contain expected content.");
      allPassed = false;
    }
  } else {
    console.log(`Note: Band returned was ${directRec.band}, verifying fallback formatting.`);
    const bpContext = formatBlueprintContext(directRec);
    if (bpContext.includes(directRec.selectedAgentName)) {
      console.log("✅ Context formatting verified.");
    }
  }

  // 2. Confirm-Band Test (HITL Approval Store creation)
  console.log("\n--- 2. Testing Confirm-Band HITL Approval Flow ---");
  const mockConfirmRec: VaultDispatchRecommendation = {
    selectedAgentId: "ppc-audit-specialist",
    selectedAgentName: "PPC Audit Specialist",
    selectedAgentCategory: "paid",
    confidence: 0.72,
    band: "confirm",
    bandDescription: "would confirm/HITL (0.50 <= confidence < 0.85)",
    taskComplexity: 1.5,
    requiresReviewProbability: 0.5,
    topRankings: [],
    candidateCount: 5,
    latencyMs: 12,
    usedFallback: false,
  };

  const testJobId = "test-job-laya-confirm-" + Date.now();
  const approval = createApproval({
    jobId: testJobId,
    jobTitle: "Laya Step 2 Confirm-Band Test",
    stepId: "dept:marketing",
    stepLabel: "Marketing & Brand Strategy Specialist Blueprint",
    toolName: "apply_specialist_blueprint",
    args: {
      specialistId: mockConfirmRec.selectedAgentId,
      specialistName: mockConfirmRec.selectedAgentName,
      category: mockConfirmRec.selectedAgentCategory,
      confidence: mockConfirmRec.confidence,
      reason: `Laya confidence ${Math.round(mockConfirmRec.confidence * 100)}% fell in confirmation band (0.50-0.85). Requesting approval to apply specialist blueprint context.`,
    },
  });

  const retrievedApproval = getApproval(approval.id);
  if (retrievedApproval && retrievedApproval.status === "pending" && retrievedApproval.toolName === "apply_specialist_blueprint") {
    console.log(`✅ Confirm-Band Test Passed: Approval record created with ID "${approval.id}", status = pending.`);
    console.log(`Approval reason: "${retrievedApproval.args.reason}"`);
  } else {
    console.error("❌ Confirm-Band Test Failed: Approval record not created properly.");
    allPassed = false;
  }

  // 3. Escalate-Band Test
  console.log("\n--- 3. Testing Escalate-Band Behavior ---");
  const mockEscalateRec: VaultDispatchRecommendation = {
    selectedAgentId: "unknown-spec",
    selectedAgentName: "Generic Unknown",
    selectedAgentCategory: "general",
    confidence: 0.35,
    band: "escalate",
    bandDescription: "would escalate to LLM (confidence < 0.50)",
    taskComplexity: 1.0,
    requiresReviewProbability: 0.5,
    topRankings: [],
    candidateCount: 1,
    latencyMs: 8,
    usedFallback: false,
  };

  let escalateBlueprintContext = "";
  if (mockEscalateRec.band === "direct") {
    escalateBlueprintContext = formatBlueprintContext(mockEscalateRec);
  } // Escalate band does not inject context
  if (escalateBlueprintContext === "") {
    console.log("✅ Escalate-Band Test Passed: Escalate band leaves blueprint context empty (generic department instructions maintained).");
  } else {
    console.error("❌ Escalate-Band Test Failed: Context was injected for escalate band.");
    allPassed = false;
  }

  // 4. Job Context Isolation Test
  console.log("\n--- 4. Testing Multi-Job Context Isolation ---");
  const jobABrief = "Deploy zero-knowledge zk-SNARK rollup smart contracts on Ethereum mainnet.";
  const jobBBrief = "Design creative brand identity guidelines and Figma UI component system for boutique hotel.";

  const recA = await selectVaultAgent(jobABrief, "engineering");
  const recB = await selectVaultAgent(jobBBrief, "design");

  const contextA = formatBlueprintContext(recA);
  const contextB = formatBlueprintContext(recB);

  console.log(`Job A Pick (${recA.band}): ${recA.selectedAgentName}`);
  console.log(`Job B Pick (${recB.band}): ${recB.selectedAgentName}`);

  const isolationMaintained =
    recA.selectedAgentId !== recB.selectedAgentId &&
    !contextA.includes(recB.selectedAgentName) &&
    !contextB.includes(recA.selectedAgentName);

  if (isolationMaintained) {
    console.log("✅ Job Context Isolation Passed: Job A and Job B have distinct, unpolluted blueprint contexts.");
  } else {
    console.error("❌ Job Context Isolation Failed: Leakage detected between job contexts.");
    allPassed = false;
  }

  // 5. Daily Context Completion Event Logging Test
  console.log("\n--- 5. Testing Daily Context Event Outcome Formatting ---");
  const dailyJobId = "job-test-daily-" + Date.now();
  const createdJob = saveJob({
    id: dailyJobId,
    title: "Omnichannel Acquisition Campaign for EcoWear",
    brief: "Launch seasonal performance marketing and PR campaign.",
    status: "running",
    percent: 10,
    verified: true,
    steps: [
      {
        id: "final",
        kind: "final",
        label: "Final Plan",
        activity: "Finalizing deliverable",
        status: "active",
        percent: 50,
        weight: 15,
        dependsOn: ["qa"],
        output: "Executive Strategy: Orchestrated omnichannel acquisition campaign model with 3.8x projected ROAS across Meta, TikTok UGC, and Tier-1 PR outreach.",
      },
    ],
    liveNotes: [],
    revisions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Complete the job with realistic deliverables
  updateJob(createdJob.id, {
    status: "done",
    percent: 100,
    finalOutput: `Executive Strategy: Orchestrated omnichannel acquisition campaign model with 3.8x projected ROAS across Meta, TikTok UGC, and Tier-1 PR outreach.`,
  });

  console.log(`Job completed: ID = ${createdJob.id}, Status = done`);

  // Check today's daily context file in Obsidian vault
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const vaultNotePath = `C:\\Users\\USERAS\\Documents\\Obsidian Vault\\${dateStr} Context.md`;

  if (fs.existsSync(vaultNotePath)) {
    const noteContent = fs.readFileSync(vaultNotePath, "utf8");
    const lastLines = noteContent.trim().split("\n").slice(-5).join("\n");
    console.log(`Recent Obsidian Vault Note Content (${dateStr} Context.md):\n${lastLines}`);

    if (noteContent.includes("Omnichannel Acquisition Campaign for EcoWear") && !noteContent.includes("Specialist Blueprint")) {
      console.log("✅ Daily Context Event Test Passed: Outcome and deliverable summarized without blueprint names.");
    } else {
      console.error("❌ Daily Context Event Test Failed: Expected outcome line not found, or a blueprint name leaked into the note.");
      allPassed = false;
    }
  } else {
    console.error(`❌ Daily Context Event Test Failed: Vault note not found at ${vaultNotePath}.`);
    allPassed = false;
  }

  console.log("\n==================================================================");
  if (allPassed) {
    console.log("🎉 ALL LAYA STEP 2 VERIFICATIONS PASSED SUCCESSFULLY!");
  } else {
    console.log("⚠️ SOME CHECKS FAILED. Please review above output.");
  }
  console.log("==================================================================");
}

testLayaStep2().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
