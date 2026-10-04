import { NextResponse } from "next/server";
import { getSession, isPublicPreviewVisitor, isOwnerSession } from "@/lib/session";
import { createMcpServer, listMcpServers, type McpTransport } from "@/lib/mcp/store";
import { ALL_RUNTIME_DEPARTMENTS, CANONICAL_DEPARTMENTS, HQ, QA } from "@/lib/departments";
import { departmentScopeLabel } from "@/lib/departmentTaxonomy";

export const runtime = "nodejs";

async function requireAuth() {
  const session = await getSession();
  if (!session?.user) return { ok: false as const, status: 401, error: "Unauthorized." };
  return { ok: true as const, session };
}

export async function GET() {
  const gate = await requireAuth();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  // Public preview visitors and non-owner beta/employee sessions must NOT
  // receive owner-global MCP records. Only authoritative owner sessions may
  // read owner-global server configurations.
  const servers = isOwnerSession(gate.session) ? listMcpServers() : [];
  return NextResponse.json({
    servers,
    departments: [...CANONICAL_DEPARTMENTS, ...ALL_RUNTIME_DEPARTMENTS.filter(dept => dept.id === "meta-ads"), { ...HQ, summary: "Executive oversight" }, { ...QA, summary: "Independent verification" }].map((d) => ({ id: d.id, name: departmentScopeLabel(d.id), summary: d.summary })),
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
  if (isPublicPreviewVisitor(gate.session)) {
    return NextResponse.json({ error: "Public preview is read-only. Sign in to add a server." }, { status: 403 });
  }
  if (!isOwnerSession(gate.session)) {
    return NextResponse.json({ error: "Forbidden. Authoritative owner authorization required to add an MCP server." }, { status: 403 });
  }

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
