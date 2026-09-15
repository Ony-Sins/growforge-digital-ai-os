import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Real backend authentication gate for the GrowForge console.
 *
 * Sign-in is restricted to an explicit allowlist of GrowForge team emails
 * (AUTHORIZED_EMAILS) — Google OAuth confirms *who* someone is, this list
 * decides whether that person is allowed in at all. Anyone not on the list
 * is rejected in the `signIn` callback below, before a session is ever
 * created, so no cookie/JWT is issued to them.
 *
 * `OWNER_EMAILS` is a subset of AUTHORIZED_EMAILS granted the "owner" role
 * used by src/lib/security.ts for server-side RBAC checks. This sits
 * alongside (not instead of) the existing department-level agent PIN locks:
 * this gate decides who can open the console at all; the PIN locks remain
 * an additional layer for which agents an "employee" session can touch.
 */

function parseEmailList(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

const AUTHORIZED_EMAILS = parseEmailList(process.env.AUTHORIZED_EMAILS);
const OWNER_EMAILS = parseEmailList(process.env.OWNER_EMAILS);

export function isAuthorizedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return AUTHORIZED_EMAILS.has(email.toLowerCase());
}

export function isOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return OWNER_EMAILS.has(email.toLowerCase());
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    // Runs before a session is ever issued — the actual RBAC gate.
    async signIn({ user }) {
      if (AUTHORIZED_EMAILS.size === 0) {
        console.error(
          "[auth] AUTHORIZED_EMAILS is empty — refusing all sign-ins. Set it in .env.local.",
        );
        return false;
      }
      return isAuthorizedEmail(user.email);
    },
    async jwt({ token }) {
      token.role = isOwnerEmail(token.email) ? "owner" : "employee";
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = (token.role as "owner" | "employee") ?? "employee";
      }
      return session;
    },
  },
});
