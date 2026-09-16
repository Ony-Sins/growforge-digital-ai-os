import fs from "node:fs";
import path from "node:path";
import type { Job } from "@/lib/jobStore";

/**
 * Real-Time Digital Brain Live Logger (src/lib/brainLogger.ts)
 *
 * Synchronizes running multi-agent execution state, active sub-agent tasks,
 * and strategic decisions live to /docs/brain/CURRENT_STATE.md and /docs/brain/DECISION_REGISTRY.md.
 */

const ROOT_DIR = path.resolve(process.cwd(), "..");
const UI_DIR = process.cwd();
const DOCS_BRAIN_DIR = path.join(UI_DIR, "docs", "brain");
const ROOT_DOCS_BRAIN_DIR = path.join(ROOT_DIR, "docs", "brain");

function ensureDirs() {
  if (!fs.existsSync(DOCS_BRAIN_DIR)) fs.mkdirSync(DOCS_BRAIN_DIR, { recursive: true });
  if (!fs.existsSync(ROOT_DOCS_BRAIN_DIR)) fs.mkdirSync(ROOT_DOCS_BRAIN_DIR, { recursive: true });
}

let writeQueue: Promise<void> = Promise.resolve();

function writeToBoth(filename: string, content: string): Promise<void> {
  ensureDirs();
  const uiFile = path.join(DOCS_BRAIN_DIR, filename);
  const rootFile = path.join(ROOT_DOCS_BRAIN_DIR, filename);
  const tmpUi = uiFile + ".tmp";
  const tmpRoot = rootFile + ".tmp";

  writeQueue = writeQueue
    .then(async () => {
      await fs.promises.writeFile(tmpUi, content, "utf8");
      await fs.promises.rename(tmpUi, uiFile);
      await fs.promises.writeFile(tmpRoot, content, "utf8");
      await fs.promises.rename(tmpRoot, rootFile);
    })
    .catch((err) => console.error(`[brainLogger] failed to write ${filename}:`, err));

  return writeQueue;
}

export function flushBrainLogs(): Promise<void> {
  return writeQueue;
}

/**
 * Updates /docs/brain/CURRENT_STATE.md with real-time job execution telemetry.
 */
export function logJobStateChange(job: Job): Promise<void> {
  const activeStep = job.steps.find((s) => s.status === "active");

  let md = `# GrowForge Digital — Current Operating State\n\n`;
  md += `> **Last State Sync:** ${new Date().toISOString()}  \n`;
  md += `> **Active Project:** \`${job.title}\` (\`${job.id}\`)  \n`;
  md += `> **Overall Pipeline Status:** **${job.status.toUpperCase()}** (${job.percent}%)  \n\n`;

  md += `## 1. Live Execution Telemetry\n\n`;
  md += `| Attribute | Current Value |\n`;
  md += `|---|---|\n`;
  md += `| **Job ID** | \`${job.id}\` |\n`;
  md += `| **Project Title** | ${job.title} |\n`;
  md += `| **Created By** | ${job.createdBy ?? "operator"} |\n`;
  md += `| **Pipeline Progress** | \`${job.percent}%\` |\n`;
  md += `| **Active Node** | ${activeStep ? `**${activeStep.label}** (${activeStep.activity})` : "*(none - idle)*"} |\n`;
  md += `| **Research Grounding** | ${job.verified ? `✅ Verified (${job.dossierSnapshot?.sources?.length ?? 0} sources)` : "⚠️ Unverified (Estimate Mode)"} |\n\n`;

  md += `## 2. Department & Sub-Agent Step Matrix\n\n`;
  md += `| Step ID | Department / Node | Status | Progress | Activity | Rule Hash |\n`;
  md += `|---|---|---|---|---|---|\n`;

  for (const s of job.steps) {
    const statusIcon = s.status === "done" ? "✅ Done" : s.status === "active" ? "⏳ Active" : s.status === "error" ? "❌ Error" : "⏸️ Pending";
    md += `| \`${s.id}\` | **${s.label}** | ${statusIcon} | ${s.percent}% | ${s.activity} | \`${s.instructionsHash ? `v.${s.instructionsHash}` : "-"}\` |\n`;
  }

  if (job.finalOutput) {
    md += `\n## 3. Latest Consolidated Deliverable\n\n`;
    md += `${job.finalOutput.slice(0, 1500)}${job.finalOutput.length > 1500 ? "\n\n*(...truncated for summary view...)*" : ""}\n`;
  }

  return writeToBoth("CURRENT_STATE.md", md);
}

/**
 * Appends strategic and architectural decisions to /docs/brain/DECISION_REGISTRY.md
 */
