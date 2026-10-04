import { NextResponse } from "next/server";
import { getSession, isBetaOwner, isBetaTester } from "@/lib/session";
import { isBetaMode } from "@/lib/beta/access";
import {
  listTesterProviders,
  saveTesterCredential,
  updateTesterProvider,
  deleteTesterProvider,
  isAllowedByokProvider,
  ALLOWED_BYOK_PROVIDERS,
} from "@/lib/beta/vault";
import { getTester } from "@/lib/beta/store";
import { checkBetaRateLimit } from "@/lib/beta/rate-limit";
import { testProviderCredential, ALLOWED_MODELS, DEFAULT_MODELS } from "@/lib/beta/byok-adapters";

async function gate() {
  if (!isBetaMode()) {
    return { error: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  }
  const session = await getSession();
  if (!isBetaTester(session) && !isBetaOwner(session)) {
    return { error: NextResponse.json({ error: "Unauthorized — sign in required." }, { status: 401 }) };
  }
  if (isBetaTester(session)) {
    const tester = await getTester(session!.user?.email || "");
    if (!tester || tester.status === "frozen") {
      return { error: NextResponse.json({ error: "Account is frozen or unavailable.", code: "tester_frozen" }, { status: 403 }) };
    }
  }
  return { session: session! };
}

/**
 * GET /api/beta/byok
 * List safe summaries of connected providers for the authenticated session.
 */
export async function GET() {
  const g = await gate();
  if (g.error) return g.error;

  const email = g.session.user?.email;
  if (!email) {
    return NextResponse.json({ error: "Authenticated session has no email." }, { status: 400 });
  }

  try {
    const providers = await listTesterProviders(email);
    return NextResponse.json({
      providers,
      allowedProviders: ALLOWED_BYOK_PROVIDERS,
      allowedModels: ALLOWED_MODELS,
      defaultModels: DEFAULT_MODELS,
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to retrieve provider vault." }, { status: 500 });
  }
}

/**
 * POST /api/beta/byok
 * Connect or replace an encrypted provider credential.
 */
export async function POST(req: Request) {
  const g = await gate();
  if (g.error) return g.error;

  const email = g.session.user?.email;
  if (!email) {
    return NextResponse.json({ error: "Authenticated session has no email." }, { status: 400 });
  }

  // Rate limit credential save / replace operations
  const rl = await checkBetaRateLimit(email, "byok_save");
  if (!rl.allowed && rl.errorResponse) {
    return rl.errorResponse;
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const { provider, apiKey, selectedModel, test } = body || {};

  if (!provider || typeof provider !== "string" || !isAllowedByokProvider(provider)) {
    return NextResponse.json(
      { error: `Invalid or unsupported provider. Allowed: ${ALLOWED_BYOK_PROVIDERS.join(", ")}` },
      { status: 400 }
    );
  }

  if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
    return NextResponse.json({ error: "apiKey is required and must be non-empty." }, { status: 400 });
  }

  const cleanKey = apiKey.trim();

  // Optional pre-save live test
  if (test === true) {
    const testRes = await testProviderCredential(provider, cleanKey);
    if (!testRes.valid) {
      return NextResponse.json(
        { error: testRes.error || "Credential validation failed against provider endpoint." },
        { status: 400 }
      );
    }
  }

  try {
    const saved = await saveTesterCredential(email, provider, cleanKey, selectedModel);
    return NextResponse.json({ success: true, provider: saved });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to securely save credential." }, { status: 500 });
  }
}

/**
 * PATCH /api/beta/byok
 * Enable/disable provider or update selected model.
 */
export async function PATCH(req: Request) {
  const g = await gate();
  if (g.error) return g.error;

  const email = g.session.user?.email;
  if (!email) {
    return NextResponse.json({ error: "Authenticated session has no email." }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const { provider, enabled, selectedModel } = body || {};
  if (!provider || typeof provider !== "string" || !isAllowedByokProvider(provider)) {
    return NextResponse.json(
      { error: `Invalid or unsupported provider. Allowed: ${ALLOWED_BYOK_PROVIDERS.join(", ")}` },
      { status: 400 }
    );
  }

  const updates: { enabled?: boolean; selectedModel?: string } = {};
  if (typeof enabled === "boolean") updates.enabled = enabled;
  if (typeof selectedModel === "string") updates.selectedModel = selectedModel;

  try {
    const updated = await updateTesterProvider(email, provider, updates);
    if (!updated) {
      return NextResponse.json({ error: `Provider ${provider} is not connected.` }, { status: 404 });
    }
    return NextResponse.json({ success: true, provider: updated });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to update provider." }, { status: 500 });
  }
}

/**
 * DELETE /api/beta/byok
 * Delete an encrypted provider credential from the tester's vault.
 */
export async function DELETE(req: Request) {
  const g = await gate();
  if (g.error) return g.error;

  const email = g.session.user?.email;
  if (!email) {
    return NextResponse.json({ error: "Authenticated session has no email." }, { status: 400 });
  }

  let provider: string | null = null;
  const url = new URL(req.url);
  provider = url.searchParams.get("provider");

  if (!provider) {
    try {
      const body = await req.json();
      provider = body?.provider;
    } catch {}
  }

  if (!provider || typeof provider !== "string" || !isAllowedByokProvider(provider)) {
    return NextResponse.json(
      { error: `Invalid or unsupported provider. Allowed: ${ALLOWED_BYOK_PROVIDERS.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const deleted = await deleteTesterProvider(email, provider);
    return NextResponse.json({ success: true, deleted, provider });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to delete provider credential." }, { status: 500 });
  }
}
