import { NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { getProviderKey, getProviderModel } from "@/lib/llm";
import { getDefaultTools, type Tool } from "@/lib/tools";
import { dispatchSafeTool, scrubSecrets } from "@/lib/security/toolBroker";
import { convertToolUsageToSchema } from "@/lib/mcp/growforgeMcpServer";
import { telemetryStore, resolveLobe } from "@/lib/telemetryStore";

export const runtime = "nodejs";

function sanitizeFunctionName(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9_]/g, "_");
  // Ensure starts with a letter or underscore
  return /^[a-zA-Z_]/.test(sanitized) ? sanitized : `tool_${sanitized}`;
}

function convertToolToGeminiFunction(tool: Tool) {
  const safeName = sanitizeFunctionName(tool.name);
  const schema = convertToolUsageToSchema(tool);
  const properties: Record<string, { type: Type; description: string }> = {};

  for (const [key, val] of Object.entries(schema.properties || {})) {
    let propType = Type.STRING;
    if (val.type === "number") propType = Type.NUMBER;
    else if (val.type === "boolean") propType = Type.BOOLEAN;
    else if (val.type === "object") propType = Type.OBJECT;
    else if (val.type === "array") propType = Type.ARRAY;

    properties[key] = {
      type: propType,
      description: val.description || key,
    };
  }

  return {
    name: safeName,
    description: tool.description,
    parameters: {
      type: Type.OBJECT,
      properties,
      ...(schema.required && schema.required.length > 0 ? { required: schema.required } : {}),
    },
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      prompt,
      systemPrompt,
      model: requestedModel,
      departmentId,
      executeTools = true,
    } = body;

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { ok: false, error: "A string 'prompt' is required in the request body." },
        { status: 400 }
      );
    }

    const apiKey = getProviderKey("gemini");
    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error: "Gemini API key is not configured. Please add one in Settings → Integrations or set GEMINI_API_KEY.",
        },
        { status: 400 }
      );
    }

    // 1. Fetch available tools & map to Gemini function declarations
    const tools = await getDefaultTools(departmentId);
    const toolNameMap = new Map<string, string>(); // safeName -> originalName
    const functionDeclarations = tools.map((t) => {
      const fn = convertToolToGeminiFunction(t);
      toolNameMap.set(fn.name, t.name);
      return fn;
    });

    const targetModel = requestedModel || getProviderModel("gemini") || "gemini-2.5-flash";

    // 2. Emit real-time telemetry: system processing
    telemetryStore.setExecutionState("processing", { nodeId: "gemini" });
    telemetryStore.emitEvent({
      type: "step_changed",
      lobe: "neural_core",
      nodeId: "gemini",
      label: `Gemini Dispatch: ${targetModel}`,
      details: prompt.slice(0, 100),
    });

    // 3. Initialize GoogleGenAI SDK
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: targetModel,
      contents: prompt,
      config: {
        systemInstruction: systemPrompt || undefined,
        tools: functionDeclarations.length > 0 ? [{ functionDeclarations }] : undefined,
      },
    });

    const functionCalls = response.functionCalls || [];
    const toolResults: Array<{ name: string; args: Record<string, unknown>; ok: boolean; output: string }> = [];

    // 4. Optionally execute tool calls if requested by the model
    if (executeTools && functionCalls.length > 0) {
      for (const call of functionCalls) {
        if (!call.name) continue;
        const originalName = toolNameMap.get(call.name) || call.name;
        const tool = tools.find((t) => t.name === originalName);

        if (tool) {
          telemetryStore.emitEvent({
            type: "tool_invoked",
            lobe: resolveLobe(tool.name),
            nodeId: tool.name,
            label: `Executing ${tool.name}`,
            details: JSON.stringify(call.args ?? {}),
          });

          const execResult = await dispatchSafeTool(tool, (call.args as Record<string, unknown>) ?? {});
          telemetryStore.recordToolCall(execResult.ok);
          toolResults.push({
            name: tool.name,
            args: (call.args as Record<string, unknown>) ?? {},
            ok: execResult.ok,
            output: execResult.output,
          });
        }
      }
    }

    // 5. Emit idle state upon completion
    telemetryStore.setExecutionState("idle");

    return NextResponse.json({
      ok: true,
      text: response.text || "",
      functionCalls: functionCalls
        .filter((fc) => Boolean(fc.name))
        .map((fc) => ({
          name: toolNameMap.get(fc.name!) || fc.name!,
          args: fc.args,
        })),
      toolResults,
      model: targetModel,
    });
  } catch (err) {
    telemetryStore.setExecutionState("error");
    telemetryStore.emitEvent({
      type: "error",
      lobe: "neural_core",
      nodeId: "gemini",
      label: "Gemini API Execution Error",
      details: err instanceof Error ? err.message : String(err),
    });

    return NextResponse.json(
      {
        ok: false,
        error: scrubSecrets(err instanceof Error ? err.message : String(err)),
      },
      { status: 500 }
    );
  }
}
