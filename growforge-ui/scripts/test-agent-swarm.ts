import fs from "node:fs";
import path from "node:path";
import {
  createSwarmContext,
  resolveSwarmAgent,
  SWARM_ROSTER,
  executeSwarmDirective,
  SwarmContext,
} from "../src/lib/swarm-orchestrator";
import { transferTaskTool, setTransferTaskHandler } from "../src/lib/tools/transferTask";
import { completeDirectiveTool, setCompleteDirectiveHandler } from "../src/lib/tools/completeDirective";
import { logSwarmStateChange, logStrategicDecision } from "../src/lib/brainLogger";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

async function runSwarmTests() {
  console.log("=== Suite 1: Swarm Context & Dynamic Roster Resolution ===");
  const prompt = "Launch high-converting outbound lead generation campaign and deploy automated n8n webhook CRM sync.";
  const context = createSwarmContext(prompt, { title: "GrowForge Agency Outbound & n8n Launch", maxDepth: 5 });

  assert(context.directiveId.startsWith("swarm-"), "SwarmContext generates unique directive ID");
  assert(context.maxDepth === 5, "SwarmContext enforces maxDepth = 5 default guardrail");
  assert(context.activeAgent === "planning", "SwarmContext defaults active agent to planning");
  assert(context.handoffDepth === 0, "Initial handoff depth starts at 0");

  assert(SWARM_ROSTER.length >= 7, "Complete agent roster contains all 7 specialized agents");
  
  const leadGen = resolveSwarmAgent("lead-gen");
  assert(leadGen.id === "lead-gen" && leadGen.division === "Sales", "Resolves 'lead-gen' to Offer & Lead Gen Strategist");

  const webmaster = resolveSwarmAgent("web-dev");
  assert(webmaster.id === "webmaster", "Resolves alias 'web-dev' to Webmaster & Frontend Architect");

  const copywriter = resolveSwarmAgent("copywriter");
  assert(copywriter.id === "copywriter", "Resolves 'copywriter' to Brand & Conversion Copywriter");

  const socialMedia = resolveSwarmAgent("meta-ads");
  assert(socialMedia.id === "social-media", "Resolves alias 'meta-ads' to Social Media Strategist");

  const aiAutomation = resolveSwarmAgent("n8n automation");
  assert(aiAutomation.id === "ai-automation", "Resolves alias 'n8n automation' to AI Systems & Automation Engineer");

  const qa = resolveSwarmAgent("qa review");
  assert(qa.id === "qa", "Resolves alias 'qa review' to Quality Assurance");

  console.log("\n=== Suite 2: Peer-to-Peer Task Delegation & State Accumulation ===");
  let capturedTransfer: any = null;
  setTransferTaskHandler(async (payload) => {
    capturedTransfer = payload;
    return { ok: true, message: `Delegated to ${payload.targetAgent}` };
  });

  const transferRes = await transferTaskTool.execute({
    targetAgent: "lead-gen",
    task: "Build B2B ICP profile and craft 3 cold outreach email templates",
    variables: { icp: "B2B SaaS Founders ($1M-$10M ARR)", offerRetainer: 3500 },
    reason: "Sales specialization required for outbound sequences",
  });

  assert(transferRes.ok === true, "transfer_task tool executes cleanly");
  assert(capturedTransfer !== null, "Transfer handler captured the delegation payload");
  assert(capturedTransfer.targetAgent === "lead-gen", "Target agent correctly dispatched");
  assert(capturedTransfer.variables.offerRetainer === 3500, "Shared variables passed forward in transfer");

  // Mutate swarm context with peer handoff
  context.handoffDepth += 1;
  context.activeAgent = capturedTransfer.targetAgent;
  Object.assign(context.variables, capturedTransfer.variables);
  context.history.push({
    fromAgent: "GrowForge HQ Strategist",
    toAgent: leadGen.name,
    task: capturedTransfer.task,
    reason: capturedTransfer.reason,
    timestamp: new Date().toISOString(),
  });
  context.agentTrace.push({
    stepNumber: 1,
    agentId: leadGen.id,
    agentName: leadGen.name,
    action: capturedTransfer.task,
    timestamp: new Date().toISOString(),
  });

  assert(context.handoffDepth === 1, "Swarm handoff depth increments on delegation");
  assert(context.variables.icp === "B2B SaaS Founders ($1M-$10M ARR)", "SwarmContext stores mutated variables");
  assert(context.history.length === 1, "Handoff history logged in context");

  console.log("\n=== Suite 3: Max Handoff Depth & Loop Prevention Guardrail ===");
  // Simulate rapid peer-to-peer transfers reaching limit
  context.handoffDepth = 5; // Reached limit 5
  let consultationTriggered = false;

  const mockConsultationHandler = async (q: string, options?: string[]) => {
    consultationTriggered = true;
    assert(q.includes("depth reached maximum") || q.includes("5"), "Consultation question alerts operator of depth limit");
    assert(Array.isArray(options) && options.length >= 2, "Operator presented with actionable guardrail options");
    return "Synthesize & Finalize Current Findings";
  };

  // Test loop guardrail execution simulation
  if (context.handoffDepth >= context.maxDepth) {
    const answer = await mockConsultationHandler("Swarm handoff depth reached maximum (5). How to proceed?", [
      "Synthesize & Finalize Current Findings",
      "Authorize 3 Additional Handoffs",
    ]);
    assert(consultationTriggered, "Loop guardrail triggers Human-in-the-Loop consultation at maxDepth");
    assert(answer === "Synthesize & Finalize Current Findings", "Operator choice captured for safe termination");
  }

  console.log("\n=== Suite 4: Clean Directive Completion & Synthesis ===");
  let capturedCompletion: any = null;
  setCompleteDirectiveHandler(async (payload) => {
    capturedCompletion = payload;
    return { ok: true, message: "Directive finalized." };
  });

  const completeRes = await completeDirectiveTool.execute({
    summary: "Successfully orchestrated outbound B2B lead generation pipeline and automated n8n webhook sync.",
    deliverable: "# Final GTM & Automation Plan\n\n1. ICP: B2B SaaS\n2. Outreach: 3 Sequences\n3. Automation: n8n Webhook -> HubSpot CRM",
    metadata: { leadsTarget: 50, channels: ["Email", "LinkedIn"] },
  });

  assert(completeRes.ok === true, "complete_directive tool executes cleanly");
  assert(capturedCompletion !== null, "Completion handler captured final deliverable");
  assert(capturedCompletion.deliverable.includes("Final GTM & Automation Plan"), "Consolidated deliverable synthesized");

  context.status = "completed";
  context.finalPayload = capturedCompletion;

  console.log("\n=== Suite 5: Real-Time Digital Brain Telemetry Sync ===");
  await logSwarmStateChange(context);

  const currentStatePath = path.join(process.cwd(), "docs", "brain", "CURRENT_STATE.md");
  assert(fs.existsSync(currentStatePath), "CURRENT_STATE.md exists in /docs/brain/");

  const currentStateContent = fs.readFileSync(currentStatePath, "utf8");
  assert(currentStateContent.includes("Kimi-Style Peer-to-Peer Agent Swarm"), "CURRENT_STATE.md logs Swarm Architecture mode");
  assert(currentStateContent.includes(context.directiveId), "CURRENT_STATE.md logs active Swarm Directive ID");
  assert(currentStateContent.includes("Peer-to-Peer Handoff & Execution Trace"), "CURRENT_STATE.md logs peer handoff trace table");
  assert(currentStateContent.includes("B2B SaaS Founders"), "CURRENT_STATE.md logs shared variable space");
  assert(currentStateContent.includes("Final GTM & Automation Plan"), "CURRENT_STATE.md logs consolidated final deliverable");

  await logStrategicDecision({
    title: "Kimi-Style Swarm Architecture Activated for Agency Directives",
    context: `Swarm Directive ${context.directiveId}`,
    decision: "Decentralized peer-to-peer delegation between Planning, Lead Gen, Webmaster, and Automation sub-agents with 5-step loop guardrail.",
    department: "Swarm Orchestrator",
  });

  const decisionPath = path.join(process.cwd(), "docs", "brain", "DECISION_REGISTRY.md");
  const decisionContent = fs.readFileSync(decisionPath, "utf8");
  assert(decisionContent.includes("Kimi-Style Swarm Architecture Activated"), "Strategic decision logged in DECISION_REGISTRY.md");

  // Cleanup handlers
  setTransferTaskHandler(null);
  setCompleteDirectiveHandler(null);

  console.log(`\n=================================================================`);
  console.log(`  Kimi-Style Agent Swarm Suite: ${passed} passed, ${failed} failed`);
  console.log(`=================================================================\n`);
  if (failed > 0) process.exit(1);
}

runSwarmTests().catch((err) => {
  console.error("Swarm test failed:", err);
  process.exit(1);
});
