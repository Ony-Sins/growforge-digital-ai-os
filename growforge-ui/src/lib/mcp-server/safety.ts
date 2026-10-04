/**
 * GrowForge MCP Gateway (Phase 1) — safety primitives.
 *
 * Everything that crosses the MCP boundary goes through here: the startup guard,
 * the actor model, output redaction, error sanitisation and size bounds. This
 * module is dependency-light on purpose (no store imports) so it can be tested
 * and reused by a future remote transport unchanged.
 */

import { isPublicPreviewMode } from "@/lib/previewMode";

// ---------------------------------------------------------------------------
// Actor model
// ---------------------------------------------------------------------------

export type McpPermission =
  | "read:overview"
  | "read:missions"
  | "read:activity"
  | "read:health"
  | "read:services"
  | "read:models"
  | "read:errors"
  | "read:usage"
  | "read:brain"
  | "read:workspace";

export const ALL_READ_PERMISSIONS: readonly McpPermission[] = [
  "read:overview",
  "read:missions",
  "read:activity",
  "read:health",
  "read:services",
  "read:models",
  "read:errors",
  "read:usage",
  "read:brain",
  "read:workspace",
];

/**
 * Who is calling. Phase 1 only ever constructs `local_owner_mcp` (a trusted
 * stdio child of the owner's own agent on the owner's own machine). The other
 * fields exist so a future remote transport can carry a real identity without
 * reshaping every tool; the server refuses any actor type it was not built for.
 */
export interface McpActor {
  actorType: "local_owner_mcp" | "remote_user_mcp";
  userId: string | null;
  workspaceId: string | null;
  platformRole: "owner" | "employee" | "tester" | null;
  workspaceRole: string | null;
  permissions: ReadonlySet<McpPermission>;
}

export function createLocalOwnerActor(): McpActor {
  return {
    actorType: "local_owner_mcp",
    // Deliberately null: GrowForge stores are single-tenant today, so there is no
    // canonical user/workspace id to report. Never invent one.
    userId: null,
    workspaceId: null,
    platformRole: "owner",
    workspaceRole: null,
    permissions: new Set(ALL_READ_PERMISSIONS),
  };
}

// ---------------------------------------------------------------------------
// Startup guard
// ---------------------------------------------------------------------------

export interface GuardResult {
  ok: boolean;
  reason?: string;
}

/**
 * The Phase 1 server is for the owner's local development machine only. It
 * refuses to start in public-preview / private-beta / production-like
 * environments. There is intentionally no override flag: a future phase must
 * add an explicit, reviewed policy rather than a bypass.
 */
export function assertLocalDevelopmentEnvironment(env: NodeJS.ProcessEnv = process.env): GuardResult {
  const previewLike =
    env.PUBLIC_PREVIEW_MODE === "true" || env.NEXT_PUBLIC_PREVIEW_MODE === "true" || env.BETA_MODE === "true";
  // Use the canonical predicate as well, so the two can never drift apart.
  if (previewLike || (env === process.env && isPublicPreviewMode())) {
    return { ok: false, reason: "PUBLIC_PREVIEW_MODE/BETA_MODE is active" };
  }
  if (env.NODE_ENV === "production") return { ok: false, reason: "NODE_ENV=production" };
  if (env.VERCEL || env.VERCEL_ENV || env.CF_PAGES || env.CLOUDFLARE_WORKER) {
    return { ok: false, reason: "hosted deployment environment detected" };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

const SECRET_VALUE_PATTERNS: RegExp[] = [
  /sk-(?:or-|ant-|proj-)?[A-Za-z0-9_-]{16,}/g, // OpenAI / OpenRouter / Anthropic style
  /AIza[0-9A-Za-z_-]{30,}/g, // Google API keys
  /gsk_[A-Za-z0-9]{20,}/g, // Groq
  /hf_[A-Za-z0-9]{20,}/g, // Hugging Face
  /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}/g, // GitHub tokens
  /github_pat_[A-Za-z0-9_]{30,}/g,
  /xox[abprs]-[A-Za-z0-9-]{10,}/g, // Slack
  /AKIA[0-9A-Z]{16}/g, // AWS access key id
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, // JWT
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /Bearer\s+[A-Za-z0-9._~+/=-]{12,}/gi,
  /\b[0-9a-fA-F]{64}\b/g, // 32-byte hex (vault master key shape)
];

const KEY_VALUE_PATTERN =
  /((?:api[_-]?key|access[_-]?token|auth[_-]?token|secret|password|passwd|authorization|client[_-]?secret|private[_-]?key)["']?\s*[:=]\s*["']?)([^\s"',;}]{6,})/gi;

const SENSITIVE_ENV_NAME = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH_|COOKIE)/i;
/** Matched against the lower-cased key with `_`/`-` removed, so apiKey, api_key and API-KEY all hit. */
const SENSITIVE_KEY_SUFFIX =
  /(apikey|accesskey|secretkey|privatekey|authkey|secret|password|passwd|credential|credentials|authorization|cookie|token)$/;

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_SUFFIX.test(key.toLowerCase().replace(/[_-]/g, ""));
}

export const REDACTED = "[REDACTED]";

let envSecretCache: string[] | null = null;

