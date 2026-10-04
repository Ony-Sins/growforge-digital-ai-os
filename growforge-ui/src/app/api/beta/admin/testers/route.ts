import { NextResponse } from "next/server";
import { getSession, isBetaOwner } from "@/lib/session";
import { isBetaMode } from "@/lib/beta/access";
import { betaStoreBackend, deleteTester, freezeTester, getConversation, getFeedback, inviteTester, listTesters, normaliseEmail, revokeSessions, unfreezeTester } from "@/lib/beta/store";
import { isOwnerEmail } from "@/auth";

/**
 * Owner-only tester administration. The proxy already hides this route from non-owners (404); the
 * handler re-checks independently so a routing mistake can never expose it.
 */

const notFound = () => NextResponse.json({ error: "Not found." }, { status: 404 });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function ownerGate() {
  if (!isBetaMode()) return false;
  return isBetaOwner(await getSession());
}

export async function GET(req: Request) {
  if (!(await ownerGate())) return notFound();
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const testers = await listTesters(q);
  const detail = await Promise.all(
    testers.map(async (t) => ({ ...t, conversationCount: (await getConversation(t.email)).length, feedbackCount: (await getFeedback(t.email)).length })),
  );
  return NextResponse.json({ testers: detail, backend: betaStoreBackend() });
}

type Action = "invite" | "freeze" | "unfreeze" | "revokeSessions" | "revoke" | "delete";

export async function POST(req: Request) {
  if (!(await ownerGate())) return notFound();
  let body: { action?: Action; email?: string; confirm?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  const email = typeof body.email === "string" ? normaliseEmail(body.email) : "";
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  if (isOwnerEmail(email)) return NextResponse.json({ error: "Owner accounts are managed via OWNER_EMAILS, not here." }, { status: 400 });

  switch (body.action) {
    case "invite":
      return NextResponse.json({ ok: true, tester: await inviteTester(email) });
    case "freeze":
      return NextResponse.json({ ok: true, tester: await freezeTester(email) });
    case "unfreeze":
      return NextResponse.json({ ok: true, tester: await unfreezeTester(email) });
    case "revokeSessions":
      return NextResponse.json({ ok: true, tester: await revokeSessions(email) });
    case "revoke":
    case "delete": {
      // Destructive: the owner must type the address back as confirmation.
      if (normaliseEmail(body.confirm ?? "") !== email) {
        return NextResponse.json({ error: "Confirmation does not match the email address." }, { status: 400 });
      }
      return NextResponse.json({ ok: true, ...(await deleteTester(email)) });
    }
    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
}
