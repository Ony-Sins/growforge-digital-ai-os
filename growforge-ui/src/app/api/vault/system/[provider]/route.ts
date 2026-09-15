import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { SYSTEM_VAULT_ID } from "@/lib/llm";
import { removeSecret } from "@/lib/serverVault";

export async function DELETE(_req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (session.user.role !== "owner") {
    return NextResponse.json({ error: "Only owners can manage system integrations." }, { status: 403 });
  }

  const { provider } = await params;
  removeSecret(SYSTEM_VAULT_ID, decodeURIComponent(provider));
  return NextResponse.json({ ok: true });
}
