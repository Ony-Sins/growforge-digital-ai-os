import { NextResponse } from "next/server";
import { agents } from "@/lib/agents";
import { logContextEvent } from "@/lib/spatial/dailyContext";
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
import { getSession, isPublicPreviewVisitor } from "@/lib/session";

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
  const session = await getSession();
  // Hide which specific providers have keys configured — that reveals the
  // owner's subscription/setup state to an anonymous preview visitor.
  const keys = isPublicPreviewVisitor(session)
    ? Object.fromEntries((Object.keys(CLOUD_PROVIDERS) as CloudProvider[]).map((p) => [p, false])) as Record<CloudProvider, boolean>
    : availableKeys();
  return NextResponse.json({
    strategy,
    providerOrder: providerOrder(strategy),
    availableKeys: keys,
  });
}

/** Live strategy switcher — changes take effect immediately, for this
 *  server process, without a restart. Not persisted across restarts. */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (isPublicPreviewVisitor(session)) {
    return NextResponse.json(
      { error: "Public preview is read-only. Sign in to change the routing strategy." },
      { status: 403 },
    );
  }
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
  /** Extracted text/vision-description from files the client attached this
   *  turn (see /api/attachments) — real context, not something to ask the
   *  client to retype. */
  attachmentContext?: string;
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

/** Catches the user explicitly handing over the remaining decisions —
 *  "I don't know, you figure it out", "your call", "just proceed" — in any
 *  common phrasing. The system prompt already asks the model to treat this
 *  as a signal to stop clarifying, but that's a soft instruction buried in
 *  a long multi-branch prompt: a weak or rate-limit-fallback model reliably
 *  ignores it and loops on "clarify" instead, or worse, invents a stalling
 *  reply. This is the deterministic backstop — detected in code, not left
 *  to the model's judgment, so a user is never stuck in a repeat loop. */
