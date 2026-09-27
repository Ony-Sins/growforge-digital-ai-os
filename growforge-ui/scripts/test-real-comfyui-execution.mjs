import path from "node:path";
import fs from "node:fs";

async function run() {
  console.log("=================================================");
  console.log(" TESTING REAL HEADLESS COMFYUI STARTUP & IMAGE GEN");
  console.log("=================================================\n");

  const serverUrl = "http://127.0.0.1:8188";
  const checkpoint = "v1-5-pruned-emaonly.safetensors";
  const promptText = "A photorealistic steaming cup of coffee on a wooden table, warm morning light, 8k";

  // Check if ComfyUI is up
  console.log("[Step 1] Checking ComfyUI server health...");
  const statsRes = await fetch(`${serverUrl}/system_stats`, { signal: AbortSignal.timeout(5000) });
  if (!statsRes.ok) {
    throw new Error(`ComfyUI not responding on ${serverUrl}/system_stats: ${statsRes.status}`);
  }
  const stats = await statsRes.json();
  console.log("✓ ComfyUI is running on GPU:", stats.devices?.[0]?.name || "CUDA GPU");

  console.log("\n[Step 2] Submitting image generation workflow to ComfyUI...");
  const workflow = {
    "3": {
      class_type: "KSampler",
      inputs: {
        seed: Math.floor(Math.random() * 2 ** 32),
        steps: 20,
        cfg: 7,
        sampler_name: "euler",
        scheduler: "normal",
        denoise: 1,
        model: ["4", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["5", 0],
      },
    },
    "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: checkpoint } },
    "5": { class_type: "EmptyLatentImage", inputs: { width: 512, height: 512, batch_size: 1 } },
    "6": { class_type: "CLIPTextEncode", inputs: { text: promptText, clip: ["4", 1] } },
    "7": { class_type: "CLIPTextEncode", inputs: { text: "text, watermark, low quality, blurry", clip: ["4", 1] } },
    "8": { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["4", 2] } },
    "9": { class_type: "SaveImage", inputs: { filename_prefix: "growforge", images: ["8", 0] } },
  };

  const clientId = "growforge-test-" + Date.now();
  const queueRes = await fetch(`${serverUrl}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
    signal: AbortSignal.timeout(10000),
  });

  if (!queueRes.ok) {
    const errBody = await queueRes.text();
    throw new Error(`Queue prompt failed: ${queueRes.status} ${errBody}`);
  }

  const queueData = await queueRes.json();
  const promptId = queueData.prompt_id;
  console.log(`✓ Workflow queued with prompt_id: ${promptId}`);

  console.log("\n[Step 3] Polling ComfyUI generation history until complete...");
  const startTime = Date.now();
  let completed = false;
  let images = [];

  while (Date.now() - startTime < 120000) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const histRes = await fetch(`${serverUrl}/history/${promptId}`, { signal: AbortSignal.timeout(10000) });
      if (!histRes.ok) continue;

      const history = await histRes.json();
      const entry = history[promptId];
      if (entry?.status?.status_str === "error") {
        throw new Error(`ComfyUI generation error: ${JSON.stringify(entry.status)}`);
      }
      if (entry?.status?.completed) {
        completed = true;
        images = Object.values(entry.outputs ?? {}).flatMap((o) => o.images ?? []);
        break;
      }
    } catch {
      // transient timeout while GPU/Torch is busy loading weights; continue polling
    }
  }

  if (!completed || images.length === 0) {
    throw new Error("ComfyUI generation timed out or produced no images.");
  }

  const genDuration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`✓ Image generation completed in ${genDuration}s! Output images:`, images);

  console.log("\n[Step 4] Downloading generated image bytes from ComfyUI /view endpoint...");
  const imgMeta = images[0];
  const viewUrl = `${serverUrl}/view?filename=${encodeURIComponent(imgMeta.filename)}&subfolder=${encodeURIComponent(imgMeta.subfolder)}&type=${encodeURIComponent(imgMeta.type)}`;
  const imgRes = await fetch(viewUrl);
  if (!imgRes.ok) {
    throw new Error(`Failed to download image from /view: ${imgRes.status}`);
  }

  const imageBuffer = Buffer.from(await imgRes.arrayBuffer());
  console.log(`✓ Downloaded ${imageBuffer.length} bytes of genuine PNG data.`);

  // Save to GrowForge media storage
  const mediaStorageDir = path.join(process.cwd(), "data", "media_storage");
  fs.mkdirSync(mediaStorageDir, { recursive: true });
  const artifactId = "img-" + Date.now();
  const artifactPath = path.join(mediaStorageDir, `${artifactId}.png`);
  fs.writeFileSync(artifactPath, imageBuffer);
  console.log(`✓ Persisted genuine artifact to: ${artifactPath}`);

  // Mirror to public generated images
  const publicDir = path.join(process.cwd(), "public", "generated", "images");
  fs.mkdirSync(publicDir, { recursive: true });
  const publicPath = path.join(publicDir, `${artifactId}.png`);
  fs.writeFileSync(publicPath, imageBuffer);
  console.log(`✓ Mirrored to public web assets: ${publicPath}`);

  console.log("\n=================================================");
  console.log(" REAL COMFYUI IMAGE TEST VERIFIED: 100% SUCCESS");
  console.log("=================================================");
}

run().catch((err) => {
  console.error("❌ Test error:", err);
  process.exit(1);
});
