import { NextResponse } from "next/server";
import { getSession, isPublicPreviewVisitor } from "@/lib/session";
import { getJob } from "@/lib/jobStore";
import { summarizeUsage, type UsageRecord } from "@/lib/usage";

export const runtime = "nodejs";

/** Returns aggregated usage data for a finished (or running) job —
 *  per-step breakdown and per-provider totals with estimated costs. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (isPublicPreviewVisitor(session)) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  const { id } = await params;
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  // Collect all usage records from all steps
  const allRecords: UsageRecord[] = [];
  const stepUsage: { stepId: string; stepLabel: string; records: UsageRecord[] }[] = [];

  for (const step of job.steps) {
    const records = step.usage ?? [];
    if (records.length > 0) {
      stepUsage.push({ stepId: step.id, stepLabel: step.label, records });
      allRecords.push(...records);
    }
  }

  const summary = summarizeUsage(allRecords);

  return NextResponse.json({
    jobId: job.id,
    jobTitle: job.title,
    jobStatus: job.status,
    stepUsage,
    summary,
  });
}
