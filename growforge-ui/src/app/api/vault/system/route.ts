import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { CLOUD_PROVIDERS, SYSTEM_VAULT_ID, hasKey, type CloudProvider } from "@/lib/llm";
import { hasSecret, setSecret } from "@/lib/serverVault";

/** System-wide (not per-agent) provider key management — powers the
 *  Settings -> Integrations "AI Providers" section. Reuses the same
 *  encrypted vault as per-agent keys, under the reserved SYSTEM_VAULT_ID
 *  pseudo-agent, so a key set here overrides the deploy-time env var live,
 *  with zero key material ever returned to the browser. */
async function requireOwner() {
  const session = await getSession();
  if (!session?.user) return { ok: false as const, status: 401, error: "Unauthorized." };
  if (session.user.role !== "owner") {
    return { ok: false as const, status: 403, error: "Only owners can manage system integrations." };
  }
  return { ok: true as const };
}

export async function GET() {
  const gate = await requireOwner();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

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

  return NextResponse.json({ providers });
}

interface SetSecretBody {
  provider?: string;
  value?: string;
}

export async function POST(req: Request) {
  const gate = await requireOwner();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let body: SetSecretBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const provider = body.provider?.trim();
  const value = body.value?.trim();
  if (!provider || !(provider in CLOUD_PROVIDERS)) {
    return NextResponse.json({ error: "Unknown provider." }, { status: 400 });
  }
  if (!value) {
    return NextResponse.json({ error: "value is required." }, { status: 400 });
  }

  try {
    setSecret(SYSTEM_VAULT_ID, provider, value);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to store the key." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
