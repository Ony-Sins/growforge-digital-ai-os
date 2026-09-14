/**
 * Lightweight, dependency-free multi-provider LLM transport for the AI
 * intent router. Three interchangeable providers (Gemini, Groq, local
 * Ollama) sit behind one entry point, `chatComplete`, selected by a runtime
 * strategy rather than hardcoded priority:
 *
 *   - "local"  — Ollama only.
 *   - "cloud"  — Gemini if GEMINI_API_KEY is set, else Groq if GROQ_API_KEY
 *                is set. Errors if neither key is configured.
 *   - "auto"   — try Ollama first, fail over to Gemini, then Groq. Never
 *                errors as long as at least one is reachable/configured.
 *
 * Adding a fourth provider later means writing one new `call<Provider>`
 * function and adding it to `callProvider` + `providerOrderForStrategy` —
 * nothing else in the app needs to change.
 */

export const UNIVERSAL_CONTEXT_POLICY =
  "Detect the language of the user's input and respond seamlessly in the same language. Interpret intent naturally without requiring strict formatting.";

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export type LlmProvider = "gemini" | "groq" | "ollama";
export type LlmStrategy = "auto" | "local" | "cloud";

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

export function hasKey(provider: "gemini" | "groq"): boolean {
  return Boolean(provider === "gemini" ? process.env.GEMINI_API_KEY : process.env.GROQ_API_KEY);
}

function cloudProviderOrder(): LlmProvider[] {
  const order: LlmProvider[] = [];
  if (hasKey("gemini")) order.push("gemini");
  if (hasKey("groq")) order.push("groq");
  return order;
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

async function callGemini(systemPrompt: string, messages: ChatMessage[]): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
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
        generationConfig: { temperature: 0.4 },
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

async function callGroq(systemPrompt: string, messages: ChatMessage[]): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

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

interface OllamaResponse {
  message?: { content?: string };
  error?: string;
}

async function callOllama(systemPrompt: string, messages: ChatMessage[]): Promise<string> {
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

function callProvider(provider: LlmProvider, systemPrompt: string, messages: ChatMessage[]): Promise<string> {
  switch (provider) {
    case "gemini":
      return callGemini(systemPrompt, messages);
    case "groq":
      return callGroq(systemPrompt, messages);
    case "ollama":
      return callOllama(systemPrompt, messages);
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
): Promise<{ text: string; provider: LlmProvider }> {
  const strategy = getStrategy();
  const order = providerOrder(strategy);

  if (order.length === 0) {
    throw new LlmError(
      strategy === "cloud"
        ? 'No cloud provider configured. Set GEMINI_API_KEY or GROQ_API_KEY, or switch strategy to "local"/"auto".'
        : `No LLM provider available for strategy "${strategy}".`,
      "none",
    );
  }

  const failures: string[] = [];
  for (const provider of order) {
    try {
      const text = await callProvider(provider, systemPrompt, messages);
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
