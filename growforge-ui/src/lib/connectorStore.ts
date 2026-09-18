import fs from "node:fs";
import path from "node:path";
import dns from "node:dns/promises";
import net from "node:net";
import { removeSecret, setSecret, getSecretForServerUse, hasSecret } from "@/lib/serverVault";

/**
 * Generic outbound REST connectors — the first slice of "connect apps and
 * connectors" (webhooks/Zapier-style triggers are the natural next step on
 * top of this same store, not built yet). One connector = one HTTP request
 * template (method, URL, static headers, optional auth). The credential, if
 * any, lives in the encrypted vault under a per-connector pseudo-agent id
 * (`connector:<id>`) — never in connectors.json, never sent to the client.
 *
 * Executing a connector from an agent workflow node is intentionally out of
 * scope here — this lays the storage + test-fire foundation; wiring it into
 * the node canvas is a follow-up.
 */

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal", "metadata.goog"]);

function isPrivateOrReservedIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return true; // malformed -> block
  const [a, b] = parts;
  if (a === 127) return true; // loopback
  if (a === 10) return true; // RFC1918
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 169 && b === 254) return true; // link-local, incl. 169.254.169.254 cloud metadata
  if (a === 0) return true; // "this" network
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT (RFC6598)
  return false;
}

function isPrivateOrReservedIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true; // loopback / unspecified
  if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true; // link-local fe80::/10
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local fc00::/7
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateOrReservedIPv4(mapped[1]);
  return false;
}

/**
 * SSRF guard — required before persisting or fetching a connector URL. A
 * connector's target is arbitrary, owner-supplied input that this server
 * then makes a real outbound request to; without this check an owner
 * account (or anyone who compromises one) could use "test connector" to
 * probe internal-network services or cloud metadata endpoints
 * (169.254.169.254 etc.) from inside GrowForge's network perimeter.
 * Re-checked at fetch time too, not just at creation, since DNS can change
 * between the two (a DNS-rebinding attack would otherwise slip through).
 */
export async function assertPublicHttpsUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL.");
  }
  if (url.protocol !== "https:") {
    throw new Error("Only https:// URLs are allowed.");
  }

  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error("This host isn't allowed.");
  }

  if (net.isIP(hostname)) {
    const blocked = net.isIPv6(hostname) ? isPrivateOrReservedIPv6(hostname) : isPrivateOrReservedIPv4(hostname);
    if (blocked) throw new Error("This host resolves to a private/internal address, which isn't allowed.");
    return;
  }

  let addresses: { address: string; family: number }[];
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch {
    throw new Error("Couldn't resolve this hostname.");
  }
  if (addresses.length === 0) throw new Error("Couldn't resolve this hostname.");
  for (const { address, family } of addresses) {
    const blocked = family === 6 ? isPrivateOrReservedIPv6(address) : isPrivateOrReservedIPv4(address);
    if (blocked) throw new Error("This host resolves to a private/internal address, which isn't allowed.");
  }
}

export type AuthMode = "none" | "bearer" | "header";

export interface ConnectorDef {
  id: string;
  name: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  headers: Record<string, string>;
  authMode: AuthMode;
  authHeaderName?: string; // only meaningful when authMode === "header"
  createdAt: string;
}

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "connectors.json");

const globalForStore = globalThis as unknown as { __growforgeConnectors?: ConnectorDef[] };

function vaultAgentId(connectorId: string): string {
  return `connector:${connectorId}`;
}

function loadFromDisk(): ConnectorDef[] {
  try {
    if (!fs.existsSync(STORE_FILE)) return [];
    const raw = fs.readFileSync(STORE_FILE, "utf8");
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("[connectorStore] failed to read/parse connectors.json — treating as empty:", err);
    return [];
  }
}

let writeQueue: Promise<void> = Promise.resolve();

function persist(defs: ConnectorDef[]) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const json = JSON.stringify(defs, null, 2);
  writeQueue = writeQueue
    .then(() => fs.promises.writeFile(STORE_FILE, json, "utf8"))
    .catch((err) => console.error("[connectorStore] failed to persist connectors.json:", err));
}

function getStore(): ConnectorDef[] {
  if (!globalForStore.__growforgeConnectors) {
    globalForStore.__growforgeConnectors = loadFromDisk();
  }
  return globalForStore.__growforgeConnectors;
}

export function listConnectors(): (ConnectorDef & { hasSecret: boolean })[] {
  return getStore().map((c) => ({ ...c, hasSecret: hasSecret(vaultAgentId(c.id), "auth") }));
}

export function getConnector(id: string): ConnectorDef | undefined {
  return getStore().find((c) => c.id === id);
}

export interface CreateConnectorInput {
  name: string;
  method: ConnectorDef["method"];
  url: string;
  headers?: Record<string, string>;
  authMode: AuthMode;
  authHeaderName?: string;
  secretValue?: string;
}

export async function createConnector(input: CreateConnectorInput): Promise<ConnectorDef> {
  await assertPublicHttpsUrl(input.url);

  const id = `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "connector"}-${Date.now().toString(36)}`;
  const def: ConnectorDef = {
    id,
    name: input.name,
    method: input.method,
    url: input.url,
    headers: input.headers ?? {},
    authMode: input.authMode,
    authHeaderName: input.authHeaderName,
    createdAt: new Date().toISOString(),
  };

  const store = getStore();
  store.push(def);
  persist(store);

  if (input.authMode !== "none" && input.secretValue) {
    setSecret(vaultAgentId(id), "auth", input.secretValue);
  }

  return def;
}

