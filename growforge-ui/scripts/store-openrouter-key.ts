import { SYSTEM_VAULT_ID, testProvider } from "../src/lib/llm";
import { setSecret } from "../src/lib/serverVault";

const apiKey = process.argv[2] || process.env.OPENROUTER_API_KEY || "";

async function main() {
  if (!apiKey) {
    console.log("Usage: npx tsx scripts/store-openrouter-key.ts <API_KEY> (or set OPENROUTER_API_KEY env var)");
    return;
  }
  console.log("=== Storing OpenRouter API Key in Server Vault ===");
  setSecret(SYSTEM_VAULT_ID, "openrouter", apiKey);
  console.log("✓ Key securely encrypted with AES-256-GCM and stored in data/vault.json");

  console.log("\n=== Testing OpenRouter Provider via testProvider() ===");
  const res = await testProvider("openrouter");
  console.log("Test result:", res);
  if (!res.ok) {
    throw new Error(`Provider test failed: ${res.message}`);
  }
  console.log("🎉 OpenRouter provider successfully tested and active!");
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
