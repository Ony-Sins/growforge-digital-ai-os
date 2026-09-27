import { NextResponse } from "next/server";
import { getSession, isPublicPreviewVisitor, isOwnerSession } from "@/lib/session";
import { listProviders, removeSecret } from "@/lib/serverVault";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ agentId: string; provider: string }> },
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (isPublicPreviewVisitor(session)) {
    return NextResponse.json({ error: "Public preview is read-only." }, { status: 403 });
  }
  if (!isOwnerSession(session)) {
    return NextResponse.json(
      { error: "Forbidden. Authoritative owner authorization required to delete agent vault credentials." },
      { status: 403 }
    );
  }

  const { agentId, provider } = await params;
  removeSecret(agentId, decodeURIComponent(provider));
  return NextResponse.json({ providers: listProviders(agentId) });
}
