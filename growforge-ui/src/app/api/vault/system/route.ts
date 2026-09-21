import { NextResponse } from "next/server";
import { getSession, isPublicPreviewVisitor } from "@/lib/session";
import {
  CLOUD_PROVIDERS,
  SYSTEM_VAULT_ID,
  hasKey,
  getStrategy,
  type CloudProvider,
} from "@/lib/llm";
import { hasSecret, setSecret } from "@/lib/serverVault";
import { listAiModels, saveAiModel, type TaskRole, type ProviderType, type StoredAiModel } from "@/lib/aiModelStore";
import { reactivateCapability } from "@/lib/capabilityStore";
import { ROUTE_CHAINS } from "@/lib/model-router";

export const runtime = "nodejs";

/** System-wide provider and dynamic AI model management.
 *  Powers the Settings -> AI Providers connector builder and inspector.
 *  All secrets remain safely encrypted in the server vault. */
async function requireAuth() {
  const session = await getSession();
  if (!session?.user) return { ok: false as const, status: 401, error: "Unauthorized." };
  return { ok: true as const, session };
}

export async function GET() {
  const gate = await requireAuth();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  // A public-preview visitor must see an unconfigured, empty state, never
  // the owner's real provider/vault/model configuration — see
  // isPublicPreviewVisitor's doc comment for why.
  if (isPublicPreviewVisitor(gate.session)) {
    const providers = (Object.keys(CLOUD_PROVIDERS) as CloudProvider[]).map((id) => ({
      id,
      label: CLOUD_PROVIDERS[id].label,
      source: "none" as const,
      configured: false,
    }));
    return NextResponse.json({ providers, models: [], strategy: getStrategy(), routingChains: ROUTE_CHAINS });
  }

  // Standard legacy providers for compatibility
  const providers = (Object.keys(CLOUD_PROVIDERS) as CloudProvider[]).map((id) => {
    const inVault = hasSecret(SYSTEM_VAULT_ID, id);
    const configured = hasKey(id);
    return {
      id,
      label: CLOUD_PROVIDERS[id].label,
      source: inVault ? "vault" : configured ? "env" : "none",
      configured,
    };
  });

  const models = listAiModels();
  const strategy = getStrategy();

  return NextResponse.json({
    providers,
    models,
    strategy,
    routingChains: ROUTE_CHAINS,
  });
}

interface SaveModelRequestBody {
  // Direct model save structure
  id?: string;
  name?: string;
  providerType?: ProviderType;
  baseUrl?: string;
  modelName?: string;
  apiKey?: string;
  taskRole?: TaskRole;
  isPrimary?: boolean;
  status?: StoredAiModel["status"];

  // Legacy provider key update structure
  provider?: string;
  value?: string;
}

export async function POST(req: Request) {
  const gate = await requireAuth();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (isPublicPreviewVisitor(gate.session)) {
    return NextResponse.json({ error: "Public preview is read-only. Sign in to save provider settings." }, { status: 403 });
  }

  let body: SaveModelRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  // Handle dynamic model connector builder submission
  if (body.baseUrl && body.modelName) {
    try {
      const saved = saveAiModel(
        {
          id: body.id,
          name: body.name || body.modelName,
          providerType: body.providerType || "openai-compatible",
          baseUrl: body.baseUrl,
          modelName: body.modelName,
          taskRole: body.taskRole || "general",
          isPrimary: body.isPrimary,
          status: body.status,
        },
        body.apiKey
      );
      return NextResponse.json({ ok: true, model: saved });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to save AI model connector." },
        { status: 500 }
      );
    }
  }

  // Handle legacy provider key update
  const provider = body.provider?.trim();
  const value = body.value?.trim();
  if (provider && (provider in CLOUD_PROVIDERS || provider === "higgsfield" || provider === "higgsfield_ai")) {
    if (!value) {
      return NextResponse.json({ error: "value is required." }, { status: 400 });
    }
    try {
      setSecret(SYSTEM_VAULT_ID, provider, value);
      reactivateCapability(provider);
      return NextResponse.json({ ok: true });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to store the key." },
        { status: 500 }
      );
    }
  }

  return NextResponse.json(
    { error: "Invalid request payload. Please specify Base URL and Model Name." },
    { status: 400 }
  );
}
