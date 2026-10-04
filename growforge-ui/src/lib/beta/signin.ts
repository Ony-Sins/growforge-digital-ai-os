import { admitTester, getTester, isBlocked, normaliseEmail } from "./store";

/** Parse a comma-separated email list env var. */
export function parseEmailList(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isOwnerAddress(email: string | null | undefined): boolean {
  if (!email) return false;
  return parseEmailList(process.env.OWNER_EMAILS).has(normaliseEmail(email));
}

export type SignInRefusalReason =
  | "provider_mismatch"
  | "email_missing"
  | "email_unverified"
  | "tester_missing"
  | "tester_frozen"
  | "tester_blocked"
  | "admit_failed"
  | "store_unavailable";

/**
 * Private-beta sign-in decision (used by the NextAuth signIn callback; unit-tested directly).
 * Google must have verified the address; then owner, or an invited, unfrozen, unblocked tester.
 * Every refusal is the same `false`, so the response never reveals whether an address is invited,
 * frozen or deleted. Store errors fail closed.
 */
export async function betaSignInDecision(input: {
  provider: string | undefined;
  email: string | null | undefined;
  emailVerified: unknown;
  name: string | null | undefined;
}): Promise<boolean> {
  const provider = input.provider?.toLowerCase();
  if (provider !== "google") {
    console.warn(`[auth] signIn refused: reason=provider_mismatch provider=${provider}`);
    return false;
  }
  if (!input.email) {
    console.warn("[auth] signIn refused: reason=email_missing");
    return false;
  }
  const email = normaliseEmail(input.email);
  if (input.emailVerified !== true) {
    console.warn(`[auth] signIn refused: reason=email_unverified emailVerified=${input.emailVerified}`);
    return false;
  }

  if (isOwnerAddress(email)) {
    console.log("[auth] signIn accepted: role=owner");
    return true;
  }

  try {
    const sv = await admitTester(email, input.name ?? null);
    if (sv === null) {
      const t = await getTester(email);
      const blocked = await isBlocked(email);
      let reason: SignInRefusalReason = "tester_missing";
      if (t?.status === "frozen") reason = "tester_frozen";
      else if (blocked) reason = "tester_blocked";
      else if (!t) reason = "tester_missing";
      else reason = "admit_failed";
      console.warn(`[auth] signIn refused: reason=${reason} hasTesterRecord=${!!t} status=${t?.status} isBlocked=${blocked}`);
      return false;
    }
    console.log(`[auth] signIn accepted: role=tester sessionVersion=${sv}`);
    return true;
  } catch (e) {
    console.error("[auth] beta store unavailable; refusing sign-in:", (e as Error).message);
    return false;
  }
}

