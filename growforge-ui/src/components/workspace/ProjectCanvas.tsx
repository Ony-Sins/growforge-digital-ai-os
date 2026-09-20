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
import {
  BadgeDollarSign,
  Building2,
  CheckCircle2,
  ClipboardList,
  Code2,
  Cog,
  Copy,
  Download,
  FileText,
  FolderOpen,
  Globe,
  History,
  Layers,
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
import { MasterFindingsView } from "@/components/workspace/MasterFindingsView";

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
  pending: { ring: "border-[#333333]", bar: "bg-[#333333]", text: "text-muted", label: "Waiting" },
  active: { ring: "border-electric ring-4 ring-electric/25", bar: "bg-gradient-to-r from-electric to-gold", text: "text-electric", label: "Working" },
  done: { ring: "border-[#333333]", bar: "bg-electric", text: "text-white", label: "Done" },
  error: { ring: "border-crimson/60", bar: "bg-crimson", text: "text-crimson", label: "Failed" },
  skipped: { ring: "border-[#333333] border-dashed", bar: "bg-[#333333]", text: "text-muted", label: "Skipped" },
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
      className={`relative w-[230px] cursor-pointer rounded-2xl border-2 bg-[#111827] p-3 shadow-[0_8px_24px_-14px_rgba(0,0,0,0.6)] transition-all ${style.ring} ${
        selected ? "scale-[1.03] shadow-[0_14px_32px_-12px_rgba(0,120,255,0.45)] border-electric" : "hover:-translate-y-0.5"
      } ${isFinal && step.status === "done" ? "bg-gradient-to-br from-[#111827] to-electric/15" : ""}`}
    >
      {/* Floating "working" badge */}
      {step.status === "active" && (
        <span className="absolute -top-3 left-1/2 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full bg-gradient-to-br from-electric to-gold text-white shadow-[0_4px_14px_-2px_rgba(0,120,255,0.55)] ring-4 ring-[#0B1220]">
          <Cog className="h-3.5 w-3.5 animate-[spin_2.5s_linear_infinite]" />
        </span>
      )}

      {step.kind !== "brief" && <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !border-[#0B1220] !bg-muted" />}
      {step.kind !== "final" && <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-[#0B1220] !bg-muted" />}

      <div className="flex items-start gap-2.5">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
            step.status === "active" ? "bg-electric/15 text-electric" : step.status === "done" ? "bg-electric/10 text-electric" : "bg-sunken text-secondary"
          }`}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{KIND_TAG[step.kind]}</p>
          <p className="truncate font-heading text-sm font-semibold text-white">{step.label}</p>
        </div>
        <span className={`shrink-0 font-mono text-xs font-semibold ${style.text}`}>{percent}%</span>
      </div>

      <p className="mt-2 line-clamp-2 min-h-[2rem] text-[11px] leading-snug text-secondary">{step.activity}</p>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#1F2937]">
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
        const color = flowing ? "#0078FF" : complete ? "#0078FF" : "#333333";
        return {
          id: `${dep}->${step.id}`,
          source: dep,
          target: step.id,
          type: "smoothstep",
          animated: flowing,
          style: { stroke: color, strokeWidth: flowing ? 2.5 : 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
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
    <aside className="absolute inset-y-0 right-0 z-10 flex w-full max-w-md flex-col border-l border-[#333333] bg-[#0B1220]/95 shadow-2xl backdrop-blur-xl text-white">
      <div className="flex items-start gap-3 border-b border-[#333333] p-4">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{KIND_TAG[step.kind]}</p>
          <h3 className="font-heading text-base font-semibold text-white">{step.label}</h3>
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
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-[#111827] hover:text-white">
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
              className="min-w-0 flex-1 rounded-lg border border-[#333333] bg-[#0B1220] px-3 py-2 text-xs text-white placeholder:text-muted outline-none focus:border-electric/50"
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
            <button type="button" onClick={() => setOpen(false)} className="shrink-0 rounded-lg px-2 py-2 text-xs text-muted hover:text-white">
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

function FinalPlanModal({
  job,
  onClose,
  onUpdated,
  onOpenMasterFindings,
}: {
  job: Job;
  onClose: () => void;
  onUpdated: (job: Job) => void;
  onOpenMasterFindings?: () => void;
}) {
  const { role } = useAppState();
  const [copied, setCopied] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const content = (job.finalOutput ?? "").replace(/^>?\s*\*\*Status:\*\*\s*PROPOSAL.*$/gim, "").replace(/\n{3,}/g, "\n\n").trim();

  function handleDownload() {
    const blob = new Blob([`# ${job.title}\n\n${content}`], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${job.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "plan"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleApprove() {
    setApproving(true);
    setApproveError(null);
    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(job.id)}/approve`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setApproveError(data.error ?? "Couldn't approve this plan.");
        return;
      }
      onUpdated(data.job);
    } catch {
      setApproveError("Network error reaching the server.");
    } finally {
      setApproving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-app/60 backdrop-blur-sm" />
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-[#0B1220] border border-[#333333] shadow-2xl">
        <div className="flex items-center gap-3 border-b border-[#333333] bg-[#111827] px-6 py-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-gold ring-1 ring-gold/30">
            <Trophy className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-heading text-lg font-semibold text-white">{job.title}</h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/70">
              <span>Final plan</span>
              <span className="text-white/30">·</span>
              <span className={job.verified ? "text-emerald" : "text-gold"}>{job.verified ? "Research-backed" : "Unverified"}</span>
              {job.approvedAt && (
                <>
                  <span className="text-white/30">·</span>
                  <span className="flex items-center gap-1 text-emerald">
                    <ShieldCheck className="h-3 w-3" /> Approved{job.approvedBy ? ` by ${job.approvedBy}` : ""}
                  </span>
                </>
              )}
            </div>
          </div>
          {onOpenMasterFindings && (
            <button
              type="button"
              onClick={onOpenMasterFindings}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-electric/30 bg-electric/10 px-3 py-1.5 text-xs font-medium text-electric hover:bg-electric/20 transition-colors"
            >
              <Layers className="h-3.5 w-3.5" /> Master Findings
            </button>
          )}
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(content).then(() => setCopied(true))}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/90 hover:bg-white/10"
          >
            {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-r from-electric to-gold px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
          >
            <Download className="h-3.5 w-3.5" /> Download
          </button>
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto bg-[#0B1220] px-6 py-6">
          <div className="mx-auto max-w-3xl rounded-2xl bg-[#111827] border border-[#333333] px-6 py-6 shadow-sm">
            <Markdown content={content} size="base" />
          </div>
        </div>
        <div className="border-t border-border-metal bg-sunken/60 px-6 py-4">
          {role === "owner" ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <RevisePanel job={job} onRevised={onUpdated} />
              </div>
              {job.approvedAt ? (
                <span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald/10 px-3 py-2 text-xs font-semibold text-emerald">
                  <ShieldCheck className="h-3.5 w-3.5" /> Approved {new Date(job.approvedAt).toLocaleString()}
                </span>
              ) : (
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <button
                    type="button"
                    onClick={handleApprove}
                    disabled={approving}
                    className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald to-electric px-4 py-2 text-xs font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {approving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                    Approve plan
                  </button>
                  {approveError && <p className="text-[11px] text-crimson">{approveError}</p>}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-secondary">
              {job.approvedAt
                ? `Approved by ${job.approvedBy ?? "an owner"} on ${new Date(job.approvedAt).toLocaleString()}.`
                : "Pending owner approval — switch to Owner view to approve or request changes."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function ProjectCanvas({
  initialJobId,
  onClose,
  initialShowFinal = false,
}: {
  initialJobId?: string | null;
  onClose?: () => void;
  initialShowFinal?: boolean;
} = {}) {
  const { activeJobId, openJob } = useAppState();
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [showFinal, setShowFinal] = useState(initialShowFinal);
  const [showMasterFindings, setShowMasterFindings] = useState(false);
  const [jobsMenuOpen, setJobsMenuOpen] = useState(false);

  const currentId = initialJobId ?? activeJobId ?? jobs[0]?.id ?? null;

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

  const currentSummary = jobs.find((j) => j.id === currentId) ?? null;
  const runningJobs = jobs.filter((j) => j.status === "running");
  const archivedJobs = jobs.filter((j) => j.status !== "running");
  const visibleJob = job && job.id === currentId ? job : null;
  const graph = useMemo(() => (visibleJob ? buildGraph(visibleJob, selectedStepId) : { nodes: [], edges: [] }), [visibleJob, selectedStepId]);
  const selectedStep = visibleJob?.steps.find((s) => s.id === selectedStepId) ?? null;
  const activeStep = visibleJob?.steps.find((s) => s.status === "active");
  const localFallbackSteps = visibleJob?.steps.filter((s) => s.provider === "ollama") ?? [];

  return (
    <section className="glass-card overflow-hidden rounded-2xl flex flex-col h-full">
      <div className="flex flex-wrap items-center gap-3 border-b border-[#333333] bg-[#0B1220] px-5 py-4 shrink-0">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-electric/15 to-gold/15 text-electric ring-1 ring-border-metal">
          <Sparkles className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-base font-semibold text-white">Live Execution Pipeline</h2>
          <p className="text-xs text-secondary">
            Brief → HQ → research → departments → team review → QA → final plan. Click any node to inspect agent output.
          </p>
        </div>
        {visibleJob && (visibleJob.status === "done" || visibleJob.steps.some((s) => s.output)) && (
          <button
            type="button"
            onClick={() => setShowMasterFindings(true)}
            className="flex items-center gap-1.5 rounded-xl border border-electric/40 bg-electric/15 hover:bg-electric/25 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-colors"
          >
            <Layers className="h-4 w-4 text-electric" /> Master Findings
          </button>
        )}
        {visibleJob?.status === "done" && visibleJob.finalOutput && (
          <button
            type="button"
            onClick={() => setShowFinal(true)}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-electric to-gold px-4 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-95"
          >
            <Trophy className="h-4 w-4" /> View Final Plan
          </button>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[#333333] bg-[#111827] p-2 text-[#CCCCCC] hover:bg-[#1F2937] hover:text-white transition-colors"
            title="Close Inspector"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {jobs.length > 0 && (
        <div className="relative border-b border-[#333333] bg-[#0B1220]/60 px-5 py-3 shrink-0">
          <button
            type="button"
            onClick={() => setJobsMenuOpen((v) => !v)}
            className="flex w-full items-center gap-2 rounded-xl border border-[#333333] bg-[#111827] px-3 py-2 text-left transition-colors hover:border-electric/30 sm:w-auto sm:min-w-[20rem]"
          >
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted" />
            {currentSummary ? (
              <>
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    currentSummary.status === "running"
                      ? "animate-pulse bg-electric"
                      : currentSummary.status === "done"
                        ? "bg-emerald"
                        : "bg-crimson"
                  }`}
                />
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-white">{currentSummary.title}</span>
                <span className="shrink-0 font-mono text-[11px] text-muted">{currentSummary.percent}%</span>
              </>
            ) : (
              <span className="flex-1 text-xs text-muted">Select a project…</span>
            )}
            <span className="shrink-0 font-mono text-[11px] text-muted">{jobs.length}</span>
          </button>

          {jobsMenuOpen && (
            <>
              <button
                type="button"
                aria-label="Close project list"
                className="fixed inset-0 z-40 cursor-default"
                onClick={() => setJobsMenuOpen(false)}
              />
              <div className="absolute left-5 right-5 top-full z-50 mt-1.5 max-h-96 overflow-y-auto rounded-xl border border-[#333333] bg-[#0B1220] p-2 shadow-2xl sm:right-auto sm:w-[26rem]">
                {runningJobs.length > 0 && (
                  <div className="mb-1">
                    <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">Running now</p>
                    <ul className="space-y-0.5">
                      {runningJobs.map((j) => (
                        <li key={j.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedStepId(null);
                              openJob(j.id);
                              setJobsMenuOpen(false);
                            }}
                            className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors ${
                              j.id === currentId ? "bg-electric/15 text-white" : "text-secondary hover:bg-[#111827] hover:text-white"
                            }`}
                          >
                            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-electric" />
                            <span className="min-w-0 flex-1 truncate text-xs font-medium">{j.title}</span>
                            <span className="shrink-0 font-mono text-[11px] text-muted">{j.percent}%</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {archivedJobs.length > 0 && (
                  <div>
                    <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
                      Archive · {archivedJobs.length} project{archivedJobs.length === 1 ? "" : "s"}
                    </p>
                    <ul className="space-y-0.5">
                      {archivedJobs.map((j) => (
                        <li key={j.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedStepId(null);
                              openJob(j.id);
                              setJobsMenuOpen(false);
                            }}
                            className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors ${
                              j.id === currentId ? "bg-electric/15 text-white" : "text-secondary hover:bg-[#111827] hover:text-white"
                            }`}
                          >
                            <span className={`h-2 w-2 shrink-0 rounded-full ${j.status === "done" ? "bg-emerald" : "bg-crimson"}`} />
                            <span className="min-w-0 flex-1 truncate text-xs font-medium">{j.title}</span>
                            <span className="shrink-0 font-mono text-[11px] text-muted">{j.percent}%</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {!visibleJob ? (
        <div className="flex h-[26rem] flex-col items-center justify-center gap-3 px-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sunken text-muted">
            <Workflow className="h-6 w-6" />
          </span>
          <p className="font-heading text-sm font-semibold text-white">{currentId ? "Loading project…" : "No projects yet"}</p>
          {!currentId && (
            <p className="max-w-md text-sm text-secondary">
              Describe a project to the AI Assistant — for example, <em>&quot;my client just started a roofing business and needs a full growth plan&quot;</em>. It will ask a few questions, confirm, then send it to the team. You&apos;ll watch every department work here.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 shrink-0 bg-[#0B1220]">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{visibleJob.title}</p>
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
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#1F2937]">
                <div
                  className={`h-full rounded-full transition-[width] duration-700 ease-out ${
                    visibleJob.status === "error" ? "bg-crimson" : visibleJob.status === "done" ? "bg-emerald" : "bg-gradient-to-r from-electric to-gold"
                  }`}
                  style={{ width: `${visibleJob.percent}%` }}
                />
              </div>
              <span className="w-10 text-right font-mono text-sm font-semibold text-white">{visibleJob.percent}%</span>
            </div>
          </div>

          {localFallbackSteps.length > 0 && (
            <div className="mx-5 mb-3 flex items-start gap-2 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-xs text-secondary shrink-0">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
              <span>
                <span className="font-semibold text-white">Reduced quality:</span> {localFallbackSteps.length} step
                {localFallbackSteps.length === 1 ? "" : "s"} ran on the small local model because no cloud AI provider responded
                (usually a used-up quota). Check <span className="font-medium text-white">Settings → AI Providers</span>, then request a change to redo them.
              </span>
            </div>
          )}

          {(visibleJob.status === "done" || visibleJob.status === "running") && (
            <RevisePanel job={visibleJob} onRevised={setJob} />
          )}

          <div className="relative flex-1 min-h-[30rem] border-t border-[#333333] bg-[#0B1220]">
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
              <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="#333333" />
            </ReactFlow>
            {selectedStep && <StepPanel step={selectedStep} onClose={() => setSelectedStepId(null)} />}
          </div>
        </>
      )}

      {showFinal && visibleJob?.finalOutput && (
        <FinalPlanModal
          job={visibleJob}
          onClose={() => setShowFinal(false)}
          onUpdated={setJob}
          onOpenMasterFindings={() => {
            setShowFinal(false);
            setShowMasterFindings(true);
          }}
        />
      )}
      {showMasterFindings && visibleJob && (
        <MasterFindingsView
          job={visibleJob}
          onClose={() => setShowMasterFindings(false)}
          onOpenFinalPlan={() => {
            setShowMasterFindings(false);
            setShowFinal(true);
          }}
        />
      )}
    </section>
  );
}

export function ProjectInspectorDrawer({
  isOpen,
  onClose,
  jobId,
  initialShowFinal = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  jobId?: string | null;
  initialShowFinal?: boolean;
}) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative flex flex-col h-full max-h-[92vh] w-full max-w-7xl rounded-2xl border border-[#333333] bg-[#0B1220] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <ProjectCanvas initialJobId={jobId} onClose={onClose} initialShowFinal={initialShowFinal} />
      </div>
    </div>
  );
}
