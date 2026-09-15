import { auth } from "@/auth";
import type { Session } from "next-auth";

/**
 * Session accessor with a development-only auto-login bypass, so the app
 * can be previewed locally before Google OAuth credentials are set up
 * (see src/auth.ts / .env.local).
 *
 * IMPORTANT: the bypass branch is hard-gated on `process.env.NODE_ENV ===
 * "development"`. Next.js sets NODE_ENV to "production" for every `next
 * build` / `next start` — there is no env var, flag, or config toggle that
 * changes this in a production build, so the branch below is structurally
 * unreachable outside `next dev`, not just unlikely. It's safe to leave in
 * place indefinitely; it can never fire in a deployed instance.
 *
 * Every server-side call site that needs the current session — page.tsx,
 * every API route's owner-only gate — goes through this function instead
 * of calling `auth()` directly, so the bypass applies consistently
 * everywhere, not just at the login screen.
 */
export async function getSession(): Promise<Session | null> {
  const real = await auth();
  if (real) return real;

  if (process.env.NODE_ENV === "development") {
    const devEmail = process.env.OWNER_EMAILS?.split(",")[0]?.trim() || "dev@localhost";
    return {
      user: { name: "Dev (local)", email: devEmail, image: null, role: "owner" },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  return null;
}
