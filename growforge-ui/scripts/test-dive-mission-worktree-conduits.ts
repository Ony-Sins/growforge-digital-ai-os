import assert from "node:assert/strict";
import type { Job, JobStep } from "../src/lib/jobStore";
import { buildMissionWorktree, type MissionWorktree } from "../src/components/spatial/dive/missionWorktree";
import { layoutWorktree, type ViewState, type WorktreeView } from "../src/components/spatial/dive/missionWorktreeLayout";
import { CONDUIT_TIMING, conduitStyle, planConduits } from "../src/components/spatial/dive/missionWorktreeConduits";
import type { MissionLayoutMode } from "../src/components/spatial/dive/missionFlowModel";

/** W3 conduit semantics: pure plan, no stores. Proves WHAT may move and WHEN; the browser pass proves the rendered animations. */
const T = "2026-10-01T10:00:00.000Z";
const step = (id: string, kind: JobStep["kind"], over: Partial<JobStep> = {}): JobStep => ({ id, kind, label: id, activity: "", status: "done", percent: 100, weight: 10, dependsOn: [], ...over });
const DEPTS = ["sales-bd", "marketing", "finance-ops", "client-success", "web-design", "web-dev", "ai-automation", "meta-ads", "legal", "ops", "hr", "data", "it", "support"];
interface Opts { depts?: number; status?: Partial<Record<string, JobStep["status"]>>; jobStatus?: Job["status"]; ambiguous?: boolean; omit?: string[] }
function fixture(o: Opts = {}, executor?: { confirmable: boolean; missionIds: string[] }): MissionWorktree {
  const ids = DEPTS.slice(0, o.depts ?? 3);
  const st = (id: string, dflt: JobStep["status"] = "done") => o.status?.[id] ?? dflt;
  const steps: JobStep[] = [];
  const add = (s: JobStep) => { if (!o.omit?.includes(s.kind)) steps.push(s); };
  add(step("brief", "brief", { status: st("brief") }));
  add(step("plan", "plan", { dependsOn: ["brief"], status: st("plan") }));
  add(step("research", "research", { dependsOn: ["plan"], status: st("research") }));
  ids.forEach(d => { for (let k = 0; k < (o.ambiguous ? 2 : 1); k++) add(step(`dept:${d}`, "department", { departmentId: d, dependsOn: ["research"], status: st(`dept:${d}`) })); });
  add(step("reconcile", "reconcile", { dependsOn: ids.map(d => `dept:${d}`), status: st("reconcile") }));
  add(step("qa", "qa", { dependsOn: ["reconcile"], status: st("qa") }));
  add(step("final", "final", { dependsOn: ["qa"], status: st("final") }));
  return buildMissionWorktree({ job: { id: "job-w3", title: "M", brief: "b", status: o.jobStatus ?? "done", percent: 50, verified: true, steps, createdAt: T, updatedAt: T, liveNotes: [], revisions: [],
    planSnapshot: { title: "T", researchQuestions: [], assignments: ids.map(d => ({ departmentId: d, task: "t", activity: "a" })) } }, executor });
}
const STAGE = { width: 1416, height: 600 };
const base: ViewState = { view: "graph", selectedId: null, expandedDepartmentId: null };
const plan = (wt: MissionWorktree, view: WorktreeView, over: { mode?: MissionLayoutMode; selectedId?: string | null; pulse?: { subject: string | null; serial: number; view: WorktreeView } | null; reducedMotion?: boolean; expanded?: string | null } = {}) => {
  const mode = over.mode ?? "graph";
  const size = mode === "stack" ? { width: 366, height: 500 } : STAGE;
  const layout = layoutWorktree(wt, size, mode, { ...base, view, selectedId: over.selectedId ?? null, expandedDepartmentId: over.expanded ?? null });
  return { layout, plan: planConduits({ layout, worktree: wt, selectedId: over.selectedId ?? null, pulse: over.pulse ?? null, reducedMotion: over.reducedMotion ?? false }) };
};

