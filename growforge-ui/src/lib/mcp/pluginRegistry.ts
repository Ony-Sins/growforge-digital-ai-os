/**
 * BYO-MCP helpers — tool invocation and 3D Neural Brain topology generation
 * for self-serve-connected MCP servers.
 *
 * Persistence itself lives in mcp/store.ts (the same vault-backed,
 * department-scoped store the curated catalog and custom-server form use —
 * see store.ts's `origin: "byo-mcp"` field). This module used to hold its
 * own separate in-memory Map, which meant every BYO-MCP server vanished on
 * a dev-server restart and its bearer token sat in plain memory instead of
 * the encrypted vault. Consolidated 2026-09-20 so there's exactly one place
 * MCP servers live, regardless of which UI added them.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { BrainLobe } from "@/lib/telemetryStore";
import { getMcpCredential, type McpServerDef, type DetectedMcpTool } from "@/lib/mcp/store";
import { resolveImageKeys } from "@/lib/imageGen";
import { listAiModels } from "@/lib/aiModelStore";
import { isCapabilityActive } from "@/lib/capabilityStore";

export type { DetectedMcpTool };

/** Frontend-facing shape Integrations.tsx renders — kept stable across the
 *  store consolidation so that component needed zero changes. */
export interface CustomMcpPlugin {
  id: string;
  name: string;
  serverUrl: string;
  targetLobe: BrainLobe;
  detectedTools: DetectedMcpTool[];
  status: "connected" | "offline" | "error" | "disconnected" | "archived";
  connectedAt: string;
  lastPing?: string;
  errorMessage?: string;
}

export function toPluginShape(def: McpServerDef): CustomMcpPlugin {
  return {
    id: def.id,
    name: def.name,
    serverUrl: def.url ?? "",
    targetLobe: def.targetLobe ?? "neural_core",
    detectedTools: def.detectedTools ?? [],
    status: def.status ?? "connected",
    connectedAt: def.createdAt,
    lastPing: def.lastPing,
    errorMessage: def.errorMessage,
  };
}

export interface DynamicBrainNode {
  id: string;
  name: string;
  role: string;
  kind: "tendril" | "connector";
  lobe: BrainLobe;
  hemisphere: "center" | "left" | "right";
  position: [number, number, number];
  size: number;
  color: string;
  emissive: string;
  description: string;
  tools: string[];
  pluginId: string;
}

export interface DynamicBrainAxon {
  id: string;
  source: string;
  target: string;
  color: string;
  curveOffset: [number, number, number];
  isDynamic: true;
}

const LOBE_PARENT_MAP: Record<BrainLobe, { parentId: string; center: [number, number, number]; hemisphere: "left" | "right" | "center" }> = {
  neural_core: { parentId: "hq", center: [0, 10, 0], hemisphere: "center" },
  creative_strategy: { parentId: "dept:marketing", center: [-65, 30, 25], hemisphere: "left" },
  growth_expansion: { parentId: "dept:sales-bd", center: [65, 30, 25], hemisphere: "right" },
  analytics_governance: { parentId: "dept:finance-ops", center: [-60, -25, 30], hemisphere: "left" },
  performance_media: { parentId: "dept:meta-ads", center: [60, -20, 35], hemisphere: "right" },
};

/** Invoke a tool on a connected byo-mcp server. Tries SSE first (most
 *  BYO-style MCP servers speak this), falls back to Streamable HTTP —
 *  broader compatibility than mcp/client.ts's catalog path, which is why
 *  this stays a separate function rather than folding into callMcpTool. */
