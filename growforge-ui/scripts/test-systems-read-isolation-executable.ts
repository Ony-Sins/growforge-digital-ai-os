/**
 * test-systems-read-isolation-executable.ts
 *
 * Executable route-handler tests for Systems read-isolation and authorization closure.
 *
 * Directly executes route handlers under four distinct caller session classes:
 *  A. Anonymous (unauthenticated / missing session)
 *  B. Public Preview (preview visitor session)
 *  C. Authenticated Non-Owner / Beta (signed-in employee/tester session)
 *  D. Authenticated Owner (authoritative owner session)
 *
 * Covers all target Systems endpoints:
 *  - GET /api/mcp
 *  - GET /api/connectors
 *  - GET /api/router
 *  - GET /api/core/state
 *  - GET /api/mcp/connect
 *  - GET /api/vault/system
 *  - GET /api/vault/system/n8n
 *  - GET /api/vault/system/n8n/health
 *  - GET /api/vault/[agentId]
 *  - GET /api/telemetry
 *  - GET /api/spatial/telemetry
 *
 * Plus connector header and credential serialization tests.
 */

import assert from "node:assert/strict";

import { GET as mcpGet } from "../src/app/api/mcp/route";
import { GET as connectorsGet } from "../src/app/api/connectors/route";
import { GET as routerGet } from "../src/app/api/router/route";
import { GET as coreStateGet } from "../src/app/api/core/state/route";
import { GET as mcpConnectGet } from "../src/app/api/mcp/connect/route";
import { GET as vaultSystemGet } from "../src/app/api/vault/system/route";
import { GET as vaultSystemN8nGet } from "../src/app/api/vault/system/n8n/route";
import { GET as vaultSystemN8nHealthGet } from "../src/app/api/vault/system/n8n/health/route";
import { GET as vaultAgentGet } from "../src/app/api/vault/[agentId]/route";
import { GET as telemetryGet } from "../src/app/api/telemetry/route";
import { GET as spatialTelemetryGet } from "../src/app/api/spatial/telemetry/route";
import { sanitizeConnector } from "../src/lib/connectorStore";

const savedEnv = { ...process.env };

const envMap = process.env as Record<string, string | undefined>;

function setAnonymousSession() {
  envMap.NODE_ENV = "production";
  delete process.env.PUBLIC_PREVIEW_MODE;
  delete process.env.NEXT_PUBLIC_PREVIEW_MODE;
  delete process.env.DEV_SESSION_ROLE;
  delete process.env.DEV_SESSION_EMAIL;
}

function setPublicPreviewSession() {
  envMap.NODE_ENV = "production";
  process.env.PUBLIC_PREVIEW_MODE = "true";
  delete process.env.DEV_SESSION_ROLE;
  delete process.env.DEV_SESSION_EMAIL;
}

function setNonOwnerSession() {
  envMap.NODE_ENV = "development";
  delete process.env.PUBLIC_PREVIEW_MODE;
  delete process.env.NEXT_PUBLIC_PREVIEW_MODE;
  process.env.DEV_SESSION_ROLE = "employee";
  process.env.DEV_SESSION_EMAIL = "beta-tester@growforge.local";
}

function setOwnerSession() {
  envMap.NODE_ENV = "development";
  delete process.env.PUBLIC_PREVIEW_MODE;
  delete process.env.NEXT_PUBLIC_PREVIEW_MODE;
  process.env.DEV_SESSION_ROLE = "owner";
  process.env.DEV_SESSION_EMAIL = "owner@growforge.local";
  process.env.OWNER_EMAILS = "owner@growforge.local";
}

