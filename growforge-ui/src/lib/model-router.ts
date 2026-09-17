import type { ChatMessage, GenerationOptions } from "@/lib/llm";
import { LlmError } from "@/lib/llm";

/**
 * Dynamic Model Router (src/lib/model-router.ts)
 *
 * Categorizes incoming tasks (planning, coding, utility) and orchestrates
 * multi-tier free model fallback chains across OpenRouter and local Ollama.
 *
 * Automatically recovers from 404 (unavailable slug), 429 (rate-limit),
 * or provider downtime by cascading to the next verified model in the chain.
 */

/** Remembers which OpenRouter model slugs are currently rate-limited so the
 *  fallback chain can skip straight past them instead of re-probing a model
 *  that's going to fail the exact same way on every single call in a job —
 *  observed wasting a network round-trip on every department, every
 *  research question, for models that are dead for the rest of the day.
 *  One hour is a conservative guess at when a free-tier daily quota might
 *  reset or a transient limit might clear; worst case a model comes back
 *  sooner than this and just gets tried again next cooldown cycle. */
const RATE_LIMIT_COOLDOWN_MS = 60 * 60 * 1000;
const rateLimitedUntil = new Map<string, number>();

function isRateLimited(model: string): boolean {
  const until = rateLimitedUntil.get(model);
  return typeof until === "number" && Date.now() < until;
}

function markRateLimited(model: string, message: string): void {
  if (!/rate.?limit|429|quota/i.test(message)) return;
  rateLimitedUntil.set(model, Date.now() + RATE_LIMIT_COOLDOWN_MS);
}

export type TaskCategory = "planning" | "coding" | "utility";

export interface ModelRouteConfig {
  primary: string;
  fallbacks: string[];
}

export const ROUTE_CHAINS: Record<TaskCategory, string[]> = {
  planning: [
    "openrouter/free",
    "meta-llama/llama-3.1-8b-instruct",
    "openrouter/auto",
    "google/gemma-4-31b-it:free",
    "deepseek/deepseek-r1:free",
    "meta-llama/llama-3.3-70b-instruct:free",
  ],
  coding: [
    "cohere/north-mini-code:free",
    "openrouter/free",
    "meta-llama/llama-3.1-8b-instruct",
    "qwen/qwen-2.5-coder-32b-instruct:free",
    "openrouter/auto",
  ],
  utility: [
    "openrouter/free",
    "nvidia/nemotron-3.5-lightning:free",
    "openrouter/auto",
    "meta-llama/llama-3.1-8b-instruct",
  ],
};

/**
 * Categorize prompt/task into planning, coding, or utility.
 */
export function classifyTask(prompt: string, department?: string): TaskCategory {
  const text = (prompt + " " + (department || "")).toLowerCase();

  // Coding & Automation keywords
  if (
    text.includes("code") ||
    text.includes("typescript") ||
    text.includes("javascript") ||
    text.includes("function") ||
    text.includes("script") ||
    text.includes("n8n") ||
    text.includes("workflow") ||
    text.includes("api") ||
    text.includes("endpoint") ||
    text.includes("component") ||
    text.includes("html") ||
    text.includes("css") ||
    text.includes("bug") ||
    text.includes("sql") ||
    text.includes("database") ||
    text.includes("full-stack") ||
    text.includes("web build")
  ) {
    return "coding";
  }

  // Strategic Planning & Leadership keywords
  if (
    text.includes("plan") ||
    text.includes("strategy") ||
    text.includes("directive") ||
    text.includes("proposal") ||
    text.includes("market") ||
    text.includes("positioning") ||
    text.includes("retainer") ||
    text.includes("pricing") ||
    text.includes("launch") ||
    text.includes("gtm") ||
    text.includes("analysis") ||
    text.includes("budget") ||
    text.includes("funnel") ||
    text.includes("audit") ||
    text.includes("review")
  ) {
    return "planning";
  }

  return "utility";
}

interface OpenRouterCompletionResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string; code?: number };
}

interface OpenRouterModelsResponse {
  data?: {
    id: string;
    context_length?: number;
    pricing?: { prompt?: string; completion?: string };
    architecture?: { input_modalities?: string[] };
  }[];
}

/** The curated ROUTE_CHAINS above are hand-picked for quality-per-category,
 *  but they're a static list of model slugs that OpenRouter can rename,
 *  deprecate, or rate-limit into uselessness at any time — the exact
 *  failure mode a fixed list can't recover from on its own. This asks
 *  OpenRouter what's actually free and live right now, so a chain that's
 *  gone stale still has somewhere real to fall through to instead of
 *  dropping straight to local Ollama. Cached for 30 minutes per kind (text
 *  vs. vision): this is a discovery fallback, not something that needs to
 *  be fresh every call. */