// 1. Idle: structure only. No packet, every conduit idle, only recorded relationships are conduits (containment/implicit have none).
for (const view of ["graph"] as const) {
  const wt = fixture({ depts: 3 });
  const { layout, plan: p } = plan(wt, view);
  assert.deepEqual(p.packets, [], `${view} idle: nothing moves`);
  assert.ok(p.segments.length > 0 && p.segments.every(s => s.role === "idle"));
  // W7: in the Graph a dependency is a cross-link, not structure: it is drawn only when the subject makes it relevant, never at rest.
  assert.deepEqual(p.segments.map(s => s.edgeId).sort(), layout.edges.filter(e => e.rendering === "line" && !(view === "graph" && e.relation === "dependency")).map(e => e.id).sort(), "one conduit per drawn relationship, no more");
  assert.ok(p.segments.every(s => ["ownership", "phase-membership", "department-membership", "dependency"].includes(s.relation)));
}

// 2. Selection / focus: ONE packet per conduit on the path, ancestors first, non-repeating; a new serial replays; another layout or reduced motion plays nothing.
{
  const wt = fixture({ depts: 3 });
  const dept = wt.departments[1], stepId = wt.steps.find(s => s.departmentId === dept.id)!.id;
  const g1 = plan(wt, "graph", { selectedId: stepId, expanded: dept.id, pulse: { subject: stepId, serial: 1, view: "graph" } });
  const sel = g1.plan.packets;
  assert.ok(sel.length >= 2, "Mission -> Departments phase -> Department: one packet per drawn conduit (the Graph has no third column: a step is represented by its department)");
  assert.ok(sel.every(p => p.kind === "selection" && p.repeats === false && p.durationMs === CONDUIT_TIMING.selectionMs), "selection packets never repeat");
  assert.deepEqual(sel.map(p => p.order), sel.map((_, i) => i));
  const segs = new Map(g1.plan.segments.map(s => [s.edgeId, s]));
  assert.deepEqual(sel.map(p => segs.get(p.edgeId)!.relation).slice(0, 2), ["ownership", "phase-membership"], "travels from the ancestor toward the selected entity");
  assert.equal(segs.get(sel[sel.length - 1].edgeId)!.to, dept.id, "and ends at the nearest drawn entity (the step's department)");
  assert.ok(sel.every((p, i) => p.delayMs === i * CONDUIT_TIMING.selectionStaggerMs));
  assert.ok(new Set(sel.map(p => p.edgeId)).size === sel.length, "exactly one packet per conduit");
  const again = plan(wt, "graph", { selectedId: stepId, expanded: dept.id, pulse: { subject: stepId, serial: 2, view: "graph" } }).plan.packets;
  assert.deepEqual(again.map(p => p.edgeId), sel.map(p => p.edgeId));
  assert.ok(again.every((p, i) => p.id !== sel[i].id), "re-selecting re-keys the packets so they replay once");
  assert.deepEqual(plan(wt, "graph", { selectedId: stepId, expanded: dept.id, pulse: { subject: stepId, serial: 1, view: "graph" }, reducedMotion: true }).plan.packets, [], "reduced motion: zero packets");
  assert.deepEqual(plan(wt, "graph", { mode: "stack", selectedId: stepId, expanded: dept.id, pulse: { subject: stepId, serial: 1, view: "graph" } }).plan.packets, [], "phones: no packets");
  // Selection recedes the rest, never removes it.
  const roles = g1.plan.segments.map(s => s.role);
  assert.ok(roles.includes("path") && roles.includes("receded") && !roles.includes("idle"));
  assert.deepEqual(g1.plan.segments.filter(s => s.relation !== "dependency").map(s => s.edgeId).sort(), g1.layout.edges.filter(e => e.rendering === "line" && e.relation !== "dependency").map(e => e.id).sort(), "receded structural conduits stay in the plan");
  assert.ok(g1.plan.segments.filter(s => s.relation === "dependency").every(s => s.role === "path"), "W7: a Graph cross-link appears only when it touches the subject");
  assert.ok(g1.plan.segments.every(s => conduitStyle(s.relation, s.role, s.tone, "full").opacity > 0.05), "and stay visible");
  assert.ok(g1.plan.junctions.some(j => j.kind === "selected" && j.x > 0));
}

