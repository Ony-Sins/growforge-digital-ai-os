import assert from "node:assert/strict";
import fs from "node:fs";

const envPath = "C:/Users/USERAS/.growforge/cf-beta.env";
const env = Object.fromEntries(
  fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => {
      const idx = l.indexOf("=");
      const val = l.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
      return [l.slice(0, idx), val];
    })
);

process.env.UPSTASH_REDIS_REST_URL = env.UPSTASH_REDIS_REST_URL;
process.env.UPSTASH_REDIS_REST_TOKEN = env.UPSTASH_REDIS_REST_TOKEN;
process.env.OWNER_EMAILS = env.OWNER_EMAILS;

const store = await import("../src/lib/beta/store");
const { betaSignInDecision } = await import("../src/lib/beta/signin");

const testEmail = `stage1.tester.verify.${Date.now()}@example.test`;

console.log("=== REAL UPSTASH BETA LIFECYCLE TEST ===");

// 1. Invite
console.log("[1] Inviting tester...");
const t1 = await store.inviteTester(testEmail);
assert.equal(t1.status, "invited");
assert.equal(t1.sessionVersion, 1);
assert.equal(await store.isBlocked(testEmail), false);

// 2. First sign-in (activation)
console.log("[2] Testing initial sign-in...");
const s1 = await betaSignInDecision({
  provider: "google",
  email: testEmail,
  emailVerified: true,
  name: "Lifecycle Test User",
});
assert.equal(s1, true);
const t2 = await store.getTester(testEmail);
assert.equal(t2?.status, "active");
assert.equal(t2?.sessionVersion, 1);

// 3. Add demo conversation and feedback
console.log("[3] Appending conversation & feedback...");
await store.appendConversation(testEmail, [{ role: "user", content: "Test msg", at: new Date().toISOString() }]);
await store.addFeedback(testEmail, "Great product");
assert.equal((await store.getConversation(testEmail)).length, 1);
assert.equal((await store.getFeedback(testEmail)).length, 1);

// 4. Delete tester
console.log("[4] Deleting tester permanently...");
const del = await store.deleteTester(testEmail);
assert.equal(del.deleted, true);
assert.equal(await store.getTester(testEmail), null);
assert.equal((await store.getConversation(testEmail)).length, 0);
assert.equal((await store.getFeedback(testEmail)).length, 0);
assert.equal(await store.isBlocked(testEmail), true);

// 5. Attempt uninvited sign-in (must be blocked)
console.log("[5] Attempting uninvited sign-in (expecting refusal)...");
const s2 = await betaSignInDecision({
  provider: "google",
  email: testEmail,
  emailVerified: true,
  name: "Lifecycle Test User",
});
assert.equal(s2, false);

// 6. Explicit owner re-invite
console.log("[6] Explicitly re-inviting tester...");
const t3 = await store.inviteTester(testEmail);
assert.equal(t3.status, "invited");
assert.equal(t3.sessionVersion, 1);
assert.equal(await store.isBlocked(testEmail), false);

// 7. Fresh sign-in after re-invite (must succeed with zero residual data)
console.log("[7] Signing in as fresh re-invited tester...");
const s3 = await betaSignInDecision({
  provider: "google",
  email: testEmail,
  emailVerified: true,
  name: "Lifecycle Test User",
});
assert.equal(s3, true);
const t4 = await store.getTester(testEmail);
assert.equal(t4?.status, "active");
assert.equal(t4?.sessionVersion, 1);
assert.equal((await store.getConversation(testEmail)).length, 0);
assert.equal((await store.getFeedback(testEmail)).length, 0);

// 8. Concurrent re-invites test
console.log("[8] Testing concurrent re-invites...");
const conc = await Promise.all([
  store.inviteTester(testEmail),
  store.inviteTester(testEmail),
  store.inviteTester(testEmail),
]);
assert.equal(conc.length, 3);
assert.equal(await store.isBlocked(testEmail), false);

// Cleanup
console.log("[9] Cleaning up test tester...");
await store.deleteTester(testEmail);
// Also clear the test hash from blocked so Upstash is left clean
await store.inviteTester(testEmail);
await store.deleteTester(testEmail);

console.log("=== ALL REAL UPSTASH LIFECYCLE TESTS PASSED (100% SUCCESS) ===");
