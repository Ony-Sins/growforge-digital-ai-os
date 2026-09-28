import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { buildCoreState } from "@/lib/coreState";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Live snapshot for the CORE page: focused job + real service probes. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  

  const jobId = new URL(req.url).searchParams.get("jobId");
  try {
    return NextResponse.json(await buildCoreState(jobId));
  } catch (err) {
    console.error("[api/core/state] failed:", err);
    return NextResponse.json({ error: "Failed to build CORE state." }, { status: 500 });
  }
}
