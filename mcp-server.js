#!/usr/bin/env node
/**
 * GrowForge Digital — Agent Console MCP server.
 *
 * A lightweight local MCP server that lets Claude Desktop inspect and drive
 * the GrowForge Digital agent dashboard (growforge-ui, a Next.js app) via
 * three tools:
 *
 *   - get_agent_status       GET  /api/agents[/:agentId]
 *   - run_agent              POST /api/agents/:agentId/run
 *   - fetch_orchestrator_logs GET /api/logs
 *
 * The Next.js app must be running (npm run dev inside growforge-ui, default
 * http://localhost:3000) for these tools to return live data. Override the
 * target with the GROWFORGE_API_URL environment variable.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_BASE_URL = (process.env.GROWFORGE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

/**
 * Thin fetch wrapper against the growforge-ui API. Throws a
 * human-readable error (surfaced back to Claude as tool-call text) instead
 * of a raw fetch/ECONNREFUSED stack trace.
 */
async function apiRequest(path, { method = "GET", body } = {}) {
  const url = `${API_BASE_URL}${path}`;
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new Error(
      `Could not reach GrowForge app at ${url} (${err.message}). ` +
        `Is "npm run dev" running inside growforge-ui? ` +
        `Set GROWFORGE_API_URL to point at a different host/port if needed.`,
    );
  }

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Unexpected non-JSON response from ${url} (status ${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    throw new Error(data.error ?? `Request to ${url} failed with status ${res.status}`);
  }

  return data;
}

function textResult(text) {
  return { content: [{ type: "text", text }] };
}

function errorResult(err) {
  return {
    content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
    isError: true,
  };
}

const server = new McpServer({
  name: "growforge-agent-console",
  version: "1.0.0",
});

// ---------------------------------------------------------------------------
// get_agent_status
// ---------------------------------------------------------------------------
server.registerTool(
  "get_agent_status",
  {
    title: "Get Agent Status",
    description:
      "Get the live status of one GrowForge agent, or every agent on the roster, from the " +
      "growforge-ui dashboard (status is one of: active, success, error, idle).",
    inputSchema: {
      agentId: z
        .string()
        .optional()
        .describe(
          'Agent id to look up (e.g. "agents-orchestrator", "frontend-developer", "reality-checker"). ' +
            "Omit to list the status of every agent.",
        ),
    },
  },
  async ({ agentId }) => {
    try {
      if (agentId) {
        const { agent } = await apiRequest(`/api/agents/${encodeURIComponent(agentId)}`);
        return textResult(
          `${agent.name} (${agent.division})\nstatus: ${agent.status}\nlast run: ${agent.lastRun}\n\n` +
            JSON.stringify(agent, null, 2),
        );
      }

      const { agents } = await apiRequest("/api/agents");
      const summary = agents
        .map((a) => `- ${a.name} [${a.id}] — ${a.status} (${a.lastRun})`)
        .join("\n");
      return textResult(`${agents.length} agents on the roster:\n${summary}\n\n` + JSON.stringify(agents, null, 2));
    } catch (err) {
      return errorResult(err);
    }
  },
);

// ---------------------------------------------------------------------------
// run_agent
// ---------------------------------------------------------------------------
server.registerTool(
  "run_agent",
  {
    title: "Run Agent",
    description:
      "Dispatch a run for a GrowForge agent through the orchestrator. Flips the agent to " +
      '"active" immediately and resolves to "success" or "error" shortly after — check back ' +
      "with get_agent_status or fetch_orchestrator_logs to see the outcome.",
    inputSchema: {
      agentId: z
        .string()
        .describe('Agent id to run (e.g. "outbound-strategist", "reality-checker").'),
      params: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Optional free-form parameters to pass through to the agent run."),
    },
  },
  async ({ agentId, params }) => {
    try {
      const result = await apiRequest(`/api/agents/${encodeURIComponent(agentId)}/run`, {
        method: "POST",
        body: params ?? {},
      });
      return textResult(
        `Dispatched ${agentId}. ${result.log.message}\n\n` + JSON.stringify(result, null, 2),
      );
    } catch (err) {
      return errorResult(err);
    }
  },
);

// ---------------------------------------------------------------------------
// fetch_orchestrator_logs
// ---------------------------------------------------------------------------
server.registerTool(
  "fetch_orchestrator_logs",
  {
    title: "Fetch Orchestrator Logs",
    description:
      "Fetch recent execution log entries from the GrowForge orchestrator, newest first. " +
      "Optionally filter to a single agent's log lines.",
    inputSchema: {
      limit: z
        .number()
        .int()
        .positive()
        .max(500)
        .optional()
        .describe("Max number of log entries to return (default 50, max 500)."),
      agentId: z.string().optional().describe("Only return log entries emitted by this agent id."),
    },
  },
  async ({ limit, agentId }) => {
    try {
      const search = new URLSearchParams();
      if (limit) search.set("limit", String(limit));
      if (agentId) search.set("agentId", agentId);
      const query = search.toString();

      const { logs } = await apiRequest(`/api/logs${query ? `?${query}` : ""}`);
      if (logs.length === 0) {
        return textResult("No log entries found.");
      }

      const lines = logs
        .map((l) => `[${l.timestamp}] (${l.level}) ${l.agentId ?? "system"}: ${l.message}`)
        .join("\n");
      return textResult(`${logs.length} log entries:\n${lines}\n\n` + JSON.stringify(logs, null, 2));
    } catch (err) {
      return errorResult(err);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
