import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import type { Tool, MediaItem } from "@/lib/tools";
import { generateImageWithByoFallback } from "@/lib/imageGen";

/**
 * ComfyUI local image generation (https://github.com/comfyanonymous/ComfyUI)
 * — free, offline, GPU-bound. Uses the standard CheckpointLoaderSimple →
 * CLIPTextEncode → EmptyLatentImage → KSampler → VAEDecode → SaveImage
 * graph, the one shape that's stayed stable across ComfyUI versions and
 * works for both SD1.5 and SDXL-family checkpoints (including Turbo/
 * Lightning distills) — only the sampler settings differ between them,
 * which is exactly what's exposed via env vars below rather than hardcoded.
 *
 * Setup: install ComfyUI, download one checkpoint into its models/checkpoints
 * folder, run it (`python main.py`), and set COMFYUI_CHECKPOINT to that
 * checkpoint's exact filename. On an 8GB-VRAM card, an SDXL-Turbo or
 * SD1.5 checkpoint at default settings is the realistic choice — full SDXL
 * will be slow. COMFYUI_STEPS/CFG/SAMPLER default to Turbo-friendly values
 * (few steps, low cfg); override them for a standard SD1.5 checkpoint (see
 * .env.example for both presets).
 *
 * Headless Execution: If ComfyUI is installed and COMFYUI_PATH or COMFYUI_SCRIPT
 * is configured in the environment, GrowForge will auto-start it headlessly
 * in the background without requiring the user to open a terminal or browser.
 */

const SERVER_URL = (process.env.COMFYUI_SERVER_URL || "http://127.0.0.1:8188").replace(/\/+$/, "");
const CHECKPOINT = process.env.COMFYUI_CHECKPOINT || "";
const EXECUTABLE_PATH = process.env.COMFYUI_PATH || process.env.COMFYUI_SCRIPT || "";
const STEPS = Number(process.env.COMFYUI_STEPS) || 8;
const CFG = Number(process.env.COMFYUI_CFG) || 1.5;
const SAMPLER = process.env.COMFYUI_SAMPLER || "euler_ancestral";
const SCHEDULER = process.env.COMFYUI_SCHEDULER || "sgm_uniform";
const WIDTH = Number(process.env.COMFYUI_WIDTH) || 1024;
const HEIGHT = Number(process.env.COMFYUI_HEIGHT) || 1024;
const POLL_INTERVAL_MS = 1_500;
const POLL_TIMEOUT_MS = 120_000;
const MAX_PROMPT_LENGTH = 800;

export function getComfyUIEnv(): NodeJS.ProcessEnv {
  const ALLOWED_VARS = [
    "PATH",
    "Path",
    "SYSTEMROOT",
    "SystemRoot",
    "SYSTEMDRIVE",
    "SystemDrive",
    "TEMP",
    "TMP",
    "CUDA_PATH",
    "CUDA_HOME",
    "CUDA_VISIBLE_DEVICES",
    "PYTHONPATH",
    "PYTHONHOME",
    "COMSPEC",
    "ComSpec",
    "PATHEXT",
    "APPDATA",
    "LOCALAPPDATA",
    "USERPROFILE",
    "USERNAME",
    "HOMEDRIVE",
    "HOMEPATH",
    "ALLUSERSPROFILE",
    "PROGRAMDATA",
    "ProgramData",
    "PROGRAMFILES",
    "ProgramFiles",
    "PROGRAMFILES(X86)",
    "ProgramFiles(x86)",
    "WINDIR",
    "windir",
    "NUMBER_OF_PROCESSORS",
    "PROCESSOR_ARCHITECTURE",
    "OS",
  ];
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: process.env.NODE_ENV || "production",
  };
  for (const v of ALLOWED_VARS) {
    if (process.env[v] !== undefined) {
      env[v] = process.env[v];
    }
  }
  return env;
}

let isSpawning = false;

