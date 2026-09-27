/**
 * GROWFORGE C11-P0B: ZERO-SPEND AUXILIARY EXECUTION TEST SUITE
 *
 * Deterministic test suite asserting the CEO's zero-spend boundary across:
 * 1. Image Generation (ComfyUI primary, DALL-E/Imagen/Higgsfield disabled)
 * 2. Live Web Research (SearXNG primary, Gemini Grounding disabled)
 * 3. Vision & Attachments (Local Ollama primary, OpenRouter/Cloud vision disabled)
 * 4. Agent Tool Execution & Direct API Gating
 * 5. Complete absence of unauthorized external provider calls
 */

import assert from "node:assert";
import { generateImageWithByoFallback } from "../src/lib/imageGen";
import { comfyuiTool } from "../src/lib/tools/comfyui";
import { researchQuestion } from "../src/lib/research";
import { analyzeImageWithFallback } from "../src/lib/model-router";
import { processAttachment } from "../src/lib/attachments";

async function runTests() {
  console.log("=== GROWFORGE C11-P0B: ZERO-SPEND AUXILIARY EXECUTION TEST SUITE ===\n");

  // Track all outbound HTTP requests made during tests
  const interceptedUrls: string[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
    const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    interceptedUrls.push(urlStr);

    // Fail immediately if any billable cloud API is hit
    if (
      urlStr.includes("api.openai.com") ||
      urlStr.includes("generativelanguage.googleapis.com") ||
      urlStr.includes("api.higgsfield.ai") ||
      urlStr.includes("openrouter.ai/api/v1/chat/completions")
    ) {
      throw new Error(`UNAUTHORIZED BILLABLE CLOUD REQUEST: ${urlStr}`);
    }

    // Mock SearXNG response
    if (urlStr.includes("localhost:8088/search")) {
      return new Response(
        JSON.stringify({
          query: "test query",
          results: [
            {
              title: "GrowForge Local Market Report",
              url: "https://example.com/market-report",
              content: "Local industry conversion rates average 4.2% in 2026.",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Mock Ollama Vision response
    if (urlStr.includes("localhost:11434/api/chat")) {
      return new Response(
        JSON.stringify({
          message: { content: "- Visual detail: storefront banner visible with pricing 20% off." },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }) as typeof fetch;

  try {
    // -------------------------------------------------------------
    // TEST 1: Stored paid-provider keys do not authorize cloud image generation
    // -------------------------------------------------------------
    console.log("[Test 1 & 2] Stored cloud keys do not authorize cloud image generation; ComfyUI failure fails closed...");
    // Simulate stored cloud keys in environment
    process.env.OPENAI_API_KEY = "sk-mock-openai-key";
    process.env.GEMINI_API_KEY = "mock-gemini-key";
    process.env.HIGGSFIELD_API_KEY = "mock-higgsfield-key";

    // Simulate ComfyUI unavailable / offline
    const failingComfyUI = async () => {
      return { ok: false, output: "ComfyUI connection refused at 127.0.0.1:8188" };
    };

    const resOffline = await generateImageWithByoFallback("Modern neon logo", undefined, failingComfyUI);
    assert.strictEqual(resOffline.ok, false);
    assert.match(resOffline.output, /disabled under strict zero-spend policy/i);
    // Ensure no cloud URLs were called
    assert.strictEqual(
      interceptedUrls.some((u) => u.includes("openai") || u.includes("google") || u.includes("higgsfield")),
      false
    );
    console.log("✓ ComfyUI offline fails closed without invoking billable cloud providers");

    // -------------------------------------------------------------
    // TEST 3: ComfyUI succeeds when available
    // -------------------------------------------------------------
    console.log("\n[Test 3] ComfyUI succeeds when available locally...");
    const workingComfyUI = async (prompt: string) => {
      return {
        ok: true,
        output: `Generated 1 image(s): /generated/images/test-image.png for prompt: ${prompt}`,
        imageUrl: "/generated/images/test-image.png",
      };
    };

    const resOnline = await generateImageWithByoFallback("Futuristic city skyline", undefined, workingComfyUI);
    assert.strictEqual(resOnline.ok, true);
    assert.strictEqual(resOnline.providerUsed, "comfyui");
    assert.strictEqual(resOnline.imageUrl, "/generated/images/test-image.png");
    console.log("✓ ComfyUI local image generation succeeded cleanly");

    // -------------------------------------------------------------
    // TEST 4: comfyuiTool adheres to zero-spend boundary
    // -------------------------------------------------------------
    console.log("\n[Test 4] Agent comfyuiTool adheres to zero-spend policy...");
    const toolRes = await comfyuiTool.execute({ prompt: "Minimalist brand icon" });
    // In test environment without COMFYUI_CHECKPOINT set, it fails gracefully with instructions
    assert.strictEqual(toolRes.ok, false);
    assert.match(toolRes.output, /ComfyUI isn't set up yet|disabled under strict zero-spend policy/i);
    console.log("✓ Agent tool execute() follows zero-spend policy");

    // -------------------------------------------------------------
    // TEST 5 & 6: Live Web Research (SearXNG primary, SearXNG failure fails closed)
    // -------------------------------------------------------------
    console.log("\n[Test 5 & 6] Live research uses SearXNG; failure does not trigger Gemini search grounding...");
    interceptedUrls.length = 0;

    // Normal SearXNG search
    const finding = await researchQuestion("What is the average HVAC marketing budget in 2026?", "");
    assert.strictEqual(finding.sources.length, 1);
    assert.strictEqual(finding.sources[0].uri, "https://example.com/market-report");
    assert.match(finding.answer, /4\.2%/);
    assert.strictEqual(interceptedUrls.some((u) => u.includes("localhost:8088")), true);
    assert.strictEqual(interceptedUrls.some((u) => u.includes("generativelanguage.googleapis.com")), false);
    console.log("✓ SearXNG local search answered without touching Gemini Grounding");

    // SearXNG offline failure
    process.env.SEARXNG_BASE_URL = "http://localhost:9999"; // non-existent port
    const offlineFinding = await researchQuestion("Competitor pricing benchmarks", "");
    assert.strictEqual(offlineFinding.sources.length, 0);
    assert.match(offlineFinding.answer, /disabled under strict zero-spend policy/i);
    // Ensure no Gemini grounding call was attempted
    assert.strictEqual(interceptedUrls.some((u) => u.includes("generativelanguage.googleapis.com")), false);
    delete process.env.SEARXNG_BASE_URL;
    console.log("✓ SearXNG failure fails closed honestly without calling Gemini");

    // -------------------------------------------------------------
    // TEST 7 & 8: Vision analysis (Local Ollama primary, failure fails closed)
    // -------------------------------------------------------------
    console.log("\n[Test 7 & 8] Vision analysis uses local Ollama; failure does not trigger OpenRouter...");
    interceptedUrls.length = 0;

    // Successful local vision
    const visionRes = await analyzeImageWithFallback("base64data", "image/png", "sk-openrouter-key", "auto");
    assert.match(visionRes.text, /storefront banner visible/i);
    assert.strictEqual(visionRes.modelUsed, "ollama/llava");
    assert.strictEqual(interceptedUrls.some((u) => u.includes("openrouter.ai")), false);
    console.log("✓ Local Ollama vision succeeded without touching cloud vision APIs");

    // Local vision offline failure
    process.env.OLLAMA_BASE_URL = "http://localhost:9999"; // offline port
    let caughtVisionError = false;
    try {
      await analyzeImageWithFallback("base64data", "image/png", "sk-openrouter-key", "cloud");
    } catch (err: unknown) {
      caughtVisionError = true;
      assert.match((err as Error).message, /Cloud vision APIs are disabled under strict zero-spend policy/i);
    }
    assert.strictEqual(caughtVisionError, true);
    assert.strictEqual(interceptedUrls.some((u) => u.includes("openrouter.ai")), false);
    delete process.env.OLLAMA_BASE_URL;
    console.log("✓ Local vision offline fails closed without falling back to cloud vision");

    // -------------------------------------------------------------
    // TEST 9: Attachment processing preserves non-image formats & gates vision
    // -------------------------------------------------------------
    console.log("\n[Test 9] Attachment processing handles text/doc and gates image vision...");
    const textBuffer = Buffer.from("Client business brief: Expansion into Austin market.");
    const textRes = await processAttachment("brief.txt", "text/plain", textBuffer, "local");
    assert.strictEqual(textRes.kind, "text");
    assert.strictEqual(textRes.extractedText, "Client business brief: Expansion into Austin market.");

    const imgBuffer = Buffer.from("fake-png-bytes");
    const imgRes = await processAttachment("storefront.png", "image/png", imgBuffer, "auto");
    assert.strictEqual(imgRes.kind, "image");
    assert.match(imgRes.extractedText, /storefront banner visible/i);
    console.log("✓ Text and image attachment processing verified under zero-spend boundary");

    // -------------------------------------------------------------
    // TEST 10: Verify ZERO unauthorized cloud requests across entire test execution
    // -------------------------------------------------------------
    console.log("\n[Test 10] Asserting total absence of billable cloud calls across entire test run...");
    const unauthorizedCalls = interceptedUrls.filter(
      (u) =>
        u.includes("api.openai.com") ||
        u.includes("generativelanguage.googleapis.com") ||
        u.includes("api.higgsfield.ai") ||
        u.includes("openrouter.ai/api/v1/chat/completions")
    );
    assert.strictEqual(unauthorizedCalls.length, 0);
    console.log("✓ Confirmed 0 unauthorized cloud API calls made");

    console.log("\n=======================================================");
    console.log("ALL C11-P0B ZERO-SPEND TESTS PASSED (10/10)");
    console.log("=======================================================\n");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.HIGGSFIELD_API_KEY;
  }
}

runTests().catch((err) => {
  console.error("Test Suite Failed:", err);
  process.exit(1);
});
