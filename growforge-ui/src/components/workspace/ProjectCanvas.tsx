"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  BadgeDollarSign,
  Building2,
  CheckCircle2,
  ClipboardList,
  Code2,
  Copy,
  Download,
  FileText,
  Globe,
  History,
  Loader2,
  Megaphone,
  MessageSquarePlus,
  MousePointerClick,
  Palette,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  Users,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Job, JobStep, JobSummary, StepStatus } from "@/lib/jobStore";
import { Markdown } from "@/components/ui/Markdown";
import { useAppState } from "@/lib/appState";

const DEPT_ICONS: Record<string, LucideIcon> = {
  "sales-bd": Target,
  marketing: Megaphone,
  "meta-ads": MousePointerClick,
  "finance-ops": BadgeDollarSign,
  "client-success": ClipboardList,
  "web-design": Palette,
  "web-dev": Code2,
  "ai-automation": Workflow,
};

const KIND_ICONS: Record<JobStep["kind"], LucideIcon> = {
  brief: FileText,
  plan: Building2,
  research: Globe,
  department: Users,
  reconcile: Users,
  qa: ShieldCheck,
  final: Trophy,
};

const KIND_TAG: Record<JobStep["kind"], string> = {
  brief: "Input",
  plan: "HQ · Planning",
  research: "Google Search",
  department: "Department agent",
  reconcile: "HQ · Discussion",
  qa: "Independent check",
  final: "Output",
};

const STATUS_STYLE: Record<StepStatus, { ring: string; bar: string; text: string; label: string }> = {
  pending: { ring: "border-border-metal", bar: "bg-muted/40", text: "text-muted", label: "Waiting" },
  active: { ring: "border-electric ring-4 ring-electric/15", bar: "bg-gradient-to-r from-electric to-gold", text: "text-electric", label: "Working" },
  done: { ring: "border-emerald/60", bar: "bg-emerald", text: "text-emerald", label: "Done" },
  error: { ring: "border-crimson/60", bar: "bg-crimson", text: "text-crimson", label: "Failed" },
  skipped: { ring: "border-gold/60 border-dashed", bar: "bg-gold", text: "text-gold", label: "Skipped" },
};

type StepNodeData = { step: JobStep; selected: boolean };
type StepNodeType = Node<StepNodeData, "step">;

