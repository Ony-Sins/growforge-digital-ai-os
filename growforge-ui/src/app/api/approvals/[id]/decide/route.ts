import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { decideApproval, getApproval } from "@/lib/approvalStore";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  if (!getApproval(id)) return NextResponse.json({ error: "Approval not found." }, { status: 404 });

  let body: { decision?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  if (body.decision !== "approved" && body.decision !== "denied") {
    return NextResponse.json({ error: 'decision must be "approved" or "denied".' }, { status: 400 });
  }

  const applied = decideApproval(id, body.decision, session.user.email ?? "owner");
  if (!applied) {
    return NextResponse.json({ error: "Already decided or timed out — too late." }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