// 3. Execution truth. Persisted running/active without executor confirmation is STATIC; completed / blocked / error / pending never repeat.
{
  const running = { jobStatus: "running" as const, status: { planning: "active" as const, plan: "active" as const } };
  const liveStep = (wt: MissionWorktree) => wt.steps.find(s => s.recordedId === "plan")!;
  for (const [label, executor] of [["no executor facts", undefined], ["unreadable executor", { confirmable: false, missionIds: ["job-w3"] }], ["executor reachable, mission not executing", { confirmable: true, missionIds: [] }]] as const) {
    const wt = fixture({ depts: 3, jobStatus: "running", status: { plan: "active" } }, executor as never);
    assert.equal(wt.mission.execution.liveConfirmed, false, label);
    assert.equal(liveStep(wt).status, "active");
    // W5.4B-R1: recorded-running (NOT confirmed) has ZERO autonomous or repeating movement. Static emphasis only; one-shot selection is the only possible packet.
    for (const view of ["graph"] as const) {
      const { plan: p } = plan(wt, view);
      assert.deepEqual(p.packets, [], `${label} (${view}): recorded running never moves on its own`);
      assert.equal(p.liveConfirmed, false);
      assert.ok(!p.junctions.some(j => j.kind === "live"), "no live junction without confirmation");
      const stepNode = plan(wt, view).layout.nodes.find(n => n.status === "active")!;
      const sel = plan(wt, view, { selectedId: stepNode.id, pulse: { subject: stepNode.id, serial: 1, view } }).plan.packets;
      assert.ok(sel.every(k => k.kind === "selection" && k.repeats === false), `${label} (${view}): selecting it runs only the one-shot inspection packet`);
    }
  }
  void running;
  const live = fixture({ depts: 3, jobStatus: "running", status: { plan: "active", research: "pending", "dept:sales-bd": "pending", "dept:marketing": "pending", "dept:finance-ops": "pending", reconcile: "pending", qa: "pending", final: "pending" } }, { confirmable: true, missionIds: ["job-w3"] });
  assert.equal(live.mission.execution.liveConfirmed, true);
  for (const view of ["graph"] as const) {
    const { layout, plan: p } = plan(live, view);
    const node = new Map(layout.nodes.map(n => [n.id, n]));
    const packets = p.packets;
    assert.ok(packets.length >= 1, `${view}: confirmed live may repeat`);
    assert.ok(packets.every(k => k.kind === "live" && k.repeats === true && k.durationMs === CONDUIT_TIMING.liveMs));
    assert.ok(packets.every(k => node.get(p.segments.find(s => s.edgeId === k.edgeId)!.to)!.status === "active"), `${view}: live packets lead ONLY to recorded-active targets`);
    assert.ok(p.segments.filter(s => node.get(s.to)!.status !== "active").every(s => !packets.some(k => k.edgeId === s.edgeId)), "no packet on a conduit to a non-active target");
    assert.ok(packets.length <= CONDUIT_TIMING.maxLivePackets);
    assert.ok(p.junctions.filter(j => j.kind === "live").length === packets.length, "a live junction exists only where a live packet ends");
    assert.deepEqual(plan(live, view, { reducedMotion: true }).plan.packets, [], "reduced motion: confirmed live is still static");
  }
  assert.deepEqual(plan(live, "graph", { mode: "stack" }).plan.packets, [], "phones simplify: no travelling packets");
  // Completed mission: even if an executor list somehow names it, there is no live claim.
  const done = fixture({ depts: 3, jobStatus: "done" }, { confirmable: true, missionIds: ["job-w3"] });
  assert.equal(done.mission.execution.liveConfirmed, false);
  assert.deepEqual(plan(done, "graph").plan.packets, [], "completed never repeats");
  // Blocked / error / pending targets never repeat, even while the mission is confirmed live elsewhere.
  const mixed = fixture({ depts: 3, jobStatus: "running", status: { "dept:marketing": "error", "dept:sales-bd": "pending", "dept:finance-ops": "active", reconcile: "pending", qa: "pending", final: "pending" } }, { confirmable: true, missionIds: ["job-w3"] });
  const m = plan(mixed, "graph"), nodes = new Map(m.layout.nodes.map(n => [n.id, n]));
  assert.ok(m.plan.packets.length >= 1 && m.plan.packets.every(k => nodes.get(m.plan.segments.find(s => s.edgeId === k.edgeId)!.to)!.status === "active"));
  const errorEdge = m.plan.segments.find(s => nodes.get(s.to)!.status === "error")!;
  assert.equal(errorEdge.tone, "alert"); assert.ok(!m.plan.packets.some(k => k.edgeId === errorEdge.edgeId), "error conduit: no movement");
  assert.ok(m.plan.junctions.every(j => j.kind !== "live" || nodes.get(m.plan.segments.find(s => s.edgeId === j.edgeIds[0])!.to)!.status === "active"));
}

