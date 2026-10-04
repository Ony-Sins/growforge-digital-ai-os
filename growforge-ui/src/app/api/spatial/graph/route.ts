import { NextResponse } from "next/server";
import { loadSpatialGraph } from "@/lib/spatial/obsidianReader";
import { getSession, isPublicPreviewVisitor } from "@/lib/session";
import { isBetaMode } from "@/lib/beta/access";
import { buildDemoGraph } from "@/lib/beta/demoGraph";

export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    // Private beta: fresh invited testers start with an empty graph by default.
    // Synthetic demo graph is served only if ?demo=true is explicitly requested.
    if (isBetaMode()) {
      const url = new URL(req.url);
      const isDemo = url.searchParams.get("demo") === "true" || url.searchParams.get("demo") === "1";
      if (isDemo) {
        return NextResponse.json({ ok: true, data: buildDemoGraph(), timestamp: new Date().toISOString(), user: session?.user?.name ?? "Operator" });
      }
      return NextResponse.json({
        ok: true,
        data: { nodes: [], links: [], categories: [], summary: { totalNotes: 0, totalConnections: 0, totalSources: 0 } },
        timestamp: new Date().toISOString(),
        user: session?.user?.name ?? "Operator",
      });
    }
    if (isPublicPreviewVisitor(session)) {
      return NextResponse.json({
        ok: true,
        data: { nodes: [], links: [], categories: [], summary: { totalNotes: 0, totalConnections: 0, totalSources: 0 } },
        timestamp: new Date().toISOString(),
        user: "Operator",
      });
    }
    const graphData = await loadSpatialGraph();
    return NextResponse.json({
      ok: true,
      data: graphData,
      timestamp: new Date().toISOString(),
      user: session?.user?.name ?? "Operator",
    });
  } catch (error) {
    console.error("[api/spatial/graph] Error loading spatial graph:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load spatial graph" },
      { status: 500 }
    );
  }
}
