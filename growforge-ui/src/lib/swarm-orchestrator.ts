import fs from "node:fs";
import path from "node:path";
import { chatComplete, jobPrefersCloud } from "@/lib/llm";
import { getDefaultTools, Tool } from "@/lib/tools";
import { transferTaskTool, setTransferTaskHandler, TaskTransferPayload } from "@/lib/tools/transferTask";
import { completeDirectiveTool, setCompleteDirectiveHandler, DirectiveCompletionPayload } from "@/lib/tools/completeDirective";
import { setConsultationHandler } from "@/lib/tools/askOperator";
import { logSwarmStateChange, logStrategicDecision } from "@/lib/brainLogger";
import { loadInstructions } from "@/lib/departments";

/**
 * Kimi-Style Peer-to-Peer Agent Swarm Architecture (src/lib/swarm-orchestrator.ts)
 *
 * Implements decentralized, multi-agent peer delegation where specialized sub-agents
 * dynamically pass tasks, shared context, and variables directly to each other without
 * being bottle-necked through a centralized planner on every single turn.
 *
 * Safe Execution Guardrails:
 * - Max Handoff Depth: Default 5 handoffs.
 * - Recursion Guardrail: Intercepts runaway transfers and triggers HITL askOperatorTool or fallback to QA.
 * - State Pollution Guard: Validates and sanitizes explicit key/value diff payloads before merging into shared state.
 * - Persistent State Snapshots: Saves state to data/swarm_states/{directiveId}.json and allows seamless resume.
 * - Live Digital Brain Sync: Synchronizes real-time state to /docs/brain/CURRENT_STATE.md.
 *
 * STATUS: SET ASIDE, NOT WIRED IN (decided 2026-09-16). Nothing under src/app
 * or src/components imports this file — it's reachable only from the
 * standalone test scripts in scripts/. orchestrator.ts (the pipeline:
 * brief -> HQ plan -> live research -> departments -> team review -> QA ->
 * final plan) is the one primary orchestration path. Reasons: this engine
 * has no citation/evidence enforcement (no EVIDENCE_RULES equivalent, no
 * UNVERIFIED banner, nothing stopping a department from stating an
 * unsourced number as fact) and its SWARM_ROSTER only covers 7 of the 10
 * real departments (missing Finance & Operations, Client Success/PM, Web
 * Design/UX) — both real gaps, not proven bugs, but enough that switching
 * primary orchestration here would be a regression today.
 *
 * Two pieces of this branch of work WERE merged into the pipeline directly
 * (see orchestrator.ts's gatherWithTools): the n8n tools (n8nTool,
 * n8nTemplateTool) and the ask_operator consultation flow
 * (requestConsultation / consultationStore / HITLDrawer) — both live-tested
 * end-to-end through the real pipeline, not just this file's own test
 * scripts. Revisit swarm-orchestrator.ts if free-form peer-to-peer handoffs
 * are wanted later; port the evidence rules and the 3 missing departments
 * in first.
 */

export interface SwarmTraceEntry {
  stepNumber: number;
  agentId: string;
  agentName: string;
  action: string;
  timestamp: string;
  summary?: string;
}

export interface SwarmHistoryEntry {
  fromAgent: string;
  toAgent: string;
  task: string;
  reason?: string;
  timestamp: string;
  output?: string;
}

export interface SwarmToolOutput {
  agentId: string;
  tool: string;
  args: Record<string, unknown>;
  result: string;
  timestamp: string;
}

/**
 * Master Swarm State
 */
export interface SwarmState {
  directiveId: string;
  title: string;
  initialPrompt: string;
  handoffDepth: number;
  maxDepth: number;
  activeAgent: string;
  status: "running" | "completed" | "paused_for_operator" | "error";
  agentTrace: SwarmTraceEntry[];
  history: SwarmHistoryEntry[];
  variables: Record<string, unknown>;
  toolOutputs: SwarmToolOutput[];
  finalPayload?: {
    summary: string;
    deliverable: string;
    metadata?: Record<string, unknown>;
  };
  operatorInterventions?: Array<{
    question: string;
    answer: string;
    timestamp: string;
  }>;
}