// 4. Ambiguous dependency: no conduit, no packet, no junction at the affected node.
{
  const wt = fixture({ depts: 3, ambiguous: true }, { confirmable: true, missionIds: ["job-w3"] });
  const review = wt.phases.find(p => p.key === "team-review")!;
  for (const view of ["graph"] as const) for (const expanded of [null, wt.departments[0].id]) {
    const { layout, plan: p } = plan(wt, view, { selectedId: review.id, expanded, pulse: { subject: review.id, serial: 1, view } });
    assert.ok(!p.segments.some(s => s.to === review.id && s.relation === "dependency"), `${view}: no conduit reaches the ambiguous node`);
    assert.ok(!p.packets.some(k => { const seg = p.segments.find(s => s.edgeId === k.edgeId)!; return seg.to === review.id && seg.relation === "dependency"; }), "no dependency packet either (the Mission still owns the phase: that ownership conduit is a different, resolved relationship)");
    assert.ok(layout.ambiguities.some(a => a.nodeId === review.id), "the W2 marker remains the truth");
  }
}

// 5. Relationship styles are distinguishable by weight / opacity / segmentation / sheath, and never by a different colour.
{
  const pick = (rel: Parameters<typeof conduitStyle>[0]) => conduitStyle(rel, "idle", "quiet", "full");
  const g = { own: pick("ownership"), ph: pick("phase-membership"), dep: pick("department-membership"), dp: pick("dependency") };
  // W7 relationship weight: Mission -> phase is the strongest structure, then phase -> department, then department -> step; a dependency is the quietest.
  assert.ok(g.own.width > g.ph.width && g.ph.width > g.dep.width && g.own.sheathWidth > g.ph.sheathWidth && g.ph.sheathWidth > g.dep.sheathWidth, "weight falls with depth: ownership > phase membership > department membership");
  assert.ok(g.dp.dash && !g.own.dash && !g.ph.dash, "dependencies are segmented / secondary");
  assert.ok(g.dp.sheathWidth === 0 && g.dp.opacity <= g.dep.opacity && g.dp.width < g.ph.width, "a cross-link is quieter than any structural conduit");
  const revealed = conduitStyle("dependency", "path", "quiet", "full"), ownPath = conduitStyle("ownership", "path", "quiet", "full");
  assert.ok(revealed.dash && revealed.opacity < ownPath.opacity && revealed.width < ownPath.width, "a revealed cross-link stays segmented and below the selected ownership path");
  assert.ok(Object.keys(g.ph).every(k => ["width", "opacity", "dash", "sheathWidth", "sheathOpacity"].includes(k)), "a style has no colour field");
  assert.equal(conduitStyle("ownership", "idle", "quiet", "minimal").sheathWidth, 0, "phones drop the sheath");
  assert.ok(conduitStyle("ownership", "idle", "quiet", "light").sheathWidth < g.own.sheathWidth, "1366 simplifies the sheath");
  assert.ok(conduitStyle("ownership", "receded", "quiet", "full").opacity < g.own.opacity && conduitStyle("ownership", "receded", "quiet", "full").opacity > 0.1, "receded structure stays visible");
}

