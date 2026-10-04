import { notFound } from "next/navigation";
import { getSession, isBetaOwner } from "@/lib/session";
import { BetaAdminPanel } from "./BetaAdminPanel";

export const dynamic = "force-dynamic";

/** Owner-only tester management. Non-owners get a plain 404 (also enforced in the proxy). */
export default async function BetaAdminPage() {
  const session = await getSession();
  if (!isBetaOwner(session)) notFound();
  return <BetaAdminPanel ownerEmail={session!.user.email ?? ""} />;
}
