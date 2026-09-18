import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { deleteMcpServer, updateMcpServerDetails, getMcpServer } from "@/lib/mcp/store";

export const runtime = "nodejs";

async function requireAuth() {
  const session = await getSession();
  if (!session?.user) return { ok: false as const, status: 401, error: "Unauthorized." };
  return { ok: true as const };
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { id } = await params;
  deleteMcpServer(id);
  return NextResponse.json({ ok: true });
}

/** Updates an MCP server's configuration, credentials, or allowed departments. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

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
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const server = updateMcpServerDetails(id, body);
  return NextResponse.json({ server });
}
