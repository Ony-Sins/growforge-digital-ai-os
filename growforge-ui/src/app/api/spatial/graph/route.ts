import { NextResponse } from "next/server";
import { loadSpatialGraph } from "@/lib/spatial/obsidianReader";
import { getSession } from "@/lib/session";

export async function GET() {
  try {
    const session = await getSession();
    // Public preview or authenticated user both get read access to the system graph topology
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
