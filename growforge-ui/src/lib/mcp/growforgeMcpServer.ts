/**
 * GrowForge MCP Server Implementation
 *
 * Exposes GrowForge's native tool catalog via the Model Context Protocol (MCP).
 * Routes all executions through the Scoped Credential & Tool Broker (dispatchSafeTool)
 * and emits real-time events to the 3D Neural Brain telemetry store.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { getDefaultTools, type Tool } from "@/lib/tools";
import { dispatchSafeTool } from "@/lib/security/toolBroker";
import { telemetryStore, resolveLobe, type BrainLobe } from "@/lib/telemetryStore";

/**
 * Record a high-resolution telemetry event directly to the 3D Neural Brain engine.
 */
export function recordTelemetryEvent(
  type: "tool_invoked" | "error" | "step_changed" | "approval_required",
  toolName: string,
  label: string,
  details?: string,
  success?: boolean
) {
  const lobe: BrainLobe = resolveLobe(toolName);
  telemetryStore.emitEvent({
    type,
    lobe,
    nodeId: toolName,
    label,
    details,
  });
  if (success !== undefined) {
    telemetryStore.recordToolCall(success);
  }
}

/**
 * Convert tool usage descriptions into valid JSON Schema for MCP clients.
 */
export function convertToolUsageToSchema(tool: Tool): {
  type: "object";
  properties: Record<string, { type: string; description: string }>;
  required?: string[];
} {
  try {
    const raw = tool.usage.trim();
    if (raw.startsWith("{")) {
      const parsed = JSON.parse(raw);
      if (parsed.type === "object" && parsed.properties) {
        return parsed;
      }
      const properties: Record<string, { type: string; description: string }> = {};
      const required: string[] = [];
      for (const [key, val] of Object.entries(parsed)) {
        const valStr = String(val);
        const isRequired = !valStr.includes("optional") && !valStr.includes("undefined");
        if (isRequired) required.push(key);
        properties[key] = {
          type: valStr.includes("number")
            ? "number"
            : valStr.includes("boolean")
            ? "boolean"
            : valStr.includes("object")
            ? "object"
            : "string",
          description: valStr,
        };
      }
      return {
        type: "object",
        properties,
        ...(required.length > 0 ? { required } : {}),
      };
    }
  } catch {
    // Return flexible default schema
  }

  return {
    type: "object",
    properties: {
      input: {
        type: "string",
        description: tool.usage || "Tool parameters",
      },
    },
  };
}

/**
 * Executes a tool safely with isolation, secret sanitization, and live telemetry firing.
 */
export async function executeMcpToolWithTelemetry(
  toolName: string,
  rawArgs: Record<string, unknown> = {},
  departmentId?: string
): Promise<{ ok: boolean; output: string }> {
  const tools = await getDefaultTools(departmentId);
  const tool = tools.find((t) => t.name === toolName);

  if (!tool) {
    recordTelemetryEvent("error", toolName, `MCP Tool not found: ${toolName}`, undefined, false);
    return {
      ok: false,
      output: `Tool "${toolName}" not found in the GrowForge MCP catalog.`,
    };
  }

  // 1. Fire active processing telemetry on the corresponding soma lobe
  telemetryStore.setExecutionState("processing", { nodeId: toolName });
  recordTelemetryEvent("tool_invoked", toolName, `MCP Executing: ${toolName}`, JSON.stringify(rawArgs));

  // 2. Dispatch through the safe sandbox broker
  const result = await dispatchSafeTool(tool, rawArgs);

  // 3. Emit completion or failure telemetry
  recordTelemetryEvent(
    result.ok ? "tool_invoked" : "error",
    toolName,
    result.ok ? `MCP Done: ${toolName}` : `MCP Failed: ${toolName}`,
    result.output.slice(0, 150),
    result.ok
  );
  telemetryStore.setExecutionState("idle");

  return result;
}

/**
 * Initialize and configure a GrowForge Model Context Protocol Server.
 */
export function createGrowForgeMcpServer(departmentId?: string): Server {
  const server = new Server(
    {
      name: "growforge-mcp-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List all registered tools in GrowForge
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = await getDefaultTools(departmentId);
    return {
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: convertToolUsageToSchema(t),
      })),
    };
  });

  // Handle direct tool invocations
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    const result = await executeMcpToolWithTelemetry(name, args as Record<string, unknown>, departmentId);

    return {
      isError: !result.ok,
      content: [
        {
          type: "text",
          text: result.output,
        },
      ],
    };
  });

  return server;
}
