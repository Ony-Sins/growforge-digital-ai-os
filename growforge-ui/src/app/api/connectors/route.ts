import { NextResponse } from "next/server";
import { getSession, isPublicPreviewVisitor } from "@/lib/session";
import { createConnector, listConnectors, type AuthMode } from "@/lib/connectorStore";

async function requireAuth() {
  const session = await getSession();
  if (!session?.user) return { ok: false as const, status: 401, error: "Unauthorized." };
  return { ok: true as const, session };
}

export async function GET() {
  const gate = await requireAuth();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const connectors = isPublicPreviewVisitor(gate.session) ? [] : listConnectors();
  return NextResponse.json({ connectors });
}

interface CreateBody {
  name?: string;
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  authMode?: string;
  authHeaderName?: string;
  secretValue?: string;
}

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const AUTH_MODES = new Set<AuthMode>(["none", "bearer", "header"]);

export async function POST(req: Request) {
  const gate = await requireAuth();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let body: CreateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const name = body.name?.trim();
  const url = body.url?.trim();
  const method = (body.method ?? "GET").toUpperCase();
  const authMode = (body.authMode ?? "none") as AuthMode;

  if (!name) return NextResponse.json({ error: "name is required." }, { status: 400 });
  if (!url) return NextResponse.json({ error: "url is required." }, { status: 400 });
  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: "url must be a valid absolute URL." }, { status: 400 });
  }
  if (!METHODS.has(method)) {
    return NextResponse.json({ error: `method must be one of ${[...METHODS].join(", ")}.` }, { status: 400 });
  }
  if (!AUTH_MODES.has(authMode)) {
    return NextResponse.json({ error: `authMode must be one of ${[...AUTH_MODES].join(", ")}.` }, { status: 400 });
  }
  if (authMode === "header" && !body.authHeaderName?.trim()) {
    return NextResponse.json({ error: "authHeaderName is required when authMode is 'header'." }, { status: 400 });
  }

  try {
    const connector = await createConnector({
      name,
      method: method as "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
      url,
      headers: body.headers ?? {},
      authMode,
      authHeaderName: body.authHeaderName?.trim(),
      secretValue: body.secretValue?.trim(),
    });
    return NextResponse.json({ connector });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't validate this URL." },
      { status: 400 },
    );
  }
}
