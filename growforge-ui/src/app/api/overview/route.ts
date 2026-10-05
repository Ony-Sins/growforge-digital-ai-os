import { NextResponse } from "next/server";
import { getSession, isPublicPreviewVisitor, isOwnerSession } from "@/lib/session";
import { buildOverviewSnapshot } from "@/lib/overviewSnapshot";
import { gatherOverviewInput, restrictedOverviewInput } from "@/lib/overviewSnapshotServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The Overview Snapshot: one deterministic, grounded description of current operational state, built from the
 * canonical stores (see lib/overviewSnapshot.ts). Read-only. Non-owner and preview sessions get the restricted
 * (unknown) snapshot, never owner runtime state.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const restricted = isPublicPreviewVisitor(session) || !isOwnerSession(session);
  const input = restricted ? restrictedOverviewInput() : await gatherOverviewInput();
  return NextResponse.json(buildOverviewSnapshot(input), { headers: { "Cache-Control": "no-store" } });
}
