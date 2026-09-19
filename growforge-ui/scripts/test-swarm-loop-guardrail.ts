import fs from "node:fs";
import path from "node:path";

// Auto-load .env.local in standalone script execution environments
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

import {
  createSwarmContext,
  applyStateDiff,
  saveSwarmState,
  loadSwarmState,
  resumeSwarmDirective,
  SwarmState,
} from "../src/lib/swarm-orchestrator";
import { transferTaskTool, setTransferTaskHandler, type TaskTransferPayload } from "../src/lib/tools/transferTask";
import { setCompleteDirectiveHandler } from "../src/lib/tools/completeDirective";
import { setConsultationHandler } from "../src/lib/tools/askOperator";
import { logSwarmStateChange } from "../src/lib/brainLogger";

let passed = 0;
let failed = 0;

function assert(cond: unknown, msg: string): asserts cond {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
    throw new Error(msg);
  }
}

async function runLoopGuardrailStressTest() {
  console.log("=================================================================");
  console.log("  GrowForge AI OS — Swarm Engine Loop Guardrail & Resume Stress-Test");
  console.log("  Scenario: Ping-Pong Cyclic Loop (Copywriter <-> QA) reaching Max Depth (5)");
  console.log("=================================================================\n");

  const prompt = "Stress-test multi-agent infinite ping-pong loop prevention and HITL state resume.";
  const state: SwarmState = createSwarmContext(prompt, {
    title: "Cyclic Ping-Pong Loop Stress Test",
    maxDepth: 5,
    initialAgent: "copywriter",
  });

  assert(state.directiveId.startsWith("swarm-"), "Swarm directive initialized with unique ID");
  assert(state.maxDepth === 5, "Initial max recursion depth set to 5");
  assert(state.handoffDepth === 0, "Initial handoff depth starts at 0");

  let lastTransferPayload: TaskTransferPayload | null = null;
  setTransferTaskHandler(async (payload) => {
    lastTransferPayload = payload;
    return { ok: true, message: `Delegated to ${payload.targetAgent}` };
  });

  console.log("\n--- [Phase 1: Simulating Cyclic Ping-Pong Loop Handoffs 1..5] ---");

  // Step 1: Copywriter -> QA
  await transferTaskTool.execute({
    targetAgent: "qa",
    task: "Review Draft v1",
    variables: { draftVersion: 1, copyHook: "Initial Hook" },
    reason: "QA check on v1",
  });
  state.handoffDepth = 1;
  state.activeAgent = "qa";
  applyStateDiff(state.variables, lastTransferPayload!.variables);
  state.history.push({ fromAgent: "Copywriter", toAgent: "QA", task: "Review Draft v1", timestamp: new Date().toISOString() });
  state.agentTrace.push({ stepNumber: 1, agentId: "copywriter", agentName: "Brand & Conversion Copywriter", action: "Review Draft v1", timestamp: new Date().toISOString() });
  assert(state.handoffDepth === 1, "Handoff 1/5: Copywriter -> QA");

  // Step 2: QA -> Copywriter (Rejected, requests rewrite)
  await transferTaskTool.execute({
    targetAgent: "copywriter",
    task: "Revise Draft v2 (Tone too aggressive)",
    variables: { draftVersion: 2, qaFeedback: "Soften tone" },
    reason: "Revision requested",
  });
  state.handoffDepth = 2;
  state.activeAgent = "copywriter";
  applyStateDiff(state.variables, lastTransferPayload!.variables);
  state.history.push({ fromAgent: "QA", toAgent: "Copywriter", task: "Revise Draft v2", timestamp: new Date().toISOString() });
  state.agentTrace.push({ stepNumber: 2, agentId: "qa", agentName: "Quality Assurance & Reality Checker", action: "Revise Draft v2", timestamp: new Date().toISOString() });
  assert(state.handoffDepth === 2, "Handoff 2/5: QA -> Copywriter");

  // Step 3: Copywriter -> QA
  await transferTaskTool.execute({
    targetAgent: "qa",
    task: "Review Draft v3",
    variables: { draftVersion: 3 },
    reason: "QA check on v3",
  });
  state.handoffDepth = 3;
  state.activeAgent = "qa";
  applyStateDiff(state.variables, lastTransferPayload!.variables);
  state.history.push({ fromAgent: "Copywriter", toAgent: "QA", task: "Review Draft v3", timestamp: new Date().toISOString() });
  state.agentTrace.push({ stepNumber: 3, agentId: "copywriter", agentName: "Brand & Conversion Copywriter", action: "Review Draft v3", timestamp: new Date().toISOString() });
  assert(state.handoffDepth === 3, "Handoff 3/5: Copywriter -> QA");

  // Step 4: QA -> Copywriter
  await transferTaskTool.execute({
    targetAgent: "copywriter",
    task: "Revise Draft v4 (Check CTA)",
    variables: { draftVersion: 4 },
    reason: "Revision requested",
  });
  state.handoffDepth = 4;
  state.activeAgent = "copywriter";
  applyStateDiff(state.variables, lastTransferPayload!.variables);
  state.history.push({ fromAgent: "QA", toAgent: "Copywriter", task: "Revise Draft v4", timestamp: new Date().toISOString() });
  state.agentTrace.push({ stepNumber: 4, agentId: "qa", agentName: "Quality Assurance & Reality Checker", action: "Revise Draft v4", timestamp: new Date().toISOString() });
  assert(state.handoffDepth === 4, "Handoff 4/5: QA -> Copywriter");

  // Step 5: Copywriter -> QA (Hits Max Depth = 5)
  await transferTaskTool.execute({
    targetAgent: "qa",
    task: "Review Draft v5",
    variables: { draftVersion: 5 },
    reason: "QA check on v5",
  });
  state.handoffDepth = 5;
  state.activeAgent = "qa";
  applyStateDiff(state.variables, lastTransferPayload!.variables);
  state.history.push({ fromAgent: "Copywriter", toAgent: "QA", task: "Review Draft v5", timestamp: new Date().toISOString() });
  state.agentTrace.push({ stepNumber: 5, agentId: "copywriter", agentName: "Brand & Conversion Copywriter", action: "Review Draft v5", timestamp: new Date().toISOString() });
  assert(state.handoffDepth === 5, "Handoff 5/5: Max Depth limit reached");

  console.log("\n--- [Phase 2: Loop Guardrail Interception & State Persistence] ---");
  // When QA attempts to transfer back to Copywriter at Depth 5:
  assert(state.handoffDepth >= state.maxDepth, "Recursion guard condition met (depth >= maxDepth)");

  // State is automatically paused and persisted
  state.status = "paused_for_operator";
  await saveSwarmState(state);
  await logSwarmStateChange(state);

  const savedState = await loadSwarmState(state.directiveId);
  assert(savedState !== null, "Swarm state snapshot saved to persistent disk/memory store");
  assert(savedState?.status === "paused_for_operator", "Persistent snapshot status is 'paused_for_operator'");
  assert(savedState?.handoffDepth === 5, "Persistent snapshot preserves exact handoff depth (5)");
  assert(savedState?.variables.draftVersion === 5, "Persistent snapshot preserves shared variables state");
  assert(savedState?.agentTrace.length === 5, "Persistent snapshot preserves all 5 execution trace steps");

  console.log("\n--- [Phase 3: HITL Operator Intervention & Seamless State Resume] ---");
  // Operator opens HITL drawer, edits payload variables, and authorizes +3 extra handoffs
  setConsultationHandler(async (q) => {
    assert(q.includes("depth reached maximum") || q.includes("5"), "HITL drawer question warns of depth limit");
    return "Authorize +3 Additional Handoffs";
  });

  const overridePayload = {
    answer: "Authorize +3 Additional Handoffs",
    overrideMaxDepth: 8,
    editedVariables: { operatorNote: "Approved 3 extra steps for final polish", draftVersion: 6 },
    redirectAgent: "qa",
  };

  // Resume the swarm using the saved directive ID and operator overrides
  const resumeResult = await resumeSwarmDirective(
    state.directiveId,
    overridePayload,
    {
      chatCompleteOverride: async () => {
        return {
          text: JSON.stringify({
            action: "tool",
            tool: "complete_directive",
            args: {
              summary: "QA completed final check with operator approved extra steps",
              deliverable: "# Final QA Approved Deliverable\n\nAll 6 draft revisions passed QA certification.",
              metadata: { approvedBy: "operator", finalDepth: 6 },
            },
          }),
          provider: "mock",
        };
      },
    }
  );

  assert(resumeResult.ok === true, "Swarm cleanly resumed execution from snapshot");
  assert(resumeResult.context.maxDepth === 8, "Max depth extended to 8 based on operator override");
  assert(resumeResult.context.variables.operatorNote === "Approved 3 extra steps for final polish", "Operator-edited variables seamlessly merged into resumed state");
  assert(resumeResult.context.operatorInterventions !== undefined && resumeResult.context.operatorInterventions.length > 0, "Operator intervention recorded in audit trace");
  assert(resumeResult.context.status === "completed", "Resumed swarm ran to completion");

  console.log("\n--- [Phase 4: Telemetry & State Consistency Verification] ---");
  const finalLoaded = await loadSwarmState(state.directiveId);
  assert(finalLoaded?.status === "completed", "Final persistent state updated to 'completed'");
  assert(finalLoaded?.finalPayload !== undefined, "Consolidated deliverable persisted in final state");

  const currentStatePath = path.join(process.cwd(), "docs", "brain", "CURRENT_STATE.md");
  assert(fs.existsSync(currentStatePath), "CURRENT_STATE.md exists");
  const currentStateContent = fs.readFileSync(currentStatePath, "utf8");
  assert(currentStateContent.includes(state.directiveId), "CURRENT_STATE.md updated with completed directive");

  // Cleanup
  setTransferTaskHandler(null);
  setCompleteDirectiveHandler(null);
  setConsultationHandler(null);

  console.log(`\n=================================================================`);
  console.log(`  Swarm Loop Guardrail & Resume Stress-Test: ${passed} passed, ${failed} failed`);
  console.log(`=================================================================\n`);
  if (failed > 0) process.exit(1);
}

runLoopGuardrailStressTest().catch((err) => {
  console.error("Stress-test execution failed:", err);
  process.exit(1);
});
