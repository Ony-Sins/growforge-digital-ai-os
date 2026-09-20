import { NextResponse } from "next/server";
import { getSession, isPublicPreviewVisitor } from "@/lib/session";
import { answerConsultation, getConsultation } from "@/lib/consultationStore";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (isPublicPreviewVisitor(session)) {
    return NextResponse.json(
      { error: "Public preview is read-only. Sign in to answer an agent consultation." },
      { status: 403 },
    );
  }

  const { id } = await params;
  if (!getConsultation(id)) return NextResponse.json({ error: "Consultation not found." }, { status: 404 });

  let body: { answer?: string; editedPayload?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const answer = typeof body.answer === "string" ? body.answer.trim() : "";
  if (!answer) {
    return NextResponse.json({ error: "Answer text is required." }, { status: 400 });
  }

  const applied = answerConsultation(id, answer, session.user.email ?? "operator", body.editedPayload);
  if (!applied) {
    return NextResponse.json({ error: "Already answered or timed out — too late." }, { status: 409 });
  }

  return NextResponse.json({ ok: true, answer, editedPayload: body.editedPayload });
}