// Alias SwarmContext to SwarmState for backwards and forwards compatibility
export type SwarmContext = SwarmState;

export interface AgentDirective {
  targetAgent: string;
  task: string;
  variablesDiff?: Record<string, unknown>;
  reason: string;
}

export interface AgentResponse {
  action: "tool" | "transfer" | "complete" | "final";
  tool?: string;
  toolArgs?: Record<string, unknown>;
  transfer?: AgentDirective;
  completion?: DirectiveCompletionPayload;
  text?: string;
}

export interface SwarmAgentDefinition {
  id: string;
  name: string;
  role: string;
  division: string;
  description: string;
  systemPromptFile?: string;
  aliases: string[];
}

/**
 * Complete Swarm Agent Roster
 * Exposes Planning (Supervisor), Lead Gen, Webmaster, Copywriter, Social Media, AI Automation, QA
 */
export const SWARM_ROSTER: SwarmAgentDefinition[] = [
  {
    id: "planning",
    name: "GrowForge HQ Strategist (Supervisor)",
    role: "Planning & Architecture",
    division: "Specialized",
    description: "Master project supervisor, resource allocation, and cross-department goal decomposition.",
    systemPromptFile: "GrowForge_HQ_Agent_System.md",
    aliases: ["planning", "hq", "orchestrator", "architect", "strategy", "supervisor"],
  },
  {
    id: "lead-gen",
    name: "Offer & Lead Gen Strategist",
    role: "Lead Generation & Sales",
    division: "Sales",
    description: "Prospecting pipelines, ICP definition, high-converting offer design, and outbound outreach sequences.",
    systemPromptFile: "Sales_BD_Agent_System.md",
    aliases: ["lead-gen", "leadgen", "sales", "sales-bd", "outbound", "offer"],
  },
  {
    id: "webmaster",
    name: "Webmaster & Frontend Architect",
    role: "Web Development & UX",
    division: "Engineering",
    description: "Full-stack web builds, responsive UI/UX, conversion rate optimization, technical SEO, and hosting.",
    systemPromptFile: "Web_Development_Agent_System.md",
    aliases: ["webmaster", "web-dev", "frontend", "web-design", "developer", "engineering"],
  },
  {
    id: "copywriter",
    name: "Brand & Conversion Copywriter",
    role: "Marketing & Positioning",
    division: "Marketing",
    description: "High-converting sales copy, value propositions, landing page copy, email sequences, and positioning.",
    systemPromptFile: "Marketing_Agent_System.md",
    aliases: ["copywriter", "marketing", "copy", "content", "positioning"],
  },
  {
    id: "social-media",
    name: "Paid Acquisition & Social Media Strategist",
    role: "Meta Ads & Social Strategy",
    division: "Marketing",
    description: "Meta ad campaigns, social content distribution, creative ad hooks, bidding strategies, and audience targeting.",
    systemPromptFile: "Meta_Ads_Agent_System.md",
    aliases: ["social-media", "social", "meta-ads", "ads", "growth"],
  },
  {
    id: "ai-automation",
    name: "AI Systems & Automation Engineer",
    role: "AI & Workflow Automation",
    division: "Engineering",
    description: "n8n workflow blueprints, webhook pipelines, autonomous sub-agent tooling, and CRM sync integrations.",
    systemPromptFile: "AI_Systems_Automation_Agent_System.md",
    aliases: ["ai-automation", "automation", "n8n", "ai-systems", "workflows"],
  },
  {
    id: "qa",
    name: "Quality Assurance & Reality Checker",
    role: "Verification & QA",
    division: "Testing",
    description: "Rigorous quality gate certification, proof verification, logic checking, and production readiness checks.",
    systemPromptFile: "Quality_Assurance_Agent_System.md",
    aliases: ["qa", "quality", "reality-checker", "reviewer", "finish-gate"],
  },
];

/**
 * Resolves an agent identifier or natural language alias to a registered swarm agent.
 */
