"use client";

/** Shared incumbent S1 launch contract. The server owns execution and authorization. */
export async function createMission(brief: string): Promise<string> {
  const response = await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brief }) });
  const body: { error?: string; job?: { id: string } } = await response.json();
  if (!response.ok || !body.job) throw new Error(body.error || "Mission creation failed.");
  return body.job.id;
}
