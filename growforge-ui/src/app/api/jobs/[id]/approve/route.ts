import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getJob, updateJob } from "@/lib/jobStore";

export const runtime = "nodejs";

/** Real state behind the final plan's "pending CEO approval" language —
 *  owner-only, same as the connector approval gate in /api/approvals. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (session.user.role !== "owner") {
    return NextResponse.json({ error: "Only an owner can approve a final plan." }, { status: 403 });
  }

  const { id } = await params;
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  if (!job.finalOutput) return NextResponse.json({ error: "This project has no final plan yet." }, { status: 400 });

  updateJob(id, { approvedAt: new Date().toISOString(), approvedBy: session.user.email ?? "owner" });
  return NextResponse.json({ job: getJob(id) });
}
