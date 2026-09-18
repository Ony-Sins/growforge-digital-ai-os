/**
 * Lightweight, dependency-free multi-provider LLM transport for the AI
 * intent router. Five interchangeable providers (Gemini, Groq, OpenAI,
 * Anthropic, local Ollama) sit behind one entry point, `chatComplete`,
 * selected by a runtime strategy rather than hardcoded priority:
 *
 *   - "local"  — Ollama only.
 *   - "cloud"  — first cloud provider with a configured key, in
 *                cloudProviderOrder()'s order. Errors if none are configured.
 *   - "auto"   — try Ollama first, fail over through the cloud order. Never
 *                errors as long as at least one is reachable/configured.
 *
 * Each cloud provider's API key can come from either the server environment
 * (GEMINI_API_KEY etc., set once at deploy time) or the system-wide
 * encrypted vault (src/lib/serverVault.ts, under the reserved SYSTEM_VAULT_ID
 * pseudo-agent) — settable live from Settings → Integrations by an owner,
 * no redeploy needed. The vault takes priority when both are set.
 *
 * Adding a sixth provider later means writing one new `call<Provider>`
 * function, adding it to `callProvider` + `cloudProviderOrder`, and adding
 * its display metadata to `CLOUD_PROVIDERS` — nothing else needs to change.
 */

import { getSecretForServerUse } from "@/lib/serverVault";
import { classifyTask, callOpenRouterWithFallback } from "@/lib/model-router";

/** Reserved pseudo-agent id for system-wide (not per-agent) vault entries —
 *  distinct from any real agent id, which are always kebab-case slugs. */
export const SYSTEM_VAULT_ID = "__system__";

export const UNIVERSAL_CONTEXT_POLICY =
  "Detect the language of the user's input and respond seamlessly in the same language. Interpret intent naturally without requiring strict formatting.";

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface GenerationOptions {
  maxTokens?: number;
  /** In "auto" strategy, try cloud providers before local Ollama — for
   *  long-form work a small local model can't do well. "local"/"cloud"
   *  strategies are still respected as explicit operator choices. */
  preferCloud?: boolean;
}

export type LlmProvider = "gemini" | "groq" | "openai" | "anthropic" | "openrouter" | "ollama";
export type CloudProvider = Exclude<LlmProvider, "ollama">;
export type LlmStrategy = "auto" | "local" | "cloud";

/** Env var name + sane default model for each cloud provider — the single
 *  source of truth CLOUD_PROVIDERS, hasKey, and the call<Provider> functions
 *  all read from, so adding a provider only means adding one row here (plus
 *  its call function). */
export const CLOUD_PROVIDERS: Record<CloudProvider, { label: string; envKey: string; envModel: string; defaultModel: string }> = {
  gemini: { label: "Gemini", envKey: "GEMINI_API_KEY", envModel: "GEMINI_MODEL", defaultModel: "gemini-3.6-flash" },
  groq: { label: "Groq", envKey: "GROQ_API_KEY", envModel: "GROQ_MODEL", defaultModel: "llama-3.3-70b-versatile" },
  openai: { label: "OpenAI", envKey: "OPENAI_API_KEY", envModel: "OPENAI_MODEL", defaultModel: "gpt-4o-mini" },
  anthropic: { label: "Anthropic", envKey: "ANTHROPIC_API_KEY", envModel: "ANTHROPIC_MODEL", defaultModel: "claude-sonnet-5" },
  // OpenRouter is a gateway, not one model — it hosts several genuinely free
  // and auto-routed models alongside paid ones.
  openrouter: { label: "OpenRouter", envKey: "OPENROUTER_API_KEY", envModel: "OPENROUTER_MODEL", defaultModel: "openrouter/auto" },
};

export class LlmError extends Error {
  provider: LlmProvider | "none";
  constructor(message: string, provider: LlmProvider | "none") {
    super(message);
    this.name = "LlmError";
    this.provider = provider;
  }
}

// Runtime-overridable strategy. Seeded from LLM_STRATEGY at process start,
// but can be changed live via PATCH /api/router without a server restart —
// that's the "dynamic switcher". Not persisted across restarts by design;
// it's a live operator toggle, not durable config.
let runtimeStrategy: LlmStrategy | null = null;

function isStrategy(value: string): value is LlmStrategy {
  return value === "auto" || value === "local" || value === "cloud";
}

