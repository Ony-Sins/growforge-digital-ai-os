// OWNER-REVIEW MODE — local-development infrastructure only.
//
// Preloaded into every Node process of the review server (NODE_OPTIONS=--require). Deny-by-default
// filesystem WRITE guard: any write/delete/rename/mkdir/etc. whose real path is not inside the small
// allowlist of dev-server scratch locations throws EROFS. This catches GET-triggered and background
// writes that no route list can enumerate, and it protects the primary owner data, the projection and
// the worktree source alike. Also: refuses to start if a credential-looking env var is present, and
// refuses to spawn non-node child processes.
"use strict";
if (process.env.GROWFORGE_OWNER_REVIEW !== "1") return;

const fs = require("fs");
const path = require("path");
const os = require("os");
const cp = require("child_process");

const ORIG = {
  realpathSync: fs.realpathSync.native || fs.realpathSync,
  appendFileSync: fs.appendFileSync,
  mkdirSync: fs.mkdirSync,
  existsSync: fs.existsSync,
  statSync: fs.statSync,
};
function isExistingDir(p) { try { return ORIG.statSync(p).isDirectory(); } catch { return false; } }

const LOG_DIR = process.env.GROWFORGE_REVIEW_LOG_DIR || "";
function audit(line) {
  if (!LOG_DIR) return;
  try { ORIG.mkdirSync(LOG_DIR, { recursive: true }); ORIG.appendFileSync(path.join(LOG_DIR, "guard.log"), `${new Date().toISOString()} pid=${process.pid} ${line}\n`); } catch { /* best effort */ }
}

// ---- 1. Environment self-check: names only, never values --------------------------------------
const FORBIDDEN_ENV = /(API_?KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|MASTER_KEY|PRIVATE_KEY|OAUTH|AUTH_GOOGLE)/i;
const ALLOWED_SECRETISH = new Set(["AUTH_SECRET"]); // ephemeral, generated per launch
if (process.env.GROWFORGE_REVIEW_ENV_CHECKED !== "1") {
  const bad = Object.keys(process.env).filter((k) => FORBIDDEN_ENV.test(k) && !ALLOWED_SECRETISH.has(k));
  audit(`env-names: ${Object.keys(process.env).sort().join(",")}`);
  if (bad.length) {
    audit(`FATAL forbidden env names present: ${bad.join(",")}`);
    process.stderr.write(`[owner-review] refusing to start: credential-like env vars present: ${bad.join(", ")}\n`);
    process.exit(78);
  }
  process.env.GROWFORGE_REVIEW_ENV_CHECKED = "1";
}

// ---- 2. Write allowlist -----------------------------------------------------------------------
const win = process.platform === "win32";
const norm = (p) => (win ? p.toLowerCase() : p);

function realish(p) {
  // realpath of the longest existing ancestor + the not-yet-existing remainder (follows junctions).
  let abs = path.resolve(String(p));
  const rest = [];
  for (;;) {
    try { return path.join(ORIG.realpathSync(abs), ...rest.reverse()); } catch {
      const parent = path.dirname(abs);
      if (parent === abs) return path.resolve(String(p));
      rest.push(path.basename(abs));
      abs = parent;
    }
  }
}

const UI = process.env.GROWFORGE_REVIEW_UI_DIR;
const EXTRA = (process.env.GROWFORGE_REVIEW_WRITE_ROOTS || "").split(path.delimiter).filter(Boolean);
const WRITE_ROOTS = [
  path.join(UI, ".next"),
  path.join(UI, "node_modules", ".cache"),
  os.tmpdir(),
  ...EXTRA,
].map((r) => norm(realish(r)));
const WRITE_FILES = [path.join(UI, "next-env.d.ts"), path.join(UI, "tsconfig.tsbuildinfo")].map((r) => norm(realish(r)));

function allowed(p) {
  const r = norm(realish(p));
  if (WRITE_FILES.includes(r)) return true;
  return WRITE_ROOTS.some((root) => r === root || r.startsWith(root + path.sep));
}

function deny(op, p) {
  audit(`DENY ${op} ${realish(p)}`);
  const e = new Error(`EROFS: owner-review read-only guard blocked ${op} '${p}'`);
  e.code = "EROFS"; e.syscall = op; e.path = String(p);
  return e;
}

