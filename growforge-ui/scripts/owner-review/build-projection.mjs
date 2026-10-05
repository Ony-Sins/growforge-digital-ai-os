// OWNER-REVIEW MODE — local-development infrastructure only.
//
// Builds a disposable, sanitized, READ-ONLY-by-intent projection of the minimum owner state the Dive
// lenses need, outside any git work tree. The primary installation is only ever READ here.
//
//   node scripts/owner-review/build-projection.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PRIMARY_DATA, PRIMARY_UPLOADS, PRIMARY_ENV_FILE, PRIMARY_ROOT, WORKTREE_ROOT, RUNTIME_DIR, PROJECTION_DATA,
  PROJECTION_UPLOADS, RUNTIME_LOGS, REVIEW_SESSION_EMAIL, sha256, parseEnvFile, SECRET_NAME_RE,
} from "./lib.mjs";

/** Files a current Dive lens genuinely reads (proven in the 2026-10-05 audit). Nothing else is copied. */
export const DATA_ALLOWLIST = [
  "jobs.json",                // Missions, Overview, Workflows, Intelligence, Departments (core/state, jobs)
  "store.json",               // Agents lens (agents + logs)
  "approvals.json",           // Overview / Missions approvals
  "consultations.json",       // Missions consultations
  "ai_models.json",           // Tools / Systems model registry (no keys: baseUrl sanitized)
  "capability_status.json",   // Tools lens capability status
  "approved_free_routes.json",// model router state read by core/state
  "mcp-servers.json",         // Tools lens — METADATA ONLY (command/args/url/headers withheld)
  "user_memories.json",       // Context lens — OWNER RECORD ONLY, re-keyed
];

/** Never projected. Listed so the exclusion is explicit and testable. */
export const DATA_EXCLUDED = [
  "vault.json", ".internal_voice_key", "connectors.json", "media_registry.json", "media_storage/",
  "swarm_states/", "instruction-executions/", "backtests/", "beta.json", "*.tmp",
];

const SECRET_KEY_RE = /(api[-_]?key|secret|password|passwd|authorization|cookie|credential|private[-_]?key|bearer|master[-_]?key|access[-_]?token|refresh[-_]?token|id[-_]?token|^token$|^pin$|pin[-_]?hash|^salt$)/i;
const SECRET_VALUE_RES = [
  /\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}/g, /\bAIza[0-9A-Za-z_-]{30,}/g, /\bgh[pousr]_[A-Za-z0-9]{30,}/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/g, /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/g, /\bhf_[A-Za-z0-9]{30,}/g,
  /\bgsk_[A-Za-z0-9]{20,}/g, /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
];

let redactions = 0;
function scrubString(s) {
  let out = s;
  for (const re of SECRET_VALUE_RES) out = out.replace(re, () => { redactions++; return "[redacted-secret]"; });
  return out;
}

/** Recursively redact secret-named string values and secret-looking substrings. Numbers/booleans (usage counts) untouched. */
export function sanitize(value, key = "") {
  if (typeof value === "string") {
    if (key && SECRET_KEY_RE.test(key) && value) { redactions++; return "[redacted]"; }
    if (/url$/i.test(key) || /^https?:\/\//i.test(value)) return scrubUrl(scrubString(value));
    return scrubString(value);
  }
  if (Array.isArray(value)) return value.map((v) => sanitize(v));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = sanitize(v, k);
    return out;
  }
  return value;
}

