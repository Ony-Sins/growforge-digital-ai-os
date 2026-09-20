import { NextResponse } from "next/server";
import { getSession, isPublicPreviewVisitor } from "@/lib/session";
import { getJob } from "@/lib/jobStore";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  // A preview visitor must never see individual job content (client briefs,
  // department outputs) even if they somehow knew a job ID.
  if (isPublicPreviewVisitor(session)) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  const { id } = await params;
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  return NextResponse.json({ job });
}
