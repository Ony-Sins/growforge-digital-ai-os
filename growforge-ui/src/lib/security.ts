/**
 * Department-level agent PIN gate for the GrowForge console.
 *
 * This is a secondary, soft UX layer — not the real security boundary.
 * The real boundary is middleware.ts + src/auth.ts: every request (pages
 * and API routes alike) is rejected before it reaches any app code unless
 * it carries a session for a Google account on the AUTHORIZED_EMAILS
 * allowlist. What's below only decides which *already-authenticated*
 * GrowForge team member can touch which agent, the same way a shared
 * office might still keep certain doors keyed even though the building
 * itself requires a badge. PINs live in the client JS bundle and are
 * visible in devtools — fine for "don't let a teammate outside this
 * department poke at this agent," not a substitute for the outer
 * authentication gate.
 */

export type Role = "owner" | "employee";

export const DEFAULT_OWNER_PIN = "0000";

/** Agent id -> PIN, for agents locked to a specific department. Add an
 *  entry here to lock any additional agent. */
export const AGENT_LOCKS: Record<string, string> = {
  "whimsy-injector": "1234",
  "ui-finish-gate-reviewer": "5678",
};

export function isAgentLocked(agentId: string): boolean {
  return agentId in AGENT_LOCKS;
}

export function verifyAgentPin(agentId: string, pin: string): boolean {
  return AGENT_LOCKS[agentId] === pin.trim();
}

export function verifyOwnerPin(pin: string): boolean {
  return pin.trim() === DEFAULT_OWNER_PIN;
}

/** Shared by the client (appState) and the run API route (server) so both
 *  sides agree on exactly one definition of "can this session touch this
 *  agent". There is no real server session here — the client self-reports
 *  its role/unlocked list on each dispatch request — so this is still a
 *  soft gate, but it's now enforced at the one server-side choke point
 *  every dispatch path (panel, terminal, chat router) funnels through,
 *  rather than only at the UI layer. */
export function canAccessAgentWith(agentId: string, role: Role, unlockedAgentIds: readonly string[]): boolean {
  return role === "owner" || !isAgentLocked(agentId) || unlockedAgentIds.includes(agentId);
}
