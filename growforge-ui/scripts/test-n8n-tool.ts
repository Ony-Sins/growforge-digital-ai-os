import { n8nTool } from "../src/lib/tools/n8n";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

async function runTests() {
  console.log("=== Suite 1: n8n Tool Metadata & Self-Healing Schemas ===");
  assert(n8nTool.name === "manage_n8n_workflow", "Tool name matches manage_n8n_workflow");
  assert(n8nTool.requiresApproval === false, "Tool operates autonomously for rapid agent loops");
  assert(n8nTool.usage.includes("create"), "Usage spec includes create action");
  assert(n8nTool.usage.includes("patch"), "Usage spec includes patch action");
  assert(n8nTool.usage.includes("execute"), "Usage spec includes execute action");

  console.log("\n=== Suite 2: Validation & Error Handling ===");
  const invalidAction = await n8nTool.execute({ action: "invalid_action_xyz" });
  assert(invalidAction.ok === false, "Rejects unknown action");
  assert(invalidAction.output.includes("Unknown n8n action"), "Returns valid action instructions");

  const missingCreateWorkflow = await n8nTool.execute({ action: "create" });
  assert(missingCreateWorkflow.ok === false, "Rejects create without workflow object");
  assert(missingCreateWorkflow.output.includes("workflow object with 'name', 'nodes', and 'connections' is required"), "Returns schema requirements");

  const missingPatchId = await n8nTool.execute({ action: "patch", workflow: { name: "test" } });
  assert(missingPatchId.ok === false, "Rejects patch without workflowId");

  const missingExecuteId = await n8nTool.execute({ action: "execute" });
  assert(missingExecuteId.ok === false, "Rejects execute without workflowId");

  console.log("\n=== Suite 3: Connection & Diagnostic Self-Healing Feedback ===");
  // Test connection error handling against unconfigured/local test endpoint
  const listRes = await n8nTool.execute({ action: "list" });
  // Should either connect if n8n is running or return actionable connection diagnostics
  if (listRes.ok) {
    assert(listRes.output.includes("n8n Workflows"), "Connected to live n8n instance and listed workflows");
  } else {
    assert(
      listRes.output.includes("n8n Network Connection Error") || listRes.output.includes("Failed to list n8n workflows"),
      "Returns clear, actionable network error diagnosis"
    );
  }

  console.log(`\n========================================`);
  console.log(`n8n Tool Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Test run error:", err);
  process.exit(1);
});
