import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeBetaEmail,
  getOpaqueTesterId,
  getOpaqueBlockKey,
} from "../src/lib/beta/identity";
import {
  checkBetaRateLimit,
  clearBetaRateLimits,
  BetaRateLimitOp,
} from "../src/lib/beta/rate-limit";

describe("Beta Identity & Rate Limiting Test Suite", () => {
  describe("1. Opaque Identity Architecture", () => {
    it("normalizes emails consistently (trim and lower-case)", () => {
      const e1 = "  Tester.One@Example.COM ";
      const e2 = "tester.one@example.com";
      assert.equal(normalizeBetaEmail(e1), "tester.one@example.com");
      assert.equal(getOpaqueTesterId(e1), getOpaqueTesterId(e2));
    });

    it("generates opaque IDs with >=128 bits (tid_<32 hex chars>) and no raw email leak", () => {
      const id = getOpaqueTesterId("alpha.tester@beta.growforge.io");
      assert.match(id, /^tid_[0-9a-f]{32}$/);
      assert.ok(!id.includes("alpha"));
      assert.ok(!id.includes("growforge"));
      assert.ok(!id.includes("@"));
    });

    it("ensures storage identity is strictly independent from AUTH_SECRET", () => {
      const email = "user@test.org";
      const hmacKeyA = "dedicated-beta-identity-key-alpha-1234";
      const hmacKeyB = "dedicated-beta-identity-key-beta-5678";

      const idA = getOpaqueTesterId(email, hmacKeyA);
      const idB = getOpaqueTesterId(email, hmacKeyB);
      assert.notEqual(idA, idB);

      // Rotating session secrets does not affect HMAC derivation when HMAC key is preserved
      process.env.AUTH_SECRET = "session-secret-rotation-round-1";
      const idA1 = getOpaqueTesterId(email, hmacKeyA);
      process.env.AUTH_SECRET = "session-secret-rotation-round-2";
      const idA2 = getOpaqueTesterId(email, hmacKeyA);
      assert.equal(idA1, idA2);
    });

    it("generates keyed opaque blocklist keys instead of plain SHA-256", () => {
      const email = "banned.tester@domain.com";
      const blk1 = getOpaqueBlockKey(email);
      assert.match(blk1, /^blk_[0-9a-f]{32}$/);
      assert.notEqual(blk1, getOpaqueTesterId(email));
    });
  });

  describe("2. Per-Tester Rate Limiting", () => {
    it("allows requests within configured limit", async () => {
      clearBetaRateLimits();
      const email = "tester1@example.com";
      for (let i = 0; i < 5; i++) {
        const res = await checkBetaRateLimit(email, "chat", { limit: 5, windowSec: 60 });
        assert.equal(res.allowed, true);
        assert.equal(res.current, i + 1);
        assert.equal(res.remaining, 5 - (i + 1));
      }
    });

    it("rejects excess requests with 429, sanitized response, and Retry-After", async () => {
      clearBetaRateLimits();
      const email = "tester2@example.com";
      for (let i = 0; i < 3; i++) {
        const res = await checkBetaRateLimit(email, "byok_test", { limit: 3, windowSec: 10 });
        assert.equal(res.allowed, true);
      }

      // 4th request exceeds limit
      const blocked = await checkBetaRateLimit(email, "byok_test", { limit: 3, windowSec: 10 });
      assert.equal(blocked.allowed, false);
      assert.equal(blocked.remaining, 0);
      assert.ok(blocked.retryAfter >= 1);
      assert.ok(blocked.errorResponse);
      assert.equal(blocked.errorResponse.status, 429);
      assert.equal(blocked.errorResponse.headers.get("Retry-After"), String(blocked.retryAfter));

      const body = await blocked.errorResponse.json();
      assert.equal(body.error, "rate_limited");
      assert.equal(body.code, "rate_limit_exceeded");
      assert.ok(body.message.includes("byok_test"));
    });

    it("enforces tenant quota isolation (Tester A cannot consume Tester B's quota)", async () => {
      clearBetaRateLimits();
      const testerA = "alpha@domain.com";
      const testerB = "bravo@domain.com";

      // Exhaust tester A
      for (let i = 0; i < 3; i++) {
        await checkBetaRateLimit(testerA, "byok_save", { limit: 3, windowSec: 30 });
      }
      const aBlocked = await checkBetaRateLimit(testerA, "byok_save", { limit: 3, windowSec: 30 });
      assert.equal(aBlocked.allowed, false);

      // Tester B has full quota
      const bRes = await checkBetaRateLimit(testerB, "byok_save", { limit: 3, windowSec: 30 });
      assert.equal(bRes.allowed, true);
      assert.equal(bRes.current, 1);
      assert.equal(bRes.remaining, 2);
    });

    it("differentiates operation limits independently", async () => {
      clearBetaRateLimits();
      const email = "multiop@test.com";

      // Exhaust test calls
      for (let i = 0; i < 2; i++) {
        await checkBetaRateLimit(email, "byok_test", { limit: 2, windowSec: 30 });
      }
      const testBlocked = await checkBetaRateLimit(email, "byok_test", { limit: 2, windowSec: 30 });
      assert.equal(testBlocked.allowed, false);

      // Chat remains unaffected
      const chatAllowed = await checkBetaRateLimit(email, "chat", { limit: 10, windowSec: 30 });
      assert.equal(chatAllowed.allowed, true);
    });

    it("recovers automatically after the window expires", async () => {
      clearBetaRateLimits();
      const email = "recovery@test.com";

      // Window of 1 second
      for (let i = 0; i < 2; i++) {
        await checkBetaRateLimit(email, "chat", { limit: 2, windowSec: 1 });
      }
      const blocked = await checkBetaRateLimit(email, "chat", { limit: 2, windowSec: 1 });
      assert.equal(blocked.allowed, false);

      // Wait 1.1s for window expiration
      await new Promise((r) => setTimeout(r, 1100));

      const recovered = await checkBetaRateLimit(email, "chat", { limit: 2, windowSec: 1 });
      assert.equal(recovered.allowed, true);
      assert.equal(recovered.current, 1);
    });

    it("handles concurrent burst safely without race conditions", async () => {
      clearBetaRateLimits();
      const email = "burst@test.com";
      const limit = 10;

      // 25 concurrent checks
      const results = await Promise.all(
        Array.from({ length: 25 }, () =>
          checkBetaRateLimit(email, "chat", { limit, windowSec: 30 })
        )
      );

      const allowedCount = results.filter((r) => r.allowed).length;
      const rejectedCount = results.filter((r) => !r.allowed).length;

      assert.equal(allowedCount, limit);
      assert.equal(rejectedCount, 15);
    });
  });
});