export function deleteConnector(id: string): void {
  const store = getStore();
  const idx = store.findIndex((c) => c.id === id);
  if (idx === -1) return;
  store.splice(idx, 1);
  persist(store);
  removeSecret(vaultAgentId(id), "auth");
}

export async function updateConnector(
  id: string,
  patch: Partial<CreateConnectorInput>
): Promise<ConnectorDef | undefined> {
  const store = getStore();
  const def = store.find((c) => c.id === id);
  if (!def) return undefined;

  if (patch.url !== undefined && patch.url !== def.url) {
    await assertPublicHttpsUrl(patch.url);
    def.url = patch.url;
  }
  if (patch.name !== undefined && patch.name.trim()) def.name = patch.name.trim();
  if (patch.method !== undefined) def.method = patch.method;
  if (patch.headers !== undefined) def.headers = patch.headers;
  if (patch.authMode !== undefined) def.authMode = patch.authMode;
  if (patch.authHeaderName !== undefined) def.authHeaderName = patch.authHeaderName;

  persist(store);

  if (patch.authMode === "none") {
    removeSecret(vaultAgentId(id), "auth");
  } else if (patch.secretValue !== undefined) {
    if (patch.secretValue.trim()) {
      setSecret(vaultAgentId(id), "auth", patch.secretValue.trim());
    } else if (patch.secretValue === "") {
      removeSecret(vaultAgentId(id), "auth");
    }
  }

  return def;
}

async function buildAuthHeaders(id: string, def: ConnectorDef): Promise<{ headers: Record<string, string> } | { error: string }> {
  const headers: Record<string, string> = { ...def.headers };
  if (def.authMode === "none") return { headers };

  const secret = getSecretForServerUse(vaultAgentId(id), "auth");
  if (!secret) return { error: "No credential stored for this connector's auth mode." };
  if (def.authMode === "bearer") headers["Authorization"] = `Bearer ${secret}`;
  else if (def.authMode === "header" && def.authHeaderName) headers[def.authHeaderName] = secret;
  return { headers };
}

/** Fires the connector's configured HTTP request server-side. The secret
 *  (if any) is read from the vault here and injected into the request —
 *  it never appears in the API response, and neither does the response
 *  body: echoing arbitrary response content back to the browser is itself
 *  an SSRF exfiltration primitive, so "test" only ever reports status. */
export async function testConnector(id: string): Promise<{ ok: boolean; status?: number; message: string }> {
  const def = getConnector(id);
  if (!def) return { ok: false, message: "Connector not found." };

  try {
    // Re-validated here, not just at creation — DNS can change between the
    // two, and this is the point a request actually leaves the server.
    await assertPublicHttpsUrl(def.url);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "URL is no longer allowed." };
  }

  const auth = await buildAuthHeaders(id, def);
  if ("error" in auth) return { ok: false, message: auth.error };

  try {
    // redirect: "manual" so a 3xx response is reported as-is rather than
    // silently followed to an unvalidated (possibly internal) target.
    const res = await fetch(def.url, { method: def.method, headers: auth.headers, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      return { ok: false, status: res.status, message: `${res.status} ${res.statusText} — redirects aren't followed; point the connector at the final URL.` };
    }
    return { ok: res.ok, status: res.status, message: `${res.status} ${res.statusText}` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Request failed." };
  }
}

/**
 * A real, deliberate invocation of a connector — as opposed to testConnector's
 * passive ping. Called by an agent tool (see tools.ts), so the response body
 * IS returned (bounded to 4KB): an agent needs to see what the endpoint said
 * back to do anything useful with it. Every call site of this function must
 * sit behind the same PROPOSE-vs-EXECUTE approval gate the tool loop enforces
 * for any tool marked requiresApproval — this function itself has no gate.
 */
export async function invokeConnector(id: string, body?: unknown): Promise<{ ok: boolean; status?: number; message: string }> {
  const def = getConnector(id);
  if (!def) return { ok: false, message: "Connector not found." };

  try {
    await assertPublicHttpsUrl(def.url);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "URL is no longer allowed." };
  }

  const auth = await buildAuthHeaders(id, def);
  if ("error" in auth) return { ok: false, message: auth.error };

  const headers = { ...auth.headers };
  const hasBody = body !== undefined && def.method !== "GET";
  if (hasBody && !Object.keys(headers).some((h) => h.toLowerCase() === "content-type")) {
    headers["Content-Type"] = "application/json";
  }

  try {
    const res = await fetch(def.url, {
      method: def.method,
      headers,
      redirect: "manual",
      body: hasBody ? JSON.stringify(body) : undefined,
    });
    if (res.status >= 300 && res.status < 400) {
      return { ok: false, status: res.status, message: `${res.status} ${res.statusText} — redirects aren't followed; point the connector at the final URL.` };
    }
    const text = (await res.text()).slice(0, 4000);
    return { ok: res.ok, status: res.status, message: `${res.status} ${res.statusText} — ${text || "(empty body)"}` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Request failed." };
  }
}
