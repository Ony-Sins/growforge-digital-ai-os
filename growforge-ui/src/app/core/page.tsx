import React from "react";
import { getSession } from "@/lib/session";
import { CorePipelinePage } from "@/components/core/CorePipelinePage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GrowForge CORE — Live Execution",
  description: "One brief in, a whole agency's work out: HQ plan, live research, parallel departments, review and QA — read live from the running system.",
};

export default async function CorePage({ searchParams }: { searchParams: Promise<{ job?: string; warp?: string }> }) {
  await getSession();
  const { job, warp } = await searchParams;

  return <CorePipelinePage initialJobId={job ?? null} warp={warp === "1"} />;
}
