/**
 * Client-side in-browser LLM engine powered by WebLLM (@mlc-ai/web-llm) and WebGPU.
 *
 * Provides a zero-setup, zero-cost, private client-side fallback when local Ollama
 * is not running and no cloud BYOK API key has been configured.
 */

export const DEFAULT_WEBLLM_MODEL = "Llama-3.2-1B-Instruct-q4f16_1-MLC";

export interface WebLlmProgressReport {
  text: string;
  progress: number;
}

export type WebLlmStatus = "idle" | "loading" | "ready" | "generating" | "error";

export interface WebLlmChatOptions {
  systemPrompt?: string;
  onProgress?: (report: WebLlmProgressReport) => void;
  temperature?: number;
  maxTokens?: number;
}

export interface WebLlmResult {
  reply: string;
  provider: "web-llm (in-browser)";
  model: string;
}

/** Check whether WebGPU is supported and available in the current browser. */
export function isWebGpuSupported(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  return "gpu" in navigator && Boolean((navigator as unknown as { gpu?: unknown }).gpu);
}

// Module-level cached engine instance
let cachedEngine: unknown = null;
let currentModelId: string | null = null;
let isInitializing = false;

/**
 * Initializes or returns the cached WebLLM MLCEngine.
 * Dynamically imports @mlc-ai/web-llm to guarantee zero SSR issues.
 */
export async function getWebLlmEngine(
  modelId: string = DEFAULT_WEBLLM_MODEL,
  onProgress?: (report: WebLlmProgressReport) => void,
) {
  if (typeof window === "undefined") {
    throw new Error("WebLLM can only run client-side in a WebGPU-enabled browser.");
  }

  if (!isWebGpuSupported()) {
    throw new Error("WebGPU is not supported in this browser. Please use Chrome, Edge, or a WebGPU-compatible browser.");
  }

  if (cachedEngine && currentModelId === modelId) {
    return cachedEngine as import("@mlc-ai/web-llm").MLCEngine;
  }

  if (isInitializing) {
    // Wait for ongoing initialization
    while (isInitializing) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (cachedEngine && currentModelId === modelId) {
      return cachedEngine as import("@mlc-ai/web-llm").MLCEngine;
    }
  }

  isInitializing = true;

  try {
    const { CreateMLCEngine } = await import("@mlc-ai/web-llm");

    const engine = await CreateMLCEngine(modelId, {
      initProgressCallback: (report) => {
        if (onProgress) {
          onProgress({
            text: report.text,
            progress: Math.round((report.progress || 0) * 100),
          });
        }
      },
    });

    cachedEngine = engine;
    currentModelId = modelId;
    return engine;
  } finally {
    isInitializing = false;
  }
}

const DEFAULT_SYSTEM_PROMPT =
  "You are the GrowForge Digital AI Assistant running privately in the user's browser via WebLLM (WebGPU). " +
  "You assist with executive planning, marketing, operations, strategy, and business growth. " +
  "Be concise, insightful, and helpful.";

/**
 * Generates a response using the client-side WebLLM engine.
 */
export async function generateWebLlmChat(
  messages: { role: "user" | "assistant" | "system"; content: string }[],
  options?: WebLlmChatOptions,
): Promise<WebLlmResult> {
  const modelId = DEFAULT_WEBLLM_MODEL;
  const engine = await getWebLlmEngine(modelId, options?.onProgress);

  const systemPrompt = options?.systemPrompt || DEFAULT_SYSTEM_PROMPT;

  const conversationHistory = [
    { role: "system" as const, content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    })),
  ];

  const response = await engine.chat.completions.create({
    messages: conversationHistory,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens ?? 1024,
  });

  const reply = response.choices[0]?.message?.content || "I processed your request, but received an empty response.";

  return {
    reply: reply.trim(),
    provider: "web-llm (in-browser)",
    model: modelId,
  };
}
