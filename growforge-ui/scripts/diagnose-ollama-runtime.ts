async function diagnoseOllama() {
  console.log("=== OLLAMA RUNTIME DIAGNOSIS ===\n");

  // 1. Check /api/tags
  try {
    const t0 = Date.now();
    const res = await fetch("http://localhost:11434/api/tags");
    const elapsed = Date.now() - t0;
    console.log(`[1] GET /api/tags: HTTP ${res.status} (${elapsed}ms)`);
    const data = (await res.json()) as { models?: { name: string }[] };
    console.log("    Installed models:", data.models?.map((m) => m.name));
  } catch (err: unknown) {
    console.log("    GET /api/tags failed:", (err as Error).message);
  }

  // 2. Check /v1/models
  try {
    const t0 = Date.now();
    const res = await fetch("http://localhost:11434/v1/models");
    const elapsed = Date.now() - t0;
    console.log(`\n[2] GET /v1/models: HTTP ${res.status} (${elapsed}ms)`);
    const data = (await res.json()) as { data?: { id: string }[] };
    console.log("    v1 models:", data.data?.map((m) => m.id));
  } catch (err: unknown) {
    console.log("    GET /v1/models failed:", (err as Error).message);
  }

  // 3. Short prompt via /v1/chat/completions
  try {
    console.log("\n[3] Testing POST /v1/chat/completions (short prompt)...");
    const t0 = Date.now();
    const res = await fetch("http://localhost:11434/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen2.5:7b-instruct",
        messages: [{ role: "user", content: "Say READY" }],
        stream: false,
        max_tokens: 10,
      }),
    });
    const elapsed = Date.now() - t0;
    console.log(`    POST /v1/chat/completions: HTTP ${res.status} (${elapsed}ms)`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    console.log("    v1 reply:", JSON.stringify(data.choices?.[0]?.message?.content));
  } catch (err: unknown) {
    console.log("    POST /v1/chat/completions failed:", (err as Error).message);
  }

  // 4. Short prompt via /api/chat
  try {
    console.log("\n[4] Testing POST /api/chat (short prompt)...");
    const t0 = Date.now();
    const res = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen2.5:7b-instruct",
        messages: [{ role: "user", content: "Say READY" }],
        stream: false,
        options: { num_predict: 10 },
      }),
    });
    const elapsed = Date.now() - t0;
    console.log(`    POST /api/chat: HTTP ${res.status} (${elapsed}ms)`);
    const data = (await res.json()) as { message?: { content?: string } };
    console.log("    native reply:", JSON.stringify(data.message?.content));
  } catch (err: unknown) {
    console.log("    POST /api/chat failed:", (err as Error).message);
  }

  // 5. Test with GrowForge router system prompt
  try {
    console.log("\n[5] Testing full system prompt + 8-turn conversation via /api/chat...");
    const systemPrompt = `You are the GrowForge Digital AI Assistant. Return JSON: {"mode": "chat", "agentId": null, "params": {}, "reply": "Hello!", "brief": null}`;
    const history = [
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello! How can I assist you with your marketing or agency operations today?" },
      { role: "user", content: "What can you do?" },
      { role: "assistant", content: "I can coordinate strategy, demand gen, web dev, and automation." },
      { role: "user", content: "Let's review our pipeline." },
      { role: "assistant", content: "Sure, let's look at active projects." },
      { role: "user", content: "Are there any running?" },
      { role: "assistant", content: "Nothing is currently running." },
      { role: "user", content: "Status check." },
    ];
    const t0 = Date.now();
    const res = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen2.5:7b-instruct",
        messages: [{ role: "system", content: systemPrompt }, ...history],
        stream: false,
        options: { num_predict: 500, temperature: 0.2 },
      }),
    });
    const elapsed = Date.now() - t0;
    console.log(`    Full prompt /api/chat: HTTP ${res.status} (${elapsed}ms)`);
    const data = (await res.json()) as { message?: { content?: string } };
    console.log("    reply length:", data.message?.content?.length);
    console.log("    reply sample:", data.message?.content?.slice(0, 120));
  } catch (err: unknown) {
    console.log("    Full prompt /api/chat failed:", (err as Error).message);
  }

  // 6. Test via chatComplete() function in llm.ts
  try {
    const { chatComplete, getEffectiveRoutingChain } = await import("../src/lib/llm");
    console.log("\n[6] Testing chatComplete() with 9-turn history...");
    console.log("    Effective Routing Chain:", getEffectiveRoutingChain());
    const systemPrompt = `You are the GrowForge Digital AI Assistant.
Universal context rule: Detect the language of the user's input and respond seamlessly in the same language.
Single-agent roster:
- id: "strategy-lead" | name: "Chief Strategy Officer" | division: strategy | status: ready
- id: "brand-architect" | name: "Brand Strategist" | division: brand | status: ready
- id: "growth-director" | name: "Head of Growth" | division: growth | status: ready
- id: "fullstack-engineer" | name: "Lead Systems Architect" | division: engineering | status: ready

Choose exactly ONE mode per message: "chat" | "dispatch" | "clarify" | "confirm" | "launch".
Respond with ONLY one JSON object: {"mode": "chat", "agentId": null, "params": {}, "reply": "string", "brief": null}`;

    const history = [
      { role: "user" as const, content: "Hi Nora, who are you?" },
      { role: "assistant" as const, content: "I am Nora, your GrowForge AI Assistant." },
      { role: "user" as const, content: "Can we build an agency marketing plan?" },
      { role: "assistant" as const, content: "Yes, I can help plan strategy, branding, and automation." },
      { role: "user" as const, content: "Let us start with branding." },
      { role: "assistant" as const, content: "Tell me about your business name and target audience." },
      { role: "user" as const, content: "The business is GrowForge Digital, target is B2B companies." },
      { role: "assistant" as const, content: "Understood. What is your estimated monthly budget?" },
      { role: "user" as const, content: "What is our status right now?" },
    ];

    const t0 = Date.now();
    const res = await chatComplete(systemPrompt, history, { maxTokens: 1000 });
    const elapsed = Date.now() - t0;
    console.log(`    chatComplete completed in ${elapsed}ms:`);
    console.log(`    - Provider: ${res.provider}`);
    console.log(`    - Model: ${res.model}`);
    console.log(`    - Fallback Occurred: ${res.fallbackOccurred}`);
    console.log(`    - Fallback From: ${res.fallbackFrom ?? "none"}`);
    console.log(`    - Reply: ${res.text.slice(0, 140)}...`);
  } catch (err: unknown) {
    console.log("    chatComplete failed:", (err as Error).message);
  }
}

diagnoseOllama().catch(console.error);
