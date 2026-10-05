/**
 * OWNER-REVIEW MODE — local-development infrastructure only.
 *
 * Lets a UI worktree render against a sanitized, read-only PROJECTION of the primary owner's
 * state (see scripts/owner-review/) without being able to change anything. It is enabled only by
 * scripts/owner-review/launch.mjs, which also installs the filesystem write guard and strips every
 * provider credential from the process environment. Nothing here is reachable in a production build.
 */

/** True only for a development server started by the owner-review launcher. */
export function isOwnerReviewMode(): boolean {
  return process.env.GROWFORGE_OWNER_REVIEW === "1" && process.env.NODE_ENV === "development";
}

/** Methods that cannot change state. Everything else is refused in review mode. */
const SAFE_METHODS = new Set(["GET", "HEAD"]);

/**
 * Routes refused for EVERY method in review mode because even a GET executes models, spends money,
 * leaves the machine, or opens a connector. Read-only visual review does not run NORA, agents or
 * providers (explicit decision, 2026-10-05).
 */
const EXECUTION_PREFIXES = [
  "/api/router",
  "/api/nora",
  "/api/gemini",
  "/api/geo",
  "/api/mcp/connect",
  "/api/beta",
  "/api/vault/system/n8n", // /health is an allowed probe, see below
];
const ALWAYS_ALLOWED = new Set(["/api/vault/system/n8n/health"]);

export interface OwnerReviewDecision {
  allowed: boolean;
  reason?: "method" | "execution";
}

export function ownerReviewDecision(pathname: string, method: string): OwnerReviewDecision {
  if (!SAFE_METHODS.has(method.toUpperCase())) return { allowed: false, reason: "method" };
  if (ALWAYS_ALLOWED.has(pathname)) return { allowed: true };
  if (EXECUTION_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return { allowed: false, reason: "execution" };
  }
  return { allowed: true };
}

export function ownerReviewRefusalBody(reason: OwnerReviewDecision["reason"]) {
  return {
    error: "owner_review_read_only",
    message:
      reason === "execution"
        ? "Owner-review mode: this action runs models, providers or connectors and is disabled. This instance is for reading and inspecting only."
        : "Owner-review mode: this instance is read-only. State-changing requests are refused; the primary owner data is untouched.",
  };
}