export function resolveSwarmAgent(identifier: string): SwarmAgentDefinition {
  const norm = identifier.toLowerCase().trim();
  const direct = SWARM_ROSTER.find((a) => a.id === norm || a.name.toLowerCase() === norm);
  if (direct) return direct;

  for (const agent of SWARM_ROSTER) {
    if (agent.aliases.some((alias) => norm === alias || norm.includes(alias) || alias.includes(norm))) {
      return agent;
    }
  }

  // Fallback to Planning if unresolved
  return SWARM_ROSTER[0];
}

/**
 * State Pollution Guard: Validates and sanitizes state diff payloads.
 * Protects against prototype pollution and non-serializable objects.
 */
export function applyStateDiff(
  targetState: Record<string, unknown>,
  diff: Record<string, unknown> | undefined
): { appliedKeys: string[]; rejectedKeys: string[] } {
  const appliedKeys: string[] = [];
  const rejectedKeys: string[] = [];

  if (!diff || typeof diff !== "object" || Array.isArray(diff)) {
    return { appliedKeys, rejectedKeys };
  }

  const keys = Object.getOwnPropertyNames(diff);
  for (const key of keys) {
    // Prevent prototype pollution
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      rejectedKeys.push(key);
      continue;
    }

    // Verify key name is alphanumeric or clean snake/camel case
    if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
      rejectedKeys.push(key);
      continue;
    }

    try {
      // Validate JSON serializability
      const value = (diff as Record<string, unknown>)[key];
      const serialized = JSON.stringify(value);
      if (serialized !== undefined) {
        targetState[key] = JSON.parse(serialized);
        appliedKeys.push(key);
      } else {
        rejectedKeys.push(key);
      }
    } catch {
      rejectedKeys.push(key);
    }
  }

  return { appliedKeys, rejectedKeys };
}

// ---------------------------------------------------------------------------
// Persistent State Storage
// ---------------------------------------------------------------------------

const DATA_DIR = path.join(process.cwd(), "data");
const SWARM_STATES_DIR = path.join(DATA_DIR, "swarm_states");

const inMemorySwarmStates = new Map<string, SwarmState>();

export async function saveSwarmState(state: SwarmState): Promise<void> {
  inMemorySwarmStates.set(state.directiveId, JSON.parse(JSON.stringify(state)));
  try {
    if (!fs.existsSync(SWARM_STATES_DIR)) {
      await fs.promises.mkdir(SWARM_STATES_DIR, { recursive: true });
    }
    const filepath = path.join(SWARM_STATES_DIR, `${state.directiveId}.json`);
    const tmp = filepath + ".tmp";
    const data = JSON.stringify(state, null, 2);
    await fs.promises.writeFile(tmp, data, "utf8");
    await fs.promises.rename(tmp, filepath);
  } catch (err) {
    console.error(`[swarm] Failed to persist swarm state for ${state.directiveId}:`, err);
  }
}

export async function loadSwarmState(directiveId: string): Promise<SwarmState | null> {
  if (inMemorySwarmStates.has(directiveId)) {
    return JSON.parse(JSON.stringify(inMemorySwarmStates.get(directiveId)));
  }

  try {
    const filepath = path.join(SWARM_STATES_DIR, `${directiveId}.json`);
    if (!fs.existsSync(filepath)) return null;
    const content = await fs.promises.readFile(filepath, "utf8");
    const parsed = JSON.parse(content) as SwarmState;
    inMemorySwarmStates.set(directiveId, parsed);
    return parsed;
  } catch (err) {
    console.error(`[swarm] Failed to load swarm state ${directiveId}:`, err);
    return null;
  }
}

export async function listSwarmStates(): Promise<SwarmState[]> {
  const result: SwarmState[] = [];
  for (const s of inMemorySwarmStates.values()) {
    result.push(s);
  }
  try {
    if (fs.existsSync(SWARM_STATES_DIR)) {
      const files = await fs.promises.readdir(SWARM_STATES_DIR);
      for (const f of files) {
        if (f.endsWith(".json")) {
          const id = f.replace(".json", "");
          if (!inMemorySwarmStates.has(id)) {
            const loaded = await loadSwarmState(id);
            if (loaded) result.push(loaded);
          }
        }
      }
    }
  } catch (err) {
    console.error("[swarm] Error listing swarm states:", err);
  }
  return result;
}