async function isServiceRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${SERVER_URL}/system_stats`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureComfyUIService(): Promise<{ ready: boolean; error?: string }> {
  if (await isServiceRunning()) {
    return { ready: true };
  }

  const targetPath = EXECUTABLE_PATH || "";

  // If already running or no fixed owner path configured, cannot auto-spawn
  if (!targetPath) {
    return {
      ready: false,
      error: "ComfyUI is offline at " + SERVER_URL + ". To enable headless auto-startup, set COMFYUI_PATH in .env.local to your local ComfyUI installation or run script.",
    };
  }

  // Verify configured path exists before attempting execution
  if (!fs.existsSync(targetPath)) {
    return {
      ready: false,
      error: `Configured COMFYUI_PATH does not exist: "${targetPath}". Please verify the path.`,
    };
  }

  if (isSpawning) {
    // Wait for in-flight spawn to complete
    const deadline = Date.now() + 35_000;
    while (Date.now() < deadline) {
      await sleep(1000);
      if (await isServiceRunning()) return { ready: true };
    }
    return { ready: false, error: "Timed out waiting for ComfyUI background service to become ready." };
  }

  isSpawning = true;
  try {
    let spawnCmd = targetPath;
    let spawnArgs: string[] = [];
    let spawnCwd = targetPath;
    let isBatOrCmd = false;

    const stat = fs.statSync(targetPath);
    if (stat.isDirectory()) {
      spawnCwd = targetPath;
      const venvPy = path.join(targetPath, ".venv", "Scripts", "python.exe");
      const embedPy = path.join(targetPath, "python_embeded", "python.exe");
      const mainPy = path.join(targetPath, "main.py");

      if (fs.existsSync(venvPy)) {
        spawnCmd = venvPy;
      } else if (fs.existsSync(embedPy)) {
        spawnCmd = embedPy;
      } else {
        spawnCmd = "python";
      }

      if (fs.existsSync(mainPy)) {
        spawnArgs = [mainPy, "--listen", "127.0.0.1", "--port", "8188", "--disable-cuda-malloc", "--dont-print-server"];
      } else {
        isSpawning = false;
        return { ready: false, error: `main.py not found in ComfyUI directory: ${targetPath}` };
      }
    } else {
      spawnCwd = path.dirname(targetPath);
      isBatOrCmd = targetPath.endsWith(".bat") || targetPath.endsWith(".cmd");
      if (targetPath.endsWith(".py")) {
        const parentDir = path.dirname(targetPath);
        const venvPy = path.join(parentDir, ".venv", "Scripts", "python.exe");
        spawnCmd = fs.existsSync(venvPy) ? venvPy : "python";
        spawnArgs = [targetPath, "--listen", "127.0.0.1", "--port", "8188", "--disable-cuda-malloc", "--dont-print-server"];
      } else if (targetPath.endsWith(".exe") && !isBatOrCmd) {
        spawnCmd = targetPath;
        const mainPy = path.join(spawnCwd, "main.py");
        if (fs.existsSync(mainPy)) {
          spawnArgs = [mainPy, "--listen", "127.0.0.1", "--port", "8188", "--disable-cuda-malloc", "--dont-print-server"];
        }
      }
    }

    const child = spawn(spawnCmd, spawnArgs, {
      cwd: spawnCwd,
      detached: true,
      stdio: "ignore",
      shell: isBatOrCmd,
      windowsHide: true,
      env: getComfyUIEnv(),
    });
    child.unref();

    // Poll until ready (up to 35s for cold start)
    const deadline = Date.now() + 35_000;
    while (Date.now() < deadline) {
      await sleep(1500);
      if (await isServiceRunning()) {
        isSpawning = false;
        return { ready: true };
      }
    }
    isSpawning = false;
    return { ready: false, error: "ComfyUI process started but did not respond on " + SERVER_URL + " within 35 seconds." };
  } catch (err) {
    isSpawning = false;
    return {
      ready: false,
      error: `Failed to launch ComfyUI headlessly: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function isConfigured(): boolean {
  return Boolean(CHECKPOINT || (EXECUTABLE_PATH && fs.existsSync(path.join(EXECUTABLE_PATH, "models/checkpoints/v1-5-pruned-emaonly.safetensors"))));
}

