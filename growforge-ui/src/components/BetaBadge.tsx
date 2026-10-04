import { isBetaMode } from "@/lib/beta/access";
import { getSession } from "@/lib/session";
import { BetaBadgeClient } from "./BetaBadgeClient";

/**
 * Private beta: a persistent label that the interface is running on demo data + feedback trigger.
 * Rendered only in BETA_MODE and only for a signed-in beta session.
 */
export async function BetaBadge() {
  if (!isBetaMode()) return null;
  const session = await getSession();
  const role = session?.user?.role;
  if (role !== "tester" && role !== "owner") return null;
  return <BetaBadgeClient role={role} />;
}

