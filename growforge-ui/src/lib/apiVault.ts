"use client";

/**
 * Per-agent BYO-API key vault. Entirely client-side: keys are encrypted
 * with the Web Crypto API (AES-GCM) using a random key generated for this
 * browser tab and held only in sessionStorage — so both the vault contents
 * and the encryption key itself vanish when the tab closes.
 *
 * IMPORTANT — this protects against casual shoulder-surfing of
 * sessionStorage in devtools, NOT against an attacker who can already run
 * JavaScript in this origin (e.g. XSS): at that point they can call these
 * same functions and read the decrypted keys, same as the page itself can.
 * That's an inherent limit of any client-side-only secret store; there is
 * no real vault here, only obfuscation-at-rest. Real secrets belong in a
 * server-side secret manager behind real authentication.
 *
 * Keys never leave the browser: dispatch calls only ever send a boolean
 * "this agent has a custom key for provider X" flag to the server, never
 * the key value itself (see ApiKeyVault.tsx / hasVaultKeys()).
 */

const VAULT_KEY_STORAGE = "growforge.vault.cryptoKey";
const vaultStorageKey = (agentId: string) => `growforge.vault.${agentId}`;

interface StoredEntry {
  iv: string; // base64
  ciphertext: string; // base64
}

type VaultRecord = Record<string, StoredEntry>;

function bufToBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToBuf(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

let cachedKey: CryptoKey | null = null;

async function getSessionCryptoKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;

  const existing = window.sessionStorage.getItem(VAULT_KEY_STORAGE);
  if (existing) {
    const raw = base64ToBuf(existing);
    cachedKey = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
    return cachedKey;
  }

  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const raw = await crypto.subtle.exportKey("raw", key);
  window.sessionStorage.setItem(VAULT_KEY_STORAGE, bufToBase64(raw));
  cachedKey = key;
  return key;
}

function readVault(agentId: string): VaultRecord {
  try {
    const raw = window.sessionStorage.getItem(vaultStorageKey(agentId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeVault(agentId: string, record: VaultRecord) {
  window.sessionStorage.setItem(vaultStorageKey(agentId), JSON.stringify(record));
}

export async function setVaultKey(agentId: string, provider: string, value: string): Promise<void> {
  const key = await getSessionCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(value),
  );
  const record = readVault(agentId);
  record[provider] = { iv: bufToBase64(iv.buffer), ciphertext: bufToBase64(ciphertext) };
  writeVault(agentId, record);
}

export async function getVaultKey(agentId: string, provider: string): Promise<string | null> {
  const record = readVault(agentId);
  const entry = record[provider];
  if (!entry) return null;
  try {
    const key = await getSessionCryptoKey();
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBuf(entry.iv) },
      key,
      base64ToBuf(entry.ciphertext),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}

export function listVaultProviders(agentId: string): string[] {
  return Object.keys(readVault(agentId));
}

export function hasVaultKeys(agentId: string): boolean {
  return listVaultProviders(agentId).length > 0;
}

export function removeVaultKey(agentId: string, provider: string): void {
  const record = readVault(agentId);
  delete record[provider];
  writeVault(agentId, record);
}

export function purgeAgentVault(agentId: string): void {
  window.sessionStorage.removeItem(vaultStorageKey(agentId));
}

export function maskKey(value: string): string {
  if (value.length <= 4) return "••••";
  return `••••••••${value.slice(-4)}`;
}
