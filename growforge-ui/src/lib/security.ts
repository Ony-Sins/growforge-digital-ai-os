/**
 * Lightweight, client-side access gate for the GrowForge console.
 *
 * IMPORTANT — this is a soft UX gate, not real security. This app has no
 * backend auth/session system; PINs below live in the client JS bundle and
 * are visible to anyone who opens devtools or inspects network traffic.
 * It's appropriate for "don't let a casual employee poke at agents outside
 * their department" in an internal demo tool — it is NOT a substitute for
 * real server-side authentication/authorization, and must never gate
 * genuinely sensitive systems or data as-is.
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
