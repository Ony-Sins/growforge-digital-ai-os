"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Brain, CheckCircle2, Key, Loader2, Plug, ShieldCheck, Sparkles, Trash2, X, XCircle } from "lucide-react";
import { useTelemetry } from "@/lib/useTelemetry";
import type { BrainLobe } from "@/lib/telemetryStore";

interface DepartmentInfo {
  id: string;
  name: string;
  summary: string;
}

interface McpServerInfo {
  id: string;
  name: string;
  transport: "stdio" | "http";
  command?: string;
  args?: string[];
  url?: string;
  allowedDepartments: string[];
  hasCredential: boolean;
}

interface DynamicTopologyNode {
  id: string;
  label: string;
  type: "mcp_server" | "mcp_tool" | "capability_key" | "ai_model";
  status: "active" | "connected" | "standby";
  lobe: BrainLobe;
  tools?: string[];
}

type BrainNodeKind = "hub" | "department" | "connector" | "capability";

interface BrainNodeData {
  kind: BrainNodeKind;
  label: string;
  connectorCount?: number;
  departmentId?: string;
  serverId?: string;
  capabilityId?: string;
  nodeType?: string;
  summary?: string;
  tools?: string[];
  [key: string]: unknown;
}
type BrainNode = Node<BrainNodeData, "brain">;

const DEPARTMENT_LOBE_MAP: Record<string, BrainLobe> = {
  "sales-bd": "growth_expansion",
  "marketing": "creative_strategy",
  "meta-ads": "performance_media",
  "finance-ops": "analytics_governance",
  "client-success": "growth_expansion",
  "web-design": "creative_strategy",
  "web-dev": "neural_core",
  "ai-automation": "neural_core",
  "research": "analytics_governance",
  "qa": "analytics_governance",
};

function BrainNodeView({ data, selected }: NodeProps<BrainNode>) {
  const { kind, label } = data;
  const isHub = kind === "hub";
  const isDept = kind === "department";
  const isCap = kind === "capability";

  const size = isHub ? "h-20 w-20" : isDept ? "h-14 w-14" : "h-9 w-9";
  const glow = isHub
    ? "shadow-[0_0_40px_10px_rgba(0,180,255,0.55)] border-electric"
    : isDept
      ? "shadow-[0_0_24px_6px_rgba(230,175,46,0.45)] border-gold"
      : isCap
        ? "shadow-[0_0_16px_4px_rgba(168,85,247,0.55)] border-purple-400"
        : "shadow-[0_0_14px_3px_rgba(16,185,129,0.5)] border-emerald";

  return (
    <div className="flex flex-col items-center gap-1.5">
      {(isHub || isDept) && <Handle type="target" position={Position.Top} className="!opacity-0" />}
      <div
        className={`flex ${size} items-center justify-center rounded-full border-2 bg-app/90 backdrop-blur-sm transition-transform ${glow} ${
          selected ? "scale-110" : "hover:scale-105"
        }`}
      >
        {isHub ? (
          <Brain className="h-8 w-8 text-electric" />
        ) : isDept ? (
          <ShieldCheck className="h-5 w-5 text-gold" />
        ) : isCap ? (
          data.nodeType === "ai_model" ? (
            <Sparkles className="h-3.5 w-3.5 text-purple-400" />
          ) : (
            <Key className="h-3.5 w-3.5 text-pink-400" />
          )
        ) : (
          <Plug className="h-3.5 w-3.5 text-emerald" />
        )}
      </div>
      <span
        className={`max-w-[6.5rem] truncate rounded-full bg-app/80 px-2 py-0.5 text-center font-mono text-[10px] backdrop-blur-sm ${
          isHub
            ? "font-bold text-electric"
            : isDept
              ? "font-semibold text-gold"
              : isCap
                ? "text-purple-300 font-medium"
                : "text-emerald/90"
        }`}
      >
        {label}
      </span>
      {!isDept && <Handle type="source" position={Position.Bottom} className="!opacity-0" />}
    </div>
  );
}

const nodeTypes = { brain: BrainNodeView };

const HUB_ID = "hub";
const DEPT_RADIUS = 260;
const CONNECTOR_RADIUS = 130;

