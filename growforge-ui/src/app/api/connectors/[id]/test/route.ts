import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { testConnector } from "@/lib/connectorStore";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (session.user.role !== "owner") {
    return NextResponse.json({ error: "Only owners can test connectors." }, { status: 403 });
  }

  const { id } = await params;
  const result = await testConnector(id);
  return NextResponse.json(result);
}
