import { NextResponse } from "next/server";
import { listAgents } from "@/lib/agentStore";

export async function GET() {
  return NextResponse.json({ agents: listAgents() });
}
