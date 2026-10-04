import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { executeNoraTurn, type NoraTurnInput, type NoraTurnOutput } from "@/lib/noraTurnEngine";

export type NoraHeadlessRequest = NoraTurnInput;
export type NoraHeadlessResponse = NoraTurnOutput;

const INTERNAL_SECRET_FILE = path.join(process.cwd(), "data", ".internal_voice_key");

/**
 * Gets or creates the local internal loopback authentication token.
 * Generated randomly and saved in protected uncommitted local storage.
 */
export function getInternalLoopbackSecret(): string {
  try {
    if (fs.existsSync(INTERNAL_SECRET_FILE)) {
      const key = fs.readFileSync(INTERNAL_SECRET_FILE, "utf-8").trim();
      if (key.length >= 32) return key;
    }
  } catch {
    // Fall through to generate
  }
  const newKey = crypto.randomBytes(32).toString("hex");
  try {
    fs.mkdirSync(path.dirname(INTERNAL_SECRET_FILE), { recursive: true });
    fs.writeFileSync(INTERNAL_SECRET_FILE, newKey, { mode: 0o600 });
  } catch {
    // Non-fatal write failure in sandbox
  }
  return newKey;
}

/**
 * Validates whether the incoming HTTP header matches the loopback secret.
 */
export function validateLoopbackSecret(providedHeader: string | null): boolean {
  if (!providedHeader) return false;
  const secret = getInternalLoopbackSecret();
  try {
    return crypto.timingSafeEqual(Buffer.from(providedHeader), Buffer.from(secret));
  } catch {
    return false;
  }
}

/**
 * Delegates directly to the single authoritative executeNoraTurn engine.
 */
export async function executeHeadlessTurn(req: NoraHeadlessRequest): Promise<NoraHeadlessResponse> {
  return executeNoraTurn({
    ...req,
    channel: req.channel || "voice_headless",
  });
}
