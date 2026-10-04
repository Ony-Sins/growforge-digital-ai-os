import { NextResponse } from "next/server";
import { getSession, isPublicPreviewVisitor } from "@/lib/session";
import { getJob } from "@/lib/jobStore";
import { rerunJob } from "@/lib/orchestrator";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (isPublicPreviewVisitor(session)) return NextResponse.json({ error: "Public preview is read-only." }, { status: 403 });
  const { id } = await params;
  const source = getJob(id);
  if (!source) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  const isCreator = !!source.createdBy && source.createdBy === session.user.email?.toLowerCase();
  if (session.user.role !== "owner" && !isCreator) return NextResponse.json({ error: "Only the project creator or an owner can rerun it." }, { status: 403 });
  let body: { instructionMode?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 }); }
  if (body.instructionMode !== "original" && body.instructionMode !== "current") return NextResponse.json({ error: "Select instructionMode: original or current explicitly." }, { status: 400 });
  try {
    const job = rerunJob(id, body.instructionMode);
    return NextResponse.json({ job, rerunScope: body.instructionMode === "original" ? "stored-plan-downstream-stages" : "full-pipeline-with-new-plan", runtimePolicy: "current authorization, approvals, provider routing and live research", reproducibility: "instruction configuration; identical output is not guaranteed" }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Rerun unavailable." }, { status: 409 });
  }
}
