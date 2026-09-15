import { NextResponse } from "next/server";
import { agents } from "@/lib/agents";
import {
  chatComplete,
  CLOUD_PROVIDERS,
  getStrategy,
  hasKey,
  LlmError,
  providerOrder,
  setStrategy,
  UNIVERSAL_CONTEXT_POLICY,
  type ChatMessage,
  type CloudProvider,
  type LlmStrategy,
} from "@/lib/llm";
import type { Agent } from "@/lib/agents";
import { createAndStartJob } from "@/lib/orchestrator";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

function availableKeys(): Record<CloudProvider, boolean> {
  return Object.fromEntries((Object.keys(CLOUD_PROVIDERS) as CloudProvider[]).map((p) => [p, hasKey(p)])) as Record<
    CloudProvider,
    boolean
  >;
}

/** Current strategy + which provider(s) it would try, for the chat UI's switcher. */
export async function GET() {
  const strategy = getStrategy();
  return NextResponse.json({
    strategy,
    providerOrder: providerOrder(strategy),
    availableKeys: availableKeys(),
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
    availableKeys: availableKeys(),
  });
}

interface RouterRequestBody {
  message?: string;
  history?: { role: "user" | "assistant"; content: string }[];
  /** Access-control fields the chat client self-reports, forwarded verbatim
   *  to the agent runner — see security.ts for why this is a soft gate. */
  role?: "owner" | "employee";
  unlockedAgentIds?: string[];
  /** The brief from the assistant's most recent "confirm" turn, if the user
   *  hasn't answered it yet. A project can only launch while one is pending
   *  — the model alone can never start a job without an explicit go-ahead. */
  pendingBrief?: string;
}

type RouteMode = "chat" | "dispatch" | "clarify" | "confirm" | "launch";

interface RouteDecision {
  mode: RouteMode;
  agentId: string | null;
  params: Record<string, unknown>;
  reply: string;
  brief: string | null;
}

function buildCatalog(): string {
  return agents
    .map((a) => `- id: "${a.id}" | name: "${a.name}" | division: ${a.division} | status: ${a.status} — ${a.description}`)
    .join("\n");
}

