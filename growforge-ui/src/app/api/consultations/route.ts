import { NextResponse } from "next/server";
import { getSession, isPublicPreviewVisitor } from "@/lib/session";
import { listPendingConsultations } from "@/lib/consultationStore";

/**
 * Lists all pending sub-agent consultations. Visible to any signed-in team member
 * so any operator can see and answer clarification questions from running jobs.
 * Preview visitors (public, no login) are not team members — empty list for them.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (isPublicPreviewVisitor(session)) return NextResponse.json({ consultations: [] });
  return NextResponse.json({ consultations: listPendingConsultations() });
}
