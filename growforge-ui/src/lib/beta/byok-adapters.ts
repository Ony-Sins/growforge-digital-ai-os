import { ByokProvider } from "./vault";

export interface ProviderExecutionOptions {
  model?: string;
  timeoutMs?: number;
  maxTokens?: number;
}

export interface ProviderTestResult {
  valid: boolean;
  error?: string;
}

export interface ProviderExecutionResult {
  reply: string;
  provider: ByokProvider;
  model: string;
}

export const DEFAULT_MODELS: Record<ByokProvider, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-latest",
  gemini: "gemini-1.5-flash",
  groq: "qwen/qwen3.8-27b",
  openrouter: "meta-llama/llama-3.3-70b-instruct",
};

export const ALLOWED_MODELS: Record<ByokProvider, string[]> = {
  openai: ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo", "o3-mini", "gpt-3.5-turbo"],
  anthropic: ["claude-3-5-haiku-latest", "claude-3-5-sonnet-latest", "claude-3-opus-latest", "claude-3-haiku-20240307"],
  gemini: ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-1.5-pro"],
  groq: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "qwen/qwen3.8-27b", "openai/gpt-oss-120b", "mixtral-8x7b-32768"],
  openrouter: [
    "meta-llama/llama-3.3-70b-instruct",
    "anthropic/claude-3.5-haiku",
    "google/gemini-2.0-flash-001",
    "openai/gpt-4o-mini",
  ],
};

function normalizeError(err: any, apiKey: string): string {
  let msg = err instanceof Error ? err.message : String(err || "Provider execution failed.");
  // Strip apiKey from error message if echoed anywhere
  if (apiKey && apiKey.length > 4) {
    msg = msg.split(apiKey).join("[REDACTED]");
  }
  // Strip query param keys if present
  msg = msg.replace(/key=[a-zA-Z0-9_\-]+/g, "key=[REDACTED]");
  return msg.slice(0, 300);
}

function resolveModel(provider: ByokProvider, requestedModel?: string): string {
  const allowed = ALLOWED_MODELS[provider];
  if (requestedModel && allowed.includes(requestedModel)) {
    return requestedModel;
  }
  return DEFAULT_MODELS[provider];
}

/**
 * Live test of an API key against the official provider endpoint.
 * Fails safely and sanitizes error responses.
 */
export async function testProviderCredential(
  provider: ByokProvider,
  apiKey: string
): Promise<ProviderTestResult> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) return { valid: false, error: "API key cannot be empty." };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/models", {
        method: "GET",
        headers: { Authorization: `Bearer ${cleanKey}` },
        signal: controller.signal,
      });
      if (!res.ok) {
        const body: any = await res.json().catch(() => null);
        return { valid: false, error: normalizeError(body?.error?.message || `HTTP ${res.status}`, cleanKey) };
      }
      return { valid: true };
    }

    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": cleanKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-3-5-haiku-latest",
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
        }),
        signal: controller.signal,
      });
      // 200 is valid; Anthropic might return 400 for model syntax or credit, but 401/403 is auth failure
      if (res.status === 401 || res.status === 403) {
        const body: any = await res.json().catch(() => null);
        return { valid: false, error: normalizeError(body?.error?.message || "Invalid Anthropic API key.", cleanKey) };
      }
      if (res.ok || res.status === 400) {
        return { valid: true };
      }
      return { valid: false, error: `Anthropic responded with HTTP ${res.status}` };
    }

    if (provider === "gemini") {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cleanKey)}`,
        { method: "GET", signal: controller.signal }
      );
      if (!res.ok) {
        const body: any = await res.json().catch(() => null);
        return { valid: false, error: normalizeError(body?.error?.message || `HTTP ${res.status}`, cleanKey) };
      }
      return { valid: true };
    }

    if (provider === "groq") {
      const res = await fetch("https://api.groq.com/openai/v1/models", {
        method: "GET",
        headers: { Authorization: `Bearer ${cleanKey}` },
        signal: controller.signal,
      });
      if (!res.ok) {
        const body: any = await res.json().catch(() => null);
        return { valid: false, error: normalizeError(body?.error?.message || `HTTP ${res.status}`, cleanKey) };
      }
      return { valid: true };
    }

    if (provider === "openrouter") {
      const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
        method: "GET",
        headers: { Authorization: `Bearer ${cleanKey}` },
        signal: controller.signal,
      });
      if (!res.ok) {
        const body: any = await res.json().catch(() => null);
        return { valid: false, error: normalizeError(body?.error?.message || `HTTP ${res.status}`, cleanKey) };
      }
      return { valid: true };
    }

    return { valid: false, error: `Unsupported provider: ${provider}` };
  } catch (err: any) {
    if (err.name === "AbortError") {
      return { valid: false, error: "Connection to provider timed out (12s)." };
    }
    return { valid: false, error: normalizeError(err, cleanKey) };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Execute a completion prompt against the tester's configured BYOK provider.
 */
export async function executeByokCompletion(
  provider: ByokProvider,
  apiKey: string,
  prompt: string,
  options?: ProviderExecutionOptions
): Promise<ProviderExecutionResult> {
  const model = resolveModel(provider, options?.model);
  const cleanKey = apiKey.trim();
  const maxTokens = Math.min(options?.maxTokens || 1024, 2048);
  const timeoutMs = options?.timeoutMs || 25000;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const systemPrompt =
    "You are NORA, the GrowForge Digital AI OS intelligent assistant. " +
    "Provide concise, direct, helpful responses for this private beta session.";

  try {
    if (provider === "openai" || provider === "groq" || provider === "openrouter") {
      const endpoint =
        provider === "openai"
          ? "https://api.openai.com/v1/chat/completions"
          : provider === "groq"
          ? "https://api.groq.com/openai/v1/chat/completions"
          : "https://openrouter.ai/api/v1/chat/completions";

      const headers: Record<string, string> = {
        Authorization: `Bearer ${cleanKey}`,
        "Content-Type": "application/json",
      };

      if (provider === "openrouter") {
        headers["HTTP-Referer"] = "https://growforge-beta.anjum-ony96.workers.dev";
        headers["X-Title"] = "GrowForge Beta";
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          max_tokens: maxTokens,
          temperature: 0.7,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body: any = await res.json().catch(() => null);
        throw new Error(normalizeError(body?.error?.message || `Provider returned HTTP ${res.status}`, cleanKey));
      }

      const data: any = await res.json();
      const reply = data?.choices?.[0]?.message?.content || "";
      return { reply, provider, model };
    }

    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": cleanKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          system: systemPrompt,
          messages: [{ role: "user", content: prompt }],
          max_tokens: maxTokens,
          temperature: 0.7,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body: any = await res.json().catch(() => null);
        throw new Error(normalizeError(body?.error?.message || `Anthropic returned HTTP ${res.status}`, cleanKey));
      }

      const data: any = await res.json();
      const reply = data?.content?.[0]?.text || "";
      return { reply, provider, model };
    }

    if (provider === "gemini") {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model
      )}:generateContent?key=${encodeURIComponent(cleanKey)}`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body: any = await res.json().catch(() => null);
        throw new Error(normalizeError(body?.error?.message || `Gemini returned HTTP ${res.status}`, cleanKey));
      }

      const data: any = await res.json();
      const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      return { reply, provider, model };
    }

    throw new Error(`Unsupported provider: ${provider}`);
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error("Provider request timed out.");
    }
    throw new Error(normalizeError(err, cleanKey));
  } finally {
    clearTimeout(timeout);
  }
}
