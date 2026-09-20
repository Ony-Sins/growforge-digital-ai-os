import { NextResponse } from "next/server";
import { getSession, isPublicPreviewVisitor } from "@/lib/session";
import { listJobSummaries } from "@/lib/jobStore";
import { createAndStartJob } from "@/lib/orchestrator";

export const runtime = "nodejs";

/** Lightweight summaries only — polled every few seconds by the completion
 *  notifier, so no step outputs in this payload. */
export async function GET() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  // Preview visitors must not see the owner's real job titles / client briefs.
  if (isPublicPreviewVisitor(session)) return NextResponse.json({ jobs: [] });
  return NextResponse.json({ jobs: listJobSummaries() });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (isPublicPreviewVisitor(session)) {
    return NextResponse.json(
      { error: "Public preview is read-only. Sign in to launch a real project." },
      { status: 403 },
    );
  }

  let body: { brief?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const brief = body.brief?.trim();
  if (!brief || brief.length < 20) {
    return NextResponse.json({ error: "brief is required (at least 20 characters)." }, { status: 400 });
  }

  const userEmail = session.user.email?.trim().toLowerCase();
  if (!userEmail) {
    return NextResponse.json({ error: "Session must include an email address to launch a project." }, { status: 400 });
  }

  const job = createAndStartJob(brief.slice(0, 8000), userEmail);
  return NextResponse.json({ job });
}
