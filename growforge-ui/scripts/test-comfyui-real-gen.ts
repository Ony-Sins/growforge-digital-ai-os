import path from "node:path";
import fs from "node:fs";

// Load local environment configuration from .env.local
const envLocalPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) {
  const content = fs.readFileSync(envLocalPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

async function main() {
  console.log("=== Testing Real Local ComfyUI Image Generation ===");
  console.log("ComfyUI Server URL:", process.env.COMFYUI_SERVER_URL || "http://127.0.0.1:8188");
  console.log("ComfyUI Checkpoint:", process.env.COMFYUI_CHECKPOINT || "not set");

  // Dynamic import so environment variables are loaded first
  const { comfyuiTool } = await import("../src/lib/tools/comfyui");

  const prompt = "a sleek glowing futuristic crystal orb in dark cyberspace, gold and blue neon, highly detailed";
  console.log(`\nSubmitting real test prompt: "${prompt}"...`);

  const startTime = Date.now();
  const res = await comfyuiTool.execute({ prompt });
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`\nGeneration completed in ${duration}s`);
  console.log("Result status:", res.ok ? "SUCCESS" : "FAILED");
  console.log("Tool output:", res.output);
  console.log("Tool media:", res.media);

  if (!res.ok) {
    console.error("Test failed:", res.output);
    process.exit(1);
  }

  if (!res.media || res.media.length === 0 || !res.media[0].url) {
    console.error("Test failed: res.media was not populated!", res);
    process.exit(1);
  }

  // Parse image path from output
  const match = res.output.match(/\/generated\/images\/[a-zA-Z0-9_-]+\.png/);
  if (!match) {
    console.error("Could not find generated image path in output:", res.output);
    process.exit(1);
  }

  const relativeUrl = match[0];
  const diskPath = path.join(process.cwd(), "public", relativeUrl);

  if (!fs.existsSync(diskPath)) {
    console.error("Generated image does not exist on disk:", diskPath);
    process.exit(1);
  }

  const stat = fs.statSync(diskPath);
  console.log(`\n✓ Verified real image on disk: ${diskPath}`);
  console.log(`✓ Image file size: ${(stat.size / 1024).toFixed(2)} KB`);
  console.log("\nAll ComfyUI offline image generation checks passed!");
}

main().catch((err) => {
  console.error("Unhandled test error:", err);
  process.exit(1);
});
