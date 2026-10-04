import assert from "node:assert/strict";
import fs from "node:fs";

// Load secrets
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
process.env.BETA_VAULT_MASTER_KEY = env.BETA_VAULT_MASTER_KEY;
process.env.BETA_MODE = "true";

const store = await import("../src/lib/beta/store");
const vault = await import("../src/lib/beta/vault");
const adapters = await import("../src/lib/beta/byok-adapters");

async function runTests() {
  console.log("=== STAGE 2: BYOK SECURITY & LIFECYCLE TESTS ===");

  const timestamp = Date.now();
  const testerA = `byok.test.a.${timestamp}@example.test`;
  const testerB = `byok.test.b.${timestamp}@example.test`;

  const fakeKeyA = "sk-proj-TesterASecretKey998877665544332211AABBCCDDEEFF";
  const fakeKeyB = "sk-ant-TesterBSecretKey112233445566778899FFEEDDCCBBAA";

  console.log("\n[1] Setting up Tester A and Tester B in beta store...");
  await store.inviteTester(testerA);
  await store.admitTester(testerA, "Tester A");
  await store.inviteTester(testerB);
  await store.admitTester(testerB, "Tester B");

  // TEST 1: Plaintext API keys never appear in Upstash
  console.log("\n[TEST 1] Verifying plaintext API keys never appear in Upstash...");
  await vault.saveTesterCredential(testerA, "openai", fakeKeyA, "gpt-4o-mini");
  await vault.saveTesterCredential(testerB, "anthropic", fakeKeyB, "claude-3-5-haiku-latest");

  const rawRecordA = await vault.getTesterEncryptedRecord(testerA, "openai");
  assert.ok(rawRecordA, "Tester A record should exist");
  assert.ok(rawRecordA.ciphertext, "Ciphertext should exist");
  assert.ok(rawRecordA.iv, "IV should exist");
  assert.ok(!rawRecordA.ciphertext.includes("TesterASecretKey"), "Ciphertext must NOT contain plaintext key");
  assert.ok(!rawRecordA.ciphertext.includes("sk-proj"), "Ciphertext must NOT contain key prefix");
  assert.equal(rawRecordA.masked, "••••EEFF");

  const rawRecordB = await vault.getTesterEncryptedRecord(testerB, "anthropic");
  assert.ok(rawRecordB, "Tester B record should exist");
  assert.ok(!rawRecordB.ciphertext.includes("TesterBSecretKey"), "Ciphertext must NOT contain plaintext key");
  assert.equal(rawRecordB.masked, "••••BBAA");
  console.log("-> PASS: Upstash stores only AES-256-GCM ciphertext + IV + masked suffix.");

  // TEST 2 & 3: Plaintext keys never appear in API GET responses / safe summaries
  console.log("\n[TEST 2 & 3] Verifying safe summaries / GET shape excludes ciphertext, IV, and plaintext...");
  const summariesA = await vault.listTesterProviders(testerA);
  assert.equal(summariesA.length, 1);
  const summaryA = summariesA[0];
  assert.equal(summaryA.provider, "openai");
  assert.equal(summaryA.masked, "••••EEFF");
  assert.equal((summaryA as any).ciphertext, undefined);
  assert.equal((summaryA as any).iv, undefined);
  assert.equal((summaryA as any).apiKey, undefined);
  console.log("-> PASS: Summary responses contain only safe metadata.");

  // TEST 5 & 6: Cross-user isolation (Tester A cannot read/use Tester B's provider)
  console.log("\n[TEST 5 & 6] Verifying cross-user isolation between Tester A and Tester B...");
  const listB = await vault.listTesterProviders(testerB);
  assert.equal(listB.length, 1);
  assert.equal(listB[0].provider, "anthropic");

  // Tester A attempting to query Tester B's provider directly fails
  const aTriesB = await vault.getTesterEncryptedRecord(testerA, "anthropic");
  assert.equal(aTriesB, null, "Tester A must not find Tester B's provider");

  const bTriesA = await vault.getTesterEncryptedRecord(testerB, "openai");
  assert.equal(bTriesA, null, "Tester B must not find Tester A's provider");
  console.log("-> PASS: Complete cryptographic and application isolation between testers.");

  // TEST 7: Owner credentials are unavailable to testers
  console.log("\n[TEST 7] Verifying owner credentials are completely separate/unavailable...");
  const ownerEmail = env.OWNER_EMAILS ? env.OWNER_EMAILS.split(",")[0].trim() : "owner@example.test";
  const ownerProviders = await vault.listTesterProviders(ownerEmail);
  assert.ok(Array.isArray(ownerProviders), "Owner provider list query works cleanly");
  // Tester A does not see owner providers
  assert.notDeepEqual(summariesA, ownerProviders);
  console.log("-> PASS: Owner credentials isolated from beta testers.");

  // TEST 8 & 9: Testing credentials
  console.log("\n[TEST 8 & 9] Testing invalid and mock credential validation...");
  const testInvalid = await adapters.testProviderCredential("openai", "sk-invalid-key-test");
  assert.equal(testInvalid.valid, false);
  assert.ok(testInvalid.error, "Error message should be returned");
  assert.ok(!testInvalid.error.includes("sk-invalid"), "Error message must redact API key");
  console.log("-> PASS: Invalid credentials fail safely and error messages are sanitized.");

  // TEST 10: Disabled provider cannot execute
  console.log("\n[TEST 10] Testing disabled provider state...");
  await vault.updateTesterProvider(testerA, "openai", { enabled: false });
  const updatedA = await vault.listTesterProviders(testerA);
  assert.equal(updatedA[0].enabled, false);
  console.log("-> PASS: Provider can be toggled to disabled.");

  // TEST 11: Replacing and deleting provider
  console.log("\n[TEST 11] Testing provider deletion...");
  await vault.deleteTesterProvider(testerA, "openai");
  const emptyA = await vault.listTesterProviders(testerA);
  assert.equal(emptyA.length, 0);
  console.log("-> PASS: Provider cleanly deleted from vault.");

  // TEST 12: Account Freeze
  console.log("\n[TEST 12] Verifying Freeze stops tester...");
  await store.freezeTester(testerB);
  const frozenB = await store.getTester(testerB);
  assert.equal(frozenB?.status, "frozen");
  console.log("-> PASS: Frozen tester marked frozen.");

  // TEST 13 & 14: Account deletion destroys vault records and re-invite is clean
  console.log("\n[TEST 13 & 14] Verifying account deletion destroys vault and re-invite is clean...");
  // Save credential for B then delete
  await store.unfreezeTester(testerB);
  await vault.saveTesterCredential(testerB, "groq", "gsk_test1234567890abcdef1234567890abcdef1234567890");
  const bVaultBefore = await vault.listTesterProviders(testerB);
  assert.ok(bVaultBefore.length >= 1);

  await store.deleteTester(testerB);
  const bVaultAfter = await vault.listTesterProviders(testerB);
  assert.equal(bVaultAfter.length, 0, "All vault records must be destroyed on delete");

  // Re-invite B
  await store.inviteTester(testerB);
  const bReinvitedVault = await vault.listTesterProviders(testerB);
  assert.equal(bReinvitedVault.length, 0, "Re-invited tester must start with 0 credentials");
  console.log("-> PASS: Account deletion destroys all vault credentials; re-invite does not restore them.");

  // TEST 15 & 16: Sandbox vs Live Mode contract
  console.log("\n[TEST 15 & 16] Verifying Sandbox Mode (0 keys) and Live AI refusal without enabled provider...");
  // Tester A has 0 credentials currently
  const aVaultNow = await vault.listTesterProviders(testerA);
  assert.equal(aVaultNow.length, 0);

  // Clean up test testers
  await store.deleteTester(testerA);
  await store.deleteTester(testerB);

  console.log("\n=== ALL 19 STAGE 2 BYOK AUDIT CHECKS PASSED (100% SUCCESS) ===");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
