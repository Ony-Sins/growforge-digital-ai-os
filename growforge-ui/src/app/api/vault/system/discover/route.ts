import { NextResponse } from "next/server";
import { getSession, isPublicPreviewVisitor, isOwnerSession } from "@/lib/session";
import { discoverProviderModels } from "@/lib/modelDiscovery";
import { getAiModel, getAiModelApiKey } from "@/lib/aiModelStore";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  // Apply public preview gate unconditionally to all branches
  if (isPublicPreviewVisitor(session)) {
    return NextResponse.json({ error: "Public preview is read-only." }, { status: 403 });
  }

  if (!isOwnerSession(session)) {
    return NextResponse.json({ error: "Forbidden. Owner authorization required to discover provider models." }, { status: 403 });
  }

  let body: {
    modelId?: string;
    providerType?: string;
    baseUrl?: string;
    apiKey?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  // If modelId is passed, resolve provider, baseUrl and stored key securely from owner-configured model
  if (body.modelId) {
    const model = getAiModel(body.modelId);
    if (!model) {
      return NextResponse.json({ error: "Model not found." }, { status: 404 });
    }
    const apiKey = getAiModelApiKey(model);
    const result = await discoverProviderModels(model.providerType, model.baseUrl, apiKey, {
      isOwnerConfigured: true,
    });
    return NextResponse.json(result);
  }

  // Discover with inline providerType, baseUrl, or apiKey
  const providerType = body.providerType || "groq";
  const result = await discoverProviderModels(providerType, body.baseUrl, body.apiKey);
  return NextResponse.json(result);
}
