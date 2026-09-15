import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listPendingApprovals } from "@/lib/approvalStore";

/** Visible to any signed-in team member — a colleague should be able to
 *  see a job is stuck waiting, even though only an owner can decide it
 *  (see /api/approvals/[id]/decide). */
export async function GET() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return NextResponse.json({ approvals: listPendingApprovals() });
}
