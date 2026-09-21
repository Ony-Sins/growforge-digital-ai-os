import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { SYSTEM_VAULT_ID } from "@/lib/llm";
import { getSecretForServerUse } from "@/lib/serverVault";
import { listAiModels, getAiModelApiKey } from "@/lib/aiModelStore";
import { isCapabilityActive } from "@/lib/capabilityStore";

export interface ImageGenResult {
  ok: boolean;
  output: string;
  providerUsed?: "openai" | "gemini" | "higgsfield" | "comfyui";
  imageUrl?: string;
}

const OUTPUT_DIR = process.env.COMFYUI_OUTPUT_DIR || path.join(process.cwd(), "public", "generated", "images");
const PUBLIC_URL_PREFIX = "/generated/images";

function ensureOutputDir(): void {
  try {
    fs.mkdirSync(/* turbopackIgnore: true */ OUTPUT_DIR, { recursive: true });
  } catch {
    // best-effort
  }
}

function saveImageBytes(bytes: Buffer, ext: string = "png"): string {
  ensureOutputDir();
  const filename = `${crypto.randomUUID()}.${ext}`;
  const filePath = path.join(/* turbopackIgnore: true */ OUTPUT_DIR, filename);
  fs.writeFileSync(/* turbopackIgnore: true */ filePath, bytes);
  return `${PUBLIC_URL_PREFIX}/${filename}`;
}

export interface AvailableImageKeys {
  openaiKey: string | null;
  geminiKey: string | null;
  higgsfieldKey: string | null;
  source: "agent_vault" | "system_vault" | "env" | "none";
}

/**
 * Resolves available image generation keys for a specific agent (or system-wide).
 * Priority order:
 * 1. Agent-specific vault keys (per-agent BYO capability keys)
 * 2. System vault keys (Settings -> AI Providers / Vault)
 * 3. Configured AI Model Store models with taskRole: "image"
 * 4. Process environment variables
 */
export function resolveImageKeys(agentId?: string): AvailableImageKeys {
  let openaiKey: string | null = null;
  let geminiKey: string | null = null;
  let higgsfieldKey: string | null = null;
  let source: AvailableImageKeys["source"] = "none";

  // 1. Check agent-specific vault keys if agentId is provided
  if (agentId) {
    openaiKey =
      getSecretForServerUse(agentId, "openai") ||
      getSecretForServerUse(agentId, "chatgpt") ||
      getSecretForServerUse(agentId, "dall-e") ||
      getSecretForServerUse(agentId, "dalle");

    geminiKey =
      getSecretForServerUse(agentId, "gemini") ||
      getSecretForServerUse(agentId, "imagen") ||
      getSecretForServerUse(agentId, "google");

    higgsfieldKey =
      getSecretForServerUse(agentId, "higgsfield") ||
      getSecretForServerUse(agentId, "higgsfield_ai");

    if (openaiKey || geminiKey || higgsfieldKey) {
      source = "agent_vault";
    }
  }

  // 2. Check system vault keys
  if (!openaiKey) {
    openaiKey =
      getSecretForServerUse(SYSTEM_VAULT_ID, "openai") ||
      getSecretForServerUse(SYSTEM_VAULT_ID, "chatgpt") ||
      getSecretForServerUse(SYSTEM_VAULT_ID, "dall-e") ||
      getSecretForServerUse(SYSTEM_VAULT_ID, "dalle");
    if (openaiKey && source === "none") source = "system_vault";
  }

  if (!geminiKey) {
    geminiKey =
      getSecretForServerUse(SYSTEM_VAULT_ID, "gemini") ||
      getSecretForServerUse(SYSTEM_VAULT_ID, "imagen") ||
      getSecretForServerUse(SYSTEM_VAULT_ID, "google");
    if (geminiKey && source === "none") source = "system_vault";
  }

  if (!higgsfieldKey && isCapabilityActive("higgsfield")) {
    higgsfieldKey =
      getSecretForServerUse(SYSTEM_VAULT_ID, "higgsfield") ||
      getSecretForServerUse(SYSTEM_VAULT_ID, "higgsfield_ai");
    if (higgsfieldKey && source === "none") source = "system_vault";
  }

  // 3. Check AI Model Store for models configured with taskRole "image"
  try {
    const models = listAiModels();
    for (const m of models) {
      if (m.taskRole === "image" || m.modelName.includes("dall-e") || m.modelName.includes("imagen") || m.modelName.includes("higgsfield")) {
        const key = getAiModelApiKey(m);
        if (key) {
          if (!openaiKey && (m.providerType === "openai-compatible" || m.modelName.includes("dall-e") || m.baseUrl.includes("openai"))) {
            openaiKey = key;
            if (source === "none") source = "system_vault";
          } else if (!geminiKey && (m.providerType === "gemini" || m.modelName.includes("imagen") || m.baseUrl.includes("generativelanguage"))) {
            geminiKey = key;
            if (source === "none") source = "system_vault";
          } else if (!higgsfieldKey && isCapabilityActive("higgsfield") && (m.modelName.includes("higgsfield") || m.baseUrl.includes("higgsfield"))) {
            higgsfieldKey = key;
            if (source === "none") source = "system_vault";
          }
        }
      }
    }
  } catch {
    // non-fatal
  }

  // 4. Fallback to process.env
  if (!openaiKey && process.env.OPENAI_API_KEY) {
    openaiKey = process.env.OPENAI_API_KEY;
    if (source === "none") source = "env";
  }
  if (!geminiKey && (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)) {
    geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null;
    if (source === "none") source = "env";
  }
  if (!higgsfieldKey && isCapabilityActive("higgsfield") && process.env.HIGGSFIELD_API_KEY) {
    higgsfieldKey = process.env.HIGGSFIELD_API_KEY;
    if (source === "none") source = "env";
  }

  return { openaiKey, geminiKey, higgsfieldKey, source };
}

