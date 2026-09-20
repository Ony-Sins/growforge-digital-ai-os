import { NextResponse } from "next/server";
import { getSession, isPublicPreviewVisitor } from "@/lib/session";
import { probeMcpServer } from "@/lib/mcp/client";

export const runtime = "nodejs";

/** Real connect-and-discover probe — spawns the stdio process or opens the
 *  HTTP connection for real, lists the server's actual tools, then closes.
 *  Same shape as /api/connectors/[id]/test and /api/vault/system/test:
 *  a genuine live check, not a stored-status flag. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (isPublicPreviewVisitor(session)) {
    return NextResponse.json({ error: "Public preview is read-only." }, { status: 403 });
  }

  const { id } = await params;
  const result = await probeMcpServer(id);
  return NextResponse.json(result);
}
