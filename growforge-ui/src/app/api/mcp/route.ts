import { NextResponse } from "next/server";
import { getSession, isPublicPreviewVisitor } from "@/lib/session";
import { createMcpServer, listMcpServers, type McpTransport } from "@/lib/mcp/store";
import { DEPARTMENTS } from "@/lib/departments";

export const runtime = "nodejs";

async function requireAuth() {
  const session = await getSession();
  if (!session?.user) return { ok: false as const, status: 401, error: "Unauthorized." };
  return { ok: true as const, session };
}

export async function GET() {
  const gate = await requireAuth();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  // A public-preview visitor gets an empty, non-configured view — the
  // owner's real connected servers must never render for an anonymous
  // stranger with a free session (see isPublicPreviewVisitor's doc comment).
  const servers = isPublicPreviewVisitor(gate.session) ? [] : listMcpServers();
  return NextResponse.json({
    servers,
    departments: DEPARTMENTS.map((d) => ({ id: d.id, name: d.name, summary: d.summary })),
  });
}

interface CreateBody {
  name?: string;
  transport?: string;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  bearerToken?: string;
  authHeader?: string;
  allowedDepartments?: string[];
  catalogId?: string;
}

const TRANSPORTS = new Set<McpTransport>(["stdio", "http"]);

export async function POST(req: Request) {
  const gate = await requireAuth();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let body: CreateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const transport = body.transport as McpTransport;
  if (!TRANSPORTS.has(transport)) {
    return NextResponse.json({ error: `transport must be one of ${[...TRANSPORTS].join(", ")}.` }, { status: 400 });
  }

  try {
    const server = await createMcpServer({
      name: body.name ?? "",
      transport,
      command: body.command,
      args: Array.isArray(body.args) ? body.args.filter((a) => typeof a === "string") : undefined,
      url: body.url,
      env: body.env,
      bearerToken: body.bearerToken,
      authHeader: body.authHeader,
      allowedDepartments: Array.isArray(body.allowedDepartments) ? body.allowedDepartments : undefined,
      catalogId: body.catalogId,
    });
    return NextResponse.json({ server });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't create this server." }, { status: 400 });
  }
}