export function logStrategicDecision(input: {
  title: string;
  context: string;
  decision: string;
  department?: string;
}): Promise<void> {
  ensureDirs();
  const registryFile = path.join(DOCS_BRAIN_DIR, "DECISION_REGISTRY.md");
  let existing = "";
  try {
    if (fs.existsSync(registryFile)) {
      existing = fs.readFileSync(registryFile, "utf8");
    }
  } catch {
    existing = "# GrowForge Digital — Architectural & Strategic Decision Registry\n\n";
  }

  const timestamp = new Date().toISOString();
  const entry = `\n### Decision: ${input.title}\n` +
    `- **Recorded:** ${timestamp}\n` +
    `- **Department/Context:** ${input.department ?? "HQ Orchestrator"} · ${input.context}\n` +
    `- **Agreed Resolution & Direction:**\n  ${input.decision.replace(/\n/g, "\n  ")}\n`;

  return writeToBoth("DECISION_REGISTRY.md", existing + entry);
}
export interface SwarmTelemetryInput {
  directiveId: string;
  title: string;
  initialPrompt: string;
  handoffDepth: number;
  maxDepth: number;
  activeAgent: string;
  status: "running" | "completed" | "paused_for_operator" | "error";
  agentTrace: Array<{
    stepNumber: number;
    agentId: string;
    agentName: string;
    action: string;
    timestamp: string;
    summary?: string;
  }>;
  history: Array<{
    fromAgent: string;
    toAgent: string;
    task: string;
    reason?: string;
    timestamp: string;
    output?: string;
  }>;
  variables: Record<string, unknown>;
  toolOutputs: Array<{
    agentId: string;
    tool: string;
    args: Record<string, unknown>;
    result: string;
    timestamp: string;
  }>;
  finalPayload?: {
    summary: string;
    deliverable: string;
    metadata?: Record<string, unknown>;
  };
}

/**
 * Updates /docs/brain/CURRENT_STATE.md with real-time Kimi-style Swarm telemetry.
 */
export function logSwarmStateChange(swarm: SwarmTelemetryInput): Promise<void> {
  const statusIcon =
    swarm.status === "completed"
      ? "✅ COMPLETED"
      : swarm.status === "running"
      ? "⚡ RUNNING"
      : swarm.status === "paused_for_operator"
      ? "⏸️ PAUSED (Awaiting Operator)"
      : "❌ ERROR";

  let md = `# GrowForge Digital — Current Operating State\n\n`;
  md += `> **Architecture Mode:** ⚡ Kimi-Style Peer-to-Peer Agent Swarm  \n`;
  md += `> **Last State Sync:** ${new Date().toISOString()}  \n`;
  md += `> **Active Directive:** \`${swarm.title}\` (\`${swarm.directiveId}\`)  \n`;
  md += `> **Swarm Status:** **${statusIcon}** (Handoff Depth: \`${swarm.handoffDepth}/${swarm.maxDepth}\`)  \n\n`;

  md += `## 1. Live Swarm Telemetry\n\n`;
  md += `| Attribute | Current Value |\n`;
  md += `|---|---|\n`;
  md += `| **Directive ID** | \`${swarm.directiveId}\` |\n`;
  md += `| **Directive Title** | ${swarm.title} |\n`;
  md += `| **Active Swarm Agent** | **${swarm.activeAgent}** |\n`;
  md += `| **Handoff Depth** | \`${swarm.handoffDepth} / ${swarm.maxDepth}\` |\n`;
  md += `| **Total Steps Executed** | \`${swarm.agentTrace.length}\` |\n`;
  md += `| **Tool Calls Made** | \`${swarm.toolOutputs.length}\` |\n`;
  md += `| **Shared Variables Stored** | \`${Object.keys(swarm.variables).length}\` |\n\n`;

  md += `## 2. Peer-to-Peer Handoff & Execution Trace\n\n`;
  if (swarm.agentTrace.length === 0) {
    md += `*(No trace steps recorded yet)*\n\n`;
  } else {
    md += `| Step | Active Agent | Action / Task | Timestamp |\n`;
    md += `|---|---|---|---|\n`;
    for (const t of swarm.agentTrace) {
      md += `| \`#${t.stepNumber}\` | **${t.agentName}** (\`${t.agentId}\`) | ${t.action} | \`${t.timestamp}\` |\n`;
    }
    md += `\n`;
  }

  if (swarm.history.length > 0) {
    md += `### Peer Handoff History\n\n`;
    md += `| From Agent | To Agent | Delegation Reason | Timestamp |\n`;
    md += `|---|---|---|---|\n`;
    for (const h of swarm.history) {
      md += `| **${h.fromAgent}** | **${h.toAgent}** | ${h.reason ?? "Task delegation"} | \`${h.timestamp}\` |\n`;
    }
    md += `\n`;
  }

  if (Object.keys(swarm.variables).length > 0) {
    md += `## 3. Swarm Shared Variable Space\n\n`;
    md += `\`\`\`json\n${JSON.stringify(swarm.variables, null, 2)}\n\`\`\`\n\n`;
  }

  if (swarm.finalPayload) {
    md += `## 4. Consolidated Swarm Deliverable\n\n`;
    md += `### Summary\n${swarm.finalPayload.summary}\n\n`;
    md += `### Deliverable Content\n\n${swarm.finalPayload.deliverable}\n`;
  }

  return writeToBoth("CURRENT_STATE.md", md);
}
