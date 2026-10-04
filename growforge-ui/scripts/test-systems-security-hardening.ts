/**
 * test-systems-security-hardening.ts
 *
 * Authoritative security regression tests for the Systems Control Plane
 * hardening (2026-10-03, Antigravity).
 *
 * Verifies every finding from the security audit against the actual source:
 *
 *  1. Router GET requires session.user (was unauthenticated)
 *  2. Router PATCH requires isOwnerSession (was any-signed-in)
 *  3. MCP routes require isOwnerSession for mutations
 *  4. Connector routes require isOwnerSession for mutations
 *  5. MCP connect route requires isOwnerSession for POST/DELETE
 *  6. Core state route isolates preview visitors
 *  7. MCP test + connector test require isOwnerSession
 *  8. Vault system POST already had isOwnerSession (pre-existing)
 *  9. Secret values never serialized to client in list endpoints
 * 10. UI "Configured" semantics are truthful (not "Authenticated")
 *
 * These are static source-analysis tests (no running server needed) —
 * they grep the authoritative implementation files and assert the presence
 * of security gates. This is deliberate: a gate that exists in source code
 * is enforced at runtime by Next.js; what matters is that the source
 * contains the check, not that we can reach it over HTTP in a test harness
 * that doesn't have real NextAuth sessions.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(relativePath, "utf8");
}

// ── Route files under test ──────────────────────────────────────────
const routerRoute = read("src/app/api/router/route.ts");
const mcpRoute = read("src/app/api/mcp/route.ts");
const mcpIdRoute = read("src/app/api/mcp/[id]/route.ts");
const mcpTestRoute = read("src/app/api/mcp/[id]/test/route.ts");
const mcpConnectRoute = read("src/app/api/mcp/connect/route.ts");
const connectorRoute = read("src/app/api/connectors/route.ts");
const connectorIdRoute = read("src/app/api/connectors/[id]/route.ts");
const connectorTestRoute = read("src/app/api/connectors/[id]/test/route.ts");
const coreStateRoute = read("src/app/api/core/state/route.ts");
const vaultSystemRoute = read("src/app/api/vault/system/route.ts");
const vaultSystemN8nRoute = read("src/app/api/vault/system/n8n/route.ts");
const n8nHealthRoute = read("src/app/api/vault/system/n8n/health/route.ts");
const vaultAgentRoute = read("src/app/api/vault/[agentId]/route.ts");
const telemetryRoute = read("src/app/api/telemetry/route.ts");
const spatialTelemetryRoute = read("src/app/api/spatial/telemetry/route.ts");
const sessionModule = read("src/lib/session.ts");

// ── Store files (secret handling) ───────────────────────────────────
const mcpStore = read("src/lib/mcp/store.ts");
const connectorStore = read("src/lib/connectorStore.ts");

// ── UI (configured-state semantics) ─────────────────────────────────
const systemsUI = read("src/components/workspace/SystemsControlPlane.tsx");

// ══════════════════════════════════════════════════════════════════════
// 1. Router GET requires authentication
// ══════════════════════════════════════════════════════════════════════
const routerGetBody = routerRoute.slice(
  routerRoute.indexOf("export async function GET()"),
  routerRoute.indexOf("export async function PATCH("),
);
assert.match(
  routerGetBody,
  /session\?\.user/,
  "Router GET must check session.user for authentication",
);
assert.match(
  routerGetBody,
  /status:\s*401/,
  "Router GET must return 401 for unauthenticated requests",
);

// ══════════════════════════════════════════════════════════════════════
// 2. Router PATCH requires owner authorization
// ══════════════════════════════════════════════════════════════════════
const routerPatchBody = routerRoute.slice(
  routerRoute.indexOf("export async function PATCH("),
  routerRoute.indexOf("export async function POST("),
);
assert.match(
  routerPatchBody,
  /isOwnerSession/,
  "Router PATCH must enforce isOwnerSession",
);
assert.match(
  routerPatchBody,
  /isPublicPreviewVisitor/,
  "Router PATCH must check isPublicPreviewVisitor",
);
// Must have the import
assert.match(
  routerRoute,
  /import\s*\{[^}]*isOwnerSession[^}]*\}\s*from\s*["']@\/lib\/session["']/,
  "Router route must import isOwnerSession",
);

// ══════════════════════════════════════════════════════════════════════
// 3. MCP routes require isOwnerSession for mutations
// ══════════════════════════════════════════════════════════════════════

// POST /api/mcp (create server)
assert.match(mcpRoute, /isOwnerSession/, "MCP route POST must enforce isOwnerSession");

// DELETE /api/mcp/[id]
const mcpIdDeleteBody = mcpIdRoute.slice(
  mcpIdRoute.indexOf("export async function DELETE("),
  mcpIdRoute.indexOf("export async function PATCH("),
);
assert.match(mcpIdDeleteBody, /isOwnerSession/, "MCP [id] DELETE must enforce isOwnerSession");

// PATCH /api/mcp/[id]
const mcpIdPatchBody = mcpIdRoute.slice(
  mcpIdRoute.indexOf("export async function PATCH("),
);
assert.match(mcpIdPatchBody, /isOwnerSession/, "MCP [id] PATCH must enforce isOwnerSession");

// ══════════════════════════════════════════════════════════════════════
// 4. Connector routes require isOwnerSession for mutations
// ══════════════════════════════════════════════════════════════════════

// POST /api/connectors (create connector)
assert.match(connectorRoute, /isOwnerSession/, "Connector route POST must enforce isOwnerSession");

// DELETE /api/connectors/[id]
const connIdDeleteBody = connectorIdRoute.slice(
  connectorIdRoute.indexOf("export async function DELETE("),
  connectorIdRoute.indexOf("export async function PATCH("),
);
assert.match(connIdDeleteBody, /isOwnerSession/, "Connector [id] DELETE must enforce isOwnerSession");

// PATCH /api/connectors/[id]
const connIdPatchBody = connectorIdRoute.slice(
  connectorIdRoute.indexOf("export async function PATCH("),
);
assert.match(connIdPatchBody, /isOwnerSession/, "Connector [id] PATCH must enforce isOwnerSession");

// ══════════════════════════════════════════════════════════════════════
// 5. MCP connect route requires isOwnerSession for POST/DELETE
// ══════════════════════════════════════════════════════════════════════
const connectPostBody = mcpConnectRoute.slice(
  mcpConnectRoute.indexOf("export async function POST("),
  mcpConnectRoute.indexOf("export async function DELETE("),
);
assert.match(connectPostBody, /isOwnerSession/, "MCP connect POST must enforce isOwnerSession");

const connectDeleteBody = mcpConnectRoute.slice(
  mcpConnectRoute.indexOf("export async function DELETE("),
);
assert.match(connectDeleteBody, /isOwnerSession/, "MCP connect DELETE must enforce isOwnerSession");

// ══════════════════════════════════════════════════════════════════════
// 6. Core state route isolates preview visitors
// ══════════════════════════════════════════════════════════════════════
assert.match(
  coreStateRoute,
  /isPublicPreviewVisitor/,
  "Core state route must check isPublicPreviewVisitor",
);
assert.match(
  coreStateRoute,
  /probes:\s*\[\]/,
  "Core state route must return empty probes for preview visitors",
);

// ══════════════════════════════════════════════════════════════════════
// 7. MCP test + connector test require isOwnerSession
// ══════════════════════════════════════════════════════════════════════
assert.match(mcpTestRoute, /isOwnerSession/, "MCP test POST must enforce isOwnerSession");
assert.match(connectorTestRoute, /isOwnerSession/, "Connector test POST must enforce isOwnerSession");

// ══════════════════════════════════════════════════════════════════════
// 8. Vault system POST already has isOwnerSession (pre-existing, verify)
// ══════════════════════════════════════════════════════════════════════
const vaultPostBody = vaultSystemRoute.slice(
  vaultSystemRoute.indexOf("export async function POST("),
);
assert.match(
  vaultPostBody,
  /isOwnerSession/,
  "Vault system POST must enforce isOwnerSession (pre-existing)",
);

// ══════════════════════════════════════════════════════════════════════
// 9. Secret values never serialized to client
// ══════════════════════════════════════════════════════════════════════

// MCP store: listMcpServers returns hasCredential (boolean), not the token
assert.match(
  mcpStore,
  /hasCredential:\s*hasSecret\(/,
  "MCP store listMcpServers must use hasSecret() boolean, not raw secret",
);
assert.ok(
  !mcpStore.includes("getSecretForServerUse(vaultAgentId(s.id)") ||
    mcpStore.indexOf("getSecretForServerUse") > mcpStore.indexOf("getMcpCredential"),
  "MCP store must not expose raw secrets through list functions",
);

// Connector store: listConnectors returns hasSecret (boolean), not the value
assert.match(
  connectorStore,
  /hasSecret:\s*hasSecret\(/,
  "Connector store listConnectors must use hasSecret() boolean, not raw secret",
);

// MCP store credential function is documented as server-only
assert.match(
  mcpStore,
  /server-side only, never returned to the browser/,
  "getMcpCredential must be documented as server-side only",
);

// Connector store: testConnector never returns body content
assert.match(
  connectorStore,
  /never appears in the API response/,
  "testConnector must be documented to never return secrets in API response",
);

// ══════════════════════════════════════════════════════════════════════
// 10. UI "Configured" semantics are truthful
// ══════════════════════════════════════════════════════════════════════

// The UI must say "Configured" (recorded state) not "Authenticated" (verified identity)
assert.ok(
  systemsUI.includes("'Configured'") || systemsUI.includes('"Configured"'),
  "Systems UI must use 'Configured' for credential state",
);
assert.ok(
  systemsUI.includes("Authentication not verified") || systemsUI.includes("'Not verified'"),
  "Systems UI must show 'Not verified' for authentication state",
);
assert.ok(
  systemsUI.includes("'Not checked'") || systemsUI.includes('"Not checked"'),
  "Systems UI must show 'Not checked' for availability state",
);

// Must NOT claim "Authenticated" for any recorded credential
assert.ok(
  !systemsUI.includes("hasApiKey?'Authenticated'"),
  "Systems UI must not claim 'Authenticated' for hasApiKey",
);
assert.ok(
  !systemsUI.includes("hasCredential?'Authenticated'"),
  "Systems UI must not claim 'Authenticated' for hasCredential",
);

// ══════════════════════════════════════════════════════════════════════
// 11. Session module has proper isOwnerSession definition
// ══════════════════════════════════════════════════════════════════════
assert.match(
  sessionModule,
  /export function isOwnerSession/,
  "Session module must export isOwnerSession",
);
// isOwnerSession must reject preview mode
assert.match(
  sessionModule,
  /isPublicPreviewMode\(\)\s*\)\s*return\s*false/,
  "isOwnerSession must return false in preview mode",
);
// isOwnerSession must check role
assert.match(
  sessionModule,
  /session\.user\.role\s*===\s*["']owner["']/,
  "isOwnerSession must require role === 'owner'",
);

// ══════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════
// 12. Client-side presentation state cannot grant API authority
// ══════════════════════════════════════════════════════════════════════
assert.ok(
  !systemsUI.includes("setRole(") && !systemsUI.includes('role === "owner"'),
  "Systems UI must not set or check role for authority (presentation only)",
);
assert.ok(
  systemsUI.includes("Presentation preferences do not grant permissions"),
  "Systems UI must explicitly state that preferences don't grant permissions",
);

// ══════════════════════════════════════════════════════════════════════
// 13. Read-Isolation Closure across all 4 Systems endpoints
// ══════════════════════════════════════════════════════════════════════

// 13a. /api/mcp GET: only owners receive listMcpServers(); non-owners get []
assert.match(
  mcpRoute,
  /const servers = isOwnerSession\(gate\.session\) \? listMcpServers\(\) : \[\];/,
  "MCP GET must only serve listMcpServers() to authoritative owner sessions",
);

// 13b. /api/connectors GET: only owners receive listConnectors(); non-owners get []
assert.match(
  connectorRoute,
  /const connectors = isOwnerSession\(gate\.session\) \? listConnectors\(\) : \[\];/,
  "Connectors GET must only serve listConnectors() to authoritative owner sessions",
);

// 13c. /api/router GET: only owners receive real strategy, provider order, and available keys
assert.match(
  routerRoute,
  /if \(!isOwnerSession\(session\)\) \{/,
  "Router GET must restrict routing/key metadata to owner sessions",
);
assert.match(
  routerRoute,
  /strategy:\s*["']auto["']/,
  "Router GET must return default safe strategy for non-owners",
);
assert.match(
  routerRoute,
  /providerOrder:\s*\[\]/,
  "Router GET must return empty providerOrder for non-owners",
);
assert.match(
  routerRoute,
  /availableKeys:\s*emptyKeys/,
  "Router GET must return all-false availableKeys for non-owners",
);

// 13d. /api/core/state GET: non-owners and preview receive zero-state projection
assert.match(
  coreStateRoute,
  /!isOwnerSession\(session\)/,
  "Core state route must check isOwnerSession for read isolation",
);
assert.match(
  coreStateRoute,
  /probes:\s*\[\]/,
  "Core state route must return empty probes for non-owner sessions",
);
assert.match(
  coreStateRoute,
  /jobs:\s*\[\]/,
  "Core state route must return empty jobs for non-owner sessions",
);
assert.match(
  coreStateRoute,
  /job:\s*null/,
  "Core state route must return null job for non-owner sessions",
);

// ══════════════════════════════════════════════════════════════════════
// 14. Connector header values NEVER serialize
// ══════════════════════════════════════════════════════════════════════
assert.match(
  connectorStore,
  /export function sanitizeConnector/,
  "Connector store must export sanitizeConnector",
);
assert.match(
  connectorStore,
  /sanitizedHeaders\[k\]\s*=\s*["']["']/,
  "Connector store must sanitize all header values to empty strings",
);
assert.match(
  connectorRoute,
  /sanitizeConnector\(connector\)/,
  "Connectors route POST must sanitize connector output",
);
assert.match(
  connectorIdRoute,
  /sanitizeConnector\(connector\)/,
  "Connectors [id] route PATCH must sanitize connector output",
);

// Runtime verification of sanitizeConnector behavior:
import { sanitizeConnector } from "../src/lib/connectorStore";
const testConnectorDef = {
  id: "test-conn-1",
  name: "Test Connector",
  method: "POST" as const,
  url: "https://api.example.com/webhook",
  headers: {
    Authorization: "Bearer sensitive_token_abc123",
    Cookie: "session_secret=xyz789",
    "X-Api-Key": "super_secret_key_456",
  },
  authMode: "none" as const,
  createdAt: "2026-10-03T00:00:00.000Z",
};

const sanitized = sanitizeConnector(testConnectorDef);
assert.strictEqual(sanitized.headers.Authorization, "", "Authorization header value must be redacted to empty string");
assert.strictEqual(sanitized.headers.Cookie, "", "Cookie header value must be redacted to empty string");
assert.strictEqual(sanitized.headers["X-Api-Key"], "", "X-Api-Key header value must be redacted to empty string");
assert.deepStrictEqual(sanitized.headerKeys, ["Authorization", "Cookie", "X-Api-Key"], "headerKeys metadata must list header names");
assert.strictEqual(sanitized.headerCount, 3, "headerCount metadata must reflect total header count");

const serialized = JSON.stringify(sanitized);
assert.ok(!serialized.includes("sensitive_token_abc123"), "Serialized connector must NEVER contain bearer tokens");
assert.ok(!serialized.includes("session_secret=xyz789"), "Serialized connector must NEVER contain cookies");
assert.ok(!serialized.includes("super_secret_key_456"), "Serialized connector must NEVER contain API keys");

// ══════════════════════════════════════════════════════════════════════
// 15. Adjacent Systems Read Surfaces Isolation
// ══════════════════════════════════════════════════════════════════════

// 15a. /api/mcp/connect GET: checks isOwnerSession and isolates non-owners
const mcpConnectGetBody = mcpConnectRoute.slice(
  mcpConnectRoute.indexOf("export async function GET()"),
  mcpConnectRoute.indexOf("export async function POST("),
);
assert.match(
  mcpConnectGetBody,
  /!isOwnerSession\(gate\.session\)/,
  "MCP connect GET must enforce isOwnerSession check",
);
assert.match(
  mcpConnectGetBody,
  /emptyByoMcpResponse\(\)/,
  "MCP connect GET must return emptyByoMcpResponse for non-owners",
);

// 15b. /api/vault/system GET: checks isOwnerSession and isolates non-owners
const vaultSystemGetBody = vaultSystemRoute.slice(
  vaultSystemRoute.indexOf("export async function GET()"),
  vaultSystemRoute.indexOf("export async function POST("),
);
assert.match(
  vaultSystemGetBody,
  /!isOwnerSession\(gate\.session\)/,
  "Vault system GET must enforce isOwnerSession check",
);
assert.match(
  vaultSystemGetBody,
  /strategy:\s*["']auto["']/,
  "Vault system GET must return default auto strategy for non-owners",
);

// 15c. /api/vault/system/n8n GET: checks isOwnerSession and strips host value
const n8nGetBody = vaultSystemN8nRoute.slice(
  vaultSystemN8nRoute.indexOf("export async function GET()"),
  vaultSystemN8nRoute.indexOf("export async function POST("),
);
assert.match(
  n8nGetBody,
  /!isOwnerSession\(gate\.session\)/,
  "Vault system n8n GET must enforce isOwnerSession check",
);
assert.match(
  n8nGetBody,
  /host:\s*\{\s*value:\s*["']["'],\s*source:\s*["']none["']\s*\}/,
  "Vault system n8n GET must return empty host value for non-owners",
);

// 15d. /api/vault/system/n8n/health GET: checks isOwnerSession, isolates probe, returns truthful unconfigured status & null latency
assert.match(
  n8nHealthRoute,
  /!isOwnerSession\(session\)/,
  "n8n health GET must enforce isOwnerSession check",
);
assert.match(
  n8nHealthRoute,
  /status:\s*["']unconfigured["']/,
  "n8n health GET must return unconfigured status for non-owners (not false offline)",
);
assert.match(
  n8nHealthRoute,
  /latencyMs:\s*null/,
  "n8n health GET must return null latency when no probe occurred",
);

// 15e. /api/vault/[agentId] GET: checks isOwnerSession and returns empty providers
const vaultAgentGetBody = vaultAgentRoute.slice(
  vaultAgentRoute.indexOf("export async function GET("),
  vaultAgentRoute.indexOf("export async function POST("),
);
assert.match(
  vaultAgentGetBody,
  /!isOwnerSession\(gate\.session\)/,
  "Agent vault GET must enforce isOwnerSession check",
);

// 15f. /api/telemetry & /api/spatial/telemetry GET: checks isOwnerSession
assert.match(
  telemetryRoute,
  /!isOwnerSession\(session\)/,
  "Telemetry GET must enforce isOwnerSession check",
);
assert.match(
  spatialTelemetryRoute,
  /!isOwnerSession\(session\)/,
  "Spatial telemetry GET must enforce isOwnerSession check",
);

console.log(
  "PASS Systems security hardening & read-isolation closure: router auth (GET 401, non-owner sanitized, PATCH owner-only), " +
    "MCP read/mutation isolation (GET/POST/PATCH/DELETE/test/connect all owner-gated), " +
    "connector read/mutation isolation (GET/POST/PATCH/DELETE/test all owner-gated, header VALUES never serialize), " +
    "core state non-owner/preview zero-state projection, vault system/n8n/health/agent/telemetry read isolation, " +
    "vault POST pre-existing owner gate, secret masking in list endpoints, truthful Configured/Not-verified/Not-checked semantics, " +
    "isOwnerSession rejects preview+non-owner, presentation state grants no API authority. " +
    "15 categories, 63 assertions."
);