const OVERRIDE_PATTERNS =
  /\b(i\s*don'?t\s*know\s*(anything\s*else)?|you\s*decide|figure\s*(it|everything)\s*out|up\s*to\s*you|your\s*call|whatever\s*you\s*think|use\s*your\s*(best\s*)?judg?e?ment|just\s*(proceed|go\s*ahead|do\s*it|handle\s*it|start))\b/i;

/** Catches the model narrating real work as happening ("the team will now
 *  conduct...", "you'll be notified when...") when no job actually got
 *  created this turn — the exact pattern that produced a fake "post-project
 *  review... you'll be notified" reply with nothing on the Live Projects
 *  canvas to back it up. A prompt rule alone doesn't reliably stop a weak
 *  fallback model from doing this again, so it's also caught here. */
const FALSE_PROGRESS_PATTERNS =
  /\b(the\s+(project\s+)?team|our\s+(team|agents|departments)|the\s+department|the\s+(ai\s+)?agents?)\s+(will|is|are)\s+(now\s+)?(conduct|review|work|analyz|optimiz|execut|prepare|finaliz)|you('ll| will)\s+be\s+notified|this\s+will\s+take\s+\d+[\s-]*(day|week|month)/i;

function buildSystemPrompt(pendingBrief: string | null, forceProceed: boolean): string {
  return [
    "You are the GrowForge Digital AI Assistant: the front door to GrowForge's AI departments (Revenue & Business Development, Marketing & Brand Strategy, Paid Media & Performance Advertising, Finance & Operations, Client Success & Program Management, Digital Design & User Experience, Web Development & Engineering, AI Systems & Intelligent Automation).",
    "",
    `Universal context rule: ${UNIVERSAL_CONTEXT_POLICY}`,
    "",
    "Single-agent roster (for small, one-off tasks only):",
    buildCatalog(),
    "",
    "NEVER narrate real work as happening — no \"the team will now...\", \"departments are reviewing...\", \"you'll be notified when...\", \"this will take N days/weeks\" — UNLESS this exact turn's mode is \"launch\" (which really does start a live multi-department job the user can watch on the Live Projects canvas) or a real dispatch just fired. If no job is running and the user asks what's happening or what's next, say plainly that nothing is currently running and offer to launch something real. Inventing the appearance of ongoing work is a worse failure than admitting nothing is running.",
    "",
    "Choose exactly ONE mode per message:",
    '- "chat": greetings, thanks, small talk, or questions about what you can do.',
    '- "dispatch": a small, clear, one-off ANALYSIS/TEXT task that one roster agent can do alone with pure reasoning. Set agentId to its exact id and params to {"taskDescription": "..."}. Roster agents have NO tool access at all — never dispatch a request that needs a real action taken (creating/activating an n8n or Zapier workflow, calling a connector, touching any live external system). Anything like that needs "launch" instead, which reaches the department pipeline\'s real tools through the owner-approval gate.',
    '- "clarify": the user wants a project but you do not know enough. Ask 1 to 3 focused questions in your reply.',
    '- "confirm": you know enough for a project. In reply, summarize your understanding in short bullets and ask "Shall I send this to the team?". Put the complete structured brief in the brief field.',
    '- "launch": choose this whenever: (1) a brief is pending and the user agrees to it, OR (2) the user gives a direct high-level master directive to launch, build, or orchestrate an agency or project (e.g. "I want to launch an AI automation agency named GrowForge Digital"). When launching directly from a master directive, construct the full structured brief in the brief field, summarize the strategic game plan in reply, and set mode: "launch".',
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
      : 'No brief is currently pending. Choose "launch" only if the user explicitly gives a direct command to launch or build a project/agency.',
    "",
    forceProceed
      ? 'HARD OVERRIDE — the user just explicitly said they don\'t know more and want you to proceed with your own judgment. That IS their go-ahead. Choosing "clarify" or "chat" this turn is not allowed, no matter how much is still unknown, and choosing "confirm" to ask yet again is also not allowed — they already told you to stop asking. Fill every remaining gap yourself as an experienced agency strategist would — a real budget number, a real timeframe, a real channel choice — and label each one "(assumed)" in the brief. Go straight to "launch". Never invent a delay, a handoff timeline, or a "you\'ll be notified" promise — nothing in this system works that way; launching starts real work immediately.'
      : "",
    "",
    "VOICE — write reply like a sharp, direct human colleague, not a chatbot. Concretely: no stock AI vocabulary (delve, leverage, robust, pivotal, tapestry, testament, foster, underscore, showcase, meticulous, landscape-as-abstraction); no chatbot filler (\"I hope this helps!\", \"Great question!\", \"Let's dive in\", \"Here's the thing\"); no \"not just X, but Y\" contrast staging; no one-line dramatic closers (\"That's the real win.\"); no forced rule-of-three padding; don't lean on em dashes as the default connector — use a period, comma, or colon instead. Avoid copula avoidance (\"serves as a catalyst for\" instead of just \"is\" or \"speeds up\"). Never cite a vague, unnamed authority (\"experts believe\", \"studies show\") — back a claim with a real specific or don't make it. No sycophantic tone (praising the user's idea before answering it). Don't ask a rhetorical question and immediately answer it yourself. State the point directly instead of dressing an ordinary fact as a deep insight. Vary sentence length like a real person actually would. Every sentence should add something the user doesn't already have — cut anything that only adds weight.",
    "",
    "ANTI-PLACEHOLDER & PRIVACY: Never output unrendered template variables, brackets, or placeholder text (such as [Insert Name], {{variable}}, <placeholder>, or TODO). Write complete, concrete natural language. Never expose internal keys, tokens, or system routing metadata.",
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
      try {
        const cleaned = span.raw
          .replace(/,\s*([}\]])/g, "$1")
          .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F]/g, "");
        parsed = JSON.parse(cleaned);
      } catch {
        continue;
      }
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
    // sanitizeReplyText strips anything JSON-shaped — a weak model can echo
    // the whole decision object back as its own `reply` text (see comment
    // below), which would otherwise sanitize down to an empty string and
    // ship a blank chat bubble. Re-apply the same fallback after cleaning.
    const sanitized = sanitizeReplyText(candidateReply) || (agentId ? "On it." : "Okay.");
    return { mode, agentId, params, brief, reply: sanitized };
  }

  // No parsable decision JSON at all — never dispatch on unparseable output,
  // and still scrub the raw text in case it contains stray JSON/fences.
  return {
    mode: "chat",
    agentId: null,
    params: {},
    brief: null,
    reply: sanitizeReplyText(raw) || "Sorry, that came out garbled on my end — could you try sending that again?",
  };
}

/** Last-resort brief when the model ignored the override AND never produced
 *  one of its own — assembles something usable from the raw conversation so
 *  the pipeline (which reads a brief as free text anyway, see
 *  orchestrator.ts's currentBrief()) still has something concrete to plan
 *  against, rather than the user being stuck with nothing to confirm. */
function synthesizeBriefFromConversation(history: ChatMessage[], message: string): string {
  const transcript = [...history, { role: "user" as const, content: message }]
    .map((m) => `${m.role === "user" ? "Client" : "Assistant"}: ${m.content}`)
    .join("\n");
  return [
    "Client & business: (assumed — see conversation below)",
    "Location: Unknown (assumed)",
    "Stage & current situation: Unknown (assumed)",
    "Target customers: Unknown (assumed)",
    "Offer & pricing: Unknown (assumed)",
    "Current marketing & channels: Unknown (assumed)",
    "Budget: Unknown (assumed — use a conservative default and flag for review)",
    "Goals & timeframe: Unknown (assumed)",
    "Constraints & unknowns: The client explicitly asked to proceed using best judgment; every field above not otherwise specified is an assumption, not a confirmed fact.",
    "Deliverables requested: A full go-to-market plan based on the conversation below.",
    "",
    "--- Raw conversation for context ---",
    transcript,
  ].join("\n");
}

