import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { SYSTEM_VAULT_ID } from "@/lib/llm";
import { removeSecret } from "@/lib/serverVault";
import { deleteAiModel, getAiModel } from "@/lib/aiModelStore";

export const runtime = "nodejs";

export async function DELETE(_req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { provider } = await params;
  const targetId = decodeURIComponent(provider);

  // If it's a registered model in aiModelStore, delete it
  if (getAiModel(targetId)) {
    deleteAiModel(targetId);
  } else {
    // Legacy provider removal from vault
    removeSecret(SYSTEM_VAULT_ID, targetId);
  }

  return NextResponse.json({ ok: true });
}