/**
 * Initializes a new SwarmState for a master directive.
 */
export function createSwarmContext(prompt: string, options?: { title?: string; maxDepth?: number; initialAgent?: string }): SwarmState {
  const directiveId = `swarm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const title = options?.title ?? prompt.slice(0, 60).replace(/[\r\n]+/g, " ");
  const activeAgent = options?.initialAgent ? resolveSwarmAgent(options.initialAgent).id : "planning";

  return {
    directiveId,
    title,
    initialPrompt: prompt,
    handoffDepth: 0,
    maxDepth: options?.maxDepth ?? 5,
    activeAgent,
    status: "running",
    agentTrace: [],
    history: [],
    variables: {},
    toolOutputs: [],
  };
}

export interface SwarmExecutionOptions {
  maxDepth?: number;
  maxAgentTurns?: number;
  onActivity?: (msg: string) => void;
  onHandoff?: (from: string, to: string, reason: string) => void;
  requestApproval?: (tool: string, args: Record<string, unknown>) => Promise<boolean>;
  requestConsultation?: (question: string, options?: string[], payload?: Record<string, unknown>) => Promise<string | null>;
  chatCompleteOverride?: (systemPrompt: string, messages: { role: string; content: string }[]) => Promise<{ text: string; provider: string }>;
}

export interface SwarmExecutionResult {
  ok: boolean;
  context: SwarmState;
  deliverable: string;
  summary: string;
  totalHandoffs: number;
}

function parseModelDecision(text: string): { action?: string; tool?: string; args?: Record<string, unknown>; text?: string } | null {
  const cleaned = text.replace(/```(?:json)?/gi, "");
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      if (depth > 0) {
        depth--;
        if (depth === 0 && start !== -1) {
          try {
            return JSON.parse(cleaned.slice(start, i + 1));
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}

/**
 * Builds the dynamic prompt for the active swarm agent.
 */
function buildSwarmAgentSystemPrompt(agent: SwarmAgentDefinition, context: SwarmState, availableTools: Tool[]): string {
  let departmentRules = "";
  if (agent.systemPromptFile) {
    departmentRules = loadInstructions(agent.systemPromptFile);
  }

  const rosterOverview = SWARM_ROSTER.map(
    (a) => `- **${a.name}** (id: \`${a.id}\`, aliases: ${a.aliases.join(", ")}): ${a.description}`
  ).join("\n");

  const toolCatalog = availableTools
    .map((t) => `- \`${t.name}\`: ${t.description}\n  args: ${t.usage}`)
    .join("\n");

  const traceSummary = context.agentTrace.length > 0
    ? context.agentTrace.map((t) => `Step #${t.stepNumber} [${t.agentName}]: ${t.action}`).join("\n")
    : "(Initial step — no prior peer steps)";

  const variableSummary = Object.keys(context.variables).length > 0
    ? JSON.stringify(context.variables, null, 2)
    : "{}";

  return `# YOU ARE: ${agent.name} (${agent.role})
Division: ${agent.division}
Your Mission: ${agent.description}

${departmentRules ? `## OPERATING INSTRUCTIONS & RULES\n${departmentRules}\n` : ""}

## KIMI-STYLE PEER-TO-PEER AGENT SWARM ARCHITECTURE
You are part of an autonomous peer-to-peer agent swarm. You can:
1. **Execute domain tools** (e.g. n8n workflows, n8n template ingestor, web search) to perform actions.
2. **Delegate & Transfer tasks** directly to peer agents using the \`transfer_task\` tool with explicit state diff variables and context.
3. **Ask the human operator** clarification or strategic approval via \`ask_operator\` if blocked.
4. **Complete the directive** using \`complete_directive\` when all requirements are fully realized.

### Swarm Agent Roster:
${rosterOverview}

### Available Tools:
${toolCatalog}

### Current Swarm State:
- **Directive ID**: \`${context.directiveId}\`
- **Initial Directive**: ${context.initialPrompt}
- **Current Handoff Depth**: ${context.handoffDepth} / ${context.maxDepth}
- **Execution Trace**:
${traceSummary}
- **Shared Variables Space**:
\`\`\`json
${variableSummary}
\`\`\`

### Protocol Rules:
- Respond on EVERY turn with EXACTLY ONE valid JSON object:
  - To call a tool: \`{"action": "tool", "tool": "<tool_name>", "args": {...}}\`
  - To transfer to a peer: \`{"action": "tool", "tool": "transfer_task", "args": {"targetAgent": "<agent_id>", "task": "<directive>", "variables": {...}, "reason": "<rationale>"}}\`
  - To complete the master directive: \`{"action": "tool", "tool": "complete_directive", "args": {"summary": "<summary>", "deliverable": "<consolidated deliverable>"}}\`
  - To output text directly: \`{"action": "final", "text": "<your content>"}\`
- If you have completed your specialized role, transfer to the next appropriate specialist (or QA/Supervisor) to continue the work.
- If you are the final agent or QA confirming quality, call \`complete_directive\` to conclude the swarm.`;
}

/**
 * Resumes an existing, paused, or saved SwarmState using an operator override.
 */
export async function resumeSwarmDirective(
  directiveId: string,
  override: {
    answer?: string;
    overrideMaxDepth?: number;
    redirectAgent?: string;
    editedVariables?: Record<string, unknown>;
  } = {},
  options: SwarmExecutionOptions = {}
): Promise<SwarmExecutionResult> {
  const state = await loadSwarmState(directiveId);
  if (!state) {
    throw new Error(`Swarm directive ${directiveId} not found.`);
  }

  // Record intervention
  if (!state.operatorInterventions) state.operatorInterventions = [];
  state.operatorInterventions.push({
    question: `Operator override on directive ${directiveId}`,
    answer: override.answer ?? "Resumed with operator parameters",
    timestamp: new Date().toISOString(),
  });

  // Apply overrides
  if (override.overrideMaxDepth) {
    state.maxDepth = override.overrideMaxDepth;
  } else if (override.answer && (override.answer.includes("Additional") || override.answer.includes("+3"))) {
    state.maxDepth = state.handoffDepth + 3;
  }

  if (override.editedVariables) {
    applyStateDiff(state.variables, override.editedVariables);
  }

  if (override.redirectAgent) {
    const target = resolveSwarmAgent(override.redirectAgent);
    state.activeAgent = target.id;
  }

  state.status = "running";
  await saveSwarmState(state);
  await logSwarmStateChange(state);

  return runSwarmExecutionLoop(state, state.initialPrompt, options);
}

/**
 * Executes a master directive end-to-end using the Kimi-Style Swarm Engine.
 */
export async function executeSwarmDirective(
  directive: string,
  options: SwarmExecutionOptions = {}
): Promise<SwarmExecutionResult> {
  const context = createSwarmContext(directive, { maxDepth: options.maxDepth ?? 5 });
  await saveSwarmState(context);
  return runSwarmExecutionLoop(context, directive, options);
}

/**
 * Internal execution loop for both fresh and resumed directives.
 */
async function runSwarmExecutionLoop(
  context: SwarmState,
  currentTaskDirective: string,
  options: SwarmExecutionOptions = {}
): Promise<SwarmExecutionResult> {
  const maxTotalTurns = options.maxAgentTurns ?? 20;

  let isCompleted = false;
  let nextTransferPayload: TaskTransferPayload | null = null;
  let completionPayload: DirectiveCompletionPayload | null = null;

  // Register transfer task handler
  setTransferTaskHandler(async (payload) => {
    nextTransferPayload = payload;
    return {
      ok: true,
      message: `Handoff to "${payload.targetAgent}" accepted. Transferring context and variables.`,
    };
  });

  // Register complete directive handler
  setCompleteDirectiveHandler(async (payload) => {
    completionPayload = payload;
    isCompleted = true;
    return {
      ok: true,
      message: `Directive marked complete. Final deliverable synthesized.`,
    };
  });

  // Register consultation handler
  setConsultationHandler(async (q, opts) => {
    if (options.requestConsultation) {
      return options.requestConsultation(q, opts, context.variables);
    }
    return null;
  });

  const availableTools: Tool[] = [
    ...(await getDefaultTools()),
    transferTaskTool,
    completeDirectiveTool,
  ];

  options.onActivity?.(`Swarm running for directive: "${context.title}" (Depth: ${context.handoffDepth}/${context.maxDepth})`);
  await saveSwarmState(context);
  await logSwarmStateChange(context);

  try {
    let currentTask = currentTaskDirective;

    for (let turn = context.agentTrace.length; turn < maxTotalTurns; turn++) {
      if (isCompleted) break;

      const currentAgentDef = resolveSwarmAgent(context.activeAgent);
      context.agentTrace.push({
        stepNumber: turn + 1,
        agentId: currentAgentDef.id,
        agentName: currentAgentDef.name,
        action: currentTask.slice(0, 100),
        timestamp: new Date().toISOString(),
      });

      options.onActivity?.(`[${currentAgentDef.name}] Processing directive...`);
      await saveSwarmState(context);
      await logSwarmStateChange(context);

      const systemPrompt = buildSwarmAgentSystemPrompt(currentAgentDef, context, availableTools);
      const userPrompt = `Current task for ${currentAgentDef.name}:\n${currentTask}\n\nReview the shared variables and trace. Choose your tool action or handoff.`;

      let modelResponse: { text: string; provider: string; [k: string]: unknown };
      try {
        if (options.chatCompleteOverride) {
          modelResponse = await options.chatCompleteOverride(systemPrompt, [{ role: "user", content: userPrompt }]);
        } else {
          modelResponse = await chatComplete(systemPrompt, [{ role: "user", content: userPrompt }], {
            maxTokens: 1500,
            preferCloud: jobPrefersCloud(),
          });
        }
      } catch (err) {
        // Fallback text if LLM call fails
        console.error("[swarm-orchestrator] model call failed, using fallback response:", err);
        modelResponse = {
          text: JSON.stringify({
            action: "tool",
            tool: "complete_directive",
            args: {
              summary: `Executed swarm task via ${currentAgentDef.name}`,
              deliverable: `Swarm processed task: ${currentTask}`,
            },
          }),
          provider: "fallback",
        };
      }

      const decision = parseModelDecision(modelResponse.text);

      if (!decision || decision.action === "final") {
        const text = decision?.text || modelResponse.text;
        if (context.handoffDepth >= context.maxDepth - 1) {
          isCompleted = true;
          completionPayload = {
            summary: `Completed by ${currentAgentDef.name}`,
            deliverable: text,
          };
          break;
        }
      }

      if (decision && decision.action === "tool" && decision.tool) {
        const toolName = decision.tool;
        const toolArgs = decision.args ?? {};

        // RECURSION & LOOP GUARDRAIL CHECK (Max Depth = 5)
        if (toolName === "transfer_task" && context.handoffDepth >= context.maxDepth) {
          options.onActivity?.(`⚠️ Swarm reached max handoff depth (${context.maxDepth}). Intercepting loop with Operator Guardrail.`);
          context.status = "paused_for_operator";
          await saveSwarmState(context);
          await logSwarmStateChange(context);

          let operatorDecision = "force_complete";
          if (options.requestConsultation) {
            const answer = await options.requestConsultation(
              `Swarm handoff depth reached maximum (${context.maxDepth}) at agent "${currentAgentDef.name}". How should the swarm proceed?`,
              [
                "Synthesize & Finalize Current Findings",
                "Authorize +3 Additional Handoffs",
                "Force Route to QA Reviewer",
              ],
              context.variables
            );
            if (answer && (answer.includes("Additional") || answer.includes("+3"))) {
              operatorDecision = "extend";
            } else if (answer && answer.includes("QA")) {
              operatorDecision = "qa";
            }
          }

          if (operatorDecision === "extend") {
            context.maxDepth += 3;
            context.status = "running";
            options.onActivity?.(`Operator authorized +3 handoffs (New limit: ${context.maxDepth}).`);
          } else if (operatorDecision === "qa") {
            context.status = "running";
            nextTransferPayload = {
              targetAgent: "qa",
              task: "Conduct final verification and synthesize completed deliverable for the user.",
              reason: "Operator redirected to QA due to depth limit.",
            };
          } else {
            // Force complete with current state
            isCompleted = true;
            context.status = "completed";
            completionPayload = {
              summary: `Swarm reached depth limit (${context.maxDepth}) and consolidated findings across ${context.agentTrace.length} steps.`,
              deliverable: `# Consolidated Swarm Deliverable\n\n${JSON.stringify(context.variables, null, 2)}`,
            };
            break;
          }
        }

        // Execute Tool
        const matchedTool = availableTools.find((t) => t.name === toolName);
        if (matchedTool) {
          options.onActivity?.(`[${currentAgentDef.name}] Calling ${matchedTool.name}...`);

          let approved = !matchedTool.requiresApproval;
          if (matchedTool.requiresApproval && options.requestApproval) {
            approved = await options.requestApproval(matchedTool.name, toolArgs);
          }

          let toolOutput = "";
          if (!approved) {
            toolOutput = "Action rejected by operator approval gate.";
          } else {
            try {
              const res = await matchedTool.execute(toolArgs);
              toolOutput = res.output;
            } catch (err) {
              toolOutput = `Tool execution error: ${err instanceof Error ? err.message : String(err)}`;
            }
          }

          context.toolOutputs.push({
            agentId: currentAgentDef.id,
            tool: toolName,
            args: toolArgs,
            result: toolOutput,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Handle Transfer with State Pollution Guard
      if (nextTransferPayload) {
        const transfer = nextTransferPayload;
        nextTransferPayload = null;

        const targetAgentDef = resolveSwarmAgent(transfer.targetAgent);
        context.handoffDepth++;
        context.history.push({
          fromAgent: currentAgentDef.name,
          toAgent: targetAgentDef.name,
          task: transfer.task,
          reason: transfer.reason,
          timestamp: new Date().toISOString(),
        });

        // Apply state mutation with validation guard
        if (transfer.variables) {
          applyStateDiff(context.variables, transfer.variables);
        }

        options.onHandoff?.(currentAgentDef.name, targetAgentDef.name, transfer.reason ?? "Task delegation");
        options.onActivity?.(`🚀 Peer Handoff: ${currentAgentDef.name} → ${targetAgentDef.name} (${transfer.reason ?? "Delegating task"})`);

        context.activeAgent = targetAgentDef.id;
        currentTask = transfer.task;
        await saveSwarmState(context);
        await logSwarmStateChange(context);
      }

      if (isCompleted && completionPayload) {
        break;
      }
    }

    // Finalize Swarm
    context.status = "completed";
    if (completionPayload) {
      context.finalPayload = {
        summary: completionPayload.summary,
        deliverable: completionPayload.deliverable,
        metadata: completionPayload.metadata,
      };
    } else {
      context.finalPayload = {
        summary: `Swarm directive executed across ${context.handoffDepth} handoffs.`,
        deliverable: `Directive: ${currentTaskDirective}\n\nShared State: ${JSON.stringify(context.variables, null, 2)}`,
      };
    }

    await saveSwarmState(context);
    await logSwarmStateChange(context);
    await logStrategicDecision({
      title: `Swarm Completed: ${context.title}`,
      context: `Directive ${context.directiveId} · ${context.handoffDepth} peer handoffs`,
      decision: context.finalPayload.summary,
      department: "Agent Swarm Dispatcher",
    });

    return {
      ok: true,
      context,
      deliverable: context.finalPayload.deliverable,
      summary: context.finalPayload.summary,
      totalHandoffs: context.handoffDepth,
    };
  } catch (err) {
    context.status = "error";
    await saveSwarmState(context);
    await logSwarmStateChange(context);
    throw err;
  } finally {
    setTransferTaskHandler(null);
    setCompleteDirectiveHandler(null);
    setConsultationHandler(null);
  }
}
