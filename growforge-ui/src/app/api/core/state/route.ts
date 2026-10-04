import { NextResponse } from "next/server";
import { getSession, isPublicPreviewVisitor, isOwnerSession } from "@/lib/session";
import { buildCoreState } from "@/lib/coreState";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Live snapshot for the CORE page: focused job + real service probes. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  // Authenticated non-owners and public-preview visitors must not see the owner's
  // real runtime probes, jobs, or infrastructure topology — those reveal private services
  // and deployment state. Return truthful zero-state projection for non-owner sessions.
  if (isPublicPreviewVisitor(session) || !isOwnerSession(session)) {
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      jobs: [],
      job: null,
      systems: {
        probes: [],
        mcp: { count: 0, servers: [] },
        models: { count: 0, list: [] },
        routing: "cloud-first",
        pendingApprovals: 0,
        pendingConsultations: 0,
        vault: { reachable: false, noteCount: 0, latestDaily: null },
      },
    });
  }

  const jobId = new URL(req.url).searchParams.get("jobId");
  try {
    return NextResponse.json(await buildCoreState(jobId));
  } catch (err) {
    console.error("[api/core/state] failed:", err);
    return NextResponse.json({ error: "Failed to build CORE state." }, { status: 500 });
  }
}

