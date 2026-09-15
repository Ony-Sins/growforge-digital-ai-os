import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { CLOUD_PROVIDERS, testProvider, type CloudProvider } from "@/lib/llm";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (session.user.role !== "owner") {
    return NextResponse.json({ error: "Only owners can test integrations." }, { status: 403 });
  }

  let body: { provider?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const provider = body.provider;
  if (!provider || !(provider in CLOUD_PROVIDERS)) {
    return NextResponse.json({ error: "Unknown provider." }, { status: 400 });
  }

  const result = await testProvider(provider as CloudProvider);
  return NextResponse.json(result);
}