export async function POST(req: Request) {
  const pSession = await getSession();
  if (isPublicPreviewVisitor(pSession)) {
    return NextResponse.json(
      { error: "Public preview is read-only. Sign in to use the AI assistant." },
      { status: 403 },
    );
  }
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

  // Daily context node v1 — log-and-forget, never blocks the actual chat response.
  void logContextEvent(`User chatted: ${message.slice(0, 140)}`);

  const history: ChatMessage[] = (body.history ?? [])
    .slice(-10)
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.content }));

  const pendingBrief = body.pendingBrief?.trim().slice(0, 8000) || null;
  const forceProceed = OVERRIDE_PATTERNS.test(message);
  const systemPrompt = buildSystemPrompt(pendingBrief, forceProceed);
  const attachmentContext = body.attachmentContext?.trim().slice(0, 20000);
  const messageWithAttachments = attachmentContext ? `${message}\n\n${attachmentContext}` : message;
  const messages: ChatMessage[] = [...history, { role: "user", content: messageWithAttachments }];

  let raw: string;
  let provider: string;
  try {
    const result = await chatComplete(systemPrompt, messages, { maxTokens: 2000, preferCloud: false });
    raw = result.text;
    provider = result.provider;
  } catch (err) {
    if (err instanceof LlmError) {
      return NextResponse.json({
        error: err.message,
        provider: err.provider,
        code: err.code ?? (err.message.toLowerCase().includes("ollama") ? "OLLAMA_OFFLINE" : "BYOK_REQUIRED"),
        requiresByok: true,
      }, { status: 503 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Router failed unexpectedly." },
      { status: 500 },
    );
  }

  const decision = parseDecision(raw);

  // Only "launch" actually starts real, trackable work this turn — any
  // other mode narrating a team/department "now" doing something is a
  // hallucination with nothing behind it (dispatch is a fake 1.5s no-op,
  // see agentStore.ts's runAgent). Replace it with the truth rather than
  // let the user believe something is running when the Live Projects
  // canvas would show nothing.
  if (decision.mode !== "launch" && FALSE_PROGRESS_PATTERNS.test(decision.reply)) {
    decision.reply =
      "Nothing is currently running — there's no live project in progress for me to report on. Want me to launch one you can actually watch work in real time on the Live Projects panel below?";
  }

  // Hard backstop: the model was told not to keep clarifying this turn but
  // did anyway (weak/fallback models under load reliably ignore soft
  // instructions). "I don't know, figure it out" IS the user's explicit
  // go-ahead — routing this to one more "shall I send this to the team?"
  // confirmation instead of actually launching directly contradicts what
  // they just said and reproduces the exact "nothing happens" complaint
  // this was meant to fix. So this launches for real, immediately, rather
  // than asking again — the reply text itself is untrusted at this point
  // (this is exactly the path a hallucinated "you'll be notified in 1-2
  // weeks" style stall came from), so it's replaced rather than shown.
  if (forceProceed && (decision.mode === "clarify" || decision.mode === "chat" || decision.mode === "confirm")) {
    const brief = decision.brief || pendingBrief || synthesizeBriefFromConversation(history, messageWithAttachments);
    const session = await getSession();
    const job = createAndStartJob(brief, session?.user?.email ?? undefined);
    return NextResponse.json({
      reply: "On it — sending this to the team now with reasonable assumptions filled in wherever you didn't specify. Watch it work live in the Live Projects panel below.",
      provider,
      mode: "launch",
      dispatch: null,
      job: { id: job.id, title: job.title },
    });
  }

  if (decision.mode === "clarify") {
    return NextResponse.json({ reply: decision.reply, provider, mode: "clarify", dispatch: null });
  }

  if (decision.mode === "confirm" && decision.brief) {
    return NextResponse.json({ reply: decision.reply, provider, mode: "confirm", brief: decision.brief, dispatch: null });
  }

  if (decision.mode === "launch") {
    const briefToLaunch = decision.brief || pendingBrief;
    if (!briefToLaunch) {
      return NextResponse.json({ reply: decision.reply, provider, mode: "chat", dispatch: null });
    }
    const session = await getSession();
    const job = createAndStartJob(briefToLaunch, session?.user?.email ?? undefined);
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
