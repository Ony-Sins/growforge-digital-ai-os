import { hasKey, getEffectiveRoutingChain, chatComplete } from "../src/lib/llm";

async function verifyRealCoreChat() {
  console.log("=== GROWFORGE REAL CORE CHAT INTEGRATION CHECK ===\n");

  const hasGroqKey = hasKey("groq");
  const routing = getEffectiveRoutingChain();

  console.log("Checking Financial & Eligibility Parameters:");
  console.log(`- Groq API Key Available in Runner: ${hasGroqKey ? "YES (masked)" : "NO"}`);
  console.log(`- Selected Primary Model: ${routing.primary ? `${routing.primary.name} (${routing.primary.modelName})` : "None"}`);
  console.log(`- Zero-Spend Primary Approved: ${routing.primaryApproved}`);
  console.log(`- Authoritative Provider Order: [${routing.chain.join(", ")}]`);
  if (routing.exclusionReason) {
    console.log(`- Exclusion Reason: ${routing.exclusionReason}`);
  }

  if (hasGroqKey && routing.primaryApproved && routing.primary?.id === "groq-openai-gpt-oss-120b") {
    console.log("\nZero-spend Groq Free Plan candidate confirmed and approved. Dispatching 1 live CORE turn...");
    try {
      const start = Date.now();
      const result = await chatComplete(
        "You are Nora, the GrowForge Digital AI Assistant. Respond in under 10 words.",
        [{ role: "user", content: "State operational status." }],
        { maxTokens: 30, preferCloud: false }
      );
      const elapsed = Date.now() - start;
      console.log("\n[LIVE SMOKE TEST RESULT]");
      console.log(`Status: SUCCESS (${elapsed}ms)`);
      console.log(`Answering Provider: ${result.provider}`);
      console.log(`Answering Model: ${result.model || "default"}`);
      console.log(`Fallback Occurred: ${result.fallbackOccurred ?? false}`);
      if (result.fallbackFrom) {
        console.log(`Fallback From: ${result.fallbackFrom}`);
      }
      console.log(`Response Snippet: "${result.text.trim().slice(0, 100)}"`);
    } catch (err: unknown) {
      console.log("\n[LIVE SMOKE TEST RESULT]");
      console.log(`Status: FAILED/ERROR - ${(err as Error).message}`);
    }
  } else {
    console.log("\n[LIVE SMOKE TEST RESULT]");
    console.log("Status: UNVERIFIED");
    console.log("Reason: Decrypted Groq vault credential is not present in standalone CLI runner process environment, or zero-spend route is unapproved.");
    console.log("Protections Maintained: 0 unauthorized paid cloud calls made. Zero-spend financial boundary enforced.");
  }
}

verifyRealCoreChat().catch((err) => {
  console.error("Live Verification Script Error:", err);
});
