import { NextResponse } from "next/server";
import { getSession, isPublicPreviewVisitor } from "@/lib/session";
import { SYSTEM_VAULT_ID } from "@/lib/llm";
import { getSecretForServerUse } from "@/lib/serverVault";

/**
 * /api/vault/system/n8n/health — Server-side n8n connectivity probe.
 *
 * Reads N8N_HOST from the encrypted vault (falling back to env, then the
 * default localhost URL), then pings {host}/healthz with a 4-second
 * timeout. Returns { status: "connected" | "offline", latencyMs }.
 *
 * The API key is not sent to /healthz (n8n doesn't require it there) —
 * this route purely checks reachability so the Settings UI can show a
 * live badge without ever touching key material on the client.
 */

const N8N_HOST_KEY = "integrations:n8n:host";
const DEFAULT_HOST = "http://127.0.0.1:5678";
const PROBE_TIMEOUT_MS = 4000;

export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  // Reveals the owner's real n8n host URL and triggers a real outbound
  // probe -- not for a public-preview visitor.
  if (isPublicPreviewVisitor(session)) {
    return NextResponse.json({ status: "offline", latencyMs: 0, host: DEFAULT_HOST, detail: "Public preview." });
  }

  // Resolve the host: vault → env → default
  const vaultHost = getSecretForServerUse(SYSTEM_VAULT_ID, N8N_HOST_KEY);
  const host = (vaultHost || process.env.N8N_HOST || DEFAULT_HOST).replace(/\/$/, "");

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

    const res = await fetch(`${host}/healthz`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    }).finally(() => clearTimeout(timer));

    const latencyMs = Date.now() - start;

    if (res.ok) {
      return NextResponse.json({ status: "connected", latencyMs, host });
    }

    return NextResponse.json({
      status: "offline",
      latencyMs,
      host,
      detail: `n8n returned HTTP ${res.status}`,
    });
  } catch (err) {
    const latencyMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      status: "offline",
      latencyMs,
      host,
      detail: msg.includes("aborted") ? "Probe timed out after 4s" : msg,
    });
  }
}
