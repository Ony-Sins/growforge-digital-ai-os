import { NextResponse } from "next/server";
import { getSession, isBetaOwner, isBetaTester } from "@/lib/session";
import { isBetaMode } from "@/lib/beta/access";
import { appendConversation, getTester } from "@/lib/beta/store";
import { demoNoraReply } from "@/lib/beta/demoNora";
import {
  listTesterProviders,
  getTesterEncryptedRecord,
  decryptCredential,
  touchTesterProvider,
  ByokProvider,
} from "@/lib/beta/vault";
import { executeByokCompletion } from "@/lib/beta/byok-adapters";
import { checkBetaRateLimit } from "@/lib/beta/rate-limit";

/**
 * Private-beta NORA endpoint.
 * Supports:
 * 1. Sandbox Mode (default): zero-cost deterministic / safe NORA mock.
 * 2. Live AI Mode (opt-in): strictly uses authenticated tester's enabled BYOK provider.
 */

async function gate() {
  if (!isBetaMode()) return { error: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  const session = await getSession();
  if (!isBetaTester(session) && !isBetaOwner(session)) {
    return { error: NextResponse.json({ error: "Unauthorized — sign in required." }, { status: 401 }) };
  }
  return { session: session! };
}

export async function GET() {
  const g = await gate();
  if (g.error) return g.error;

  const email = g.session.user?.email || "";
  let enabledProviders: string[] = [];
  try {
    const list = await listTesterProviders(email);
    enabledProviders = list.filter((p) => p.enabled).map((p) => p.provider);
  } catch {}

  return NextResponse.json({
    strategy: "byok",
    supportedModes: ["sandbox", "live"],
    enabledProviders,
    hasLiveCapability: enabledProviders.length > 0,
    demo: false,
  });
}

export async function POST(req: Request) {
  const g = await gate();
  if (g.error) return g.error;

  const email = g.session.user?.email;
  if (!email) {
    return NextResponse.json({ error: "Authenticated session has no email." }, { status: 400 });
  }

  // Ensure tester is not frozen
  if (isBetaTester(g.session)) {
    const tester = await getTester(email);
    if (!tester || tester.status === "frozen") {
      return NextResponse.json({ error: "Account is frozen or unavailable.", code: "tester_frozen" }, { status: 403 });
    }
  }

  // Enforce per-tester chat rate limit
  const rl = await checkBetaRateLimit(email, "chat");
  if (!rl.allowed && rl.errorResponse) {
    return rl.errorResponse;
  }

  let message = "";
  let mode: "sandbox" | "live" = "sandbox";
  let explicitDemo = false;
  let requestedProvider: ByokProvider | undefined;
  let requestedModel: string | undefined;

  try {
    const body = (await req.json()) as {
      message?: unknown;
      mode?: unknown;
      demo?: unknown;
      provider?: unknown;
      model?: unknown;
    };
    message = typeof body.message === "string" ? body.message.slice(0, 2000) : "";
    if (body.mode === "live") mode = "live";
    if (body.demo === true) explicitDemo = true;
    if (typeof body.provider === "string") requestedProvider = body.provider as ByokProvider;
    if (typeof body.model === "string") requestedModel = body.model;
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  if (!message.trim()) return NextResponse.json({ error: "message is required." }, { status: 400 });

  const url = new URL(req.url);
  const referer = req.headers.get("referer") || "";
  const isDemo = explicitDemo || url.searchParams.get("demo") === "true" || referer.includes("demo=true");

  // -------------------------------------------------------------------------------------------
  // LIVE AI MODE: strictly uses tester's BYOK credentials
  // -------------------------------------------------------------------------------------------
  if (mode === "live") {
    const allProviders = await listTesterProviders(email);
    const enabledList = allProviders.filter((p) => p.enabled);

    if (enabledList.length === 0) {
      return NextResponse.json(
        {
          error:
            "Live AI Mode requires an enabled BYOK provider. Please connect and enable an API key (OpenAI, Anthropic, Gemini, Groq, OpenRouter) in settings.",
          code: "byok_provider_required",
          mode: "live",
        },
        { status: 400 }
      );
    }

    let targetSummary = enabledList.find((p) => p.provider === requestedProvider);
    if (!targetSummary) {
      targetSummary = enabledList[0];
    }

    const encRecord = await getTesterEncryptedRecord(email, targetSummary.provider);
    if (!encRecord) {
      return NextResponse.json(
        { error: `Provider ${targetSummary.provider} credential not found in vault.` },
        { status: 500 }
      );
    }

    let decryptedKey: string;
    try {
      decryptedKey = await decryptCredential(encRecord);
    } catch {
      return NextResponse.json({ error: "Failed to decrypt provider credentials." }, { status: 500 });
    }

    let execResult;
    try {
      execResult = await executeByokCompletion(targetSummary.provider, decryptedKey, message, {
        model: requestedModel || encRecord.selectedModel,
        timeoutMs: 20000,
        maxTokens: 1024,
      });
      await touchTesterProvider(email, targetSummary.provider, "lastUsedAt");
    } catch (err: any) {
      return NextResponse.json(
        {
          error: err?.message || "Live provider execution failed.",
          provider: targetSummary.provider,
          code: "provider_execution_error",
        },
        { status: 502 }
      );
    }

    if (isBetaTester(g.session)) {
      const at = new Date().toISOString();
      await appendConversation(email, [
        { role: "user", content: message, at },
        { role: "assistant", content: execResult.reply, at },
      ]);
    }

    return NextResponse.json({
      reply: execResult.reply,
      provider: execResult.provider,
      model: execResult.model,
      mode: "live",
      fallbackOccurred: false,
      media: [],
      dispatch: null,
    });
  }

  // -------------------------------------------------------------------------------------------
  // SANDBOX MODE (Default): Safe deterministic / mock NORA with zero paid execution
  // -------------------------------------------------------------------------------------------
  const reply = demoNoraReply(message, isDemo);
  if (isBetaTester(g.session)) {
    const at = new Date().toISOString();
    await appendConversation(email, [
      { role: "user", content: message, at },
      { role: "assistant", content: reply, at },
    ]);
  }

  return NextResponse.json({
    reply,
    provider: isDemo ? "Demo" : "NORA",
    model: isDemo ? "nora-demo" : "nora-beta",
    mode: "sandbox",
    fallbackOccurred: false,
    media: [],
    dispatch: null,
  });
}
