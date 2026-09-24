import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GrowForge CORE — Live Execution",
  description: "One brief in, a whole agency's work out: HQ plan, live research, parallel departments, review and QA — read live from the running system.",
};

export default async function CorePage({ searchParams }: { searchParams: Promise<{ job?: string; warp?: string }> }) {
  await getSession();
  const { job } = await searchParams;
  const qs = job ? `&job=${encodeURIComponent(job)}` : "";
  redirect(`/?tier=core${qs}`);
}
