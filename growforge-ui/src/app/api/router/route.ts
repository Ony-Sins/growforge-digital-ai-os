import { NextResponse } from "next/server";
import { agents } from "@/lib/agents";
import {
  chatComplete,
  getStrategy,
  hasKey,
  LlmError,
  providerOrder,
  setStrategy,
  UNIVERSAL_CONTEXT_POLICY,
  type ChatMessage,
  type LlmStrategy,
} from "@/lib/llm";
import type { Agent } from "@/lib/agents";

export const runtime = "nodejs";

/** Current strategy + which provider(s) it would try, for the chat UI's switcher. */
export async function GET() {
  const strategy = getStrategy();
  return NextResponse.json({
    strategy,
    providerOrder: providerOrder(strategy),
    availableKeys: { gemini: hasKey("gemini"), groq: hasKey("groq") },
  });
}

/** Live strategy switcher — changes take effect immediately, for this
 *  server process, without a restart. Not persisted across restarts. */
export async function PATCH(req: Request) {
  let body: { strategy?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const strategy = body.strategy;
  if (strategy !== "auto" && strategy !== "local" && strategy !== "cloud") {
    return NextResponse.json({ error: 'strategy must be "auto", "local", or "cloud".' }, { status: 400 });
  }

  setStrategy(strategy as LlmStrategy);
  return NextResponse.json({
    strategy,
    providerOrder: providerOrder(strategy as LlmStrategy),
    availableKeys: { gemini: hasKey("gemini"), groq: hasKey("groq") },
  });
}

interface RouterRequestBody {
  message?: string;
  history?: { role: "user" | "assistant"; content: string }[];
  /** Access-control fields the chat client self-reports, forwarded verbatim
   *  to the agent runner — see security.ts for why this is a soft gate. */
  role?: "owner" | "employee";
  unlockedAgentIds?: string[];
}

interface RouteDecision {
  agentId: string | null;
  params: Record<string, unknown>;
  reply: string;
}

function buildCatalog(): string {
  return agents
    .map((a) => `- id: "${a.id}" | name: "${a.name}" | division: ${a.division} | status: ${a.status} — ${a.description}`)
    .join("\n");
}

function buildSystemPrompt(): string {
  return [
    "You are the GrowForge Digital AI Router, a natural-language dispatcher in front of a small internal agent roster.",
    "",
    `Universal context rule: ${UNIVERSAL_CONTEXT_POLICY}`,
    "",
    "Available agents (use the exact id when dispatching):",
    buildCatalog(),
    "",
    "For every user message, decide:",
    "1. Whether the user is making a clear, actionable request that matches one of the agents' specialties above.",
    "2. If, and ONLY if, there is such a clear actionable request, set agentId to that agent's exact id and extract any useful parameters as a flat JSON object (use {} if nothing to extract).",
    '3. Otherwise — greetings ("hello", "hi"), small talk, thanks, or general questions about what you or the agents can do ("what can you do?", "can you talk?") — set agentId to null and params to {}. Default to null when unsure; only dispatch when the request is unambiguous.',
    "4. Write a short, natural, conversational reply in the SAME language as the user's message, answering them directly or acknowledging what you're dispatching.",
    "",
    "STRICT RULE FOR THE reply FIELD: it must contain ONLY plain natural-language sentences — never JSON, never curly braces, never a code fence, never the words agentId/params. It is shown to the user verbatim in a chat bubble.",
    "",
    "Examples (format only — always match the user's own language and phrasing in your real reply):",
    'User: "hello" → {"agentId": null, "params": {}, "reply": "Hi there! What can I help you with?"}',
    'User: "what can you do?" → {"agentId": null, "params": {}, "reply": "I can route your requests to the right specialist agent — just tell me what you need."}',
    'User: "can you talk?" → {"agentId": null, "params": {}, "reply": "Yes, I\'m here and ready to help."}',
    'User: "draft an outbound sequence for mid-market SaaS buyers" → {"agentId": "outbound-strategist", "params": {"taskDescription": "Draft an outbound sequence for mid-market SaaS buyers"}, "reply": "On it — I\'ll have the Outbound Strategist draft that sequence now."}',
    "",
    "Respond with ONLY a single JSON object and nothing else — no markdown code fences, no commentary before or after — matching exactly this shape:",
    '{"agentId": string | null, "params": object, "reply": string}',
  ].join("\n");
}

interface JsonSpan {
  start: number;
  end: number;
  raw: string;
}

/** Scans for balanced top-level {...} spans, respecting string literals and
 *  escapes, so nested braces (e.g. inside "params") don't truncate the
 *  match the way a naive greedy regex would. */
function findBalancedJsonSpans(text: string): JsonSpan[] {
  const spans: JsonSpan[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      if (depth > 0) {
        depth--;
        if (depth === 0 && start !== -1) {
          spans.push({ start, end: i + 1, raw: text.slice(start, i + 1) });
          start = -1;
        }
      }
    }
  }
  return spans;
}

/** True if a JSON-looking blob has the shape of our router decision object,
 *  as opposed to some unrelated JSON the model legitimately wants to show. */
function looksLikeDecisionJson(text: string): boolean {
  const t = text.trim();
  return t.startsWith("{") && /"agentId"\s*:|"params"\s*:|"reply"\s*:/.test(t);
}

