import { NextResponse } from "next/server";
import { listMcpServers } from "@/lib/mcp/store";
import { listJobSummaries } from "@/lib/jobStore";
import { listAiModels } from "@/lib/aiModelStore";
import { telemetryStore } from "@/lib/telemetryStore";
import { listPendingApprovals } from "@/lib/approvalStore";

export async function GET() {
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
    const activeJobs = jobs.filter((j) => j.status === "running");
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
