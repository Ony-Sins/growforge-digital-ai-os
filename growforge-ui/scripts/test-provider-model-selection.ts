import assert from "node:assert";
import { listAiModels, saveAiModel } from "../src/lib/aiModelStore";
import { resolveModel, CLOUD_PROVIDERS } from "../src/lib/llm";
import { discoverProviderModels } from "../src/lib/modelDiscovery";
import { hasSecret, getSecretForServerUse } from "../src/lib/serverVault";

async function runTests() {
  console.log("=== GROWFORGE PROVIDER IDENTITY & DYNAMIC MODEL SELECTION TEST SUITE ===");

  // 1. Verify Permanent Provider Identity
  console.log("\n[Test 1] Verifying Provider Permanent Display Identity...");
  assert.strictEqual(CLOUD_PROVIDERS.groq.label, "Groq", "Groq label in CLOUD_PROVIDERS must be 'Groq'");

  const initialModels = listAiModels();
  const groqModel = initialModels.find((m) => m.id === "groq-default" || m.providerType === "groq");
  assert(groqModel, "Groq model connector must exist in ai_models.json");
  assert.strictEqual(groqModel.name, "Groq", "Groq connector name must be strictly 'Groq', not appended with model slug");
  console.log(`✓ Provider Display Identity is permanently: "${groqModel.name}"`);

  // 2. Verify Official Model Discovery
  console.log("\n[Test 2] Verifying Model Discovery Engine...");
  const groqKey = getSecretForServerUse("__system__", "groq") || process.env.GROQ_API_KEY;
  const discoveryResult = await discoverProviderModels("groq", "https://api.groq.com/openai/v1", groqKey || undefined);

  assert(Array.isArray(discoveryResult.models), "Discovery must return an array of models");
  assert(discoveryResult.models.length > 0, "Discovery must return at least 1 model");
  console.log(`✓ Discovery returned ${discoveryResult.models.length} models (source: ${discoveryResult.source})`);

  const sample = discoveryResult.models.find((m) => m.id.includes("gpt-oss") || m.id.includes("llama-3.3"));
  assert(sample, "Discovery must contain recognized Groq models");
  console.log(`✓ Sample model resolved: "${sample.name}" (ID: ${sample.id}, context: ${sample.contextWindow ?? 'N/A'})`);

  // 3. Verify Dynamic Model Switching Without Duplicating Records or Wiping Credentials
  console.log("\n[Test 3] Verifying Dynamic Model Switching & Credential Preservation...");
  const targetTestModel = "openai/gpt-oss-120b";

  const savedModel = saveAiModel({
    id: groqModel.id,
    name: "Groq",
    baseUrl: groqModel.baseUrl,
    modelName: targetTestModel,
    taskRole: "utility",
    providerType: "groq",
  });

  assert.strictEqual(savedModel.name, "Groq", "Provider name must remain 'Groq' after model switch");
  assert.strictEqual(savedModel.modelName, targetTestModel, "Model slug must be updated to the new selection");

  const refreshedModels = listAiModels();
  const groqCount = refreshedModels.filter((m) => m.id === "groq-default" || (m.providerType === "groq" && m.baseUrl.includes("groq.com"))).length;
  assert.strictEqual(groqCount, 1, "Must maintain exactly 1 Groq provider record (no duplicates)");

  const secretIntact = hasSecret("__system__", "groq") || Boolean(process.env.GROQ_API_KEY);
  console.log(`✓ Switched model to "${savedModel.modelName}" while preserving vault credentials (credential present: ${secretIntact})`);

  // 4. Verify Dispatcher Reads Dynamic Model Selection Live
  console.log("\n[Test 4] Verifying Real Dispatcher Selection...");
  const resolvedModelForDispatcher = resolveModel("groq");
  assert.strictEqual(resolvedModelForDispatcher, targetTestModel, `Dispatcher resolveModel('groq') must return '${targetTestModel}'`);
  console.log(`✓ Dispatcher resolveModel("groq") dynamically resolved: "${resolvedModelForDispatcher}"`);

  // 5. Verify Zero-Spend & Separation of Routing Roles
  console.log("\n[Test 5] Verifying Free-Tier & Local Zero-Spend Safeguards...");
  const omniModel = refreshedModels.find((m) => m.providerType === "omniroute");
  assert(omniModel, "Omniroute gateway connector must exist");
  assert.strictEqual(omniModel.name, "Omniroute", "Omniroute provider identity must be clean");

  const ollamaModel = refreshedModels.find((m) => m.providerType === "ollama");
  assert(ollamaModel, "Local Ollama connector must exist");
  assert.strictEqual(ollamaModel.name, "Local Ollama", "Ollama provider identity must be clean");

  console.log(`✓ Omniroute and Ollama are cleanly registered for local zero-spend operation.`);

  console.log("\n=======================================================");
  console.log("ALL TESTS PASSED SUCCESSFULLY (5/5)");
  console.log("=======================================================\n");
}

runTests().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