function scrubUrl(s) {
  if (!/^https?:\/\//i.test(s)) return s;
  try {
    const u = new URL(s);
    let changed = false;
    if (u.username || u.password) { u.username = ""; u.password = ""; changed = true; }
    for (const k of [...u.searchParams.keys()]) if (/key|token|secret|pass|auth|sig/i.test(k)) { u.searchParams.set(k, "redacted"); changed = true; }
    if (changed) redactions++;
    return changed ? u.toString() : s;
  } catch { return s; }
}

function projectMcp(list) {
  return (Array.isArray(list) ? list : []).map((s) => ({
    id: s.id, name: s.name, transport: s.transport, allowedDepartments: s.allowedDepartments ?? [],
    catalogId: s.catalogId, createdAt: s.createdAt, origin: s.origin, targetLobe: s.targetLobe,
    status: s.status, lastPing: s.lastPing, errorMessage: s.errorMessage,
    detectedTools: Array.isArray(s.detectedTools) ? s.detectedTools.map((t) => ({ name: t.name, description: t.description })) : undefined,
    // command / args / url / authHeader intentionally withheld in review mode
  }));
}

function ownerKey(memories, ownerEmails) {
  const keys = Object.keys(memories);
  for (const e of ownerEmails) { const hit = keys.find((k) => k.toLowerCase() === e.toLowerCase()); if (hit) return hit; }
  return null;
}

function assertSafeTargets() {
  const rt = path.resolve(RUNTIME_DIR).toLowerCase();
  for (const bad of [PRIMARY_ROOT, WORKTREE_ROOT]) {
    const b = path.resolve(bad).toLowerCase();
    if (rt === b || rt.startsWith(b + path.sep)) throw new Error(`projection dir must be outside ${bad}`);
  }
}

export function buildProjection({ quiet = false } = {}) {
  assertSafeTargets();
  const log = (...a) => { if (!quiet) console.log(...a); };
  redactions = 0;

  // Disposable: clear only OUR runtime data/uploads, never anything else.
  for (const d of [PROJECTION_DATA, PROJECTION_UPLOADS]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }
  fs.mkdirSync(RUNTIME_LOGS, { recursive: true });

  const env = parseEnvFile(PRIMARY_ENV_FILE);
  const ownerEmails = (env.get("OWNER_EMAILS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const manifest = { builtAt: new Date().toISOString(), note: "Disposable owner-review projection. Safe to delete; rebuilt at launch.", files: [], uploads: [], excluded: DATA_EXCLUDED };

  for (const name of DATA_ALLOWLIST) {
    const src = path.join(PRIMARY_DATA, name);
    if (!fs.existsSync(src)) { manifest.files.push({ name, status: "absent in primary" }); continue; }
    const raw = fs.readFileSync(src);
    let json = JSON.parse(raw.toString("utf8"));
    const before = redactions;
    if (name === "mcp-servers.json") json = projectMcp(json);
    if (name === "user_memories.json") {
      const k = ownerKey(json, ownerEmails);
      json = k ? { [REVIEW_SESSION_EMAIL]: json[k] } : {};
    }
    const out = JSON.stringify(sanitize(json), null, 2);
    fs.writeFileSync(path.join(PROJECTION_DATA, name), out, "utf8");
    manifest.files.push({ name, sourceSha256: sha256(raw), projectedSha256: sha256(Buffer.from(out)), bytes: out.length, redactions: redactions - before });
    log(`  projected ${name} (${out.length} bytes, ${redactions - before} redactions)`);
  }

  // Uploads: only the files the owner profile actually references (avatar / cover / logo), images only.
  const mem = (() => { try { return JSON.parse(fs.readFileSync(path.join(PROJECTION_DATA, "user_memories.json"), "utf8"))[REVIEW_SESSION_EMAIL]; } catch { return null; } })();
  const refs = [mem?.profile?.avatarUrl, mem?.profile?.coverPhotoUrl, mem?.profile?.logoUrl].filter((u) => typeof u === "string" && u.startsWith("/uploads/"));
  for (const ref of refs) {
    const rel = ref.replace(/^\/uploads\//, "").split("?")[0];
    const src = path.resolve(PRIMARY_UPLOADS, rel);
    if (!src.startsWith(path.resolve(PRIMARY_UPLOADS) + path.sep) || !/\.(png|jpe?g|webp|gif)$/i.test(src) || !fs.existsSync(src)) { manifest.uploads.push({ ref, status: "skipped" }); continue; }
    const dst = path.join(PROJECTION_UPLOADS, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    manifest.uploads.push({ ref, bytes: fs.statSync(dst).size });
  }

  fs.writeFileSync(path.join(PROJECTION_DATA, "_projection-manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  // ---- Post-build safety checks (abort on any failure) ----
  const present = fs.readdirSync(PROJECTION_DATA);
  const allowed = new Set([...DATA_ALLOWLIST, "_projection-manifest.json"]);
  const stray = present.filter((f) => !allowed.has(f));
  if (stray.length) throw new Error(`unexpected files in projection: ${stray.join(", ")}`);
  for (const f of ["vault.json", ".internal_voice_key"]) if (present.includes(f)) throw new Error(`${f} must never be projected`);

  // Leak scan: no secret VALUE from the primary .env.local may appear anywhere in the projection (counts only).
  const secretValues = [...env].filter(([k, v]) => SECRET_NAME_RE.test(k) && v.length >= 8).map(([, v]) => v);
  let leaks = 0;
  for (const f of present) {
    const text = fs.readFileSync(path.join(PROJECTION_DATA, f), "utf8");
    for (const sv of secretValues) if (text.includes(sv)) leaks++;
  }
  if (leaks) throw new Error(`projection leak check FAILED: ${leaks} env secret value(s) found in projection`);
  log(`  leak check: ${secretValues.length} env secret values scanned, 0 found in projection`);
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Building owner-review projection\n  from: ${PRIMARY_DATA} (read-only)\n  to:   ${PROJECTION_DATA}`);
  const m = buildProjection();
  console.log(`Done: ${m.files.filter((f) => f.projectedSha256).length} files, ${m.uploads.filter((u) => u.bytes).length} uploads.`);
}
