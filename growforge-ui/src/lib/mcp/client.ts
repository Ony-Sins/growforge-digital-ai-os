import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getMcpServer, getMcpCredential, type McpServerDef } from "@/lib/mcp/store";

/**
 * Every connection here is short-lived: connect, do one thing, disconnect.
 * No pool of long-held child processes or open HTTP streams sitting between
 * requests — simpler, and avoids zombie processes/leaked connections
 * surviving a dev-server hot-reload. Costs a little latency per call
 * (re-handshaking with the server each time); worth it for correctness.
 */

export interface McpToolInfo {
  name: string;
  description: string;
  inputSchema: unknown;
}

const CONNECT_TIMEOUT_MS = 10_000;

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

/** Env vars a child process needs merely to *run* (resolve `npx`/`node`,
 *  find a temp dir, etc.) — never secrets. Everything else this server
 *  process holds (LLM provider keys, NEXTAUTH_SECRET, other servers'
 *  credentials...) must never reach a spawned MCP command: stdio servers
 *  are arbitrary shell commands the user configures (including third-party
 *  `npx` packages), so spreading the full parent `process.env` into them
 *  would hand every one of this app's secrets to any of those commands. */
const CHILD_PROCESS_ENV_ALLOWLIST = ["PATH", "SystemRoot", "TEMP", "TMP", "APPDATA", "HOME", "USERPROFILE"];

function baseChildEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of CHILD_PROCESS_ENV_ALLOWLIST) {
    const value = process.env[key];
    if (value) env[key] = value;
  }
  return env;
}

async function buildTransport(def: McpServerDef) {
  if (def.transport === "stdio") {
    if (!def.command) throw new Error("Server has no command configured.");
    const { env } = getMcpCredential(def.id);
    return new StdioClientTransport({
      command: def.command,
      args: def.args ?? [],
      env: { ...baseChildEnv(), ...env },
    });
  }

  if (!def.url) throw new Error("Server has no URL configured.");
  const { bearerToken } = getMcpCredential(def.id);
  const headers = bearerToken
    ? def.authHeader
      ? { [def.authHeader]: bearerToken }
      : { Authorization: `Bearer ${bearerToken}` }
    : undefined;
  return new StreamableHTTPClientTransport(new URL(def.url), {
    requestInit: headers ? { headers } : undefined,
  });
}

async function withConnection<T>(def: McpServerDef, fn: (client: Client) => Promise<T>): Promise<T> {
  const transport = await buildTransport(def);
  const client = new Client({ name: "growforge-ai-os", version: "1.0.0" }, { capabilities: {} });
  try {
    await withTimeout(client.connect(transport), CONNECT_TIMEOUT_MS, `Connecting to "${def.name}"`);
    return await fn(client);
  } finally {
    await client.close().catch(() => {});
  }
}

/** Connects, lists the server's tools, disconnects — the real live probe
 *  behind the Settings UI's "Test" button and the department tool loop's
 *  tool catalog. */
export async function probeMcpServer(id: string): Promise<{ ok: true; tools: McpToolInfo[] } | { ok: false; error: string }> {
  const def = getMcpServer(id);
  if (!def) return { ok: false, error: "Server not found." };

  try {
    const tools = await withConnection(def, async (client) => {
      const result = await client.listTools();
      return result.tools.map((t) => ({
        name: t.name,
        description: t.description ?? "",
        inputSchema: t.inputSchema,
      }));
    });
    return { ok: true, tools };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** A real, deliberate tool call — as opposed to probeMcpServer's discovery
 *  ping. Every call site sits behind the same PROPOSE-vs-EXECUTE approval
 *  gate the tool loop enforces for any requiresApproval tool (see tools.ts)
 *  — this function itself has no gate. */
export async function callMcpTool(
  serverId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ ok: boolean; output: string }> {
  const def = getMcpServer(serverId);
  if (!def) return { ok: false, output: "Server not found." };

  try {
    const output = await withConnection(def, async (client) => {
      const result = await client.callTool({ name: toolName, arguments: args });
      const content = Array.isArray(result.content) ? result.content : [];
      const text = content
        .map((c) => (c.type === "text" ? c.text : `[${c.type} content]`))
        .join("\n")
        .slice(0, 4000);
      return result.isError ? `Tool reported an error: ${text}` : text || "(empty result)";
    });
    return { ok: true, output };
  } catch (err) {
    return { ok: false, output: err instanceof Error ? err.message : String(err) };
  }
}
