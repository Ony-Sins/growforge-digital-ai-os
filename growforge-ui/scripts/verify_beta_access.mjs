/**
 * Private-beta HTTP access verification. Requires a BETA_MODE=true server (see state.md for the exact
 * command) at BETA_URL (default http://localhost:3100) using a throwaway BETA_STORE_FILE.
 *
 * Sessions are real Auth.js session cookies signed with AUTH_SECRET from .env.local - i.e. exactly what a
 * browser holds after Google sign-in. That is also the "stolen / stale cookie" case: a frozen, revoked or
 * deleted tester's cookie must stop working on the next request.
 *
 * Leak scan: the owner's private strings are loaded from local files at runtime and NEVER printed -
 * only match counts are reported.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { encode } from "next-auth/jwt";
import { execSync } from "node:child_process";

const BASE = process.env.BETA_URL || "http://localhost:3100";
const COOKIE = "authjs.session-token";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const SECRET = env.AUTH_SECRET;
const OWNER = (env.OWNER_EMAILS || "").split(",")[0].trim().toLowerCase();
assert(SECRET && OWNER, "AUTH_SECRET and OWNER_EMAILS present in .env.local");

const results = [];
// ---- private needles (never printed) -------------------------------------------------------
const needles = new Set([OWNER]);
for (const [k, v] of Object.entries(env)) if (/(KEY|SECRET|TOKEN|CREDENTIALS)/.test(k) && v.length >= 12) needles.add(v);
const walkStrings = (o, out, depth = 0) => {
  if (depth > 6 || o == null) return;
  if (typeof o === "string") { if (o.length >= 10 && o.length <= 200) out.push(o); return; }
  if (Array.isArray(o)) { o.slice(0, 200).forEach((x) => walkStrings(x, out, depth + 1)); return; }
  if (typeof o === "object") Object.values(o).forEach((x) => walkStrings(x, out, depth + 1));
};
// Every distinctive string in EVERY local data file counts as private, except text that already exists in
// git-tracked source (public anyway - e.g. seeded templates). This is stricter than sampling a few files.
const trackedCorpus = execSync("git ls-files", { encoding: "utf8" }).split(/\r?\n/).filter((f) => /\.(md|ts|tsx|js|mjs|json|txt)$/.test(f))
  .map((f) => { try { return fs.readFileSync(f, "utf8"); } catch { return ""; } }).join("\n");
const dataFiles = [];
const collect = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) collect(p); else if (e.name.endsWith(".json")) dataFiles.push(p); } };
if (fs.existsSync("data")) collect("data");
for (const p of dataFiles) {
  if (p.endsWith("beta.json")) continue;
  try {
    const found = [];
    walkStrings(JSON.parse(fs.readFileSync(p, "utf8")), found);
    found.filter((s) => /\s/.test(s) && s.length >= 24 && !trackedCorpus.includes(s)).slice(0, 2000).forEach((s) => needles.add(s));
  } catch { /* unreadable: skip */ }
}
results.push(`      (leak scan: ${needles.size} private strings from ${dataFiles.length} local data files + .env.local secrets)`);
const leakCount = (text) => [...needles].filter((n) => text.includes(n)).length;

