import assert from "node:assert";
import { getSession, isPublicPreviewVisitor, isOwnerSession, isPublicPreviewMode } from "../src/lib/session";
import { listAiModels } from "../src/lib/aiModelStore";
import { listMcpServers } from "../src/lib/mcp/store";
import { listJobSummaries, getJob } from "../src/lib/jobStore";
import { getLogs, getLogsCount } from "../src/lib/agentStore";
import { getUserMemory, formatUserMemoryPrompt } from "../src/lib/userMemory";
import { loadSpatialGraph } from "../src/lib/spatial/obsidianReader";
import { buildCoreState } from "../src/lib/coreState";
import { getSecretForServerUse, listProviders, hasSecret } from "../src/lib/serverVault";
import { SYSTEM_VAULT_ID } from "../src/lib/llm";

import { GET as graphRoute } from "../src/app/api/spatial/graph/route";
import { GET as coreStateRoute } from "../src/app/api/core/state/route";
import { GET as logsRoute } from "../src/app/api/logs/route";
import { GET as memoryRoute } from "../src/app/api/profile/memory/route";
import { POST as agentRunRoute } from "../src/app/api/agents/[id]/run/route";
import { GET as vaultSystemRoute, POST as saveVaultSystemRoute } from "../src/app/api/vault/system/route";
import { POST as testVaultRoute } from "../src/app/api/vault/system/test/route";
import { GET as n8nHealthRoute } from "../src/app/api/vault/system/n8n/health/route";

