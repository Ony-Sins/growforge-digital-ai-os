import { NextResponse } from "next/server";
import { getSession, isBetaOwner, isBetaTester } from "@/lib/session";
import { isBetaMode } from "@/lib/beta/access";
import {
  getTesterEncryptedRecord,
  decryptCredential,
  touchTesterProvider,
  isAllowedByokProvider,
  ALLOWED_BYOK_PROVIDERS,
} from "@/lib/beta/vault";
import { getTester } from "@/lib/beta/store";
import { checkBetaRateLimit } from "@/lib/beta/rate-limit";
import { testProviderCredential } from "@/lib/beta/byok-adapters";

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
 * POST /api/beta/byok/test
 * Test a provider key: either a newly supplied raw apiKey or the tester's stored encrypted credential.
 */
export async function POST(req: Request) {
  const g = await gate();
  if (g.error) return g.error;

  const email = g.session.user?.email;
  if (!email) {
    return NextResponse.json({ error: "Authenticated session has no email." }, { status: 400 });
  }

  // Rate limit key testing operations
  const rl = await checkBetaRateLimit(email, "byok_test");
  if (!rl.allowed && rl.errorResponse) {
    return rl.errorResponse;
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const { provider, apiKey } = body || {};

  if (!provider || typeof provider !== "string" || !isAllowedByokProvider(provider)) {
    return NextResponse.json(
      { error: `Invalid or unsupported provider. Allowed: ${ALLOWED_BYOK_PROVIDERS.join(", ")}` },
      { status: 400 }
    );
  }

  let keyToTest: string | null = null;
  let isStored = false;

  if (typeof apiKey === "string" && apiKey.trim()) {
    keyToTest = apiKey.trim();
  } else {
    // Lookup stored credential
    const stored = await getTesterEncryptedRecord(email, provider);
    if (!stored) {
      return NextResponse.json(
        { error: `No stored credential found for provider ${provider}.` },
        { status: 404 }
      );
    }
    try {
      keyToTest = await decryptCredential(stored);
      isStored = true;
    } catch (err) {
      return NextResponse.json(
        { error: "Failed to decrypt stored credential for testing." },
        { status: 500 }
      );
    }
  }

  const result = await testProviderCredential(provider, keyToTest);

  if (result.valid && isStored) {
    await touchTesterProvider(email, provider, "lastTestedAt");
  }

  return NextResponse.json({
    valid: result.valid,
    error: result.error,
    provider,
    testedAt: new Date().toISOString(),
  });
}
