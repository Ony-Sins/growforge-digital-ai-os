import { NextResponse } from "next/server";
import { getSession, isPublicPreviewVisitor } from "@/lib/session";
import { probeMcpServer } from "@/lib/mcp/client";
import { updateMcpServerDetails } from "@/lib/mcp/store";

export const runtime = "nodejs";

/** Real connect-and-discover probe — spawns the stdio process or opens the
 *  HTTP connection for real, lists the server's actual tools, then closes.
 *  Same shape as /api/connectors/[id]/test and /api/vault/system/test:
 *  a genuine live check, not a stale cached flag.
 *
 *  It also persists what it finds. Originally this was live-only by design
 *  (never write a stored-status flag) — but every downstream consumer of a
 *  server's tool list (the 3D Brain's generateDynamicTopology(), and real
 *  dispatch) reads ONLY the persisted detectedTools field, never re-probes
 *  live itself. A catalog-connected stdio server (e.g. Notion) never gets
 *  probed at creation time (see POST /api/mcp), so without this, its
 *  detectedTools stays permanently empty and it can never appear anywhere —
 *  confirmed live: the UI showed "24 tools discovered" here while the
 *  server's actual stored record had detectedTools: null. Persisting on
 *  every successful probe keeps this a genuine live check (still re-probes
 *  for real each time, not a cached flag) while finally closing that gap for
 *  every downstream feature that depends on the stored list. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (isPublicPreviewVisitor(session)) {
    return NextResponse.json({ error: "Public preview is read-only." }, { status: 403 });
  }

  const { id } = await params;
  const result = await probeMcpServer(id);

  if (result.ok) {
    updateMcpServerDetails(id, {
      detectedTools: result.tools,
      status: "connected",
    });
  } else {
    updateMcpServerDetails(id, {
      status: "error",
      errorMessage: result.error,
    });
  }

  return NextResponse.json(result);
}