export function getStrategy(): LlmStrategy {
  if (runtimeStrategy) return runtimeStrategy;
  const envValue = (process.env.LLM_STRATEGY ?? "").toLowerCase();
  return isStrategy(envValue) ? envValue : "auto";
}

export function setStrategy(strategy: LlmStrategy): void {
  runtimeStrategy = strategy;
}

/** Vault value wins over env when both are set — lets an owner override a
 *  deploy-time key live from the UI without touching server env. */
function resolveApiKey(provider: CloudProvider): string | null {
  const fromVault = getSecretForServerUse(SYSTEM_VAULT_ID, provider);
  if (fromVault) return fromVault;
  return process.env[CLOUD_PROVIDERS[provider].envKey] || null;
}

function resolveModel(provider: CloudProvider): string {
  const { envModel, defaultModel } = CLOUD_PROVIDERS[provider];
  return process.env[envModel] || defaultModel;
}

/** Server-side only — for modules (e.g. research.ts) that call a provider
 *  API directly for a capability chatComplete doesn't expose. */
export function getProviderKey(provider: CloudProvider): string | null {
  return resolveApiKey(provider);
}

export function getProviderModel(provider: CloudProvider): string {
  return resolveModel(provider);
}

export function hasKey(provider: CloudProvider): boolean {
  return Boolean(resolveApiKey(provider));
}

function cloudProviderOrder(): LlmProvider[] {
  return (Object.keys(CLOUD_PROVIDERS) as CloudProvider[]).filter(hasKey);
}

/** Which providers to try, in order, for the current strategy. */
export function providerOrder(strategy: LlmStrategy = getStrategy()): LlmProvider[] {
  switch (strategy) {
    case "local":
      return ["ollama"];
    case "cloud":
      return cloudProviderOrder();
    case "auto":
    default:
      return ["ollama", ...cloudProviderOrder()];
  }
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { message?: string };
}

async function callGemini(systemPrompt: string, messages: ChatMessage[], opts: GenerationOptions = {}): Promise<string> {
  const apiKey = resolveApiKey("gemini");
  const model = resolveModel("gemini");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { temperature: 0.4, ...(opts.maxTokens ? { maxOutputTokens: opts.maxTokens } : {}) },
      }),
    });
  } catch (err) {
    throw new LlmError(
      `Could not reach Gemini API (${err instanceof Error ? err.message : String(err)}).`,
      "gemini",
    );
  }

  const data = (await res.json()) as GeminiResponse;
  if (!res.ok) {
    throw new LlmError(data.error?.message ?? `Gemini request failed (${res.status})`, "gemini");
  }
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text.trim()) throw new LlmError("Gemini returned an empty response.", "gemini");
  return text;
}

interface GroqResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

async function callGroq(systemPrompt: string, messages: ChatMessage[], opts: GenerationOptions = {}): Promise<string> {
  const apiKey = resolveApiKey("groq");
  const model = resolveModel("groq");

  let res: Response;
  try {
    res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
        messages: [{ role: "system", content: systemPrompt }, ...messages.filter((m) => m.role !== "system")],
      }),
    });
  } catch (err) {
    throw new LlmError(`Could not reach Groq API (${err instanceof Error ? err.message : String(err)}).`, "groq");
  }

  const data = (await res.json()) as GroqResponse;
  if (!res.ok) {
    throw new LlmError(data.error?.message ?? `Groq request failed (${res.status})`, "groq");
  }
  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw new LlmError("Groq returned an empty response.", "groq");
  return text;
}

interface OpenAIResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

async function callOpenAI(systemPrompt: string, messages: ChatMessage[], opts: GenerationOptions = {}): Promise<string> {
  const apiKey = resolveApiKey("openai");
  const model = resolveModel("openai");

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
        messages: [{ role: "system", content: systemPrompt }, ...messages.filter((m) => m.role !== "system")],
      }),
    });
  } catch (err) {
    throw new LlmError(`Could not reach OpenAI API (${err instanceof Error ? err.message : String(err)}).`, "openai");
  }

  const data = (await res.json()) as OpenAIResponse;
  if (!res.ok) {
    throw new LlmError(data.error?.message ?? `OpenAI request failed (${res.status})`, "openai");
  }
  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw new LlmError("OpenAI returned an empty response.", "openai");
  return text;
}

