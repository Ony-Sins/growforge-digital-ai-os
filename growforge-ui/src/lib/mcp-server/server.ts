/**
 * GrowForge MCP Gateway (Phase 1) — read-only server factory.
 *
 * Transport-independent: `createGrowForgeReadOnlyMcpServer(actor)` returns a
 * configured McpServer. The stdio entry (scripts/growforge-mcp-stdio.mts) is
 * the only transport today; a future Streamable HTTP adapter would call the
 * same factory with a real remote actor.
 *
 * This is deliberately separate from src/lib/mcp/growforgeMcpServer.ts, which
 * exposes GrowForge's executable tool catalog to Gemini. Nothing here can
 * execute, write, or reach a credential.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  McpToolError,
  boundPayload,
  sanitizeError,
  type McpActor,
  type McpPermission,
} from "@/lib/mcp-server/safety";
import * as svc from "@/lib/mcp-server/services";

export const SERVER_NAME = "growforge-readonly";
export const SERVER_VERSION = "0.1.0";

/** Shared structured-output envelope; `data` shape is per tool (see docs). */
const envelopeShape = {
  ok: z.boolean(),
  tool: z.string(),
  generatedAt: z.string(),
  provenance: z.object({
    source: z.string(),
    readOnly: z.literal(true),
    phase: z.literal("local-readonly-v1"),
  }),
  truncated: z.boolean().optional(),
  data: z.unknown().optional(),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
};

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const limitField = z.number().int().min(1).max(50).optional().describe("Max items to return (default 20, max 50).");

interface ToolDef {
  name: string;
  title: string;
  description: string;
  permission: McpPermission;
  /** Human-readable canonical source this adapter reads. */
  source: string;
  inputSchema: z.ZodRawShape;
  run: (args: Record<string, unknown>, actor: McpActor) => Promise<unknown>;
}

export const TOOL_DEFS: ToolDef[] = [
  {
    name: "growforge_get_overview",
    title: "GrowForge overview",
    description:
      "Compact snapshot of the running GrowForge AI OS: mission counts by state, live service reachability, registered MCP/model counts, pending approvals. Start here.",
    permission: "read:overview",
    source: "coreState.buildCoreState + jobStore",
    inputSchema: {},
    run: () => svc.getOverview(),
  },
  {
    name: "growforge_list_missions",
    title: "List missions",
    description:
      "List GrowForge missions (orchestration jobs), newest first, with pagination. Status 'unverified_running_or_interrupted' means persisted as running but not verifiable as live from this process.",
    permission: "read:missions",
    source: "jobStore.listJobSummaries",
    inputSchema: {
      status: z.enum(["running", "done", "error", "unverified_running_or_interrupted"]).optional(),
      includeTest: z.boolean().optional().describe("Include synthetic test fixtures (default false)."),
      limit: limitField,
      offset: z.number().int().min(0).max(10_000).optional().describe("Pagination offset from nextOffset."),
    },
    run: (a) => svc.listMissions(a as Parameters<typeof svc.listMissions>[0]),
  },
  {
    name: "growforge_get_mission",
    title: "Get mission",
    description:
      "Bounded detail for one mission: steps, departments, research summary, usage, and short output previews (never full outputs).",
    permission: "read:missions",
    source: "jobStore.getJob + coreState.jobView",
    inputSchema: { id: z.string().regex(svc.MISSION_ID_PATTERN, "Invalid mission id format.").describe("Mission id from growforge_list_missions.") },
    run: (a) => svc.getMission(a.id as string),
  },
  {
    name: "growforge_get_recent_activity",
    title: "Recent activity",
    description: "Merged, time-ordered recent events: mission lifecycle, pending approvals, agent run log entries.",
    permission: "read:activity",
    source: "jobStore + approvalStore + agentStore logs",
    inputSchema: { limit: limitField, since: z.string().datetime().optional().describe("Only events at/after this ISO timestamp.") },
    run: (a) => svc.getRecentActivity(a as Parameters<typeof svc.getRecentActivity>[0]),
  },
  {
    name: "growforge_get_system_health",
    title: "System health",
    description:
      "Live reachability probes (Ollama, SearXNG, n8n, ComfyUI) run now from this process, plus vault note status and pending queues. 'reachable' is measured, never inferred.",
    permission: "read:health",
    source: "coreState.buildCoreState (live probes)",
    inputSchema: {},
    run: () => svc.getSystemHealth(),
  },
  {
    name: "growforge_get_service_registry",
    title: "Service registry",
    description:
      "Registered MCP servers and REST connectors. These are configuration records only — registered does not mean active; use get_system_health for live checks.",
    permission: "read:services",
    source: "mcp/store.listMcpServers + connectorStore.listConnectors",
    inputSchema: {},
    run: () => svc.getServiceRegistry(),
  },
  {
    name: "growforge_get_model_status",
    title: "Model status",
    description:
      "Registered AI models with provider, role, primary flag, whether a key is configured (boolean only) and the last recorded connection test. Not a live availability check.",
    permission: "read:models",
    source: "aiModelStore.listAiModels + llm.jobPrefersCloud",
    inputSchema: {},
    run: () => svc.getModelStatus(),
  },
  {
    name: "growforge_get_runtime_errors",
    title: "Runtime errors",
    description: "Recent persisted errors: failed missions/steps and agent log errors, newest first, redacted and truncated.",
    permission: "read:errors",
    source: "jobStore + agentStore logs",
    inputSchema: { limit: limitField, includeTest: z.boolean().optional() },
    run: (a) => svc.getRuntimeErrors(a as Parameters<typeof svc.getRuntimeErrors>[0]),
  },
  {
    name: "growforge_get_api_usage",
    title: "API usage",
    description:
      "Token/call/cost totals aggregated from LLM usage recorded on mission steps over a window. Coverage is mission-attached calls only; cost is a static estimate.",
    permission: "read:usage",
    source: "usage.summarizeUsage over jobStore step usage",
    inputSchema: { days: z.number().int().min(1).max(365).optional().describe("Window in days (default 30).") },
    run: (a) => svc.getApiUsage(a as Parameters<typeof svc.getApiUsage>[0]),
  },
  {
    name: "growforge_query_brain",
    title: "Query brain",
    description:
      "Keyword search over the GrowForge Brain graph (vault notes, department systems, docs, MCP, models). Returns titles and short snippets only.",
    permission: "read:brain",
    source: "spatial/obsidianReader.loadSpatialGraph",
    inputSchema: {
      query: z.string().min(2).max(120).describe("Case-insensitive keyword."),
      source: z.string().max(40).optional().describe("Optional category filter, e.g. vault, agents, docs, mcp, models."),
      limit: z.number().int().min(1).max(25).optional().describe("Max results (default 10, max 25)."),
    },
    run: (a) => svc.queryBrain(a as Parameters<typeof svc.queryBrain>[0]),
  },
  {
    name: "growforge_get_workspace_summary",
    title: "Workspace summary",
    description: "The calling actor, tenancy, department roster and inventory counts for the local owner workspace.",
    permission: "read:workspace",
    source: "departments + agentStore + jobStore + mcp/aiModel stores",
    inputSchema: {},
    run: (_a, actor) => svc.getWorkspaceSummary(actor),
  },
];

