import { NextResponse } from "next/server";
import { loadSpatialGraph } from "@/lib/spatial/obsidianReader";
import { getSession, isPublicPreviewVisitor } from "@/lib/session";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (isPublicPreviewVisitor(session)) {
      return NextResponse.json({ error: "Not available in public preview." }, { status: 403 });
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
