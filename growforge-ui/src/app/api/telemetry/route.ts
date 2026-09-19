import { NextResponse } from "next/server";
import { telemetryStore } from "@/lib/telemetryStore";
import { listMcpServers } from "@/lib/mcp/store";
import { listApiCatalog } from "@/lib/apiCatalog";

export const runtime = "nodejs";

export async function GET() {
  try {
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