interface AnthropicResponse {
  content?: { type: string; text?: string }[];
  error?: { message?: string };
}

async function callAnthropic(systemPrompt: string, messages: ChatMessage[], opts: GenerationOptions = {}): Promise<string> {
  const apiKey = resolveApiKey("anthropic");
  const model = resolveModel("anthropic");

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? 1024,
        temperature: 0.4,
        system: systemPrompt,
        messages: messages
          .filter((m) => m.role !== "system")
          .map((m) => ({ role: m.role, content: m.content })),
      }),
    });
  } catch (err) {
    throw new LlmError(
      `Could not reach Anthropic API (${err instanceof Error ? err.message : String(err)}).`,
      "anthropic",
    );
  }

  const data = (await res.json()) as AnthropicResponse;
  if (!res.ok) {
    throw new LlmError(data.error?.message ?? `Anthropic request failed (${res.status})`, "anthropic");
  }
  const text = data.content?.map((c) => (c.type === "text" ? c.text ?? "" : "")).join("") ?? "";
  if (!text.trim()) throw new LlmError("Anthropic returned an empty response.", "anthropic");
  return text;
}

async function callOpenRouter(systemPrompt: string, messages: ChatMessage[], opts: GenerationOptions = {}): Promise<string> {
  const apiKey = resolveApiKey("openrouter");
  if (!apiKey) throw new LlmError("No OpenRouter API key configured.", "openrouter");

  const fullPrompt = systemPrompt + " " + messages.map((m) => m.content).join(" ");
  const category = classifyTask(fullPrompt);

  const result = await callOpenRouterWithFallback(category, systemPrompt, messages, apiKey, opts);
  return result.text;
}

interface OllamaResponse {
  message?: { content?: string };
  error?: string;
}

async function callOllama(systemPrompt: string, messages: ChatMessage[], opts: GenerationOptions = {}): Promise<string> {
  const baseUrl = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
  const model = process.env.OLLAMA_MODEL || "llama3.2:1b";

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        ...(opts.maxTokens ? { options: { num_predict: opts.maxTokens } } : {}),
        messages: [{ role: "system", content: systemPrompt }, ...messages.filter((m) => m.role !== "system")],
      }),
    });
  } catch (err) {
    throw new LlmError(
      `Could not reach local Ollama at ${baseUrl} (${err instanceof Error ? err.message : String(err)}).`,
      "ollama",
    );
  }

  const data = (await res.json()) as OllamaResponse;
  if (!res.ok) {
    throw new LlmError(data.error ?? `Ollama request failed (${res.status})`, "ollama");
  }
  const text = data.message?.content ?? "";
  if (!text.trim()) throw new LlmError("Ollama returned an empty response.", "ollama");
  return text;
}

function callProvider(
  provider: LlmProvider,
  systemPrompt: string,
  messages: ChatMessage[],
  opts: GenerationOptions = {},
): Promise<string> {
  switch (provider) {
    case "gemini":
      return callGemini(systemPrompt, messages, opts);
    case "groq":
      return callGroq(systemPrompt, messages, opts);
    case "openai":
      return callOpenAI(systemPrompt, messages, opts);
    case "anthropic":
      return callAnthropic(systemPrompt, messages, opts);
    case "openrouter":
      return callOpenRouter(systemPrompt, messages, opts);
    case "ollama":
      return callOllama(systemPrompt, messages, opts);
  }
}

/** Fires one minimal real request at a provider and reports success/failure
 *  — used by the Integrations "Test connection" button so a bad/expired key
 *  is caught immediately instead of at the next chat request. */
export async function testProvider(provider: CloudProvider): Promise<{ ok: boolean; message: string; latencyMs?: number }> {
  if (!hasKey(provider)) {
    return { ok: false, message: "No API key configured for this provider." };
  }
  const start = Date.now();
  try {
    await callProvider(provider, "Reply with only the word: ok", [{ role: "user", content: "ping" }]);
    const latency = Date.now() - start;
    return { ok: true, message: `Responded in ${latency}ms.`, latencyMs: latency };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - start };
  }
}

/**
 * Universal real-time test for any custom Base URL, model name, and API key.
 * Fully supports private endpoints (http://localhost:11434/v1, http://127.0.0.1:8000/v1,
 * LM Studio, vLLM, DeepSeek, Mistral, OpenAI, Gemini, Anthropic, etc.).
 */