/** Values of sensitive-looking environment variables, longest first. */
function envSecretValues(): string[] {
  if (envSecretCache) return envSecretCache;
  const values = new Set<string>();
  for (const [name, value] of Object.entries(process.env)) {
    if (!value || value.length < 8) continue;
    if (SENSITIVE_ENV_NAME.test(name)) values.add(value);
  }
  envSecretCache = [...values].sort((a, b) => b.length - a.length);
  return envSecretCache;
}

/** Call after the environment changes (tests, late .env loading). */
export function resetRedactionCache(): void {
  envSecretCache = null;
}

export function redactString(input: string): string {
  let out = input;
  for (const secret of envSecretValues()) {
    if (out.includes(secret)) out = out.split(secret).join(REDACTED);
  }
  for (const pattern of SECRET_VALUE_PATTERNS) out = out.replace(pattern, REDACTED);
  out = out.replace(KEY_VALUE_PATTERN, (_m, lead: string) => `${lead}${REDACTED}`);
  return out;
}

const ABSOLUTE_PATH = /(?:[A-Za-z]:)?[\\/](?:[\w .@()-]+[\\/])+[\w .@()-]*/g;

export function scrubPaths(input: string): string {
  return input.replace(ABSOLUTE_PATH, "[path]");
}

export function truncate(input: string, max: number): string {
  return input.length <= max ? input : `${input.slice(0, Math.max(0, max - 1))}…`;
}

/** Like safeText, but also hides absolute filesystem paths — for error messages. */
export function safeErrorText(input: unknown, max = 240): string {
  return truncate(scrubPaths(redactString(input === null || input === undefined ? "" : String(input))), max);
}

/** Redact + truncate a free-text field. */
export function safeText(input: unknown, max = 240): string {
  if (input === null || input === undefined) return "";
  return truncate(redactString(String(input)), max);
}

/**
 * Deep copy with every string redacted and every credential-named key masked.
 * Numbers and booleans under a credential-ish name (e.g. `hasApiKey: true`,
 * `totalTokens: 12`) are kept — they carry no secret material.
 */
export function sanitizeDeep<T>(value: T, depth = 0): T {
  if (depth > 8) return REDACTED as unknown as T;
  if (typeof value === "string") return redactString(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => sanitizeDeep(v, depth + 1)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(k) && v !== null && typeof v !== "boolean" && typeof v !== "number") {
        out[k] = REDACTED;
      } else {
        out[k] = sanitizeDeep(v, depth + 1);
      }
    }
    return out as T;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type McpErrorCode =
  | "INVALID_ARGUMENT"
  | "NOT_FOUND"
  | "PERMISSION_DENIED"
  | "UNAVAILABLE"
  | "INTERNAL";

/** An error whose message is already safe to show to the calling agent. */
export class McpToolError extends Error {
  constructor(
    public readonly code: McpErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "McpToolError";
  }
}

/** Never leaks stack traces, file paths or secret material. */
export function sanitizeError(err: unknown): { code: McpErrorCode; message: string } {
  if (err instanceof McpToolError) return { code: err.code, message: safeText(err.message, 200) };
  const raw = err instanceof Error ? err.message : String(err);
  // Strip anything that looks like an absolute path before truncating.
  const noPaths = raw.replace(/(?:[A-Za-z]:)?[\\/](?:[\w .@()-]+[\\/])+[\w .@()-]*/g, "[path]");
  return { code: "INTERNAL", message: `Internal error: ${safeText(noPaths, 160)}` };
}

// ---------------------------------------------------------------------------
// Bounds
// ---------------------------------------------------------------------------

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;
/** Hard ceiling on one tool payload, in characters of serialised JSON. */
export const MAX_PAYLOAD_CHARS = 24_000;

export function clampLimit(limit: number | undefined, fallback = DEFAULT_LIMIT, max = MAX_LIMIT): number {
  if (limit === undefined || !Number.isFinite(limit)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(limit)));
}

/**
 * Keep a payload under MAX_PAYLOAD_CHARS by repeatedly halving its largest
 * array. Reports whether anything was dropped so the caller can say so.
 */
export function boundPayload<T>(payload: T, maxChars = MAX_PAYLOAD_CHARS): { value: T; truncated: boolean } {
  let current = payload;
  let truncated = false;
  for (let i = 0; i < 12; i++) {
    if (JSON.stringify(current).length <= maxChars) return { value: current, truncated };
    const next = shrinkLargestArray(current);
    if (!next) break;
    current = next;
    truncated = true;
  }
  return { value: current, truncated: true };
}

function shrinkLargestArray<T>(root: T): T | null {
  const clone = structuredClone(root);
  let best: { arr: unknown[]; len: number } | null = null;
  const walk = (node: unknown, depth: number) => {
    if (depth > 6 || node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      if (node.length > 1 && (!best || node.length > best.len)) best = { arr: node, len: node.length };
      node.forEach((n) => walk(n, depth + 1));
      return;
    }
    Object.values(node as Record<string, unknown>).forEach((n) => walk(n, depth + 1));
  };
  walk(clone, 0);
  if (!best) return null;
  const target = best as { arr: unknown[]; len: number };
  target.arr.length = Math.ceil(target.len / 2);
  return clone;
}
