import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { deleteConnector } from "@/lib/connectorStore";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (session.user.role !== "owner") {
    return NextResponse.json({ error: "Only owners can manage connectors." }, { status: 403 });
  }

  const { id } = await params;
  deleteConnector(id);
  return NextResponse.json({ ok: true });
}
