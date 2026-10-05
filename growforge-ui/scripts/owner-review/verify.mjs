// OWNER-REVIEW MODE — local-development infrastructure only.
//
//   npm run owner-review:verify        (with `npm run dev:owner-review` running)
//
// Proves: primary canonical state is byte-identical before/after, mutations are refused server-side,
// the fs guard denies writes, no credential reached the review process, and the projection is minimal.
// Probes against canonical files are READ-ONLY by construction (open 'r+' is denied before any change).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  UI_DIR, PRIMARY_DATA, PRIMARY_UPLOADS, PRIMARY_ENV_FILE, PROJECTION_DATA, RUNTIME_LOGS, REVIEW_PORT, REVIEW_HOST,
  sha256File, parseEnvFile, SECRET_NAME_RE,
} from "./lib.mjs";
import { DATA_ALLOWLIST } from "./build-projection.mjs";

const REVIEW = `http://${REVIEW_HOST}:${REVIEW_PORT}`;
const PRIMARY_URL = "http://127.0.0.1:3000";
let failures = 0;
const check = (ok, label, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`); if (!ok) failures++; };

function hashTree(dir) {
  const out = {};
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : (out[path.relative(dir, p)] = sha256File(p)); } };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}
const snapshot = () => ({ data: hashTree(PRIMARY_DATA), uploads: hashTree(PRIMARY_UPLOADS) });
const diff = (a, b) => { const bad = []; for (const sec of ["data", "uploads"]) { const k = new Set([...Object.keys(a[sec]), ...Object.keys(b[sec])]); for (const f of k) if (a[sec][f] !== b[sec][f]) bad.push(`${sec}/${f}`); } return bad; };
async function http(url, init = {}) { try { const r = await fetch(url, { ...init, signal: AbortSignal.timeout(60000) }); const t = await r.text(); let j; try { j = JSON.parse(t); } catch { /* html */ } return { status: r.status, text: t, json: j }; } catch (e) { return { status: 0, text: String(e), json: undefined }; } }
const logLines = () => (fs.existsSync(path.join(RUNTIME_LOGS, "guard.log")) ? fs.readFileSync(path.join(RUNTIME_LOGS, "guard.log"), "utf8").split("\n") : []);

console.log("== 1. Canonical BEFORE ==");
const before = snapshot();
console.log(`hashed ${Object.keys(before.data).length} data files + ${Object.keys(before.uploads).length} upload files (incl. vault.json and .internal_voice_key; read-only)`);

console.log("\n== 2. Projection contents ==");
const present = fs.readdirSync(PROJECTION_DATA);
check(!present.includes("vault.json"), "vault.json absent from projection");
check(!present.includes(".internal_voice_key"), ".internal_voice_key absent from projection");
check(present.every((f) => DATA_ALLOWLIST.includes(f) || f === "_projection-manifest.json"), "projection contains only allowlisted files", present.join(", "));
const env = parseEnvFile(PRIMARY_ENV_FILE);
const secretValues = [...env].filter(([k, v]) => SECRET_NAME_RE.test(k) && v.length >= 8).map(([, v]) => v);
let leaks = 0;
for (const f of present) { const t = fs.readFileSync(path.join(PROJECTION_DATA, f), "utf8"); for (const s of secretValues) if (t.includes(s)) leaks++; }
check(leaks === 0, "no primary .env.local secret value appears in the projection", `${secretValues.length} values scanned`);

console.log("\n== 3. Servers ==");
const rv = await http(`${REVIEW}/`);
const pv = await http(`${PRIMARY_URL}/`);
check(rv.status === 200, "review server (3100) responds", `HTTP ${rv.status}`);
check(pv.status === 200, "primary server (3000) responds", `HTTP ${pv.status}`);
if (rv.status !== 200) { console.log("\nReview server not running — start `npm run dev:owner-review` first."); process.exit(2); }

console.log("\n== 4. Mutations refused server-side (3100) ==");
const mutations = [
  ["POST", "/api/jobs", {}], ["PUT", "/api/jobs/x", {}], ["PATCH", "/api/jobs/x", {}], ["DELETE", "/api/jobs/x"],
  ["POST", "/api/jobs/x/approve", {}], ["POST", "/api/jobs/x/rerun", {}], ["POST", "/api/profile/memory", {}], ["DELETE", "/api/profile/memory"],
  ["POST", "/api/approvals/x/decide", {}], ["POST", "/api/consultations/x/answer", {}], ["POST", "/api/connectors", {}], ["POST", "/api/mcp", {}],
  ["DELETE", "/api/mcp/x"], ["POST", "/api/vault/system", {}], ["PATCH", "/api/agents/x", {}], ["POST", "/api/agents/x/run", {}],
  ["POST", "/api/router", {}], ["POST", "/api/nora/turn", {}], ["POST", "/api/profile/avatar", {}], ["POST", "/api/attachments", {}],
];
for (const [m, p, body] of mutations) {
  const r = await http(`${REVIEW}${p}`, { method: m, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  check(r.status === 403 && r.json?.error === "owner_review_read_only", `${m} ${p} refused`, `HTTP ${r.status}`);
}
for (const p of ["/api/router", "/api/nora/voice-events", "/api/geo/reverse", "/api/mcp/connect", "/api/beta/me"]) {
  const r = await http(`${REVIEW}${p}`);
  check(r.status === 403 && r.json?.error === "owner_review_read_only", `GET ${p} (execution route) refused`, `HTTP ${r.status}`);
}

console.log("\n== 5. GET sweep (reads + GET-triggered writes) ==");
const deniesBefore = logLines().filter((l) => l.includes(" DENY ")).length;
const gets = ["/api/jobs", "/api/approvals", "/api/consultations", "/api/agents", "/api/connectors", "/api/mcp", "/api/profile/memory", "/api/core/state", "/api/spatial/dive", "/api/spatial/graph",
  "/api/spatial/telemetry", "/api/telemetry", "/api/logs", "/api/health", "/api/vault/system", "/api/vault/system/n8n/health"];
for (const p of gets) { const r = await http(`${REVIEW}${p}`); console.log(`  GET ${p} -> ${r.status}`); }
const deniesAfter = logLines().filter((l) => l.includes(" DENY ")).length;
console.log(`  guard denials during sweep: ${deniesAfter - deniesBefore} (attempted writes that were blocked)`);

console.log("\n== 6. Data fidelity ==");
const canonJobs = JSON.parse(fs.readFileSync(path.join(PRIMARY_DATA, "jobs.json"), "utf8"));
const jr = await http(`${REVIEW}/api/jobs`);
const jobsApi = Array.isArray(jr.json) ? jr.json : jr.json?.jobs ?? [];
check(jobsApi.length === canonJobs.length, "review /api/jobs count equals canonical", `${jobsApi.length} vs ${canonJobs.length}`);
const tally = (arr) => arr.reduce((m, j) => ((m[j.status] = (m[j.status] || 0) + 1), m), {});
check(JSON.stringify(tally(jobsApi)) === JSON.stringify(tally(canonJobs)) || JSON.stringify(Object.entries(tally(jobsApi)).sort()) === JSON.stringify(Object.entries(tally(canonJobs)).sort()),
  "mission statuses shown faithfully (no running->interrupted rewrite)", `${JSON.stringify(tally(jobsApi))}`);
const vault = await http(`${REVIEW}/api/vault/system`);
check(!/ciphertext|"iv"|"tag"/.test(vault.text), "/api/vault/system exposes no encrypted vault payload");
const core = await http(`${REVIEW}/api/core/state`);
check(core.status === 200 && /"online":false/.test(core.text), "service probes report truthful state (down services shown down)");

console.log("\n== 7. Filesystem guard (child process, same preload) ==");
const probeLog = path.join(os.tmpdir(), "owner-review-guard-test");
const guardEnv = { ...process.env, GROWFORGE_OWNER_REVIEW: "1", GROWFORGE_REVIEW_UI_DIR: UI_DIR, GROWFORGE_REVIEW_LOG_DIR: probeLog, GROWFORGE_REVIEW_WRITE_ROOTS: "", NODE_OPTIONS: `--require ${JSON.stringify(path.join(UI_DIR, "scripts", "owner-review", "fs-guard.cjs"))}` };
for (const k of Object.keys(guardEnv)) if (/(API_?KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|MASTER_KEY|PRIVATE_KEY|OAUTH)/i.test(k) && k !== "AUTH_SECRET") delete guardEnv[k];
const run = (code, env = guardEnv) => spawnSync(process.execPath, ["-e", code], { env, encoding: "utf8" });
const jobsCanon = JSON.stringify(path.join(PRIMARY_DATA, "jobs.json"));
const vaultCanon = JSON.stringify(path.join(PRIMARY_DATA, "vault.json"));
const probeSrc = JSON.stringify(path.join(UI_DIR, "src", "__owner_review_probe.txt"));
const probeProj = JSON.stringify(path.join(PROJECTION_DATA, "__owner_review_probe.txt"));
const probeNext = path.join(UI_DIR, ".next", "__owner_review_probe.txt");
const t = (label, code, expect) => { const r = run(code); const out = (r.stdout + r.stderr).trim(); check(expect(r, out), label, out.split("\n")[0].slice(0, 110)); };
t("write-open of canonical jobs.json (r+) denied", `try{require("fs").openSync(${jobsCanon},"r+");console.log("ALLOWED")}catch(e){console.log(e.code)}`, (r, o) => o === "EROFS");
t("write-open of canonical vault.json (r+) denied", `try{require("fs").openSync(${vaultCanon},"r+");console.log("ALLOWED")}catch(e){console.log(e.code)}`, (r, o) => o === "EROFS");
t("fs.promises.writeFile into worktree src denied", `require("fs").promises.writeFile(${probeSrc},"x").then(()=>console.log("ALLOWED"),e=>console.log(e.code))`, (r, o) => o === "EROFS");
t("writeFileSync into projection data denied", `try{require("fs").writeFileSync(${probeProj},"x");console.log("ALLOWED")}catch(e){console.log(e.code)}`, (r, o) => o === "EROFS");
t("callback-style fs.appendFile denied", `require("fs").appendFile(${probeSrc},"x",e=>console.log(e?e.code:"ALLOWED"))`, (r, o) => o === "EROFS");
t("rename/copy into src denied", `try{require("fs").copyFileSync(${jobsCanon},${probeSrc});console.log("ALLOWED")}catch(e){console.log(e.code)}`, (r, o) => o === "EROFS");
t("mkdir of an already-existing directory is a harmless no-op", `try{require("fs").mkdirSync(${JSON.stringify(PROJECTION_DATA)},{recursive:true});console.log("OK")}catch(e){console.log(e.code)}`, (r, o) => o === "OK");
t("write into .next scratch allowed", `try{const f=${JSON.stringify(probeNext)};require("fs").writeFileSync(f,"x");require("fs").unlinkSync(f);console.log("OK")}catch(e){console.log(e.code)}`, (r, o) => o === "OK");
t("write into OS temp allowed", `try{const f=require("path").join(require("os").tmpdir(),"owner-review-ok.txt");require("fs").writeFileSync(f,"x");require("fs").unlinkSync(f);console.log("OK")}catch(e){console.log(e.code)}`, (r, o) => o === "OK");
t("spawning a non-node program denied", `try{require("child_process").spawnSync("cmd",["/c","echo","hi"]);console.log("ALLOWED")}catch(e){console.log(e.code)}`, (r, o) => o === "EPERM");
const leaky = run(`console.log("started")`, { ...guardEnv, ANTHROPIC_API_KEY: "dummy-not-a-real-key" });
check(leaky.status === 78 && !/started/.test(leaky.stdout), "process refuses to start if a credential-like env var is present", `exit ${leaky.status}`);
check(!fs.existsSync(path.join(UI_DIR, "src", "__owner_review_probe.txt")) && !fs.existsSync(path.join(PROJECTION_DATA, "__owner_review_probe.txt")), "no probe file was created anywhere");

console.log("\n== 8. Review process environment (names only) ==");
const names = fs.readFileSync(path.join(RUNTIME_LOGS, "launch-env-names.txt"), "utf8").split("\n").filter(Boolean);
const forbidden = names.filter((n) => /(API_?KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|MASTER_KEY|PRIVATE_KEY|OAUTH|AUTH_GOOGLE)/i.test(n) && n !== "AUTH_SECRET");
check(forbidden.length === 0, "launch env contains no credential-like names (AUTH_SECRET is the ephemeral exception)", forbidden.join(",") || "clean");
const selfReport = logLines().find((l) => l.includes("env-names:") && !l.includes("GROWFORGE_REVIEW_ENV_CHECKED"));
const reported = selfReport ? selfReport.split("env-names: ")[1].split(",") : [];
const badLive = reported.filter((n) => /(API_?KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|MASTER_KEY|PRIVATE_KEY|OAUTH|AUTH_GOOGLE)/i.test(n) && n !== "AUTH_SECRET");
check(reported.length > 0 && badLive.length === 0, "the running server process itself reported a clean env (self-report in guard.log)", `${reported.length} names`);
check(!reported.includes("VAULT_MASTER_KEY") && !reported.includes("AUTH_GOOGLE_SECRET") && !reported.includes("N8N_API_KEY"), "VAULT_MASTER_KEY / AUTH_GOOGLE_SECRET / N8N_API_KEY not present in server env");

console.log("\n== 9. Canonical AFTER ==");
const after = snapshot();
const changed = diff(before, after);
check(changed.length === 0, "primary canonical data + uploads byte-identical before vs after", changed.join(", ") || `${Object.keys(after.data).length + Object.keys(after.uploads).length} files compared`);
const pj = await http(`${PRIMARY_URL}/api/jobs`);
const pjobs = Array.isArray(pj.json) ? pj.json : pj.json?.jobs ?? [];
check(pj.status === 200 && pjobs.length === canonJobs.length, "primary (3000) still serves the same mission count", `${pjobs.length}`);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"}`);
process.exit(failures === 0 ? 0 : 1);
