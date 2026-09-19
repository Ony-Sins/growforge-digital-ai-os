import { NextResponse } from "next/server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { pluginRegistry, type DetectedMcpTool } from "@/lib/mcp/pluginRegistry";
import { isSafeOutboundUrl, scrubSecrets } from "@/lib/security/toolBroker";
import { telemetryStore, type BrainLobe } from "@/lib/telemetryStore";

export const runtime = "nodejs";

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
 * GET: Retrieve all registered BYO-MCP plugins and dynamic topology.
 */
export async function GET() {
  const plugins = pluginRegistry.list();
  const topology = pluginRegistry.generateDynamicTopology();
  return NextResponse.json({
    ok: true,
    plugins,
    topology,
  });
}

/**
 * POST: Connect to a custom MCP server, discover its tools, and register it.
 */
export async function POST(req: Request) {
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

    // 2. Persist in BYO-MCP registry
    const plugin = pluginRegistry.save({
      name: name.trim(),
      serverUrl: serverUrl.trim(),
      apiKey: apiKey ? scrubSecrets(apiKey) : undefined,
      targetLobe: validLobe,
      detectedTools,
      status: "connected",
    });

    // 3. Emit real-time telemetry so target brain lobe and somas light up
    telemetryStore.setExecutionState("processing", { nodeId: `mcp:${plugin.id}` });
    telemetryStore.emitEvent({
      type: "tool_invoked",
      lobe: validLobe,
      nodeId: `mcp:${plugin.id}`,
      label: `BYO-MCP Registered: ${plugin.name}`,
      details: `Discovered ${detectedTools.length} tools (${detectedTools.map((t) => t.name).slice(0, 3).join(", ")}${
        detectedTools.length > 3 ? "..." : ""
      })`,
    });

    // Reset back to idle shortly after animation
    setTimeout(() => {
      telemetryStore.setExecutionState("idle");
    }, 1200);

    const topology = pluginRegistry.generateDynamicTopology();

    return NextResponse.json({
      ok: true,
      plugin,
      detectedTools,
      topology,
    });
  } catch (err) {
    const errorMsg = scrubSecrets(err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: errorMsg }, { status: 500 });
  }
}

/**
 * DELETE: Unregister a custom MCP plugin.
 */
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ ok: false, error: "Plugin id is required." }, { status: 400 });
  }

  const deleted = pluginRegistry.delete(id);
  const topology = pluginRegistry.generateDynamicTopology();

  return NextResponse.json({
    ok: deleted,
    topology,
  });
}