const liveModelsCache: Record<"text" | "vision", { models: string[]; fetchedAt: number } | null> = {
  text: null,
  vision: null,
};
const LIVE_MODELS_TTL_MS = 30 * 60 * 1000;

async function getLiveFreeModelsOfKind(apiKey: string, kind: "text" | "vision"): Promise<string[]> {
  const cached = liveModelsCache[kind];
  if (cached && Date.now() - cached.fetchedAt < LIVE_MODELS_TTL_MS) return cached.models;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = (await res.json()) as OpenRouterModelsResponse;
    const models = (data.data ?? [])
      .filter((m) => m.pricing?.prompt === "0" && m.pricing?.completion === "0")
      .filter((m) => kind === "text" || m.architecture?.input_modalities?.includes("image"))
      .sort((a, b) => (b.context_length ?? 0) - (a.context_length ?? 0))
      .map((m) => m.id);

    liveModelsCache[kind] = { models, fetchedAt: Date.now() };
    return models;
  } catch (err) {
    console.warn(`[ModelRouter] could not fetch live OpenRouter ${kind} model catalog (${err instanceof Error ? err.message : String(err)}) — using curated chain only`);
    // Don't cache a failure — retry on the next call rather than being
    // stuck without discovery for the full TTL because of one bad request.
    return liveModelsCache[kind]?.models ?? [];
  }
}

const getLiveFreeModels = (apiKey: string) => getLiveFreeModelsOfKind(apiKey, "text");

/** Currently-live free vision-capable OpenRouter models, ranked by context
 *  length as a rough capability proxy — same discovery approach as text
 *  models, so "next best available" applies to image analysis too. */
export const getLiveFreeVisionModels = (apiKey: string) => getLiveFreeModelsOfKind(apiKey, "vision");

/**
 * Execute a completion via OpenRouter with multi-tier model fallback: the
 * curated per-category chain first (quality-ordered), then up to 5
 * currently-live free models OpenRouter itself reports that aren't already
 * in that chain, then local Ollama as the final safety net.
 */
export async function callOpenRouterWithFallback(
  category: TaskCategory,
  systemPrompt: string,
  messages: ChatMessage[],
  apiKey: string,
  opts: GenerationOptions = {}
): Promise<{ text: string; modelUsed: string }> {
  if (!apiKey) {
    throw new LlmError("OpenRouter API key is not configured.", "openrouter");
  }

  const curated = ROUTE_CHAINS[category] || ROUTE_CHAINS.utility;
  const discovered = (await getLiveFreeModels(apiKey)).filter((id) => !curated.includes(id)).slice(0, 5);
  const modelChain = [...curated, ...discovered];
  const errors: string[] = [];

  for (const model of modelChain) {
    if (isRateLimited(model)) {
      errors.push(`[${model}] Skipped — rate-limited within the last hour`);
      console.warn(`[ModelRouter] ${model} skipped — cooling down after a recent rate limit`);
      continue;
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://growforgedigital.com",
          "X-Title": "GrowForge AI OS",
        },
        body: JSON.stringify({
          model,
          temperature: 0.4,
          ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
          messages: [
            { role: "system", content: systemPrompt },
            ...messages.filter((m) => m.role !== "system"),
          ],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = (await res.json()) as OpenRouterCompletionResponse;

      if (!res.ok) {
        const errorMsg = data.error?.message || `HTTP ${res.status}`;
        markRateLimited(model, errorMsg);
        errors.push(`[${model}] Failed: ${errorMsg}`);
        console.warn(`[ModelRouter] ${model} unavailable (${errorMsg}), falling back...`);
        continue;
      }

      const text = data.choices?.[0]?.message?.content ?? "";
      if (!text.trim()) {
        errors.push(`[${model}] Returned empty response`);
        continue;
      }

      return { text, modelUsed: model };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      errors.push(`[${model}] Exception: ${errMsg}`);
      console.warn(`[ModelRouter] ${model} error (${errMsg}), trying next fallback...`);
    }
  }

  // If all OpenRouter models in the chain failed, attempt local Ollama fallback
  try {
    const baseUrl = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
    const localModel = process.env.OLLAMA_MODEL || "llama3.2:1b";

    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: localModel,
        stream: false,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.filter((m) => m.role !== "system"),
        ],
      }),
    });

    if (res.ok) {
      const localData = (await res.json()) as { message?: { content?: string } };
      const localText = localData.message?.content ?? "";
      if (localText.trim()) {
        return { text: localText, modelUsed: `ollama/${localModel} (local fallback)` };
      }
    }
  } catch {
    // Local Ollama unavailable
  }

  throw new LlmError(
    `All models in fallback chain for category "${category}" failed:\n${errors.join("\n")}`,
    "openrouter"
  );
}

