import { NextResponse } from "next/server";
import { getAgent, runAgent } from "@/lib/agentStore";
import { canAccessAgentWith, isAgentLocked, type Role } from "@/lib/security";
import { detectHandoff } from "@/lib/handoff";

interface RunRequestBody {
  /** Access-control fields the client self-reports (see security.ts —
   *  there is no real server session, so this is a soft gate enforced at
   *  this one choke point every dispatch path funnels through). */
  role?: Role;
  unlockedAgentIds?: string[];
  /** Bypasses the hand-off suggestion for this one call (used when the
   *  user picks "run here anyway" after already seeing the suggestion). */
  skipHandoffCheck?: boolean;
  [key: string]: unknown;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const { role, unlockedAgentIds, skipHandoffCheck, ...agentParams } = body;

  if (isAgentLocked(id) && !canAccessAgentWith(id, role === "owner" ? "owner" : "employee", unlockedAgentIds ?? [])) {
    return NextResponse.json(
      { error: `${id} is locked. Enter the security key to access it.`, locked: true },
      { status: 403 },
    );
  }

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