async function runTests() {
  console.log("=== GROWFORGE SYSTEMS EXECUTABLE READ-ISOLATION SUITE ===");

  try {
    // ══════════════════════════════════════════════════════════════════
    // 1. GET /api/mcp
    // ══════════════════════════════════════════════════════════════════
    console.log("\n[1] Testing GET /api/mcp across session classes...");

    // 1A. Anonymous
    setAnonymousSession();
    const mcpAnonRes = await mcpGet();
    assert.strictEqual(mcpAnonRes.status, 401, "GET /api/mcp must deny anonymous with 401");

    // 1B. Preview
    setPublicPreviewSession();
    const mcpPreviewRes = await mcpGet();
    assert.strictEqual(mcpPreviewRes.status, 200, "GET /api/mcp must return 200 for preview");
    const mcpPreviewJson = await mcpPreviewRes.json();
    assert.deepStrictEqual(mcpPreviewJson.servers, [], "Preview must receive empty servers array");
    assert(Array.isArray(mcpPreviewJson.departments), "Preview must receive department catalog metadata");

    // 1C. Non-Owner
    setNonOwnerSession();
    const mcpNonOwnerRes = await mcpGet();
    assert.strictEqual(mcpNonOwnerRes.status, 200, "GET /api/mcp must return 200 for non-owner");
    const mcpNonOwnerJson = await mcpNonOwnerRes.json();
    assert.deepStrictEqual(mcpNonOwnerJson.servers, [], "Non-owner must NOT receive owner MCP servers");
    assert(Array.isArray(mcpNonOwnerJson.departments), "Non-owner receives safe department catalog metadata");

    // 1D. Owner
    setOwnerSession();
    const mcpOwnerRes = await mcpGet();
    assert.strictEqual(mcpOwnerRes.status, 200, "GET /api/mcp must return 200 for owner");
    const mcpOwnerJson = await mcpOwnerRes.json();
    assert(Array.isArray(mcpOwnerJson.servers), "Owner receives real servers array");
    console.log("✓ GET /api/mcp: 401 anonymous, empty preview, zero-state non-owner, real owner");

    // ══════════════════════════════════════════════════════════════════
    // 2. GET /api/connectors
    // ══════════════════════════════════════════════════════════════════
    console.log("\n[2] Testing GET /api/connectors across session classes...");

    // 2A. Anonymous
    setAnonymousSession();
    const connAnonRes = await connectorsGet();
    assert.strictEqual(connAnonRes.status, 401, "GET /api/connectors must deny anonymous with 401");

    // 2B. Preview
    setPublicPreviewSession();
    const connPreviewRes = await connectorsGet();
    assert.strictEqual(connPreviewRes.status, 200, "GET /api/connectors must return 200 for preview");
    const connPreviewJson = await connPreviewRes.json();
    assert.deepStrictEqual(connPreviewJson.connectors, [], "Preview must receive empty connectors array");

    // 2C. Non-Owner
    setNonOwnerSession();
    const connNonOwnerRes = await connectorsGet();
    assert.strictEqual(connNonOwnerRes.status, 200, "GET /api/connectors must return 200 for non-owner");
    const connNonOwnerJson = await connNonOwnerRes.json();
    assert.deepStrictEqual(connNonOwnerJson.connectors, [], "Non-owner must NOT receive owner connectors");

    // 2D. Owner
    setOwnerSession();
    const connOwnerRes = await connectorsGet();
    assert.strictEqual(connOwnerRes.status, 200, "GET /api/connectors must return 200 for owner");
    const connOwnerJson = await connOwnerRes.json();
    assert(Array.isArray(connOwnerJson.connectors), "Owner receives real connectors array");
    console.log("✓ GET /api/connectors: 401 anonymous, empty preview, zero-state non-owner, real owner");

    // ══════════════════════════════════════════════════════════════════
    // 3. GET /api/router
    // ══════════════════════════════════════════════════════════════════
    console.log("\n[3] Testing GET /api/router across session classes...");

    // 3A. Anonymous
    setAnonymousSession();
    const routerAnonRes = await routerGet();
    assert.strictEqual(routerAnonRes.status, 401, "GET /api/router must deny anonymous with 401");

    // 3B. Preview
    setPublicPreviewSession();
    const routerPreviewRes = await routerGet();
    assert.strictEqual(routerPreviewRes.status, 200, "GET /api/router must return 200 for preview");
    const routerPreviewJson = await routerPreviewRes.json();
    assert.strictEqual(routerPreviewJson.strategy, "auto", "Preview receives safe auto strategy");
    assert.deepStrictEqual(routerPreviewJson.providerOrder, [], "Preview receives empty providerOrder");
    assert.strictEqual(routerPreviewJson.selectedPrimary, null, "Preview selectedPrimary must be null");
    for (const key of Object.values(routerPreviewJson.availableKeys)) {
      assert.strictEqual(key, false, "Preview availableKeys must all be false");
    }

    // 3C. Non-Owner
    setNonOwnerSession();
    const routerNonOwnerRes = await routerGet();
    assert.strictEqual(routerNonOwnerRes.status, 200, "GET /api/router must return 200 for non-owner");
    const routerNonOwnerJson = await routerNonOwnerRes.json();
    assert.strictEqual(routerNonOwnerJson.strategy, "auto", "Non-owner receives safe auto strategy");
    assert.deepStrictEqual(routerNonOwnerJson.providerOrder, [], "Non-owner receives empty providerOrder");
    assert.strictEqual(routerNonOwnerJson.selectedPrimary, null, "Non-owner selectedPrimary must be null");
    for (const key of Object.values(routerNonOwnerJson.availableKeys)) {
      assert.strictEqual(key, false, "Non-owner availableKeys must all be false");
    }

    // 3D. Owner
    setOwnerSession();
    const routerOwnerRes = await routerGet();
    assert.strictEqual(routerOwnerRes.status, 200, "GET /api/router must return 200 for owner");
    const routerOwnerJson = await routerOwnerRes.json();
    assert(typeof routerOwnerJson.strategy === "string", "Owner receives real strategy");
    assert(Array.isArray(routerOwnerJson.providerOrder), "Owner receives real providerOrder array");
    assert(typeof routerOwnerJson.availableKeys === "object", "Owner receives real availableKeys object");
    console.log("✓ GET /api/router: 401 anonymous, zero-state preview, zero-state non-owner, real owner");

    // ══════════════════════════════════════════════════════════════════
    // 4. GET /api/core/state
    // ══════════════════════════════════════════════════════════════════
    console.log("\n[4] Testing GET /api/core/state across session classes...");

    // 4A. Anonymous
    setAnonymousSession();
    const coreAnonRes = await coreStateGet(new Request("http://localhost/api/core/state"));
    assert.strictEqual(coreAnonRes.status, 401, "GET /api/core/state must deny anonymous with 401");

    // 4B. Preview
    setPublicPreviewSession();
    const corePreviewRes = await coreStateGet(new Request("http://localhost/api/core/state"));
    assert.strictEqual(corePreviewRes.status, 200);
    const corePreviewJson = await corePreviewRes.json();
    assert.deepStrictEqual(corePreviewJson.jobs, []);
    assert.strictEqual(corePreviewJson.job, null);
    assert.deepStrictEqual(corePreviewJson.systems.probes, []);
    assert.strictEqual(corePreviewJson.systems.mcp.count, 0);
    assert.strictEqual(corePreviewJson.systems.vault.reachable, false);

    // 4C. Non-Owner
    setNonOwnerSession();
    const coreNonOwnerRes = await coreStateGet(new Request("http://localhost/api/core/state"));
    assert.strictEqual(coreNonOwnerRes.status, 200);
    const coreNonOwnerJson = await coreNonOwnerRes.json();
    assert.deepStrictEqual(coreNonOwnerJson.jobs, [], "Non-owner must NOT receive owner jobs");
    assert.strictEqual(coreNonOwnerJson.job, null, "Non-owner focused job must be null");
    assert.deepStrictEqual(coreNonOwnerJson.systems.probes, [], "Non-owner must NOT receive service probes");
    assert.strictEqual(coreNonOwnerJson.systems.mcp.count, 0, "Non-owner systems.mcp count must be 0");
    assert.strictEqual(coreNonOwnerJson.systems.vault.reachable, false, "Non-owner vault must be unreachable");

    // 4D. Owner
    setOwnerSession();
    const coreOwnerRes = await coreStateGet(new Request("http://localhost/api/core/state"));
    assert.strictEqual(coreOwnerRes.status, 200);
    const coreOwnerJson = await coreOwnerRes.json();
    assert(Array.isArray(coreOwnerJson.jobs), "Owner receives real jobs array");
    assert(Array.isArray(coreOwnerJson.systems.probes), "Owner receives real probes array");
    console.log("✓ GET /api/core/state: 401 anonymous, zero-state preview, zero-state non-owner, real owner");

    // ══════════════════════════════════════════════════════════════════
    // 5. GET /api/mcp/connect
    // ══════════════════════════════════════════════════════════════════
    console.log("\n[5] Testing GET /api/mcp/connect across session classes...");

    // 5A. Anonymous
    setAnonymousSession();
    const mcpConnAnonRes = await mcpConnectGet();
    assert.strictEqual(mcpConnAnonRes.status, 401, "GET /api/mcp/connect must deny anonymous with 401");

    // 5B. Preview
    setPublicPreviewSession();
    const mcpConnPreviewRes = await mcpConnectGet();
    assert.strictEqual(mcpConnPreviewRes.status, 200);
    const mcpConnPreviewJson = await mcpConnPreviewRes.json();
    assert.strictEqual(mcpConnPreviewJson.ok, true);
    assert.deepStrictEqual(mcpConnPreviewJson.plugins, []);
    assert.deepStrictEqual(mcpConnPreviewJson.topology.nodes, []);
    assert.deepStrictEqual(mcpConnPreviewJson.topology.axons, []);

    // 5C. Non-Owner
    setNonOwnerSession();
    const mcpConnNonOwnerRes = await mcpConnectGet();
    assert.strictEqual(mcpConnNonOwnerRes.status, 200);
    const mcpConnNonOwnerJson = await mcpConnNonOwnerRes.json();
    assert.strictEqual(mcpConnNonOwnerJson.ok, true);
    assert.deepStrictEqual(mcpConnNonOwnerJson.plugins, [], "Non-owner must NOT receive BYO-MCP plugins");
    assert.deepStrictEqual(mcpConnNonOwnerJson.topology.nodes, [], "Non-owner must NOT receive owner topology nodes");
    assert.deepStrictEqual(mcpConnNonOwnerJson.topology.axons, [], "Non-owner must NOT receive owner topology axons");

    // 5D. Owner
    setOwnerSession();
    const mcpConnOwnerRes = await mcpConnectGet();
    assert.strictEqual(mcpConnOwnerRes.status, 200);
    const mcpConnOwnerJson = await mcpConnOwnerRes.json();
    assert.strictEqual(mcpConnOwnerJson.ok, true);
    assert(Array.isArray(mcpConnOwnerJson.plugins), "Owner receives plugins array");
    assert(Array.isArray(mcpConnOwnerJson.topology.nodes), "Owner receives topology nodes");
    console.log("✓ GET /api/mcp/connect: 401 anonymous, empty preview, zero-state non-owner, real owner");

    // ══════════════════════════════════════════════════════════════════
    // 6. GET /api/vault/system
    // ══════════════════════════════════════════════════════════════════
    console.log("\n[6] Testing GET /api/vault/system across session classes...");

    // 6A. Anonymous
    setAnonymousSession();
    const vaultAnonRes = await vaultSystemGet();
    assert.strictEqual(vaultAnonRes.status, 401, "GET /api/vault/system must deny anonymous with 401");

    // 6B. Preview
    setPublicPreviewSession();
    const vaultPreviewRes = await vaultSystemGet();
    assert.strictEqual(vaultPreviewRes.status, 200);
    const vaultPreviewJson = await vaultPreviewRes.json();
    assert.strictEqual(vaultPreviewJson.strategy, "auto");
    assert.deepStrictEqual(vaultPreviewJson.models, []);
    for (const p of vaultPreviewJson.providers) {
      assert.strictEqual(p.configured, false);
      assert.strictEqual(p.source, "none");
    }

    // 6C. Non-Owner
    setNonOwnerSession();
    const vaultNonOwnerRes = await vaultSystemGet();
    assert.strictEqual(vaultNonOwnerRes.status, 200);
    const vaultNonOwnerJson = await vaultNonOwnerRes.json();
    assert.strictEqual(vaultNonOwnerJson.strategy, "auto", "Non-owner receives safe auto strategy");
    assert.deepStrictEqual(vaultNonOwnerJson.models, [], "Non-owner receives empty models array");
    for (const p of vaultNonOwnerJson.providers) {
      assert.strictEqual(p.configured, false, `Provider ${p.id} must be configured=false for non-owner`);
      assert.strictEqual(p.source, "none", `Provider ${p.id} source must be 'none' for non-owner`);
    }

    // 6D. Owner
    setOwnerSession();
    const vaultOwnerRes = await vaultSystemGet();
    assert.strictEqual(vaultOwnerRes.status, 200);
    const vaultOwnerJson = await vaultOwnerRes.json();
    assert(Array.isArray(vaultOwnerJson.providers), "Owner receives real providers array");
    assert(Array.isArray(vaultOwnerJson.models), "Owner receives real models array");
    assert(typeof vaultOwnerJson.strategy === "string", "Owner receives real strategy");
    console.log("✓ GET /api/vault/system: 401 anonymous, zero-state preview, zero-state non-owner, real owner");

    // ══════════════════════════════════════════════════════════════════
    // 7. GET /api/vault/system/n8n & /health
    // ══════════════════════════════════════════════════════════════════
    console.log("\n[7] Testing GET /api/vault/system/n8n & health across session classes...");

    // 7A. Anonymous
    setAnonymousSession();
    const n8nAnonRes = await vaultSystemN8nGet();
    assert.strictEqual(n8nAnonRes.status, 401, "GET /api/vault/system/n8n must deny anonymous with 401");
    const n8nHealthAnonRes = await vaultSystemN8nHealthGet();
    assert.strictEqual(n8nHealthAnonRes.status, 401, "GET /api/vault/system/n8n/health must deny anonymous with 401");

    // 7B. Preview
    setPublicPreviewSession();
    const n8nPreviewRes = await vaultSystemN8nGet();
    assert.strictEqual(n8nPreviewRes.status, 200);
    const n8nPreviewJson = await n8nPreviewRes.json();
    assert.strictEqual(n8nPreviewJson.host.value, "", "Preview host value must be empty");
    assert.strictEqual(n8nPreviewJson.host.source, "none", "Preview host source must be 'none'");
    assert.strictEqual(n8nPreviewJson.apiKey.configured, false);
    assert.strictEqual(n8nPreviewJson.apiKey.source, "none");

    const n8nHealthPreviewRes = await vaultSystemN8nHealthGet();
    assert.strictEqual(n8nHealthPreviewRes.status, 200);
    const n8nHealthPreviewJson = await n8nHealthPreviewRes.json();
    assert.strictEqual(n8nHealthPreviewJson.status, "unconfigured", "Preview n8n health must be unconfigured (no false offline)");
    assert.strictEqual(n8nHealthPreviewJson.latencyMs, null, "Preview latencyMs must be null (no fabricated 0 ms)");
    assert.strictEqual(n8nHealthPreviewJson.host, "");

    // 7C. Non-Owner
    setNonOwnerSession();
    const n8nNonOwnerRes = await vaultSystemN8nGet();
    assert.strictEqual(n8nNonOwnerRes.status, 200);
    const n8nNonOwnerJson = await n8nNonOwnerRes.json();
    assert.strictEqual(n8nNonOwnerJson.host.value, "", "Non-owner host value must be empty (no owner URL leakage)");
    assert.strictEqual(n8nNonOwnerJson.host.source, "none", "Non-owner host source must be 'none'");
    assert.strictEqual(n8nNonOwnerJson.apiKey.configured, false, "Non-owner apiKey configured must be false");
    assert.strictEqual(n8nNonOwnerJson.apiKey.source, "none", "Non-owner apiKey source must be 'none'");

    const n8nHealthNonOwnerRes = await vaultSystemN8nHealthGet();
    assert.strictEqual(n8nHealthNonOwnerRes.status, 200);
    const n8nHealthNonOwnerJson = await n8nHealthNonOwnerRes.json();
    assert.strictEqual(n8nHealthNonOwnerJson.status, "unconfigured", "Non-owner n8n health must be unconfigured (no false offline)");
    assert.strictEqual(n8nHealthNonOwnerJson.latencyMs, null, "Non-owner latencyMs must be null (no fabricated 0 ms)");
    assert.strictEqual(n8nHealthNonOwnerJson.host, "", "Non-owner n8n health must not disclose host URL");

    // 7D. Owner
    setOwnerSession();
    const n8nOwnerRes = await vaultSystemN8nGet();
    assert.strictEqual(n8nOwnerRes.status, 200);
    const n8nOwnerJson = await n8nOwnerRes.json();
    assert(typeof n8nOwnerJson.host.value === "string", "Owner receives configured host URL");
    assert(typeof n8nOwnerJson.apiKey.configured === "boolean", "Owner receives apiKey configured flag");

    const n8nHealthOwnerRes = await vaultSystemN8nHealthGet();
    assert.strictEqual(n8nHealthOwnerRes.status, 200);
    const n8nHealthOwnerJson = await n8nHealthOwnerRes.json();
    assert(["connected", "offline"].includes(n8nHealthOwnerJson.status), "Owner receives real measured status (connected or offline)");
    assert(typeof n8nHealthOwnerJson.latencyMs === "number", "Owner receives real measured latency number");
    console.log("✓ GET /api/vault/system/n8n & health: 401 anonymous, unconfigured/null-latency preview & non-owner, real measured owner");

    // ══════════════════════════════════════════════════════════════════
    // 8. Adjacent Read Surfaces: Agent Vault & Telemetry
    // ══════════════════════════════════════════════════════════════════
    console.log("\n[8] Testing adjacent read surfaces (agent vault, telemetry, spatial telemetry)...");

    // Agent Vault
    setNonOwnerSession();
    const agentVaultRes = await vaultAgentGet(new Request("http://localhost/api/vault/whimsy-injector"), {
      params: Promise.resolve({ agentId: "whimsy-injector" }),
    });
    assert.strictEqual(agentVaultRes.status, 200);
    const agentVaultJson = await agentVaultRes.json();
    assert.deepStrictEqual(agentVaultJson.providers, [], "Non-owner must NOT see configured providers in agent vault");

    // Telemetry
    const telemetryRes = await telemetryGet();
    assert.strictEqual(telemetryRes.status, 200);
    const telemetryJson = await telemetryRes.json();
    assert.strictEqual(telemetryJson.connectedMcpCount, 0, "Non-owner receives 0 connected MCP servers in telemetry");
    assert.strictEqual(telemetryJson.executionState, "idle", "Non-owner receives idle execution state");

    // Spatial Telemetry
    const spatialRes = await spatialTelemetryGet();
    assert.strictEqual(spatialRes.status, 200);
    const spatialJson = await spatialRes.json();
    assert.strictEqual(spatialJson.data.activeJobCount, 0, "Non-owner receives 0 active jobs in spatial telemetry");
    assert.strictEqual(spatialJson.data.mcp.totalConnected, 0, "Non-owner receives 0 MCP servers in spatial telemetry");
    assert.strictEqual(spatialJson.data.models.totalConfigured, 0, "Non-owner receives 0 models in spatial telemetry");
    console.log("✓ Adjacent read surfaces: agent vault, telemetry, and spatial telemetry strictly isolated");

    // ══════════════════════════════════════════════════════════════════
    // 9. Comprehensive Connector Header & Credential Serialization
    // ══════════════════════════════════════════════════════════════════
    console.log("\n[9] Testing connector header & credential serialization safety...");

    const sensitiveInputs: Record<string, string>[] = [
      { Authorization: "Bearer sk-live-secret-jwt-token-xyz" },
      { Cookie: "session_token=secret_cookie_val_123; path=/" },
      { "X-Api-Key": "gf_live_api_key_abc_999" },
      { "X-Custom-Auth": "PrivateToken raw_secret_12345" },
      { "Proxy-Authorization": "Basic dXNlcjpwYXNz" },
      { "X-Client-Cert": "-----BEGIN CERTIFICATE-----MIID...-----END CERTIFICATE-----" },
    ];

    for (const hdr of sensitiveInputs) {
      const connectorWithSecrets = {
        id: "conn-sec-test",
        name: "Security Test Connector",
        method: "POST" as const,
        url: "https://api.example.com/endpoint",
        headers: hdr,
        authMode: "bearer" as const,
        createdAt: "2026-10-03T00:00:00.000Z",
      };

      const sanitizedResult = sanitizeConnector(connectorWithSecrets);

      // Verify each header key has an empty string value
      for (const [key, val] of Object.entries(sanitizedResult.headers)) {
        assert.strictEqual(val, "", `Header ${key} value must be stripped to empty string`);
      }

      // Verify headerKeys contains the header name
      const keyName = Object.keys(hdr)[0];
      assert(sanitizedResult.headerKeys.includes(keyName), `headerKeys must include ${keyName}`);
      assert.strictEqual(sanitizedResult.headerCount, 1);

      // Verify serialized JSON never contains sensitive tokens
      const serializedJson = JSON.stringify(sanitizedResult);
      const secretVal = Object.values(hdr)[0];
      assert.ok(
        !serializedJson.includes(secretVal),
        `Serialized connector JSON must NEVER contain sensitive value: "${secretVal}"`
      );
    }
    console.log("✓ Serialization tests: Authorization, Cookie, X-Api-Key, custom auth, and cert values NEVER serialize");

    console.log("\n=======================================================");
    console.log("ALL EXECUTABLE READ-ISOLATION & SERIALIZATION TESTS PASSED!");
    console.log("=======================================================\n");
  } finally {
    process.env = { ...savedEnv };
  }
}

runTests().catch((err) => {
  console.error("FATAL ERROR in executable read-isolation suite:", err);
  process.exit(1);
});