function setupInstructions(): string {
  return (
    "ComfyUI isn't set up yet. Install it from https://github.com/comfyanonymous/ComfyUI, " +
    "download one checkpoint into its models/checkpoints folder, run it (`python main.py`), " +
    "then set COMFYUI_CHECKPOINT in .env.local to that checkpoint's exact filename. " +
    "On an 8GB-VRAM card, an SDXL-Turbo or SD1.5 checkpoint is the realistic choice — see " +
    "the two presets in .env.example (COMFYUI_STEPS/CFG/SAMPLER)."
  );
}

function buildWorkflow(promptText: string, seed: number): Record<string, unknown> {
  const effectiveCheckpoint = CHECKPOINT || "v1-5-pruned-emaonly.safetensors";
  return {
    "3": {
      class_type: "KSampler",
      inputs: {
        seed,
        steps: STEPS,
        cfg: CFG,
        sampler_name: SAMPLER,
        scheduler: SCHEDULER,
        denoise: 1,
        model: ["4", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["5", 0],
      },
    },
    "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: effectiveCheckpoint } },
    "5": { class_type: "EmptyLatentImage", inputs: { width: WIDTH, height: HEIGHT, batch_size: 1 } },
    "6": { class_type: "CLIPTextEncode", inputs: { text: promptText, clip: ["4", 1] } },
    "7": { class_type: "CLIPTextEncode", inputs: { text: "text, watermark, low quality, blurry", clip: ["4", 1] } },
    "8": { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["4", 2] } },
    "9": { class_type: "SaveImage", inputs: { filename_prefix: "growforge", images: ["8", 0] } },
  };
}

interface QueueResponse {
  prompt_id?: string;
  error?: { message?: string; type?: string };
  node_errors?: Record<string, unknown>;
}

interface HistoryImage {
  filename: string;
  subfolder: string;
  type: string;
}

