import { NextResponse } from "next/server";
import { getSession, isPublicPreviewVisitor } from "@/lib/session";
import { deleteMcpServer, archiveMcpServer, updateMcpServerDetails, getMcpServer, type McpServerDef } from "@/lib/mcp/store";

export const runtime = "nodejs";

async function requireAuth() {
  const session = await getSession();
  if (!session?.user) return { ok: false as const, status: 401, error: "Unauthorized." };
  return { ok: true as const, session };
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (isPublicPreviewVisitor(gate.session)) {
    return NextResponse.json({ error: "Public preview is read-only." }, { status: 403 });
  }

  const { id } = await params;
  const url = new URL(req.url);
  let keepOnFile = url.searchParams.get("keepOnFile") === "true";
  try {
    const body = await req.json();
    if (typeof body?.keepOnFile === "boolean") keepOnFile = body.keepOnFile;
  } catch {
    // No body or not JSON
  }

  if (keepOnFile) {
    const server = archiveMcpServer(id);
    return NextResponse.json({ ok: true, archived: true, server });
  }

  deleteMcpServer(id);
  return NextResponse.json({ ok: true, deleted: true });
}

/** Updates an MCP server's configuration, credentials, status, or allowed departments. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (isPublicPreviewVisitor(gate.session)) {
    return NextResponse.json({ error: "Public preview is read-only." }, { status: 403 });
  }

  const { id } = await params;
  if (!getMcpServer(id)) return NextResponse.json({ error: "Server not found." }, { status: 404 });

  let body: {
    name?: string;
    url?: string;
    command?: string;
    args?: string[];
    bearerToken?: string;
    authHeader?: string;
    allowedDepartments?: string[];
    status?: McpServerDef["status"];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const server = updateMcpServerDetails(id, body);
  return NextResponse.json({ server });
}
