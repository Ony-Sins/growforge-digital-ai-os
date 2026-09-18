import fs from "node:fs";
import path from "node:path";
import {
  SYSTEM_VAULT_ID,
  CLOUD_PROVIDERS,
  hasKey,
  type CloudProvider,
} from "@/lib/llm";
import {
  hasSecret,
  setSecret,
  getSecretForServerUse,
  removeSecret,
} from "@/lib/serverVault";

export type TaskRole = "general" | "planning" | "coding" | "utility";
export type ProviderType =
  | "openai-compatible"
  | "ollama"
  | "anthropic"
  | "gemini"
  | "groq"
  | "openrouter"
  | "custom";

export interface StoredAiModel {
  id: string;
  name: string;
  providerType: ProviderType;
  baseUrl: string;
  modelName: string;
  taskRole: TaskRole;
  isPrimary?: boolean;
  source: "vault" | "env" | "local" | "custom";
  createdAt: string;
  lastTestedAt?: string;
  lastLatencyMs?: number;
  lastStatus?: "ok" | "error";
  lastErrorMessage?: string;
}

export interface ClientAiModel extends StoredAiModel {
  hasApiKey: boolean;
  isConfigured: boolean;
}

const DATA_DIR = path.join(process.cwd(), "data");
const MODELS_FILE = path.join(DATA_DIR, "ai_models.json");

function getDefaultModels(): StoredAiModel[] {
  const now = new Date().toISOString();
  return [
    {
      id: "gemini-default",
      name: "Google Gemini (Flash 3.6)",
      providerType: "gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      modelName: "gemini-3.6-flash",
      taskRole: "general",
      isPrimary: true,
      source: hasKey("gemini") ? (hasSecret(SYSTEM_VAULT_ID, "gemini") ? "vault" : "env") : "env",
      createdAt: now,
    },
    {
      id: "groq-default",
      name: "Groq (Llama 3.3 70B Fast)",
      providerType: "groq",
      baseUrl: "https://api.groq.com/openai/v1",
      modelName: "llama-3.3-70b-versatile",
      taskRole: "utility",
      source: hasKey("groq") ? (hasSecret(SYSTEM_VAULT_ID, "groq") ? "vault" : "env") : "env",
      createdAt: now,
    },
    {
      id: "openai-default",
      name: "OpenAI (GPT-4o Mini)",
      providerType: "openai-compatible",
      baseUrl: "https://api.openai.com/v1",
      modelName: "gpt-4o-mini",
      taskRole: "planning",
      source: hasKey("openai") ? (hasSecret(SYSTEM_VAULT_ID, "openai") ? "vault" : "env") : "env",
      createdAt: now,
    },
    {
      id: "anthropic-default",
      name: "Anthropic (Claude 3.5 Sonnet)",
      providerType: "anthropic",
      baseUrl: "https://api.anthropic.com/v1",
      modelName: "claude-3-5-sonnet-latest",
      taskRole: "coding",
      source: hasKey("anthropic") ? (hasSecret(SYSTEM_VAULT_ID, "anthropic") ? "vault" : "env") : "env",
      createdAt: now,
    },
    {
      id: "openrouter-default",
      name: "OpenRouter (Gateway)",
      providerType: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      modelName: "openrouter/auto",
      taskRole: "general",
      source: hasKey("openrouter") ? (hasSecret(SYSTEM_VAULT_ID, "openrouter") ? "vault" : "env") : "env",
      createdAt: now,
    },
    {
      id: "ollama-local",
      name: "Local Ollama (Private)",
      providerType: "ollama",
      baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1",
      modelName: process.env.OLLAMA_MODEL || "llama3.2:1b",
      taskRole: "utility",
      source: "local",
      createdAt: now,
    },
  ];
}

function loadModelsFile(): StoredAiModel[] {
  try {
    if (!fs.existsSync(MODELS_FILE)) {
      const defaults = getDefaultModels();
      saveModelsFile(defaults);
      return defaults;
    }
    const raw = fs.readFileSync(MODELS_FILE, "utf8");
    if (!raw.trim()) {
      const defaults = getDefaultModels();
      saveModelsFile(defaults);
      return defaults;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    const defaults = getDefaultModels();
    saveModelsFile(defaults);
    return defaults;
  } catch (err) {
    console.error("[aiModelStore] failed to read ai_models.json — falling back to defaults:", err);
    return getDefaultModels();
  }
}

let writeQueue: Promise<void> = Promise.resolve();

function saveModelsFile(models: StoredAiModel[]): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const json = JSON.stringify(models, null, 2);
  const tmp = MODELS_FILE + ".tmp";
  writeQueue = writeQueue
    .then(() => fs.promises.writeFile(tmp, json, "utf8"))
    .then(() => fs.promises.rename(tmp, MODELS_FILE))
    .catch((err) => {
      console.error("[aiModelStore] failed to persist ai_models.json:", err);
    });
}

function resolveModelSecretKey(model: StoredAiModel): string {
  // Built-in standard providers share the canonical provider key
  if (model.id === "gemini-default") return "gemini";
  if (model.id === "groq-default") return "groq";
  if (model.id === "openai-default") return "openai";
  if (model.id === "anthropic-default") return "anthropic";
  if (model.id === "openrouter-default") return "openrouter";
  return `model_${model.id}`;
}

