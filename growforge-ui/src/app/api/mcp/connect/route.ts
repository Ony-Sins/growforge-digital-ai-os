import { NextResponse } from "next/server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getSession } from "@/lib/session";
import {
  createMcpServer,
  updateMcpServerDetails,
  deleteMcpServer,
  findMcpServerByUrl,
  getMcpServer,
  listMcpServersByOrigin,
  type DetectedMcpTool,
} from "@/lib/mcp/store";
import { callCustomMcpTool, generateDynamicTopology, toPluginShape } from "@/lib/mcp/pluginRegistry";
import { isSafeOutboundUrl, scrubSecrets } from "@/lib/security/toolBroker";
import { telemetryStore, type BrainLobe } from "@/lib/telemetryStore";

export const runtime = "nodejs";

async function requireAuth() {
  const session = await getSession();
  if (!session?.user) return { ok: false as const, status: 401, error: "Unauthorized." };
  return { ok: true as const };
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

async function connectAndDiscoverTools(serverUrl: string, apiKey?: string): Promise<DetectedMcpTool[]> {
  const urlObj = new URL(serverUrl);
  const headers: Record<string, string> = {
    "User-Agent": "GrowForge-BYO-MCP/1.0",
  };
  if (apiKey) {
    headers["Authorization"] = apiKey.startsWith("Bearer ") ? apiKey : `Bearer ${apiKey}`;
  }

  let sseError: Error | null = null;

  // 1. Attempt connection via standard SSEClientTransport
  try {
    const sseTransport = new SSEClientTransport(urlObj, {
      requestInit: { headers },
    });
    const client = new Client({ name: "growforge-byo-mcp", version: "1.0.0" }, { capabilities: {} });

    const runDiscovery = async () => {
      await client.connect(sseTransport);
      const res = await client.listTools();
      await client.close().catch(() => {});
      return (res.tools || []).map((t) => ({
        name: t.name,
        description: t.description || "",
        inputSchema: t.inputSchema,
      }));
    };

    return await withTimeout(runDiscovery(), 8000, `SSE probe to ${serverUrl}`);
  } catch (err) {
    sseError = err instanceof Error ? err : new Error(String(err));
  }

  // 2. Fallback: StreamableHTTPClientTransport (for direct streaming HTTP MCP endpoints)
  try {
    const httpTransport = new StreamableHTTPClientTransport(urlObj, {
      requestInit: { headers },
    });
    const client = new Client({ name: "growforge-byo-mcp", version: "1.0.0" }, { capabilities: {} });

    const runDiscovery = async () => {
      await client.connect(httpTransport);
      const res = await client.listTools();
      await client.close().catch(() => {});
      return (res.tools || []).map((t) => ({
        name: t.name,
        description: t.description || "",
        inputSchema: t.inputSchema,
      }));
    };

    return await withTimeout(runDiscovery(), 8000, `HTTP stream probe to ${serverUrl}`);
  } catch (httpErr) {
    throw new Error(
      `Failed to connect to MCP server at "${serverUrl}". SSE error: ${sseError?.message}; HTTP error: ${
        httpErr instanceof Error ? httpErr.message : String(httpErr)
      }`
    );
  }
}

/**
 * Business logic behind GET/POST/DELETE, split out from the auth-gated route
 * handlers below so it can be called directly — by the route handlers after
 * they've checked the session, and by scripts/test-mcp-gemini-e2e.ts, which
 * invokes route logic outside a real Next.js request (where next/headers'
 * request-scoped APIs, which getSession() relies on, aren't available).
 * The auth boundary itself (requireAuth) is intentionally NOT exercised by
 * that test — it's a one-line session check, not business logic worth
 * duplicating a real HTTP+cookies test harness for.
 */

export function handleListByoMcp() {
  const servers = listMcpServersByOrigin("byo-mcp");
  const topology = generateDynamicTopology(servers);
  return NextResponse.json({
    ok: true,
    plugins: servers.map(toPluginShape),
    topology,
  });
}

export async function handleConnectByoMcp(req: Request) {
  try {
    const body = await req.json();
    const { name, serverUrl, apiKey, targetLobe = "neural_core" } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json({ ok: false, error: "Server name is required." }, { status: 400 });
    }

    if (!serverUrl || typeof serverUrl !== "string") {
      return NextResponse.json({ ok: false, error: "Server endpoint URL is required." }, { status: 400 });
    }

    // SSRF & Outbound security check (allow localhost for local developer MCP servers)
    const safety = isSafeOutboundUrl(serverUrl, true);
    if (!safety.safe) {
      return NextResponse.json(
        { ok: false, error: `Security check failed: ${safety.reason}` },
        { status: 400 }
      );
    }

    const validLobe: BrainLobe = [
      "neural_core",
      "creative_strategy",
      "growth_expansion",
      "analytics_governance",
      "performance_media",
    ].includes(targetLobe)
      ? (targetLobe as BrainLobe)
      : "neural_core";

    // 1. Probe & auto-detect tools
    const detectedTools = await connectAndDiscoverTools(serverUrl, apiKey);

    // 2. Persist to the shared MCP store (vault-encrypted bearer token,
    //    survives a dev-server/pm2 restart) — update in place on reconnect.
    const trimmedUrl = serverUrl.trim();
    const existing = findMcpServerByUrl(trimmedUrl, "byo-mcp");
    const def = existing
      ? updateMcpServerDetails(existing.id, {
          name: name.trim(),
          url: trimmedUrl,
          bearerToken: apiKey?.trim() || undefined,
          targetLobe: validLobe,
          detectedTools,
          status: "connected",
        })!
      : await createMcpServer({
          name: name.trim(),
          transport: "http",
          url: trimmedUrl,
          bearerToken: apiKey?.trim() || undefined,
          allowedDepartments: [],
          origin: "byo-mcp",
          targetLobe: validLobe,
          detectedTools,
          status: "connected",
        });

    // 3. Emit real-time telemetry so target brain lobe and somas light up
    telemetryStore.setExecutionState("processing", { nodeId: `mcp:${def.id}` });
    telemetryStore.emitEvent({
      type: "tool_invoked",
      lobe: validLobe,
      nodeId: `mcp:${def.id}`,
      label: `BYO-MCP Registered: ${def.name}`,
      details: `Discovered ${detectedTools.length} tools (${detectedTools.map((t) => t.name).slice(0, 3).join(", ")}${
        detectedTools.length > 3 ? "..." : ""
      })`,
    });

    // Reset back to idle shortly after animation
    setTimeout(() => {
      telemetryStore.setExecutionState("idle");
    }, 1200);

    const topology = generateDynamicTopology(listMcpServersByOrigin("byo-mcp"));

    return NextResponse.json({
      ok: true,
      plugin: toPluginShape(def),
      detectedTools,
      topology,
    });
  } catch (err) {
    const errorMsg = scrubSecrets(err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: errorMsg }, { status: 500 });
  }
}

