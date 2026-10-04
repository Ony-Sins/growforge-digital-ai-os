import { redirect } from "next/navigation";
import { getSession, isBetaOwner, isBetaTester } from "@/lib/session";
import { BetaTesterSettings } from "./BetaTesterSettings";

export const dynamic = "force-dynamic";

export default async function BetaSettingsPage() {
  const session = await getSession();
  if (!isBetaTester(session) && !isBetaOwner(session)) {
    redirect("/login");
  }

  return <BetaTesterSettings testerEmail={session?.user?.email ?? "tester@growforge.ai"} />;
}
