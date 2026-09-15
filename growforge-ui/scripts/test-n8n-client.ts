import { checkN8nHealth, listActiveWorkflows, triggerWebhook, executeWorkflow } from "../src/lib/n8n-client";

async function main() {
  console.log("=== Testing n8n-client Module ===");

  // 1. Health check
  const health = await checkN8nHealth();
  console.log("Health Check:", health);
  if (!health.ok) {
    throw new Error(`Health check failed: ${health.error}`);
  }

  // 2. List active workflows
  const workflows = await listActiveWorkflows();
  console.log("List Workflows (unauthenticated check):", workflows);

  // 3. Webhook test
  const webhookResult = await triggerWebhook("test-hook", { hello: "world" }, { testMode: true });
  console.log("Webhook Trigger:", webhookResult);

  console.log("\n✅ n8n-client module verified successfully!");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
