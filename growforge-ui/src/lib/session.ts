import { auth } from "@/auth";
import type { Session } from "next-auth";

/**
 * PUBLIC_PREVIEW_MODE — a deliberate, temporary, production-reachable
 * bypass of the Google-login wall, unlike the dev-only bypass below (which
 * is structurally unreachable in a deployed build). Requested explicitly
 * by the owner to keep the pre-release deployment openly reachable
 * (Google OAuth isn't configured on Vercel yet) until it's officially
 * released. Grants "employee", never "owner" — the in-app owner PIN unlock
 * (src/lib/security.ts) still gates owner-only actions even with the login
 * wall down, so this doesn't also bypass that second layer.
 *
 * REMOVE THIS — delete this env var in Vercel, or delete this block — once
 * either real Google OAuth is configured or the product actually launches.
 * Grep for PUBLIC_PREVIEW_MODE (also referenced in src/proxy.ts) to find
 * every place this needs to go when it's time to turn it off.
 */
function publicPreviewSession(): Session {
  return {
    user: { name: "Preview", email: "preview@growforge.local", image: null, role: "employee" },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

/**
 * Session accessor with a development-only auto-login bypass, so the app
 * can be previewed locally before Google OAuth credentials are set up
 * (see src/auth.ts / .env.local).
 *
 * IMPORTANT: the dev-only bypass branch is hard-gated on
 * `process.env.NODE_ENV === "development"`. Next.js sets NODE_ENV to
 * "production" for every `next build` / `next start` — there is no env
 * var, flag, or config toggle that changes this in a production build, so
 * that branch is structurally unreachable outside `next dev`, not just
 * unlikely. It's safe to leave in place indefinitely; it can never fire in
 * a deployed instance. PUBLIC_PREVIEW_MODE (above) is the separate,
 * explicit toggle that *can* fire in a deployed instance — see its own
 * comment for why that's safe to reason about.
 *
 * Every server-side call site that needs the current session — page.tsx,
 * every API route's owner-only gate — goes through this function instead
 * of calling `auth()` directly, so both bypasses apply consistently
 * everywhere, not just at the login screen.
 */
export async function getSession(): Promise<Session | null> {
  const real = await auth();
  if (real) return real;

  if (process.env.PUBLIC_PREVIEW_MODE === "true") {
    return publicPreviewSession();
  }

  if (process.env.NODE_ENV === "development") {
    const devEmail = process.env.OWNER_EMAILS?.split(",")[0]?.trim() || "dev@localhost";
    return {
      user: { name: "Dev (local)", email: devEmail, image: null, role: "owner" },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  return null;
}

/** True for an anonymous PUBLIC_PREVIEW_MODE visitor — never the real owner
 *  (real Google login) and never the dev-local bypass. Earlier work made
 *  every authenticated session (including this one) able to freely *read*
 *  connected MCP servers, vault/provider status, and Brain telemetry
 *  (state.md §16, 2026-09-19) — reasonable for a real logged-in employee,
 *  but combined with this synthetic no-login session it meant any stranger
 *  visiting the public Vercel URL saw the owner's actual connected agents
 *  and credentials-configured state. Read routes exposing that data must
 *  check this and return an empty/demo shape instead of the real one for
 *  this session, rather than gating on `role` alone. */
export function isPublicPreviewVisitor(session: Session | null): boolean {
  return session?.user?.email === "preview@growforge.local";
}