const isPathArg = (v) => typeof v === "string" || v instanceof URL || Buffer.isBuffer(v);
const toPath = (v) => (v instanceof URL ? require("url").fileURLToPath(v) : Buffer.isBuffer(v) ? v.toString() : v);
const writeFlag = (f) => typeof f === "string" ? /[wa+]/.test(f) : typeof f === "number" ? (f & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_APPEND | fs.constants.O_CREAT | fs.constants.O_TRUNC)) !== 0 : false;

// name -> [argument indexes that are paths being modified]
const SPECS = {
  writeFile: [0], appendFile: [0], truncate: [0], mkdir: [0], mkdtemp: [0], rmdir: [0], rm: [0], unlink: [0],
  rename: [0, 1], copyFile: [1], cp: [1], symlink: [1], link: [1], utimes: [0], lutimes: [0], chmod: [0], lchmod: [0],
  chown: [0], lchown: [0], createWriteStream: [0], writeFileSync: [0], appendFileSync: [0], truncateSync: [0],
  mkdirSync: [0], mkdtempSync: [0], rmdirSync: [0], rmSync: [0], unlinkSync: [0], renameSync: [0, 1], copyFileSync: [1],
  cpSync: [1], symlinkSync: [1], linkSync: [1], utimesSync: [0], lutimesSync: [0], chmodSync: [0], chownSync: [0],
  lchownSync: [0], open: [0], openSync: [0],
};
const FLAGGED = new Set(["open", "openSync"]); // only a write when flags request it

function check(name, args) {
  const idx = SPECS[name];
  if (!idx) return null;
  if (FLAGGED.has(name) && !writeFlag(args[1] ?? "r")) return null;
  if (name === "createWriteStream") { /* always a write */ }
  for (const i of idx) {
    const a = args[i];
    if (!isPathArg(a)) continue; // fd-based call: the fd was opened through a guarded open()
    // mkdir of a directory that already exists changes nothing ("ensure data/ exists" at first read).
    if ((name === "mkdir" || name === "mkdirSync") && isExistingDir(toPath(a))) continue;
    if (!allowed(toPath(a))) return deny(name, toPath(a));
  }
  return null;
}

function wrapFs(target, name) {
  const orig = target[name];
  if (typeof orig !== "function") return;
  const isSync = /Sync$/.test(name) || name === "createWriteStream";
  target[name] = function guarded(...args) {
    const err = check(name, args);
    if (!err) return orig.apply(this, args);
    if (isSync) throw err;
    const cb = args.find((x) => typeof x === "function");
    if (cb) { process.nextTick(cb, err); return undefined; }
    throw err;
  };
}
for (const n of Object.keys(SPECS)) wrapFs(fs, n);

const P = fs.promises;
const PROMISE_SPECS = ["writeFile", "appendFile", "truncate", "mkdir", "mkdtemp", "rmdir", "rm", "unlink", "rename", "copyFile", "cp", "symlink", "link", "utimes", "lutimes", "chmod", "lchmod", "chown", "lchown", "open"];
for (const n of PROMISE_SPECS) {
  const orig = P[n];
  if (typeof orig !== "function") continue;
  P[n] = function guardedPromise(...args) {
    const err = check(n, args);
    return err ? Promise.reject(err) : orig.apply(this, args);
  };
}

// ---- 3. Child processes: node only -----------------------------------------------------------
const nodeExe = norm(path.resolve(process.execPath));
function okCommand(cmd) {
  if (typeof cmd !== "string") return false;
  const first = cmd.trim().replace(/^"([^"]+)".*$/, "$1").split(/\s+/)[0];
  const base = path.basename(first).toLowerCase().replace(/\.exe$/, "");
  return base === "node" || norm(path.resolve(first)) === nodeExe;
}
for (const n of ["spawn", "spawnSync", "execFile", "execFileSync"]) {
  const orig = cp[n];
  cp[n] = function (file, ...rest) {
    if (!okCommand(String(file))) { audit(`DENY child_process.${n} ${path.basename(String(file))}`); const e = new Error(`EPERM: owner-review guard blocked child_process.${n} '${path.basename(String(file))}'`); e.code = "EPERM"; throw e; }
    return orig.call(this, file, ...rest);
  };
}
for (const n of ["exec", "execSync"]) {
  const orig = cp[n];
  cp[n] = function (command, ...rest) {
    if (!okCommand(String(command))) { audit(`DENY child_process.${n} ${String(command).slice(0, 40)}`); const e = new Error(`EPERM: owner-review guard blocked child_process.${n}`); e.code = "EPERM"; throw e; }
    return orig.call(this, command, ...rest);
  };
}
audit(`guard active; writeRoots=${WRITE_ROOTS.length}`);
