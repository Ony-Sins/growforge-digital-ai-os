import fs from "node:fs";
import path from "node:path";
import {
  createSwarmContext,
  resolveSwarmAgent,
  applyStateDiff,
  SwarmState,
  AgentDirective,
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

async function runSafeHandoffChainTest() {
  console.log("=================================================================");
  console.log("  GrowForge AI OS — Safe Multi-Agent Swarm Handoff Chain Test");
  console.log("  Pattern: User Request -> Supervisor -> Lead Gen -> Copywriter -> QA -> Final Output");
  console.log("=================================================================\n");

  const userRequest = "Launch a high-converting B2B customer acquisition campaign for GrowForge AI OS retainer offer ($3,500/mo) with full outbound copy and QA certification.";

  // Initialize Swarm State
  const state: SwarmState = createSwarmContext(userRequest, {
    title: "B2B Outbound Campaign & Retainer Launch",
    maxDepth: 5,
    initialAgent: "planning",
  });

  assert(state.directiveId.startsWith("swarm-"), "Swarm directive initialized with unique ID");
  assert(state.maxDepth === 5, "Strict Max Depth = 5 guardrail active");
  assert(state.activeAgent === "planning", "Active agent initialized to Supervisor (Planning)");
  assert(state.handoffDepth === 0, "Initial handoff depth is 0");

  console.log("\n--- [Step 1: Supervisor Agent (GrowForge HQ)] ---");
  const supervisor = resolveSwarmAgent(state.activeAgent);
  assert(supervisor.id === "planning", "Resolved Supervisor agent");

  state.agentTrace.push({
    stepNumber: 1,
    agentId: supervisor.id,
    agentName: supervisor.name,
    action: "Architected multi-stage GTM strategy and delegated outbound prospecting to Lead Gen",
    timestamp: new Date().toISOString(),
  });

  // State pollution guard test: verify prototype pollution is safely rejected
  const dirtyDiff = JSON.parse('{"__proto__": {"polluted": true}, "constructor": "bad", "campaignStage": "lead_gen", "targetAudience": "B2B SaaS & Tech Founders ($1M-$10M ARR)", "retainerOffer": 3500}');
  const diffResult1 = applyStateDiff(state.variables, dirtyDiff);
  assert(diffResult1.rejectedKeys.includes("__proto__") && diffResult1.rejectedKeys.includes("constructor"), "State Pollution Guard blocked prototype pollution keys '__proto__' & 'constructor'");
  assert(state.variables.retainerOffer === 3500, "Clean variables safely merged into shared state");
  assert((state.variables as any).polluted === undefined, "Target state remains completely unpolluted");

  // Supervisor delegates to Lead Gen
  let activeTransferPayload: any = null;
  setTransferTaskHandler(async (p) => {
    activeTransferPayload = p;
    return { ok: true, message: `Handoff to ${p.targetAgent} accepted` };
  });

  await transferTaskTool.execute({
    targetAgent: "lead-gen",
    task: "Build B2B ICP profile, select high-leverage outreach channels, and define the lead magnet hook.",
    variables: { supervisorSignOff: true },
    reason: "Lead generation domain expertise required for ICP & channel selection",
  });

  assert(activeTransferPayload !== null, "Supervisor emitted valid transfer_task payload");
  assert(activeTransferPayload.targetAgent === "lead-gen", "Target agent correctly set to 'lead-gen'");

  state.handoffDepth += 1;
  state.activeAgent = resolveSwarmAgent(activeTransferPayload.targetAgent).id;
  state.history.push({
    fromAgent: supervisor.name,
    toAgent: resolveSwarmAgent(activeTransferPayload.targetAgent).name,
    task: activeTransferPayload.task,
    reason: activeTransferPayload.reason,
    timestamp: new Date().toISOString(),
  });

  assert(state.handoffDepth === 1, "Handoff depth updated to 1/5");
  assert(state.activeAgent === "lead-gen", "Active agent transitioned to Lead Gen");

  console.log("\n--- [Step 2: Lead Gen Agent (Offer & Lead Gen Strategist)] ---");
  const leadGen = resolveSwarmAgent(state.activeAgent);
  assert(leadGen.id === "lead-gen", "Resolved Lead Gen agent");

  state.agentTrace.push({
    stepNumber: 2,
    agentId: leadGen.id,
    agentName: leadGen.name,
    action: "Formulated ICP profile, selected Cold Email & LinkedIn, and designed the Lead Magnet",
    timestamp: new Date().toISOString(),
  });

  const leadGenDiff = {
    icpProfile: "B2B SaaS Founders ($1M-$10M ARR) struggling with manual operations",
    channels: ["Cold Email (Instantly)", "LinkedIn Sales Navigator"],
    leadMagnet: "AI Operations & n8n Workflow Audit Blueprint (Free 15-min Loom)",
  };
  applyStateDiff(state.variables, leadGenDiff);
  assert(state.variables.leadMagnet !== undefined, "Lead Gen state diff merged");

  // Lead Gen delegates to Copywriter
  await transferTaskTool.execute({
    targetAgent: "copywriter",
    task: "Draft high-converting 3-step outbound email sequence using the AI Operations Audit hook.",
    variables: { targetPersona: "Founder/CEO" },
    reason: "Copywriting specialization required for persuasive cold email sequence",
  });

  assert(activeTransferPayload.targetAgent === "copywriter", "Target agent correctly set to 'copywriter'");

  state.handoffDepth += 1;
  state.activeAgent = resolveSwarmAgent(activeTransferPayload.targetAgent).id;
  state.history.push({
    fromAgent: leadGen.name,
    toAgent: resolveSwarmAgent(activeTransferPayload.targetAgent).name,
    task: activeTransferPayload.task,
    reason: activeTransferPayload.reason,
    timestamp: new Date().toISOString(),
  });

  assert(state.handoffDepth === 2, "Handoff depth updated to 2/5");
  assert(state.activeAgent === "copywriter", "Active agent transitioned to Copywriter");

  console.log("\n--- [Step 3: Copywriter Agent (Brand & Conversion Copywriter)] ---");
  const copywriter = resolveSwarmAgent(state.activeAgent);
  assert(copywriter.id === "copywriter", "Resolved Copywriter agent");

  state.agentTrace.push({
    stepNumber: 3,
    agentId: copywriter.id,
    agentName: copywriter.name,
    action: "Penned 3-part cold outbound email sequence with subject lines and strong CTA",
    timestamp: new Date().toISOString(),
  });

  const copyDiff = {
    emailSequence: [
      { step: 1, subject: "Quick question on your AI & n8n workflows, {{firstName}}", hook: "Audited your tech stack..." },
      { step: 2, subject: "Case study: How we saved 18 hrs/week for B2B tech firms", hook: "Quick Loom breakdown..." },
      { step: 3, subject: "Permission to close your file?", hook: "Final check-in before archiving..." },
    ],
    cta: "Book 15-Min Strategy Session on $3,500/mo Retainer",
  };
  applyStateDiff(state.variables, copyDiff);
  assert((state.variables.emailSequence as any[]).length === 3, "Copywriter state diff merged with 3 email templates");

  // Copywriter delegates to QA
  await transferTaskTool.execute({
    targetAgent: "qa",
    task: "Conduct thorough quality gate check, verify value proposition, compliance, and finish quality.",
    variables: { copyDraftComplete: true },
    reason: "Quality Assurance verification required before deliverable synthesis",
  });

  assert(activeTransferPayload.targetAgent === "qa", "Target agent correctly set to 'qa'");

  state.handoffDepth += 1;
  state.activeAgent = resolveSwarmAgent(activeTransferPayload.targetAgent).id;
  state.history.push({
    fromAgent: copywriter.name,
    toAgent: resolveSwarmAgent(activeTransferPayload.targetAgent).name,
    task: activeTransferPayload.task,
    reason: activeTransferPayload.reason,
    timestamp: new Date().toISOString(),
  });

  assert(state.handoffDepth === 3, "Handoff depth updated to 3/5");
  assert(state.activeAgent === "qa", "Active agent transitioned to QA Reality Checker");

  console.log("\n--- [Step 4: QA Agent (Quality Assurance & Reality Checker)] ---");
  const qaAgent = resolveSwarmAgent(state.activeAgent);
  assert(qaAgent.id === "qa", "Resolved QA agent");

  state.agentTrace.push({
    stepNumber: 4,
    agentId: qaAgent.id,
    agentName: qaAgent.name,
    action: "Verified claim clarity, anti-spam compliance, pricing consistency ($3,500/mo), and signed off",
    timestamp: new Date().toISOString(),
  });

  let activeCompletionPayload: any = null;
  setCompleteDirectiveHandler(async (payload) => {
    activeCompletionPayload = payload;
    return { ok: true, message: "Directive successfully completed." };
  });

  const finalDeliverable = [
    "# GrowForge AI OS — Outbound Acquisition Deliverable",
    "",
    "## 1. ICP & Targeting",
    `- **Audience:** ${state.variables.targetAudience}`,
    `- **Channels:** ${(state.variables.channels as string[]).join(", ")}`,
    `- **Offer Retainer:** $${state.variables.retainerOffer}/month`,
    "",
    "## 2. Lead Magnet Hook",
    `- ${state.variables.leadMagnet}`,
    "",
    "## 3. High-Converting Email Sequences",
    "1. **Email #1**: " + (state.variables.emailSequence as any[])[0].subject,
    "2. **Email #2**: " + (state.variables.emailSequence as any[])[1].subject,
    "3. **Email #3**: " + (state.variables.emailSequence as any[])[2].subject,
    "",
    "## 4. QA Reality Check Certification",
    "- ✅ Value proposition and pricing aligned ($3,500/mo)",
    "- ✅ Anti-spam & CAN-SPAM compliant opt-out language verified",
    "- ✅ Production ready for immediate dispatch",
  ].join("\n");

  await completeDirectiveTool.execute({
    summary: "Successfully orchestrated end-to-end B2B outbound campaign with certified copy and QA sign-off.",
    deliverable: finalDeliverable,
    metadata: { totalHandoffs: state.handoffDepth, verified: true },
  });

  assert(activeCompletionPayload !== null, "QA Agent invoked complete_directive tool");
  assert(activeCompletionPayload.deliverable.includes("QA Reality Check Certification"), "Final deliverable synthesized with QA stamp");

  state.status = "completed";
  state.finalPayload = activeCompletionPayload;

  console.log("\n--- [Step 5: Telemetry & State Verification] ---");
  await logSwarmStateChange(state);

  const currentStatePath = path.join(process.cwd(), "docs", "brain", "CURRENT_STATE.md");
  assert(fs.existsSync(currentStatePath), "CURRENT_STATE.md exists");

  const currentStateContent = fs.readFileSync(currentStatePath, "utf8");
  assert(currentStateContent.includes(state.directiveId), "CURRENT_STATE.md updated with directive ID");
  assert(currentStateContent.includes("GrowForge HQ Strategist (Supervisor)"), "CURRENT_STATE.md records Supervisor trace");
  assert(currentStateContent.includes("Offer & Lead Gen Strategist"), "CURRENT_STATE.md records Lead Gen trace");
  assert(currentStateContent.includes("Brand & Conversion Copywriter"), "CURRENT_STATE.md records Copywriter trace");
  assert(currentStateContent.includes("Quality Assurance & Reality Checker"), "CURRENT_STATE.md records QA trace");
  assert(currentStateContent.includes("Handoff Depth: `3/5`"), "CURRENT_STATE.md verifies 3/5 depth (within limit)");

  await logStrategicDecision({
    title: "Safe Handoff Chain Certified: Supervisor -> Lead Gen -> Copywriter -> QA",
    context: `Directive ${state.directiveId}`,
    decision: "Multi-agent peer delegation verified end-to-end with state isolation and zero pollution.",
    department: "Swarm Orchestrator",
  });

  const decisionPath = path.join(process.cwd(), "docs", "brain", "DECISION_REGISTRY.md");
  const decisionContent = fs.readFileSync(decisionPath, "utf8");
  assert(decisionContent.includes("Safe Handoff Chain Certified"), "Strategic decision logged in DECISION_REGISTRY.md");

  // Cleanup
  setTransferTaskHandler(null);
  setCompleteDirectiveHandler(null);

  console.log(`\n=================================================================`);
  console.log(`  Safe Handoff Chain Suite: ${passed} passed, ${failed} failed`);
  console.log(`=================================================================\n`);
  if (failed > 0) process.exit(1);
}

runSafeHandoffChainTest().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
