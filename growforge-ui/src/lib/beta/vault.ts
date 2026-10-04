import { normaliseEmail } from "./store";

export const ALLOWED_BYOK_PROVIDERS = [
  "openai",
  "anthropic",
  "gemini",
  "groq",
  "openrouter",
] as const;

export type ByokProvider = (typeof ALLOWED_BYOK_PROVIDERS)[number];

export function isAllowedByokProvider(p: string): p is ByokProvider {
  return (ALLOWED_BYOK_PROVIDERS as readonly string[]).includes(p);
}

export interface EncryptedVaultRecord {
  provider: ByokProvider;
  iv: string; // hex
  ciphertext: string; // hex (includes AES-GCM auth tag)
  masked: string; // e.g. "••••7F2A"
  enabled: boolean;
  selectedModel?: string;
  createdAt: string;
  updatedAt: string;
  lastTestedAt: string | null;
  lastUsedAt: string | null;
}

export interface ByokProviderSummary {
  provider: ByokProvider;
  masked: string;
  enabled: boolean;
  selectedModel?: string;
  createdAt: string;
  updatedAt: string;
  lastTestedAt: string | null;
  lastUsedAt: string | null;
}

export function toSafeSummary(r: EncryptedVaultRecord): ByokProviderSummary {
  return {
    provider: r.provider,
    masked: r.masked,
    enabled: r.enabled,
    selectedModel: r.selectedModel,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    lastTestedAt: r.lastTestedAt,
    lastUsedAt: r.lastUsedAt,
  };
}

export function maskCredential(rawKey: string): string {
  const trimmed = rawKey.trim();
  if (trimmed.length <= 8) {
    return "••••" + trimmed.slice(-2);
  }
  return "••••" + trimmed.slice(-4);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

function getMasterKeyHex(): string {
  const key = process.env.BETA_VAULT_MASTER_KEY;
  if (!key || key.length < 32) {
    throw new Error("BETA_VAULT_MASTER_KEY is not configured or too short.");
  }
  return key;
}

async function getCryptoKey(masterKeyHex?: string): Promise<CryptoKey> {
  const hex = masterKeyHex || getMasterKeyHex();
  let rawBytes: Uint8Array;
  if (/^[0-9a-fA-F]{64}$/.test(hex)) {
    rawBytes = hexToBytes(hex);
  } else {
    const enc = new TextEncoder().encode(hex);
    const hashBuffer = await crypto.subtle.digest("SHA-256", enc);
    rawBytes = new Uint8Array(hashBuffer);
  }

  return await crypto.subtle.importKey(
    "raw",
    rawBytes.buffer as ArrayBuffer,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts a raw API key using AES-256-GCM.
 * Compatible with Web Crypto API on Cloudflare Workers and Node 18+.
 */
export async function encryptCredential(
  rawKey: string,
  masterKeyHex?: string
): Promise<{ iv: string; ciphertext: string; masked: string }> {
  const key = await getCryptoKey(masterKeyHex);
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV standard for GCM
  const encoded = new TextEncoder().encode(rawKey.trim());

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer, tagLength: 128 },
    key,
    encoded.buffer as ArrayBuffer
  );

  return {
    iv: bytesToHex(iv),
    ciphertext: bytesToHex(new Uint8Array(cipherBuffer)),
    masked: maskCredential(rawKey),
  };
}

/**
 * Decrypts an encrypted credential back to plaintext in-memory only.
 */
export async function decryptCredential(
  record: { iv: string; ciphertext: string },
  masterKeyHex?: string
): Promise<string> {
  const key = await getCryptoKey(masterKeyHex);
  const iv = hexToBytes(record.iv);
  const cipherBytes = hexToBytes(record.ciphertext);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer, tagLength: 128 },
    key,
    cipherBytes.buffer as ArrayBuffer
  );

  return new TextDecoder().decode(decryptedBuffer);
}

// ---------------------------------------------------------------------------------------------
// Upstash Redis Vault Store Operations
// ---------------------------------------------------------------------------------------------

function upstash() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

const K_VAULT = (email: string) => `growforge:beta:v2:vault:${email}`;

// In-memory fallback for local tests if Upstash is absent
const inMemoryVault: Record<string, Record<string, EncryptedVaultRecord>> = {};

async function redisCmd(cmd: (string | number)[]): Promise<any> {
  const u = upstash();
  if (!u) throw new Error("Upstash Redis is required for beta vault.");
  const res = await fetch(`${u.url}/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${u.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cmd),
    cache: "no-store",
  });
  const data: any = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Redis vault command failed: ${res.status}`);
  if (data?.error) throw new Error(`Redis vault error: ${data.error}`);
  return data?.result;
}

/**
 * List safe summaries of all connected providers for an authenticated tester.
 */