function buildGraph(
  departments: DepartmentInfo[],
  servers: McpServerInfo[],
  capabilityNodes: DynamicTopologyNode[]
): { nodes: BrainNode[]; edges: Edge[] } {
  const nodes: BrainNode[] = [
    {
      id: HUB_ID,
      type: "brain",
      position: { x: 0, y: 0 },
      data: { kind: "hub", label: "GrowForge HQ" },
      draggable: false,
    },
  ];
  const edges: Edge[] = [];

  const deptCount = Math.max(departments.length, 1);
  const deptPositions = new Map<string, { x: number; y: number }>();

  departments.forEach((dept, i) => {
    const angle = (i / deptCount) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * DEPT_RADIUS;
    const y = Math.sin(angle) * DEPT_RADIUS;
    deptPositions.set(dept.id, { x, y });

    nodes.push({
      id: `dept:${dept.id}`,
      type: "brain",
      position: { x, y },
      data: { kind: "department", label: dept.name, summary: dept.summary, departmentId: dept.id },
      draggable: true,
    });
    edges.push({
      id: `${HUB_ID}->dept:${dept.id}`,
      source: HUB_ID,
      target: `dept:${dept.id}`,
      animated: true,
      style: { stroke: "rgba(0,180,255,0.45)", strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(0,180,255,0.6)", width: 14, height: 14 },
    });
  });

  // Connectors: scoped to specific active departments or orbiting HQ directly
  servers.forEach((server) => {
    const activeTargets = server.allowedDepartments.filter((dId) => deptPositions.has(dId));
    const targets = activeTargets.length > 0 ? activeTargets : [HUB_ID];
    const anchor = targets[0] === HUB_ID ? { x: 0, y: 0 } : (deptPositions.get(targets[0]) ?? { x: 0, y: 0 });
    const angleJitter = (hashString(server.id) % 360) * (Math.PI / 180);
    const x = anchor.x + Math.cos(angleJitter) * CONNECTOR_RADIUS;
    const y = anchor.y + Math.sin(angleJitter) * CONNECTOR_RADIUS;

    nodes.push({
      id: `mcp:${server.id}`,
      type: "brain",
      position: { x, y },
      data: { kind: "connector", label: server.name, serverId: server.id },
      draggable: true,
    });

    for (const target of targets) {
      const targetNodeId = target === HUB_ID ? HUB_ID : `dept:${target}`;
      edges.push({
        id: `mcp:${server.id}->${targetNodeId}`,
        source: `mcp:${server.id}`,
        target: targetNodeId,
        animated: true,
        style: { stroke: "rgba(16,185,129,0.4)", strokeWidth: 1.5 },
      });
    }
  });

  // Real Capability Keys (e.g. Higgsfield, configured AI models)
  capabilityNodes.forEach((cap, idx) => {
    // Avoid duplicate nodes if already in servers
    if (nodes.some((n) => n.id === cap.id)) return;

    const angle = ((idx + 0.5) / Math.max(capabilityNodes.length, 1)) * Math.PI * 2;
    const radius = 180;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;

    nodes.push({
      id: cap.id,
      type: "brain",
      position: { x, y },
      data: {
        kind: "capability",
        label: cap.label,
        capabilityId: cap.id,
        nodeType: cap.type,
        tools: cap.tools,
      },
      draggable: true,
    });

    edges.push({
      id: `${cap.id}->${HUB_ID}`,
      source: cap.id,
      target: HUB_ID,
      animated: true,
      style: { stroke: "rgba(168,85,247,0.45)", strokeWidth: 1.5 },
    });
  });

  return { nodes, edges };
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function InspectorPanel({
  selection,
  departments,
  servers,
  capabilities,
  testResult,
  onTested,
  onClose,
  onChanged,
}: {
  selection: { kind: BrainNodeKind; id: string };
  departments: DepartmentInfo[];
  servers: McpServerInfo[];
  capabilities: DynamicTopologyNode[];
  testResult: { ok: boolean; tools?: { name: string }[]; error?: string } | null;
  onTested: (serverId: string, result: { ok: boolean; tools?: { name: string }[]; error?: string }) => void;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [testing, setTesting] = useState(false);
  const [busy, setBusy] = useState(false);

  const server = selection.kind === "connector" ? servers.find((s) => s.id === selection.id) : undefined;
  const capability = selection.kind === "capability" ? capabilities.find((c) => c.id === selection.id) : undefined;
  const department = selection.kind === "department" ? departments.find((d) => d.id === selection.id) : undefined;
  const scopedServers = department ? servers.filter((s) => s.allowedDepartments.length === 0 || s.allowedDepartments.includes(department.id)) : [];

  async function handleTest() {
    if (!server) return;
    setTesting(true);
    try {
      const res = await fetch(`/api/mcp/${encodeURIComponent(server.id)}/test`, { method: "POST" });
      onTested(server.id, await res.json());
    } finally {
      setTesting(false);
    }
  }

  async function handleDelete() {
    if (!server) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/mcp/${encodeURIComponent(server.id)}`, { method: "DELETE" });
      if (res.ok) {
        onChanged();
        onClose();
      }
    } finally {
      setBusy(false);
    }
  }

  const title =
    selection.kind === "hub"
      ? "GrowForge HQ"
      : selection.kind === "department"
        ? department?.name ?? "Department"
        : selection.kind === "capability"
          ? capability?.label ?? "Capability Key"
          : server?.name ?? "MCP Connector";

  const category =
    selection.kind === "hub"
      ? "Orchestrator"
      : selection.kind === "department"
        ? "Active Department"
        : selection.kind === "capability"
          ? capability?.type === "ai_model"
            ? "Active AI Model"
            : "Capability Key"
          : "MCP Connector";

  return (
    <aside className="absolute inset-y-0 right-0 z-10 flex w-full max-w-sm flex-col border-l border-electric/20 bg-app/95 shadow-2xl backdrop-blur-xl">
      <div className="flex items-start gap-3 border-b border-electric/20 p-4">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
            selection.kind === "hub"
              ? "bg-electric/15 text-electric"
              : selection.kind === "department"
                ? "bg-gold/15 text-gold"
                : selection.kind === "capability"
                  ? "bg-purple-500/15 text-purple-400"
                  : "bg-emerald/15 text-emerald"
          }`}
        >
          {selection.kind === "hub" ? (
            <Brain className="h-4 w-4" />
          ) : selection.kind === "department" ? (
            <ShieldCheck className="h-4 w-4" />
          ) : selection.kind === "capability" ? (
            <Sparkles className="h-4 w-4" />
          ) : (
            <Plug className="h-4 w-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{category}</p>
          <h3 className="font-heading text-sm font-semibold text-white">{title}</h3>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-white/10 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 text-sm text-secondary">
        {selection.kind === "hub" && (
          <p>
            {departments.length > 0 ? `${departments.length} active department(s) running.` : "All departments currently idle (standby)."}
            {" · "}
            {servers.length + capabilities.length} active capability/tool connector(s).
          </p>
        )}

        {department && (
          <>
            <p className="mb-4">{department.summary}</p>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Connected tools</p>
            {scopedServers.length === 0 ? (
              <p className="text-xs text-muted">No MCP connectors assigned yet — add one in Settings → Integrations.</p>
            ) : (
              <ul className="space-y-1.5">
                {scopedServers.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs">
                    <Plug className="h-3 w-3 text-emerald" />
                    {s.name}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {capability && (
          <>
            <p className="mb-2 text-xs text-muted">
              {capability.type === "ai_model"
                ? "Configured AI Model directly available to the neural orchestrator."
                : "Real configured capability key connected to the neural brain."}
            </p>
            <p className="mb-4 text-xs font-mono text-purple-300">Status: {capability.status}</p>
            {capability.tools && capability.tools.length > 0 && (
              <>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Exposed Tools / Endpoints</p>
                <ul className="space-y-1.5">
                  {capability.tools.map((t) => (
                    <li key={t} className="flex items-center gap-2 rounded-lg border border-purple-500/20 bg-purple-500/10 px-2.5 py-1.5 text-xs text-purple-200">
                      <Sparkles className="h-3 w-3 text-purple-400" />
                      {t}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}

        {server && (
          <>
            <p className="mb-1 font-mono text-xs text-muted">
              {server.transport === "stdio" ? `${server.command} ${(server.args ?? []).join(" ")}` : server.url}
            </p>
            <p className="mb-4 text-xs text-muted">
              {server.allowedDepartments.length === 0 ? "Available to every department." : `Scoped to: ${server.allowedDepartments.join(", ")}`}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleTest}
                disabled={testing}
                className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-secondary hover:border-electric/40 hover:text-electric disabled:opacity-50"
              >
                {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                {testResult ? "Test again" : "Test connection"}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-lg border border-crimson/30 bg-crimson/10 px-3 py-1.5 text-xs font-medium text-crimson hover:bg-crimson/20 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </button>
            </div>
            {!testResult && !testing && <p className="mt-2 text-xs text-muted">Not tested yet.</p>}
            {testResult && (
              <p className={`mt-2 flex items-center gap-1.5 text-xs ${testResult.ok ? "text-emerald" : "text-crimson"}`}>
                {testResult.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                {testResult.ok ? `${testResult.tools?.length ?? 0} tools available` : testResult.error}
              </p>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

type ConnectorTestResult = { ok: boolean; tools?: { name: string }[]; error?: string };

export function AIBrainCanvas() {
  const { telemetry } = useTelemetry();
  const [allDepartments, setAllDepartments] = useState<DepartmentInfo[]>([]);
  const [servers, setServers] = useState<McpServerInfo[]>([]);
  const [capabilities, setCapabilities] = useState<DynamicTopologyNode[]>([]);
  const [selection, setSelection] = useState<{ kind: BrainNodeKind; id: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, ConnectorTestResult>>({});

  async function refresh() {
    try {
      const [mcpRes, connectRes] = await Promise.all([
        fetch("/api/mcp"),
        fetch("/api/mcp/connect"),
      ]);

      if (mcpRes.ok) {
        const data = await mcpRes.json();
        setAllDepartments(Array.isArray(data.departments) ? data.departments : []);
        setServers(Array.isArray(data.servers) ? data.servers : []);
      }

      if (connectRes.ok) {
        const connectData = await connectRes.json();
        const nodes: DynamicTopologyNode[] = Array.isArray(connectData.nodes) ? connectData.nodes : [];
        // Filter for capability keys and ai models (or MCP servers not already in servers)
        setCapabilities(nodes.filter((n) => n.type === "capability_key" || n.type === "ai_model"));
      }
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 8000);
    return () => clearInterval(interval);
  }, []);

  // Filter departments so they only appear when actively processing
  const activeDepartments = useMemo(() => {
    if (telemetry.executionState !== "processing" || !telemetry.activeLobe) {
      return [];
    }
    return allDepartments.filter((d) => DEPARTMENT_LOBE_MAP[d.id] === telemetry.activeLobe);
  }, [allDepartments, telemetry.executionState, telemetry.activeLobe]);

  const graph = useMemo(
    () => buildGraph(activeDepartments, servers, capabilities),
    [activeDepartments, servers, capabilities]
  );

  const nodesWithSelection = useMemo(
    () =>
      graph.nodes.map((n) => ({
        ...n,
        selected: selection
          ? n.id ===
            (selection.kind === "hub"
              ? HUB_ID
              : selection.kind === "department"
                ? `dept:${selection.id}`
                : selection.kind === "capability"
                  ? selection.id
                  : `mcp:${selection.id}`)
          : false,
      })),
    [graph.nodes, selection],
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-electric/20 bg-app shadow-[0_0_60px_-15px_rgba(0,120,255,0.35)]">
      <div className="flex items-center gap-3 border-b border-electric/20 px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-electric/15 text-electric">
          <Brain className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-base font-semibold text-white">AI Brain</h2>
          <p className="text-xs text-secondary">
            The real shape of your operating system — HQ, active departments, and connected capability tools. Click a node to inspect it.
          </p>
        </div>
      </div>

      <div className="relative h-[34rem] bg-[radial-gradient(ellipse_at_center,rgba(0,60,120,0.25)_0%,rgba(5,10,25,1)_70%)]">
        {loaded && (
          <ReactFlow
            nodes={nodesWithSelection}
            edges={graph.edges}
            nodeTypes={nodeTypes}
            onNodeClick={(_, node) => {
              const data = node.data as BrainNodeData;
              if (data.kind === "hub") setSelection({ kind: "hub", id: HUB_ID });
              else if (data.kind === "department") setSelection({ kind: "department", id: data.departmentId as string });
              else if (data.kind === "capability") setSelection({ kind: "capability", id: data.capabilityId as string });
              else setSelection({ kind: "connector", id: data.serverId as string });
            }}
            onPaneClick={() => setSelection(null)}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.3}
            maxZoom={2}
            nodesConnectable={false}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="rgba(0,180,255,0.15)" />
          </ReactFlow>
        )}
        {selection && (
          <InspectorPanel
            key={`${selection.kind}:${selection.id}`}
            selection={selection}
            departments={allDepartments}
            servers={servers}
            capabilities={capabilities}
            testResult={selection.kind === "connector" ? testResults[selection.id] ?? null : null}
            onTested={(serverId, result) => setTestResults((prev) => ({ ...prev, [serverId]: result }))}
            onClose={() => setSelection(null)}
            onChanged={refresh}
          />
        )}
      </div>
    </section>
  );
}
