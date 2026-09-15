import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getConsultation, redirectConsultation } from "@/lib/consultationStore";

/**
 * POST /api/consultations/[id]/reject
 *
 * Operator-initiated redirect: posts a redirect directive back to the waiting
 * agent so it can take a different course of action instead of the one it asked about.
 * Body: { redirectDirective: string }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  if (!getConsultation(id)) return NextResponse.json({ error: "Consultation not found." }, { status: 404 });

  let body: { redirectDirective?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const directive = typeof body.redirectDirective === "string" ? body.redirectDirective.trim() : "";
  if (!directive) {
    return NextResponse.json({ error: "redirectDirective text is required." }, { status: 400 });
  }

  const applied = redirectConsultation(id, directive, session.user.email ?? "operator");
  if (!applied) {
    return NextResponse.json({ error: "Already answered or timed out — too late." }, { status: 409 });
  }

  return NextResponse.json({ ok: true, redirectDirective: directive });
}