/**
 * Generates an image using OpenAI DALL-E 3 API.
 */
async function generateViaOpenAI(prompt: string, apiKey: string): Promise<ImageGenResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);

  try {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt,
        n: 1,
        size: "1024x1024",
        response_format: "b64_json",
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { ok: false, output: `OpenAI DALL-E 3 failed (${res.status}): ${errText.slice(0, 300)}` };
    }

    const data = await res.json();
    const b64 = data?.data?.[0]?.b64_json;
    if (b64) {
      const buffer = Buffer.from(b64, "base64");
      const localUrl = saveImageBytes(buffer, "png");
      return {
        ok: true,
        output: `Generated 1 image(s) via OpenAI DALL-E 3: ${localUrl}`,
        providerUsed: "openai",
        imageUrl: localUrl,
      };
    }

    const remoteUrl = data?.data?.[0]?.url;
    if (remoteUrl) {
      // Download and cache locally
      try {
        const imgRes = await fetch(remoteUrl, { signal: AbortSignal.timeout(20_000) });
        if (imgRes.ok) {
          const buffer = Buffer.from(await imgRes.arrayBuffer());
          const localUrl = saveImageBytes(buffer, "png");
          return {
            ok: true,
            output: `Generated 1 image(s) via OpenAI DALL-E 3: ${localUrl}`,
            providerUsed: "openai",
            imageUrl: localUrl,
          };
        }
      } catch {
        // return remote URL if download fails
      }
      return {
        ok: true,
        output: `Generated 1 image(s) via OpenAI DALL-E 3: ${remoteUrl}`,
        providerUsed: "openai",
        imageUrl: remoteUrl,
      };
    }

    return { ok: false, output: "OpenAI responded without image data." };
  } catch (err) {
    clearTimeout(timeoutId);
    return { ok: false, output: `OpenAI DALL-E 3 error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Generates an image using Google Imagen 3 API.
 */
async function generateViaGemini(prompt: string, apiKey: string): Promise<ImageGenResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: "1:1",
          outputOptions: { mimeType: "image/png" },
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { ok: false, output: `Google Imagen 3 failed (${res.status}): ${errText.slice(0, 300)}` };
    }

    const data = await res.json();
    const b64 = data?.predictions?.[0]?.bytesBase64Encoded;
    if (b64) {
      const buffer = Buffer.from(b64, "base64");
      const localUrl = saveImageBytes(buffer, "png");
      return {
        ok: true,
        output: `Generated 1 image(s) via Google Imagen 3: ${localUrl}`,
        providerUsed: "gemini",
        imageUrl: localUrl,
      };
    }

    return { ok: false, output: "Google Imagen responded without image bytes." };
  } catch (err) {
    clearTimeout(timeoutId);
    return { ok: false, output: `Google Imagen error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

interface HiggsfieldRequestStatus {
  status: string;
  request_id: string;
  status_url?: string;
  cancel_url?: string;
  error?: string | { message?: string } | null;
  images?: Array<{ url: string }>;
}

const HIGGSFIELD_TERMINAL_FAILURE_STATUSES = new Set(["failed", "error", "cancelled", "canceled"]);

/** Higgsfield's real API is job-based, not synchronous: submit returns a
 *  request_id + status_url immediately, and the caller polls until the job
 *  completes (or uses a webhook, not used here). Verified against
 *  Higgsfield's own OpenAPI spec (docs.higgsfield.ai/docs/openapi.json) —
 *  the earlier version of this function assumed a synchronous response
 *  with an image_url in the same call, which does not match the real API
 *  and would fail against it. */
async function pollHiggsfieldStatus(statusUrl: string, apiKey: string, deadlineMs: number): Promise<HiggsfieldRequestStatus> {
  let delayMs = 2000;
  while (Date.now() < deadlineMs) {
    const res = await fetch(statusUrl, {
      headers: { Authorization: `Key ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Higgsfield status check failed (${res.status}): ${errText.slice(0, 300)}`);
    }
    const data = (await res.json()) as HiggsfieldRequestStatus;
    if (data.images && data.images.length > 0) return data;
    if (HIGGSFIELD_TERMINAL_FAILURE_STATUSES.has((data.status || "").toLowerCase())) {
      const errMsg = typeof data.error === "string" ? data.error : data.error?.message;
      throw new Error(errMsg || `Higgsfield job ${data.status}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    delayMs = Math.min(delayMs + 1000, 8000);
  }
  throw new Error("Higgsfield generation timed out waiting for the job to complete.");
}

/**
 * Generates an image using Higgsfield AI's "soul" text-to-image model.
 * Job-based API: submit, then poll status until images are ready.
 */
async function generateViaHiggsfield(prompt: string, apiKey: string): Promise<ImageGenResult> {
  const deadlineMs = Date.now() + 90_000;
  try {
    const submitRes = await fetch("https://api.higgsfield.ai/higgsfield-ai/soul/standard", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify({
        prompt,
        num_images: 1,
        resolution: "2K",
        aspect_ratio: "1:1",
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!submitRes.ok) {
      const errText = await submitRes.text().catch(() => "");
      return { ok: false, output: `Higgsfield AI submit failed (${submitRes.status}): ${errText.slice(0, 300)}` };
    }

    const submitData = (await submitRes.json()) as HiggsfieldRequestStatus;
    if (HIGGSFIELD_TERMINAL_FAILURE_STATUSES.has((submitData.status || "").toLowerCase())) {
      const errMsg = typeof submitData.error === "string" ? submitData.error : submitData.error?.message;
      return { ok: false, output: errMsg || `Higgsfield job ${submitData.status} immediately.` };
    }

    const statusUrl = submitData.status_url || `https://api.higgsfield.ai/requests/${submitData.request_id}/status`;
    const finalStatus = await pollHiggsfieldStatus(statusUrl, apiKey, deadlineMs);
    const imageUrl = finalStatus.images?.[0]?.url;
    if (!imageUrl) {
      return { ok: false, output: "Higgsfield AI completed the job without returning an image URL." };
    }

    try {
      const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(20_000) });
      if (imgRes.ok) {
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        const localUrl = saveImageBytes(buffer, "png");
        return {
          ok: true,
          output: `Generated 1 image(s) via Higgsfield AI: ${localUrl}`,
          providerUsed: "higgsfield",
          imageUrl: localUrl,
        };
      }
    } catch {
      // fall through to returning the direct URL below
    }
    return {
      ok: true,
      output: `Generated 1 image(s) via Higgsfield AI: ${imageUrl}`,
      providerUsed: "higgsfield",
      imageUrl,
    };
  } catch (err) {
    return { ok: false, output: `Higgsfield AI error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Main image generation entrypoint with BYO cloud key routing & local ComfyUI fallback.
 */
export async function generateImageWithByoFallback(
  prompt: string,
  agentId?: string,
  localFallbackFn?: (prompt: string) => Promise<{ ok: boolean; output: string }>
): Promise<ImageGenResult> {
  const keys = resolveImageKeys(agentId);

  // 1. Try ChatGPT / OpenAI DALL-E 3 if key is available
  if (keys.openaiKey) {
    const res = await generateViaOpenAI(prompt, keys.openaiKey);
    if (res.ok) return res;
    console.warn(`[imageGen] OpenAI image generation failed, trying next provider or local fallback: ${res.output}`);
  }

  // 2. Try Google Gemini / Imagen 3 if key is available
  if (keys.geminiKey) {
    const res = await generateViaGemini(prompt, keys.geminiKey);
    if (res.ok) return res;
    console.warn(`[imageGen] Gemini image generation failed, trying next provider or local fallback: ${res.output}`);
  }

  // 3. Try Higgsfield AI if key is available
  if (keys.higgsfieldKey) {
    const res = await generateViaHiggsfield(prompt, keys.higgsfieldKey);
    if (res.ok) return res;
    console.warn(`[imageGen] Higgsfield image generation failed, trying next provider or local fallback: ${res.output}`);
  }

  // 4. Fall back to existing local ComfyUI generator if available
  if (localFallbackFn) {
    const localRes = await localFallbackFn(prompt);
    if (localRes.ok) {
      return {
        ok: true,
        output: localRes.output,
        providerUsed: "comfyui",
      };
    }
    return {
      ok: false,
      output: `No BYO cloud image generation key (OpenAI/Gemini/Higgsfield) configured in Settings or agent vault, and local fallback failed: ${localRes.output}`,
    };
  }

  return {
    ok: false,
    output:
      "No image generation key configured. Add an OpenAI (DALL-E 3), Gemini (Imagen 3), or Higgsfield key in Settings → AI Providers / Vault, or start local ComfyUI.",
  };
}
