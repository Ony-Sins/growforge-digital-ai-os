import path from "node:path";
import fs from "node:fs";

async function run() {
  console.log("=================================================");
  console.log(" TESTING REAL HEADLESS COMFYUI STARTUP & IMAGE GEN");
  console.log("=================================================\n");

  // Load environment from .env.local
  const envPath = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }

  const { comfyuiTool } = await import("@/lib/tools/comfyui");

  console.log("[Step 1] Requesting real image generation for coffee prompt...");
  const prompt = "A photorealistic steaming cup of coffee on a wooden table, warm morning light, 8k";

  const startTime = Date.now();
  const result = await comfyuiTool.execute({ prompt });
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\nExecution result (took ${duration}s):`);
  console.log("ok:", result.ok);
  console.log("output:", result.output);
  console.log("media:", JSON.stringify(result.media, null, 2));

  if (!result.ok) {
    console.error("\n❌ FAILED: ComfyUI image generation failed:", result.output);
    process.exit(1);
  }

  if (!result.media || result.media.length === 0 || !result.media[0].url) {
    console.error("\n❌ FAILED: No media artifact returned.");
    process.exit(1);
  }

  console.log("\n[Step 2] Verifying generated image file on disk...");
  const mediaUrl = result.media[0].url;
  console.log("Media URL:", mediaUrl);

  // If url is /api/media/:id, inspect registry
  if (mediaUrl.startsWith("/api/media/")) {
    const id = mediaUrl.replace("/api/media/", "");
    const { getMediaArtifact, getMediaFilePath } = await import("@/lib/mediaStorage");
    const artifact = getMediaArtifact(id);
    console.log("Registry artifact:", artifact);
    if (!artifact) {
      console.error("❌ FAILED: Artifact not found in registry.");
      process.exit(1);
    }
    const mediaRecord = getMediaFilePath(id);
    if (!mediaRecord || !fs.existsSync(mediaRecord.filePath)) {
      console.error("❌ FAILED: Artifact file not found on disk:", mediaRecord?.filePath);
      process.exit(1);
    }
    const stats = fs.statSync(mediaRecord.filePath);
    console.log(`✓ Real image file confirmed on disk (${stats.size} bytes) at: ${mediaRecord.filePath}`);
  }

  console.log("\n=================================================");
  console.log(" ALL REAL COMFYUI EXECUTION TESTS PASSED (100%)");
  console.log("=================================================");
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
