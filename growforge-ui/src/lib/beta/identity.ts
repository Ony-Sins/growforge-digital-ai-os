import crypto from "crypto";

/**
 * Normalizes email address consistently across all beta systems.
 */
export function normalizeBetaEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Resolves the dedicated HMAC key for beta storage identity derivation.
 * Strictly independent from AUTH_SECRET.
 */
function getBetaHmacKey(): string {
  const key = process.env.BETA_IDENTITY_HMAC_KEY;
  if (key && key.trim()) {
    return key.trim();
  }
  // In non-production test/development environments, fallback to a deterministic test seed
  if (process.env.NODE_ENV !== "production") {
    return "growforge-dev-beta-identity-hmac-seed-key-32b";
  }
  throw new Error("BETA_IDENTITY_HMAC_KEY is required in production but not set.");
}

/**
 * Derives an opaque, unguessable tester storage identifier from their authenticated email.
 * Output format: "tid_<32 hexadecimal characters>" (128 bits of cryptographic output).
 *
 * Properties:
 * - Deterministic for a given email + BETA_IDENTITY_HMAC_KEY.
 * - Independent from AUTH_SECRET (rotating session auth secrets will not alter storage identities).
 * - Never leaks or embeds raw email in storage key names.
 */
export function getOpaqueTesterId(email: string, customHmacKey?: string): string {
  const normalized = normalizeBetaEmail(email);
  const key = customHmacKey || getBetaHmacKey();
  const hex = crypto.createHmac("sha256", key).update(normalized).digest("hex");
  return `tid_${hex.slice(0, 32)}`;
}

/**
 * Derives an opaque, keyed blocklist identifier for a deleted/revoked tester email.
 * Replaces raw plain SHA-256 with a keyed HMAC to prevent offline dictionary/rainbow table attacks.
 */
export function getOpaqueBlockKey(email: string, customHmacKey?: string): string {
  const normalized = normalizeBetaEmail(email);
  const key = customHmacKey || getBetaHmacKey();
  const hex = crypto.createHmac("sha256", key).update(`block:${normalized}`).digest("hex");
  return `blk_${hex.slice(0, 32)}`;
}