function StepNode({ data }: NodeProps<StepNodeType>) {
  const { step, selected } = data;
  const style = STATUS_STYLE[step.status];
  const Icon = (step.departmentId && DEPT_ICONS[step.departmentId]) || KIND_ICONS[step.kind];
  const percent = step.status === "done" ? 100 : step.percent;
  const isFinal = step.kind === "final";

  return (
    <div
      className={`w-[230px] cursor-pointer rounded-2xl border-2 bg-white p-3 shadow-[0_8px_24px_-14px_rgba(11,18,32,0.35)] transition-all ${style.ring} ${
        selected ? "scale-[1.03] shadow-[0_14px_32px_-12px_rgba(0,120,255,0.45)]" : "hover:-translate-y-0.5"
      } ${isFinal && step.status === "done" ? "bg-gradient-to-br from-white to-emerald/10" : ""}`}
    >
      {step.kind !== "brief" && <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-muted" />}
      {step.kind !== "final" && <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-muted" />}

      <div className="flex items-start gap-2.5">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
            step.status === "active" ? "bg-electric/10 text-electric" : step.status === "done" ? "bg-emerald/10 text-emerald" : "bg-sunken text-secondary"
          }`}
        >
          {step.status === "active" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{KIND_TAG[step.kind]}</p>
          <p className="truncate font-heading text-sm font-semibold text-navy">{step.label}</p>
        </div>
        <span className={`shrink-0 font-mono text-xs font-semibold ${style.text}`}>{percent}%</span>
      </div>

      <p className="mt-2 line-clamp-2 min-h-[2rem] text-[11px] leading-snug text-secondary">{step.activity}</p>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken">
        <div className={`h-full rounded-full transition-[width] duration-700 ease-out ${style.bar}`} style={{ width: `${percent}%` }} />
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[10px]">
        <span className={`font-medium ${style.text}`}>{style.label}</span>
        {step.sources && step.sources.length > 0 && <span className="text-muted">{step.sources.length} sources</span>}
      </div>
    </div>
  );
}

const nodeTypes = { step: StepNode };

const COL_X = { brief: 0, plan: 290, research: 580, department: 870, reconcile: 1160, qa: 1450, final: 1740 };
const ROW_GAP = 150;

function buildGraph(job: Job, selectedId: string | null): { nodes: StepNodeType[]; edges: Edge[] } {
  const departments = job.steps.filter((s) => s.kind === "department");
  const deptCount = Math.max(departments.length, 1);
  const midY = ((deptCount - 1) * ROW_GAP) / 2;

  const nodes: StepNodeType[] = job.steps.map((step) => {
    const y = step.kind === "department" ? departments.indexOf(step) * ROW_GAP : midY;
    return {
      id: step.id,
      type: "step",
      position: { x: COL_X[step.kind], y },
      data: { step, selected: step.id === selectedId },
      draggable: true,
    };
  });

  const byId = new Map(job.steps.map((s) => [s.id, s]));
  const edges: Edge[] = job.steps.flatMap((step) =>
    step.dependsOn
      .filter((dep) => byId.has(dep))
      .map((dep) => {
        const source = byId.get(dep)!;
        const flowing = step.status === "active";
        const complete = source.status === "done" && (step.status === "done" || step.status === "active");
        const color = flowing ? "#0078ff" : complete ? "#10b981" : "#cbd5e1";
        return {
          id: `${dep}->${step.id}`,
          source: dep,
          target: step.id,
          type: "smoothstep",
          animated: flowing,
          style: { stroke: color, strokeWidth: flowing ? 2.5 : 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
        };
      }),
  );

  return { nodes, edges };
}

function formatDuration(from?: string, to?: string) {
  if (!from) return "";
  const ms = (to ? new Date(to).getTime() : Date.now()) - new Date(from).getTime();
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

function StepPanel({ step, onClose }: { step: JobStep; onClose: () => void }) {
  const style = STATUS_STYLE[step.status];
  return (
    <aside className="absolute inset-y-0 right-0 z-10 flex w-full max-w-md flex-col border-l border-border-metal bg-white/95 shadow-2xl backdrop-blur-xl">
      <div className="flex items-start gap-3 border-b border-border-metal p-4">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{KIND_TAG[step.kind]}</p>
          <h3 className="font-heading text-base font-semibold text-navy">{step.label}</h3>
          <p className={`mt-0.5 text-xs font-medium ${style.text}`}>
            {style.label} · {step.activity}
            {step.startedAt && ` · ${formatDuration(step.startedAt, step.finishedAt)}`}
            {step.provider && ` · via ${step.provider}`}
          </p>
          {step.instructionsHash && (
            <p className="mt-0.5 font-mono text-[10px] text-muted" title="Hash of the exact constitution + department instructions this step's model call was given">
              rules v.{step.instructionsHash}
            </p>
          )}
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-sunken hover:text-navy">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {step.error && <p className="mb-3 rounded-lg bg-crimson/10 px-3 py-2 text-xs text-crimson">{step.error}</p>}
        {step.output ? (
          <Markdown content={step.output} />
        ) : (
          <p className="text-sm text-muted">{step.status === "active" ? "This agent is still working…" : "Nothing produced yet."}</p>
        )}
        {step.sources && step.sources.length > 0 && (
          <div className="mt-5 border-t border-border-metal pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Sources</p>
            <ol className="space-y-1.5 text-xs">
              {step.sources.map((s, i) => (
                <li key={s.uri} className="flex gap-2">
                  <span className="font-mono text-muted">[{i + 1}]</span>
                  <a href={s.uri} target="_blank" rel="noreferrer" className="min-w-0 break-words text-electric underline underline-offset-2">
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </aside>
  );
}

function RevisePanel({ job, onRevised }: { job: Job; onRevised: (job: Job) => void }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justQueued, setJustQueued] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(job.id)}/revise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't apply that change.");
        return;
      }
      onRevised(data.job);
      setMessage("");
      setJustQueued(true);
      setTimeout(() => setJustQueued(false), 4000);
      setOpen(false);
    } catch {
      setError("Network error reaching the server.");
    } finally {
      setBusy(false);
    }
  }

  const wasRunning = job.status === "running";

  return (
    <div className="border-t border-border-metal px-5 py-3">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-secondary hover:text-electric"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" /> Request a change to this project
        </button>
      ) : (
        <form onSubmit={submit} className="space-y-2">
          <p className="text-xs text-secondary">
            {job.status === "running"
              ? "The job is still running — your change reaches every step that hasn't started yet."
              : "HQ will decide exactly which departments need to redo their work, and only redo those."}
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder='e.g. "Budget is actually $4,000/month" or "Focus on Google Ads, drop Meta Ads"'
              className="min-w-0 flex-1 rounded-lg border border-border-metal bg-white/80 px-3 py-2 text-xs text-navy outline-none focus:border-electric/50"
              autoFocus
            />
            <button
              type="submit"
              disabled={!message.trim() || busy}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-r from-electric to-gold px-3 py-2 text-xs font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {wasRunning ? "Queue it" : "Apply & redo"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="shrink-0 rounded-lg px-2 py-2 text-xs text-muted hover:text-navy">
              Cancel
            </button>
          </div>
          {error && <p className="text-xs text-crimson">{error}</p>}
        </form>
      )}
      {justQueued && !open && (
        <p className="mt-1.5 text-xs text-emerald">
          {wasRunning ? "Queued — applying to every step that hasn't started yet." : "Got it — redoing the affected departments now."}
        </p>
      )}

      {(job.revisions ?? []).length > 0 && (
        <details className="mt-2">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] text-muted hover:text-secondary">
            <History className="h-3 w-3" /> {job.revisions.length} change{job.revisions.length === 1 ? "" : "s"} requested
          </summary>
          <ul className="mt-1.5 space-y-1 pl-4">
            {job.revisions.map((r) => (
              <li key={r.id} className="text-[11px] text-secondary">
                <span className="text-muted">{new Date(r.createdAt).toLocaleTimeString()}</span> — {r.message}{" "}
                <span className="text-muted">({r.effect === "reran" ? `redid ${r.redoneSteps?.length ?? 0} steps` : "queued"})</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function FinalPlanModal({ job, onClose }: { job: Job; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const content = job.finalOutput ?? "";

  function handleDownload() {
    const blob = new Blob([`# ${job.title}\n\n${content}`], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${job.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "plan"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-navy/50 backdrop-blur-sm" />
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-border-metal px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald/10 text-emerald">
            <Trophy className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-heading text-base font-semibold text-navy">{job.title}</h2>
            <p className="text-xs text-secondary">Final plan · {job.verified ? "research-backed" : "unverified"}</p>
          </div>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(content).then(() => setCopied(true))}
            className="flex items-center gap-1.5 rounded-lg border border-border-metal px-3 py-1.5 text-xs font-medium text-secondary hover:text-navy"
          >
            {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-electric to-gold px-3 py-1.5 text-xs font-semibold text-white"
          >
            <Download className="h-3.5 w-3.5" /> Download
          </button>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-sunken hover:text-navy">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">
          <Markdown content={content} size="base" />
        </div>
      </div>
    </div>
  );
}

export function ProjectCanvas() {
  const { activeJobId, openJob } = useAppState();
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [showFinal, setShowFinal] = useState(false);

  const currentId = activeJobId ?? jobs[0]?.id ?? null;

  useEffect(() => {
    let cancelled = false;
    async function loadJobs() {
      try {
        const res = await fetch("/api/jobs");
        if (res.ok && !cancelled) setJobs((await res.json()).jobs ?? []);
      } catch {
        // retried on the next tick
      }
    }
    loadJobs();
    const t = setInterval(loadJobs, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (!currentId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const res = await fetch(`/api/jobs/${encodeURIComponent(currentId!)}`);
        if (res.ok && !cancelled) {
          const data: { job: Job } = await res.json();
          setJob(data.job);
          if (data.job.status === "running") timer = setTimeout(poll, 1500);
        }
      } catch {
        if (!cancelled) timer = setTimeout(poll, 3000);
      }
    }
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [currentId]);

  const visibleJob = job && job.id === currentId ? job : null;
  const graph = useMemo(() => (visibleJob ? buildGraph(visibleJob, selectedStepId) : { nodes: [], edges: [] }), [visibleJob, selectedStepId]);
  const selectedStep = visibleJob?.steps.find((s) => s.id === selectedStepId) ?? null;
  const activeStep = visibleJob?.steps.find((s) => s.status === "active");
  const localFallbackSteps = visibleJob?.steps.filter((s) => s.provider === "ollama") ?? [];

  return (
    <section className="glass-card overflow-hidden rounded-2xl">
      <div className="flex flex-wrap items-center gap-3 border-b border-border-metal px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-electric/15 to-gold/15 text-electric ring-1 ring-border-metal">
          <Sparkles className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-base font-semibold text-navy">Live Projects</h2>
          <p className="text-xs text-secondary">
            Brief → HQ → research → departments → team review → QA → final plan. Click any node to see what that agent produced.
          </p>
        </div>
        {visibleJob?.status === "done" && visibleJob.finalOutput && (
          <button
            type="button"
            onClick={() => setShowFinal(true)}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-electric to-gold px-4 py-2 text-sm font-semibold text-white shadow-sm"
          >
            <Trophy className="h-4 w-4" /> View final plan
          </button>
        )}
      </div>

      {jobs.length > 0 && (
        <div className="flex gap-2 overflow-x-auto border-b border-border-metal px-5 py-3">
          {jobs.map((j) => {
            const active = j.id === currentId;
            return (
              <button
                key={j.id}
                type="button"
                onClick={() => {
                  setSelectedStepId(null);
                  openJob(j.id);
                }}
                className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors ${
                  active ? "border-electric/40 bg-electric/5" : "border-border-metal bg-white/70 hover:border-electric/30"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    j.status === "running" ? "animate-pulse bg-electric" : j.status === "done" ? "bg-emerald" : "bg-crimson"
                  }`}
                />
                <span className="max-w-[14rem] truncate text-xs font-medium text-navy">{j.title}</span>
                <span className="font-mono text-[11px] text-muted">{j.percent}%</span>
              </button>
            );
          })}
        </div>
      )}

      {!visibleJob ? (
        <div className="flex h-[26rem] flex-col items-center justify-center gap-3 px-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sunken text-muted">
            <Workflow className="h-6 w-6" />
          </span>
          <p className="font-heading text-sm font-semibold text-navy">{currentId ? "Loading project…" : "No projects yet"}</p>
          {!currentId && (
            <p className="max-w-md text-sm text-secondary">
              Describe a project to the AI Assistant — for example, <em>&quot;my client just started a roofing business and needs a full growth plan&quot;</em>. It will ask a few questions, confirm, then send it to the team. You&apos;ll watch every department work here.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-navy">{visibleJob.title}</p>
              <p className="truncate text-xs text-secondary">
                {visibleJob.status === "running"
                  ? activeStep
                    ? `${activeStep.label}: ${activeStep.activity}`
                    : "Working…"
                  : visibleJob.status === "done"
                    ? `Completed in ${formatDuration(visibleJob.createdAt, visibleJob.finishedAt)} · ${visibleJob.verified ? "research-backed" : "unverified — no live research"}`
                    : visibleJob.error ?? "Failed"}
              </p>
            </div>
            <div className="flex w-full items-center gap-3 sm:w-72">
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-sunken">
                <div
                  className={`h-full rounded-full transition-[width] duration-700 ease-out ${
                    visibleJob.status === "error" ? "bg-crimson" : visibleJob.status === "done" ? "bg-emerald" : "bg-gradient-to-r from-electric to-gold"
                  }`}
                  style={{ width: `${visibleJob.percent}%` }}
                />
              </div>
              <span className="w-10 text-right font-mono text-sm font-semibold text-navy">{visibleJob.percent}%</span>
            </div>
          </div>

          {localFallbackSteps.length > 0 && (
            <div className="mx-5 mb-3 flex items-start gap-2 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-xs text-secondary">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
              <span>
                <span className="font-semibold text-navy">Reduced quality:</span> {localFallbackSteps.length} step
                {localFallbackSteps.length === 1 ? "" : "s"} ran on the small local model because no cloud AI provider responded
                (usually a used-up quota). Check <span className="font-medium text-navy">Settings → AI Providers</span>, then request a change to redo them.
              </span>
            </div>
          )}

          {(visibleJob.status === "done" || visibleJob.status === "running") && (
            <RevisePanel job={visibleJob} onRevised={setJob} />
          )}

          <div className="relative h-[34rem] border-t border-border-metal bg-[#fbfcfe]">
            <ReactFlow
              key={visibleJob.id}
              nodes={graph.nodes}
              edges={graph.edges}
              nodeTypes={nodeTypes}
              onNodeClick={(_, node) => {
                if (node.id === "final" && visibleJob.status === "done") setShowFinal(true);
                else setSelectedStepId(node.id);
              }}
              onPaneClick={() => setSelectedStepId(null)}
              fitView
              fitViewOptions={{ padding: 0.15 }}
              minZoom={0.3}
              maxZoom={1.5}
              nodesConnectable={false}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="#cbd5e1" />
              <Controls showInteractive={false} />
            </ReactFlow>
            {selectedStep && <StepPanel step={selectedStep} onClose={() => setSelectedStepId(null)} />}
          </div>
        </>
      )}

      {showFinal && visibleJob?.finalOutput && <FinalPlanModal job={visibleJob} onClose={() => setShowFinal(false)} />}
    </section>
  );
}