export async function callCustomMcpTool(
  server: McpServerDef,
  toolName: string,
  args: Record<string, unknown>
): Promise<{ ok: boolean; output: string }> {
  if (!server.url) return { ok: false, output: "Server has no URL configured." };
  const urlObj = new URL(server.url);
  const { bearerToken } = getMcpCredential(server.id);
  const headers: Record<string, string> = { "User-Agent": "GrowForge-BYO-MCP/1.0" };
  if (bearerToken) {
    headers["Authorization"] = bearerToken.startsWith("Bearer ") ? bearerToken : `Bearer ${bearerToken}`;
  }

  const extractText = (rawRes: unknown) => {
    const res = rawRes as { content?: unknown; isError?: boolean };
    const contentArr = Array.isArray(res.content) ? res.content : [];
    const texts = contentArr
      .filter((c: unknown) => typeof c === "object" && c !== null && "type" in c && (c as { type: string }).type === "text")
      .map((c: unknown) => (c as { type: "text"; text: string }).text);
    return { ok: !res.isError, output: texts.join("\n") || (res.isError ? "Tool execution failed" : "Tool executed successfully") };
  };

  try {
    const sseTransport = new SSEClientTransport(urlObj, { requestInit: { headers } });
    const client = new Client({ name: "growforge-byo-mcp-invoker", version: "1.0.0" }, { capabilities: {} });
    await client.connect(sseTransport);
    const res = await client.callTool({ name: toolName, arguments: args });
    await client.close().catch(() => {});
    return extractText(res);
  } catch {
    try {
      const httpTransport = new StreamableHTTPClientTransport(urlObj, { requestInit: { headers } });
      const client = new Client({ name: "growforge-byo-mcp-invoker", version: "1.0.0" }, { capabilities: {} });
      await client.connect(httpTransport);
      const res = await client.callTool({ name: toolName, arguments: args });
      await client.close().catch(() => {});
      return extractText(res);
    } catch (err) {
      return {
        ok: false,
        output: `Error invoking custom MCP tool "${toolName}": ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}

/** Dynamic 3D brain nodes/axons for every connected byo-mcp server's
 *  detected tools and every real configured capability key (Higgsfield, BYO AI models).
 *  Zero synthetic/fake data — only real, currently-true configured connections. */
export function generateDynamicTopology(byoMcpServers: McpServerDef[]): { nodes: DynamicBrainNode[]; axons: DynamicBrainAxon[] } {
  const nodes: DynamicBrainNode[] = [];
  const axons: DynamicBrainAxon[] = [];

  // 1. Active BYO-MCP Servers & Discovered Tools
  const active = byoMcpServers.filter(
    (s) =>
      (s.status ?? "connected") === "connected" &&
      s.status !== "disconnected" &&
      s.status !== "archived" &&
      s.detectedTools?.length
  );

  active.forEach((server, pIdx) => {
    const parentInfo = LOBE_PARENT_MAP[server.targetLobe ?? "neural_core"] || LOBE_PARENT_MAP.neural_core;
    const baseCenter = parentInfo.center;
    const tools = server.detectedTools ?? [];

    tools.forEach((tool, tIdx) => {
      const totalTools = tools.length;
      const angle = (tIdx / Math.max(totalTools, 1)) * Math.PI * 2 + pIdx * 0.6;
      const radius = 26 + (tIdx % 2) * 8;

      const posX = baseCenter[0] + Math.cos(angle) * radius;
      const posY = baseCenter[1] + Math.sin(angle) * (radius * 0.75) + ((tIdx % 3) - 1) * 6;
      const posZ = baseCenter[2] + Math.sin(angle * 1.5) * 14;

      const nodeId = `mcp-node:${server.id}:${tool.name}`;

      nodes.push({
        id: nodeId,
        name: tool.name,
        role: `Custom MCP Tool (${server.name})`,
        kind: "tendril",
        lobe: server.targetLobe ?? "neural_core",
        hemisphere: parentInfo.hemisphere,
        position: [posX, posY, posZ],
        size: 4,
        color: "#06b6d4",
        emissive: "#22d3ee",
        description: tool.description || `Dynamic tool discovered on ${server.url}`,
        tools: [tool.name],
        pluginId: server.id,
      });

      axons.push({
        id: `ax-hq-${nodeId}`,
        source: "hq",
        target: nodeId,
        color: "#06b6d4",
        curveOffset: [Math.cos(angle) * 8, Math.sin(angle) * 8, tIdx % 2 === 0 ? 6 : -6],
        isDynamic: true,
      });
    });
  });

  // 2. Real Capability Keys: Higgsfield (Generative Video & Creative Asset Key)
  try {
    const imageKeys = resolveImageKeys();
    if (imageKeys.higgsfieldKey && isCapabilityActive("higgsfield")) {
      const higgsfieldNodeId = "cap:higgsfield";
      nodes.push({
        id: higgsfieldNodeId,
        name: "Higgsfield AI",
        role: "Generative Video & Image Engine",
        kind: "connector",
        lobe: "performance_media",
        hemisphere: "right",
        position: [80, -22, 40],
        size: 5,
        color: "#ec4899",
        emissive: "#f472b6",
        description: `Direct API capability key for AI video and campaign creative generation (${imageKeys.source}).`,
        tools: ["generate_higgsfield_image", "generate_higgsfield_video"],
        pluginId: "higgsfield",
      });

      axons.push({
        id: "ax-hq-cap-higgsfield",
        source: "hq",
        target: higgsfieldNodeId,
        color: "#ec4899",
        curveOffset: [18, -12, 14],
        isDynamic: true,
      });
    }
  } catch {
    // Non-blocking if vault cannot be reached
  }

  // 3. Real Capability Keys: Configured AI Models (OpenAI, Gemini, Claude, Groq, Ollama, Custom)
  try {
    const configuredModels = listAiModels().filter(
      (m) => m.isConfigured && m.status !== "archived" && m.status !== "disconnected"
    );
    configuredModels.forEach((model, mIdx) => {
      const modelLobe: BrainLobe =
        model.taskRole === "image"
          ? "performance_media"
          : model.taskRole === "utility"
            ? "analytics_governance"
            : "neural_core";

      const parentInfo = LOBE_PARENT_MAP[modelLobe] || LOBE_PARENT_MAP.neural_core;
      const angle = (mIdx / Math.max(configuredModels.length, 1)) * Math.PI * 2;
      const radius = 32 + (mIdx % 2) * 10;
      const posX = parentInfo.center[0] + Math.cos(angle) * radius;
      const posY = parentInfo.center[1] + Math.sin(angle) * 14 + 10;
      const posZ = parentInfo.center[2] + Math.sin(angle * 1.5) * 16;

      const providerColors: Record<string, { color: string; emissive: string }> = {
        openai: { color: "#10a37f", emissive: "#34d399" },
        "openai-compatible": { color: "#10a37f", emissive: "#34d399" },
        anthropic: { color: "#d97706", emissive: "#fbbf24" },
        gemini: { color: "#3b82f6", emissive: "#60a5fa" },
        groq: { color: "#f97316", emissive: "#fdba74" },
        ollama: { color: "#8b5cf6", emissive: "#a78bfa" },
        openrouter: { color: "#06b6d4", emissive: "#22d3ee" },
      };

      const colorScheme = providerColors[model.providerType] || { color: "#38bdf8", emissive: "#7dd3fc" };
      const modelNodeId = `cap:model:${model.id}`;

      nodes.push({
        id: modelNodeId,
        name: model.name,
        role: `AI Model Connector (${model.providerType})`,
        kind: "connector",
        lobe: modelLobe,
        hemisphere: parentInfo.hemisphere,
        position: [posX, posY, posZ],
        size: 4.5,
        color: colorScheme.color,
        emissive: colorScheme.emissive,
        description: `Configured ${model.providerType} AI model connector (${model.source} key, ${model.modelName}).`,
        tools: [model.modelName],
        pluginId: model.id,
      });

      axons.push({
        id: `ax-hq-cap-${model.id}`,
        source: "hq",
        target: modelNodeId,
        color: colorScheme.color,
        curveOffset: [Math.cos(angle) * 10, Math.sin(angle) * 8, 8],
        isDynamic: true,
      });
    });
  } catch {
    // Non-blocking if model store cannot be loaded
  }

  return { nodes, axons };
}