// 6. Junctions come from real topology: the ONE shared origin of the active phase's fan, nothing decorative; counts follow the data.
{
  for (const n of [1, 3, 7, 8, 14]) {
    const wt = fixture({ depts: n });
    const { plan: p } = plan(wt, "graph");
    const fan = p.junctions.filter(j => j.kind === "fan-out");
    if (n === 1) { assert.equal(fan.length, 0, "a single child has no fan"); continue; }
    assert.equal(fan.length, 1, `n=${n}: one clean shared fan-out origin`);
    assert.equal(fan[0].edgeIds.length, n);
    const ids = new Set(p.segments.map(s => s.edgeId));
    assert.ok(p.junctions.every(j => j.edgeIds.length > 0 && j.edgeIds.every(id => ids.has(id))), "every junction is derived from real conduits");
    const out = p.segments.filter(s => fan[0].edgeIds.includes(s.edgeId));
    assert.equal(new Set(out.map(s => `${s.start.x},${s.start.y}`)).size, 1, "from one origin");
    assert.ok(out.every(s => /^M[\d. -]+C[\d. -]+$/.test(s.d)), "smooth curves from the shared origin");
  }
}

// 7. Responsive levels: full / light / minimal; phones keep their containment rails but no junction cluster, sheath or packets.
{
  const wt = fixture({ depts: 7 });
  assert.equal(plan(wt, "graph", { mode: "graph" }).plan.level, "full");
  assert.equal(plan(wt, "graph", { mode: "wide" }).plan.level, "light");
  const s = plan(wt, "graph", { mode: "stack" }).plan;
  assert.equal(s.level, "minimal"); assert.deepEqual(s.junctions, []); assert.deepEqual(s.packets, []);
  assert.ok(s.segments.length > 0 && s.segments.every(x => x.relation !== "dependency"), "the stack keeps its containment rails (dependencies are listed on the node, not drawn)");
}

