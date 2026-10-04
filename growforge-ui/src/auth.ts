import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isBetaMode } from "@/lib/beta/access";
import { getTester, isBlocked } from "@/lib/beta/store";
import { betaSignInDecision } from "@/lib/beta/signin";

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
    async signIn({ user, account, profile }) {
      if (isBetaMode()) {
        // Private beta: Google must have verified the address; then owner, or an invited, unfrozen,
        // unblocked tester. Every refusal returns the same generic AccessDenied, so the response never
        // reveals whether an address is invited, frozen or deleted (no account enumeration).
        return betaSignInDecision({ provider: account?.provider, email: user.email, emailVerified: profile?.email_verified, name: user.name });
      }
      if (AUTHORIZED_EMAILS.size === 0) {
        console.error(
          "[auth] AUTHORIZED_EMAILS is empty — refusing all sign-ins. Set it in .env.local.",
        );
        return false;
      }
      return isAuthorizedEmail(user.email);
    },
    async jwt({ token, trigger, user }) {
      if (isBetaMode()) {
        // Re-validated on EVERY request (the proxy resolves the session per request): a frozen, revoked
        // or deleted tester - or one whose sessions were revoked - is signed out immediately, because
        // returning null clears the session cookie. Store errors fail closed the same way.
        if (isOwnerEmail(token.email)) {
          token.role = "owner";
          return token;
        }
        if (!token.email) {
          console.warn("[auth] jwt refused: reason=token_email_missing");
          return null;
        }
        try {
          const t = await getTester(token.email);
          if (!t) {
            console.warn("[auth] jwt refused: reason=tester_missing");
            return null;
          }
          if (t.status === "frozen") {
            console.warn("[auth] jwt refused: reason=tester_frozen");
            return null;
          }
          if (await isBlocked(token.email)) {
            console.warn("[auth] jwt refused: reason=tester_blocked");
            return null;
          }
          // The version is stamped on initial sign-in turn (when user is present, or when sv is not yet stamped);
          // any subsequent token must strictly match the store's current sessionVersion.
          if (user || trigger === "signIn" || token.sv === undefined) {
            token.sv = t.sessionVersion;
          }
          if (token.sv !== t.sessionVersion) {
            console.warn(`[auth] jwt refused: reason=session_version_mismatch tokenSv=${token.sv} storeSv=${t.sessionVersion}`);
            return null;
          }
          token.role = "tester";
          return token;
        } catch (e) {
          console.error("[auth] jwt error in beta check:", (e as Error).message);
          return null;
        }
      }
      token.role = isOwnerEmail(token.email) ? "owner" : "employee";
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = (token.role as "owner" | "employee" | "tester") ?? "employee";
      }
      return session;
    },
  },
});
