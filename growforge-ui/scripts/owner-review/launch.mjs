// OWNER-REVIEW MODE — local-development infrastructure only.
//
//   npm run dev:owner-review
//
// Starts THIS worktree's UI on 127.0.0.1:3100 against a sanitized, read-only projection of the primary
// owner's state. The primary installation (and its port 3000 server) is never written or restarted.
//
//   primary owner data --(allowlisted read)--> projection (outside git) --(junction)--> this worktree --> :3100
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import {
  UI_DIR, WORKTREE_ROOT, PRIMARY_ROOT, PRIMARY_ENV_FILE, RUNTIME_DIR, PROJECTION_DATA, PROJECTION_UPLOADS,
  RUNTIME_LOGS, REVIEW_HOST, REVIEW_PORT, REVIEW_SESSION_EMAIL, SAFE_ENV_ALLOWLIST, parseEnvFile, isSafeConfigValue,
} from "./lib.mjs";
import { buildProjection } from "./build-projection.mjs";

const args = process.argv.slice(2);
const port = Number((args.find((a) => a.startsWith("--port="))?.split("=")[1]) ?? REVIEW_PORT);
if (path.resolve(WORKTREE_ROOT).toLowerCase() === path.resolve(PRIMARY_ROOT).toLowerCase()) {
  console.error("[owner-review] refusing: this is the primary installation. Run it from a UI worktree.");
  process.exit(1);
}
if (port === 3000) { console.error("[owner-review] refusing: port 3000 belongs to the primary server."); process.exit(1); }

// 1. Fresh projection (primary is only read).
if (!args.includes("--no-refresh")) {
  console.log("[owner-review] building projection…");
  buildProjection();
}

// 2. Point this worktree's data/ and public/uploads/ at the projection with directory junctions.
function ensureJunction(link, target, label) {
  const st = fs.lstatSync(link, { throwIfNoEntry: false });
  if (st?.isSymbolicLink()) {
    if (path.resolve(fs.realpathSync(link)).toLowerCase() === path.resolve(target).toLowerCase()) return;
    fs.unlinkSync(link); // a junction of ours pointing elsewhere: re-point (removes only the link)
  } else if (st) {
    console.error(`[owner-review] ${label} exists as a real directory/file at ${link}.\n` +
      "  Move it aside once (e.g. outside the repo), then re-run. Refusing to delete it myself.");
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(link), { recursive: true });
  fs.symlinkSync(target, link, "junction");
  console.log(`[owner-review] linked ${label} -> ${target}`);
}
ensureJunction(path.join(UI_DIR, "data"), PROJECTION_DATA, "data/");
ensureJunction(path.join(UI_DIR, "public", "uploads"), PROJECTION_UPLOADS, "public/uploads/");

// 3. Build the process environment FROM SCRATCH: OS basics + allowlisted non-secret config + fresh AUTH_SECRET.
const OS_VARS = ["SystemRoot", "SYSTEMROOT", "windir", "ComSpec", "PATH", "Path", "PATHEXT", "TEMP", "TMP", "USERPROFILE", "APPDATA", "LOCALAPPDATA",
  "ProgramFiles", "ProgramFiles(x86)", "ProgramData", "ProgramW6432", "HOMEDRIVE", "HOMEPATH", "USERNAME", "COMPUTERNAME", "OS", "PROCESSOR_ARCHITECTURE", "NUMBER_OF_PROCESSORS"];
const env = {};
for (const k of OS_VARS) if (process.env[k] !== undefined) env[k] = process.env[k];

const primaryEnv = parseEnvFile(PRIMARY_ENV_FILE);
const passed = [], skipped = [];
for (const k of SAFE_ENV_ALLOWLIST) {
  const v = primaryEnv.get(k);
  if (v === undefined || v === "") continue;
  if (isSafeConfigValue(v)) { env[k] = v; passed.push(k); } else skipped.push(k);
}
Object.assign(env, {
  NODE_ENV: "development",
  GROWFORGE_OWNER_REVIEW: "1",
  GROWFORGE_REVIEW_UI_DIR: UI_DIR,
  GROWFORGE_REVIEW_LOG_DIR: RUNTIME_LOGS,
  GROWFORGE_REVIEW_WRITE_ROOTS: "", // no extra write roots: only dev-server scratch (.next, tmp) is writable
  AUTH_SECRET: crypto.randomBytes(32).toString("hex"), // ephemeral; NOT the owner's
  AUTH_TRUST_HOST: "true",
  DEV_SESSION_EMAIL: REVIEW_SESSION_EMAIL,
  DEV_SESSION_ROLE: "owner",
  NEXT_TELEMETRY_DISABLED: "1",
  NODE_OPTIONS: `--require ${JSON.stringify(path.join(UI_DIR, "scripts", "owner-review", "fs-guard.cjs"))}`,
});

fs.mkdirSync(RUNTIME_LOGS, { recursive: true });
fs.writeFileSync(path.join(RUNTIME_LOGS, "launch-env-names.txt"), Object.keys(env).sort().join("\n") + "\n");
fs.writeFileSync(path.join(RUNTIME_LOGS, "guard.log"), ""); // fresh audit log per launch

console.log(`[owner-review] env passed by name: ${passed.join(", ") || "(none)"}`);
if (skipped.length) console.log(`[owner-review] env skipped (unsafe-looking value): ${skipped.join(", ")}`);
console.log("[owner-review] withheld: all provider/API keys, vault key, OAuth, n8n/HF credentials (ephemeral AUTH_SECRET only)");
console.log(`[owner-review] starting http://${REVIEW_HOST}:${port}  (read-only, localhost only)`);

const nextBin = path.join(UI_DIR, "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextBin, "dev", "--hostname", REVIEW_HOST, "--port", String(port)], { cwd: UI_DIR, env, stdio: "inherit" });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("exit", (code) => process.exit(code ?? 0));