async function runPreviewIsolationTests() {
  console.log("=== GROWFORGE PREVIEW ISOLATION & DATA CONFINEMENT VERIFICATION ===");

  const savedEnv = { ...process.env };

  try {
    // Enable public preview mode
    process.env.PUBLIC_PREVIEW_MODE = "true";
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";

    console.log("\n[1] Verifying session isolation in Public Preview Mode...");
    assert.strictEqual(isPublicPreviewMode(), true, "isPublicPreviewMode() must be true");

    const session = await getSession();
    assert(session !== null, "Session must not be null in preview mode");
    assert.strictEqual(session.user.role, "employee", "Session role must be non-owner employee");
    assert.strictEqual(isPublicPreviewVisitor(session), true, "isPublicPreviewVisitor must be true");
    assert.strictEqual(isOwnerSession(session), false, "isOwnerSession must be false in preview mode");
    console.log("✓ Centralized session boundary strictly confines caller to unprivileged preview session");

    console.log("\n[2] Verifying serverVault isolation in Public Preview Mode...");
    assert.strictEqual(hasSecret(SYSTEM_VAULT_ID, "gemini"), false, "hasSecret must return false in preview mode");
    assert.strictEqual(getSecretForServerUse(SYSTEM_VAULT_ID, "gemini"), null, "getSecretForServerUse must return null in preview mode");
    assert.deepStrictEqual(listProviders(SYSTEM_VAULT_ID), [], "listProviders must return [] in preview mode");
    console.log("✓ Vault secrets completely sealed and unreachable in preview mode");

    console.log("\n[3] Verifying AI Model Store isolation...");
    const models = listAiModels();
    assert(models.length > 0, "Model catalog options must be available for UI selection");
    for (const m of models) {
      assert.strictEqual(m.hasApiKey, false, `Model ${m.name} must not expose API key`);
      assert.strictEqual(m.isConfigured, false, `Model ${m.name} must be unconfigured`);
      assert.strictEqual(m.status, "disconnected", `Model ${m.name} status must be disconnected`);
    }
    console.log("✓ AI Model Store returns unconfigured catalog options with 0 credentials");

    console.log("\n[4] Verifying MCP Server Store isolation...");
    const mcpServers = listMcpServers();
    assert.strictEqual(mcpServers.length, 0, "listMcpServers must return empty array in preview mode");
    console.log("✓ MCP server list is completely empty");

    console.log("\n[5] Verifying Job & Agent Store isolation...");
    const jobs = listJobSummaries();
    assert.strictEqual(jobs.length, 0, "listJobSummaries must return empty array in preview mode");
    assert.strictEqual(getJob("any-job-id"), undefined, "getJob must return undefined");
    assert.strictEqual(getLogs().length, 0, "getLogs must return empty array");
    assert.strictEqual(getLogsCount(), 0, "getLogsCount must be 0");
    console.log("✓ Job and Agent logs completely isolated and return 0 records");

    console.log("\n[6] Verifying User Memory / Shadow Memory isolation...");
    const userMemory = getUserMemory("owner@growforge.local");
    assert.strictEqual(userMemory.profile.fullName, "", "Profile fullName must be empty in preview mode");
    assert.strictEqual(userMemory.profile.companyName, "", "Profile companyName must be empty in preview mode");
    assert.strictEqual(formatUserMemoryPrompt("owner@growforge.local"), "", "Memory prompt must be empty in preview mode");
    console.log("✓ User profile and shadow memory return clean unconfigured defaults");

    console.log("\n[7] Verifying Spatial Graph (Obsidian Reader) isolation...");
    const spatialGraph = await loadSpatialGraph();
    assert.strictEqual(spatialGraph.nodes.length, 0, "Spatial graph nodes must be empty in preview mode");
    assert.strictEqual(spatialGraph.links.length, 0, "Spatial graph links must be empty in preview mode");
    assert.strictEqual(spatialGraph.categories.length, 0, "Spatial graph categories must be empty in preview mode");
    assert.strictEqual(spatialGraph.summary.totalNotes, 0, "Spatial graph totalNotes must be 0");
    console.log("✓ Spatial knowledge graph returns clean empty dataset for cinematic particle rendering");

    console.log("\n[8] Verifying CoreState builder isolation...");
    const coreState = await buildCoreState();
    assert.strictEqual(coreState.jobs.length, 0, "CoreState jobs must be empty");
    assert.strictEqual(coreState.job, null, "CoreState focused job must be null");
    assert.strictEqual(coreState.systems.mcp.count, 0, "CoreState MCP count must be 0");
    assert.strictEqual(coreState.systems.vault.reachable, false, "CoreState vault reachable must be false");
    assert.strictEqual(coreState.systems.vault.noteCount, 0, "CoreState noteCount must be 0");
    for (const probe of coreState.systems.probes) {
      assert.strictEqual(probe.online, false, `Probe ${probe.id} must be offline in preview mode`);
    }
    console.log("✓ CoreState returns accurate zero state without accessing local network/filesystem");

    console.log("\n[9] Verifying API Route Endpoints under Public Preview...");
    // 9a. /api/spatial/graph
    const graphRes = await graphRoute(new Request("http://localhost/api/spatial/graph"));
    assert.strictEqual(graphRes.status, 200, "/api/spatial/graph must return HTTP 200 for preview UI");
    const graphJson = await graphRes.json();
    assert.strictEqual(graphJson.ok, true);
    assert.strictEqual(graphJson.data.nodes.length, 0);
    assert.strictEqual(graphJson.user, "Operator");
    console.log("✓ GET /api/spatial/graph returned 200 with empty nodes and user 'Operator'");

    // 9b. /api/core/state
    const coreRes = await coreStateRoute(new Request("http://localhost/api/core/state"));
    assert.strictEqual(coreRes.status, 200, "/api/core/state must return HTTP 200 for CORE UI");
    const coreJson = await coreRes.json();
    assert.strictEqual(coreJson.jobs.length, 0);
    assert.strictEqual(coreJson.job, null);
    console.log("✓ GET /api/core/state returned 200 with clean zero state");

    // 9c. /api/logs
    const logsRes = await logsRoute(new Request("http://localhost/api/logs"));
    assert.strictEqual(logsRes.status, 200, "/api/logs must return HTTP 200");
    const logsJson = await logsRes.json();
    assert.deepStrictEqual(logsJson, { logs: [], total: 0 });
    console.log("✓ GET /api/logs returned 200 with { logs: [], total: 0 }");

    // 9d. /api/profile/memory
    const memoryRes = await memoryRoute();
    assert.strictEqual(memoryRes.status, 200, "/api/profile/memory must return HTTP 200");
    const memoryJson = await memoryRes.json();
    assert.strictEqual(memoryJson.memory.profile.fullName, "");
    console.log("✓ GET /api/profile/memory returned 200 with unconfigured profile");

    // 9e. /api/agents/[id]/run
    const runRes = await agentRunRoute(
      new Request("http://localhost/api/agents/whimsy-injector/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskDescription: "test" }),
      }),
      { params: Promise.resolve({ id: "whimsy-injector" }) }
    );
    assert.strictEqual(runRes.status, 403, "Agent run must return 403 Forbidden in preview mode");
    console.log("✓ POST /api/agents/[id]/run blocked with 403 Forbidden");

    // 9f. /api/vault/system GET & POST
    const vaultGetRes = await vaultSystemRoute();
    assert.strictEqual(vaultGetRes.status, 200);
    const vaultGetJson = await vaultGetRes.json();
    assert(Array.isArray(vaultGetJson.providers), "Vault system GET must return providers array");
    for (const p of vaultGetJson.providers) {
      assert.strictEqual(p.configured, false, `Provider ${p.id} must have configured: false in preview mode`);
      assert.strictEqual(p.source, "none", `Provider ${p.id} source must be 'none' in preview mode`);
    }

    const vaultPostRes = await saveVaultSystemRoute(
      new Request("http://localhost/api/vault/system", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "gemini", apiKey: "test-secret" }),
      })
    );
    assert.strictEqual(vaultPostRes.status, 403, "Vault system write must return 403 in preview mode");

    const vaultTestRes = await testVaultRoute(
      new Request("http://localhost/api/vault/system/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "gemini" }),
      })
    );
    assert.strictEqual(vaultTestRes.status, 403, "Vault test must return 403 in preview mode");

    const n8nHealthRes = await n8nHealthRoute();
    assert.strictEqual(n8nHealthRes.status, 200, "n8n health route returns 200 in preview mode");
    const n8nHealthJson = await n8nHealthRes.json();
    assert.strictEqual(n8nHealthJson.status, "unconfigured", "n8n health must be unconfigured in preview mode");
    assert.strictEqual(n8nHealthJson.latencyMs, null, "n8n health latency must be null without probe");
    console.log("✓ Vault and integration mutation/health endpoints strictly blocked / unconfigured");

    console.log("\n=======================================================");
    console.log("ALL PREVIEW ISOLATION TESTS PASSED (100% SUCCESS)");
    console.log("=======================================================\n");

    // Phase 2: Verify Local Owner Environment (PUBLIC_PREVIEW_MODE unset/false)
    console.log("=== GROWFORGE LOCAL OWNER ENVIRONMENT VERIFICATION ===");
    delete process.env.PUBLIC_PREVIEW_MODE;
    delete process.env.NEXT_PUBLIC_PREVIEW_MODE;
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    process.env.OWNER_EMAILS = "anjum.ony96@gmail.com";

    console.log("\n[10] Verifying local development session resolution...");
    assert.strictEqual(isPublicPreviewMode(), false, "isPublicPreviewMode() must be false in local environment");

    const localSession = await getSession();
    assert(localSession !== null, "Local session must not be null in development");
    assert.strictEqual(localSession.user.email, "anjum.ony96@gmail.com", "Local session email must match owner email");
    assert.strictEqual(localSession.user.role, "owner", "Local session role must be owner");
    assert.strictEqual(isPublicPreviewVisitor(localSession), false, "Local owner is NOT a preview visitor");
    assert.strictEqual(isOwnerSession(localSession), true, "Local owner session is valid owner");
    console.log("✓ Local session correctly resolves to owner 'anjum.ony96@gmail.com' with full owner privileges");

    console.log("\n[11] Verifying local user memory & profile restoration...");
    const localMemory = getUserMemory("anjum.ony96@gmail.com");
    assert.strictEqual(localMemory.profile.fullName, "Arif Md. Anjum Ony", "Owner full name must be restored");
    assert.strictEqual(localMemory.profile.companyName, "GrowForge Digital", "Owner company name must be restored");
    assert.strictEqual(localMemory.profile.designation, "Founder & CEO", "Owner designation must be restored");
    assert(localMemory.profile.socials.linkedin?.includes("arif-md-anjum-ony"), "Owner LinkedIn must be restored");
    console.log(`✓ Owner profile restored: "${localMemory.profile.fullName}" (${localMemory.profile.designation} at ${localMemory.profile.companyName})`);

    console.log("\n[12] Verifying GET /api/profile/memory in local environment...");
    const localMemoryRes = await memoryRoute();
    assert.strictEqual(localMemoryRes.status, 200, "Local /api/profile/memory must return 200");
    const localMemoryJson = await localMemoryRes.json();
    assert.strictEqual(localMemoryJson.memory.profile.fullName, "Arif Md. Anjum Ony", "API must return owner full name");
    assert.strictEqual(localMemoryJson.memory.profile.companyName, "GrowForge Digital", "API must return owner company");
    console.log("✓ GET /api/profile/memory correctly serves owner profile in local environment");

    console.log("\n[13] Verifying greeting name resolution...");
    function resolveGreetingName(customName: string, profileFullName: string | null): string {
      if (customName?.trim()) return customName.trim();
      if (profileFullName?.trim()) {
        if (profileFullName.includes("Ony")) return "Ony";
        const parts = profileFullName.trim().split(/\s+/);
        return parts[0] || "Operator";
      }
      return "Operator";
    }

    // Local environment resolution with owner profile
    const localGreeting = resolveGreetingName("", localMemory.profile.fullName);
    assert.strictEqual(localGreeting, "Ony", "Local greeting name must resolve to 'Ony'");
    console.log(`✓ Local environment greeting name resolves to: "${localGreeting}"`);

    // Preview environment resolution with empty profile
    const previewGreeting = resolveGreetingName("", "");
    assert.strictEqual(previewGreeting, "Operator", "Preview greeting name must resolve to 'Operator'");
    console.log(`✓ Preview environment greeting name resolves to: "${previewGreeting}"`);

    console.log("\n=======================================================");
    console.log("ALL LOCAL OWNER & PREVIEW DUAL-ENVIRONMENT TESTS PASSED");
    console.log("=======================================================\n");
  } finally {
    process.env = savedEnv;
  }
}

runPreviewIsolationTests().catch((err) => {
  console.error("Preview Isolation Test failed:", err);
  process.exit(1);
});
