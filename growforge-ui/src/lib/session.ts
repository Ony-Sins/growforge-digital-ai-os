import { auth } from "@/auth";
import type { Session } from "next-auth";

/**
 * Centralized, server-enforced PUBLIC PREVIEW isolation boundary.
 *
 * When PUBLIC_PREVIEW_MODE is active ("true"), the entire deployment behaves as a
 * clean, isolated new-user installation:
 * - Anonymous visitors AND authenticated owners both receive an isolated fresh experience.
 * - Real owner account stores, vaults, memory, jobs, and private models are structurally inaccessible.
 * - All credential-backed operations, owner gates, and mutations fail closed.
 */
export function isPublicPreviewMode(): boolean {
  return process.env.PUBLIC_PREVIEW_MODE === "true" || process.env.NEXT_PUBLIC_PREVIEW_MODE === "true";
}

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
    const devEmail = process.env.OWNER_EMAILS?.split(",")[0]?.trim() || "dev@localhost";
    return {
      user: { name: "Dev (local)", email: devEmail, image: null, role: "owner" },
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

