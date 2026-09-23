import { NextResponse } from "next/server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getSession, isPublicPreviewVisitor } from "@/lib/session";
import {
  createMcpServer,
  updateMcpServerDetails,
  archiveMcpServer,
  deleteMcpServer,
  findMcpServerByUrl,
  getMcpServer,
  listMcpServers,
  listMcpServersByOrigin,
  type DetectedMcpTool,
} from "@/lib/mcp/store";
import { callCustomMcpTool, generateDynamicTopology, toPluginShape } from "@/lib/mcp/pluginRegistry";
import { isSafeOutboundUrl, scrubSecrets } from "@/lib/security/toolBroker";
import { telemetryStore, type BrainLobe } from "@/lib/telemetryStore";
import { logContextEvent } from "@/lib/spatial/dailyContext";

export const runtime = "nodejs";

async function requireAuth() {
  const session = await getSession();
  if (!session?.user) return { ok: false as const, status: 401, error: "Unauthorized." };
  return { ok: true as const, session };
}

/** Empty topology shape for a public-preview visitor. Deliberately a hardcoded
 *  literal, NOT a call to generateDynamicTopology([]) — that function reads
 *  the owner's real vault (resolveImageKeys) and real AI model config
 *  (listAiModels) unconditionally, regardless of the byoMcpServers argument,
 *  so calling it here would leak the owner's real Higgsfield/AI-provider
 *  nodes to a preview visitor even with an empty server list. Found and
 *  fixed 2026-09-21 while auditing the capability-key node fix that
 *  introduced this — same class of bug as items 42-51, caught before it
 *  reached a real incognito test. */
function emptyByoMcpResponse() {
  return { ok: true, plugins: [], topology: { nodes: [], axons: [] } };
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
  // Topology must reflect every connected server, not only ones added
  // through this BYO-MCP route — catalog-connected servers (Notion, HubSpot,
  // Apollo.io, GitHub, Vercel, etc.) have no `origin` field at all and were
  // being silently excluded from generateDynamicTopology()'s input, so none
  // of them ever appeared as brain nodes regardless of how many tools they'd
  // discovered. Confirmed live: all 5 of the account's real connected
  // servers had origin === undefined. `plugins` stays BYO-scoped since it
  // powers a BYO-specific list elsewhere; only the topology feed is broadened.
  const topology = generateDynamicTopology(listMcpServers());
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

    void logContextEvent(`Connected MCP server: ${def.name}`);

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

    const topology = generateDynamicTopology(listMcpServers());

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

export async function handleDisconnectByoMcp(req: Request) {
  const url = new URL(req.url);
  let id = url.searchParams.get("id");
  let keepOnFile = url.searchParams.get("keepOnFile") === "true";

  if (!id) {
    try {
      const body = await req.json();
      if (body?.id) {
        id = body.id;
        if (typeof body.keepOnFile === "boolean") keepOnFile = body.keepOnFile;
      }
    } catch {
      // ignore
    }
  }

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

  if (keepOnFile) {
    archiveMcpServer(id);
  } else {
    deleteMcpServer(id);
  }

  const topology = generateDynamicTopology(listMcpServers());

  return NextResponse.json({
    ok: true,
    archived: keepOnFile,
    topology,
  });
}

/** GET: list every byo-mcp server and the dynamic 3D brain topology generated from them.
 *  A public-preview visitor must never see the owner's real connected servers
 *  here — this is the exact data NeuralBrainCanvas.tsx renders as live nodes,
 *  and this route was missed by the earlier isPublicPreviewVisitor sweep
 *  (state.md items 42/44/45) since it's a separate file from /api/mcp. */
export async function GET() {
  const gate = await requireAuth();
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  if (isPublicPreviewVisitor(gate.session)) {
    return NextResponse.json(emptyByoMcpResponse());
  }
  return handleListByoMcp();
}

/** POST: connect to a custom MCP server, discover its tools, and persist it
 *  in the shared mcp/store.ts (vault-encrypted credential, survives
 *  restarts). Re-posting the same URL updates that entry in place. */
export async function POST(req: Request) {
  const gate = await requireAuth();
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  if (isPublicPreviewVisitor(gate.session)) {
    return NextResponse.json(
      { ok: false, error: "Public preview is read-only. Sign in to connect a server." },
      { status: 403 }
    );
  }
  return handleConnectByoMcp(req);
}

/** DELETE: unregister a byo-mcp server (also clears its vault credential). */
export async function DELETE(req: Request) {
  const gate = await requireAuth();
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  if (isPublicPreviewVisitor(gate.session)) {
    return NextResponse.json(
      { ok: false, error: "Public preview is read-only. Sign in to remove a server." },
      { status: 403 }
    );
  }
  return handleDisconnectByoMcp(req);
}

export { callCustomMcpTool };
