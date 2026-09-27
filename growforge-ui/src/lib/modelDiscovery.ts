import { SYSTEM_VAULT_ID, CLOUD_PROVIDERS, type CloudProvider } from "@/lib/llm";
import { getSecretForServerUse } from "@/lib/serverVault";

export interface DiscoveredModel {
  id: string;
  name: string;
  ownedBy?: string;
  contextWindow?: number;
  active?: boolean;
  freeTierEligible?: boolean;
  description?: string;
}

export interface ModelDiscoveryResult {
  ok: boolean;
  provider: string;
  models: DiscoveredModel[];
  error?: string;
  source: "live" | "fallback";
}

/** Known curated fallback catalogs for popular providers when offline or unauthenticated */
const FALLBACK_CATALOGS: Record<string, DiscoveredModel[]> = {
  groq: [
    {
      id: "llama-3.3-70b-versatile",
      name: "Llama 3.3 70B Versatile",
      ownedBy: "Meta",
      contextWindow: 131072,
      active: true,
      freeTierEligible: true,
      description: "Fast flagship reasoning & multi-turn instructions (128k context)",
    },
    {
      id: "openai/gpt-oss-120b",
      name: "GPT OSS 120B",
      ownedBy: "OpenAI / Community",
      contextWindow: 131072,
      active: true,
      freeTierEligible: true,
      description: "High-capacity open-weights intelligence on Groq LPU",
    },
    {
      id: "llama-3.1-8b-instant",
      name: "Llama 3.1 8B Instant",
      ownedBy: "Meta",
      contextWindow: 131072,
      active: true,
      freeTierEligible: true,
      description: "Ultra-low latency instant triage and quick utilities (128k context)",
    },
    {
      id: "llama-3.2-11b-vision-preview",
      name: "Llama 3.2 11B Vision",
      ownedBy: "Meta",
      contextWindow: 131072,
      active: true,
      freeTierEligible: true,
      description: "Multimodal text and visual artifact inspection",
    },
    {
      id: "mixtral-8x7b-32768",
      name: "Mixtral 8x7B MoE",
      ownedBy: "Mistral AI",
      contextWindow: 32768,
      active: true,
      freeTierEligible: true,
      description: "Mixture-of-Experts high-throughput processing (32k context)",
    },
    {
      id: "gemma2-9b-it",
      name: "Gemma 2 9B IT",
      ownedBy: "Google",
      contextWindow: 8192,
      active: true,
      freeTierEligible: true,
      description: "Lightweight, highly capable instruction model",
    },
    {
      id: "qwen-2.5-32b",
      name: "Qwen 2.5 32B",
      ownedBy: "Alibaba Cloud",
      contextWindow: 131072,
      active: true,
      freeTierEligible: true,
      description: "Exceptional coding, math, and multilingual reasoning",
    },
    {
      id: "deepseek-r1-distill-llama-70b",
      name: "DeepSeek R1 Distill Llama 70B",
      ownedBy: "DeepSeek",
      contextWindow: 131072,
      active: true,
      freeTierEligible: true,
      description: "Distilled deep reasoning model on Groq hardware",
    },
  ],
  ollama: [
    {
      id: "qwen2.5:7b-instruct",
      name: "Qwen 2.5 7B Instruct",
      ownedBy: "Local Ollama",
      active: true,
      freeTierEligible: true,
      description: "Default local zero-spend model",
    },
    {
      id: "llama3.2:latest",
      name: "Llama 3.2 3B",
      ownedBy: "Local Ollama",
      active: true,
      freeTierEligible: true,
      description: "Ultra-fast local helper",
    },
    {
      id: "deepseek-r1:7b",
      name: "DeepSeek R1 7B",
      ownedBy: "Local Ollama",
      active: true,
      freeTierEligible: true,
      description: "Local reasoning & math model",
    },
  ],
  omniroute: [
    {
      id: "auto",
      name: "Auto (Omniroute Dynamic Gateway)",
      ownedBy: "Omniroute Local",
      active: true,
      freeTierEligible: true,
      description: "Dynamic multi-model free upstream router",
    },
  ],
  gemini: [
    {
      id: "gemini-3.6-flash",
      name: "Gemini 3.6 Flash",
      ownedBy: "Google",
      active: true,
      freeTierEligible: true,
      description: "Fast multimodal reasoning with generous free quota",
    },
    {
      id: "gemini-2.0-flash",
      name: "Gemini 2.0 Flash",
      ownedBy: "Google",
      active: true,
      freeTierEligible: true,
      description: "Next-gen ultra-fast multimodal model",
    },
    {
      id: "gemini-1.5-pro",
      name: "Gemini 1.5 Pro",
      ownedBy: "Google",
      active: true,
      description: "2M context window advanced strategic reasoning",
    },
  ],
};

