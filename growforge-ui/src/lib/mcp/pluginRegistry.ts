/**
 * Dynamic "BYO-MCP" Plugin Registry
 *
 * Manages runtime custom MCP server registrations, detected tools,
 * dynamic tool dispatch, and dynamic 3D Neural Brain node/axon topology generation.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { BrainLobe } from "@/lib/telemetryStore";

export interface DetectedMcpTool {
  name: string;
  description: string;
  inputSchema?: unknown;
}

export interface CustomMcpPlugin {
  id: string;
  name: string;
  serverUrl: string;
  apiKey?: string;
  targetLobe: BrainLobe;
  detectedTools: DetectedMcpTool[];
  status: "connected" | "offline" | "error";
  connectedAt: string;
  lastPing?: string;
  errorMessage?: string;
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

/**
 * Invoke a tool on a registered BYO-MCP custom server.
 */
export async function callCustomMcpTool(
  plugin: CustomMcpPlugin,
  toolName: string,
  args: Record<string, unknown>
): Promise<{ ok: boolean; output: string }> {
  const urlObj = new URL(plugin.serverUrl);
  const headers: Record<string, string> = {
    "User-Agent": "GrowForge-BYO-MCP/1.0",
  };
  if (plugin.apiKey) {
    headers["Authorization"] = plugin.apiKey.startsWith("Bearer ") ? plugin.apiKey : `Bearer ${plugin.apiKey}`;
  }

  // 1. Try SSEClientTransport
  try {
    const sseTransport = new SSEClientTransport(urlObj, {
      requestInit: { headers },
    });
    const client = new Client({ name: "growforge-byo-mcp-invoker", version: "1.0.0" }, { capabilities: {} });
    await client.connect(sseTransport);
    const res = await client.callTool({ name: toolName, arguments: args });
    await client.close().catch(() => {});

    const contentArr = Array.isArray(res.content) ? res.content : [];
    const texts = contentArr
      .filter((c: unknown) => typeof c === "object" && c !== null && "type" in c && (c as { type: string }).type === "text")
      .map((c: unknown) => (c as { type: "text"; text: string }).text);

    return {
      ok: !res.isError,
      output: texts.join("\n") || (res.isError ? "Tool execution failed" : "Tool executed successfully"),
    };
  } catch {
    // 2. Fallback to StreamableHTTPClientTransport
    try {
      const httpTransport = new StreamableHTTPClientTransport(urlObj, {
        requestInit: { headers },
      });
      const client = new Client({ name: "growforge-byo-mcp-invoker", version: "1.0.0" }, { capabilities: {} });
      await client.connect(httpTransport);
      const res = await client.callTool({ name: toolName, arguments: args });
      await client.close().catch(() => {});

      const contentArr = Array.isArray(res.content) ? res.content : [];
      const texts = contentArr
        .filter((c: unknown) => typeof c === "object" && c !== null && "type" in c && (c as { type: string }).type === "text")
        .map((c: unknown) => (c as { type: "text"; text: string }).text);

      return {
        ok: !res.isError,
        output: texts.join("\n") || (res.isError ? "Tool execution failed" : "Tool executed successfully"),
      };
    } catch (err) {
      return {
        ok: false,
        output: `Error invoking custom MCP tool "${toolName}": ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}

class PluginRegistry {
  private plugins = new Map<string, CustomMcpPlugin>();

  public list(): CustomMcpPlugin[] {
    return Array.from(this.plugins.values());
  }

  public get(id: string): CustomMcpPlugin | undefined {
    return this.plugins.get(id);
  }

  public save(data: Omit<CustomMcpPlugin, "id" | "connectedAt"> & { id?: string }): CustomMcpPlugin {
    const id = data.id || `mcp-custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const plugin: CustomMcpPlugin = {
      ...data,
      id,
      connectedAt: data.id && this.plugins.has(data.id) ? this.plugins.get(data.id)!.connectedAt : new Date().toISOString(),
      lastPing: new Date().toISOString(),
    };
    this.plugins.set(id, plugin);
    return plugin;
  }

  public delete(id: string): boolean {
    return this.plugins.delete(id);
  }

  public getCustomTools(): Array<{
    name: string;
    description: string;
    usage: string;
    requiresApproval: boolean;
    execute: (args: Record<string, unknown>) => Promise<{ ok: boolean; output: string }>;
  }> {
    const tools: Array<{
      name: string;
      description: string;
      usage: string;
      requiresApproval: boolean;
      execute: (args: Record<string, unknown>) => Promise<{ ok: boolean; output: string }>;
    }> = [];

    const activePlugins = Array.from(this.plugins.values()).filter((p) => p.status === "connected");
    for (const plugin of activePlugins) {
      for (const t of plugin.detectedTools) {
        tools.push({
          name: t.name,
          description: `[BYO-MCP: ${plugin.name}] ${t.description || t.name}`,
          usage: typeof t.inputSchema === "object" ? JSON.stringify(t.inputSchema) : (t.description || "{}"),
          requiresApproval: true,
          execute: async (args: Record<string, unknown>) => {
            return callCustomMcpTool(plugin, t.name, args);
          },
        });
      }
    }
    return tools;
  }

  public generateDynamicTopology(): { nodes: DynamicBrainNode[]; axons: DynamicBrainAxon[] } {
    const nodes: DynamicBrainNode[] = [];
    const axons: DynamicBrainAxon[] = [];

    const activePlugins = Array.from(this.plugins.values()).filter((p) => p.status === "connected");

    activePlugins.forEach((plugin, pIdx) => {
      const parentInfo = LOBE_PARENT_MAP[plugin.targetLobe] || LOBE_PARENT_MAP.neural_core;
      const baseCenter = parentInfo.center;

      // Group detected tools into orbiting tendril soma clusters
      plugin.detectedTools.forEach((tool, tIdx) => {
        const totalTools = plugin.detectedTools.length;
        const angle = (tIdx / Math.max(totalTools, 1)) * Math.PI * 2 + pIdx * 0.6;
        const radius = 26 + (tIdx % 2) * 8;

        const posX = baseCenter[0] + Math.cos(angle) * radius;
        const posY = baseCenter[1] + Math.sin(angle) * (radius * 0.75) + ((tIdx % 3) - 1) * 6;
        const posZ = baseCenter[2] + Math.sin(angle * 1.5) * 14;

        const nodeId = `mcp-node:${plugin.id}:${tool.name}`;

        nodes.push({
          id: nodeId,
          name: tool.name,
          role: `Custom MCP Tool (${plugin.name})`,
          kind: "tendril",
          lobe: plugin.targetLobe,
          hemisphere: parentInfo.hemisphere,
          position: [posX, posY, posZ],
          size: 4,
          color: "#06b6d4",       // Cyan bioluminescent tone
          emissive: "#22d3ee",    // High-glow cyan
          description: tool.description || `Dynamic tool discovered on ${plugin.serverUrl}`,
          tools: [tool.name],
          pluginId: plugin.id,
        });

        // Add connecting axon spline back to parent lobe
        axons.push({
          id: `ax-${parentInfo.parentId}-${nodeId}`,
          source: parentInfo.parentId,
          target: nodeId,
          color: "#06b6d4",
          curveOffset: [
            Math.cos(angle) * 8,
            Math.sin(angle) * 8,
            ((tIdx % 2) === 0 ? 6 : -6),
          ],
          isDynamic: true,
        });
      });
    });

    return { nodes, axons };
  }
}

declare global {
  var __growforge_custom_mcp_plugins__: PluginRegistry | undefined;
}

export const pluginRegistry = globalThis.__growforge_custom_mcp_plugins__ ?? new PluginRegistry();
if (process.env.NODE_ENV !== "production") {
  globalThis.__growforge_custom_mcp_plugins__ = pluginRegistry;
}