function envelope(tool: ToolDef, data: unknown, truncated: boolean) {
  return {
    ok: true as const,
    tool: tool.name,
    generatedAt: new Date().toISOString(),
    provenance: { source: tool.source, readOnly: true as const, phase: "local-readonly-v1" as const },
    ...(truncated ? { truncated: true } : {}),
    data,
  };
}

function errorEnvelope(toolName: string, source: string, code: string, message: string) {
  return {
    ok: false as const,
    tool: toolName,
    generatedAt: new Date().toISOString(),
    provenance: { source, readOnly: true as const, phase: "local-readonly-v1" as const },
    error: { code, message },
  };
}

function toResult(structured: Record<string, unknown>, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(structured) }],
    structuredContent: structured,
    ...(isError ? { isError: true } : {}),
  };
}

async function execute(tool: ToolDef, args: Record<string, unknown>, actor: McpActor) {
  try {
    if (!actor.permissions.has(tool.permission)) {
      throw new McpToolError("PERMISSION_DENIED", "This actor lacks the permission required for this tool.");
    }
    svc.refreshCanonicalCaches();
    const raw = await tool.run(args, actor);
    const clean = svc.finalizePayload(raw);
    const { value, truncated } = boundPayload(clean);
    return toResult(envelope(tool, value, truncated));
  } catch (err) {
    const { code, message } = sanitizeError(err);
    return toResult(errorEnvelope(tool.name, tool.source, code, message), true);
  }
}

export function createGrowForgeReadOnlyMcpServer(actor: McpActor): McpServer {
  if (actor.actorType !== "local_owner_mcp") {
    // Phase 1 is local-owner only. A remote actor needs the Phase 2/3 policy first.
    throw new Error("Phase 1 GrowForge MCP only supports the local_owner_mcp actor.");
  }

  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        "Read-only view of a local GrowForge AI OS. All tools are read-only and bounded. 'registered' ≠ 'active'; use get_system_health for live reachability.",
    },
  );

  for (const tool of TOOL_DEFS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: envelopeShape,
        annotations: { title: tool.title, ...READ_ONLY_ANNOTATIONS },
      },
      (args: Record<string, unknown>) => execute(tool, args ?? {}, actor),
    );
  }

  const resource = async (uri: string, name: string, fn: () => Promise<unknown>) => {
    try {
      svc.refreshCanonicalCaches();
      const { value } = boundPayload(svc.finalizePayload(await fn()));
      return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(value) }] };
    } catch (err) {
      const { code, message } = sanitizeError(err);
      return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify({ ok: false, resource: name, error: { code, message } }) }] };
    }
  };

  server.registerResource(
    "workspace-current",
    "growforge://workspace/current",
    { title: "Current workspace", description: "Actor, tenancy, departments and inventory counts.", mimeType: "application/json" },
    (uri) => resource(uri.href, "workspace-current", () => svc.getWorkspaceSummary(actor)),
  );
  server.registerResource(
    "runtime-summary",
    "growforge://runtime/summary",
    { title: "Runtime summary", description: "Live service reachability and queue sizes.", mimeType: "application/json" },
    (uri) => resource(uri.href, "runtime-summary", () => svc.getSystemHealth()),
  );

  return server;
}
