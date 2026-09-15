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

/**
 * Execute a completion via OpenRouter with multi-tier model fallback.
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

  const modelChain = ROUTE_CHAINS[category] || ROUTE_CHAINS.utility;
  const errors: string[] = [];

  for (const model of modelChain) {
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
