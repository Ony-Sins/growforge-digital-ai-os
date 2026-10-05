import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isBetaMode, isOwnerOnlyPath, testerMayAccess } from "@/lib/beta/access";
import { isOwnerReviewMode, ownerReviewDecision, ownerReviewRefusalBody } from "@/lib/ownerReview";

/**
 * Single server-side access-control choke point. Every request — pages,
 * API routes, everything except the exclusions in `config.matcher` below —
 * passes through here before it reaches app code. Unauthenticated requests
 * never reach the backend, workflow canvas, or agent-run API: this is what
 * actually hides them from anyone outside the AUTHORIZED_EMAILS allowlist
 * (see src/auth.ts), unlike the old client-side PIN gate.
 */
export default auth((req) => {
  const { pathname } = req.nextUrl;

  // ---- Owner-review mode (local dev only, set by scripts/owner-review/launch.mjs): read-only
  // projection of owner state. Refuses every state-changing request and every route that executes
  // models/providers, before any app code runs. Defense in depth with the fs write guard.
  if (isOwnerReviewMode()) {
    const decision = ownerReviewDecision(pathname, req.method);
    if (!decision.allowed) {
      return NextResponse.json(ownerReviewRefusalBody(decision.reason), { status: 403 });
    }
  }

  // ---- Private beta (BETA_MODE=true). No dev bypass and no anonymous preview identity here: the
  // session is real, and auth.ts re-validates it against the beta store on this very request, so a
  // frozen / revoked / deleted tester arrives with no session at all.
  if (isBetaMode()) {
    const role = req.auth?.user?.role;
    const isPublic = pathname === "/login" || pathname.startsWith("/api/auth");
    if (isPublic) {
      if (role && pathname === "/login") return NextResponse.redirect(new URL("/", req.nextUrl.origin));
      return NextResponse.next();
    }
    if (role !== "owner" && role !== "tester") {
      if (pathname.startsWith("/api")) return NextResponse.json({ error: "Unauthorized — sign in required." }, { status: 401 });
      return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
    }
    // Owner-only surfaces are indistinguishable from nonexistent routes for everyone else.
    if (isOwnerOnlyPath(pathname)) {
      return role === "owner" ? NextResponse.next() : NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    // NORA's chat endpoint is served by the isolated demo responder: no model call, no spend, no
    // access to private context. The UI is unchanged; only the server behind the URL differs.
    if (pathname === "/api/router") {
      const targetUrl = new URL("/api/beta/chat", req.nextUrl.origin);
      targetUrl.search = req.nextUrl.search;
      return NextResponse.rewrite(targetUrl);
    }
    // Everything else: the beta deployment is not the private workspace, for the owner as well.
    if (!testerMayAccess(pathname, req.method)) {
      if (pathname.startsWith("/api")) {
        return NextResponse.json({ error: "Not available in the GrowForge private beta." }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/", req.nextUrl.origin));
    }
    return NextResponse.next();
  }

  // Dev-only bypass, hard-gated to NODE_ENV==="development" (see
  // src/lib/session.ts for the matching bypass used by page/route handlers)
  // — structurally unreachable in a production build. PUBLIC_PREVIEW_MODE
  // is the separate, deliberate, production-reachable bypass — see
  // session.ts's publicPreviewSession() comment for what it is and why;
  // remove both together when it's time to turn this off.
  const isPreview = process.env.PUBLIC_PREVIEW_MODE === "true" || process.env.NEXT_PUBLIC_PREVIEW_MODE === "true";
  const isLoggedIn = !!req.auth || process.env.NODE_ENV === "development" || isPreview;

  const isPublic = pathname === "/login" || pathname.startsWith("/api/auth");
  if (isPublic) {
    if (isLoggedIn && pathname === "/login") {
      return NextResponse.redirect(new URL("/", req.nextUrl.origin));
    }
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized — sign in required." }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.png|.*\\.png$).*)"],
};
