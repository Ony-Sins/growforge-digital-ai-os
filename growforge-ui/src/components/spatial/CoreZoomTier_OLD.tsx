"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Calculator,
  Code,
  Megaphone,
  Palette,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Target,
  TrendingUp,
  Users,
  Zap,
  X,
  Sparkles,
} from "lucide-react";
import { CoreSphere3D, type HubStatus } from "@/components/core/CoreSphere3D";
import type { CoreDeptView, CoreJobView, CoreState, CoreStepView } from "@/lib/coreState";
import { formatDuration, formatTokens, formatUsd } from "@/lib/usage";

const DEPT_META: Record<string, { short: string; icon: React.ElementType }> = {
  "sales-bd": { short: "Revenue & BD", icon: TrendingUp },
  marketing: { short: "Marketing", icon: Megaphone },
  "meta-ads": { short: "Paid Media", icon: Target },
  "finance-ops": { short: "Finance & Ops", icon: Calculator },
  "client-success": { short: "Client Success", icon: Users },
  "web-design": { short: "Design & UX", icon: Palette },
  "web-dev": { short: "Web Engineering", icon: Code },
  "ai-automation": { short: "AI Systems", icon: Bot },
};

export type StageState = "idle" | "queued" | "active" | "done" | "error";

export function stageOf(steps: CoreStepView[]): StageState {
  if (steps.length === 0) return "idle";
  if (steps.some((s) => s.status === "error")) return "error";
  if (steps.some((s) => s.status === "active")) return "active";
  if (steps.every((s) => s.status === "done" || s.status === "skipped")) return "done";
  if (steps.some((s) => s.status === "done")) return "active";
  return "queued";
}

function hubStatus(dept: CoreDeptView): HubStatus {
  if (!dept.assigned) return "unassigned";
  const s = dept.step?.status;
  if (s === "active") return "active";
  if (s === "done") return "done";
  if (s === "error") return "error";
  return "pending";
}

