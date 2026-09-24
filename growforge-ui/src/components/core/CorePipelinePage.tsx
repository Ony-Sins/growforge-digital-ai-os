"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  Calculator,
  CheckCircle2,
  Code,
  Layers,
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

const NAV = [
  { label: "HOME", href: "/?tier=home" },
  { label: "BRAIN", href: "/?tier=brain" },
  { label: "DASHBOARD", href: "/" },
  { label: "CORE", href: "/core", active: true },
  { label: "PROJECTS", href: "/workspace?view=workflows" },
];

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

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 32);
  }
}

function duration(start?: string, end?: string): string | null {
  if (!start) return null;
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
  return ms > 0 ? formatDuration(ms) : null;
}

function StageDot({ state }: { state: StageState }) {
  const cls =
    state === "active"
      ? "bg-emerald-400 animate-ping"
      : state === "done"
        ? "bg-emerald-400"
        : state === "error"
          ? "bg-red-400"
          : "bg-cyan-500/50";
  return <span className={`h-2 w-2 rounded-full ${cls}`} />;
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    done: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    active: "border-cyan-400/50 bg-cyan-500/10 text-cyan-300",
    running: "border-cyan-400/50 bg-cyan-500/10 text-cyan-300",
    error: "border-red-500/40 bg-red-500/10 text-red-300",
    pending: "border-[#1E293B] bg-[#0B1220] text-gray-400",
    skipped: "border-[#1E293B] bg-[#0B1220] text-gray-500",
  };
  const label = status === "pending" ? "queued" : status;
  return (
    <span className={`rounded-md border px-1.5 py-0.5 font-mono text-xs font-semibold uppercase tracking-wide ${map[status] ?? map.pending}`}>
      {label}
    </span>
  );
}

/* ───────── Connector layer ─────────
 * Curved lines between the real nodes. Every line's look comes from the real
 * status of the step it represents: dim dashed = not used, cyan = queued,
 * emerald = finished, green flowing + travelling pulse = running right now.
 */
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

const FLOW_STYLE: Record<FlowKind, { stroke: string; width: number; opacity: number; glow: number }> = {
  idle: { stroke: "#475569", width: 1.2, opacity: 0.65, glow: 0 },
  pending: { stroke: "#22d3ee", width: 1.4, opacity: 0.45, glow: 0.12 },
  done: { stroke: "#10b981", width: 1.8, opacity: 0.8, glow: 0.3 },
  active: { stroke: "#00ff88", width: 2.2, opacity: 1, glow: 0.5 },
  error: { stroke: "#ef4444", width: 1.8, opacity: 0.85, glow: 0.3 },
  focus: { stroke: "#00F5FF", width: 2.6, opacity: 1, glow: 0.55 },
};

function curveH(a: Pt, b: Pt): string {
  const dx = Math.max(48, Math.abs(b.x - a.x) * 0.5);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}
function curveV(a: Pt, b: Pt): string {
  const dy = Math.max(28, Math.abs(b.y - a.y) * 0.5);
  return `M ${a.x} ${a.y} C ${a.x} ${a.y + dy}, ${b.x} ${b.y - dy}, ${b.x} ${b.y}`;
}

