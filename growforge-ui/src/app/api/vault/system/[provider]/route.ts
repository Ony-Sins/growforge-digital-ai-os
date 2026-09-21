import { NextResponse } from "next/server";
import { getSession, isPublicPreviewVisitor } from "@/lib/session";
import { SYSTEM_VAULT_ID } from "@/lib/llm";
import { removeSecret } from "@/lib/serverVault";
import { deleteAiModel, archiveAiModel, getAiModel } from "@/lib/aiModelStore";
import { setCapabilityStatus } from "@/lib/capabilityStore";

export const runtime = "nodejs";

export async function DELETE(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (isPublicPreviewVisitor(session)) {
    return NextResponse.json({ error: "Public preview is read-only." }, { status: 403 });
  }

  const { provider } = await params;
  const targetId = decodeURIComponent(provider);
  const url = new URL(req.url);
  let keepOnFile = url.searchParams.get("keepOnFile") === "true";
  try {
    const body = await req.json();
    if (typeof body?.keepOnFile === "boolean") keepOnFile = body.keepOnFile;
  } catch {
    // No JSON body or not provided
  }

  if (keepOnFile) {
    if (getAiModel(targetId)) {
      archiveAiModel(targetId);
    } else {
      setCapabilityStatus(targetId, "archived");
    }
    return NextResponse.json({ ok: true, archived: true });
  }

  // If it's a registered model in aiModelStore, delete it completely
  if (getAiModel(targetId)) {
    deleteAiModel(targetId);
  } else {
    // Legacy provider / capability key removal from vault
    setCapabilityStatus(targetId, "archived");
    removeSecret(SYSTEM_VAULT_ID, targetId);
    if (targetId === "higgsfield") {
      removeSecret(SYSTEM_VAULT_ID, "higgsfield_ai");
    }
  }

  return NextResponse.json({ ok: true, deleted: true });
}
