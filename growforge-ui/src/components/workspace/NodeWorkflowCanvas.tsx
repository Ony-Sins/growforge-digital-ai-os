"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Bot,
  Code2,
  FlaskConical,
  Lock,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  type LucideIcon,
} from "lucide-react";
import { agents, type Agent } from "@/lib/agents";
import { statusLabel, statusTextClass } from "@/components/ui/StatusDot";
import { useAppState } from "@/lib/appState";
import { isAgentLocked } from "@/lib/security";

const ICONS: Record<string, LucideIcon> = {
  Bot,
  Code2,
  Sparkles,
  ShieldCheck,
  Send,
  Target,
  FlaskConical,
};

/** Hand-tuned hub-and-spoke layout on a 720x420 viewBox, curved to echo the
 *  brand cover art's flowing circuit lines rather than straight spokes. */
const VIEW_W = 720;
const VIEW_H = 420;
const HUB = { x: 360, y: 210 };

const LAYOUT: Record<string, { x: number; y: number; cx: number; cy: number }> = {
  "frontend-developer": { x: 360, y: 60, cx: 410, cy: 135 },
  "whimsy-injector": { x: 594, y: 135, cx: 492, cy: 220 },
  "ui-finish-gate-reviewer": { x: 594, y: 285, cx: 462, cy: 295 },
  "outbound-strategist": { x: 360, y: 360, cx: 310, cy: 285 },
  "offer-and-lead-gen-strategist": { x: 126, y: 285, cx: 228, cy: 200 },
  "reality-checker": { x: 126, y: 135, cx: 258, cy: 125 },
};

function pct(v: number, total: number) {
  return `${(v / total) * 100}%`;
}

function edgeStrokeColor(agent: Agent) {
  if (agent.status === "error") return "var(--color-accent-crimson)";
  return "url(#edgeGradient)";
}