/** Defense-in-depth scrub: strips our own decision-JSON shape out of any
 *  text before it reaches the chat UI, whether it arrived inside a code
 *  fence, as a bare object, or (rarely) nested inside the model's own
 *  "reply" field. Leaves unrelated JSON/code the model legitimately wants
 *  to show the user untouched. */
function sanitizeReplyText(text: string): string {
  let cleaned = text.replace(/```(?:json)?\s*([\s\S]*?)```/gi, (full, inner: string) =>
    looksLikeDecisionJson(inner) ? "" : full,
  );

  const spans = findBalancedJsonSpans(cleaned).filter((s) => looksLikeDecisionJson(s.raw));
  for (let i = spans.length - 1; i >= 0; i--) {
    cleaned = cleaned.slice(0, spans[i].start) + cleaned.slice(spans[i].end);
  }

  return cleaned.replace(/\n{3,}/g, "\n\n").trim();
}

/** Parses the model's JSON decision robustly — models occasionally wrap it
 *  in prose or code fences, omit the reply field, or (with weaker models)
 *  echo the decision JSON itself as the reply text. In every case the
 *  final reply is guaranteed to be scrubbed of JSON/code-fence syntax. */
function parseDecision(raw: string): RouteDecision {
  for (const span of findBalancedJsonSpans(raw)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(span.raw);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    const obj = parsed as Record<string, unknown>;
    if (!("agentId" in obj) && !("params" in obj) && !("reply" in obj)) continue;

    const agentId = typeof obj.agentId === "string" ? obj.agentId : null;
    const params = obj.params && typeof obj.params === "object" ? (obj.params as Record<string, unknown>) : {};
    const replyField = typeof obj.reply === "string" ? obj.reply : "";
    const leftoverProse = (raw.slice(0, span.start) + raw.slice(span.end)).trim();

    const candidateReply = replyField.trim() || leftoverProse || (agentId ? "On it." : "Okay.");
    return { agentId, params, reply: sanitizeReplyText(candidateReply) };
  }

  // No parsable decision JSON at all — never dispatch on unparseable output,
  // and still scrub the raw text in case it contains stray JSON/fences.
  return { agentId: null, params: {}, reply: sanitizeReplyText(raw) };
}

export async function POST(req: Request) {
  let body: RouterRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json({ error: "message is required." }, { status: 400 });
  }

  const history: ChatMessage[] = (body.history ?? [])
    .slice(-10)
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.content }));

  const systemPrompt = buildSystemPrompt();
  const messages: ChatMessage[] = [...history, { role: "user", content: message }];

  let raw: string;
  let provider: string;
  try {
    const result = await chatComplete(systemPrompt, messages);
    raw = result.text;
    provider = result.provider;
  } catch (err) {
    if (err instanceof LlmError) {
      return NextResponse.json({ error: err.message, provider: err.provider }, { status: 503 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Router failed unexpectedly." },
      { status: 500 },
    );
  }

  const decision = parseDecision(raw);
  const targetAgent: Agent | undefined = decision.agentId
    ? agents.find((a) => a.id === decision.agentId)
    : undefined;

  if (!decision.agentId || !targetAgent) {
    return NextResponse.json({ reply: decision.reply, provider, dispatch: null });
  }

  // Every payload dispatched through the conversational router carries the
  // universal language/intent policy alongside the model-extracted params.
  const origin = new URL(req.url).origin;
  let dispatchRes: Response;
  try {
    dispatchRes = await fetch(`${origin}/api/agents/${encodeURIComponent(targetAgent.id)}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...decision.params,
        context: UNIVERSAL_CONTEXT_POLICY,
        source: "ai-router",
        role: body.role,
        unlockedAgentIds: body.unlockedAgentIds,
      }),
    });
  } catch (err) {
    return NextResponse.json({
      reply: decision.reply,
      provider,
      dispatch: null,
      dispatchError: err instanceof Error ? err.message : "Failed to reach the agent dispatch endpoint.",
    });
  }

  const dispatchData = await dispatchRes.json();

  if (dispatchRes.status === 403 && dispatchData.locked) {
    return NextResponse.json({
      reply: decision.reply,
      provider,
      dispatch: null,
      locked: { agentId: targetAgent.id, agentName: targetAgent.name },
    });
  }

  if (dispatchData.status === "hand-off") {
    return NextResponse.json({
      reply: decision.reply,
      provider,
      dispatch: null,
      handoff: {
        sourceAgentId: dispatchData.sourceAgentId,
        targetAgentId: dispatchData.targetAgentId,
        targetAgentName: dispatchData.targetAgentName,
        userPrompt: dispatchData.userPrompt,
        reason: dispatchData.reason,
        // carried along so the client can re-dispatch with the same
        // extracted params if the user confirms the hand-off
        params: decision.params,
      },
    });
  }

  if (!dispatchRes.ok) {
    return NextResponse.json({
      reply: decision.reply,
      provider,
      dispatch: null,
      dispatchError: dispatchData.error ?? `Dispatch failed (${dispatchRes.status}).`,
    });
  }

  return NextResponse.json({
    reply: decision.reply,
    provider,
    dispatch: {
      agentId: targetAgent.id,
      agentName: targetAgent.name,
      status: dispatchData.agent?.status ?? "active",
      lastRun: dispatchData.agent?.lastRun ?? "running now",
      logMessage: dispatchData.log?.message ?? null,
    },
  });
}
