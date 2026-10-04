import {
  DEPARTMENT_TAXONOMY,
  OVERSIGHT_TAXONOMY,
  CanonicalDepartmentId,
  DepartmentTaxon,
} from "@/lib/departmentTaxonomy";
import { getJob, listJobSummaries, Job, JobStep } from "@/lib/jobStore";
import { telemetryStore, TelemetrySnapshot } from "@/lib/telemetryStore";
import { isPublicPreviewMode } from "@/lib/session";

/**
 * DIVE IN Backend Domain Models
 *
 * Provides real structural topology, node/subnode relationships,
 * truthful execution events, and directional data-packet streams
 * for the DIVE IN close-scale neural network experience.
 */

export interface DiveSubnode {
  id: string;
  parentId: CanonicalDepartmentId;
  name: string;
  kind: "specialist" | "tool_connector" | "governance_gate";
  description?: string;
  status: "idle" | "active" | "standby";
}

export interface DiveNode {
  id: CanonicalDepartmentId;
  name: string;
  kind: "department" | "oversight";
  runtimeRouteId: string;
  status: "idle" | "active" | "waiting_approval" | "error" | "completed";
  subnodes: DiveSubnode[];
  activeStepLabel?: string;
  activeProvider?: string;
  activeModel?: string;
}

export interface DiveStructuralCord {
  id: string;
  sourceId: CanonicalDepartmentId;
  targetId: CanonicalDepartmentId;
  kind: "orchestration" | "data_pipeline" | "oversight_gate" | "handoff";
  label: string;
  active: boolean;
}

export interface DiveDataPacket {
  id: string;
  sourceId: string;
  targetId: string;
  kind: "instruction" | "evidence" | "model_tokens" | "tool_result" | "approval_signal";
  label: string;
  timestamp: string;
  progress: number; // 0.0 -> 1.0 along the cord
  metadata?: {
    provider?: string;
    model?: string;
    tokens?: number;
    jobId?: string;
    stepId?: string;
  };
}

export interface DiveActivityEvent {
  id: string;
  timestamp: string;
  type: "job_launched" | "step_activated" | "model_executed" | "tool_executed" | "approval_escalated" | "step_completed";
  sourceId: string;
  targetId?: string;
  label: string;
  details?: string;
  provider?: string;
  model?: string;
  tokens?: number;
  durationMs?: number;
}

export interface DiveStateSnapshot {
  topology: {
    nodes: DiveNode[];
    cords: DiveStructuralCord[];
  };
  liveState: {
    isLive: boolean;
    activeJobId: string | null;
    activeJobTitle: string | null;
    activeDepartmentId: CanonicalDepartmentId | null;
    activeStepId: string | null;
    activeStepLabel: string | null;
    progressPct: number;
    activeNodesCount: number;
  };
  packets: DiveDataPacket[];
  events: DiveActivityEvent[];
  updatedAt: string;
}

// -------------------------------------------------------------------------------------------------
// Static Canonical Topology Builder
// -------------------------------------------------------------------------------------------------

const CANONICAL_CORDS: Array<{
  sourceId: CanonicalDepartmentId;
  targetId: CanonicalDepartmentId;
  kind: "orchestration" | "data_pipeline" | "oversight_gate" | "handoff";
  label: string;
}> = [
  // Executive Orchestration Central Spine
  { sourceId: "executive_orchestration", targetId: "quality_risk_governance", kind: "oversight_gate", label: "Governance & Review" },
  { sourceId: "executive_orchestration", targetId: "strategic_intelligence", kind: "orchestration", label: "Strategic Planning Directive" },
  { sourceId: "executive_orchestration", targetId: "brand_growth_marketing", kind: "orchestration", label: "Brand Growth Directive" },
  { sourceId: "executive_orchestration", targetId: "revenue_partnerships", kind: "orchestration", label: "Revenue Directive" },
  { sourceId: "executive_orchestration", targetId: "operations_finance", kind: "orchestration", label: "Operations & Capital Alloc" },

  // Inter-Department Collaborative Handoffs
  { sourceId: "strategic_intelligence", targetId: "brand_growth_marketing", kind: "data_pipeline", label: "Market Intelligence Handoff" },
  { sourceId: "strategic_intelligence", targetId: "revenue_partnerships", kind: "data_pipeline", label: "Competitive Targeting" },
  { sourceId: "brand_growth_marketing", targetId: "revenue_partnerships", kind: "handoff", label: "Demand Generation -> Sales" },
  { sourceId: "revenue_partnerships", targetId: "client_delivery_success", kind: "handoff", label: "Closed Client Onboarding" },
  { sourceId: "client_delivery_success", targetId: "product_design_ux", kind: "data_pipeline", label: "Client Requirements -> Product UX" },
  { sourceId: "product_design_ux", targetId: "web_platform_engineering", kind: "handoff", label: "Design Specifications -> Web Engineering" },
  { sourceId: "web_platform_engineering", targetId: "ai_systems_automation", kind: "data_pipeline", label: "Platform APIs -> AI Automation" },
  { sourceId: "ai_systems_automation", targetId: "operations_finance", kind: "data_pipeline", label: "Automation Telemetry -> Cost Ops" },
  { sourceId: "operations_finance", targetId: "executive_orchestration", kind: "oversight_gate", label: "Financial Reconcile -> Executive" },

  // Universal Governance Links
  { sourceId: "web_platform_engineering", targetId: "quality_risk_governance", kind: "oversight_gate", label: "Code & Security Audit" },
  { sourceId: "ai_systems_automation", targetId: "quality_risk_governance", kind: "oversight_gate", label: "Model Safety & Alignment" },
];

