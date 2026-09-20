import { NextResponse } from "next/server";
import { getSession, isPublicPreviewVisitor } from "@/lib/session";
import { getJob } from "@/lib/jobStore";
import { reviseJob } from "@/lib/orchestrator";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (isPublicPreviewVisitor(session)) {
    return NextResponse.json(
      { error: "Public preview is read-only. Sign in to revise a project." },
      { status: 403 },
    );
  }

  const { id } = await params;
  const existing = getJob(id);
  if (!existing) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  const isOwner = session.user.role === "owner";
  const isCreator = !!existing.createdBy && existing.createdBy === session.user.email?.toLowerCase();
  if (!isOwner && !isCreator) {
    return NextResponse.json({ error: "Only the person who launched this project, or an owner, can change it." }, { status: 403 });
  }

  let body: { message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const message = body.message?.trim();
  if (!message || message.length < 5) {
    return NextResponse.json({ error: "Describe the change (at least 5 characters)." }, { status: 400 });
  }

  try {
    const job = await reviseJob(id, message.slice(0, 4000));
    return NextResponse.json({ job });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Revision failed." }, { status: 500 });
  }
}
