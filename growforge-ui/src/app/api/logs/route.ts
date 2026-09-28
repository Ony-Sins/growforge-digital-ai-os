import { NextResponse } from "next/server";
import { getLogs, getLogsCount } from "@/lib/agentStore";
import { getSession, isPublicPreviewVisitor } from "@/lib/session";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (isPublicPreviewVisitor(session)) {
    return NextResponse.json({ logs: [], total: 0 });
  }
  const { searchParams } = new URL(req.url);
  const limitParam = Number(searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 50;
  const agentId = searchParams.get("agentId") ?? undefined;

  return NextResponse.json({ logs: getLogs(limit, agentId), total: getLogsCount(agentId) });
}
