/**
 * Live Operational Telemetry Store
 *
 * Real-time event tracking and telemetry engine designed for the GrowForge AI OS
 * and the 3D Interactive WebGL Neural Brain experience.
 *
 * Tracks:
 * 1. Operational State: "idle" | "processing" | "blocked_approval" | "error"
 * 2. Active Department Lobes & Nodes (mapping agents to cognitive sectors)
 * 3. Real tool execution metrics (MCP, public catalog tools, custom webhooks)
 * 4. High-resolution event log stream with zero synthetic/fake data.
 */

export type BrainLobe =
  | "neural_core"          // HQ, Plan, Reconciliation
  | "creative_strategy"    // Marketing, Brand Strategy
  | "growth_expansion"     // Sales, Business Development, Client Success
  | "analytics_governance" // Finance, Operations, QA Gate
  | "performance_media";   // Paid Media, Meta Ads, Outbound

export type TelemetryExecutionState = "idle" | "processing" | "blocked_approval" | "error";

export interface TelemetryEvent {
  id: string;
  timestamp: string;
  type: "job_started" | "step_changed" | "tool_invoked" | "approval_required" | "job_completed" | "error";
  lobe: BrainLobe;
  nodeId: string;
  label: string;
  details?: string;
  metadata?: Record<string, unknown>;
}

export interface TelemetrySnapshot {
  executionState: TelemetryExecutionState;
  activeJobId: string | null;
  activeNodeId: string | null;
  activeLobe: BrainLobe;
  activeAction: string | null;
  progressPct: number;
  totalToolInvocations: number;
  successfulToolInvocations: number;
  connectedMcpCount: number;
  publicToolsCount: number;
  recentEvents: TelemetryEvent[];
  updatedAt: string;
}

const DEPARTMENT_LOBE_MAP: Record<string, BrainLobe> = {
  brief: "neural_core",
  plan: "neural_core",
  research: "analytics_governance",
  "dept:marketing": "creative_strategy",
  "dept:strategy": "creative_strategy",
  "dept:sales-bd": "growth_expansion",
  "dept:client-success": "growth_expansion",
  "dept:meta-ads": "performance_media",
  "dept:finance-ops": "analytics_governance",
  qa: "analytics_governance",
  reconcile: "neural_core",
  final: "neural_core",
};

export function resolveLobe(nodeId?: string): BrainLobe {
  if (!nodeId) return "neural_core";
  return DEPARTMENT_LOBE_MAP[nodeId] ?? "neural_core";
}

class TelemetryStore {
  private executionState: TelemetryExecutionState = "idle";
  private activeJobId: string | null = null;
  private activeNodeId: string | null = null;
  private activeLobe: BrainLobe = "neural_core";
  private activeAction: string | null = null;
  private progressPct = 0;
  private totalToolInvocations = 0;
  private successfulToolInvocations = 0;
  private events: TelemetryEvent[] = [];
  private readonly MAX_EVENTS = 30;

  public getSnapshot(connectedMcpCount = 0, publicToolsCount = 0): TelemetrySnapshot {
    return {
      executionState: this.executionState,
      activeJobId: this.activeJobId,
      activeNodeId: this.activeNodeId,
      activeLobe: this.activeLobe,
      activeAction: this.activeAction,
      progressPct: this.progressPct,
      totalToolInvocations: this.totalToolInvocations,
      successfulToolInvocations: this.successfulToolInvocations,
      connectedMcpCount,
      publicToolsCount,
      recentEvents: [...this.events],
      updatedAt: new Date().toISOString(),
    };
  }

  public getEmptySnapshot(): TelemetrySnapshot {
    return {
      executionState: "idle",
      activeJobId: null,
      activeNodeId: null,
      activeLobe: "neural_core",
      activeAction: null,
      progressPct: 0,
      totalToolInvocations: 0,
      successfulToolInvocations: 0,
      connectedMcpCount: 0,
      publicToolsCount: 0,
      recentEvents: [],
      updatedAt: new Date().toISOString(),
    };
  }

  public emitEvent(event: Omit<TelemetryEvent, "id" | "timestamp">): TelemetryEvent {
    const fullEvent: TelemetryEvent = {
      ...event,
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
    };

    this.events.unshift(fullEvent);
    if (this.events.length > this.MAX_EVENTS) {
      this.events.pop();
    }

    // Update current active lobe & node
    this.activeNodeId = event.nodeId;
    this.activeLobe = event.lobe;
    if (event.label) {
      this.activeAction = event.label;
    }

    return fullEvent;
  }

  public setExecutionState(state: TelemetryExecutionState, details?: { jobId?: string; nodeId?: string; progress?: number }) {
    this.executionState = state;
    if (details?.jobId !== undefined) this.activeJobId = details.jobId;
    if (details?.nodeId !== undefined) {
      this.activeNodeId = details.nodeId;
      this.activeLobe = resolveLobe(details.nodeId);
    }
    if (details?.progress !== undefined) this.progressPct = details.progress;

    if (state === "idle" && !details?.jobId) {
      this.activeJobId = null;
      this.activeAction = null;
      this.progressPct = 0;
    }
  }

  public recordToolCall(success: boolean) {
    this.totalToolInvocations++;
    if (success) {
      this.successfulToolInvocations++;
    }
  }
}

// Global telemetry instance singleton in memory
declare global {
  var __growforge_telemetry_store__: TelemetryStore | undefined;
}

export const telemetryStore = globalThis.__growforge_telemetry_store__ ?? new TelemetryStore();
if (process.env.NODE_ENV !== "production") {
  globalThis.__growforge_telemetry_store__ = telemetryStore;
}
