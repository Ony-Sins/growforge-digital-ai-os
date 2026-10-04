/**
 * Private-beta sign-in decision + store lifecycle tests. Uses a throwaway store file; never touches
 * data/beta.json or any private data. Run: npx tsx scripts/test-beta-signin.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gf-beta-")), "beta.json");
process.env.BETA_STORE_FILE = tmp;
process.env.OWNER_EMAILS = "owner@example.test";

const store = await import("../src/lib/beta/store");
const { betaSignInDecision } = await import("../src/lib/beta/signin");

const signIn = (email: string, over: Partial<{ provider: string; emailVerified: unknown }> = {}) =>
  betaSignInDecision({ provider: "google", email, emailVerified: true, name: "T", ...over });

const results: string[] = [];
const check = async (label: string, fn: () => Promise<void>) => {
  await fn();
  results.push(`PASS  ${label}`);
};

await check("owner signs in", async () => assert.equal(await signIn("owner@example.test"), true));
await check("owner requires Google-verified email", async () => assert.equal(await signIn("owner@example.test", { emailVerified: false }), false));
await check("non-Google provider refused", async () => assert.equal(await signIn("owner@example.test", { provider: "github" }), false));
await check("uninvited refused", async () => assert.equal(await signIn("stranger@example.test"), false));

await store.inviteTester("Alice@Example.test");
await check("invited (case-insensitive) signs in and activates", async () => {
  assert.equal(await signIn("alice@example.test"), true);
  assert.equal((await store.getTester("alice@example.test"))?.status, "active");
});
await check("invited but unverified email refused", async () => {
  await store.inviteTester("bob@example.test");
  assert.equal(await signIn("bob@example.test", { emailVerified: "true" }), false);
  assert.equal((await store.getTester("bob@example.test"))?.status, "invited");
});

await check("frozen refused; version bumped", async () => {
  const before = (await store.getTester("alice@example.test"))!.sessionVersion;
  await store.freezeTester("alice@example.test");
  assert.equal(await signIn("alice@example.test"), false);
  assert.ok((await store.getTester("alice@example.test"))!.sessionVersion > before);
});
await check("unfrozen can sign in again", async () => {
  await store.unfreezeTester("alice@example.test");
  assert.equal(await signIn("alice@example.test"), true);
});

await check("revokeSessions bumps version", async () => {
  const before = (await store.getTester("alice@example.test"))!.sessionVersion;
  await store.revokeSessions("alice@example.test");
  assert.equal((await store.getTester("alice@example.test"))!.sessionVersion, before + 1);
});

await check("delete removes account, conversations, feedback; blocks re-registration", async () => {
  await store.appendConversation("alice@example.test", [{ role: "user", content: "hi", at: "x" }]);
  await store.addFeedback("alice@example.test", "nice");
  const r = await store.deleteTester("alice@example.test");
  assert.deepEqual(r.removed.sort(), ["account", "demo conversations", "feedback", "sessions"].sort());
  assert.equal(await store.getTester("alice@example.test"), null);
  assert.equal((await store.getConversation("alice@example.test")).length, 0);
  assert.equal((await store.getFeedback("alice@example.test")).length, 0);
  assert.equal(await store.isBlocked("alice@example.test"), true);
  assert.equal(await signIn("alice@example.test"), false);
  // raw file keeps only a hash, never the address
  assert.ok(!fs.readFileSync(tmp, "utf8").toLowerCase().includes("alice@example.test"));
});
await check("explicit re-invite clears the block and admits brand-new tester", async () => {
  await store.inviteTester("alice@example.test");
  assert.equal(await store.isBlocked("alice@example.test"), false);
  assert.equal(await signIn("alice@example.test"), true);
  const freshTester = await store.getTester("alice@example.test");
  assert.equal(freshTester?.status, "active");
  assert.equal(freshTester?.sessionVersion, 1);
  assert.equal((await store.getConversation("alice@example.test")).length, 0);
  assert.equal((await store.getFeedback("alice@example.test")).length, 0);
});
await check("concurrent and repeated re-invites resolve atomically", async () => {
  const invites = await Promise.all([
    store.inviteTester("alice@example.test"),
    store.inviteTester("alice@example.test"),
    store.inviteTester("alice@example.test"),
  ]);
  assert.equal(invites.length, 3);
  assert.equal(await store.isBlocked("alice@example.test"), false);
  assert.equal(await signIn("alice@example.test"), true);
});
await check("revoked (never-signed-in) invite is blocked", async () => {
  await store.inviteTester("carol@example.test");
  await store.revokeTester("carol@example.test");
  assert.equal(await signIn("carol@example.test"), false);
});

await check("production without a durable store fails closed", async () => {
  const env = process.env as Record<string, string | undefined>;
  const prev = env.NODE_ENV;
  env.NODE_ENV = "production";
  try {
    assert.equal(store.betaStoreBackend(), "unavailable");
    assert.equal(await signIn("alice@example.test"), false);
    assert.equal(await signIn("owner@example.test"), true); // owner does not depend on the store
  } finally {
    env.NODE_ENV = prev;
  }
});

console.log(results.join("\n"));
console.log(`\n${results.length} passed`);
fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
