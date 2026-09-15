import { chatComplete } from "../src/lib/llm";
import { classifyTask, ROUTE_CHAINS } from "../src/lib/model-router";

async function main() {
  console.log("=== Testing Dynamic Model Router ===");

  // 1. Test Task Classification
  const tasks = [
    { prompt: "Write an n8n webhook script in TypeScript to parse webhook headers", expected: "coding" },
    { prompt: "Develop a 60-day go-to-market plan and pricing strategy for $3,500/mo retainer", expected: "planning" },
    { prompt: "Summarize this status update in 2 bullet points", expected: "utility" },
  ];

  for (const t of tasks) {
    const category = classifyTask(t.prompt);
    console.log(`Task: "${t.prompt.slice(0, 45)}..." -> Category: ${category} (Expected: ${t.expected})`);
    if (category !== t.expected) throw new Error(`Classification mismatch for "${t.prompt}"`);
  }
  console.log("✓ Task classification verified.");

  // 2. Test Live Chat Completion via OpenRouter with Fallback
  console.log("\n=== Testing Live Chat Completion via OpenRouter ===");
  const completion = await chatComplete(
    "You are the GrowForge AI OS Planning Lead.",
    [{ role: "user", content: "Propose 3 high-leverage n8n automation workflows for a digital agency." }],
    { preferCloud: true }
  );

  console.log(`✓ Provider Used: ${completion.provider}`);
  console.log(`✓ Response (preview):\n${completion.text.slice(0, 200)}...\n`);

  console.log("🎉 Dynamic Model Router verified end-to-end!");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