// 8. W5.4B motion hierarchy and seats.
{
  // nothing repeats except executor-confirmed live: across every state without confirmation, no packet is repeating and none exists at rest
  for (const jobStatus of ["running", "done", "error"] as const) {
    const wt = fixture({ depts: 3, jobStatus, status: { plan: "active" } });
    for (const view of ["graph"] as const) assert.deepEqual(plan(wt, view).plan.packets, [], `${jobStatus} ${view}: no autoplay`);
  }
  // blocked/error: the selection one-shot STALLS (kind stall, no repeat) and never becomes a healthy selection / live packet
  const mixed = fixture({ depts: 3, jobStatus: "running", status: { "dept:marketing": "error", "dept:sales-bd": "pending", "dept:finance-ops": "active", reconcile: "pending", qa: "pending", final: "pending" } }, { confirmable: true, missionIds: ["job-w3"] });
  const base0 = plan(mixed, "graph"), nodes = new Map(base0.layout.nodes.map(n => [n.id, n]));
  assert.ok(!base0.plan.packets.some(k => k.kind === "stall"), "the stall never plays at rest: only when the error target is selected");
  assert.ok(base0.plan.packets.every(k => k.kind === "live"), "at rest the only packets are executor-confirmed live ones");
  const errorDept = base0.layout.nodes.find(n => n.status === "error" && n.kind === "department")!;
  const sel = plan(mixed, "graph", { selectedId: errorDept.id, pulse: { subject: errorDept.id, serial: 1, view: "graph" } }).plan;
  const stalls = sel.packets.filter(k => k.kind === "stall");
  assert.ok(stalls.length >= 1 && stalls.every(k => k.repeats === false && k.durationMs === CONDUIT_TIMING.stallMs), "selecting an error target stalls once");
  assert.ok(stalls.every(k => sel.segments.find(s => s.edgeId === k.edgeId)!.tone === "alert"), "stall only on alert conduits");
  assert.ok(!sel.packets.some(k => k.kind === "live" && sel.segments.find(s => s.edgeId === k.edgeId)!.tone === "alert"), "no flow packet on an error conduit");
  assert.ok(sel.packets.filter(k => k.kind === "selection").length + stalls.length <= CONDUIT_TIMING.maxSelectionPackets + 0, "one-shot packets are bounded");
  // seats: a fault seat on every conduit into an error node; sockets only where a path or recorded-active conduit meets a node; every seat derives from a real conduit
  assert.ok(base0.plan.junctions.filter(j => j.kind === "fault").length >= 1);
  assert.ok(base0.plan.junctions.filter(j => j.kind === "fault").every(j => nodes.get(base0.plan.segments.find(s => s.edgeId === j.edgeIds[0])!.to)!.status === "error"));
  assert.ok(base0.plan.junctions.filter(j => j.kind === "socket").every(j => { const s = base0.plan.segments.find(x => x.edgeId === j.edgeIds[0])!; return s.role === "path" || s.tone === "recorded-active"; }));
  // idle: no socket noise on settled / pending conduits
  const idle = plan(fixture({ depts: 3, jobStatus: "done" }), "graph").plan;
  assert.ok(!idle.junctions.some(j => j.kind === "socket" || j.kind === "fault"), "completed mission at rest: no seats");
  // reduced motion keeps every seat (static emphasis) and loses only packets
  const rm = plan(mixed, "graph", { reducedMotion: true }).plan;
  assert.deepEqual(rm.packets, []); assert.equal(rm.junctions.filter(j => j.kind === "fault").length, base0.plan.junctions.filter(j => j.kind === "fault").length);
}


// C7E.3: the Graph fan's presence (source contract; geometry and the plan are untouched): normal strokes 1.2-1.4px, the selected route 1.5-1.7px, error conduits in the recorded-error amber (never champagne), a champagne-white origin cooling to teal, a precise focal ring.
{
  const { readFileSync } = await import("node:fs");
  const dir = new URL("../src/components/spatial/dive/", import.meta.url), tsx = readFileSync(new URL("MissionConduits.tsx", dir), "utf8"), css = readFileSync(new URL("MissionConduits.module.css", dir), "utf8"), view = readFileSync(new URL("MissionWorktreeView.module.css", dir), "utf8");
  assert.ok(/strokeWidth=\{1\.3\}/.test(tsx) && /strokeWidth=\{1\.6\}/.test(tsx), "normal fan strokes 1.3px, the selected route 1.6px");
  assert.ok(/AMBER = "#d08a4a"/.test(tsx) && !/#cdc6b4/.test(tsx), "error conduits are the recorded-error amber, not a champagne tone");
  assert.ok(/stopColor=\{seg\.relation === "phase-membership" \? WARM : TEAL\}/.test(tsx) && /stopColor=\{TEAL\} stopOpacity=\{0\.58/.test(tsx), "champagne-white at the shared origin, teal at the far end");
  assert.ok(/wt-focal/.test(tsx) && /fan-out"\] \.ring\{[^}]*stroke-width:1\.2/.test(css), "a restrained focal glow and a precise ring");
  assert.ok(/data-kind="phase"\]\[data-active\][^{]*\{box-shadow:inset 0 0 0 1\.5px var\(--gold\)/.test(view), "the active phase card carries the stronger champagne outline");
}
console.log("mission worktree conduit checks passed; pure plan, no stores read or written.");