function clean(md: string, max: number): string {
  const text = md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*_`>|]/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

function duration(start?: string, end?: string): string | null {
  if (!start) return null;
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
  return ms > 0 ? formatDuration(ms) : null;
}

function StageDotCanvas({ state }: { state: StageState }) {
  const cls =
    state === "active"
      ? "bg-[#0078ff] shadow-[0_0_12px_rgba(0,120,255,0.8)] animate-pulse"
      : state === "done"
        ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
        : state === "error"
          ? "bg-rose-500"
          : "bg-slate-300";
  return <span className={`h-2.5 w-2.5 rounded-full ${cls}`} />;
}

function StatusPillCanvas({ status }: { status: string }) {
  const map: Record<string, string> = {
    done: "border-emerald-500/30 bg-emerald-50 text-emerald-700 shadow-sm",
    active: "border-[#0078ff]/40 bg-[#0078ff]/10 text-[#0078ff] font-bold shadow-[0_0_12px_rgba(0,120,255,0.15)]",
    running: "border-[#0078ff]/40 bg-[#0078ff]/10 text-[#0078ff] font-bold shadow-[0_0_12px_rgba(0,120,255,0.15)]",
    error: "border-rose-500/30 bg-rose-50 text-rose-700",
    pending: "border-slate-200 bg-slate-100 text-slate-500",
    skipped: "border-slate-200 bg-slate-50 text-slate-400",
  };
  const label = status === "pending" ? "queued" : status;
  return (
    <span className={`rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider ${map[status] ?? map.pending}`}>
      {label}
    </span>
  );
}

type FlowKind = "idle" | "pending" | "done" | "active" | "error" | "focus";
interface Pt {
  x: number;
  y: number;
}
interface FlowSpec {
  id: string;
  d: string;
  kind: FlowKind;
  a: Pt;
  b: Pt;
  dashed?: boolean;
  pulse?: boolean;
  label?: { x: number; y: number; text: string };
}

const FLOW_STYLE_CANVAS: Record<FlowKind, { stroke: string; width: number; opacity: number; glow: number }> = {
  idle: { stroke: "#cbd5e1", width: 1.4, opacity: 0.7, glow: 0 },
  pending: { stroke: "#0078ff", width: 1.6, opacity: 0.45, glow: 0.12 },
  done: { stroke: "#10b981", width: 2.0, opacity: 0.85, glow: 0.3 },
  active: { stroke: "#0078ff", width: 2.4, opacity: 1, glow: 0.6 },
  error: { stroke: "#e11d48", width: 2.0, opacity: 0.85, glow: 0.35 },
  focus: { stroke: "#0078ff", width: 2.8, opacity: 1, glow: 0.65 },
};

function curveH(a: Pt, b: Pt): string {
  const dx = Math.max(48, Math.abs(b.x - a.x) * 0.5);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}
function curveV(a: Pt, b: Pt): string {
  const dy = Math.max(28, Math.abs(b.y - a.y) * 0.5);
  return `M ${a.x} ${a.y} C ${a.x} ${a.y + dy}, ${b.x} ${b.y - dy}, ${b.x} ${b.y}`;
}

function CanvasFlowLayer({ w, h, specs }: { w: number; h: number; specs: FlowSpec[] }) {
  if (!w || !h) return null;
  return (
    <svg className="pointer-events-none absolute inset-0 z-0 hidden lg:block" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <defs>
        <filter id="flow-glow-canvas" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3.5" />
        </filter>
        <style>{`@keyframes flowdash_canvas{to{stroke-dashoffset:-28}}`}</style>
      </defs>
      {specs.map((s) => {
        const c = FLOW_STYLE_CANVAS[s.kind];
        const dash = s.dashed || s.kind === "idle" ? "5 6" : s.kind === "active" ? "9 6" : undefined;
        return (
          <g key={s.id}>
            {c.glow > 0 && <path d={s.d} fill="none" stroke={c.stroke} strokeWidth={c.width + 4} opacity={c.glow} filter="url(#flow-glow-canvas)" />}
            <path
              id={`canvas-fp-${s.id}`}
              d={s.d}
              fill="none"
              stroke={c.stroke}
              strokeWidth={c.width}
              opacity={c.opacity}
              strokeLinecap="round"
              strokeDasharray={dash}
              style={s.kind === "active" ? { animation: "flowdash_canvas 0.9s linear infinite" } : undefined}
            />
            {s.kind !== "idle" && (
              <>
                <circle cx={s.a.x} cy={s.a.y} r={3.4} fill={c.stroke} opacity={0.95} />
                <circle cx={s.b.x} cy={s.b.y} r={2.6} fill={c.stroke} opacity={0.8} />
              </>
            )}
            {s.pulse && (
              <circle r={4.5} fill="#ffc432" opacity={0.95}>
                <animateMotion dur="2.0s" repeatCount="indefinite">
                  <mpath href={`#canvas-fp-${s.id}`} />
                </animateMotion>
              </circle>
            )}
            {s.label && (
              <text x={s.label.x} y={s.label.y} textAnchor="end" fontSize="10" fontFamily="ui-monospace, monospace" fill="#64748b" fontWeight="600">
                {s.label.text}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

const BAND_STYLE_CANVAS: Record<string, string> = {
  direct: "text-emerald-700 border-emerald-500/30 bg-emerald-50",
  confirm: "text-amber-800 border-amber-500/40 bg-amber-50",
  escalate: "text-rose-700 border-rose-500/30 bg-rose-50",
};

export interface CoreZoomTierProps {
  jobState?: CoreState | null;
  initialJobId?: string | null;
  onStageClick?: (stageNumber: number, stageName: string) => void;
  className?: string;
}

export function CoreZoomTier({
  jobState: externalState = null,
  initialJobId = null,
  onStageClick,
  className = "",
}: CoreZoomTierProps) {
  const [internalState, setInternalState] = useState<CoreState | null>(externalState);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(initialJobId);
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [brief, setBrief] = useState("");
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);

  const state = externalState ?? internalState;
  const running = state?.job?.status === "running";

  const load = useCallback(async () => {
    try {
      const qs = selectedJobId ? `?jobId=${encodeURIComponent(selectedJobId)}` : "";
      const res = await fetch(`/api/core/state${qs}`, { cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as CoreState;
      setInternalState(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load CORE state.");
    }
  }, [selectedJobId]);

  useEffect(() => {
    if (externalState) return;
    const first = setTimeout(() => void load(), 0);
    const id = setInterval(() => void load(), running ? 3000 : 12000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [load, running, externalState]);

  const job: CoreJobView | null = state?.job ?? null;

  const focusDept = useMemo(() => {
    if (!job) return null;
    if (selectedDept && job.departments.some((d) => d.id === selectedDept)) return selectedDept;
    return (
      job.departments.find((d) => d.step?.status === "active")?.id ??
      job.departments.find((d) => d.assigned)?.id ??
      job.departments[0]?.id ??
      null
    );
  }, [job, selectedDept]);

  const focus = job?.departments.find((d) => d.id === focusDept) ?? null;
  const steps = useMemo(() => job?.steps ?? [], [job]);
  const plan = steps.find((s) => s.kind === "plan");
  const research = steps.find((s) => s.kind === "research");
  const reconcile = steps.find((s) => s.kind === "reconcile");
  const qa = steps.find((s) => s.kind === "qa");
  const final = steps.find((s) => s.kind === "final");
  const deptSteps = steps.filter((s) => s.kind === "department");

  const stage1 = stageOf(steps.filter((s) => s.kind === "brief" || s.kind === "plan"));
  const stage2 = stageOf(steps.filter((s) => s.kind === "research"));
  const stage3 = stageOf(deptSteps);
  const stage4 = stageOf(steps.filter((s) => s.kind === "reconcile" || s.kind === "qa" || s.kind === "final"));

  // Flow connector geometry
  const flowRef = useRef<HTMLDivElement>(null);
  const anchors = useRef(new Map<string, HTMLElement>());
  const reg = useCallback(
    (key: string) => (el: HTMLElement | null) => {
      if (el) anchors.current.set(key, el);
      else anchors.current.delete(key);
    },
    [],
  );
  const systems = state?.systems;
  const [flow, setFlow] = useState<{ w: number; h: number; specs: FlowSpec[] }>({ w: 0, h: 0, specs: [] });

  const computeFlow = useCallback(() => {
    const root = flowRef.current;
    if (!root || !job) {
      setFlow((f) => (f.specs.length ? { w: 0, h: 0, specs: [] } : f));
      return;
    }
    const rb = root.getBoundingClientRect();
    const rect = (key: string) => anchors.current.get(key)?.getBoundingClientRect() ?? null;
    const at = (key: string, side: "l" | "r" | "t" | "b"): Pt | null => {
      const r = rect(key);
      if (!r) return null;
      return {
        x: (side === "l" ? r.left : side === "r" ? r.right : r.left + r.width / 2) - rb.left,
        y: (side === "t" ? r.top : side === "b" ? r.bottom : r.top + r.height / 2) - rb.top,
      };
    };
    const kindOfStage = (s: StageState): FlowKind =>
      s === "active" ? "active" : s === "done" ? "done" : s === "error" ? "error" : s === "queued" ? "pending" : "idle";

    const specs: FlowSpec[] = [];
    const briefPt = at("brief", "r");
    const routePt = at("route", "l");
    if (briefPt && routePt) {
      specs.push({
        id: "brief-route",
        d: curveH(briefPt, routePt),
        kind: kindOfStage(stage1),
        a: briefPt,
        b: routePt,
        pulse: stage1 === "active",
      });
    }

    const sr = rect("sphere");
    if (sr) {
      const cx = sr.left + sr.width / 2 - rb.left;
      const cy = sr.top + sr.height / 2 - rb.top;
      const R = Math.min(sr.width, sr.height) * 0.4;

      const depts = job.departments;
      depts.forEach((d, i) => {
        const from = at(`dept:${d.id}`, "r");
        if (!from) return;
        const dy = (i - (depts.length - 1) / 2) * ((R * 1.5) / Math.max(depts.length - 1, 1));
        const to = { x: cx - Math.sqrt(Math.max(R * R - dy * dy, 0)) * 0.96, y: cy + dy };
        const st = hubStatus(d);
        const isFocus = focusDept === d.id && d.assigned;
        const kind: FlowKind = isFocus ? "focus" : st === "unassigned" ? "idle" : st === "pending" ? "pending" : st === "active" ? "active" : st === "done" ? "done" : "error";
        specs.push({ id: `dept-${d.id}`, d: curveH(from, to), kind, a: from, b: to, pulse: st === "active" });
      });

      const recall = at("recall", "l");
      if (recall) {
        const from = { x: cx + R * 0.96, y: cy };
        specs.push({
          id: "sphere-review",
          d: curveH(from, recall),
          kind: kindOfStage(stage4 === "idle" && stage3 === "done" ? "queued" : stage4),
          a: from,
          b: recall,
          pulse: stage4 === "active",
        });
      }

      const chipKind: Record<string, FlowKind> = {
        job: steps.some((s) => s.status === "done") ? "done" : "idle",
        plan: final?.status === "done" ? "done" : final?.status === "active" ? "active" : "idle",
        vault: job.status === "done" && systems?.vault.reachable ? "done" : "idle",
      };
      (["job", "plan", "vault"] as const).forEach((k) => {
        const cr = rect(`chip:${k}`);
        if (!cr) return;
        const p = { x: cr.left + cr.width / 2 - rb.left, y: cr.top + cr.height / 2 - rb.top };
        const vx = p.x - cx;
        const vy = p.y - cy;
        const len = Math.hypot(vx, vy) || 1;
        const to = { x: cx + (vx / len) * R * 0.86, y: cy + (vy / len) * R * 0.86 };
        specs.push({ id: `chip-${k}`, d: `M ${p.x} ${p.y} L ${to.x} ${to.y}`, kind: chipKind[k], a: p, b: to });
      });

      const sb = { x: cx, y: cy + R * 0.98 };
      const fc = at("focus", "t");
      if (fc && sb.y < fc.y) {
        const st = focus ? hubStatus(focus) : "unassigned";
        specs.push({ id: "sphere-focus", d: curveV(sb, fc), kind: st === "active" ? "active" : st === "done" ? "done" : "idle", a: sb, b: fc });
      }
    }

    setFlow({ w: rb.width, h: rb.height, specs });
  }, [job, focus, focusDept, stage1, stage3, stage4, steps, final, systems]);

  useLayoutEffect(() => {
    computeFlow();
  }, [computeFlow]);

  useEffect(() => {
    const root = flowRef.current;
    if (!root) return;
    const ro = new ResizeObserver(() => computeFlow());
    ro.observe(root);
    window.addEventListener("resize", computeFlow);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", computeFlow);
    };
  }, [computeFlow, job]);

  const launch = async () => {
    setLaunching(true);
    setLaunchError(null);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; job?: { id: string } };
      if (!res.ok || !body.job) throw new Error(body.error || `HTTP ${res.status}`);
      setBrief("");
      setLauncherOpen(false);
      setSelectedDept(null);
      setSelectedJobId(body.job.id);
      void load();
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : "Could not launch the project.");
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div className={`relative w-full h-full overflow-y-auto text-[#0B1220] select-text font-sans p-4 md:p-8 ${className}`}>
      <div className="mx-auto max-w-[1760px] space-y-6 pb-20">
        {/* Tier Header Bar */}
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-200/80 bg-white/85 px-6 py-4 backdrop-blur-2xl shadow-xl">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0078ff] to-[#ffc432] text-white shadow-lg shadow-[#0078ff]/20">
              <Zap className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-heading font-extrabold text-lg tracking-tight text-slate-950">CORE Live Pipeline</span>
                <span className="rounded-full bg-[#0078ff]/10 border border-[#0078ff]/30 px-2.5 py-0.5 text-[11px] font-mono font-bold text-[#0078ff]">
                  Tier 5 · z=-70
                </span>
                {running && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-mono font-bold text-emerald-700">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                    Executing
                  </span>
                )}
                {loadError && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 border border-rose-500/30 px-2 py-0.5 text-[10px] font-mono font-bold text-rose-700">
                    {loadError}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">Full multi-agent agency execution pipeline grounded in real data</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Job Selector */}
            {state?.jobs && state.jobs.length > 0 && (
              <div className="relative">
                <select
                  value={selectedJobId ?? state.jobs[0]?.id ?? ""}
                  onChange={(e) => {
                    setSelectedJobId(e.target.value);
                    setSelectedDept(null);
                  }}
                  className="rounded-xl border border-slate-200 bg-slate-50/90 py-2 pl-3 pr-8 text-xs font-semibold text-slate-800 shadow-sm focus:border-[#0078ff] focus:outline-none focus:ring-1 focus:ring-[#0078ff]"
                >
                  {state.jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title} ({j.status})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              onClick={() => setLauncherOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-[#0078ff] px-4 py-2 text-xs font-bold text-white shadow-lg shadow-[#0078ff]/25 transition-all hover:bg-[#0066dc] active:scale-95"
            >
              <Plus className="h-4 w-4" />
              <span>New Brief</span>
            </button>
          </div>
        </header>

        {/* 4-STAGE PIPELINE CONTAINER WITH SVG FLOW CONNECTORS */}
        <div ref={flowRef} className="relative rounded-3xl border border-slate-200/90 bg-slate-50/90 p-6 backdrop-blur-xl shadow-2xl">
          <CanvasFlowLayer w={flow.w} h={flow.h} specs={flow.specs} />

          <div className="relative z-10 grid grid-cols-1 gap-6 lg:grid-cols-4">
            {/* STAGE 01: BRIEF & PLAN */}
            <div
              onClick={() => onStageClick?.(1, "Brief & Plan")}
              className="group flex flex-col rounded-2xl border border-slate-200/90 bg-white/90 p-5 shadow-sm backdrop-blur-md transition-all hover:border-[#0078ff]/40 hover:shadow-md"
            >
              <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100 font-mono text-xs font-bold text-slate-700">
                    01
                  </span>
                  <span className="font-heading text-sm font-bold text-slate-900">Brief & Plan</span>
                </div>
                <StageDotCanvas state={stage1} />
              </div>

              {job ? (
                <div className="space-y-3.5 text-xs">
                  <div ref={reg("brief")} className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase font-bold text-slate-400">Client Brief</span>
                      <StatusPillCanvas status={steps.find((s) => s.kind === "brief")?.status ?? "done"} />
                    </div>
                    <p className="line-clamp-3 text-slate-700 font-medium">{job.brief}</p>
                  </div>

                  <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase font-bold text-slate-400">HQ Plan</span>
                      <StatusPillCanvas status={plan?.status ?? "pending"} />
                    </div>
                    <p className="font-semibold text-slate-900 mb-1">{job.title}</p>
                    <p className="text-[11px] text-slate-500">
                      {plan?.preview || `Assigned ${job.departments.filter((d) => d.assigned).length} departments`}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400">No active job loaded.</p>
              )}
            </div>

            {/* STAGE 02: RESEARCH & ROUTE */}
            <div
              onClick={() => onStageClick?.(2, "Research & Route")}
              className="group flex flex-col rounded-2xl border border-slate-200/90 bg-white/90 p-5 shadow-sm backdrop-blur-md transition-all hover:border-[#0078ff]/40 hover:shadow-md"
            >
              <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100 font-mono text-xs font-bold text-slate-700">
                    02
                  </span>
                  <span className="font-heading text-sm font-bold text-slate-900">Research & Route</span>
                </div>
                <StageDotCanvas state={stage2} />
              </div>

              {job ? (
                <div className="space-y-3.5 text-xs">
                  {/* Research Dossier Card */}
                  <div ref={reg("route")} className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase font-bold text-slate-400">Search Dossier</span>
                      <StatusPillCanvas status={research?.status ?? "pending"} />
                    </div>
                    <div className="flex items-center gap-2 font-semibold text-slate-800">
                      <Search className="h-3.5 w-3.5 text-[#0078ff]" />
                      <span>{job.research.sourceCount} Live Verified Sources</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500 line-clamp-2">
                      {research?.preview || "Grounded live market & competitor research"}
                    </p>
                  </div>

                  {/* 8 Department Routing Nodes */}
                  <div className="space-y-1.5 pt-1">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Department Routing ({job.departments.filter((d) => d.assigned).length}/8)
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {job.departments.map((dept) => {
                        const Icon = DEPT_META[dept.id]?.icon || Users;
                        const isAssigned = dept.assigned;
                        const st = hubStatus(dept);
                        const isFocus = focusDept === dept.id;

                        return (
                          <button
                            key={dept.id}
                            ref={reg(`dept:${dept.id}`)}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDept(dept.id);
                            }}
                            className={`flex items-center justify-between rounded-xl border p-2 text-left transition-all ${
                              isFocus
                                ? "border-[#0078ff] bg-[#0078ff]/10 text-[#0078ff] font-bold shadow-sm"
                                : isAssigned
                                  ? "border-slate-200 bg-white text-slate-800 hover:border-slate-300"
                                  : "border-slate-100 bg-slate-50/50 text-slate-400 opacity-60"
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Icon className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate text-[11px] font-medium">{DEPT_META[dept.id]?.short || dept.id}</span>
                            </div>
                            <span
                              className={`h-2 w-2 rounded-full shrink-0 ${
                                st === "active"
                                  ? "bg-[#0078ff] animate-ping"
                                  : st === "done"
                                    ? "bg-emerald-500"
                                    : st === "error"
                                      ? "bg-rose-500"
                                      : isAssigned
                                        ? "bg-amber-400"
                                        : "bg-slate-200"
                              }`}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {/* STAGE 03: EXECUTE (3D CORE & OUTPUT PREVIEW) */}
            <div
              onClick={() => onStageClick?.(3, "Execute")}
              className="group flex flex-col rounded-2xl border border-slate-200/90 bg-white/90 p-5 shadow-sm backdrop-blur-md transition-all hover:border-[#0078ff]/40 hover:shadow-md"
            >
              <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100 font-mono text-xs font-bold text-slate-700">
                    03
                  </span>
                  <span className="font-heading text-sm font-bold text-slate-900">Execute Core</span>
                </div>
                <StageDotCanvas state={stage3} />
              </div>

              {job ? (
                <div className="space-y-3 text-xs">
                  {/* 3D Sphere Box */}
                  <div
                    ref={reg("sphere")}
                    className="relative flex h-48 w-full items-center justify-center overflow-hidden rounded-2xl border border-slate-100 bg-gradient-to-b from-slate-50 to-slate-100/80 shadow-inner"
                  >
                    <CoreSphere3D
                      hubs={job.departments.map((d) => ({ id: d.id, status: hubStatus(d) }))}
                      selectedId={focusDept}
                      onSelect={(id) => setSelectedDept(id)}
                      theme="canvas"
                    />
                    <div className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1.5 rounded-lg bg-white/80 px-2 py-1 text-[10px] font-mono text-slate-600 backdrop-blur-sm shadow-sm border border-slate-200/50">
                      <Sparkles className="h-3 w-3 text-[#ffc432]" />
                      <span>{focus ? DEPT_META[focus.id]?.short : "Idle Core"}</span>
                    </div>
                  </div>

                  {/* Selected Department Live Preview */}
                  {focus && (
                    <div ref={reg("focus")} className="rounded-xl border border-slate-200/80 bg-slate-50/90 p-3">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="font-heading font-bold text-slate-900">{focus.name}</span>
                        <StatusPillCanvas status={focus.step?.status ?? "pending"} />
                      </div>

                      {/* Specialist Blueprint Band */}
                      {focus.blueprint && (
                        <div className="mb-2 flex items-center justify-between rounded-lg border border-slate-200/70 bg-white/80 px-2.5 py-1 text-[10px]">
                          <span className="font-medium text-slate-700 truncate mr-2">
                            Specialist: {focus.blueprint.name}
                          </span>
                          <span className={`rounded px-1.5 py-0.5 font-mono font-bold uppercase ${BAND_STYLE_CANVAS[focus.blueprint.band] || ""}`}>
                            {focus.blueprint.band}
                          </span>
                        </div>
                      )}

                      <div className="max-h-24 overflow-y-auto font-mono text-[11px] text-slate-600 bg-white/90 p-2 rounded-lg border border-slate-100">
                        {focus.step?.preview ? clean(focus.step.preview, 240) : focus.task || "Awaiting execution..."}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* STAGE 04: REVIEW & DELIVER */}
            <div
              onClick={() => onStageClick?.(4, "Review & Deliver")}
              className="group flex flex-col rounded-2xl border border-slate-200/90 bg-white/90 p-5 shadow-sm backdrop-blur-md transition-all hover:border-[#0078ff]/40 hover:shadow-md"
            >
              <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100 font-mono text-xs font-bold text-slate-700">
                    04
                  </span>
                  <span className="font-heading text-sm font-bold text-slate-900">Review & Deliver</span>
                </div>
                <StageDotCanvas state={stage4} />
              </div>

              {job ? (
                <div ref={reg("recall")} className="space-y-3 text-xs">
                  {/* Team Review / Reconcile */}
                  <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase font-bold text-slate-400">Team Review</span>
                      <StatusPillCanvas status={reconcile?.status ?? "pending"} />
                    </div>
                    <p className="text-[11px] text-slate-600">
                      {reconcile?.preview || "Resolving inter-departmental conflicts and alignment"}
                    </p>
                  </div>

                  {/* QA Audit */}
                  <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase font-bold text-slate-400">QA Audit</span>
                      <StatusPillCanvas status={qa?.status ?? "pending"} />
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-800 font-medium">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                      <span>{qa?.preview || "Verifying citations and arithmetic"}</span>
                    </div>
                  </div>

                  {/* Final Plan Output */}
                  <div className="rounded-xl border border-emerald-200/60 bg-emerald-50/40 p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase font-bold text-emerald-700">Consolidated Plan</span>
                      <StatusPillCanvas status={final?.status ?? "pending"} />
                    </div>
                    <p className="line-clamp-2 text-[11px] text-slate-700 font-medium">
                      {job.finalPreview ? clean(job.finalPreview, 120) : "Final plan delivers upon QA sign-off."}
                    </p>
                  </div>

                  {/* Token & Cost Usage */}
                  {job.usage && (
                    <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-2.5 font-mono text-[11px]">
                      <span className="text-slate-500 font-bold">Total Tokens:</span>
                      <span className="font-bold text-slate-900">{formatTokens(job.usage.totalTokens)}</span>
                      <span className="text-emerald-600 font-bold">
                        {job.usage.costUsd !== null ? formatUsd(job.usage.costUsd) : "cost unknown"}
                      </span>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          {/* BOTTOM TELEMETRY / LIVE PROBES FOOTER */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200/80 pt-4 text-xs font-mono text-slate-600">
            <div className="flex items-center gap-4">
              <span className="font-bold uppercase tracking-wider text-slate-400">Live Systems:</span>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${systems?.probes.find((p) => p.id === "ollama")?.online ? "bg-emerald-500" : "bg-rose-500"}`} />
                  Ollama
                </span>
                <span className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${systems?.probes.find((p) => p.id === "searxng")?.online ? "bg-emerald-500" : "bg-rose-500"}`} />
                  SearXNG
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  OmniRoute (Tier 1)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${systems?.vault.reachable ? "bg-emerald-500" : "bg-slate-300"}`} />
                  Vault ({systems?.vault.noteCount ?? 0})
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span>Duration: {duration(job?.createdAt, job?.finishedAt) || "0s"}</span>
              <span>·</span>
              <span>Approvals: {systems?.pendingApprovals ?? 0} pending</span>
            </div>
          </div>
        </div>
      </div>

      {/* LAUNCH NEW BRIEF MODAL */}
      {launcherOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-[#0078ff]" />
                <h3 className="font-heading font-bold text-base text-slate-900">Launch New Business Brief</h3>
              </div>
              <button
                onClick={() => setLauncherOpen(false)}
                className="rounded-xl p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mb-3 text-xs text-slate-500">
              Provide your project requirements or client brief. All 8 departments will plan, research, and execute concurrently.
            </p>

            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="e.g. Launch a high-efficiency solar and energy storage installation firm in Austin, TX..."
              rows={5}
              className="w-full rounded-2xl border border-slate-200 p-3.5 text-xs text-slate-900 placeholder-slate-400 focus:border-[#0078ff] focus:outline-none focus:ring-1 focus:ring-[#0078ff]"
            />

            {launchError && <p className="mt-2 text-xs font-semibold text-rose-600">{launchError}</p>}

            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                onClick={() => setLauncherOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={launch}
                disabled={launching || brief.trim().length < 20}
                className="flex items-center gap-2 rounded-xl bg-[#0078ff] px-5 py-2 text-xs font-bold text-white shadow-lg shadow-[#0078ff]/25 transition-all hover:bg-[#0066dc] disabled:opacity-50"
              >
                {launching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                <span>{launching ? "Launching..." : "Dispatch Pipeline"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
