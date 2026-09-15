import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * Single server-side access-control choke point. Every request — pages,
 * API routes, everything except the exclusions in `config.matcher` below —
 * passes through here before it reaches app code. Unauthenticated requests
 * never reach the backend, workflow canvas, or agent-run API: this is what
 * actually hides them from anyone outside the AUTHORIZED_EMAILS allowlist
 * (see src/auth.ts), unlike the old client-side PIN gate.
 */
export default auth((req) => {
  // Dev-only bypass, hard-gated to NODE_ENV==="development" (see
  // src/lib/session.ts for the matching bypass used by page/route handlers)
  // — structurally unreachable in a production build.
  const isLoggedIn = !!req.auth || process.env.NODE_ENV === "development";
  const { pathname } = req.nextUrl;

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
