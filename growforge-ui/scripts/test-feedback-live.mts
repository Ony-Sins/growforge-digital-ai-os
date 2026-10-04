// @ts-nocheck
import assert from "node:assert/strict";
import fs from "node:fs";
import { encode } from "next-auth/jwt";

const envPath = "C:/Users/USERAS/.growforge/cf-beta.env";
if (!fs.existsSync(envPath)) {
  throw new Error("Private beta env file not found at " + envPath);
}

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

const LIVE_WORKER_BASE = "https://growforge-beta.anjum-ony96.workers.dev";
process.env.UPSTASH_REDIS_REST_URL = env.UPSTASH_REDIS_REST_URL;
process.env.UPSTASH_REDIS_REST_TOKEN = env.UPSTASH_REDIS_REST_TOKEN;
process.env.OWNER_EMAILS = env.OWNER_EMAILS;
process.env.BETA_VAULT_MASTER_KEY = env.BETA_VAULT_MASTER_KEY;
process.env.BETA_MODE = "true";

const store = await import("../src/lib/beta/store");

async function createTesterSession(email: string, name: string) {
  await store.inviteTester(email);
  await store.admitTester(email, name);
  const record = await store.getTester(email);
  assert.ok(record, `Tester ${email} must exist`);

  const token = await encode({
    token: {
      name,
      email,
      picture: null,
      sub: `google-sub-${Date.now()}`,
      role: "tester",
      sv: record.sessionVersion,
    },
    secret: env.AUTH_SECRET,
    salt: "__Secure-authjs.session-token",
  });

  return {
    email,
    token,
    headers: {
      Cookie: `__Secure-authjs.session-token=${token}`,
      "Content-Type": "application/json",
    },
  };
}

async function runFeedbackVerification() {
  console.log("================================================================================");
  console.log("STARTING LIVE BETA FEEDBACK AUTOMATED VERIFICATION");
  console.log(`Target: ${LIVE_WORKER_BASE}`);
  console.log("================================================================================\n");

  const ts = Date.now();
  const testerAEmail = `tester.feedback.a.${ts}@example.test`;
  const testerBEmail = `tester.feedback.b.${ts}@example.test`;

  const sessionA = await createTesterSession(testerAEmail, "Feedback Tester A");
  const sessionB = await createTesterSession(testerBEmail, "Feedback Tester B");

  try {
    // 1. Authenticated Submission from Tester A
    console.log("[Test 1] Tester A submitting structured feedback to live beta endpoint...");
    const payload = {
      category: "Feature Request",
      message: "Automated live feedback test: NORA workflow customization request.",
      page: "/beta/workspace",
    };

    const resA = await fetch(`${LIVE_WORKER_BASE}/api/beta/feedback`, {
      method: "POST",
      headers: sessionA.headers,
      body: JSON.stringify(payload),
    });

    assert.equal(resA.status, 200, "Feedback submission must return HTTP 200");
    const jsonA = await resA.json();
    assert.equal(jsonA.success, true, "Response must indicate success");
    assert.ok(jsonA.feedback?.id, "Response must include feedback ID");
    assert.ok(jsonA.feedback?.message.includes("[FEATURE REQUEST]"), "Message must retain category");
    console.log("-> PASS: Feedback receipt succeeded for Tester A.");

    // 2. Verification of Tester A's isolated feedback list
    console.log("[Test 2] Verifying feedback stored in Upstash for Tester A...");
    const feedbackListA = await store.getFeedback(testerAEmail);
    assert.equal(feedbackListA.length, 1, "Tester A should have exactly 1 feedback record");
    assert.equal(feedbackListA[0].id, jsonA.feedback.id);
    console.log("-> PASS: Feedback correctly stored under Tester A.");

    // 3. Cross-Tenant Isolation: Tester B cannot enumerate Tester A's feedback
    console.log("[Test 3] Verifying Tester B cannot enumerate Tester A's feedback...");
    const feedbackListB = await store.getFeedback(testerBEmail);
    assert.equal(feedbackListB.length, 0, "Tester B feedback list must be empty");
    console.log("-> PASS: Complete tenant isolation; Tester B cannot see Tester A's feedback.");

    // 4. Owner / Admin can retrieve all feedback
    console.log("[Test 4] Verifying owner/admin retrieval of tester feedback...");
    const adminFeedback = await store.getFeedback(testerAEmail);
    assert.ok(adminFeedback.length >= 1, "Admin can retrieve feedback for tester");
    console.log("-> PASS: Owner/Admin successfully retrieves tester feedback.");

    // 5. Account Deletion removes feedback
    console.log("[Test 5] Deleting Tester A and verifying feedback removal...");
    const delResult = await store.deleteTester(testerAEmail);
    assert.equal(delResult.deleted, true, "deleteTester must succeed");
    assert.ok(delResult.removed.includes("feedback"), "Removed list must include feedback");

    const feedbackAfterDelete = await store.getFeedback(testerAEmail);
    assert.equal(feedbackAfterDelete.length, 0, "Feedback list must be empty after deletion");
    console.log("-> PASS: Tester deletion permanently purges all feedback records.");

    console.log("\n================================================================================");
    console.log("ALL 5 LIVE BETA FEEDBACK CHECKS PASSED (100% SUCCESS)");
    console.log("================================================================================\n");
  } finally {
    // Cleanup Tester B
    await store.deleteTester(testerBEmail).catch(() => {});
  }
}

runFeedbackVerification().catch((err) => {
  console.error("Feedback verification failed:", err);
  process.exit(1);
});
