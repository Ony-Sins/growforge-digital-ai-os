import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getAgent } from "@/lib/agentStore";
import { listProviders, purgeAgent, setSecret } from "@/lib/serverVault";

/** Credential vault mutation is an owner-only capability — middleware.ts
 *  already guarantees an authenticated session for every request that
 *  reaches here; this additionally requires the "owner" role NextAuth
 *  derived server-side from OWNER_EMAILS (see src/auth.ts), never a
 *  client-claimed role. */
async function requireAuth() {
  const session = await getSession();
  if (!session?.user) return { ok: false as const, status: 401, error: "Unauthorized." };
  return { ok: true as const };
}

/** Never returns key material — provider names only. */
export async function GET(_req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const gate = await requireAuth();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { agentId } = await params;
  if (!getAgent(agentId)) return NextResponse.json({ error: `Unknown agent: ${agentId}` }, { status: 404 });

  return NextResponse.json({ providers: listProviders(agentId) });
}

interface SetSecretBody {
  provider?: string;
  value?: string;
}

export async function POST(req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const gate = await requireAuth();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { agentId } = await params;
  if (!getAgent(agentId)) return NextResponse.json({ error: `Unknown agent: ${agentId}` }, { status: 404 });

  let body: SetSecretBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const provider = body.provider?.trim();
  const value = body.value?.trim();
  if (!provider || !value) {
    return NextResponse.json({ error: "provider and value are both required." }, { status: 400 });
  }

  try {
    setSecret(agentId, provider, value);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to store the key." },
      { status: 500 },
    );
  }

  return NextResponse.json({ providers: listProviders(agentId) });
}

/** Purges every stored key for this agent. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const gate = await requireAuth();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { agentId } = await params;
  purgeAgent(agentId);
  return NextResponse.json({ providers: [] });
}