export function listAiModels(): ClientAiModel[] {
  const models = loadModelsFile();
  return models.map((m) => {
    const secretKey = resolveModelSecretKey(m);
    const hasVaultSecret = hasSecret(SYSTEM_VAULT_ID, secretKey);
    const isCloudProvider = m.providerType in CLOUD_PROVIDERS;
    const hasEnvKey = isCloudProvider ? Boolean(process.env[CLOUD_PROVIDERS[m.providerType as CloudProvider]?.envKey]) : false;
    const isConfigured = m.providerType === "ollama" ? true : hasVaultSecret || hasEnvKey;

    let source = m.source;
    if (hasVaultSecret) source = "vault";
    else if (hasEnvKey) source = "env";
    else if (m.providerType === "ollama") source = "local";

    return {
      ...m,
      source,
      hasApiKey: hasVaultSecret || hasEnvKey,
      isConfigured,
    };
  });
}

export function getAiModel(id: string): StoredAiModel | null {
  const models = loadModelsFile();
  return models.find((m) => m.id === id) || null;
}

export function getAiModelApiKey(model: StoredAiModel): string | null {
  const secretKey = resolveModelSecretKey(model);
  const fromVault = getSecretForServerUse(SYSTEM_VAULT_ID, secretKey);
  if (fromVault) return fromVault;

  // Fallback to provider env var if applicable
  if (model.providerType in CLOUD_PROVIDERS) {
    const envKey = CLOUD_PROVIDERS[model.providerType as CloudProvider]?.envKey;
    if (envKey && process.env[envKey]) return process.env[envKey]!;
  }
  return null;
}

export function saveAiModel(
  modelInput: Partial<StoredAiModel> & { id?: string; name: string; baseUrl: string; modelName: string },
  apiKey?: string
): ClientAiModel {
  const models = loadModelsFile();
  const id = modelInput.id || `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const existingIdx = models.findIndex((m) => m.id === id);

  const cleanBaseUrl = (modelInput.baseUrl || "").trim().replace(/\/+$/, "");
  const cleanModelName = (modelInput.modelName || "").trim();
  const cleanName = (modelInput.name || "").trim() || cleanModelName || "Custom AI Model";

  let providerType: ProviderType = modelInput.providerType || "openai-compatible";
  if (cleanBaseUrl.includes("anthropic.com")) providerType = "anthropic";
  else if (cleanBaseUrl.includes("generativelanguage.googleapis.com")) providerType = "gemini";
  else if (cleanBaseUrl.includes("11434") || cleanBaseUrl.includes("ollama")) providerType = "ollama";
  else if (cleanBaseUrl.includes("groq.com")) providerType = "groq";
  else if (cleanBaseUrl.includes("openrouter.ai")) providerType = "openrouter";

  const updated: StoredAiModel = {
    id,
    name: cleanName,
    providerType,
    baseUrl: cleanBaseUrl,
    modelName: cleanModelName,
    taskRole: modelInput.taskRole || "general",
    isPrimary: Boolean(modelInput.isPrimary),
    source: apiKey ? "vault" : (existingIdx >= 0 ? models[existingIdx].source : modelInput.source || "custom"),
    createdAt: existingIdx >= 0 ? models[existingIdx].createdAt : new Date().toISOString(),
    lastTestedAt: existingIdx >= 0 ? models[existingIdx].lastTestedAt : undefined,
    lastLatencyMs: existingIdx >= 0 ? models[existingIdx].lastLatencyMs : undefined,
    lastStatus: existingIdx >= 0 ? models[existingIdx].lastStatus : undefined,
    lastErrorMessage: existingIdx >= 0 ? models[existingIdx].lastErrorMessage : undefined,
  };

  // If set to primary, unset previous primary
  if (updated.isPrimary) {
    for (const m of models) {
      if (m.id !== id) m.isPrimary = false;
    }
  }

  if (existingIdx >= 0) {
    models[existingIdx] = updated;
  } else {
    models.push(updated);
  }

  saveModelsFile(models);

  // Store key in vault if provided
  if (apiKey && apiKey.trim()) {
    const secretKey = resolveModelSecretKey(updated);
    setSecret(SYSTEM_VAULT_ID, secretKey, apiKey.trim());
  }

  const hasVaultSecret = hasSecret(SYSTEM_VAULT_ID, resolveModelSecretKey(updated));
  return {
    ...updated,
    hasApiKey: hasVaultSecret || Boolean(apiKey),
    isConfigured: updated.providerType === "ollama" ? true : hasVaultSecret,
  };
}

export function deleteAiModel(id: string): boolean {
  const models = loadModelsFile();
  const target = models.find((m) => m.id === id);
  if (!target) return false;

  const filtered = models.filter((m) => m.id !== id);
  saveModelsFile(filtered);

  const secretKey = resolveModelSecretKey(target);
  removeSecret(SYSTEM_VAULT_ID, secretKey);
  return true;
}

export function updateAiModelTestStatus(
  id: string,
  result: { ok: boolean; message: string; latencyMs: number }
): void {
  const models = loadModelsFile();
  const idx = models.findIndex((m) => m.id === id);
  if (idx < 0) return;

  models[idx].lastTestedAt = new Date().toISOString();
  models[idx].lastLatencyMs = result.latencyMs;
  models[idx].lastStatus = result.ok ? "ok" : "error";
  models[idx].lastErrorMessage = result.ok ? undefined : result.message;

  saveModelsFile(models);
}
