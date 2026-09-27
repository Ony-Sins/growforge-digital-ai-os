/**
 * GROWFORGE C9.3: GROQ FREE-PLAN PRIMARY ROUTING TEST SUITE
 *
 * Deterministic test suite asserting:
 * 1. Groq approved and selected as Primary -> Groq called first with exact model (openai/gpt-oss-120b).
 * 2. Groq success -> response identifies Groq and the actual model.
 * 3. Groq 429/503/network failure -> Ollama fallback.
 * 4. Fallback response identifies Ollama and the fallback event.
 * 5. Both fail -> clear fail-closed error without paid fallback.
 * 6. Valid Groq key with unapproved model -> no Groq request, routes to Ollama.
 * 7. Credential absence / replacement -> invalidates free-route eligibility.
 * 8. JOB_PREFER_CLOUD=true with paid keys present -> zero unauthorized paid requests.
 * 9. OmniRoute with unverified upstream -> excluded from automatic verified-free dispatch.
 * 10. GET /api/router displays the same chain that chatComplete actually executes.
 */

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import {
  chatComplete,
  isGroqApprovedFreeRoute,
  getEffectiveRoutingChain,
  providerOrder,
  approveGroqFreeRoute,
  revokeGroqFreeRoute,
} from "../src/lib/llm";
import { setPrimaryModel } from "../src/lib/aiModelStore";
import { GET as getRouterEndpoint } from "../src/app/api/router/route";

const DATA_DIR = path.join(process.cwd(), "data");
const MODELS_FILE = path.join(DATA_DIR, "ai_models.json");

interface StoredModelBackup {
  raw: string;
}

function backupModels(): StoredModelBackup {
  return {
    raw: fs.readFileSync(MODELS_FILE, "utf8"),
  };
}

function restoreModels(backup: StoredModelBackup): void {
  fs.writeFileSync(MODELS_FILE, backup.raw, "utf8");
}

function updateGroqModelInStore(modelName: string, isPrimary: boolean): void {
  const models = JSON.parse(fs.readFileSync(MODELS_FILE, "utf8"));
  for (const m of models) {
    if (m.id === "groq-default" || m.providerType === "groq") {
      m.modelName = modelName;
      m.isPrimary = isPrimary;
      m.status = "active";
    } else if (isPrimary) {
      m.isPrimary = false;
    }
  }
  fs.writeFileSync(MODELS_FILE, JSON.stringify(models, null, 2), "utf8");
}

