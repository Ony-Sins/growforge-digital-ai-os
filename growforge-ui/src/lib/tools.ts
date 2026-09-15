import { chatComplete } from "@/lib/llm";
import { researchQuestion, isResearchAvailable } from "@/lib/research";
import { listConnectors, invokeConnector } from "@/lib/connectorStore";
import { piperTool } from "@/lib/tools/piper";
import { whisperTool } from "@/lib/tools/whisper";
import { comfyuiTool } from "@/lib/tools/comfyui";
import { askOperatorTool, setConsultationHandler } from "@/lib/tools/askOperator";
import { n8nTool } from "@/lib/tools/n8n";

/**
 * The generic agent tool-calling loop — what turns a department agent from
 * "writes one block of text and stops" into "can actually do something
 * mid-task and react to what happened."
 *
 * Deliberate architecture choice: rather than wiring each provider's native
 * function-calling API (OpenAI, Anthropic, and Gemini all use a different
 * shape, and Groq/Ollama's support is inconsistent across models), this
 * drives every provider through the same plain-JSON-decision pattern already
 * proven twice elsewhere in this codebase (the chat router's mode field, HQ's
 * plan/revise JSON in orchestrator.ts). One code path, every provider,
 * including local Ollama models that have no native tool-calling at all —
 * they just need to be able to follow a JSON-shaped instruction, which even
 * a 7B model manages far more reliably than matching five different native
 * tool-call formats would.
 *
 * PROPOSE vs EXECUTE (the rule every department's *_Agent_System.md already
 * states) is enforced here, not by asking a model nicely: a tool marked
 * requiresApproval never runs without `requestApproval` explicitly returning
 * true for that exact call. No approval callback configured means no
 * approval-gated tool can ever run — the safe default is "don't", not "do".
 */

export interface ToolResult {
  ok: boolean;
  output: string;
}

export interface Tool {
  name: string;
  description: string;
  /** Plain-English argument spec shown to the model, e.g. "query (string)". */
  usage: string;
  requiresApproval: boolean;
  execute(args: Record<string, unknown>): Promise<ToolResult>;
}

export interface ToolCallLog {
  tool: string;
  args: Record<string, unknown>;
  approved: boolean;
  result: string;
}

export interface ToolLoopOptions {
  systemPrompt: string;
  task: string;
  tools: Tool[];
  maxSteps?: number;
  maxTokens?: number;
  /** Fired before and after each tool call — feeds the live canvas activity
   *  text the same way orchestrator.ts's updateStep() does. */
  onActivity?: (text: string) => void;
  /** Must return true for a requiresApproval tool call to actually run.
   *  Omit entirely to hard-block every approval-gated tool for this loop. */
  requestApproval?: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;
  /** Callback allowing agents to ask the operator interactive questions. */
  requestConsultation?: (question: string, options?: string[]) => Promise<string | null>;
}

export interface ToolLoopResult {
  finalText: string;
  calls: ToolCallLog[];
  provider: string;
  /** True if the loop ended by hitting maxSteps rather than the model
   *  choosing to finish — worth surfacing, since the answer may be partial. */
  hitStepLimit: boolean;
}

/**
 * Parses only the FIRST balanced top-level {...} object, tracking brace
 * depth and string literals — not a naive first-"{"-to-last-"}" slice.
 * Smaller local models sometimes free-run past the one-JSON-per-turn
 * instruction and draft several hypothetical future steps in a single
 * response; a naive slice would swallow all of them into one invalid blob.
 * Taking just the first valid object and ignoring the rest is both more
 * robust and the semantically correct choice — the model's OWN first
 * decision is what should count, not whatever it rambled on to imagine.
 */
