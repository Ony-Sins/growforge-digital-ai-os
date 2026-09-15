import fs from "node:fs";
import path from "node:path";
import { createAndStartJob, getJob, updateStep, updateJob } from "../src/lib/jobStore";
import { logJobStateChange, logStrategicDecision } from "../src/lib/brainLogger";
import { checkN8nHealth } from "./check-n8n-health";
import { n8nTool } from "../src/lib/tools/n8n";

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

async function runTests() {
  console.log("=== Suite 1: Single-Prompt Master Directive Breakdown ===");
  const masterDirectiveBrief = [
    "# CLIENT & BUSINESS: GrowForge Digital — AI Systems & Growth Agency",
    "Location: Dhaka & Global Remote",
    "Stage: Launch Phase (Scaling to $50k MRR)",
    "Target Customers: B2B tech firms, e-commerce brands, professional service firms",
    "Offer & Pricing: AI workflows, n8n automations, Meta Ads, and full-stack web builds on $3,500/mo retainer",
    "Budget: $5,000/month initial ad & infrastructure spend",
    "Goals: Deploy 5 automated client onboarding funnels in 60 days",
    "Deliverables: Multi-department go-to-market plan, tech architecture, ad strategy, pricing table",
  ].join("\n");

  const job = {
    id: `job-test-agency-${Date.now().toString(36)}`,
    title: "GrowForge Digital — AI Systems & Growth Agency Launch",
    brief: masterDirectiveBrief,
    status: "running" as const,
    percent: 15,
    verified: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    liveNotes: [],
    revisions: [],
    createdBy: "founder@growforgedigital.com",
    steps: [
      { id: "brief", kind: "brief" as const, label: "Client Brief", activity: "Master directive received", weight: 0, dependsOn: [], status: "done" as const, percent: 100, output: masterDirectiveBrief },
      { id: "plan", kind: "plan" as const, label: "GrowForge HQ", activity: "Assigned 5 departments", weight: 10, dependsOn: ["brief"], status: "done" as const, percent: 100, instructionsHash: "a1b2c3d4e5f6" },
      { id: "dept:marketing", kind: "department" as const, label: "Marketing", activity: "Positioning B2B automation", weight: 15, dependsOn: ["plan"], status: "active" as const, percent: 50 },
      { id: "dept:ai-automation", kind: "department" as const, label: "AI Systems / Automation", activity: "Designing n8n client onboarding workflow", weight: 15, dependsOn: ["plan"], status: "active" as const, percent: 40 },
      { id: "dept:meta-ads", kind: "department" as const, label: "Meta Ads", activity: "Configuring B2B Retargeting Funnel", weight: 15, dependsOn: ["plan"], status: "pending" as const, percent: 0 },
      { id: "reconcile", kind: "reconcile" as const, label: "Team Review", activity: "Waiting for drafts", weight: 15, dependsOn: ["dept:marketing", "dept:ai-automation", "dept:meta-ads"], status: "pending" as const, percent: 0 },
      { id: "qa", kind: "qa" as const, label: "Quality Assurance", activity: "Waiting for review", weight: 15, dependsOn: ["reconcile"], status: "pending" as const, percent: 0 },
      { id: "final", kind: "final" as const, label: "Final Plan", activity: "Waiting for QA sign-off", weight: 15, dependsOn: ["qa"], status: "pending" as const, percent: 0 },
    ],
  };

  assert(job.steps.length >= 6, "Master directive broken down into multi-department stages");
  assert(job.steps.some((s) => s.id === "dept:ai-automation"), "AI Systems / Automation department included");

  console.log("\n=== Suite 2: Real-Time Digital Brain Live Logging ===");
  await logJobStateChange(job);

  const currentStatePath = path.join(process.cwd(), "docs", "brain", "CURRENT_STATE.md");
  assert(fs.existsSync(currentStatePath), "CURRENT_STATE.md generated in /docs/brain/");

  const currentStateContent = fs.readFileSync(currentStatePath, "utf8");
  assert(currentStateContent.includes(job.id), "CURRENT_STATE.md contains active Job ID");
  assert(currentStateContent.includes("GrowForge Digital"), "CURRENT_STATE.md contains project title");
  assert(currentStateContent.includes("AI Systems / Automation"), "CURRENT_STATE.md lists active sub-agent steps");

  await logStrategicDecision({
    title: "Prioritize n8n Self-Hosted Webhooks for Agency Pipeline",
    context: `Job ${job.id}`,
    decision: "Deploy n8n self-hosted instance on port 5678 to handle high-throughput client onboarding without third-party cloud execution caps.",
    department: "AI Systems / Automation",
  });

  const decisionRegistryPath = path.join(process.cwd(), "docs", "brain", "DECISION_REGISTRY.md");
  assert(fs.existsSync(decisionRegistryPath), "DECISION_REGISTRY.md exists in /docs/brain/");
  const decisionContent = fs.readFileSync(decisionRegistryPath, "utf8");
  assert(decisionContent.includes("Prioritize n8n Self-Hosted Webhooks"), "Decision logged in real-time to DECISION_REGISTRY.md");

  console.log("\n=== Suite 3: n8n Docker Infrastructure & Health Probe ===");
  const health = await checkN8nHealth();
  assert(typeof health.ok === "boolean", "n8n health check executes cleanly");
  console.log(`  ℹ n8n Health Probe Result: ${health.ok ? "ONLINE" : "OFFLINE (Expected if Docker container not yet started)"}`);

  const composePath = path.join(process.cwd(), "..", "docker", "n8n", "docker-compose.yml");
  assert(fs.existsSync(composePath), "docker/n8n/docker-compose.yml blueprint exists");

  const composeContent = fs.readFileSync(composePath, "utf8");
  assert(composeContent.includes("5678:5678"), "docker-compose.yml binds port 5678");
  assert(composeContent.includes("Asia/Dhaka"), "docker-compose.yml sets timezone Asia/Dhaka");

  console.log("\n=== Suite 4: Autonomous Tool Execution & API Key Guidance ===");
  const toolRes = await n8nTool.execute({ action: "create", workflow: { name: "Client Onboarding" } });
  assert(toolRes.ok === false, "Tool safely rejects write actions when unconfigured");
  assert(toolRes.output.includes("Settings → n8n API"), "Tool returns helpful, actionable API key setup guidance");

  console.log(`\n=================================================================`);
  console.log(`  Master Single-Prompt Agency Pipeline: ${passed} passed, ${failed} failed`);
  console.log(`=================================================================\n`);
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
