import { NextResponse } from "next/server";
import { getSession, isPublicPreviewVisitor } from "@/lib/session";
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

  const { agentId, provider } = await params;
  removeSecret(agentId, decodeURIComponent(provider));
  return NextResponse.json({ providers: listProviders(agentId) });
}