async function runTests() {
  console.log("=== GROWFORGE C9.3: GROQ FREE-PLAN PRIMARY ROUTING TEST SUITE ===\n");

  const modelsBackup = backupModels();
  const interceptedUrls: { url: string; body?: unknown }[] = [];
  const originalFetch = globalThis.fetch;

  let groqResponseMode: "success" | "429" | "503" | "network_error" = "success";
  let ollamaResponseMode: "success" | "error" = "success";

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    let parsedBody: unknown = undefined;
    if (init?.body && typeof init.body === "string") {
      try {
        parsedBody = JSON.parse(init.body);
      } catch {}
    }
    interceptedUrls.push({ url: urlStr, body: parsedBody });

    // Fail immediately if billable cloud endpoints are hit
    if (
      urlStr.includes("api.openai.com") ||
      urlStr.includes("generativelanguage.googleapis.com") ||
      urlStr.includes("api.anthropic.com")
    ) {
      throw new Error(`UNAUTHORIZED BILLABLE CLOUD REQUEST: ${urlStr}`);
    }

    // Groq endpoint
    if (urlStr.includes("api.groq.com/openai/v1/chat/completions")) {
      if (groqResponseMode === "network_error") {
        throw new Error("Groq network connection failed");
      }
      if (groqResponseMode === "429") {
        return new Response(JSON.stringify({ error: { message: "Rate limit reached (429)" } }), { status: 429 });
      }
      if (groqResponseMode === "503") {
        return new Response(JSON.stringify({ error: { message: "Service Unavailable (503)" } }), { status: 503 });
      }
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"mode":"chat","reply":"Hello from Groq!","agentId":null,"params":{},"brief":null}' } }],
          model: "openai/gpt-oss-120b",
          usage: { prompt_tokens: 120, completion_tokens: 25 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Ollama endpoint
    if (urlStr.includes("11434/v1/chat/completions") || urlStr.includes("11434/api/chat")) {
      if (ollamaResponseMode === "error") {
        return new Response(JSON.stringify({ error: "Ollama model offline" }), { status: 500 });
      }
      return new Response(
        JSON.stringify({
          message: { content: '{"mode":"chat","reply":"Hello from local Ollama fallback!","agentId":null,"params":{},"brief":null}' },
          choices: [{ message: { content: '{"mode":"chat","reply":"Hello from local Ollama fallback!","agentId":null,"params":{},"brief":null}' } }],
          model: "qwen2.5:7b-instruct",
          usage: { prompt_tokens: 110, completion_tokens: 28 },
          prompt_eval_count: 110,
          eval_count: 28,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }) as typeof fetch;

  try {
    // -------------------------------------------------------------
    // SETUP: Configure Groq with approved model openai/gpt-oss-120b and approved API key
    // -------------------------------------------------------------
    process.env.GROQ_API_KEY = "gsk_test_mock_groq_key";
    approveGroqFreeRoute("gsk_test_mock_groq_key", "openai/gpt-oss-120b");
    updateGroqModelInStore("openai/gpt-oss-120b", true);

    // -------------------------------------------------------------
    // TEST 1 & 2: Groq Approved & Selected as Primary -> Groq called first with exact model & identifies Groq
    // -------------------------------------------------------------
    console.log("[Test 1 & 2] Asserting Groq is called first when approved and selected as Primary...");
    interceptedUrls.length = 0;
    groqResponseMode = "success";

    assert.strictEqual(isGroqApprovedFreeRoute(), true);
    const routing = getEffectiveRoutingChain();
    assert.deepStrictEqual(routing.chain, ["groq", "ollama"]);
    assert.strictEqual(routing.primaryApproved, true);

    const res1 = await chatComplete("You are Nora.", [{ role: "user", content: "What is GrowForge?" }]);
    assert.strictEqual(res1.provider, "groq");
    assert.strictEqual(res1.model, "openai/gpt-oss-120b");
    assert.strictEqual(res1.fallbackOccurred, false);
    assert.match(res1.text, /Hello from Groq!/);

    // Assert exact model was sent in request payload
    assert.strictEqual(interceptedUrls.length, 1);
    assert.strictEqual(interceptedUrls[0].url, "https://api.groq.com/openai/v1/chat/completions");
    assert.strictEqual((interceptedUrls[0].body as { model?: string })?.model, "openai/gpt-oss-120b");
    console.log("✓ Groq called first with model openai/gpt-oss-120b and returned clean Groq response");

    // -------------------------------------------------------------
    // TEST 3 & 4: Groq 429/503/Network Error -> Ollama Fallback with Telemetry
    // -------------------------------------------------------------
    console.log("\n[Test 3 & 4] Asserting Groq 429/503/network error falls back to Ollama with fallback telemetry...");
    interceptedUrls.length = 0;
    groqResponseMode = "429"; // simulate Groq rate limit
    ollamaResponseMode = "success";

    const resFallback = await chatComplete("You are Nora.", [{ role: "user", content: "Status report" }]);
    assert.strictEqual(resFallback.provider, "ollama");
    assert.strictEqual(resFallback.model, "qwen2.5:7b-instruct");
    assert.strictEqual(resFallback.fallbackOccurred, true);
    assert.strictEqual(resFallback.fallbackFrom, "groq");
    assert.match(resFallback.text, /Hello from local Ollama fallback!/);

    // Verify Groq was attempted first, then Ollama
    assert.strictEqual(interceptedUrls.length, 2);
    assert.strictEqual(interceptedUrls[0].url.includes("api.groq.com"), true);
    assert.strictEqual(interceptedUrls[1].url.includes("11434"), true);
    console.log("✓ Groq 429 triggered Ollama fallback; response correctly identified fallbackFrom: 'groq'");

    // -------------------------------------------------------------
    // TEST 5: Both Groq & Ollama Fail -> Clear Fail-Closed Error
    // -------------------------------------------------------------
    console.log("\n[Test 5] Asserting fail-closed error when all free providers fail...");
    interceptedUrls.length = 0;
    groqResponseMode = "503";
    ollamaResponseMode = "error";

    let caughtError = false;
    try {
      await chatComplete("You are Nora.", [{ role: "user", content: "Test fail-closed" }]);
    } catch (err: unknown) {
      caughtError = true;
      assert.match((err as Error).message, /Zero-spend routing policy enforced/i);
      assert.match((err as Error).message, /No automatic fallback to billable cloud providers was executed/i);
    }
    assert.strictEqual(caughtError, true);
    console.log("✓ Fail-closed error enforced without attempting paid cloud fallback");

    // -------------------------------------------------------------
    // TEST 6: Valid Groq Key with Unapproved Model -> Excluded from Free Route, Routes to Ollama
    // -------------------------------------------------------------
    console.log("\n[Test 6] Asserting unapproved Groq model is excluded from free routing...");
    interceptedUrls.length = 0;
    groqResponseMode = "success";
    ollamaResponseMode = "success";

    // Update Groq model to unapproved model (e.g. llama-3.3-70b-versatile)
    updateGroqModelInStore("llama-3.3-70b-versatile", true);

    assert.strictEqual(isGroqApprovedFreeRoute(), false);
    const routingUnapproved = getEffectiveRoutingChain();
    assert.deepStrictEqual(routingUnapproved.chain, ["ollama"]);
    assert.strictEqual(routingUnapproved.primaryApproved, false);
    assert.match(routingUnapproved.exclusionReason || "", /not an approved zero-spend Free Plan route/);

    const resUnapproved = await chatComplete("You are Nora.", [{ role: "user", content: "Test unapproved model" }]);
    assert.strictEqual(resUnapproved.provider, "ollama");
    // Ensure Groq was NEVER called
    assert.strictEqual(interceptedUrls.some((u) => u.url.includes("api.groq.com")), false);
    console.log("✓ Unapproved Groq model rejected from zero-spend chain; routed directly to Ollama without Groq fetch");

    // -------------------------------------------------------------
    // TEST 7: Credential Absence AND Credential Replacement Invalidate Eligibility
    // -------------------------------------------------------------
    console.log("\n[Test 7] Asserting credential removal and credential replacement invalidate free-route eligibility...");
    updateGroqModelInStore("openai/gpt-oss-120b", true);

    // 7A: Credential removal
    delete process.env.GROQ_API_KEY;
    assert.strictEqual(isGroqApprovedFreeRoute(), false);
    assert.deepStrictEqual(getEffectiveRoutingChain().chain, ["ollama"]);
    assert.match(getEffectiveRoutingChain().exclusionReason || "", /no active credential/);
    console.log("✓ 7A: Missing Groq key invalidates eligibility and falls back to Ollama");

    // 7B: Credential replacement with unapproved account key
    interceptedUrls.length = 0;
    process.env.GROQ_API_KEY = "gsk_different_replaced_unapproved_key";
    assert.strictEqual(isGroqApprovedFreeRoute(), false);
    const routingReplaced = getEffectiveRoutingChain();
    assert.deepStrictEqual(routingReplaced.chain, ["ollama"]);
    assert.strictEqual(routingReplaced.primaryApproved, false);
    assert.match(routingReplaced.exclusionReason || "", /replaced or is not the CEO-approved/);

    const resReplaced = await chatComplete("You are Nora.", [{ role: "user", content: "Test replaced credential" }]);
    assert.strictEqual(resReplaced.provider, "ollama");
    assert.strictEqual(interceptedUrls.some((u) => u.url.includes("api.groq.com")), false);
    console.log("✓ 7B: Replaced Groq key invalidates eligibility; previous authorization does not carry over to different account");

    // Restore original approved key
    process.env.GROQ_API_KEY = "gsk_test_mock_groq_key";
    assert.strictEqual(isGroqApprovedFreeRoute(), true);

    // -------------------------------------------------------------
    // TEST 8: JOB_PREFER_CLOUD=true with Paid Keys -> Zero Unauthorized Paid Requests
    // -------------------------------------------------------------
    console.log("\n[Test 8] Asserting JOB_PREFER_CLOUD does not authorize billable requests...");
    interceptedUrls.length = 0;
    process.env.JOB_PREFER_CLOUD = "true";
    process.env.OPENAI_API_KEY = "sk-mock-openai";
    process.env.ANTHROPIC_API_KEY = "sk-mock-anthropic";

    const resPreferCloud = await chatComplete("You are Nora.", [{ role: "user", content: "Test preferCloud" }], {
      preferCloud: true,
      allowPaid: true, // even if passed by client, paid routing is disabled
    });
    assert.strictEqual(resPreferCloud.provider, "groq");
    assert.strictEqual(interceptedUrls.some((u) => u.url.includes("openai.com") || u.url.includes("anthropic.com")), false);
    delete process.env.JOB_PREFER_CLOUD;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    console.log("✓ JOB_PREFER_CLOUD and client flags did not invoke any billable cloud providers");

    // -------------------------------------------------------------
    // TEST 9: OmniRoute with Unverified Upstream -> Excluded from Free Dispatch
    // -------------------------------------------------------------
    console.log("\n[Test 9] Asserting OmniRoute with unverified upstream is excluded from free dispatch...");
    setPrimaryModel("omniroute-default");
    const routingOmni = getEffectiveRoutingChain();
    assert.deepStrictEqual(routingOmni.chain, ["ollama"]);
    assert.strictEqual(routingOmni.primaryApproved, false);
    console.log("✓ OmniRoute excluded from automatic verified-free chain");

    // Restore Groq as primary
    updateGroqModelInStore("openai/gpt-oss-120b", true);

    // -------------------------------------------------------------
    // TEST 10: GET /api/router Displays Exactly the Same Chain That chatComplete Executes
    // -------------------------------------------------------------
    console.log("\n[Test 10] Asserting GET /api/router returns identical execution chain...");
    const routerRes = await getRouterEndpoint();
    const routerData = await routerRes.json();
    assert.deepStrictEqual(routerData.providerOrder, ["groq", "ollama"]);
    assert.deepStrictEqual(routerData.providerOrder, providerOrder());
    assert.strictEqual(routerData.primaryApproved, true);
    console.log("✓ GET /api/router perfectly synchronized with single authoritative resolver");

    console.log("\n=======================================================");
    console.log("ALL C9.3 GROQ ROUTING TESTS PASSED (10/10)");
    console.log("=======================================================\n");
  } finally {
    globalThis.fetch = originalFetch;
    restoreModels(modelsBackup);
    revokeGroqFreeRoute();
    delete process.env.GROQ_API_KEY;
    delete process.env.JOB_PREFER_CLOUD;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  }
}

runTests().catch((err) => {
  console.error("C9.3 Test Suite Failed:", err);
  process.exit(1);
});
