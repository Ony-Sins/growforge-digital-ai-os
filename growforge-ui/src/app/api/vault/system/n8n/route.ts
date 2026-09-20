import { NextResponse } from "next/server";
import { getSession, isPublicPreviewVisitor } from "@/lib/session";
import { SYSTEM_VAULT_ID } from "@/lib/llm";
import { hasSecret, setSecret, removeSecret, getSecretForServerUse } from "@/lib/serverVault";

/**
 * /api/vault/system/n8n — Secure storage for the n8n Automation Engine
 * integration credentials (N8N_HOST and N8N_API_KEY).
 *
 * Stored in the encrypted vault under SYSTEM_VAULT_ID with keys
 * "integrations:n8n:host" and "integrations:n8n:apikey".
 * The actual secret values are NEVER returned to the client — only
 * boolean configured flags and the stored host (non-secret) are exposed.
 */

const N8N_HOST_KEY = "integrations:n8n:host";
const N8N_APIKEY_KEY = "integrations:n8n:apikey";

const DEFAULT_HOST = process.env.N8N_HOST || "http://localhost:5678";

async function requireAuth() {
  const session = await getSession();
  if (!session?.user) return { ok: false as const, status: 401, error: "Unauthorized." };
  return { ok: true as const, session };
}

/** Returns which credentials are configured (never the values themselves). */
export async function GET() {
  const gate = await requireAuth();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  // The stored host is a real URL (often the owner's private n8n instance
  // address) -- not a secret, but still not something a stranger should see.
  if (isPublicPreviewVisitor(gate.session)) {
    return NextResponse.json({
      host: { value: DEFAULT_HOST, source: "default" },
      apiKey: { configured: false, source: "none" },
    });
  }

  const hostConfigured = hasSecret(SYSTEM_VAULT_ID, N8N_HOST_KEY);
  const apiKeyConfigured = hasSecret(SYSTEM_VAULT_ID, N8N_APIKEY_KEY);

  // Return the stored host value (not secret — it's a URL) so the UI can display it
  const storedHost = hostConfigured
    ? getSecretForServerUse(SYSTEM_VAULT_ID, N8N_HOST_KEY)
    : null;

  const envApiKey = process.env.N8N_API_KEY;
  const envHost = process.env.N8N_HOST;

  return NextResponse.json({
    host: {
      value: storedHost ?? envHost ?? DEFAULT_HOST,
      source: hostConfigured ? "vault" : envHost ? "env" : "default",
    },
    apiKey: {
      configured: apiKeyConfigured || Boolean(envApiKey),
      source: apiKeyConfigured ? "vault" : envApiKey ? "env" : "none",
    },
  });
}

interface N8nConfigBody {
  host?: string;
  apiKey?: string;
}

/** Saves N8N_HOST and/or N8N_API_KEY into the encrypted vault. */
export async function POST(req: Request) {
  const gate = await requireAuth();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (isPublicPreviewVisitor(gate.session)) {
    return NextResponse.json({ error: "Public preview is read-only." }, { status: 403 });
  }

  let body: N8nConfigBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const host = body.host?.trim();
  const apiKey = body.apiKey?.trim();

  if (!host && !apiKey) {
    return NextResponse.json({ error: "At least one of 'host' or 'apiKey' is required." }, { status: 400 });
  }

  if (host) {
    try {
      const parsed = new URL(host);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return NextResponse.json({ error: "Host must be an http:// or https:// URL." }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: "Host must be a valid URL (e.g. http://localhost:5678)." }, { status: 400 });
    }
    try {
      setSecret(SYSTEM_VAULT_ID, N8N_HOST_KEY, host);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to store host." },
        { status: 500 },
      );
    }
  }

  if (apiKey) {
    try {
      setSecret(SYSTEM_VAULT_ID, N8N_APIKEY_KEY, apiKey);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to store API key." },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ ok: true });
}

/** Clears the stored n8n credentials from the vault. */
export async function DELETE() {
  const gate = await requireAuth();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (isPublicPreviewVisitor(gate.session)) {
    return NextResponse.json({ error: "Public preview is read-only." }, { status: 403 });
  }

  removeSecret(SYSTEM_VAULT_ID, N8N_HOST_KEY);
  removeSecret(SYSTEM_VAULT_ID, N8N_APIKEY_KEY);
  return NextResponse.json({ ok: true });
}
