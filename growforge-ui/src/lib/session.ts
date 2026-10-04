import { auth } from "@/auth";
import type { Session } from "next-auth";
import { isBetaMode } from "@/lib/beta/access";
import { isPublicPreviewMode } from "@/lib/previewMode";

/**
 * Centralized, server-enforced PUBLIC PREVIEW isolation boundary.
 *
 * When PUBLIC_PREVIEW_MODE is active ("true"), the entire deployment behaves as a
 * clean, isolated new-user installation:
 * - Anonymous visitors AND authenticated owners both receive an isolated fresh experience.
 * - Real owner account stores, vaults, memory, jobs, and private models are structurally inaccessible.
 * - All credential-backed operations, owner gates, and mutations fail closed.
 */
export { isPublicPreviewMode };

function publicPreviewSession(): Session {
  return {
    user: { name: "Operator", email: "preview@growforge.local", image: null, role: "employee" },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

/**
 * Session accessor with centralized preview isolation and development auto-login bypass.
 *
 * In PUBLIC_PREVIEW_MODE, this ALWAYS returns the isolated preview session regardless
 * of client credentials or cookies, guaranteeing no owner escalation is possible.
 */
export async function getSession(): Promise<Session | null> {
  // Private beta: only a real, re-validated Google session counts. No anonymous preview identity and no
  // development auto-login, so signed-out, uninvited, frozen and deleted users genuinely have no session.
  if (isBetaMode()) {
    try {
      return (await auth()) ?? null;
    } catch {
      return null;
    }
  }
  if (isPublicPreviewMode()) {
    return publicPreviewSession();
  }

  try {
    const real = await auth();
    if (real) return real;
  } catch {
    // Outside of Next.js request scope (e.g. standalone test scripts)
  }

  if (process.env.NODE_ENV === "development") {
    const devEmail = process.env.DEV_SESSION_EMAIL || process.env.OWNER_EMAILS?.split(",")[0]?.trim() || "dev@localhost";
    const devRole = (process.env.DEV_SESSION_ROLE as "owner" | "employee" | "tester") || "owner";
    return {
      user: { name: "Dev (local)", email: devEmail, image: null, role: devRole },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  return null;
}

/**
 * True for any public preview context (anonymous visitor or preview deployment).
 */
export function isPublicPreviewVisitor(session: Session | null): boolean {
  if (isPublicPreviewMode()) return true;
  return session?.user?.email === "preview@growforge.local";
}

/**
 * True ONLY if the session represents an authoritative owner in a non-preview environment.
 * Rejects anonymous requests, public preview visitors, preview deployment modes, and non-owner employees.
 */
export function isOwnerSession(session: Session | null): boolean {
  if (isPublicPreviewMode()) return false;
  if (!session?.user) return false;
  if (isPublicPreviewVisitor(session)) return false;
  return session.user.role === "owner";
}


/** Private beta: the verified owner (OWNER_EMAILS + Google-verified, re-checked per request in auth.ts). */
export function isBetaOwner(session: Session | null): boolean {
  return isBetaMode() && session?.user?.role === "owner";
}

/** Private beta: a signed-in, currently valid tester. */
export function isBetaTester(session: Session | null): boolean {
  return isBetaMode() && session?.user?.role === "tester";
}
