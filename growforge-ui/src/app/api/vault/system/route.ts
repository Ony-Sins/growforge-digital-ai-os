import { NextResponse } from "next/server";
import { getSession, isPublicPreviewVisitor, isOwnerSession } from "@/lib/session";
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
import { logContextEvent } from "@/lib/spatial/dailyContext";

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

  // Public-preview visitors and authenticated non-owners must receive an unconfigured,
  // safe state — never the owner's real provider flags, key presence, custom models,
  // or active routing strategy.
  if (isPublicPreviewVisitor(gate.session) || !isOwnerSession(gate.session)) {
    const providers = (Object.keys(CLOUD_PROVIDERS) as CloudProvider[]).map((id) => ({
      id,
      label: CLOUD_PROVIDERS[id].label,
      source: "none" as const,
      configured: false,
    }));
    return NextResponse.json({ providers, models: [], strategy: "auto", routingChains: ROUTE_CHAINS });
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
  if (!isOwnerSession(gate.session)) {
    return NextResponse.json({ error: "Forbidden. Authoritative owner authorization required to modify system vault credentials, models, or route approvals." }, { status: 403 });
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
      void logContextEvent(`Configured AI model: ${saved.name}`);
      return NextResponse.json({ ok: true, model: saved });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to save AI model connector." },
        { status: 500 }
      );
    }
  }

  // Handle legacy provider key update or explicit free-route authorization
  const provider = body.provider?.trim();
  const value = body.value?.trim();
  if (provider && (provider in CLOUD_PROVIDERS || provider === "higgsfield" || provider === "higgsfield_ai")) {
    if (!value) {
      return NextResponse.json({ error: "value is required." }, { status: 400 });
    }
    try {
      setSecret(SYSTEM_VAULT_ID, provider, value);
      reactivateCapability(provider);
      void logContextEvent(`Added capability key: ${provider}`);

      if (provider === "groq" && (body as { approveFreeRoute?: boolean }).approveFreeRoute) {
        const { approveGroqFreeRoute } = await import("@/lib/llm");
        approveGroqFreeRoute(value, "openai/gpt-oss-120b");
      }

      return NextResponse.json({ ok: true });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to store the key." },
        { status: 500 }
      );
    }
  }

  // Handle explicit route authorization action
  if ((body as { action?: string }).action === "approve_free_route") {
    const targetProvider = (body as { targetProvider?: string }).targetProvider || provider;
    const model = (body as { model?: string }).model || "openai/gpt-oss-120b";
    const apiKey = (body as { apiKey?: string }).apiKey || value || (targetProvider === "groq" ? (await import("@/lib/llm")).getProviderKey("groq") : null);
    if (targetProvider === "groq" && apiKey && model === "openai/gpt-oss-120b") {
      const { approveGroqFreeRoute } = await import("@/lib/llm");
      approveGroqFreeRoute(apiKey, model);
      return NextResponse.json({ ok: true, message: "Groq free route explicitly authorized." });
    }
    return NextResponse.json({ error: "Invalid free-route approval request." }, { status: 400 });
  }

  return NextResponse.json(
    { error: "Invalid request payload. Please specify Base URL and Model Name." },
    { status: 400 }
  );
}
