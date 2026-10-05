// OWNER-REVIEW MODE — local-development infrastructure only. See src/lib/ownerReview.ts.
// Shared path resolution + env parsing for the launcher, projection builder and verifier.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const UI_DIR = path.resolve(here, "..", "..");            // <worktree>/growforge-ui
export const WORKTREE_ROOT = path.resolve(UI_DIR, "..");

/** Primary installation root, derived from git's common dir (never hardcoded). */
export function resolvePrimaryRoot() {
  const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: UI_DIR, encoding: "utf8" }).trim();
  return path.resolve(common, "..");
}

export const PRIMARY_ROOT = resolvePrimaryRoot();
export const PRIMARY_UI = path.join(PRIMARY_ROOT, "growforge-ui");
export const PRIMARY_DATA = path.join(PRIMARY_UI, "data");
export const PRIMARY_UPLOADS = path.join(PRIMARY_UI, "public", "uploads");
export const PRIMARY_ENV_FILE = path.join(PRIMARY_UI, ".env.local");

/** Disposable projection lives beside the repos, outside any git work tree. */
export const RUNTIME_DIR = path.resolve(WORKTREE_ROOT, "..", "GrowForge-owner-review-runtime");
export const PROJECTION_DATA = path.join(RUNTIME_DIR, "data");
export const PROJECTION_UPLOADS = path.join(RUNTIME_DIR, "uploads");
export const RUNTIME_LOGS = path.join(RUNTIME_DIR, "logs");

export const REVIEW_PORT = 3100;
export const REVIEW_HOST = "127.0.0.1";
/** Not a real address: the projected owner memory record is re-keyed to this so no real email is passed in. */
export const REVIEW_SESSION_EMAIL = "owner-review@localhost";

export function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export function sha256File(file) {
  return sha256(fs.readFileSync(file));
}

/** Minimal dotenv parser. Returns Map(name -> value). Values are never printed by callers. */
export function parseEnvFile(file) {
  const out = new Map();
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith("#")) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out.set(m[1], v);
  }
  return out;
}

/** Non-secret configuration the review UI needs for fidelity. Anything not listed here is NOT passed. */
export const SAFE_ENV_ALLOWLIST = [
  "OLLAMA_BASE_URL", "OLLAMA_MODEL", "SEARXNG_BASE_URL", "N8N_HOST", "COMFYUI_SERVER_URL",
  "ANTHROPIC_MODEL", "GEMINI_MODEL", "GROQ_MODEL", "OPENAI_MODEL", "OPENROUTER_MODEL",
  "LLM_STRATEGY", "JOB_PREFER_CLOUD",
];

/** A value is safe only if it carries no embedded credential (URL userinfo / key-like query). */
export function isSafeConfigValue(value) {
  if (!value || value.length > 300) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    try {
      const u = new URL(value);
      if (u.username || u.password) return false;
      for (const k of u.searchParams.keys()) if (/key|token|secret|pass|auth/i.test(k)) return false;
    } catch { return false; }
  }
  return !/(sk-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,}|Bearer\s)/.test(value);
}

/** Names in the primary .env.local that look secret — their VALUES are used only for leak scanning, never output. */
export const SECRET_NAME_RE = /(API_?KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|MASTER_KEY|PRIVATE_KEY|OAUTH|AUTH_GOOGLE)/i;