// ---- sessions ------------------------------------------------------------------------------
const cookieFor = async (claims) => `${COOKIE}=${await encode({ token: { sub: claims.email, name: claims.name ?? "T", ...claims }, secret: SECRET, salt: COOKIE, maxAge: 3600 })}`;
const req = async (p, { cookie, method = "GET", body } = {}) => {
  const r = await fetch(BASE + p, { method, redirect: "manual", headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  return { status: r.status, location: r.headers.get("location"), text };
};
const check = async (label, fn) => {
  try { await fn(); results.push(`PASS  ${label}`); } catch (e) { results.push(`FAIL  ${label}\n      ${e.message}`); }
};

const owner = await cookieFor({ email: OWNER, role: "owner" });
const admin = (action, email, confirm) => req("/api/beta/admin/testers", { cookie: owner, method: "POST", body: { action, email, confirm } });
const T = { a: "tester.a@example.test", b: "tester.b@example.test", c: "tester.c@example.test" };
// A tester cookie as issued at sign-in: role + the current session version.
const testerCookie = async (email) => {
  const list = JSON.parse((await req(`/api/beta/admin/testers?q=${encodeURIComponent(email)}`, { cookie: owner })).text).testers;
  return cookieFor({ email, role: "tester", sv: list[0].sessionVersion });
};

// ---- 1. signed out -------------------------------------------------------------------------
await check("signed out: / redirects to /login", async () => {
  const r = await req("/");
  assert.equal(r.status, 307); assert.match(r.location ?? "", /\/login$/);
});
await check("signed out: /login renders Continue with Google, no Vercel auth", async () => {
  const r = await req("/login");
  assert.equal(r.status, 200); assert.match(r.text, /Continue with Google/); assert.doesNotMatch(r.text, /vercel\.com\/login|sso-api/i);
});
await check("signed out: APIs 401", async () => {
  for (const p of ["/api/spatial/graph", "/api/router", "/api/beta/chat", "/api/beta/me", "/api/vault/system"]) assert.equal((await req(p)).status, 401, p);
});
await check("signed out: admin API is 401 (not reachable)", async () => assert.equal((await req("/api/beta/admin/testers")).status, 401));

// ---- 2. owner administration ---------------------------------------------------------------
await check("owner: admin page + list", async () => {
  assert.equal((await req("/beta/admin", { cookie: owner })).status, 200);
  const r = await req("/api/beta/admin/testers", { cookie: owner });
  assert.equal(r.status, 200); assert.equal(JSON.parse(r.text).backend, "file");
});
await check("owner: invite three testers", async () => {
  for (const e of Object.values(T)) assert.equal((await admin("invite", e)).status, 200, e);
});
await check("owner: search", async () => {
  const r = JSON.parse((await req("/api/beta/admin/testers?q=tester.b", { cookie: owner })).text);
  assert.deepEqual(r.testers.map((t) => t.email), [T.b]);
});
await check("owner: cannot manage owner address as a tester", async () => assert.equal((await admin("freeze", OWNER)).status, 400));
await check("owner: delete requires typed confirmation", async () => assert.equal((await admin("delete", T.c, "wrong@example.test")).status, 400));

// ---- 3. invited tester ---------------------------------------------------------------------
const a = await testerCookie(T.a);
await check("tester: / opens the demo interface", async () => assert.equal((await req("/", { cookie: a })).status, 200));
await check("tester: demo badge rendered", async () => assert.match((await req("/", { cookie: a })).text, /Private beta · Demo data/));
await check("tester: /login redirects to / (already signed in)", async () => assert.equal((await req("/login", { cookie: a })).status, 307));
await check("tester: NORA chat is the isolated demo responder", async () => {
  const r = await req("/api/router", { cookie: a, method: "POST", body: { message: "hello, what is the brain?" } });
  assert.equal(r.status, 200);
  const d = JSON.parse(r.text);
  assert.equal(d.provider, "Demo"); assert.match(d.reply, /Demo mode/);
});
await check("tester: feedback accepted", async () => assert.equal((await req("/api/beta/feedback", { cookie: a, method: "POST", body: { message: "looks great" } })).status, 200));
await check("tester: allowed data routes contain NO private owner data", async () => {
  for (const p of ["/", "/api/spatial/graph", "/api/spatial/telemetry", "/api/core/state", "/api/telemetry", "/api/agents", "/api/beta/me", "/api/router"]) {
    const r = await req(p, { cookie: a });
    assert.equal(r.status, 200, `${p} status`);
    assert.equal(leakCount(r.text), 0, `${p} leaked ${leakCount(r.text)} private string(s)`);
  }
});
await check("tester: owner admin is 404 (page and API)", async () => {
  assert.equal((await req("/beta/admin", { cookie: a })).status, 404);
  assert.equal((await req("/api/beta/admin/testers", { cookie: a })).status, 404);
  assert.equal((await req("/api/beta/admin/testers", { cookie: a, method: "POST", body: { action: "invite", email: "x@example.test" } })).status, 404);
});
await check("tester: forged owner role on a tester address is not honoured", async () => {
  const forged = await cookieFor({ email: T.a, role: "owner", sv: 1 });
  assert.equal((await req("/api/beta/admin/testers", { cookie: forged })).status, 404);
});
await check("tester: private pages redirect to /", async () => {
  for (const p of ["/workspace", "/settings", "/profile", "/canvas", "/core", "/admin"]) {
    const r = await req(p, { cookie: a });
    assert.equal(r.status, 307, p); assert.match(r.location ?? "", /\/$/, p);
  }
});
await check("tester: every non-beta API route refused (GET and POST)", async () => {
  const routes = [];
  const walk = (dir, rel) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      if (f.isDirectory()) walk(path.join(dir, f.name), `${rel}/${f.name.replace(/^\[\.\.\..*\]$/, "x").replace(/^\[.*\]$/, "test")}`);
      else if (f.name === "route.ts") routes.push(rel);
    }
  };
  walk("src/app/api", "/api");
  const allowedGet = new Set(["/api/spatial/graph", "/api/spatial/telemetry", "/api/core/state", "/api/telemetry", "/api/agents"]);
  const bad = [];
  for (const p of routes) {
    if (p.startsWith("/api/beta") || p.startsWith("/api/auth") || p === "/api/router") continue;
    const post = await req(p, { cookie: a, method: "POST", body: {} });
    if (post.status !== 403) bad.push(`POST ${p} -> ${post.status}`);
    if (!allowedGet.has(p)) {
      const get = await req(p, { cookie: a });
      if (get.status !== 403) bad.push(`GET ${p} -> ${get.status}`);
    }
  }
  results.push(`      (${routes.length} API routes checked)`);
  assert.deepEqual(bad, []);
});
await check("tester: PATCH/DELETE on router refused, no spend path", async () => {
  // /api/router is rewritten to the demo responder, which only implements GET/POST.
  for (const m of ["PATCH", "DELETE", "PUT"]) assert.notEqual((await req("/api/router", { cookie: a, method: m, body: {} })).status, 200, m);
});

