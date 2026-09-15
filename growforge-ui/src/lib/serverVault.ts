import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Server-only encrypted credential vault. Unlike the old client-side vault
 * (apiVault.ts, now removed), key material never reaches the browser in
 * any form — not ciphertext, not an IV, nothing. API routes built on this
 * module only ever return provider *names* (booleans/labels), never key
 * bytes. Decrypted values are read here, server-side, only at the moment
 * something needs to call out to the third-party provider.
 *
 * Encryption: AES-256-GCM with a random IV per secret, keyed by
 * VAULT_MASTER_KEY (a 32-byte key, hex-encoded, from the server
 * environment — never committed, never sent to the client).
 *
 * IMPORTANT — for a real production deployment, VAULT_MASTER_KEY should be
 * pulled from a managed secret store (AWS KMS/Secrets Manager, GCP Secret
 * Manager, Vault, etc.) and rotated, not a static .env value on disk. This
 * env-var-keyed implementation is the correct shape for an internal tool at
 * GrowForge's current scale, but the master key itself is only as safe as
 * the host it lives on.
 */

const DATA_DIR = path.join(process.cwd(), "data");
const VAULT_FILE = path.join(DATA_DIR, "vault.json");

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;

interface StoredEntry {
  iv: string; // base64
  ciphertext: string; // base64
  tag: string; // base64 (GCM auth tag)
}

type AgentVault = Record<string, StoredEntry>; // provider -> entry
type VaultFile = Record<string, AgentVault>; // agentId -> AgentVault

let masterKey: Buffer | null = null;

function getMasterKey(): Buffer {
  if (masterKey) return masterKey;

  const raw = process.env.VAULT_MASTER_KEY;
  if (!raw || raw.length !== 64 || !/^[0-9a-fA-F]+$/.test(raw)) {
    throw new Error(
      "VAULT_MASTER_KEY is missing or invalid — it must be a 64-character hex string (32 bytes). " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  masterKey = Buffer.from(raw, "hex");
  return masterKey;
}

function loadFile(): VaultFile {
  try {
    if (!fs.existsSync(VAULT_FILE)) return {};
    const raw = fs.readFileSync(VAULT_FILE, "utf8");
    if (!raw.trim()) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    console.error("[serverVault] failed to read/parse vault.json — treating as empty:", err);
    return {};
  }
}

let writeQueue: Promise<void> = Promise.resolve();

function saveFile(data: VaultFile) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const json = JSON.stringify(data, null, 2);
  writeQueue = writeQueue
    .then(() => fs.promises.writeFile(VAULT_FILE, json, "utf8"))
    .catch((err) => {
      console.error("[serverVault] failed to persist vault.json:", err);
    });
}

export function listProviders(agentId: string): string[] {
  const data = loadFile();
  return Object.keys(data[agentId] ?? {});
}

export function hasSecret(agentId: string, provider: string): boolean {
  const data = loadFile();
  return Boolean(data[agentId]?.[provider]);
}

export function setSecret(agentId: string, provider: string, value: string): void {
  const key = getMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  const data = loadFile();
  data[agentId] = data[agentId] ?? {};
  data[agentId][provider] = {
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    tag: tag.toString("base64"),
  };
  saveFile(data);
}

/** Server-side use only — decrypts and returns the plaintext secret. Never
 *  wire this return value into an API response; it exists for outbound
 *  calls this server makes to the third-party provider on the agent's
 *  behalf. */
export function getSecretForServerUse(agentId: string, provider: string): string | null {
  const data = loadFile();
  const entry = data[agentId]?.[provider];
  if (!entry) return null;

  try {
    const key = getMasterKey();
    const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(entry.iv, "base64"));
    decipher.setAuthTag(Buffer.from(entry.tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(entry.ciphertext, "base64")),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  } catch (err) {
    console.error(`[serverVault] failed to decrypt ${agentId}/${provider}:`, err);
    return null;
  }
}

export function removeSecret(agentId: string, provider: string): void {
  const data = loadFile();
  if (!data[agentId]) return;
  delete data[agentId][provider];
  if (Object.keys(data[agentId]).length === 0) delete data[agentId];
  saveFile(data);
}

export function purgeAgent(agentId: string): void {
  const data = loadFile();
  if (!data[agentId]) return;
  delete data[agentId];
  saveFile(data);
}
