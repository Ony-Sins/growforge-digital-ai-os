"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Calculator,
  CheckCircle2,
  Code,
  Megaphone,
  Palette,
  Plus,
  RefreshCw,
  Send,
  Target,
  TrendingUp,
  Users,
  X,
  Zap,
} from "lucide-react";
import { CoreSphere3D, type HubStatus } from "@/components/core/CoreSphere3D";
import type { CoreDeptView, CoreJobView, CoreState, CoreStepView } from "@/lib/coreState";
import { formatDuration, formatTokens, formatUsd } from "@/lib/usage";

/* Every number on this page comes from /api/core/state (jobs.json, real usage
 * records, live service probes). Where the data does not exist it says so. */

const DEPT_META: Record<string, { icon: React.ElementType; accent: string; scope: string[] }> = {
  "sales-bd": { icon: TrendingUp, accent: "#38bdf8", scope: ["Market research", "Competitive analysis", "Keyword research", "Trend forecasting"] },
  marketing: { icon: Megaphone, accent: "#f472b6", scope: ["Positioning & brand", "Messaging", "Content strategy", "SEO strategy"] },
  "meta-ads": { icon: Target, accent: "#fb923c", scope: ["Lead generation", "Social media", "Demand generation", "Paid media & CPA/CPL"] },
  "finance-ops": { icon: Calculator, accent: "#fbbf24", scope: ["Pricing", "Revenue & costs", "SOPs", "Capacity"] },
  "client-success": { icon: Users, accent: "#2dd4bf", scope: ["Client onboarding", "Requirements", "Delivery coordination", "Risk tracking"] },
  "web-design": { icon: Palette, accent: "#a78bfa", scope: ["Wireframes & UI", "Design systems", "Conversion", "Accessibility"] },
  "web-dev": { icon: Code, accent: "#60a5fa", scope: ["Site & app build", "Backend & APIs", "Technical SEO", "Deployment"] },
  "ai-automation": { icon: Bot, accent: "#34d399", scope: ["AI agents", "n8n & Zapier workflows", "MCP integrations", "System monitoring"] },
};

type StageState = "idle" | "queued" | "active" | "done" | "error";

function stageOf(steps: CoreStepView[]): StageState {
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

function span(steps: CoreStepView[]): { start?: string; end?: string } {
  const starts = steps.map((s) => s.startedAt).filter(Boolean) as string[];
  const ends = steps.map((s) => s.finishedAt).filter(Boolean) as string[];
  return { start: starts.sort()[0], end: ends.sort().slice(-1)[0] };
}

function elapsed(start?: string, end?: string): string | null {
  if (!start) return null;
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
  return ms > 0 ? formatDuration(ms) : null;
}

function clock(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const STATE_COLOR: Record<StageState | "unassigned", string> = {
  idle: "#475569",
  queued: "#3b82f6",
  active: "#00f5ff",
  done: "#10b981",
  error: "#ef4444",
  unassigned: "#334155",
};

const STEP_LABEL: Record<string, string> = {
  pending: "queued",
  active: "working",
  done: "done",
  error: "failed",
  skipped: "skipped",
};

function Pill({ state, label }: { state: StageState | "unassigned"; label: string }) {
  const c = STATE_COLOR[state];
  return (
    <span
      className="rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider"
      style={{ color: c, borderColor: `${c}66`, background: `${c}18` }}
    >
      {label}
    </span>
  );
}

function deptState(d: CoreDeptView): StageState | "unassigned" {
  if (!d.assigned) return "unassigned";
  const s = d.step?.status;
  if (s === "active") return "active";
  if (s === "done") return "done";
  if (s === "error") return "error";
  return "queued";
}

/* ───────── Connector layer ───────── */
interface Pt {
  x: number;
  y: number;
}
interface Flow {
  id: string;
  d: string;
  color: string;
  live: boolean;
  dim: boolean;
}

function curveH(a: Pt, b: Pt): string {
  const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}

function FlowLayer({ w, h, flows }: { w: number; h: number; flows: Flow[] }) {
  if (!w || !h) return null;
  return (
    <svg className="pointer-events-none absolute inset-0 z-0 hidden lg:block" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <defs>
        <filter id="core-flow-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        <style>{`@keyframes coreflow{to{stroke-dashoffset:-26}}`}</style>
      </defs>
      {flows.map((f) => (
        <g key={f.id} opacity={f.dim ? 0.35 : 1}>
          {!f.dim && <path d={f.d} fill="none" stroke={f.color} strokeWidth={5} opacity={0.35} filter="url(#core-flow-glow)" />}
          <path
            id={`cf-${f.id}`}
            d={f.d}
            fill="none"
            stroke={f.color}
            strokeWidth={f.live ? 2.2 : 1.6}
            strokeLinecap="round"
            strokeDasharray={f.live ? "8 6" : f.dim ? "4 6" : undefined}
            style={f.live ? { animation: "coreflow 0.9s linear infinite" } : undefined}
          />
          {f.live && (
            <circle r={3.5} fill="#ffffff">
              <animateMotion dur="2s" repeatCount="indefinite">
                <mpath href={`#cf-${f.id}`} />
              </animateMotion>
            </circle>
          )}
        </g>
      ))}
    </svg>
  );
}

function Ring({ percent, state }: { percent: number; state: StageState }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const color = STATE_COLOR[state];
  return (
    <div className="relative h-20 w-20 shrink-0">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="#1e293b" strokeWidth="7" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(Math.max(percent, 0), 100) / 100)}
          style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center font-mono text-lg font-bold text-white">{Math.round(percent)}%</div>
    </div>
  );
}