function formatModelLabel(id: string, ownedBy?: string): string {
  // Common mappings for clean display
  if (id === "llama-3.3-70b-versatile") return "Llama 3.3 70B Versatile (128k)";
  if (id === "llama-3.1-8b-instant") return "Llama 3.1 8B Instant (128k)";
  if (id === "openai/gpt-oss-120b") return "GPT OSS 120B (Groq LPU)";
  if (id === "llama-3.2-11b-vision-preview") return "Llama 3.2 11B Vision (128k)";
  if (id === "mixtral-8x7b-32768") return "Mixtral 8x7B (32k)";
  if (id === "gemma2-9b-it") return "Gemma 2 9B IT (8k)";
  if (id === "qwen-2.5-32b") return "Qwen 2.5 32B (128k)";
  if (id === "deepseek-r1-distill-llama-70b") return "DeepSeek R1 Distill Llama 70B (128k)";
  if (id === "auto") return "Auto (Dynamic Router)";

  // Format generic slugs
  const parts = id.split("/").pop() || id;
  const capitalized = parts
    .split(/[-_:]/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");

  return ownedBy ? `${capitalized} (${ownedBy})` : capitalized;
}

const OFFICIAL_PROVIDER_HOSTS: Record<string, string[]> = {
  groq: ["api.groq.com"],
  openai: ["api.openai.com"],
  anthropic: ["api.anthropic.com"],
  gemini: ["generativelanguage.googleapis.com"],
  openrouter: ["openrouter.ai"],
};

export function isTrustedOfficialEndpoint(provider: string, urlString: string): boolean {
  try {
    const u = new URL(urlString);
    if (u.protocol !== "https:") return false;
    const allowedHosts = OFFICIAL_PROVIDER_HOSTS[provider.toLowerCase()];
    if (!allowedHosts) return false;
    return allowedHosts.includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function isTrustedLocalEndpoint(urlString: string): boolean {
  try {
    const u = new URL(urlString);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  } catch {
    return false;
  }
}

export interface ModelDiscoveryOptions {
  isOwnerConfigured?: boolean;
}

/**
 * Discovers live available models using official provider endpoints (e.g. Groq GET /openai/v1/models).
 * Securely enforces credential-to-endpoint binding and rejects untrusted destinations.
 */
export async function discoverProviderModels(
  providerType: string,
  baseUrl?: string,
  apiKey?: string | null,
  options: ModelDiscoveryOptions = {}
): Promise<ModelDiscoveryResult> {
  const normProvider = providerType.toLowerCase();
  const cleanUrl = (baseUrl || "").trim().replace(/\/+$/, "");

  // Validate destination safety before any network activity
  if (cleanUrl) {
    const isOfficial = isTrustedOfficialEndpoint(normProvider, cleanUrl);
    const isLocal = isTrustedLocalEndpoint(cleanUrl);
    const isApproved = isOfficial || isLocal || Boolean(options.isOwnerConfigured);

    if (!isApproved) {
      return {
        ok: false,
        provider: normProvider,
        models: FALLBACK_CATALOGS[normProvider] || [{ id: "default", name: "Default Model", active: true }],
        error: "Untrusted or unapproved model discovery endpoint. Destination rejected.",
        source: "fallback",
      };
    }
  }

  // 1. Resolve API key with strict host-binding (never attach cloud secrets to unverified hosts)
  let key = apiKey || null;
  if (!key) {
    if (normProvider === "groq" || normProvider.includes("groq")) {
      const isOfficial = !cleanUrl || isTrustedOfficialEndpoint("groq", cleanUrl);
      if (isOfficial) {
        key = getSecretForServerUse(SYSTEM_VAULT_ID, "groq") || process.env.GROQ_API_KEY || null;
      }
    } else if (normProvider in CLOUD_PROVIDERS) {
      const p = normProvider as CloudProvider;
      const isOfficial = !cleanUrl || isTrustedOfficialEndpoint(p, cleanUrl);
      if (isOfficial) {
        key = getSecretForServerUse(SYSTEM_VAULT_ID, p) || process.env[CLOUD_PROVIDERS[p].envKey] || null;
      }
    } else if (normProvider === "omniroute") {
      const isLocal = !cleanUrl || isTrustedLocalEndpoint(cleanUrl);
      if (isLocal) {
        key = getSecretForServerUse(SYSTEM_VAULT_ID, "omniroute") || process.env.OMNIROUTE_API_KEY || process.env.OMNIROUTE_TOKEN || null;
      }
    }
  }

  // 2. GROQ OFFICIAL MODEL DISCOVERY API
  if (normProvider === "groq" || cleanUrl.includes("groq.com")) {
    const endpoint = cleanUrl ? `${cleanUrl}/models` : "https://api.groq.com/openai/v1/models";
    if (!isTrustedOfficialEndpoint("groq", endpoint)) {
      return {
        ok: false,
        provider: "groq",
        models: FALLBACK_CATALOGS.groq,
        error: "Invalid Groq endpoint host. Must target official https://api.groq.com.",
        source: "fallback",
      };
    }

    if (!key) {
      return {
        ok: false,
        provider: "groq",
        models: FALLBACK_CATALOGS.groq,
        error: "No Groq API key configured. Enter your Groq API key to discover live models.",
        source: "fallback",
      };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);
      const res = await fetch(endpoint, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        redirect: "error",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return {
          ok: false,
          provider: "groq",
          models: FALLBACK_CATALOGS.groq,
          error: `Groq discovery failed (HTTP ${res.status}): ${errText.slice(0, 140)}`,
          source: "fallback",
        };
      }

      const data = await res.json();
      const rawList: Array<{ id: string; owned_by?: string; active?: boolean; context_window?: number }> = data.data || [];

      const models: DiscoveredModel[] = rawList
        .filter((m) => m.active !== false)
        .map((m) => ({
          id: m.id,
          name: formatModelLabel(m.id, m.owned_by),
          ownedBy: m.owned_by || "Groq",
          contextWindow: m.context_window,
          active: m.active ?? true,
          freeTierEligible: true,
          description: `Context: ${m.context_window ? `${Math.round(m.context_window / 1024)}k tokens` : "Standard"} • ${m.owned_by || "Groq Cloud"}`,
        }));

      // Sort with popular/flagship models first
      models.sort((a, b) => {
        if (a.id.includes("llama-3.3-70b")) return -1;
        if (b.id.includes("llama-3.3-70b")) return 1;
        if (a.id.includes("gpt-oss")) return -1;
        if (b.id.includes("gpt-oss")) return 1;
        return a.id.localeCompare(b.id);
      });

      return {
        ok: true,
        provider: "groq",
        models: models.length > 0 ? models : FALLBACK_CATALOGS.groq,
        source: "live",
      };
    } catch (err) {
      return {
        ok: false,
        provider: "groq",
        models: FALLBACK_CATALOGS.groq,
        error: `Could not reach Groq discovery API: ${err instanceof Error ? err.message : String(err)}`,
        source: "fallback",
      };
    }
  }

  // 3. OLLAMA MODEL DISCOVERY (Local loopback only)
  if (normProvider === "ollama" || cleanUrl.includes("11434")) {
    const rootUrl = cleanUrl ? cleanUrl.replace(/\/v1$/, "").replace(/\/api$/, "") : "http://localhost:11434";
    if (!isTrustedLocalEndpoint(rootUrl) && !options.isOwnerConfigured) {
      return {
        ok: false,
        provider: "ollama",
        models: FALLBACK_CATALOGS.ollama,
        error: "Ollama discovery endpoint must be a verified local loopback host.",
        source: "fallback",
      };
    }

    try {
      const res = await fetch(`${rootUrl}/api/tags`, { method: "GET", redirect: "error" });
      if (res.ok) {
        const data = await res.json();
        const tags: Array<{ name: string; size?: number; details?: { parameter_size?: string } }> = data.models || [];
        const models: DiscoveredModel[] = tags.map((t) => ({
          id: t.name,
          name: t.name,
          ownedBy: "Local Ollama",
          active: true,
          freeTierEligible: true,
          description: t.details?.parameter_size ? `${t.details.parameter_size} params` : "Local private model",
        }));
        return {
          ok: true,
          provider: "ollama",
          models: models.length > 0 ? models : FALLBACK_CATALOGS.ollama,
          source: "live",
        };
      }
    } catch {
      // fallback
    }
    return {
      ok: false,
      provider: "ollama",
      models: FALLBACK_CATALOGS.ollama,
      error: "Ollama not reachable locally on port 11434.",
      source: "fallback",
    };
  }

  // 4. OMNIROUTE MODEL DISCOVERY (Local loopback only)
  if (normProvider === "omniroute" || cleanUrl.includes("20128")) {
    const endpoint = cleanUrl ? (cleanUrl.endsWith("/v1") ? `${cleanUrl}/models` : `${cleanUrl}/v1/models`) : "http://localhost:20128/v1/models";
    if (!isTrustedLocalEndpoint(endpoint) && !options.isOwnerConfigured) {
      return {
        ok: false,
        provider: "omniroute",
        models: FALLBACK_CATALOGS.omniroute,
        error: "OmniRoute discovery endpoint must be a verified local loopback host.",
        source: "fallback",
      };
    }

    try {
      const headers: Record<string, string> = {};
      if (key) headers["Authorization"] = `Bearer ${key}`;
      const res = await fetch(endpoint, { method: "GET", headers, redirect: "error" });
      if (res.ok) {
        const data = await res.json();
        const list: Array<{ id: string; owned_by?: string }> = data.data || [];
        const models: DiscoveredModel[] = list.map((m) => ({
          id: m.id,
          name: formatModelLabel(m.id, m.owned_by),
          ownedBy: m.owned_by || "Omniroute",
          active: true,
          freeTierEligible: true,
        }));
        return {
          ok: true,
          provider: "omniroute",
          models: models.length > 0 ? models : FALLBACK_CATALOGS.omniroute,
          source: "live",
        };
      }
    } catch {
      // fallback
    }
    return {
      ok: false,
      provider: "omniroute",
      models: FALLBACK_CATALOGS.omniroute,
      error: "Omniroute not reachable on port 20128 or authentication required.",
      source: "fallback",
    };
  }

  // 5. GENERIC OPENAI-COMPATIBLE DISCOVERY (Explicitly Owner-Configured Only)
  if (cleanUrl && (options.isOwnerConfigured || isTrustedOfficialEndpoint(normProvider, cleanUrl))) {
    const endpoint = cleanUrl.endsWith("/v1") ? `${cleanUrl}/models` : `${cleanUrl}/v1/models`;
    if (key) {
      try {
        const res = await fetch(endpoint, {
          method: "GET",
          headers: { Authorization: `Bearer ${key}` },
          redirect: "error",
        });
        if (res.ok) {
          const data = await res.json();
          const list: Array<{ id: string; owned_by?: string }> = data.data || [];
          const models: DiscoveredModel[] = list.map((m) => ({
            id: m.id,
            name: formatModelLabel(m.id, m.owned_by),
            ownedBy: m.owned_by || "Custom Provider",
            active: true,
          }));
          if (models.length > 0) {
            return { ok: true, provider: normProvider, models, source: "live" };
          }
        }
      } catch {
        // ignore
      }
    }
  }

  const fallback = FALLBACK_CATALOGS[normProvider] || [
    { id: "default", name: "Default Model", active: true },
  ];
  return {
    ok: true,
    provider: normProvider,
    models: fallback,
    source: "fallback",
  };
}
