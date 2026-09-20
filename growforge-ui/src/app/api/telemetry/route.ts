import { NextResponse } from "next/server";
import { telemetryStore } from "@/lib/telemetryStore";
import { listMcpServers } from "@/lib/mcp/store";
import { listApiCatalog } from "@/lib/apiCatalog";
import { getSession, isPublicPreviewVisitor } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  try {
    // This had no auth check at all -- open to the entire internet,
    // authenticated or not, and it's what drives the AI Brain's "connected
    // ecosystem" view. Require a session, and give a public-preview
    // visitor an empty/idle snapshot rather than the owner's real
    // connected-server count and live execution state.
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if (isPublicPreviewVisitor(session)) {
      return NextResponse.json(telemetryStore.getEmptySnapshot());
    }

    const mcpServers = listMcpServers();
    const publicApis = listApiCatalog();
    const publicToolsCount = publicApis.reduce((sum, api) => sum + api.tools.length, 0);

    const snapshot = telemetryStore.getSnapshot(mcpServers.length, publicToolsCount);

    return NextResponse.json(snapshot);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch telemetry snapshot." },
      { status: 500 },
    );
  }
}
