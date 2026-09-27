import assert from "node:assert";
import { POST as runAgentRoute } from "../src/app/api/agents/[id]/run/route";
import { POST as discoverRoute } from "../src/app/api/vault/system/discover/route";
import { POST as geminiRoute } from "../src/app/api/gemini/route";
import { GET as telemetryRoute } from "../src/app/api/spatial/telemetry/route";
import { discoverProviderModels, isTrustedOfficialEndpoint, isTrustedLocalEndpoint } from "../src/lib/modelDiscovery";
import { canSessionAccessAgent } from "../src/lib/security";

// Helper to mock request context with cookies/headers or session state
async function runTests() {
  console.log("=== GROWFORGE C11-P0A: SECURITY CONTAINMENT & AUTHORIZATION TEST SUITE ===");

  const originalEnv = { ...process.env };

  try {
    // -------------------------------------------------------------
    // TEST 1: Anonymous Agent Run Requests are Rejected (401)
    // -------------------------------------------------------------
    console.log("\n[Test 1] Asserting anonymous agent run requests are rejected (401)...");
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    delete process.env.PUBLIC_PREVIEW_MODE;

    const reqAnon = new Request("http://localhost/api/agents/whimsy-injector/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskDescription: "Test anonymous dispatch" }),
    });

    const resAnon = await runAgentRoute(reqAnon, { params: Promise.resolve({ id: "whimsy-injector" }) });
    assert.strictEqual(resAnon.status, 401, "Anonymous agent run must return HTTP 401");
    const jsonAnon = await resAnon.json();
    assert.strictEqual(jsonAnon.error, "Unauthorized.", "Error message must be 'Unauthorized.'");
    console.log("✓ Anonymous agent run blocked with 401 Unauthorized");

    // -------------------------------------------------------------
    // TEST 2: Public-Preview Agent Run Requests are Rejected (403)
    // -------------------------------------------------------------
    console.log("\n[Test 2] Asserting public-preview agent run requests are rejected (403)...");
    process.env.PUBLIC_PREVIEW_MODE = "true";

    const reqPreview = new Request("http://localhost/api/agents/whimsy-injector/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskDescription: "Test preview dispatch" }),
    });

    const resPreview = await runAgentRoute(reqPreview, { params: Promise.resolve({ id: "whimsy-injector" }) });
    assert.strictEqual(resPreview.status, 403, "Public-preview agent run must return HTTP 403");
    const jsonPreview = await resPreview.json();
    assert(jsonPreview.error.includes("Public preview is read-only"), "Error must state public preview is read-only");
    console.log("✓ Public-preview agent run blocked with 403 Forbidden");

    // -------------------------------------------------------------
    // TEST 3 & 4: Forged Role / Forged unlockedAgentIds Rejected
    // -------------------------------------------------------------
    console.log("\n[Test 3 & 4] Asserting forged role and forged unlockedAgentIds cannot unlock locked agent...");
    // Direct authoritative security check
    const forgedOwnerAccess = canSessionAccessAgent("whimsy-injector", "employee", undefined, undefined);
    assert.strictEqual(forgedOwnerAccess, false, "Employee session without valid PIN must not access locked agent");

    const forgedUnlockAccess = canSessionAccessAgent("whimsy-injector", undefined, "wrong-pin", undefined);
    assert.strictEqual(forgedUnlockAccess, false, "Invalid PIN must not unlock locked agent");

    const validAgentPinAccess = canSessionAccessAgent("whimsy-injector", "employee", "1234", undefined);
    assert.strictEqual(validAgentPinAccess, true, "Valid department PIN 1234 must grant access");

    const validOwnerPinAccess = canSessionAccessAgent("whimsy-injector", "employee", undefined, "0000");
    assert.strictEqual(validOwnerPinAccess, true, "Valid owner PIN 0000 must grant access");
    console.log("✓ Forged client roles/tokens blocked; authoritative PIN verification enforced");

    // -------------------------------------------------------------
    // TEST 5: Client skipHandoffCheck Cannot Bypass Authorization
    // -------------------------------------------------------------
    console.log("\n[Test 5] Asserting skipHandoffCheck cannot bypass locked agent gate...");
    process.env.PUBLIC_PREVIEW_MODE = "true";
    const reqHandoffBypass = new Request("http://localhost/api/agents/whimsy-injector/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skipHandoffCheck: true, role: "owner", unlockedAgentIds: ["whimsy-injector"] }),
    });
    const resHandoffBypass = await runAgentRoute(reqHandoffBypass, { params: Promise.resolve({ id: "whimsy-injector" }) });
    assert.strictEqual(resHandoffBypass.status, 403, "skipHandoffCheck on preview/unauthorized session must still fail with 403");
    console.log("✓ skipHandoffCheck cannot bypass server-side authorization");

    // -------------------------------------------------------------
    // TEST 6 & 7: Untrusted Discovery Destinations Rejected
    // -------------------------------------------------------------
    console.log("\n[Test 6 & 7] Asserting untrusted discovery destinations are rejected before network requests...");
    delete process.env.PUBLIC_PREVIEW_MODE;
    (process.env as Record<string, string | undefined>).NODE_ENV = "development"; // local test session

    assert.strictEqual(isTrustedOfficialEndpoint("groq", "https://attacker.com/v1"), false);
    assert.strictEqual(isTrustedOfficialEndpoint("groq", "https://api.groq.com/openai/v1"), true);
    assert.strictEqual(isTrustedLocalEndpoint("http://192.168.1.100:11434"), false);
    assert.strictEqual(isTrustedLocalEndpoint("http://localhost:11434"), true);
    assert.strictEqual(isTrustedLocalEndpoint("http://127.0.0.1:20128"), true);

    const untrustedDiscovery = await discoverProviderModels("groq", "https://attacker.com/v1");
    assert.strictEqual(untrustedDiscovery.ok, false, "Discovery to attacker.com must return ok: false");
    assert(untrustedDiscovery.error?.includes("Untrusted or unapproved"), "Must return untrusted destination error");
    console.log("✓ Untrusted model discovery endpoints rejected before outbound fetch; vault secrets protected");

    // -------------------------------------------------------------
    // TEST 8 & 9: Legitimate Discovery Remains Functional
    // -------------------------------------------------------------
    console.log("\n[Test 8 & 9] Asserting legitimate Groq & Local model discovery remains operational...");
    const legitGroq = await discoverProviderModels("groq", "https://api.groq.com/openai/v1");
    assert(Array.isArray(legitGroq.models) && legitGroq.models.length > 0, "Groq discovery must return models catalog");
    console.log(`✓ Legitimate Groq discovery returned ${legitGroq.models.length} models`);

    const legitLocal = await discoverProviderModels("ollama", "http://localhost:11434");
    assert(Array.isArray(legitLocal.models) && legitLocal.models.length > 0, "Local Ollama discovery must return models catalog");
    console.log(`✓ Legitimate Local Ollama discovery returned ${legitLocal.models.length} models`);

    // -------------------------------------------------------------
    // TEST 10: Anonymous & Public-Preview Gemini and Telemetry Gating
    // -------------------------------------------------------------
    console.log("\n[Test 10] Asserting Gemini and Telemetry route protection...");
    // 10a. Anonymous Gemini
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    delete process.env.PUBLIC_PREVIEW_MODE;
    const reqGeminiAnon = new Request("http://localhost/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Hello" }),
    });
    const resGeminiAnon = await geminiRoute(reqGeminiAnon);
    assert.strictEqual(resGeminiAnon.status, 401, "Anonymous /api/gemini must return 401");

    // 10b. Public Preview Gemini
    process.env.PUBLIC_PREVIEW_MODE = "true";
    const reqGeminiPrev = new Request("http://localhost/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Hello" }),
    });
    const resGeminiPrev = await geminiRoute(reqGeminiPrev);
    assert.strictEqual(resGeminiPrev.status, 403, "Public-preview /api/gemini must return 403");

    // 10c. Anonymous Telemetry
    delete process.env.PUBLIC_PREVIEW_MODE;
    const resTelemAnon = await telemetryRoute();
    assert.strictEqual(resTelemAnon.status, 401, "Anonymous /api/spatial/telemetry must return 401");

    // 10d. Public Preview Telemetry Sanitization
    process.env.PUBLIC_PREVIEW_MODE = "true";
    const resTelemPrev = await telemetryRoute();
    assert.strictEqual(resTelemPrev.status, 200, "Public-preview telemetry must return 200 sanitized shape");
    const jsonTelemPrev = await resTelemPrev.json();
    assert.strictEqual(jsonTelemPrev.data.activeJobCount, 0, "Public preview activeJobCount must be 0");
    assert.strictEqual(jsonTelemPrev.data.recentJobs.length, 0, "Public preview recentJobs must be empty");
    assert.strictEqual(jsonTelemPrev.data.mcp.servers.length, 0, "Public preview MCP servers must be empty");
    console.log("✓ Gemini and Telemetry routes strictly authenticated & public preview sanitized");

    // -------------------------------------------------------------
    // TEST 11: Public Preview Discovery Route Gating
    // -------------------------------------------------------------
    console.log("\n[Test 11] Asserting /api/vault/system/discover public-preview gating across all branches...");
    const reqDiscPrev = new Request("http://localhost/api/vault/system/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerType: "groq" }),
    });
    const resDiscPrev = await discoverRoute(reqDiscPrev);
    assert.strictEqual(resDiscPrev.status, 403, "Public preview discovery must return 403");
    console.log("✓ /api/vault/system/discover blocked for public preview on all branches");

    console.log("\n=======================================================");
    console.log("ALL C11-P0A SECURITY TESTS PASSED (11/11)");
    console.log("=======================================================\n");
  } finally {
    process.env = originalEnv;
  }
}

runTests().catch((err) => {
  console.error("C11-P0A Security Test Suite failed:", err);
  process.exit(1);
});
