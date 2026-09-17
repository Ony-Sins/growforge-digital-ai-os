import fs from "node:fs";
import path from "node:path";
import { setSecret, getSecretForServerUse, removeSecret, hasSecret } from "@/lib/serverVault";
import { DEPARTMENTS } from "@/lib/departments";

/**
 * Real MCP (Model Context Protocol) server configuration — separate from
 * connectorStore.ts's custom REST connectors. An MCP server speaks the
 * actual published protocol (tool discovery, structured calls) rather than
 * being a single hand-defined HTTP request template.
 *
 * Two transports are supported, matching what's realistic to build without
 * a full OAuth subsystem:
 *   - "stdio": a local command this server spawns as a child process (most
 *     official MCP servers — filesystem, git, postgres, etc. — work this way).
 *   - "http": a remote server reachable over Streamable HTTP, optionally with
 *     a static bearer token. Real OAuth-popup connectors (the "click to
 *     connect your Google account" flow) are deliberately out of scope here —
 *     that's a distinct, much larger feature (per-provider app registration,
 *     token storage and refresh), not bundled into basic MCP support.
 *
 * Secrets (a bearer token, or stdio env vars that look like credentials)
 * live in the encrypted vault under `mcp:<id>`, never in mcp-servers.json.
 */

export type McpTransport = "stdio" | "http";

export interface McpServerDef {
  id: string;
  name: string;
  transport: McpTransport;
  // stdio
  command?: string;
  args?: string[];
  // http
  url?: string;
  /** Which department ids may use this server's tools. Empty array = every department. */
  allowedDepartments: string[];
  /** Which MCP_CATALOG entry this was created from, if any — lets the
   *  picker UI show a known service as already connected. */
  catalogId?: string;
  /** http only: send the token under this header name verbatim instead of
   *  `Authorization: Bearer <token>` — some official MCP servers (Apollo's
   *  `X-Api-Key`) require their own header rather than a bearer token. */
  authHeader?: string;
  createdAt: string;
}

export interface CreateMcpServerInput {
  name: string;
  transport: McpTransport;
  command?: string;
  args?: string[];
  url?: string;
  /** stdio: extra env vars (e.g. an API key the server itself needs) — stored in the vault, not on disk. */
  env?: Record<string, string>;
  /** http: a bearer token sent as `Authorization: Bearer <token>`. */
  bearerToken?: string;
  /** http only: see McpServerDef.authHeader. */
  authHeader?: string;
  allowedDepartments?: string[];
  catalogId?: string;
}

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "mcp-servers.json");

const globalForStore = globalThis as unknown as { __growforgeMcpServers?: McpServerDef[] };

function vaultAgentId(id: string): string {
  return `mcp:${id}`;
}

function loadFromDisk(): McpServerDef[] {
  try {
    if (!fs.existsSync(STORE_FILE)) return [];
    const raw = fs.readFileSync(STORE_FILE, "utf8");
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("[mcp/store] failed to read/parse mcp-servers.json — treating as empty:", err);
    return [];
  }
}

let writeQueue: Promise<void> = Promise.resolve();

function persist(defs: McpServerDef[]) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const json = JSON.stringify(defs, null, 2);
  writeQueue = writeQueue
    .then(() => fs.promises.writeFile(STORE_FILE, json, "utf8"))
    .catch((err) => console.error("[mcp/store] failed to persist mcp-servers.json:", err));
}

function getStore(): McpServerDef[] {
  if (!globalForStore.__growforgeMcpServers) globalForStore.__growforgeMcpServers = loadFromDisk();
  return globalForStore.__growforgeMcpServers;
}

export function listMcpServers(): (McpServerDef & { hasCredential: boolean })[] {
  return getStore().map((s) => ({ ...s, hasCredential: hasSecret(vaultAgentId(s.id), "auth") }));
}

export function getMcpServer(id: string): McpServerDef | undefined {
  return getStore().find((s) => s.id === id);
}

/** Servers a given department is allowed to use — empty allowedDepartments
 *  on a server means every department, matching how "allow: []" reads in
 *  the office.config.json-style pattern this was inspired by (own
 *  implementation, not their code). */
export function mcpServersForDepartment(departmentId: string): McpServerDef[] {
  return getStore().filter((s) => s.allowedDepartments.length === 0 || s.allowedDepartments.includes(departmentId));
}

const KNOWN_DEPARTMENT_IDS = new Set(DEPARTMENTS.map((d) => d.id));

export async function createMcpServer(input: CreateMcpServerInput): Promise<McpServerDef> {
  const name = input.name.trim();
  if (!name) throw new Error("name is required.");

  if (input.transport === "stdio") {
    if (!input.command?.trim()) throw new Error("command is required for a stdio server.");
  } else {
    if (!input.url?.trim()) throw new Error("url is required for an http server.");
    let parsed: URL;
    try {
      parsed = new URL(input.url);
    } catch {
      throw new Error("Invalid URL.");
    }
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
      throw new Error("Only https:// URLs are allowed (localhost is exempted for local development).");
    }
  }

  const allowedDepartments = (input.allowedDepartments ?? []).filter((d) => KNOWN_DEPARTMENT_IDS.has(d));

  const id = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "mcp"}-${Date.now().toString(36)}`;
  const def: McpServerDef = {
    id,
    name,
    transport: input.transport,
    command: input.transport === "stdio" ? input.command!.trim() : undefined,
    args: input.transport === "stdio" ? input.args ?? [] : undefined,
    url: input.transport === "http" ? input.url!.trim() : undefined,
    allowedDepartments,
    catalogId: input.catalogId,
    authHeader: input.transport === "http" ? input.authHeader?.trim() || undefined : undefined,
    createdAt: new Date().toISOString(),
  };

  const store = getStore();
  store.push(def);
  persist(store);

  if (input.transport === "http" && input.bearerToken) {
    setSecret(vaultAgentId(id), "auth", input.bearerToken);
  }
  if (input.transport === "stdio" && input.env && Object.keys(input.env).length > 0) {
    setSecret(vaultAgentId(id), "env", JSON.stringify(input.env));
  }

  return def;
}

export function deleteMcpServer(id: string): void {
  const store = getStore();
  const idx = store.findIndex((s) => s.id === id);
  if (idx === -1) return;
  store.splice(idx, 1);
  persist(store);
  removeSecret(vaultAgentId(id), "auth");
  removeSecret(vaultAgentId(id), "env");
}

export function updateMcpServerDepartments(id: string, allowedDepartments: string[]): McpServerDef | undefined {
  const store = getStore();
  const def = store.find((s) => s.id === id);
  if (!def) return undefined;
  def.allowedDepartments = allowedDepartments.filter((d) => KNOWN_DEPARTMENT_IDS.has(d));
  persist(store);
  return def;
}

/** Resolves the bearer token (http) or extra env vars (stdio) for a server —
 *  server-side only, never returned to the browser. */
export function getMcpCredential(id: string): { bearerToken: string | null; env: Record<string, string> } {
  const bearerToken = getSecretForServerUse(vaultAgentId(id), "auth");
  const envRaw = getSecretForServerUse(vaultAgentId(id), "env");
  let env: Record<string, string> = {};
  if (envRaw) {
    try {
      const parsed = JSON.parse(envRaw);
      if (parsed && typeof parsed === "object") env = parsed;
    } catch {
      // ignore malformed stored env — treated as no extra env vars
    }
  }
  return { bearerToken, env };
}
