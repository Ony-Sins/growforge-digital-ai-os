/**
 * Test Suite: Nora Media Execution, Groq Approval Security, and Zero-Spend Verification
 * Run with: npx tsx scripts/test-nora-media-execution.ts
 */

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

import {
  saveMediaArtifact,
  getMediaArtifact,
  getMediaFilePath,
  listMediaArtifacts,
} from "../src/lib/mediaStorage";

import {
  isGroqApprovedFreeRoute,
  approveGroqFreeRoute,
  revokeGroqFreeRoute,
  getApprovedFreeRoutes,
} from "../src/lib/llm";

import { generateImageWithByoFallback } from "../src/lib/imageGen";

async function runTests() {
  console.log("=================================================");
  console.log(" RUNNING NORA MEDIA EXECUTION & SECURITY TESTS   ");
  console.log("=================================================");

  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    try {
      const p = fn();
      if (p && typeof (p as Promise<void>).then === "function") {
        return (p as Promise<void>)
          .then(() => {
            console.log(`  ✓ ${name}`);
            passed++;
          })
          .catch((err) => {
            console.error(`  ✗ ${name}`);
            console.error(`    ${err instanceof Error ? err.stack || err.message : String(err)}`);
            failed++;
          });
      }
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err instanceof Error ? err.stack || err.message : String(err)}`);
      failed++;
    }
  }

  // --- 1. GROQ APPROVAL SECURITY & FAIL-CLOSED (Phase A1) ---
  console.log("\n[Phase A1] Groq Approval Security & Fingerprint Verification");

  const FREE_ROUTES_FILE = path.join(process.cwd(), "data", "approved_free_routes.json");
  const backupRoutes = fs.existsSync(FREE_ROUTES_FILE) ? fs.readFileSync(FREE_ROUTES_FILE, "utf8") : null;

  try {
    const originalGroqKey = process.env.GROQ_API_KEY;
    const originalGroqModel = process.env.GROQ_MODEL;

    // Test A1.1: Missing approval record fails closed
    await test("A1.1: Missing or revoked Groq approval fails closed", () => {
      process.env.GROQ_API_KEY = "gsk_test_key_12345";
      process.env.GROQ_MODEL = "openai/gpt-oss-120b";
      revokeGroqFreeRoute();

      const approved = isGroqApprovedFreeRoute();
      assert.strictEqual(approved, false, "Should fail closed when no approval record exists");
      const routes = getApprovedFreeRoutes();
      assert.strictEqual(routes["groq"], undefined, "Should not auto-enroll arbitrary key");
    });

    // Test A1.2: Mismatched replacement key fails closed
    await test("A1.2: Replacement key with different fingerprint fails closed", () => {
      const authorizedKey = "gsk_authorized_key_99999";
      approveGroqFreeRoute(authorizedKey, "openai/gpt-oss-120b");

      process.env.GROQ_API_KEY = "gsk_unauthorized_replacement_key";
      process.env.GROQ_MODEL = "openai/gpt-oss-120b";

      const approved = isGroqApprovedFreeRoute();
      assert.strictEqual(approved, false, "Replacement key must fail closed without explicit reauthorization");
    });

    // Test A1.3: Explicitly authorized exact key + model succeeds
    await test("A1.3: Explicitly authorized key + openai/gpt-oss-120b passes", () => {
      const targetKey = "gsk_valid_free_plan_owner_key";
      approveGroqFreeRoute(targetKey, "openai/gpt-oss-120b");

      process.env.GROQ_API_KEY = targetKey;
      process.env.GROQ_MODEL = "openai/gpt-oss-120b";

      const approved = isGroqApprovedFreeRoute();
      assert.strictEqual(approved, true, "Explicitly approved key must pass verification");
    });

    // Test A1.4: Non-free model on authorized key fails closed
    await test("A1.4: Non-free model on authorized key fails closed", () => {
      const targetKey = "gsk_valid_free_plan_owner_key";
      approveGroqFreeRoute(targetKey, "openai/gpt-oss-120b");

      process.env.GROQ_API_KEY = targetKey;
      process.env.GROQ_MODEL = "llama-3.3-70b-versatile";

      const approved = isGroqApprovedFreeRoute("llama-3.3-70b-versatile");
      assert.strictEqual(approved, false, "Non-approved model must fail closed");
    });

    // Restore env
    if (originalGroqKey) process.env.GROQ_API_KEY = originalGroqKey;
    else delete process.env.GROQ_API_KEY;
    if (originalGroqModel) process.env.GROQ_MODEL = originalGroqModel;
    else delete process.env.GROQ_MODEL;
  } finally {
    if (backupRoutes) {
      fs.writeFileSync(FREE_ROUTES_FILE, backupRoutes, "utf8");
    }
  }

  // --- 2. PERSISTENT MEDIA STORAGE & RETRIEVAL (Phase B4) ---
  console.log("\n[Phase B4] Media Storage, Metadata Registry & Path Security");

  let testArtifactId = "";
  let testFilePath = "";
  const MEDIA_REG_FILE = path.join(process.cwd(), "data", "media_registry.json");
  const backupMediaReg = fs.existsSync(MEDIA_REG_FILE) ? fs.readFileSync(MEDIA_REG_FILE, "utf8") : null;

  try {
    await test("B4.1: saveMediaArtifact persists file and metadata registry entry", () => {
      const fakeImagePng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
      const artifact = saveMediaArtifact(fakeImagePng, "png", {
        mediaType: "image",
        prompt: "A steaming cup of coffee on a wooden table",
        provider: "comfyui",
        workflow: "comfyui-sd-turbo",
        dimensions: { width: 512, height: 512 },
        conversationId: "conv-test-123",
      });

      assert.ok(artifact.id.startsWith("media-"), "ID should have media- prefix");
      assert.strictEqual(artifact.mediaType, "image");
      assert.strictEqual(artifact.mimeType, "image/png");
      assert.strictEqual(artifact.dimensions?.width, 512);
      assert.strictEqual(artifact.dimensions?.height, 512);
      assert.strictEqual(artifact.prompt, "A steaming cup of coffee on a wooden table");
      assert.strictEqual(artifact.provider, "comfyui");
      assert.strictEqual(artifact.status, "completed");
      assert.strictEqual(artifact.url, `/api/media/${artifact.id}`);

      testArtifactId = artifact.id;
      testFilePath = artifact.filePath;

      // Verify registry file on disk
      const lookup = getMediaArtifact(artifact.id);
      assert.ok(lookup, "Artifact must be retrievable from registry");
      assert.strictEqual(lookup?.id, artifact.id);
    });

    await test("B4.2: getMediaFilePath validates path traversal and file existence", () => {
      assert.ok(testArtifactId, "Test artifact ID must be set");
      const fileInfo = getMediaFilePath(testArtifactId);
      assert.ok(fileInfo, "File info must exist for valid artifact");
      assert.ok(fs.existsSync(fileInfo.filePath), "File must exist on disk");
      assert.strictEqual(fileInfo.mimeType, "image/png");

      // Traversal attempts must return null
      assert.strictEqual(getMediaFilePath("../etc/passwd"), null);
      assert.strictEqual(getMediaFilePath("..\\..\\windows\\system32"), null);
      assert.strictEqual(getMediaFilePath("non-existent-media-id"), null);
    });

    await test("B4.3: listMediaArtifacts returns sorted artifacts", () => {
      const list = listMediaArtifacts();
      assert.ok(Array.isArray(list), "Must return an array");
      assert.ok(list.some((a) => a.id === testArtifactId), "Must contain created test artifact");
    });
  } finally {
    if (backupMediaReg) {
      fs.writeFileSync(MEDIA_REG_FILE, backupMediaReg, "utf8");
    }
    if (testFilePath && fs.existsSync(testFilePath)) {
      try {
        fs.unlinkSync(testFilePath);
      } catch {}
    }
  }

  // --- 3. ZERO-SPEND IMAGE GENERATION BOUNDARY (Phase B3) ---
  console.log("\n[Phase B3] Zero-Spend Image Generation Boundary");

  await test("B3.1: generateImageWithByoFallback uses local ComfyUI when available", async () => {
    const mockLocal = async () => ({
      ok: true,
      output: `Generated 1 image(s) via local ComfyUI: /api/media/test-id`,
      imageUrl: "/api/media/test-id",
      media: [{ type: "image" as const, url: "/api/media/test-id" }],
    });

    const result = await generateImageWithByoFallback("a glowing coffee cup", undefined, mockLocal);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.providerUsed, "comfyui");
    assert.strictEqual(result.imageUrl, "/api/media/test-id");
  });

  await test("B3.2: generateImageWithByoFallback fails closed without calling paid APIs when ComfyUI is offline", async () => {
    const mockOfflineLocal = async () => ({
      ok: false,
      output: "connection failed: ECONNREFUSED 127.0.0.1:8188",
    });

    const result = await generateImageWithByoFallback("a coffee cup", undefined, mockOfflineLocal);
    assert.strictEqual(result.ok, false);
    assert.ok(result.output.includes("Local ComfyUI image generation unavailable"));
    assert.ok(result.output.includes("strict zero-spend policy"));
    assert.strictEqual(result.imageUrl, undefined);
  });

  // --- 4. INTENT ROUTING PATTERN CHECKS (Phase B2 & C) ---
  console.log("\n[Phase B2 & Phase C] Intent Recognition Logic");

  await test("B2.1: Explicit image generation prompts are correctly classified", () => {
    const testCases = [
      { msg: "Generate an image of a cup of coffee using any available free tool such as ComfyUI", isImage: true, isVideo: false },
      { msg: "Generate a photorealistic image of a steaming cup of coffee on a wooden table", isImage: true, isVideo: false },
      { msg: "Create a picture of a cyberpunk city at night", isImage: true, isVideo: false },
      { msg: "Draw an illustration of a red fox", isImage: true, isVideo: false },
      { msg: "How do I generate an image using ComfyUI?", isImage: false, isVideo: false },
      { msg: "Can you explain how stable diffusion generates pictures?", isImage: false, isVideo: false },
      { msg: "Generate a video of a sunrise over the mountains", isImage: false, isVideo: true },
      { msg: "Create an animation of a flying bird", isImage: false, isVideo: true },
    ];

    for (const { msg, isImage, isVideo } of testCases) {
      const isExplainingOrQuestion = /\b(?:how\s+(?:to|do|can)|can\s+you\s+(?:explain|tell|help)|what\s+is|where\s+can|tell\s+me\s+about|why\s+(?:is|do|does)|difference\s+between|tutorial|guide)\b/i.test(msg);

      const isExplicitVideoGen =
        !isExplainingOrQuestion &&
        ((/\b(?:generate|create|make|render)\s+(?:(?:an?|the)\s+)?(?:video|animation|clip)\s+(?:of|about|with|showing|depicting)\b/i.test(msg) ||
          /\b(?:video|animation)\s+generation\b/i.test(msg) ||
          /\b(?:generate|create|render)\s+(?:an?\s+)?(?:[a-zA-Z-]+\s+)*(?:video|animation|clip)\b/i.test(msg)));

      const isExplicitImageGen =
        !isExplicitVideoGen &&
        !isExplainingOrQuestion &&
        ((/\b(?:generate|create|make|render|draw)\s+(?:(?:an?|the)\s+)?(?:[a-zA-Z-]+\s+)*(?:image|picture|photo|illustration|graphic|render|artwork|portrait)\s+(?:of|showing|depicting|with|for)\b/i.test(msg) ||
          /\b(?:generate|create|render|draw)\s+(?:an?\s+)?(?:[a-zA-Z-]+\s+)*(?:image|picture|photo|illustration|artwork|portrait)\b/i.test(msg)));

      assert.strictEqual(isImage, isExplicitImageGen, `Image classification mismatch for: "${msg}"`);
      assert.strictEqual(isVideo, isExplicitVideoGen, `Video classification mismatch for: "${msg}"`);
    }
  });

  console.log("\n=================================================");
  console.log(` RESULTS: ${passed} passed, ${failed} failed `);
  console.log("=================================================");

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
