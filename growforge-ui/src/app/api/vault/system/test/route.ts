import { NextResponse } from "next/server";
import { getSession, isPublicPreviewVisitor } from "@/lib/session";
import { CLOUD_PROVIDERS, testProvider, testCustomModel, type CloudProvider } from "@/lib/llm";
import { getAiModel, getAiModelApiKey, updateAiModelTestStatus } from "@/lib/aiModelStore";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: {
    provider?: string;
    modelId?: string;
    baseUrl?: string;
    modelName?: string;
    apiKey?: string;
    providerType?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  // 1. Test by modelId (existing saved model) -- uses the owner's real
  // stored credentials, so a public-preview visitor can't trigger this.
  // Case 2 below (inline baseUrl+modelName, e.g. the onboarding banner's
  // local-Ollama health check) uses no stored secret and stays open --
  // blocking it would break that legitimate anonymous health check.
  if (body.modelId) {
    if (isPublicPreviewVisitor(session)) {
      return NextResponse.json({ error: "Public preview is read-only." }, { status: 403 });
    }
    const model = getAiModel(body.modelId);
    if (!model) {
      return NextResponse.json({ ok: false, message: "Model not found." }, { status: 404 });
    }

    const apiKey = getAiModelApiKey(model);
    const result = await testCustomModel({
      baseUrl: model.baseUrl,
      modelName: model.modelName,
      apiKey,
      providerType: model.providerType,
    });

    updateAiModelTestStatus(model.id, result);
    return NextResponse.json(result);
  }

  // 2. Test inline custom configuration before saving
  if (body.baseUrl && body.modelName) {
    const result = await testCustomModel({
      baseUrl: body.baseUrl,
      modelName: body.modelName,
      apiKey: body.apiKey,
      providerType: body.providerType,
    });
    return NextResponse.json(result);
  }

  // 3. Test standard legacy provider -- also uses the owner's stored/env key.
  const provider = body.provider;
  if (provider && provider in CLOUD_PROVIDERS) {
    if (isPublicPreviewVisitor(session)) {
      return NextResponse.json({ error: "Public preview is read-only." }, { status: 403 });
    }
    const result = await testProvider(provider as CloudProvider);
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "Specify modelId, provider, or baseUrl + modelName." }, { status: 400 });
}
