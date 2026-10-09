"use client";

/**
 * Renderer for the W3 conduit plan (Mission Worktree). Layers, bottom to top, all plain SVG (no filters, no blur,
 * no drop-shadow, no rAF): optical sheath -> structural filament -> junctions -> signal packets. Structure is drawn as ONE path per style
 * class (a single stroke operation), so shared trunks never compound their opacity. Packets are CSS stroke-dashoffset animations: selection / stall packets run
 * once (iteration-count 1) and are re-keyed by the pulse serial; only plan-approved executor-confirmed live packets repeat. Reduced motion
 * renders no packets, but every state keeps its static emphasis (W5.4B): a solid bright overlay for executor-confirmed live conduits, a dotted ledger overlay for
 * recorded-running ones, a segmented (interrupted) filament for blocked/error ones, and seats (sockets / fault seats) where conduits meet nodes.
 */
import { useMemo } from "react";
import type { MissionWorktree } from "./missionWorktree";
import type { WorktreeLayout } from "./missionWorktreeLayout";
import { conduitStyle, planConduits, type ConduitInput, type ConduitSegment } from "./missionWorktreeConduits";
import styles from "./MissionConduits.module.css";

export function MissionConduits({ layout, worktree, selectedId, pulse, reducedMotion }: { layout: WorktreeLayout; worktree: MissionWorktree } & Pick<ConduitInput, "selectedId" | "pulse" | "reducedMotion">) {
  const plan = useMemo(() => planConduits({ layout, worktree, selectedId, pulse, reducedMotion }), [layout, worktree, selectedId, pulse, reducedMotion]);
  const classes = useMemo(() => {
    const groups = new Map<string, { key: string; seg: ConduitSegment; d: string[]; segs: ConduitSegment[] }>();
    plan.segments.forEach(seg => {
      const key = `${seg.relation}|${seg.role}|${seg.tone}`;
      const g = groups.get(key) ?? { key, seg, d: [], segs: [] };
      g.d.push(seg.d); g.segs.push(seg); groups.set(key, g);
    });
    return [...groups.values()].sort((a, b) => (a.seg.role === "path" ? 1 : 0) - (b.seg.role === "path" ? 1 : 0));
  }, [plan]);
  const w = layout.stage.width, h = layout.contentHeight;
  // C3 Graph fan: hairline S-curves from ONE shared origin. The selected route is restrained champagne; every other conduit is subtle teal that fades with distance from the reference end. Each
  // conduit is its own path with a userSpaceOnUse gradient (a fill, never a filter). The plan decides what exists; this only decides how a recorded relationship looks.
  const fan = plan.view === "graph" && plan.level !== "minimal";
  const isFan = (relation: string) => fan && (relation === "ownership" || relation === "phase-membership");
  const GOLD = "#e8d3a0", WARM = "#fff1cf", TEAL = "#6fd6dd", AMBER = "#d08a4a"; // champagne = selection / the focal origin; teal = structure; amber = recorded error (never the champagne)
  let gradientIndex = 0;
  return <svg className={styles.svg} width={w} height={h} data-conduits data-view={plan.view} data-level={plan.level} aria-hidden="true">
    <defs><radialGradient id="wt-focal"><stop offset="0" stopColor={WARM} stopOpacity={0.3} /><stop offset="0.5" stopColor={GOLD} stopOpacity={0.12} /><stop offset="1" stopColor={GOLD} stopOpacity={0} /></radialGradient></defs>
    {classes.map(g => { const st = conduitStyle(g.seg.relation, g.seg.role, g.seg.tone, plan.level), d = g.d.join(""), fanned = isFan(g.seg.relation), op = g.seg.tone === "alert" ? Math.round(st.opacity * 600) / 1000 : st.opacity; return <g key={g.key} className={styles.rel} data-relation={g.seg.relation} data-role={g.seg.role} data-tone={g.seg.tone}>
      {!fanned && st.sheathWidth > 0 && <path className={styles.sheath} d={d} strokeWidth={st.sheathWidth} strokeOpacity={st.sheathOpacity} />}
      {fanned
        ? g.segs.map(seg => { const id = `cg${gradientIndex++}`, f = seg.fade, alert = seg.tone === "alert"; return <g key={seg.edgeId} data-fan data-route={seg.route || undefined}>
          {seg.route
            ? alert
              ? <path className={styles.hair} d={seg.d} stroke={AMBER} strokeOpacity={0.92} strokeWidth={1.6} strokeDasharray="6 5" />
              : <>
                <defs><linearGradient id={id} gradientUnits="userSpaceOnUse" x1={seg.start.x} y1={seg.start.y} x2={seg.end.x} y2={seg.end.y}>
                  <stop offset="0" stopColor={WARM} stopOpacity={0.98} /><stop offset="0.45" stopColor={GOLD} stopOpacity={0.94} /><stop offset="1" stopColor={GOLD} stopOpacity={0.86} />
                </linearGradient></defs>
                <path className={styles.hair} d={seg.d} stroke={`url(#${id})`} strokeWidth={1.6} />
              </>
            : <>
              <defs><linearGradient id={id} gradientUnits="userSpaceOnUse" x1={seg.start.x} y1={seg.start.y} x2={seg.end.x} y2={seg.end.y}>
                {/* restrained champagne-white at the shared origin, cooling to teal along the line; the depth fade lowers both ends with distance from the reference */}
                <stop offset="0" stopColor={seg.relation === "phase-membership" ? WARM : TEAL} stopOpacity={(seg.relation === "phase-membership" ? 0.82 : 0.62) * (1 - 0.4 * f)} />
                <stop offset="0.35" stopColor={seg.relation === "phase-membership" ? GOLD : TEAL} stopOpacity={(seg.relation === "phase-membership" ? 0.6 : 0.58) * (1 - 0.45 * f)} />
                <stop offset="1" stopColor={TEAL} stopOpacity={0.58 * (1 - 0.55 * f)} />
              </linearGradient></defs>
              <path className={styles.hair} d={seg.d} stroke={alert ? AMBER : `url(#${id})`} strokeOpacity={alert ? 0.62 * (1 - 0.35 * f) : undefined} strokeWidth={1.3} strokeDasharray={alert ? "6 5" : undefined} />
            </>}
        </g>; })
        : <path className={styles.filament} d={d} strokeWidth={st.width} strokeOpacity={op} strokeDasharray={g.seg.tone === "alert" ? "6 5" : st.dash} />}
      {g.seg.tone === "recorded-active" && g.seg.relation !== "ownership" && <path className={plan.liveConfirmed ? styles.flowLive : styles.flowRecorded} d={d} />}
    </g>; })}
    {plan.junctions.map(j => <g key={j.id} className={styles.junction} data-kind={j.kind} data-graph={plan.view === "graph" || undefined} data-live={(j.tone === "recorded-active" && plan.liveConfirmed) || undefined} data-tone={j.tone} data-role={j.role} transform={`translate(${j.x} ${j.y})`}>
      {j.kind === "fault"
        ? <rect className={styles.fault} x={-2.8} y={-2.8} width={5.6} height={5.6} />
        : <>
          {j.kind === "fan-out" && plan.view === "graph" && <><circle className={styles.glow} r={20} fill="url(#wt-focal)" /><circle className={styles.halo} r={9.5} /></>}
          <circle className={styles.ring} r={j.kind === "selected" ? 5.5 : j.kind === "socket" ? 2.9 : j.kind === "fan-out" && plan.view === "graph" ? 6 : 4.2} />
          {!(j.kind === "socket" && j.tone === "recorded-active" && !plan.liveConfirmed) && <circle className={styles.core} r={j.kind === "selected" ? 1.9 : j.kind === "socket" ? 1 : j.kind === "fan-out" && plan.view === "graph" ? 2.4 : 1.4} />}
        </>}
      {(j.kind === "selected" || j.kind === "live") && <path className={styles.cross} d="M-8 0H-5.5M5.5 0H8M0 -8V-5.5M0 5.5V8" />}
    </g>)}
    {plan.packets.map(p => <g key={p.id} data-packet={p.kind} data-edge-to={plan.segments.find(s => s.edgeId === p.edgeId)?.to} data-repeats={p.repeats || undefined}>
      {(p.kind === "selection" || p.kind === "live") && <path className={styles.tail} d={p.d} pathLength={100} style={{ animationDuration: `${p.durationMs}ms`, animationDelay: `${p.delayMs}ms` }} data-repeats={p.repeats || undefined} />}
      <path className={styles.packet} d={p.d} pathLength={100} style={{ animationDuration: `${p.durationMs}ms`, animationDelay: `${p.delayMs}ms` }} data-repeats={p.repeats || undefined} data-kind={p.kind} />
    </g>)}
  </svg>;
}
