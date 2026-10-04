import { NextResponse } from "next/server";
import { executeHeadlessTurn, validateLoopbackSecret, type NoraHeadlessRequest } from "@/lib/noraHeadless";
import { localVoiceAllowed } from "@/lib/localVoiceServer";
import { getSession } from "@/lib/session";
import { voiceSessionContext } from "@/lib/voiceSessionContext";
import { readExplicitUserMemory } from "@/lib/userMemory";

export const runtime = "nodejs";

export async function POST(req: Request) {
  // Loopback authentication check
  const authHeader = req.headers.get("X-GrowForge-Internal-Key") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  
  if (!await localVoiceAllowed(req) || !validateLoopbackSecret(authHeader ?? null)) {
    return NextResponse.json({ error: "Unauthorized loopback request." }, { status: 401 });
  }

  try {
    const body: NoraHeadlessRequest = await req.json();
    const email = (await getSession())?.user?.email;
    if (!email) return NextResponse.json({ error: "Authenticated identity required" }, { status: 401 });
    const context = voiceSessionContext(email, body.conversationId || "");
    if (typeof body.attachmentContext === "string") context.surface = body.attachmentContext.slice(0, 10000);
    if (body.assistantName) context.identity = body.assistantName.slice(0, 60);
    const generation = ++context.generation;
    const input = { ...body, authenticatedUserEmail: email,
      assistantName: context.identity, history: [...context.history],
      isFirstTurnInSession: context.history.length === 0,
      attachmentContext: context.surface, approvedUserMemory: readExplicitUserMemory(email), onTextDelta: undefined };
    const remember = (reply: string) => {
      if (context.generation !== generation || req.signal.aborted) return;
      context.history.push({ role: "user", content: body.message.slice(0, 4000) }, { role: "assistant", content: reply.slice(0, 12000) });
      context.history = context.history.slice(-24);
    };
    if (req.headers.get("accept") === "application/x-ndjson") {
      const encoder = new TextEncoder();
      let disconnected = false;
      const stream = new ReadableStream({
        start(controller) {
          const send = (event: unknown) => { if (!disconnected) controller.enqueue(encoder.encode(JSON.stringify(event)+"\n")); };
          void executeHeadlessTurn({ ...input, onTextDelta: (text) => send({ type: "delta", text, at: Date.now()/1000 }) })
            .then(result => { if (!disconnected && result.status === "ok") remember(result.reply); send({ type: "result", result, at: Date.now()/1000 }); })
            .catch(() => send({ type: "error", error: "NORA_STREAM_FAILED" }))
            .finally(() => { if (!disconnected) controller.close(); });
        },
        cancel() { disconnected = true; },
      });
      return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
    }
    const result = await executeHeadlessTurn(input);
    if (result.status === "ok") remember(result.reply);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Invalid request body";
    return NextResponse.json({ error: msg, status: "error" }, { status: 400 });
  }
}