function FlowLayer({ w, h, specs }: { w: number; h: number; specs: FlowSpec[] }) {
  if (!w || !h) return null;
  return (
    <svg className="pointer-events-none absolute inset-0 z-0 hidden lg:block" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <defs>
        <filter id="flow-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3.5" />
        </filter>
        <style>{`@keyframes flowdash{to{stroke-dashoffset:-28}}`}</style>
      </defs>
      {specs.map((s) => {
        const c = FLOW_STYLE[s.kind];
        const dash = s.dashed || s.kind === "idle" ? "5 6" : s.kind === "active" ? "9 6" : undefined;
        return (
          <g key={s.id}>
            {c.glow > 0 && <path d={s.d} fill="none" stroke={c.stroke} strokeWidth={c.width + 4} opacity={c.glow} filter="url(#flow-glow)" />}
            <path
              id={`fp-${s.id}`}
              d={s.d}
              fill="none"
              stroke={c.stroke}
              strokeWidth={c.width}
              opacity={c.opacity}
              strokeLinecap="round"
              strokeDasharray={dash}
              style={s.kind === "active" ? { animation: "flowdash 0.9s linear infinite" } : undefined}
            />
            {s.kind !== "idle" && (
              <>
                <circle cx={s.a.x} cy={s.a.y} r={3.2} fill={c.stroke} opacity={0.95} />
                <circle cx={s.b.x} cy={s.b.y} r={2.4} fill={c.stroke} opacity={0.7} />
              </>
            )}
            {s.pulse && (
              <circle r={4} fill="#ffffff" opacity={0.95}>
                <animateMotion dur="2.2s" repeatCount="indefinite">
                  <mpath href={`#fp-${s.id}`} />
                </animateMotion>
              </circle>
            )}
            {s.label && (
              <text x={s.label.x} y={s.label.y} textAnchor="end" fontSize="10" fontFamily="ui-monospace, monospace" fill="#94a3b8">
                {s.label.text}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

const BAND_LABEL: Record<string, string> = { direct: "direct", confirm: "confirm", escalate: "escalate" };
const BAND_STYLE: Record<string, string> = {
  direct: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10",
  confirm: "text-amber-300 border-amber-500/40 bg-amber-500/10",
  escalate: "text-red-300 border-red-500/40 bg-red-500/10",
};

export function CorePipelinePage({ initialJobId = null, warp = false }: { initialJobId?: string | null; warp?: boolean }) {
  // Arriving from the dashboard dive: CORE surfaces out of the light burst.
  const [emerging, setEmerging] = useState(warp);
  const [warpVisible, setWarpVisible] = useState(warp);
  useEffect(() => {
    if (!warp) return;
    const t = setTimeout(() => setWarpVisible(false), 1800);
    return () => clearTimeout(t);
  }, [warp]);
  const [state, setState] = useState<CoreState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(initialJobId);
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [brief, setBrief] = useState("");
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const running = state?.job?.status === "running";

  const load = useCallback(async () => {
    try {
      const qs = selectedJobId ? `?jobId=${encodeURIComponent(selectedJobId)}` : "";
      const res = await fetch(`/api/core/state${qs}`, { cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setState((await res.json()) as CoreState);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load CORE state.");
    }
  }, [selectedJobId]);

  // Poll fast while a job is running (so progress is real and visible), slowly otherwise.
  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const id = setInterval(() => void load(), running ? 3000 : 15000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [load, running]);

  // Keep the elapsed-time readouts moving only while something is running.
  const runningRef = useRef(running);
  useEffect(() => {
    runningRef.current = running;
  }, [running]);
  useEffect(() => {
    const id = setInterval(() => {
      if (runningRef.current) setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const job: CoreJobView | null = state?.job ?? null;

  // Follow the department that is doing work; otherwise the first assigned one.
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

  // ── connector geometry, measured from the real laid-out nodes ──
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
    const kindOfStage = (s: StageState): FlowKind => (s === "active" ? "active" : s === "done" ? "done" : s === "error" ? "error" : s === "queued" ? "pending" : "idle");

    const specs: FlowSpec[] = [];
    const brief = at("brief", "r");
    const route = at("route", "l");
    if (brief && route) specs.push({ id: "brief-route", d: curveH(brief, route), kind: kindOfStage(stage1), a: brief, b: route, pulse: stage1 === "active" });

    // Sphere geometry: the WebGL sphere fills ~80% of its box height.
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

      // Sphere → review & deliver
      const recall = at("recall", "l");
      if (recall) {
        const from = { x: cx + R * 0.96, y: cy };
        specs.push({ id: "sphere-review", d: curveH(from, recall), kind: kindOfStage(stage4 === "idle" && stage3 === "done" ? "queued" : stage4), a: from, b: recall, pulse: stage4 === "active" });
      }

      // Output chips → sphere
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

      // Sphere → the selected department's output card
      const sb = { x: cx, y: cy + R * 0.98 };
      const fc = at("focus", "t");
      if (fc && sb.y < fc.y) {
        const st = focus ? hubStatus(focus) : "unassigned";
        specs.push({ id: "sphere-focus", d: curveV(sb, fc), kind: st === "active" ? "active" : st === "done" ? "done" : "idle", a: sb, b: fc });
      }
    }

    // Change-request loop: the review stage feeds back to the start (HQ redoes only what's affected).
    const rv = at("review", "b");
    const bf = at("brief", "b");
    if (rv && bf) {
      const yb = Math.max(rv.y, bf.y) + 58;
      const pa = { x: rv.x, y: rv.y + 2 };
      const pb = { x: bf.x, y: bf.y + 2 };
      specs.push({
        id: "loop",
        d: `M ${pa.x} ${pa.y} C ${pa.x} ${yb}, ${pb.x} ${yb}, ${pb.x} ${pb.y}`,
        kind: "idle",
        dashed: true,
        a: pa,
        b: pb,
        label: { x: pa.x, y: pa.y + 24, text: "↺ change request → HQ re-runs only the affected stages" },
      });
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
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : "Could not launch the project.");
    } finally {
      setLaunching(false);
    }
  };

  void tick;

  return (
    <div
      className={`min-h-screen w-full bg-[#050811] font-inter text-[#E0E6ED] selection:bg-cyan-500/30 selection:text-cyan-200 ${emerging ? "core-emerge" : ""}`}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget) setEmerging(false);
      }}
    >
      {warpVisible && (
        <div className="pointer-events-none fixed inset-0 z-[200] overflow-hidden" aria-hidden>
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="h-[150vmax] w-[150vmax] shrink-0 rounded-full"
              style={{
                background: "radial-gradient(circle, #ffffff 0%, #a5f3fc 7%, rgba(0,245,255,0.55) 19%, rgba(5,8,17,0) 55%)",
                animation: "warp-burst 1.2s cubic-bezier(0.2,0.7,0.2,1) both",
              }}
            />
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="h-[150vmax] w-[150vmax] shrink-0"
              style={{
                background: "repeating-conic-gradient(from 0deg, rgba(103,232,249,0.8) 0deg 0.35deg, transparent 0.35deg 2.6deg)",
                WebkitMaskImage: "radial-gradient(circle, transparent 5%, #000 26%, transparent 66%)",
                maskImage: "radial-gradient(circle, transparent 5%, #000 26%, transparent 66%)",
                animation: "warp-streaks 1.1s cubic-bezier(0.25,0.6,0.3,1) both",
              }}
            />
          </div>
        </div>
      )}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-25" />
      <div className="pointer-events-none fixed left-1/4 top-0 h-[500px] w-[600px] bg-gradient-to-br from-cyan-600/10 via-emerald-600/10 to-transparent blur-[120px]" />
      <div className="pointer-events-none fixed bottom-0 right-1/4 h-[400px] w-[500px] bg-gradient-to-tl from-purple-600/10 via-blue-600/10 to-transparent blur-[120px]" />

      {/* Top navigation */}
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-[#1E293B] bg-[#070B14]/90 px-4 py-3.5 backdrop-blur-xl sm:px-8">
        <div className="flex items-center gap-4 sm:gap-6">
          <Link
            href="/"
            className="group flex items-center gap-2 rounded-xl border border-[#333333] bg-[#0B1220] px-3 py-1.5 text-[13px] font-medium text-[#CCCCCC] transition-all hover:border-cyan-400 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-cyan-400 transition-transform group-hover:-translate-x-0.5" />
            <span>Dashboard</span>
          </Link>
          <nav className="hidden items-center gap-1 rounded-xl border border-[#1E293B] bg-[#0B1220]/75 p-1 lg:flex">
            {NAV.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                aria-current={item.active ? "page" : undefined}
                className={
                  item.active
                    ? "rounded-lg border border-cyan-500/40 bg-cyan-950/60 px-3.5 py-1 text-[13px] font-bold text-cyan-400 shadow-[0_0_12px_rgba(0,245,255,0.25)]"
                    : "rounded-lg px-3 py-1 text-[13px] font-medium text-gray-400 transition-colors hover:bg-[#111827] hover:text-white"
                }
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <button
          type="button"
          onClick={() => setLauncherOpen((v) => !v)}
          className="flex items-center gap-2 rounded-xl border border-cyan-500/50 bg-gradient-to-r from-cyan-500/20 via-emerald-500/20 to-cyan-500/20 px-4 py-2 text-[13px] font-bold text-cyan-300 shadow-[0_0_20px_rgba(0,245,255,0.2)] transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          {launcherOpen ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          <span>{launcherOpen ? "Close" : "New Brief"}</span>
        </button>
      </header>

      <main className="relative mx-auto max-w-[1760px] space-y-10 px-4 py-10 sm:px-10 sm:py-14">
        {/* Hero */}
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-mono text-[13px] font-semibold tracking-wider text-emerald-400">
              <span className="text-cyan-400">{"//"}</span>
              <span>CORE · LIVE EXECUTION</span>
              <span className={`ml-1 h-1.5 w-1.5 rounded-full ${running ? "animate-ping bg-emerald-400" : "bg-cyan-500/60"}`} />
            </div>
            <h1 className="font-heading text-3xl font-bold tracking-tight text-white sm:text-4xl">
              One brief in.{" "}
              <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
                A whole agency&apos;s work
              </span>{" "}
              out.
            </h1>
            <p className="max-w-3xl text-sm text-gray-400 sm:text-base">
              HQ plans it, live research grounds it, specialist departments build it in parallel, then cross-review and QA sign it off.
              Everything below is read live from the running system.
            </p>
          </div>

          {state && state.jobs.length > 0 && (
            <label className="flex flex-col gap-1 font-mono text-xs uppercase tracking-wider text-gray-500">
              Project on the pipeline
              <select
                value={job?.id ?? ""}
                onChange={(e) => {
                  setSelectedDept(null);
                  setSelectedJobId(e.target.value);
                }}
                className="w-full max-w-sm rounded-xl border border-[#1E293B] bg-[#0B1220] px-3 py-2 text-[13px] normal-case tracking-normal text-white focus:border-cyan-400 focus:outline-none lg:w-80"
              >
                {state.jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.isTest ? "[test] " : ""}
                    {j.title} — {j.status === "running" ? `running ${j.percent}%` : j.status}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {/* New brief launcher */}
        {launcherOpen && (
          <div className="space-y-3 rounded-2xl border border-cyan-500/30 bg-[#070B14]/90 p-5 shadow-[0_0_30px_rgba(0,245,255,0.08)]">
            <div className="flex items-center justify-between">
              <p className="font-heading text-sm font-bold text-white">Launch a real project</p>
              <p className="font-mono text-xs text-gray-500">
                {systems?.routing === "local-first" ? "local-first routing · expect 10+ min on a local model" : "cloud-first routing"}
              </p>
            </div>
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={4}
              placeholder="Describe the business, what it sells, where, the budget, and the goal. e.g. “Solar installer in Austin, TX, $6k/month budget, wants 30 qualified leads a month.”"
              className="w-full resize-y rounded-xl border border-[#1E293B] bg-[#050811] p-3 font-mono text-[13px] text-white placeholder:text-gray-600 focus:border-cyan-400 focus:outline-none"
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13.5px] text-gray-500">
                Runs the actual pipeline: HQ plan → live research → departments → review → QA. Anything that touches an external system still needs your approval.
              </p>
              <button
                type="button"
                onClick={launch}
                disabled={launching || brief.trim().length < 20}
                className="flex shrink-0 items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-[13px] font-bold text-slate-950 transition-all hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {launching ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {launching ? "Launching…" : "Launch"}
              </button>
            </div>
            {launchError && <p className="text-[13px] text-red-400">{launchError}</p>}
          </div>
        )}

        {loadError && !state && (
          <div className="rounded-2xl border border-red-500/30 bg-red-950/20 p-5 text-sm text-red-300">
            Couldn&apos;t load live state: {loadError}
          </div>
        )}

        {/* Pipeline */}
        <div ref={flowRef} className="relative overflow-hidden rounded-3xl border border-[#1E293B] bg-[#070B14]/85 p-8 pb-24 shadow-2xl backdrop-blur-2xl sm:p-12 sm:pb-28">
          <FlowLayer w={flow.w} h={flow.h} specs={flow.specs} />

          {state && !job && (
            <div className="relative z-10 flex flex-col items-center gap-3 py-16 text-center">
              <Layers className="h-8 w-8 text-cyan-500/60" />
              <p className="font-heading text-2xl font-bold text-white">Nothing on the pipeline yet</p>
              <p className="max-w-md text-sm text-gray-400">
                No project has been run. Launch a brief and watch each stage fill in as real work completes.
              </p>
              <button
                type="button"
                onClick={() => setLauncherOpen(true)}
                className="mt-2 rounded-xl bg-cyan-500 px-4 py-2 text-[13px] font-bold text-slate-950 hover:bg-cyan-400"
              >
                New Brief
              </button>
            </div>
          )}

          {!state && !loadError && (
            <div className="relative z-10 flex items-center justify-center gap-3 py-24 font-mono text-[13px] text-gray-500">
              <RefreshCw className="h-4 w-4 animate-spin text-cyan-500" />
              reading live system state…
            </div>
          )}

          {job && (
            <div className="relative z-10 grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.45fr)_minmax(0,1.1fr)] lg:gap-x-24 xl:gap-x-32">
              {/* ════════ STAGE 01 · BRIEF & PLAN ════════ */}
              <div className="flex min-w-0 flex-col space-y-6">
                <div className="space-y-1">
                  <span className="flex items-center gap-1.5 font-mono text-[13.5px] font-bold uppercase tracking-widest text-cyan-400">
                    <StageDot state={stage1} /> STAGE 01
                  </span>
                  <h3 className="font-heading text-2xl font-bold text-white">Brief &amp; plan</h3>
                  <p className="font-mono text-[13.5px] text-gray-400">
                    intake → HQ decides who works on what
                  </p>
                </div>

                <div
                  ref={reg("brief")}
                  className={`flex min-h-[220px] flex-col items-center justify-between rounded-2xl border bg-gradient-to-b from-[#0F172A] to-[#0B1220] p-4 shadow-xl transition-all ${
                    stage1 === "active" ? "border-cyan-400 shadow-[0_0_25px_rgba(0,245,255,0.3)]" : "border-[#1E293B]"
                  }`}
                >
                  <div className="mb-2 h-1 w-12 rounded-full bg-gray-700/80" />
                  <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-500/40 bg-gradient-to-br from-cyan-500/15 to-blue-600/25 shadow-[0_0_15px_rgba(0,245,255,0.2)]">
                    <Image src="/logo-mark.png" alt="GrowForge" width={28} height={28} className="object-contain" />
                  </div>

                  {/* Real step-status meter: one bar per pipeline step, colored by actual status */}
                  <div className="flex h-10 w-full items-end justify-center gap-1.5 py-1" aria-label={`${job.percent}% complete`}>
                    {steps.map((s) => (
                      <div
                        key={s.id}
                        title={`${s.label}: ${s.status}`}
                        className={`w-1.5 rounded-full transition-all duration-500 ${
                          s.status === "done"
                            ? "h-full bg-gradient-to-t from-emerald-500 to-cyan-400 shadow-[0_0_6px_rgba(16,185,129,0.6)]"
                            : s.status === "active"
                              ? "h-3/4 animate-pulse bg-cyan-400 shadow-[0_0_8px_rgba(0,245,255,0.8)]"
                              : s.status === "error"
                                ? "h-1/2 bg-red-500"
                                : "h-1/4 bg-gray-700"
                        }`}
                      />
                    ))}
                  </div>

                  <div className="w-full rounded-xl border border-[#1E293B] bg-[#070B14]/80 p-2.5 text-center">
                    <p className="font-mono text-[13.5px] font-medium leading-snug text-cyan-200">
                      &ldquo;{clean(job.brief, 150)}&rdquo;
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5 rounded-xl border border-[#1E293B] bg-[#050811] p-3 font-mono text-xs text-gray-400">
                  <div className="flex items-center justify-between border-b border-[#1E293B] pb-1 text-gray-500">
                    <span className="max-w-[70%] truncate text-cyan-400">{job.title}</span>
                    <StatusPill status={job.status} />
                  </div>
                  <p>
                    {job.percent}% complete · {steps.length} steps
                  </p>
                  <p>
                    {duration(job.createdAt, job.finishedAt) ?? "—"} elapsed
                    {job.createdBy ? ` · by ${job.createdBy}` : ""}
                  </p>
                  {(job.revisionCount > 0 || job.liveNoteCount > 0) && (
                    <p className="text-amber-300/90">
                      {job.revisionCount} revision{job.revisionCount === 1 ? "" : "s"} · {job.liveNoteCount} live note{job.liveNoteCount === 1 ? "" : "s"}
                    </p>
                  )}
                  {job.error && <p className="text-red-400">{job.error}</p>}
                </div>
              </div>

              {/* ════════ STAGE 02 · RESEARCH & ROUTE ════════ */}
              <div className="flex min-w-0 flex-col space-y-6">
                <div className="space-y-1">
                  <span className="flex items-center gap-1.5 font-mono text-[13.5px] font-bold uppercase tracking-widest text-cyan-400">
                    <StageDot state={stage2} /> STAGE 02
                  </span>
                  <h3 className="font-heading text-2xl font-bold text-white">Research &amp; route</h3>
                  <p className="font-mono text-[13.5px] text-gray-400">live web evidence · work assigned by HQ</p>
                </div>

                <div
                  ref={reg("route")}
                  className={`flex items-center gap-2.5 rounded-2xl border px-4 py-3 shadow-lg transition-all ${
                    stage2 === "active" ? "border-cyan-400 bg-cyan-950/40 shadow-[0_0_20px_rgba(0,245,255,0.3)]" : "border-cyan-500/40 bg-[#0B1220]"
                  }`}
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-300">
                    <Search className="h-4 w-4" />
                  </div>
                  <span className="font-heading text-[13px] font-bold tracking-wider text-white">LIVE RESEARCH · ROUTE</span>
                </div>

                <div className="space-y-1 font-mono text-xs text-gray-500">
                  <p>
                    {job.research.sourceCount} source{job.research.sourceCount === 1 ? "" : "s"} ·{" "}
                    <span className={job.research.verified ? "text-emerald-400" : "text-amber-300"}>
                      {job.research.verified ? "verified live" : "UNVERIFIED"}
                    </span>
                  </p>
                  <p className="text-cyan-400/80">
                    {research?.status === "done" ? `research ${duration(research.startedAt, research.finishedAt) ?? ""}`.trim() : `research ${research?.status ?? "queued"}`}
                    {plan?.provider ? ` · plan by ${plan.provider}` : ""}
                  </p>
                </div>

                <div className="space-y-1 rounded-xl border border-[#1E293B] bg-[#050811] p-3 font-mono text-[13.5px] shadow-inner">
                  <div className="flex items-center justify-between border-b border-[#1E293B]/70 pb-1 text-gray-500">
                    <span>hq_plan.json</span>
                    <span className={plan?.status === "done" ? "text-xs text-emerald-400" : "text-xs text-gray-500"}>
                      {plan?.status === "done" ? "planned" : (plan?.status ?? "queued")}
                    </span>
                  </div>
                  <pre className="overflow-x-auto pt-1 leading-relaxed text-gray-300">
                    <code>
                      <span className="text-gray-500">&#123;</span>
                      {job.departments
                        .filter((d) => d.assigned)
                        .slice(0, 5)
                        .map((d) => (
                          <React.Fragment key={d.id}>
                            {"\n"}  <span className="text-cyan-400">&quot;{d.id}&quot;</span>:{" "}
                            <span className="text-amber-300">&quot;{d.task ?? "—"}&quot;</span>,
                          </React.Fragment>
                        ))}
                      {job.departments.filter((d) => d.assigned).length === 0 && (
                        <>
                          {"\n"}  <span className="text-gray-500">{"// no plan recorded yet"}</span>
                        </>
                      )}
                      {"\n"}
                      <span className="text-gray-500">&#125;</span>
                    </code>
                  </pre>
                </div>

                {job.research.sources.length > 0 && (
                  <div className="space-y-1 font-mono text-xs text-gray-400">
                    {job.research.sources.slice(0, 3).map((s) => (
                      <a
                        key={s.url}
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate text-cyan-300/80 hover:text-cyan-200"
                        title={s.title}
                      >
                        ↗ {host(s.url)} — {s.title}
                      </a>
                    ))}
                  </div>
                )}

                <div className="space-y-1.5 pt-1">
                  <p className="font-mono text-xs uppercase tracking-wider text-gray-400">Assigned departments:</p>
                  {job.departments.map((d) => {
                    const meta = DEPT_META[d.id];
                    const Icon = meta?.icon ?? Layers;
                    const isFocus = focusDept === d.id;
                    const st = hubStatus(d);
                    return (
                      <button
                        key={d.id}
                        ref={reg(`dept:${d.id}`)}
                        type="button"
                        disabled={!d.assigned}
                        onClick={() => setSelectedDept(d.id)}
                        className={`flex w-full items-center justify-between rounded-xl px-4 py-3 font-mono text-[13px] font-medium transition-all ${
                          isFocus && d.assigned
                            ? "scale-[1.02] border-2 border-cyan-400 bg-cyan-950/60 text-cyan-200 shadow-[0_0_15px_rgba(0,245,255,0.35)]"
                            : d.assigned
                              ? "border border-[#1E293B] bg-[#0B1220]/75 text-gray-300 hover:border-gray-600 hover:text-white"
                              : "cursor-default border border-[#1E293B]/50 bg-[#0B1220]/30 text-gray-600"
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <Icon className={`h-3.5 w-3.5 shrink-0 ${isFocus && d.assigned ? "text-cyan-400" : "text-gray-500"}`} />
                          <span className="truncate font-bold">{meta?.short ?? d.name}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          <span className="text-xs text-gray-500">{d.assigned ? (d.blueprint ? BAND_LABEL[d.blueprint.band] : d.step?.status ?? "queued") : "not needed"}</span>
                          <span
                            className={`h-2 w-2 rounded-full ${
                              st === "done"
                                ? "bg-emerald-400"
                                : st === "active"
                                  ? "animate-pulse bg-cyan-400 shadow-[0_0_6px_#00F5FF]"
                                  : st === "error"
                                    ? "bg-red-400"
                                    : st === "pending"
                                      ? "bg-cyan-500/50"
                                      : "bg-gray-800"
                            }`}
                          />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ════════ STAGE 03 · EXECUTE ════════ */}
              <div className="flex min-w-0 flex-col space-y-6">
                <div className="space-y-1">
                  <span className="flex items-center gap-1.5 font-mono text-[13.5px] font-bold uppercase tracking-widest text-cyan-400">
                    <StageDot state={stage3} /> STAGE 03
                  </span>
                  <h3 className="font-heading text-2xl font-bold text-white">Execute</h3>
                  <p className="font-mono text-[13.5px] text-gray-400">specialist departments work in parallel</p>
                </div>

                <div className="flex items-center justify-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-950/20 px-3 py-1.5">
                  <Image src="/logo-mark.png" alt="" width={16} height={16} className="object-contain" />
                  <span className="font-mono text-[13px] font-bold tracking-widest text-cyan-300">GROWFORGE CORE</span>
                </div>

                <div
                  className={`overflow-hidden rounded-2xl border bg-[#070B14] p-1 transition-all ${
                    stage3 === "active" ? "border-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.35)]" : "border-[#1E293B]"
                  }`}
                >
                  <div ref={reg("sphere")} className="relative">
                    <CoreSphere3D
                      hubs={job.departments.map((d) => ({ id: d.id, status: hubStatus(d) }))}
                      selectedId={focusDept}
                      onSelect={(id) => {
                        if (job.departments.find((d) => d.id === id)?.assigned) setSelectedDept(id);
                      }}
                    />
                    {/* Output chips: what this pipeline actually writes (each is wired to the core) */}
                    <div
                      ref={reg("chip:job")}
                      className="pointer-events-none absolute right-2 top-3 flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-[#0B1220]/90 px-2.5 py-1 font-mono text-[13.5px] font-medium text-cyan-300 backdrop-blur-md"
                    >
                      <Layers className="h-3 w-3" /> jobs.json
                    </div>
                    <div
                      ref={reg("chip:plan")}
                      className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-[#0B1220]/90 px-2.5 py-1 font-mono text-[13.5px] font-medium text-emerald-300 backdrop-blur-md"
                    >
                      <CheckCircle2 className="h-3 w-3" /> final plan
                    </div>
                    <div
                      ref={reg("chip:vault")}
                      className="pointer-events-none absolute bottom-3 right-2 flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-[#0B1220]/90 px-2.5 py-1 font-mono text-[13.5px] font-medium text-purple-300 backdrop-blur-md"
                    >
                      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor">
                        <path d="M12 2L3 9l9 13 9-13-9-7zm0 3.2L17.8 9 12 17.5 6.2 9 12 5.2z" />
                      </svg>
                      vault log
                    </div>
                    <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-cyan-500/30 bg-[#0B1220]/85 px-2.5 py-1 font-mono text-[13.5px] font-medium text-cyan-300 backdrop-blur-md">
                      {focus ? (DEPT_META[focus.id]?.short ?? focus.name) : "—"}
                    </div>
                    <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-emerald-500/30 bg-[#0B1220]/85 px-2.5 py-1 font-mono text-[13.5px] font-medium text-emerald-300 backdrop-blur-md">
                      {job.departments.filter((d) => d.assigned).length}/{job.departments.length} assigned
                    </div>
                  </div>
                </div>

                {focus && (
                  <div ref={reg("focus")} className="space-y-1.5 rounded-xl border border-emerald-500/30 bg-[#050811] p-3 font-mono text-[13.5px] shadow-inner">
                    <div className="flex items-center justify-between border-b border-[#1E293B] pb-1 text-gray-500">
                      <span className="max-w-[70%] truncate text-cyan-400">{focus.name}</span>
                      {focus.step ? <StatusPill status={focus.step.status} /> : <span className="text-xs">not assigned</span>}
                    </div>
                    {focus.step ? (
                      <>
                        <p className="text-xs text-gray-500">
                          {focus.step.provider ?? "—"} · {focus.step.outputChars.toLocaleString()} chars
                          {duration(focus.step.startedAt, focus.step.finishedAt) ? ` · ${duration(focus.step.startedAt, focus.step.finishedAt)}` : ""}
                        </p>
                        {focus.blueprint && (
                          <p className="flex flex-wrap items-center gap-1.5 text-xs text-gray-400">
                            <span className={`rounded border px-1 py-px font-semibold ${BAND_STYLE[focus.blueprint.band]}`}>{focus.blueprint.band}</span>
                            <span className="truncate">{focus.blueprint.name}</span>
                            <span className="text-gray-600">{Math.round(focus.blueprint.confidence * 100)}%</span>
                          </p>
                        )}
                        <p className="pt-1 font-semibold leading-relaxed text-emerald-300/90">
                          {focus.step.preview ? clean(focus.step.preview, 230) : focus.step.error ?? focus.task ?? "Waiting to start."}
                        </p>
                      </>
                    ) : (
                      <p className="text-gray-500">HQ didn&apos;t need this department for this brief.</p>
                    )}
                  </div>
                )}
              </div>

              {/* ════════ STAGE 04 · REVIEW & DELIVER ════════ */}
              <div className="flex min-w-0 flex-col space-y-6">
                <div className="space-y-1">
                  <span className="flex items-center gap-1.5 font-mono text-[13.5px] font-bold uppercase tracking-widest text-cyan-400">
                    <StageDot state={stage4} /> STAGE 04
                  </span>
                  <h3 className="font-heading text-2xl font-bold text-white">Review &amp; deliver</h3>
                  <p className="font-mono text-[13.5px] text-gray-400">cross-review → QA → final plan → your approval</p>
                </div>

                <div className="flex items-center gap-2.5">
                  <div ref={reg("recall")} className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-emerald-500 to-cyan-400 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.4)]">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <span className="font-mono text-[13px] font-semibold text-gray-300">
                    GrowForge <span className="font-bold text-cyan-400">HQ</span> · <span className="font-bold text-emerald-300">QA</span>
                  </span>
                </div>

                <div
                  ref={reg("review")}
                  className={`space-y-3 rounded-2xl border bg-[#0B1220]/90 p-4 shadow-xl transition-all ${
                    stage4 === "active" ? "border-cyan-400 shadow-[0_0_25px_rgba(0,245,255,0.3)]" : "border-[#1E293B]"
                  }`}
                >
                  {[
                    { step: reconcile, title: "HQ cross-department review" },
                    { step: qa, title: "Quality assurance" },
                    { step: final, title: "Final plan" },
                  ].map(({ step, title }) => (
                    <div key={title} className="space-y-1 rounded-xl border border-cyan-500/30 bg-[#070B14]/90 p-3 font-mono text-[13px]">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-gray-300">{title}</p>
                        <StatusPill status={step?.status ?? "pending"} />
                      </div>
                      {step && step.status !== "pending" && (
                        <p className="text-xs text-gray-500">
                          {step.provider ?? "—"} · {step.outputChars.toLocaleString()} chars
                          {duration(step.startedAt, step.finishedAt) ? ` · ${duration(step.startedAt, step.finishedAt)}` : ""}
                        </p>
                      )}
                      {step?.status === "done" && step.preview && (
                        <p className="pt-0.5 text-[13.5px] leading-relaxed text-cyan-300/90">{clean(step.preview, title === "Final plan" ? 210 : 150)}</p>
                      )}
                      {step?.status === "error" && step.error && <p className="text-[13.5px] text-red-400">{step.error}</p>}
                    </div>
                  ))}

                  <div className="space-y-1.5 border-t border-[#1E293B]/70 pt-2 font-mono text-[13.5px]">
                    <div className="flex items-center gap-1.5 text-gray-400">
                      <CheckCircle2 className={`h-3.5 w-3.5 ${job.approvedAt ? "text-emerald-400" : "text-gray-600"}`} />
                      <span>
                        {job.approvedAt
                          ? `approved by ${job.approvedBy ?? "owner"}`
                          : job.status === "done"
                            ? "awaiting owner approval"
                            : "approval opens once the plan is ready"}
                      </span>
                    </div>
                    <div className="border-l-2 border-cyan-500/40 pl-2 text-xs italic leading-relaxed text-gray-400">
                      {job.usage ? (
                        <>
                          {formatTokens(job.usage.totalTokens)} tokens · {job.usage.calls} model calls ·{" "}
                          {job.usage.costUsd !== null ? formatUsd(job.usage.costUsd) : "cost unknown for some models"}
                          <br />
                          {job.usage.providers.map((p) => `${p.provider}/${p.model}`).join(", ")}
                        </>
                      ) : (
                        <>token usage wasn&apos;t recorded for this run (it predates usage tracking)</>
                      )}
                    </div>
                  </div>

                  <Link
                    href="/workspace?view=workflows"
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-[#1E293B] bg-[#070B14] px-3 py-2 font-mono text-[13px] text-cyan-300 transition-colors hover:border-cyan-400"
                  >
                    <Zap className="h-3.5 w-3.5" /> Open full plan in Projects
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Live systems: what this instance can actually do right now */}
        {systems && (
          <div className="space-y-3 rounded-2xl border border-[#1E293B] bg-[#070B14]/90 p-4 backdrop-blur-xl sm:p-5">
            <p className="font-mono text-xs font-semibold uppercase tracking-widest text-gray-500">Live systems · probed just now</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {systems.probes.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-xl border border-[#1E293B] bg-[#0B1220]/70 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-gray-200">{p.label}</p>
                    <p className="font-mono text-xs text-gray-500">{p.online ? `${p.detail}${p.latencyMs !== null ? ` · ${p.latencyMs}ms` : ""}` : p.detail}</p>
                  </div>
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${p.online ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-gray-700"}`} title={p.online ? "online" : "offline"} />
                </div>
              ))}
              <div className="rounded-xl border border-[#1E293B] bg-[#0B1220]/70 px-3 py-2">
                <p className="text-[13px] font-semibold text-gray-200">
                  {systems.mcp.count} MCP connector{systems.mcp.count === 1 ? "" : "s"}
                </p>
                <p className="truncate font-mono text-xs text-gray-500">
                  {systems.mcp.servers.map((s) => `${s.name} (${s.toolCount})`).join(" · ") || "none connected"}
                </p>
              </div>
              <div className="rounded-xl border border-[#1E293B] bg-[#0B1220]/70 px-3 py-2">
                <p className="text-[13px] font-semibold text-gray-200">
                  {systems.models.count} AI model{systems.models.count === 1 ? "" : "s"} · {systems.routing}
                </p>
                <p className="truncate font-mono text-xs text-gray-500">
                  {systems.models.list.find((m) => m.isPrimary)?.name ?? "no primary set"}
                </p>
              </div>
              <div className="rounded-xl border border-[#1E293B] bg-[#0B1220]/70 px-3 py-2">
                <p className="text-[13px] font-semibold text-gray-200">
                  Obsidian vault · {systems.vault.reachable ? `${systems.vault.noteCount} notes` : "unreachable"}
                </p>
                <p className="truncate font-mono text-xs text-gray-500">
                  {systems.vault.latestDaily ? `daily log: ${systems.vault.latestDaily.replace(".md", "")}` : "no daily log yet"}
                </p>
              </div>
              <div className="rounded-xl border border-[#1E293B] bg-[#0B1220]/70 px-3 py-2">
                <p className="text-[13px] font-semibold text-gray-200">
                  {systems.pendingApprovals} approval{systems.pendingApprovals === 1 ? "" : "s"} · {systems.pendingConsultations} question{systems.pendingConsultations === 1 ? "" : "s"} pending
                </p>
                <p className="font-mono text-xs text-gray-500">human-in-the-loop queue</p>
              </div>
            </div>
          </div>
        )}

        {/* Stepper + grounding */}
        {job && (
          <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-[#1E293B] bg-[#070B14]/90 p-4 backdrop-blur-xl sm:p-5 md:flex-row">
            <div className="flex flex-wrap items-center gap-2 font-mono text-[13px]">
              {[
                { label: "brief", state: stageOf(steps.filter((s) => s.kind === "brief")) },
                { label: "plan", state: stageOf(steps.filter((s) => s.kind === "plan")) },
                { label: "research", state: stage2 },
                { label: "departments", state: stage3 },
                { label: "review", state: stageOf(steps.filter((s) => s.kind === "reconcile")) },
                { label: "QA", state: stageOf(steps.filter((s) => s.kind === "qa")) },
                { label: "final", state: stageOf(steps.filter((s) => s.kind === "final")) },
              ].map((p, i, arr) => (
                <React.Fragment key={p.label}>
                  <span
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 ${
                      p.state === "active"
                        ? "border border-cyan-500/40 bg-cyan-500/20 text-cyan-300"
                        : p.state === "done"
                          ? "bg-emerald-500/10 text-emerald-300"
                          : p.state === "error"
                            ? "bg-red-500/10 text-red-300"
                            : "bg-[#0B1220] text-gray-500"
                    }`}
                  >
                    <StageDot state={p.state} />
                    {p.label}
                  </span>
                  {i < arr.length - 1 && <span className="text-gray-600">→</span>}
                </React.Fragment>
              ))}
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-950/30 px-3 py-1.5 font-mono text-[13px] text-cyan-300">
              <RefreshCw className={`h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} />
              <span>{running ? `running now · ${job.percent}%` : `${state?.jobs.length ?? 0} projects on record`}</span>
            </div>
          </div>
        )}

        <p className="text-center font-mono text-[13px] text-gray-500">
          Read live from <span className="text-emerald-400">jobs.json</span> → <span className="text-cyan-400">orchestrator</span> → durable engine · service
          probes are real requests · nothing on this page is simulated
        </p>
      </main>
    </div>
  );
}
