import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { deleteMcpServer, updateMcpServerDepartments, getMcpServer } from "@/lib/mcp/store";

export const runtime = "nodejs";

async function requireOwner() {
  const session = await getSession();
  if (!session?.user) return { ok: false as const, status: 401, error: "Unauthorized." };
  if (session.user.role !== "owner") {
    return { ok: false as const, status: 403, error: "Only owners can manage MCP servers." };
  }
  return { ok: true as const };
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireOwner();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { id } = await params;
  deleteMcpServer(id);
  return NextResponse.json({ ok: true });
}

/** Updates which departments a server is wired to — the allow/deny surface. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireOwner();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { id } = await params;
  if (!getMcpServer(id)) return NextResponse.json({ error: "Server not found." }, { status: 404 });

  let body: { allowedDepartments?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  if (!Array.isArray(body.allowedDepartments)) {
    return NextResponse.json({ error: "allowedDepartments must be an array of department ids." }, { status: 400 });
  }

  const server = updateMcpServerDepartments(id, body.allowedDepartments);
  return NextResponse.json({ server });
}