export function buildConfiguredTopology(): { nodes: DiveNode[]; cords: DiveStructuralCord[] } {
  const allTaxa: readonly DepartmentTaxon[] = [...DEPARTMENT_TAXONOMY, ...OVERSIGHT_TAXONOMY];

  const nodes: DiveNode[] = allTaxa.map((taxon) => {
    const subnodes: DiveSubnode[] = taxon.branches.map((branch, idx) => ({
      id: `${taxon.id}:sub:${idx + 1}`,
      parentId: taxon.id,
      name: branch.name,
      kind: taxon.kind === "oversight" ? "governance_gate" : "specialist",
      status: "idle",
    }));

    return {
      id: taxon.id,
      name: taxon.name,
      kind: taxon.kind,
      runtimeRouteId: taxon.runtimeRouteId,
      status: "idle",
      subnodes,
    };
  });

  const cords: DiveStructuralCord[] = CANONICAL_CORDS.map((c, idx) => ({
    id: `cord:${c.sourceId}:${c.targetId}:${idx}`,
    sourceId: c.sourceId,
    targetId: c.targetId,
    kind: c.kind,
    label: c.label,
    active: false,
  }));

  return { nodes, cords };
}

// -------------------------------------------------------------------------------------------------
// Real Live State Resolution
// -------------------------------------------------------------------------------------------------

export async function getDiveStateSnapshot(): Promise<DiveStateSnapshot> {
  const { nodes, cords } = buildConfiguredTopology();
  const isPreview = isPublicPreviewMode();

  if (isPreview) {
    return {
      topology: { nodes, cords },
      liveState: {
        isLive: false,
        activeJobId: null,
        activeJobTitle: null,
        activeDepartmentId: null,
        activeStepId: null,
        activeStepLabel: null,
        progressPct: 0,
        activeNodesCount: 0,
      },
      packets: [],
      events: [],
      updatedAt: new Date().toISOString(),
    };
  }

  // 1. Fetch live jobs
  let jobs: Job[] = [];
  try {
    const summaries = listJobSummaries();
    for (const s of summaries.slice(0, 5)) {
      const full = getJob(s.id);
      if (full) jobs.push(full);
    }
  } catch {}

  const activeJob = jobs.find((j) => j.status === "running") || jobs[0] || null;
  const telemetry: TelemetrySnapshot = telemetryStore.getSnapshot();

  let activeDepartmentId: CanonicalDepartmentId | null = null;
  let activeStepId: string | null = null;
  let activeStepLabel: string | null = null;
  const packets: DiveDataPacket[] = [];
  const events: DiveActivityEvent[] = [];

  if (activeJob) {
    const activeStep = activeJob.steps.find((s) => s.status === "active") || activeJob.steps[activeJob.steps.length - 1];
    if (activeStep) {
      activeStepId = activeStep.id;
      activeStepLabel = activeStep.label;

      // Map step to canonical department
      const matchNode = nodes.find(
        (n) =>
          n.id === activeStep.departmentId ||
          n.runtimeRouteId === activeStep.runtimeRouteId ||
          n.runtimeRouteId === activeStep.departmentId
      );

      if (matchNode) {
        activeDepartmentId = matchNode.id;
        matchNode.status = activeStep.status === "active" ? "active" : "completed";
        matchNode.activeStepLabel = activeStep.activity || activeStep.label;
        matchNode.activeProvider = activeStep.provider;

        // Activate cords leading into or out of active department
        cords.forEach((c) => {
          if (c.targetId === matchNode.id || c.sourceId === matchNode.id) {
            c.active = true;
          }
        });

        // Generate truthful in-flight packet if actively running
        if (activeJob.status === "running") {
          packets.push({
            id: `pkt:${activeJob.id}:${activeStep.id}`,
            sourceId: "executive_orchestration",
            targetId: matchNode.id,
            kind: "instruction",
            label: activeStep.label,
            timestamp: activeStep.startedAt || new Date().toISOString(),
            progress: (activeStep.percent || 50) / 100,
            metadata: {
              jobId: activeJob.id,
              stepId: activeStep.id,
              provider: activeStep.provider,
            },
          });
        }
      }
    }

    // Populate events from real job steps
    for (const step of activeJob.steps) {
      if (step.startedAt) {
        events.push({
          id: `evt:step:${activeJob.id}:${step.id}`,
          timestamp: step.startedAt,
          type: step.status === "done" ? "step_completed" : "step_activated",
          sourceId: step.departmentId || "executive_orchestration",
          label: `${step.label} (${step.status})`,
          details: step.activity,
          provider: step.provider,
        });
      }
    }
  }

  // Populate telemetry events
  if (telemetry.recentEvents && telemetry.recentEvents.length > 0) {
    for (const te of telemetry.recentEvents.slice(0, 10)) {
      events.push({
        id: `evt:tel:${te.id}`,
        timestamp: te.timestamp,
        type: "tool_executed",
        sourceId: te.nodeId || "ai_systems_automation",
        label: te.label,
        details: te.details,
      });
    }
  }

  const activeNodesCount = nodes.filter((n) => n.status === "active").length;

  return {
    topology: { nodes, cords },
    liveState: {
      isLive: activeJob?.status === "running",
      activeJobId: activeJob?.id || null,
      activeJobTitle: activeJob?.title || null,
      activeDepartmentId,
      activeStepId,
      activeStepLabel,
      progressPct: activeJob?.percent || 0,
      activeNodesCount,
    },
    packets,
    events: events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 20),
    updatedAt: new Date().toISOString(),
  };
}