// ---- 4. session revocation, freeze, delete, re-registration ---------------------------------
await check("revoke sessions: existing cookie dies immediately", async () => {
  const before = await testerCookie(T.b);
  assert.equal((await req("/api/beta/me", { cookie: before })).status, 200);
  assert.equal((await admin("revokeSessions", T.b)).status, 200);
  assert.equal((await req("/api/beta/me", { cookie: before })).status, 401);
  assert.equal((await req("/", { cookie: before })).status, 307);
  const fresh = await testerCookie(T.b);
  assert.equal((await req("/api/beta/me", { cookie: fresh })).status, 200);
});
await check("freeze: cookie dies; unfreeze does NOT revive old cookie", async () => {
  const c1 = await testerCookie(T.b);
  assert.equal((await admin("freeze", T.b)).status, 200);
  assert.equal((await req("/api/beta/me", { cookie: c1 })).status, 401);
  // a cookie minted with the frozen account's current version is still refused while frozen
  assert.equal((await req("/api/beta/me", { cookie: await testerCookie(T.b) })).status, 401);
  assert.equal((await admin("unfreeze", T.b)).status, 200);
  assert.equal((await req("/api/beta/me", { cookie: c1 })).status, 401);
});
await check("delete: account + data gone, cookie dies", async () => {
  const c = await testerCookie(T.a);
  assert.equal((await req("/api/beta/me", { cookie: c })).status, 200);
  const r = await admin("delete", T.a, T.a);
  assert.equal(r.status, 200);
  const d = JSON.parse(r.text);
  for (const k of ["account", "sessions", "demo conversations", "feedback"]) assert.ok(d.removed.includes(k), `removed ${k}`);
  assert.equal((await req("/api/beta/me", { cookie: c })).status, 401);
  const list = JSON.parse((await req(`/api/beta/admin/testers?q=${T.a}`, { cookie: owner })).text).testers;
  assert.equal(list.length, 0);
});
await check("deleted: a freshly forged cookie is still refused (blocked)", async () => {
  assert.equal((await req("/api/beta/me", { cookie: await cookieFor({ email: T.a, role: "tester", sv: 1 }) })).status, 401);
});
await check("uninvited: forged tester cookie refused", async () => {
  assert.equal((await req("/api/beta/me", { cookie: await cookieFor({ email: "nobody@example.test", role: "tester", sv: 1 }) })).status, 401);
});
await check("tampered cookie refused", async () => {
  const c = (await testerCookie(T.c)).slice(0, -6) + "AAAAAA";
  assert.equal((await req("/api/beta/me", { cookie: c })).status, 401);
});

// ---- 5. response hygiene -------------------------------------------------------------------
await check("login + error page do not reveal which addresses exist", async () => {
  const r = await req("/login?error=AccessDenied");
  assert.match(r.text, /doesn.{1,8}t have beta access/);
  assert.equal(leakCount(r.text), 0);
});

console.log(results.join("\n"));
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${results.filter((r) => r.startsWith("PASS")).length} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
