/**
 * Private-beta access policy (BETA_MODE=true). Pure functions - shared by the proxy, auth callbacks and
 * route handlers, so there is one definition of who may reach what.
 *
 * Model:
 *  - owner  : an OWNER_EMAILS address with a verified Google identity. Administers testers.
 *  - tester : an owner-invited address. Sees the demo interface over clearly labelled demo data only.
 *
 * Isolation is layered, and the first layer is structural: BETA_MODE turns on the existing preview
 * isolation (src/lib/session.ts isPublicPreviewMode), so every data route serves the fresh, isolated
 * new-install experience and every owner gate fails closed. On top of that the proxy lets a tester
 * reach ONLY the routes below; everything else - agent execution, jobs, spending, vault, connectors,
 * MCP, memory, uploads, profile writes, logs - is refused on the server before any handler runs.
 */

export function isBetaMode(): boolean {
  return process.env.BETA_MODE === "true";
}

export type BetaRole = "owner" | "tester";

/** Page paths a tester may open (prefix match on "/x" and "/x/..."; "/" exact). */
const TESTER_PAGES = ["/", "/beta"];

/**
 * Read-only API routes a tester may call. Each is served by the isolated preview data path (verified by
 * scripts/verify_beta_access.mjs, which checks the responses for the owner's private strings).
 */
const TESTER_API_GET = ["/api/spatial/graph", "/api/spatial/telemetry", "/api/core/state", "/api/telemetry", "/api/agents"];

/** Beta self-service routes (the handlers re-check the session themselves). */
const TESTER_API_ANY = ["/api/beta/chat", "/api/beta/feedback", "/api/beta/me", "/api/beta/byok"];

const matches = (pathname: string, base: string) => pathname === base || pathname.startsWith(base + "/");

export function testerMayAccess(pathname: string, method: string): boolean {
  if (pathname.startsWith("/api/")) {
    if (TESTER_API_ANY.some((b) => matches(pathname, b))) return true;
    if (method === "GET" || method === "HEAD") return TESTER_API_GET.some((b) => pathname === b);
    return false;
  }
  if (pathname === "/") return true;
  return TESTER_PAGES.filter((p) => p !== "/").some((b) => matches(pathname, b)) && !pathname.startsWith("/beta/admin");
}

/** Owner-only surfaces. Non-owners get a 404, so their existence is not disclosed. */
export function isOwnerOnlyPath(pathname: string): boolean {
  return matches(pathname, "/beta/admin") || matches(pathname, "/api/beta/admin");
}
