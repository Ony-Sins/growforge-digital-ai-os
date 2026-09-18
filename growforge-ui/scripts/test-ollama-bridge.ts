try {
  process.loadEnvFile(".env.local");
} catch {}

import { resolveOllamaConfig, chatComplete, testCustomModel } from "../src/lib/llm";

async function main() {
  console.log("=== Testing Ollama Configuration & Bridge ===");
  const config = resolveOllamaConfig();
  console.log("Resolved Ollama Config:", config);

  console.log("\n=== Testing Connection Latency to Ollama ===");
  const testRes = await testCustomModel({
    baseUrl: config.baseUrl,
    modelName: config.model,
    providerType: "ollama",
  });
  console.log("Ping Test Result:", testRes);

  console.log("\n=== Testing Chat Completion with Default Local Strategy ===");
  try {
    const res = await chatComplete(
      "You are the GrowForge AI Assistant.",
      [{ role: "user", content: "Reply with exactly: 'Local Ollama bridge is working!'" }],
      { preferCloud: false }
    );
    console.log("✓ Success! Provider:", res.provider);
    console.log("✓ Text Response:", res.text);
  } catch (err) {
    console.log("Chat execution note:", err instanceof Error ? err.message : String(err));
  }
}

main().catch(console.error);
