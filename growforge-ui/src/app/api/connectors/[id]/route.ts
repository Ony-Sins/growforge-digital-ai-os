import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { deleteConnector, getConnector, updateConnector, type CreateConnectorInput } from "@/lib/connectorStore";

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

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (session.user.role !== "owner") {
    return NextResponse.json({ error: "Only owners can manage connectors." }, { status: 403 });
  }

  const { id } = await params;
  if (!getConnector(id)) return NextResponse.json({ error: "Connector not found." }, { status: 404 });

  let body: Partial<CreateConnectorInput>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  try {
    const connector = await updateConnector(id, body);
    return NextResponse.json({ connector });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update connector." },
      { status: 400 }
    );
  }
}