export function NodeWorkflowCanvas() {
  const [selected, setSelected] = useState<string>("agents-orchestrator");
  const { openAgentPanel, canAccessAgent } = useAppState();
  const hub = agents.find((a) => a.hub)!;
  const spokes = agents.filter((a) => !a.hub);
  const activeAgent = agents.find((a) => a.id === selected) ?? hub;

  return (
    <section className="glass-card rounded-2xl p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-base font-semibold text-navy">
            Agent Network Canvas
          </h2>
          <p className="text-xs text-secondary">
            Live orchestration graph — select a node to inspect its link.
          </p>
        </div>
        <div className="flex items-center gap-4 text-[11px] font-medium text-secondary">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-electric" /> Data flow
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-gold" /> Orchestrator
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-crimson" /> Error
          </span>
        </div>
      </div>

      <div className="relative w-full overflow-hidden rounded-xl border border-border-metal bg-sunken">
        <div className="relative" style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}>
          {/* Background circuitry */}
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            className="absolute inset-0 h-full w-full"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <linearGradient id="edgeGradient" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="var(--color-accent-electric)" />
                <stop offset="100%" stopColor="var(--color-accent-gold)" />
              </linearGradient>
              <radialGradient id="hubGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="var(--color-accent-electric)" stopOpacity="0.35" />
                <stop offset="100%" stopColor="var(--color-accent-electric)" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="hubFill" cx="35%" cy="30%" r="75%">
                <stop offset="0%" stopColor="var(--color-accent-gold)" />
                <stop offset="100%" stopColor="var(--color-accent-electric)" />
              </radialGradient>
            </defs>

            {/* ambient hub glow */}
            <circle cx={HUB.x} cy={HUB.y} r={130} fill="url(#hubGlow)" />

            {/* edges */}
            {spokes.map((agent) => {
              const l = LAYOUT[agent.id];
              const isFocused = selected === agent.id || selected === hub.id;
              const isDim = !isFocused && selected !== hub.id;
              const flowing = agent.status === "active" || agent.status === "success";
              return (
                <g key={agent.id}>
                  <path
                    d={`M ${HUB.x},${HUB.y} Q ${l.cx},${l.cy} ${l.x},${l.y}`}
                    fill="none"
                    stroke={edgeStrokeColor(agent)}
                    strokeWidth={selected === agent.id ? 3.5 : 2}
                    strokeLinecap="round"
                    opacity={agent.status === "idle" ? 0.3 : isDim ? 0.25 : 0.9}
                    className={flowing ? "flow-line" : ""}
                  />
                  {/* circuit node dot along the curve */}
                  <circle
                    cx={l.cx}
                    cy={l.cy}
                    r={3}
                    fill={agent.status === "error" ? "var(--color-accent-crimson)" : "var(--color-accent-gold)"}
                    opacity={isDim ? 0.3 : 0.8}
                  />
                </g>
              );
            })}
          </svg>

          {/* Interactive node overlay */}
          <div className="absolute inset-0">
            {/* Hub node */}
            <button
              type="button"
              onClick={() => {
                setSelected(hub.id);
                openAgentPanel(hub.id);
              }}
              title={`Inspect ${hub.name}`}
              className={`group absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 outline-none`}
              style={{ left: pct(HUB.x, VIEW_W), top: pct(HUB.y, VIEW_H) }}
            >
              <span
                className={`relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border-2 bg-navy transition-transform group-hover:scale-105 ${
                  selected === hub.id ? "border-gold glow-gold" : "border-border-metal-strong"
                }`}
              >
                <Image
                  src="/logo.png"
                  alt="GrowForge orchestrator"
                  fill
                  className="scale-[1.85] object-cover"
                  sizes="64px"
                />
                <span className="absolute inset-0 node-pulse rounded-2xl ring-2 ring-electric/60" />
              </span>
              <span className="rounded-full bg-navy px-2 py-0.5 font-mono text-[10px] font-medium text-on-navy">
                orchestrator
              </span>
            </button>

            {/* Spoke nodes */}
            {spokes.map((agent) => {
              const l = LAYOUT[agent.id];
              const Icon = ICONS[agent.icon] ?? Bot;
              const isSelected = selected === agent.id;
              const ring =
                agent.status === "active"
                  ? "border-electric"
                  : agent.status === "success"
                    ? "border-emerald"
                    : agent.status === "error"
                      ? "border-crimson"
                      : "border-border-metal-strong";
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => {
                    setSelected(agent.id);
                    openAgentPanel(agent.id);
                  }}
                  onMouseEnter={() => setSelected(agent.id)}
                  title={`Inspect ${agent.name}`}
                  className="group absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 outline-none"
                  style={{ left: pct(l.x, VIEW_W), top: pct(l.y, VIEW_H) }}
                >
                  <span
                    className={`relative flex h-11 w-11 items-center justify-center rounded-full border-2 bg-white/90 shadow-sm transition-transform group-hover:scale-110 ${ring} ${
                      isSelected ? "glow-electric" : ""
                    }`}
                  >
                    <Icon className="h-[18px] w-[18px] text-navy" strokeWidth={2} />
                    {isAgentLocked(agent.id) && !canAccessAgent(agent.id) && (
                      <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-navy ring-2 ring-white">
                        <Lock className="h-2.5 w-2.5 text-gold" />
                      </span>
                    )}
                  </span>
                  <span className="max-w-[92px] truncate rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-medium text-secondary shadow-sm">
                    {agent.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Selected agent detail strip */}
      <button
        type="button"
        onClick={() => openAgentPanel(activeAgent.id)}
        title={`Inspect ${activeAgent.name}`}
        className="mt-4 flex w-full flex-wrap items-center gap-4 rounded-xl border border-border-metal bg-white/70 px-4 py-3 text-left transition-colors hover:border-electric/40 hover:bg-white/90"
      >
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
            activeAgent.hub ? "bg-navy" : "bg-sunken"
          }`}
        >
          {activeAgent.hub ? (
            <Bot className="h-4 w-4 text-gold" />
          ) : (
            (() => {
              const Icon = ICONS[activeAgent.icon] ?? Bot;
              return <Icon className="h-4 w-4 text-electric" />;
            })()
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-navy">{activeAgent.name}</p>
          <p className="truncate text-xs text-muted">{activeAgent.division}</p>
        </div>
        <span className={`text-xs font-semibold ${statusTextClass(activeAgent.status)}`}>
          {statusLabel(activeAgent.status)}
        </span>
        <span className="font-mono text-xs text-muted">{activeAgent.lastRun}</span>
      </button>
    </section>
  );
}