function extractJson(text: string): unknown {
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

function toolCatalog(tools: Tool[]): string {
  return tools
    .map((t) => `- ${t.name}${t.requiresApproval ? " (requires owner approval)" : ""}: ${t.description}\n  args: ${t.usage}`)
    .join("\n");
}

function loopInstructions(tools: Tool[]): string {
  return `You can use tools to get real information or take real action instead of only writing text about it. On every turn, respond with ONLY one JSON object — no prose, no code fences, nothing before or after it:

To call a tool: {"action": "tool", "tool": "<exact tool name>", "args": {...}}
To finish: {"action": "final", "text": "<your complete answer, incorporating everything the tools told you>"}

Available tools:
${toolCatalog(tools)}

Call at most one tool per turn. After a tool result comes back, either call another tool or finish — never call the exact same tool with the exact same args twice. If a result says a tool wasn't approved, don't repeat that call; explain the limitation in your final answer instead.`;
}

/**
 * Runs the loop: ask → maybe call a tool → feed the result back → repeat,
 * until the model says it's done or maxSteps is hit. See file header for
 * why this doesn't use any provider's native function-calling API.
 */
export async function runToolLoop(opts: ToolLoopOptions): Promise<ToolLoopResult> {
  const { systemPrompt, task, tools, maxSteps = 6, maxTokens = 1200, onActivity, requestApproval, requestConsultation } = opts;
  const system = `${systemPrompt}\n\n---\n\n${loopInstructions(tools)}`;
  const calls: ToolCallLog[] = [];
  let transcript = `TASK:\n${task}`;
  let provider = "none";

  setConsultationHandler(requestConsultation ?? null);
  try {
    for (let step = 0; step < maxSteps; step++) {
      const result = await chatComplete(system, [{ role: "user", content: transcript }], { maxTokens, preferCloud: true });
      provider = result.provider;

      const decision = extractJson(result.text) as
        | { action?: string; tool?: string; args?: Record<string, unknown>; text?: string }
        | null;

      if (!decision || decision.action !== "tool" || !decision.tool) {
        return { finalText: (decision?.text || result.text).trim(), calls, provider, hitStepLimit: false };
      }

      const tool = tools.find((t) => t.name === decision.tool);
      const args = decision.args ?? {};

      if (!tool) {
        transcript += `\n\nCALLED "${decision.tool}" — unknown tool. Available tools: ${tools.map((t) => t.name).join(", ")}.`;
        continue;
      }

      onActivity?.(`Calling ${tool.name}…`);

      let approved = !tool.requiresApproval;
      if (tool.requiresApproval) {
        approved = requestApproval ? await requestApproval(tool.name, args) : false;
      }

      let resultText: string;
      if (!approved) {
        resultText = "Not approved — this action needs owner sign-off and was not approved. Do not retry it.";
      } else {
        try {
          resultText = (await tool.execute(args)).output;
        } catch (err) {
          resultText = `Tool failed: ${err instanceof Error ? err.message : String(err)}`;
        }
      }

      onActivity?.(`${tool.name} → ${resultText.slice(0, 80)}${resultText.length > 80 ? "…" : ""}`);
      calls.push({ tool: tool.name, args, approved, result: resultText });
      transcript += `\n\nCALLED ${tool.name} WITH ${JSON.stringify(args)}\nRESULT: ${resultText}`;
    }

    return {
      finalText: "Reached the tool-call step limit before finishing — see the calls made so far for what it learned.",
      calls,
      provider,
      hitStepLimit: true,
    };
  } finally {
    setConsultationHandler(null);
  }
}

// --- Default tool catalog --------------------------------------------------
// Two real, working tools to prove the loop end to end. More tools (voice,
// transcription, image generation — see the free-tool roadmap) register the
// same way: implement Tool, add it to getDefaultTools().

const webSearchTool: Tool = {
  name: "web_search",
  description: "Search Google for current, real information (facts, prices, competitors, benchmarks). Read-only — runs immediately, no approval needed.",
  usage: '{ "query": "string — a specific, well-formed search question" }',
  requiresApproval: false,
  async execute(args) {
    const query = typeof args.query === "string" ? args.query : "";
    if (!query.trim()) return { ok: false, output: "query is required." };
    if (!isResearchAvailable()) {
      return { ok: false, output: "No Gemini key configured for live search — add one in Settings → Integrations." };
    }
    const finding = await researchQuestion(query, "");
    const sources = finding.sources.map((s) => `${s.title} (${s.uri})`).join("; ");
    return { ok: true, output: `${finding.answer}${sources ? `\nSources: ${sources}` : ""}` };
  },
};

function connectorTool(): Tool {
  const connectors = listConnectors();
  const list = connectors.length
    ? connectors.map((c) => `${c.id} [${c.method}] ${c.name} → ${c.url}`).join("; ")
    : "(none configured yet — add one in Settings → Integrations)";

  return {
    name: "call_connector",
    description: `Call one of GrowForge's configured custom connectors (real outbound requests to real systems, e.g. HubSpot). Requires owner approval before it actually fires. Configured connectors: ${list}`,
    usage: '{ "connectorId": "string — id from the list above", "body": object | undefined — JSON body for POST/PUT/PATCH connectors, omit for GET" }',
    requiresApproval: true,
    async execute(args) {
      const connectorId = typeof args.connectorId === "string" ? args.connectorId : "";
      if (!connectorId) return { ok: false, output: "connectorId is required." };
      const result = await invokeConnector(connectorId, args.body);
      return { ok: result.ok, output: result.message };
    },
  };
}

/** The tool set available to an agent right now — rebuilt per call so a
 *  newly added connector shows up without a restart. */
export function getDefaultTools(): Tool[] {
  return [webSearchTool, connectorTool(), piperTool, whisperTool, comfyuiTool, askOperatorTool, n8nTool];
}
