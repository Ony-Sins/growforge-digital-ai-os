import { NextResponse } from "next/server";
import { getDiveStateSnapshot } from "@/lib/spatial/diveState";
import { getSession } from "@/lib/session";

/**
 * GET /api/spatial/dive
 * Returns the real DIVE IN backend state:
 * - Configured structural topology (departments, subnodes, structural cords)
 * - Live execution state (active jobs, steps, progress)
 * - Truthful activity events and in-flight directional data packets
 */
export async function GET() {
  try {
    const session = await getSession();
    // Allow authorized session or preview fallback
    const snapshot = await getDiveStateSnapshot();
    return NextResponse.json(snapshot);
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to load DIVE IN state snapshot.", message: err?.message },
      { status: 500 }
    );
  }
}
