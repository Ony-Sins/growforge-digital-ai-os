import { callOpenRouterWithFallback, classifyTask } from "../src/lib/model-router";
import { getSecretForServerUse } from "../src/lib/serverVault";
import { SYSTEM_VAULT_ID } from "../src/lib/llm";

async function main() {
  console.log("=== Testing Direct OpenRouter Multi-Tier Fallback ===");
  const apiKey = getSecretForServerUse(SYSTEM_VAULT_ID, "openrouter");
  if (!apiKey) throw new Error("No OpenRouter key found in vault.");

  const categories = ["planning", "coding", "utility"] as const;

  for (const cat of categories) {
    console.log(`\n--- Testing Category: ${cat} ---`);
    const start = Date.now();
    const result = await callOpenRouterWithFallback(
      cat,
      "You are a helpful AI assistant. Answer concisely in one sentence.",
      [{ role: "user", content: `Explain the main goal of ${cat} in 1 sentence.` }],
      apiKey
    );
    console.log(`✓ Model Used: ${result.modelUsed} (${Date.now() - start}ms)`);
    console.log(`✓ Output: ${result.text.trim()}`);
  }

  console.log("\n🎉 Direct OpenRouter multi-tier fallback test passed for all categories!");
}

main().catch((err) => {
  console.error("Direct OpenRouter test failed:", err);
  process.exit(1);
});