export interface CoreZoomTierProps {
  jobState?: CoreState | null;
  initialJobId?: string | null;
  className?: string;
}

export function CoreZoomTier({ jobState: externalState = null, initialJobId = null, className = "" }: CoreZoomTierProps) {
  const [internalState, setInternalState] = useState<CoreState | null>(externalState);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(initialJobId);
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [brief, setBrief] = useState("");
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const pick = (id: string, scroll = false) => {
    setSelectedDept(id);
    setFlash(id);
    setTimeout(() => setFlash((f) => (f === id ? null : f)), 700);
    if (scroll) setTimeout(() => anchors.current.get(`brief:${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60);
  };

  const state = externalState ?? internalState;
  const job: CoreJobView | null = state?.job ?? null;
  const systems = state?.systems;
  const running = job?.status === "running";

  const load = useCallback(async () => {
    try {
      const qs = selectedJobId ? `?jobId=${encodeURIComponent(selectedJobId)}` : "";
      const res = await fetch(`/api/core/state${qs}`, { cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setInternalState((await res.json()) as CoreState);
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

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  const focusId = useMemo(() => {
    if (!job) return null;
    if (selectedDept && job.departments.some((d) => d.id === selectedDept)) return selectedDept;
    return (
      job.departments.find((d) => d.step?.status === "active")?.id ??
      job.departments.find((d) => d.assigned)?.id ??
      job.departments[0]?.id ??
      null
    );
  }, [job, selectedDept]);
  const nameOf = useCallback((id: string) => job?.departments.find((d) => d.id === id)?.name ?? id, [job]);

  const steps = useMemo(() => job?.steps ?? [], [job]);

  const stages = useMemo(() => {
    const defs: { key: string; label: string; kinds: CoreStepView["kind"][] }[] = [
      { key: "plan", label: "Brief & Planning", kinds: ["brief", "plan"] },
      { key: "research", label: "Research & Intelligence", kinds: ["research"] },
      { key: "execute", label: "Department Execution", kinds: ["department"] },
      { key: "review", label: "Reconciliation & QA", kinds: ["reconcile", "qa"] },
      { key: "final", label: "Final Delivery", kinds: ["final"] },
    ];
    return defs.map((d) => {
      const own = steps.filter((s) => d.kinds.includes(s.kind));
      const t = span(own);
      return { ...d, state: stageOf(own), start: t.start, end: t.end };
    });
  }, [steps]);
  const firstOpen = stages.findIndex((s) => s.state !== "done");
  const stageNumber = firstOpen === -1 ? stages.length : firstOpen + 1;
  const jobState: StageState = !job ? "idle" : job.status === "running" ? "active" : job.status === "done" ? "done" : job.error ? "error" : "queued";

  const activity = useMemo(() => {
    return steps
      .filter((s) => s.startedAt || s.finishedAt)
      .map((s) => {
        const dept = s.departmentId ? nameOf(s.departmentId) : undefined;
        const at = s.finishedAt ?? s.startedAt!;
        return { id: s.id, at, label: s.label, dept, status: s.status };
      })
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 6);
  }, [steps, nameOf]);

  const deptTokens = useMemo(() => {
    const rows = (job?.departments ?? [])
      .filter((d) => (d.step?.tokens ?? 0) > 0)
      .map((d) => ({ id: d.id, tokens: d.step!.tokens as number, cost: d.step!.costKnown ? d.step!.costUsd : null }));
    const total = rows.reduce((s, r) => s + r.tokens, 0);
    return { rows: rows.sort((a, b) => b.tokens - a.tokens), total };
  }, [job]);

  /* ── connectors, measured against an unpadded root so coordinates line up ── */
  const rootRef = useRef<HTMLDivElement>(null);
  const anchors = useRef(new Map<string, HTMLElement>());
  const reg = useCallback(
    (key: string) => (el: HTMLElement | null) => {
      if (el) anchors.current.set(key, el);
      else anchors.current.delete(key);
    },
    [],
  );
  const [flow, setFlow] = useState<{ w: number; h: number; flows: Flow[] }>({ w: 0, h: 0, flows: [] });

  const computeFlow = useCallback(() => {
    const root = rootRef.current;
    const sphere = anchors.current.get("sphere");
    if (!root || !sphere || !job) {
      setFlow((f) => (f.flows.length ? { w: 0, h: 0, flows: [] } : f));
      return;
    }
    const rb = root.getBoundingClientRect();
    const sr = sphere.getBoundingClientRect();
    const cx = sr.left + sr.width / 2 - rb.left;
    const cy = sr.top + sr.height / 2 - rb.top;
    const R = Math.min(sr.width, sr.height) * 0.4;
    const depts = job.departments;
    const flows: Flow[] = [];
    depts.forEach((d, i) => {
      const el = anchors.current.get(`dept:${d.id}`);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const from = { x: r.right - rb.left, y: r.top + r.height / 2 - rb.top };
      const dy = (i - (depts.length - 1) / 2) * ((R * 1.5) / Math.max(depts.length - 1, 1));
      const to = { x: cx - Math.sqrt(Math.max(R * R - dy * dy, 0)) * 0.96, y: cy + dy };
      const st = deptState(d);
      const isFocus = focusId === d.id && d.assigned;
      flows.push({
        id: d.id,
        d: curveH(from, to),
        color: isFocus ? "#00f5ff" : STATE_COLOR[st],
        live: st === "active",
        dim: st === "unassigned",
      });
    });
    setFlow({ w: rb.width, h: rb.height, flows });
  }, [job, focusId]);

  useLayoutEffect(() => {
    computeFlow();
  }, [computeFlow]);

  useEffect(() => {
    const root = rootRef.current;
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
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : "Could not launch the project.");
    } finally {
      setLaunching(false);
    }
  };

  const usage = job?.usage ?? null;

  return (
    <div className={`text-[#E0E6ED] ${className}`}>
      <style>{`@keyframes coreglow{0%{box-shadow:0 0 0 0 rgba(0,245,255,.65)}100%{box-shadow:0 0 30px 8px rgba(0,245,255,0)}}`}</style>
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center gap-4 rounded-2xl border border-[#1E293B] bg-[#070B14]/85 p-4 backdrop-blur-xl">
        <Ring percent={job?.percent ?? 0} state={jobState} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-white">Live Pipeline</h1>
            {job && <Pill state={jobState} label={job.status === "running" ? "executing" : job.status} />}
            {job && !job.verified && job.status === "done" && <Pill state="queued" label="unverified research" />}
          </div>
          <p className="mt-0.5 truncate text-sm font-semibold text-slate-200">{job ? job.title || "Untitled project" : "No project yet"}</p>
          <p className="mt-0.5 line-clamp-1 text-xs text-slate-400">{job ? clean(job.brief, 180) : "Launch a brief and the departments start working on it."}</p>
        </div>
        {job && (
          <div className="hidden text-right sm:block">
            <div className="font-mono text-[11px] uppercase tracking-wider text-slate-400">
              Stage {stageNumber} / {stages.length}
            </div>
            <div className="text-sm font-semibold text-slate-200">{stages[Math.min(stageNumber, stages.length) - 1]?.label}</div>
            <div className="font-mono text-[11px] text-slate-500">{elapsed(job.createdAt, job.finishedAt)} elapsed</div>
          </div>
        )}
        <div className="flex items-center gap-2">
          {state && state.jobs.length > 0 && (
            <select
              aria-label="Select project"
              value={job?.id ?? ""}
              onChange={(e) => {
                setSelectedJobId(e.target.value);
                setSelectedDept(null);
              }}
              className="max-w-[220px] rounded-lg border border-[#1E293B] bg-[#0B1220] px-3 py-2 text-xs font-semibold text-slate-200 outline-none focus:border-cyan-400"
            >
              {state.jobs
                .filter((j) => !j.isTest || j.id === job?.id)
                .map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title} ({j.status})
                  </option>
                ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => setLauncherOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3.5 py-2 text-xs font-bold text-slate-950 shadow-[0_0_18px_rgba(0,245,255,0.35)] transition duration-200 hover:bg-cyan-400 hover:shadow-[0_0_28px_rgba(0,245,255,0.6)] active:scale-[0.97]"
          >
            <Plus className="h-4 w-4" /> New Brief
          </button>
        </div>
      </div>

      {loadError && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs text-red-200">
          <AlertTriangle className="h-4 w-4" /> Could not load live state: {loadError}
        </div>
      )}

      {!job ? (
        <div className="rounded-2xl border border-dashed border-[#1E293B] bg-[#070B14]/70 p-12 text-center text-sm text-slate-400">
          {state ? "No projects have run yet. Use New Brief to start one." : "Loading live state…"}
        </div>
      ) : (
        <>
          {/* Departments ↔ Core ↔ Side panels. No padding on this root, so connector coordinates are exact. */}
          <div ref={rootRef} className="relative grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)_320px]">
            <FlowLayer w={flow.w} h={flow.h} flows={flow.flows} />

            <div className="relative z-10 flex flex-col gap-2">
              <div className="px-1 font-mono text-[11px] uppercase tracking-wider text-slate-400">{job.departments.length} departments</div>
              {job.departments.map((d) => {
                const meta = DEPT_META[d.id];
                const Icon = meta?.icon ?? Bot;
                const st = deptState(d);
                const step = d.step;
                const isFocus = focusId === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    ref={reg(`dept:${d.id}`)}
                    onClick={() => d.assigned && pick(d.id, true)}
                    disabled={!d.assigned}
                    style={flash === d.id ? { animation: "coreglow 0.7s ease-out" } : undefined}
                    className={`group rounded-xl border bg-[#0B1220]/90 p-2.5 text-left transition duration-200 ${
                      isFocus
                        ? "border-cyan-400 shadow-[0_0_18px_rgba(0,245,255,0.25)]"
                        : "border-[#1E293B] hover:border-cyan-400/50 hover:shadow-[0_0_16px_rgba(0,245,255,0.16)]"
                    } ${d.assigned ? "active:shadow-[0_0_26px_rgba(0,245,255,0.4)]" : "opacity-45"}`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                        style={{ background: `${meta?.accent ?? "#64748b"}22`, color: meta?.accent ?? "#94a3b8" }}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold leading-tight text-slate-100">{d.name}</div>
                        <div className="mt-0.5 truncate text-[11px] text-slate-400" title={d.task}>
                          {d.assigned ? (d.task ? clean(d.task, 70) : "Assigned") : "Not needed for this project"}
                        </div>
                      </div>
                      <Pill state={st} label={st === "unassigned" ? "unused" : STEP_LABEL[step?.status ?? "pending"]} />
                    </div>
                    {meta?.scope && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {meta.scope.map((t) => (
                          <span key={t} className="rounded border border-[#1E293B] bg-[#070B14] px-1.5 py-px text-[10px] text-slate-400">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                    {d.assigned && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#1e293b]">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${step?.percent ?? 0}%`, background: STATE_COLOR[st], boxShadow: `0 0 8px ${STATE_COLOR[st]}` }}
                          />
                        </div>
                        <span className="w-9 text-right font-mono text-[11px] text-slate-300">{Math.round(step?.percent ?? 0)}%</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="relative z-10 flex flex-col items-center justify-center">
              <div ref={reg("sphere")} className="relative w-full">
                <CoreSphere3D
                  hubs={job.departments.map((d) => ({ id: d.id, status: hubStatus(d) }))}
                  selectedId={focusId}
                  onSelect={(id) => {
                    if (job.departments.find((d) => d.id === id)?.assigned) setSelectedDept(id);
                  }}
                />
              </div>
              <div className="-mt-6 text-center">
                <div className="text-lg font-bold tracking-wide text-white">CORE</div>
                <div className="text-xs text-slate-400">
                  Routing {job.departments.filter((d) => d.assigned).length} of {job.departments.length} departments
                </div>
              </div>
            </div>

            <div className="relative z-10 flex flex-col gap-3">
              <section className="rounded-xl border border-[#1E293B] bg-[#0B1220]/90 p-3.5">
                <h3 className="mb-2 text-[13px] font-bold text-white">Cost &amp; Token Usage</h3>
                {usage ? (
                  <>
                    <div className="flex items-end justify-between">
                      <div>
                        <div className="text-[11px] text-slate-400">Total cost</div>
                        <div className="font-mono text-2xl font-bold text-white">
                          {usage.costUsd !== null ? formatUsd(usage.costUsd) : "unknown"}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[11px] text-slate-400">Tokens · {usage.calls} calls</div>
                        <div className="font-mono text-lg font-bold text-cyan-300">{formatTokens(usage.totalTokens)}</div>
                      </div>
                    </div>
                    {!usage.allCostsKnown && (
                      <p className="mt-1 text-[11px] text-amber-300">Some models have no known price, so this total covers only priced calls.</p>
                    )}
                    <div className="mt-3 space-y-1.5">
                      {usage.providers.map((p) => (
                        <div key={`${p.provider}:${p.model}`}>
                          <div className="flex justify-between text-[11px]">
                            <span className="truncate text-slate-200">{p.model}</span>
                            <span className="font-mono text-slate-400">
                              {formatTokens(p.tokens)} · {usage.totalTokens ? Math.round((p.tokens / usage.totalTokens) * 100) : 0}%
                            </span>
                          </div>
                          <div className="h-1 overflow-hidden rounded-full bg-[#1e293b]">
                            <div className="h-full rounded-full bg-cyan-400" style={{ width: `${usage.totalTokens ? (p.tokens / usage.totalTokens) * 100 : 0}%` }} />
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {p.provider} · {p.calls} call{p.calls === 1 ? "" : "s"}
                          </div>
                        </div>
                      ))}
                    </div>
                    {deptTokens.rows.length > 0 && (
                      <div className="mt-3 border-t border-[#1E293B] pt-2">
                        <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-slate-500">Where the tokens went</div>
                        {deptTokens.rows.map((r) => (
                          <div key={r.id} className="flex justify-between gap-2 text-[11px]">
                            <span className="min-w-0 truncate text-slate-300" title={nameOf(r.id)}>{nameOf(r.id)}</span>
                            <span className="shrink-0 font-mono text-slate-400">
                              {formatTokens(r.tokens)} · {Math.round((r.tokens / deptTokens.total) * 100)}%{r.cost !== null ? ` · ${formatUsd(r.cost)}` : ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-slate-400">No token usage was recorded for this project.</p>
                )}
              </section>

              <section className="rounded-xl border border-[#1E293B] bg-[#0B1220]/90 p-3.5">
                <h3 className="mb-2 text-[13px] font-bold text-white">Live Activity</h3>
                {activity.length === 0 ? (
                  <p className="text-xs text-slate-400">No steps have started yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {activity.map((a) => (
                      <li key={a.id} className="flex items-start gap-2.5">
                        <span
                          className="mt-1 h-2 w-2 shrink-0 rounded-full"
                          style={{ background: STATE_COLOR[a.status === "done" ? "done" : a.status === "error" ? "error" : a.status === "active" ? "active" : "queued"] }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12px] font-semibold text-slate-200">{a.dept ?? a.label}</div>
                          <div className="truncate text-[11px] text-slate-400">{a.dept && a.label !== a.dept ? a.label : STEP_LABEL[a.status]}</div>
                        </div>
                        <span className="font-mono text-[10px] text-slate-500">{clock(a.at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {systems && (
                <section className="rounded-xl border border-[#1E293B] bg-[#0B1220]/90 p-3.5">
                  <h3 className="mb-2 text-[13px] font-bold text-white">Live Systems</h3>
                  <ul className="space-y-1">
                    {systems.probes.map((p) => (
                      <li key={p.id} className="flex items-center justify-between text-[11px]">
                        <span className="flex items-center gap-2 text-slate-300">
                          <span className={`h-2 w-2 rounded-full ${p.online ? "bg-emerald-400" : "bg-red-500"}`} />
                          {p.label}
                        </span>
                        <span className="font-mono text-slate-500">{p.online ? p.detail : p.detail}</span>
                      </li>
                    ))}
                    <li className="flex justify-between pt-1 text-[11px] text-slate-400">
                      <span>Routing</span>
                      <span className="font-mono">{systems.routing}</span>
                    </li>
                    <li className="flex justify-between text-[11px] text-slate-400">
                      <span>Awaiting your approval</span>
                      <span className="font-mono">{systems.pendingApprovals}</span>
                    </li>
                  </ul>
                </section>
              )}
            </div>
          </div>

          {/* Pipeline stages */}
          <div className="mt-5 grid gap-2 rounded-2xl border border-[#1E293B] bg-[#070B14]/85 p-3 sm:grid-cols-2 lg:grid-cols-5">
            {stages.map((s, i) => (
              <div
                key={s.key}
                className="rounded-xl border p-3"
                style={{
                  borderColor: s.state === "active" ? "#00f5ff88" : "#1E293B",
                  background: s.state === "active" ? "rgba(0,245,255,0.06)" : "#0B1220",
                  boxShadow: s.state === "active" ? "0 0 18px rgba(0,245,255,0.18)" : undefined,
                }}
              >
                <div className="flex items-center gap-2">
                  {s.state === "done" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full border font-mono text-[9px]" style={{ borderColor: STATE_COLOR[s.state], color: STATE_COLOR[s.state] }}>
                      {i + 1}
                    </span>
                  )}
                  <span className="text-[12px] font-semibold text-slate-100">{s.label}</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px]">
                  <Pill state={s.state} label={s.state === "queued" ? "waiting" : s.state} />
                  <span className="font-mono text-slate-500">
                    {s.state === "idle" ? "not started" : s.end ? `${clock(s.start)} → ${clock(s.end)}` : s.start ? `since ${clock(s.start)}` : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Every department's brief. The selected one is expanded; the rest show a one-line preview. */}
          <div className="mt-5 space-y-2">
            <div className="px-1 font-mono text-[11px] uppercase tracking-wider text-slate-400">Department briefs</div>
            {job.departments
              .filter((d) => d.assigned)
              .map((d) => {
                const step = d.step;
                const open = focusId === d.id;
                const st = deptState(d);
                return (
                  <div
                    key={d.id}
                    ref={reg(`brief:${d.id}`)}
                    className={`rounded-2xl border bg-[#070B14]/85 transition duration-200 ${
                      open ? "border-cyan-400/60 shadow-[0_0_20px_rgba(0,245,255,0.15)]" : "border-[#1E293B] hover:border-cyan-400/40 hover:shadow-[0_0_16px_rgba(0,245,255,0.12)]"
                    }`}
                    style={flash === d.id ? { animation: "coreglow 0.7s ease-out" } : undefined}
                  >
                    <button type="button" onClick={() => pick(d.id)} className="flex w-full items-center gap-3 p-3.5 text-left active:opacity-90">
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-white">{d.name}</span>
                          <Pill state={st} label={STEP_LABEL[step?.status ?? "pending"]} />
                          {d.blueprint && (
                            <span className="rounded-md border border-[#1E293B] bg-[#0B1220] px-2 py-0.5 text-[11px] text-slate-300">
                              Specialist: {d.blueprint.name} · {d.blueprint.band}
                            </span>
                          )}
                        </span>
                        {!open && (
                          <span className="mt-1 block truncate text-xs text-slate-400">
                            {step && step.outputChars > 0 ? clean(step.preview, 200) : d.task ? clean(d.task, 200) : "No output yet"}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-slate-500">
                        {step?.tokens != null ? `${formatTokens(step.tokens)} tokens` : "no usage"}
                      </span>
                    </button>
                    {open && (
                      <div className="border-t border-[#1E293B] p-4 pt-3">
                        {d.task && (
                          <div>
                            <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Assigned task</div>
                            <p className="mt-1 text-sm leading-relaxed text-slate-200">{clean(d.task, 500)}</p>
                          </div>
                        )}
                        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          {[
                            { k: "Tokens", v: step?.tokens != null ? formatTokens(step.tokens) : "not recorded" },
                            { k: "Cost", v: step?.costKnown && step.costUsd !== null ? formatUsd(step.costUsd) : "not recorded" },
                            { k: "Time", v: elapsed(step?.startedAt, step?.finishedAt) ?? "not started" },
                            { k: "Model", v: step?.provider ?? "not recorded" },
                          ].map((m) => (
                            <div key={m.k} className="rounded-lg border border-[#1E293B] bg-[#0B1220] p-2.5">
                              <div className="text-[11px] text-slate-400">{m.k}</div>
                              <div className="truncate font-mono text-sm font-semibold text-slate-100">{m.v}</div>
                            </div>
                          ))}
                        </div>
                        {step?.error && <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 p-2.5 text-xs text-red-200">{step.error}</p>}
                        {step && step.outputChars > 0 && (
                          <div className="mt-3">
                            <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                              What it produced · {step.outputChars.toLocaleString()} characters · {step.sourceCount} sources
                            </div>
                            <p className="mt-1 text-sm leading-relaxed text-slate-300">{clean(step.preview, 600)}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </>
      )}

      {launcherOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-[#1E293B] bg-[#0B1220] p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-white">
                <Zap className="h-5 w-5 text-cyan-400" />
                <h3 className="text-base font-bold">New Brief</h3>
              </div>
              <button type="button" aria-label="Close" onClick={() => setLauncherOpen(false)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-3 text-xs text-slate-400">Describe the project in plain words. CORE decides which departments are needed.</p>
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={5}
              placeholder="What do you want built or done, for whom, and what does success look like?"
              className="mb-3 w-full rounded-lg border border-[#1E293B] bg-[#070B14] p-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400"
            />
            {launchError && <p className="mb-3 text-xs text-red-300">{launchError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setLauncherOpen(false)} className="rounded-lg border border-[#1E293B] px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-[#111827]">
                Cancel
              </button>
              <button
                type="button"
                onClick={launch}
                disabled={launching || brief.trim().length < 20}
                className="flex items-center gap-2 rounded-lg bg-cyan-500 px-5 py-2 text-xs font-bold text-slate-950 disabled:opacity-50"
              >
                {launching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {launching ? "Launching…" : "Dispatch"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