export function handleDisconnectByoMcp(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ ok: false, error: "Plugin id is required." }, { status: 400 });
  }

  // Scope this endpoint to only the byo-mcp entries it owns — without this
  // check, any id (including a catalog or custom-server entry from a
  // different origin) could be deleted through this route.
  const existing = getMcpServer(id);
  if (!existing || existing.origin !== "byo-mcp") {
    return NextResponse.json({ ok: false, error: "Plugin not found." }, { status: 404 });
  }

  deleteMcpServer(id);
  const topology = generateDynamicTopology(listMcpServersByOrigin("byo-mcp"));

  return NextResponse.json({
    ok: true,
    topology,
  });
}

/** GET: list every byo-mcp server and the dynamic 3D brain topology generated from them. */
export async function GET() {
  const gate = await requireAuth();
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  return handleListByoMcp();
}

/** POST: connect to a custom MCP server, discover its tools, and persist it
 *  in the shared mcp/store.ts (vault-encrypted credential, survives
 *  restarts). Re-posting the same URL updates that entry in place. */
export async function POST(req: Request) {
  const gate = await requireAuth();
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  return handleConnectByoMcp(req);
}

/** DELETE: unregister a byo-mcp server (also clears its vault credential). */
export async function DELETE(req: Request) {
  const gate = await requireAuth();
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  return handleDisconnectByoMcp(req);
}

export { callCustomMcpTool };
