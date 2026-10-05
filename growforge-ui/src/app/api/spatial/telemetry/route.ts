import { NextResponse } from "next/server";
import { listMcpServers } from "@/lib/mcp/store";
import { listJobSummaries } from "@/lib/jobStore";
import { listAiModels } from "@/lib/aiModelStore";
import { telemetryStore } from "@/lib/telemetryStore";
import { listPendingApprovals } from "@/lib/approvalStore";
import { getSession, isPublicPreviewVisitor, isOwnerSession } from "@/lib/session";
import { isOwnerReviewMode } from "@/lib/ownerReview";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  // Public preview visitors and non-owners get a clean, non-sensitive demo telemetry shape —
  // real private jobs, configured MCP servers, and models are protected.
  if (isPublicPreviewVisitor(session) || !isOwnerSession(session)) {
    return NextResponse.json({
      ok: true,
      data: {
        activeJobCount: 0,
        totalJobCount: 0,
        pendingApprovals: 0,
        recentJobs: [],
        mcp: {
          totalConnected: 0,
          servers: [],
          connectors: {
            slack: { connected: false, name: "Slack" },
            notion: { connected: false, name: "Notion" },
            hubspot: { connected: false, name: "HubSpot" },
          },
        },
        models: {
          totalConfigured: 0,
          active: [],
        },
        telemetry: {
          executionState: "idle",
          activeJobId: null,
          activeLobe: "core",
        },
      },
      timestamp: new Date().toISOString(),
    });
  }

  try {
    // Real MCP connectors
    const mcpServers = await listMcpServers();
    const mcpSummaries = mcpServers.map((s) => ({
      id: s.id,
      name: s.name,
      catalogId: s.catalogId,
      transport: s.transport,
      toolCount: s.detectedTools?.length ?? 0,
      tools: s.detectedTools ?? [],
    }));

    // Specific key catalog connectors (Slack, Notion, HubSpot)
    const slackConnected = mcpServers.some((s) => s.catalogId === "slack" || s.id.includes("slack"));
    const notionConnected = mcpServers.some((s) => s.catalogId === "notion" || s.id.includes("notion"));
    const hubspotConnected = mcpServers.some((s) => s.catalogId === "hubspot" || s.id.includes("hubspot"));

    // Real jobs
    const jobs = listJobSummaries();
    // `activeJobCount` drives the CORE's "executing" visual state and the greeting. Owner-review mode shows another
    // server's persisted state and runs nothing, so a persisted "running" job is listed but is never "executing" here.
    const activeJobs = isOwnerReviewMode() ? [] : jobs.filter((j) => j.status === "running");
    const recentJobs = jobs.slice(0, 5).map((j) => ({
      id: j.id,
      title: j.title || "Execution Project",
      status: j.status,
      currentStep: j.activeStep ?? (j.status === "done" ? "Completed" : "Queued"),
      percent: j.percent,
      createdAt: j.createdAt,
    }));

    // Real AI Models
    const models = await listAiModels();
    const activeModels = models.map((m) => ({
      id: m.id,
      name: m.name,
      provider: m.providerType,
      isPrimary: m.isPrimary ?? false,
      status: m.status ?? "active",
      latencyMs: m.lastLatencyMs ?? null,
    }));

    // Real Telemetry
    const telemetry = telemetryStore.getSnapshot(mcpServers.length);

    return NextResponse.json({
      ok: true,
      data: {
        activeJobCount: activeJobs.length,
        totalJobCount: jobs.length,
        pendingApprovals: listPendingApprovals().length,
        recentJobs,
        mcp: {
          totalConnected: mcpServers.length,
          servers: mcpSummaries,
          connectors: {
            slack: { connected: slackConnected, name: "Slack" },
            notion: { connected: notionConnected, name: "Notion" },
            hubspot: { connected: hubspotConnected, name: "HubSpot" },
          },
        },
        models: {
          totalConfigured: models.length,
          active: activeModels,
        },
        telemetry: {
          executionState: telemetry.executionState,
          activeJobId: telemetry.activeJobId,
          activeLobe: telemetry.activeLobe,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[api/spatial/telemetry] Error loading spatial telemetry:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load telemetry" },
      { status: 500 }
    );
  }
}
