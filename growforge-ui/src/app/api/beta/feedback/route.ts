import { NextResponse } from "next/server";
import { getSession, isBetaTester, isBetaOwner } from "@/lib/session";
import { isBetaMode } from "@/lib/beta/access";
import { addFeedback, getTester } from "@/lib/beta/store";

/** Private beta: a tester leaves feedback for the team. Stored under their account only. */
export async function POST(req: Request) {
  if (!isBetaMode()) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const session = await getSession();
  if (!isBetaTester(session) && !isBetaOwner(session)) {
    return NextResponse.json({ error: "Unauthorized — sign in required." }, { status: 401 });
  }

  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "Authenticated session has no email." }, { status: 400 });
  }

  if (isBetaTester(session)) {
    const tester = await getTester(email);
    if (!tester || tester.status === "frozen") {
      return NextResponse.json({ error: "Account is frozen or unavailable.", code: "tester_frozen" }, { status: 403 });
    }
  }

  let message = "";
  let category = "feedback";
  let page = "";

  try {
    const body = (await req.json()) as {
      message?: unknown;
      category?: unknown;
      page?: unknown;
    };
    message = typeof body.message === "string" ? body.message.trim() : "";
    if (typeof body.category === "string" && body.category.trim()) {
      category = body.category.trim().slice(0, 30);
    }
    if (typeof body.page === "string" && body.page.trim()) {
      page = body.page.trim().slice(0, 100);
    }
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  if (!message) return NextResponse.json({ error: "message is required." }, { status: 400 });

  const formattedMessage = `[${category.toUpperCase()}] ${message}${page ? ` (Page: ${page})` : ""}`;
  const f = await addFeedback(email, formattedMessage);
  return NextResponse.json({ ok: true, success: true, id: f.id, feedback: f });
}

