/**
 * Smoke test for the generic tool-calling loop (src/lib/tools.ts). Uses a
 * synthetic, network-free tool so the test proves the loop's own logic
 * (JSON action parsing, dispatch, approval gate, step limit, unknown-tool
 * handling) rather than depending on any external API's uptime or quota —
 * only the LLM call itself needs a live provider (defaults to local Ollama,
 * which is free and already running for this project).
 */
import { runToolLoop, type Tool } from "../src/lib/tools";

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean) {
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  if (ok) pass++;
  else fail++;
}

const calls: string[] = [];

const echoTool: Tool = {
  name: "echo_fact",
  description: "Returns a fixed fact about the number requested. Use this to answer any question involving a number.",
  usage: '{ "n": number }',
  requiresApproval: false,
  async execute(args) {
    calls.push(`echo_fact(${JSON.stringify(args)})`);
    return { ok: true, output: `The fact for ${args.n} is: FACT_${args.n}_CONFIRMED` };
  },
};

const gatedTool: Tool = {
  name: "send_real_email",
  description: "Sends a real email to the client. Only call this if explicitly asked to send an email.",
  usage: '{ "to": string, "body": string }',
  requiresApproval: true,
  async execute(args) {
    calls.push(`send_real_email(${JSON.stringify(args)})`);
    return { ok: true, output: "Email sent." };
  },
};

async function main() {
  console.log("\n-- Suite 1: Basic tool call + final answer --");
  const r1 = await runToolLoop({
    systemPrompt: "You are a test assistant.",
    task: 'Call echo_fact with n=42, then tell me what the fact was, quoting it exactly.',
    tools: [echoTool],
    maxSteps: 4,
  });
  check("called echo_fact", calls.some((c) => c.startsWith("echo_fact")));
  check("final text mentions the fact", /FACT_42_CONFIRMED/.test(r1.finalText));
  check("did not hit step limit", !r1.hitStepLimit);
  check("provider recorded", r1.provider !== "none");
  console.log(`  (finalText: ${r1.finalText.slice(0, 100)}...)`);

  console.log("\n-- Suite 2: Approval-gated tool, NOT approved --");
  calls.length = 0;
  const r2 = await runToolLoop({
    systemPrompt: "You are a test assistant.",
    task: "Send a real email to client@example.com saying hello.",
    tools: [gatedTool],
    maxSteps: 3,
    requestApproval: async () => false,
  });
  check("gated tool's execute() never actually ran", !calls.some((c) => c.startsWith("send_real_email")));
  check("a call to it was still logged", r2.calls.some((c) => c.tool === "send_real_email"));
  check("logged call marked not approved", r2.calls.find((c) => c.tool === "send_real_email")?.approved === false);

  console.log("\n-- Suite 3: Approval-gated tool, APPROVED --");
  calls.length = 0;
  const r3 = await runToolLoop({
    systemPrompt: "You are a test assistant.",
    task: "Send a real email to client@example.com saying hello.",
    tools: [gatedTool],
    maxSteps: 3,
    requestApproval: async () => true,
  });
  check("gated tool's execute() ran once approved", calls.some((c) => c.startsWith("send_real_email")));
  void r3;

  console.log("\n-- Suite 4: No approval callback configured at all --");
  calls.length = 0;
  const r4 = await runToolLoop({
    systemPrompt: "You are a test assistant.",
    task: "Send a real email to client@example.com saying hello.",
    tools: [gatedTool],
    maxSteps: 3,
    // requestApproval omitted entirely
  });
  check("safe default: gated tool never runs with no approval callback", !calls.some((c) => c.startsWith("send_real_email")));
  void r4;

  console.log("\n-- Suite 5: Unknown tool name doesn't crash the loop --");
  const r5 = await runToolLoop({
    systemPrompt: "You are a test assistant. There is exactly one tool available: echo_fact.",
    task: 'First deliberately call a made-up tool named "definitely_not_a_real_tool" with no args, see what happens, then call echo_fact with n=7 and report its fact.',
    tools: [echoTool],
    maxSteps: 5,
  });
  check("recovered and still finished", r5.finalText.length > 0);
  console.log(`  (finalText: ${r5.finalText.slice(0, 100)}...)`);

  console.log("\n=================================================================");
  console.log(fail === 0 ? `  ALL ${pass} CHECKS PASSED` : `  ${pass} passed, ${fail} FAILED`);
  console.log("=================================================================\n");
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Test script crashed:", err);
  process.exit(1);
});
