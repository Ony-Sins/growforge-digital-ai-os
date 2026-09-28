import { NextResponse } from "next/server";
import { getAgent, runAgent } from "@/lib/agentStore";
import { canSessionAccessAgent } from "@/lib/security";
import { detectHandoff } from "@/lib/handoff";
import { getSession, isPublicPreviewVisitor } from "@/lib/session";

export const runtime = "nodejs";

interface RunRequestBody {
  /** Optional department or owner PIN for accessing locked agents */
  pin?: string;
  ownerPin?: string;
  /** Bypasses the hand-off suggestion for this one call (used when the
   *  user picks "run here anyway" after already seeing the suggestion). */
  skipHandoffCheck?: boolean;
  [key: string]: unknown;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // 1. Mandatory server-side authentication
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // 2. Public preview visitors are read-only and cannot execute agents
  if (isPublicPreviewVisitor(session)) {
    return NextResponse.json(
      { error: "Public preview is read-only. Sign in to execute agents." },
      { status: 403 }
    );
  }

  const { id } = await params;
  if (!getAgent(id)) {
    return NextResponse.json({ error: `Unknown agent: ${id}` }, { status: 404 });
  }

  let body: RunRequestBody = {};
  try {
    body = (await req.json()) ?? {};
  } catch {
    body = {};
  }

  const { pin, skipHandoffCheck, ...agentParams } = body;

  // 3. Authoritative server-side authorization check (never trusts self-reported role)
  const isAuthorized = canSessionAccessAgent(id, session.user.role, pin);
  if (!isAuthorized) {
    return NextResponse.json(
      { error: `${id} is locked. Enter the security key to access it.`, locked: true },
      { status: 403 }
    );
  }

  // 4. Handoff check (only applies if authorized)
  if (!skipHandoffCheck) {
    const handoff = detectHandoff(id, agentParams);
    if (handoff) {
      // Not dispatched — the agent's status/logs are untouched. The client
      // decides whether to actually run the target agent, or resubmit here
      // with skipHandoffCheck to force the original agent to run anyway.
      return NextResponse.json({ status: "hand-off", ...handoff });
    }
  }

  const { agent, log } = await runAgent(id, agentParams);
  return NextResponse.json({ status: "dispatched", agent, log });
}