/** Which vision path(s) to try and in what order — mirrors the same
 *  auto/local/cloud strategy the text chat switcher already exposes, so
 *  switching that dropdown also controls image analysis without any new
 *  UI: "cloud" tries only OpenRouter's free vision models, "local" tries
 *  only a locally-pulled Ollama vision model, "auto" tries OpenRouter first
 *  (better quality when free-tier quota allows it) then falls back local. */
export type VisionStrategy = "auto" | "local" | "cloud";

async function callOpenRouterVision(
  imageBase64: string,
  mimeType: string,
  prompt: string,
  apiKey: string,
): Promise<{ text: string; modelUsed: string }> {
  const models = await getLiveFreeVisionModels(apiKey);
  if (models.length === 0) throw new LlmError("No free OpenRouter vision models are currently available.", "openrouter");

  const errors: string[] = [];
  for (const model of models.slice(0, 6)) {
    if (isRateLimited(model)) {
      errors.push(`[${model}] Skipped — rate-limited within the last hour`);
      console.warn(`[ModelRouter] ${model} skipped — cooling down after a recent rate limit`);
      continue;
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://growforgedigital.com",
          "X-Title": "GrowForge AI OS",
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 700,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
              ],
            },
          ],
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = (await res.json()) as OpenRouterCompletionResponse;
      if (!res.ok) {
        const errorMsg = data.error?.message || `HTTP ${res.status}`;
        markRateLimited(model, errorMsg);
        errors.push(`[${model}] ${errorMsg}`);
        continue;
      }
      const text = data.choices?.[0]?.message?.content ?? "";
      if (!text.trim()) {
        errors.push(`[${model}] Returned empty response`);
        continue;
      }
      return { text, modelUsed: model };
    } catch (err) {
      errors.push(`[${model}] ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new LlmError(`All free vision models failed:\n${errors.join("\n")}`, "openrouter");
}

async function callOllamaVision(imageBase64: string, prompt: string): Promise<{ text: string; modelUsed: string }> {
  const baseUrl = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
  const model = process.env.OLLAMA_VISION_MODEL || "llava";

  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [{ role: "user", content: prompt, images: [imageBase64] }],
    }),
  });
  if (!res.ok) throw new LlmError(`Local Ollama vision model "${model}" failed (HTTP ${res.status}) — is it pulled? Try: ollama pull ${model}`, "ollama");

  const data = (await res.json()) as { message?: { content?: string }; error?: string };
  if (data.error) throw new LlmError(`Local Ollama vision model "${model}" error: ${data.error} — is it pulled? Try: ollama pull ${model}`, "ollama");
  const text = data.message?.content ?? "";
  if (!text.trim()) throw new LlmError(`Local Ollama vision model "${model}" returned an empty response.`, "ollama");
  return { text, modelUsed: `ollama/${model}` };
}

/** Describes an image for the brief-intake chat: what's in it, any visible
 *  text/branding/pricing, and anything strategically relevant. Tries the
 *  path(s) implied by `strategy`, falling through to the other when one
 *  fails, so a rate-limited OpenRouter model or an unpulled local model
 *  doesn't just dead-end the upload. */
export async function analyzeImageWithFallback(
  imageBase64: string,
  mimeType: string,
  openRouterKey: string | null,
  strategy: VisionStrategy,
): Promise<{ text: string; modelUsed: string }> {
  const prompt =
    "Describe this image for a business growth/marketing team: what it shows, any visible text, branding, " +
    "pricing, product/service details, or competitor/storefront context. Be specific and concise — bullet points, no preamble.";

  const attempts: (() => Promise<{ text: string; modelUsed: string }>)[] = [];
  if (strategy !== "local" && openRouterKey) attempts.push(() => callOpenRouterVision(imageBase64, mimeType, prompt, openRouterKey));
  if (strategy !== "cloud") attempts.push(() => callOllamaVision(imageBase64, prompt));

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  throw new LlmError(`Image analysis unavailable:\n${errors.join("\n") || "no vision path configured"}`, "none");
}