export async function testCustomModel(config: {
  baseUrl: string;
  modelName: string;
  apiKey?: string | null;
  providerType?: string;
}): Promise<{ ok: boolean; message: string; latencyMs: number }> {
  const start = Date.now();
  const cleanUrl = (config.baseUrl || "").trim().replace(/\/+$/, "");
  const model = (config.modelName || "").trim();

  if (!cleanUrl) {
    return { ok: false, message: "Base URL cannot be empty.", latencyMs: 0 };
  }
  if (!model) {
    return { ok: false, message: "Model name cannot be empty.", latencyMs: 0 };
  }

  try {
    // Anthropic API format
    if (config.providerType === "anthropic" || cleanUrl.includes("anthropic.com")) {
      const res = await fetch(`${cleanUrl}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.apiKey || "",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 16,
          messages: [{ role: "user", content: "ping" }],
        }),
      });
      const latency = Date.now() - start;
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return { ok: false, message: `Anthropic error (HTTP ${res.status}): ${errText.slice(0, 160)}`, latencyMs: latency };
      }
      return { ok: true, message: `Connected in ${latency}ms`, latencyMs: latency };
    }

    // Google Gemini API format
    if (config.providerType === "gemini" || cleanUrl.includes("generativelanguage.googleapis.com")) {
      const url = `${cleanUrl}/models/${model}:generateContent?key=${config.apiKey || ""}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "ping" }] }],
          generationConfig: { maxOutputTokens: 16 },
        }),
      });
      const latency = Date.now() - start;
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return { ok: false, message: `Gemini error (HTTP ${res.status}): ${errText.slice(0, 160)}`, latencyMs: latency };
      }
      return { ok: true, message: `Connected in ${latency}ms`, latencyMs: latency };
    }

    // Ollama native API format (/api)
    if (config.providerType === "ollama" && cleanUrl.endsWith("/api")) {
      const res = await fetch(`${cleanUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          messages: [{ role: "user", content: "ping" }],
        }),
      });
      const latency = Date.now() - start;
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return { ok: false, message: `Ollama error (HTTP ${res.status}): ${errText.slice(0, 160)}`, latencyMs: latency };
      }
      return { ok: true, message: `Connected in ${latency}ms`, latencyMs: latency };
    }

    // Standard OpenAI-compatible format (OpenAI, Groq, OpenRouter, DeepSeek, Mistral, Ollama /v1, LM Studio, vLLM, etc.)
    const endpoint = cleanUrl.endsWith("/chat/completions") ? cleanUrl : `${cleanUrl}/chat/completions`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (config.apiKey) {
      headers["Authorization"] = `Bearer ${config.apiKey}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        max_tokens: 16,
        messages: [{ role: "user", content: "ping" }],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const latency = Date.now() - start;
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { ok: false, message: `HTTP ${res.status}: ${errText.slice(0, 160)}`, latencyMs: latency };
    }
    return { ok: true, message: `Connected in ${latency}ms`, latencyMs: latency };
  } catch (err) {
    const latency = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Connection failed: ${msg}`, latencyMs: latency };
  }
}


/**
 * Runs the current strategy's provider order in sequence, returning the
 * first success. In "auto" mode this means a down/unpulled local Ollama
 * transparently fails over to a configured cloud key, and vice versa.
 */
export async function chatComplete(
  systemPrompt: string,
  messages: ChatMessage[],
  opts: GenerationOptions = {},
): Promise<{ text: string; provider: LlmProvider }> {
  const strategy = getStrategy();
  const order: LlmProvider[] =
    opts.preferCloud && strategy === "auto" ? [...cloudProviderOrder(), "ollama"] : providerOrder(strategy);

  if (order.length === 0) {
    throw new LlmError(
      strategy === "cloud"
        ? "No cloud provider configured. Add a key in Settings → Integrations, or switch strategy to \"local\"/\"auto\"."
        : `No LLM provider available for strategy "${strategy}".`,
      "none",
    );
  }

  const failures: string[] = [];
  for (const provider of order) {
    try {
      const text = await callProvider(provider, systemPrompt, messages, opts);
      return { text, provider };
    } catch (err) {
      failures.push(`${provider}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  throw new LlmError(
    `All providers failed for strategy "${strategy}":\n${failures.join("\n")}`,
    order[order.length - 1],
  );
}