export async function listTesterProviders(email: string): Promise<ByokProviderSummary[]> {
  const e = normaliseEmail(email);
  const u = upstash();
  if (!u) {
    const userVault = inMemoryVault[e] || {};
    return Object.values(userVault).map(toSafeSummary);
  }

  const rawHash: Record<string, string> = (await redisCmd(["HGETALL", K_VAULT(e)])) || {};
  const summaries: ByokProviderSummary[] = [];

  // Upstash HGETALL returns either an object { [field]: value } or an array of [field, value, ...]
  if (Array.isArray(rawHash)) {
    for (let i = 0; i < rawHash.length; i += 2) {
      try {
        const record: EncryptedVaultRecord = JSON.parse(rawHash[i + 1]);
        summaries.push(toSafeSummary(record));
      } catch {}
    }
  } else if (typeof rawHash === "object" && rawHash !== null) {
    for (const val of Object.values(rawHash)) {
      try {
        const record: EncryptedVaultRecord = JSON.parse(val);
        summaries.push(toSafeSummary(record));
      } catch {}
    }
  }

  return summaries;
}

/**
 * Fetch the encrypted record for a specific provider (used internally for decryption during execution).
 */
export async function getTesterEncryptedRecord(
  email: string,
  provider: ByokProvider
): Promise<EncryptedVaultRecord | null> {
  const e = normaliseEmail(email);
  const u = upstash();
  if (!u) {
    return inMemoryVault[e]?.[provider] || null;
  }

  const rawJson: string | null = await redisCmd(["HGET", K_VAULT(e), provider]);
  if (!rawJson) return null;
  try {
    return JSON.parse(rawJson);
  } catch {
    return null;
  }
}

/**
 * Save or replace an encrypted provider credential for an authenticated tester.
 */
export async function saveTesterCredential(
  email: string,
  provider: ByokProvider,
  rawKey: string,
  selectedModel?: string
): Promise<ByokProviderSummary> {
  if (!isAllowedByokProvider(provider)) {
    throw new Error(`Unsupported provider: ${provider}`);
  }
  const e = normaliseEmail(email);
  const existing = await getTesterEncryptedRecord(e, provider);
  const now = new Date().toISOString();
  const encrypted = await encryptCredential(rawKey);

  const record: EncryptedVaultRecord = {
    provider,
    iv: encrypted.iv,
    ciphertext: encrypted.ciphertext,
    masked: encrypted.masked,
    enabled: true,
    selectedModel: selectedModel || existing?.selectedModel,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    lastTestedAt: null,
    lastUsedAt: existing?.lastUsedAt || null,
  };

  const u = upstash();
  if (!u) {
    if (!inMemoryVault[e]) inMemoryVault[e] = {};
    inMemoryVault[e][provider] = record;
    return toSafeSummary(record);
  }

  await redisCmd(["HSET", K_VAULT(e), provider, JSON.stringify(record)]);
  return toSafeSummary(record);
}

/**
 * Enable or disable a provider, or update its selected model.
 */
export async function updateTesterProvider(
  email: string,
  provider: ByokProvider,
  updates: { enabled?: boolean; selectedModel?: string }
): Promise<ByokProviderSummary | null> {
  const e = normaliseEmail(email);
  const record = await getTesterEncryptedRecord(e, provider);
  if (!record) return null;

  if (typeof updates.enabled === "boolean") record.enabled = updates.enabled;
  if (typeof updates.selectedModel === "string") record.selectedModel = updates.selectedModel;
  record.updatedAt = new Date().toISOString();

  const u = upstash();
  if (!u) {
    if (!inMemoryVault[e]) inMemoryVault[e] = {};
    inMemoryVault[e][provider] = record;
    return toSafeSummary(record);
  }

  await redisCmd(["HSET", K_VAULT(e), provider, JSON.stringify(record)]);
  return toSafeSummary(record);
}

/**
 * Record a timestamp update (lastTestedAt or lastUsedAt) without modifying ciphertext.
 */
export async function touchTesterProvider(
  email: string,
  provider: ByokProvider,
  field: "lastTestedAt" | "lastUsedAt"
): Promise<void> {
  const e = normaliseEmail(email);
  const record = await getTesterEncryptedRecord(e, provider);
  if (!record) return;

  const now = new Date().toISOString();
  record[field] = now;
  record.updatedAt = now;

  const u = upstash();
  if (!u) {
    if (inMemoryVault[e]?.[provider]) inMemoryVault[e][provider] = record;
    return;
  }

  await redisCmd(["HSET", K_VAULT(e), provider, JSON.stringify(record)]);
}

/**
 * Delete a specific provider from the tester's vault.
 */
export async function deleteTesterProvider(
  email: string,
  provider: ByokProvider
): Promise<boolean> {
  const e = normaliseEmail(email);
  const u = upstash();
  if (!u) {
    if (inMemoryVault[e]?.[provider]) {
      delete inMemoryVault[e][provider];
      return true;
    }
    return false;
  }

  const deletedCount: number = await redisCmd(["HDEL", K_VAULT(e), provider]);
  return deletedCount > 0;
}

/**
 * Delete all vault records for a tester (invoked when account is deleted/purged).
 */
export async function deleteAllTesterCredentials(email: string): Promise<number> {
  const e = normaliseEmail(email);
  const u = upstash();
  if (!u) {
    if (inMemoryVault[e]) {
      const count = Object.keys(inMemoryVault[e]).length;
      delete inMemoryVault[e];
      return count;
    }
    return 0;
  }

  const res: number = await redisCmd(["DEL", K_VAULT(e)]);
  return res || 0;
}