function buildSystemPrompt(pendingBrief: string | null): string {
  return [
    "You are the GrowForge Digital AI Assistant: the front door to GrowForge's AI departments (Sales & BD, Marketing, Meta Ads, Finance & Ops, Client Success, Web Design, Web Development, AI Automation).",
    "",
    `Universal context rule: ${UNIVERSAL_CONTEXT_POLICY}`,
    "",
    "Single-agent roster (for small, one-off tasks only):",
    buildCatalog(),
    "",
    "Choose exactly ONE mode per message:",
    '- "chat": greetings, thanks, small talk, or questions about what you can do.',
    '- "dispatch": a small, clear, one-off task that one roster agent can do alone. Set agentId to its exact id and params to {"taskDescription": "..."}.',
    '- "clarify": the user wants a PROJECT — a business plan, growth strategy, go-to-market, lead generation or marketing plan, or anything needing several departments — but you do not yet know enough. Ask 1 to 3 focused questions in your reply.',
    '- "confirm": you now know enough for a project. In reply, summarize your understanding in short bullets and ask "Shall I send this to the team?". Put the complete structured brief in the brief field.',
    '- "launch": ONLY if a brief is pending (see below) and the user clearly agrees to it. Put the final brief in the brief field, updated with any last changes they mentioned.',
    "",
    "Clarifying a project — you are an experienced agency strategist, not a form. Before confirming you need: the business type and exactly what it sells; location / service area; stage (idea, just launched, established) and current revenue; target customers; current marketing, website and channels; monthly budget available for marketing and ads; goals with a timeframe; and anything that makes this business different. Ask only about what is still missing — never re-ask what the user already told you. Prefer answerable questions with example options. If the user says to proceed with what they have, go to confirm and list the unknowns as assumptions.",
    "",
    "Be an advisor, not just an interviewer. If the user doesn't know their budget, doesn't know which ad platform to use, or asks what something should cost or which tool/model is worth paying for — give a real, specific, opinionated answer with a number or a name, the way a senior consultant would (e.g. \"for a business this size, $1,500–2,500/month split roughly 60% Google Ads / 40% Meta Ads is realistic to start\" or \"a paid OpenAI/Anthropic/Gemini key is worth it here — the free local model isn't strong enough for research-backed output\"). Never refuse to give a number by saying it depends — give your best real-world estimate and name the assumption behind it. Do this unprompted whenever it would help the user decide, not only when asked.",
    "",
    'The brief (for confirm and launch) is a plain-text document with these headed sections: Client & business, Location, Stage & current situation, Target customers, Offer & pricing, Current marketing & channels, Budget, Goals & timeframe, Constraints & unknowns, Deliverables requested. Write "Unknown" rather than guessing.',
    "",
    pendingBrief
      ? `A BRIEF IS PENDING the user's confirmation:
<<<
${pendingBrief}
>>>
If the user agrees (yes, go, looks good, proceed, send it — in any language) choose "launch". If they correct or add details, choose "confirm" again with the updated brief. If they cancel, choose "chat".`
      : 'No brief is pending. You must NEVER choose "launch" now.',
    "",
    "STRICT RULE FOR reply: plain natural language (Markdown bullets allowed) in the SAME language as the user — never JSON, never curly braces, never a code fence. It is shown in a chat bubble.",
    "",
    "Respond with ONLY one JSON object, no code fences, no text before or after, in exactly this shape:",
    '{"mode": "chat" | "dispatch" | "clarify" | "confirm" | "launch", "agentId": string | null, "params": object, "reply": string, "brief": string | null}',
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
  return t.startsWith("{") && /"agentId"\s*:|"params"\s*:|"reply"\s*:|"mode"\s*:|"brief"\s*:/.test(t);
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
const MODES: RouteMode[] = ["chat", "dispatch", "clarify", "confirm", "launch"];

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
    if (!("agentId" in obj) && !("params" in obj) && !("reply" in obj) && !("mode" in obj)) continue;

    const agentId = typeof obj.agentId === "string" ? obj.agentId : null;
    const params = obj.params && typeof obj.params === "object" ? (obj.params as Record<string, unknown>) : {};
    const brief = typeof obj.brief === "string" && obj.brief.trim() ? obj.brief.trim() : null;
    const declared = typeof obj.mode === "string" && MODES.includes(obj.mode as RouteMode) ? (obj.mode as RouteMode) : null;
    const mode: RouteMode = declared ?? (agentId ? "dispatch" : "chat");
    const replyField = typeof obj.reply === "string" ? obj.reply : "";
    const leftoverProse = (raw.slice(0, span.start) + raw.slice(span.end)).trim();

    const candidateReply = replyField.trim() || leftoverProse || (agentId ? "On it." : "Okay.");
    return { mode, agentId, params, brief, reply: sanitizeReplyText(candidateReply) };
  }

  // No parsable decision JSON at all — never dispatch on unparseable output,
  // and still scrub the raw text in case it contains stray JSON/fences.
  return { mode: "chat", agentId: null, params: {}, brief: null, reply: sanitizeReplyText(raw) };
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

  const pendingBrief = body.pendingBrief?.trim().slice(0, 8000) || null;
  const systemPrompt = buildSystemPrompt(pendingBrief);
  const messages: ChatMessage[] = [...history, { role: "user", content: message }];

  let raw: string;
  let provider: string;
  try {
    const result = await chatComplete(systemPrompt, messages, { maxTokens: 2000, preferCloud: true });
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

  if (decision.mode === "clarify") {
    return NextResponse.json({ reply: decision.reply, provider, mode: "clarify", dispatch: null });
  }

  if (decision.mode === "confirm" && decision.brief) {
    return NextResponse.json({ reply: decision.reply, provider, mode: "confirm", brief: decision.brief, dispatch: null });
  }

  if (decision.mode === "launch") {
    // Launching requires a brief the user was actually shown; the model
    // cannot start a job on its own say-so.
    if (!pendingBrief) {
      return NextResponse.json({ reply: decision.reply, provider, mode: "chat", dispatch: null });
    }
    const session = await getSession();
    const job = createAndStartJob(decision.brief || pendingBrief, session?.user?.email ?? undefined);
    return NextResponse.json({
      reply: decision.reply,
      provider,
      mode: "launch",
      dispatch: null,
      job: { id: job.id, title: job.title },
    });
  }

  const targetAgent: Agent | undefined =
    decision.mode === "dispatch" && decision.agentId ? agents.find((a) => a.id === decision.agentId) : undefined;

  if (!targetAgent) {
    return NextResponse.json({ reply: decision.reply, provider, mode: "chat", dispatch: null });
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
