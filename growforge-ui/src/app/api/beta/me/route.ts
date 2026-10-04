import { NextResponse } from "next/server";
import { getSession, isBetaOwner, isBetaTester } from "@/lib/session";
import { isBetaMode } from "@/lib/beta/access";

/** Private beta: who am I (role only - used by the demo banner and the owner's admin link). */
export async function GET() {
  if (!isBetaMode()) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const session = await getSession();
  if (!isBetaTester(session) && !isBetaOwner(session)) {
    return NextResponse.json({ error: "Unauthorized — sign in required." }, { status: 401 });
  }
  return NextResponse.json({ role: session!.user.role, email: session!.user.email, demo: true });
}
