import { NextResponse } from "next/server";
import { getLogs } from "@/lib/agentStore";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limitParam = Number(searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 50;
  const agentId = searchParams.get("agentId") ?? undefined;

  return NextResponse.json({ logs: getLogs(limit, agentId) });
}