interface HistoryEntry {
  status?: {
    completed?: boolean;
    status_str?: string;
    messages?: Array<[string, { node_id?: string; node_type?: string; exception_message?: string; exception_type?: string }] | unknown>;
  };
  outputs?: Record<string, { images?: HistoryImage[] }>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function generateImage(promptText: string): Promise<{ ok: boolean; output: string; imageUrl?: string; media?: MediaItem[] }> {
  const serviceCheck = await ensureComfyUIService();
  if (!serviceCheck.ready) {
    return { ok: false, output: serviceCheck.error || setupInstructions() };
  }

  const clientId = crypto.randomUUID();
  const workflow = buildWorkflow(promptText, Math.floor(Math.random() * 2 ** 32));

  let queueRes: Response;
  try {
    queueRes = await fetch(`${SERVER_URL}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: workflow, client_id: clientId }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    return { ok: false, output: `${setupInstructions()} (connection failed: ${err instanceof Error ? err.message : String(err)})` };
  }

  let queueData: QueueResponse;
  try {
    queueData = (await queueRes.json()) as QueueResponse;
  } catch {
    return {
      ok: false,
      output: `${SERVER_URL} responded but not with a valid queue response — something else may already be running on that port. ${setupInstructions()}`,
    };
  }

  if (!queueRes.ok || !queueData.prompt_id) {
    const detail = queueData.error?.message || JSON.stringify(queueData.node_errors ?? {}).slice(0, 500);
    return { ok: false, output: `ComfyUI rejected the request${detail ? `: ${detail}` : ""}. Check COMFYUI_CHECKPOINT matches a real file in ComfyUI's models/checkpoints folder.` };
  }

  const promptId = queueData.prompt_id;
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    let historyRes: Response;
    try {
      historyRes = await fetch(`${SERVER_URL}/history/${promptId}`, { signal: AbortSignal.timeout(10_000) });
    } catch (err) {
      return { ok: false, output: `Lost connection to ComfyUI while waiting: ${err instanceof Error ? err.message : String(err)}` };
    }
    if (!historyRes.ok) continue;

    const history = (await historyRes.json()) as Record<string, HistoryEntry>;
    const entry = history[promptId];
    if (entry?.status?.status_str === "error") {
      const messages = entry.status.messages || [];
      const errorMsg = messages
        .map((m) => {
          if (Array.isArray(m) && m[1] && typeof m[1] === "object") {
            const errInfo = m[1] as { node_type?: string; exception_message?: string; exception_type?: string };
            return `${errInfo.node_type ? `Node [${errInfo.node_type}]: ` : ""}${errInfo.exception_message || errInfo.exception_type || "execution error"}`;
          }
          return typeof m === "string" ? m : JSON.stringify(m);
        })
        .join("; ");
      return { ok: false, output: `ComfyUI execution failed: ${errorMsg || "Unknown execution error"}` };
    }
    if (!entry?.status?.completed) continue;

    const images = Object.values(entry.outputs ?? {}).flatMap((o) => o.images ?? []);
    if (images.length === 0) {
      return { ok: false, output: `ComfyUI finished but produced no images (status: ${entry.status?.status_str ?? "unknown"}).` };
    }

    const saved: string[] = [];
    const artifacts: import("@/lib/mediaStorage").MediaArtifact[] = [];
    for (const img of images) {
      const viewUrl = `${SERVER_URL}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${encodeURIComponent(img.type)}`;
      try {
        const imgRes = await fetch(viewUrl, { signal: AbortSignal.timeout(30_000) });
        if (!imgRes.ok) continue;
        const bytes = Buffer.from(await imgRes.arrayBuffer());

        const { saveMediaArtifact } = await import("@/lib/mediaStorage");
        const artifact = saveMediaArtifact(bytes, "png", {
          mediaType: "image",
          prompt: promptText,
          provider: "comfyui",
          workflow: `comfyui-${SAMPLER}`,
          dimensions: { width: WIDTH, height: HEIGHT },
        });
        artifacts.push(artifact);
        saved.push(artifact.url);
      } catch {
        // one image failing to download doesn't fail the whole call — report what did save
      }
    }

    return saved.length > 0
      ? {
          ok: true,
          output: `Generated ${saved.length} image(s): ${saved.join(", ")}`,
          imageUrl: saved[0],
          media: (artifacts.length > 0 ? artifacts : saved.map((url) => ({ type: "image" as const, url }))),
        }
      : { ok: false, output: "ComfyUI produced images but none could be downloaded from its /view endpoint." };
  }

  return { ok: false, output: `Timed out waiting ${POLL_TIMEOUT_MS / 1000}s for ComfyUI to finish generating.` };
}

export const comfyuiTool: Tool = {
  name: "generate_image",
  description:
    "Generates an image from a text description using BYO cloud capability keys (ChatGPT DALL-E 3, Gemini Imagen 3, or Higgsfield) when configured in Settings or agent vault, or falls back to local ComfyUI. Returns a URL to the generated image under /generated/images/.",
  usage: `{ "prompt": "string — a visual description, max ${MAX_PROMPT_LENGTH} characters", "agentId": "string (optional) — calling agent ID for per-agent BYO key lookup" }`,
  requiresApproval: false,
  async execute(args) {
    const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
    if (!prompt) return { ok: false, output: "prompt is required." };
    if (prompt.length > MAX_PROMPT_LENGTH) {
      return { ok: false, output: `Prompt is too long (${prompt.length} chars) — keep it under ${MAX_PROMPT_LENGTH}.` };
    }

    const agentId = typeof args.agentId === "string" ? args.agentId : typeof args.agent === "string" ? args.agent : undefined;

    const localFallback = async (p: string) => {
      if (!isConfigured()) return { ok: false, output: setupInstructions() };
      return await generateImage(p);
    };

    try {
      const result = await generateImageWithByoFallback(prompt, agentId, localFallback);
      const media = result.media || (result.imageUrl ? [{ type: "image" as const, url: result.imageUrl }] : undefined);
      return { ok: result.ok, output: result.output, media };
    } catch (err) {
      return { ok: false, output: `Image generation failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  },
};
