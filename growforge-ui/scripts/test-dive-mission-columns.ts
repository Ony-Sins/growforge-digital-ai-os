import assert from "node:assert/strict";
import type { Job, JobStep } from "../src/lib/jobStore";
import { buildMissionWorktree, type MissionWorktree } from "../src/components/spatial/dive/missionWorktree";
import { activePhaseKey, findCollisions, layoutWorktree, type LayoutNode, type ViewState } from "../src/components/spatial/dive/missionWorktreeLayout";
import { planConduits } from "../src/components/spatial/dive/missionWorktreeConduits";
import { readFileSync } from "node:fs";
import { navigateWorktree } from "../src/components/spatial/dive/missionWorktreeNav";
import { stepDisplayLabel } from "../src/components/spatial/dive/missionWorktreeLabels";
import { intelIdentityOf } from "../src/components/spatial/dive/missionIntelHeader";
import { initialSelection, reduceSelection } from "../src/components/spatial/dive/missionWorktreeSelection";
import type { MissionLayoutMode } from "../src/components/spatial/dive/missionFlowModel";

/** C1: the desktop Graph is the Control AI composition: Mission Core slot | one column of the 7 phases | an arc of the active phase's children. Pure geometry. */
const T = "2026-10-01T10:00:00.000Z";
const step = (id: string, kind: JobStep["kind"], over: Partial<JobStep> = {}): JobStep => ({ id, kind, label: id, activity: "", status: "done", percent: 100, weight: 10, dependsOn: [], ...over });
const DEPTS = ["sales-bd", "marketing", "finance-ops", "client-success", "web-design", "web-dev", "ai-automation", "meta-ads", "legal", "ops", "hr", "data", "it", "support"];
function fixture(o: { depts?: number; omit?: string[]; perDept?: number } = {}): MissionWorktree {
  const ids = DEPTS.slice(0, o.depts ?? 5);
  const steps: JobStep[] = [];
  const add = (s: JobStep) => { if (!o.omit?.includes(s.kind)) steps.push(s); };
  add(step("brief", "brief")); add(step("plan", "plan", { dependsOn: ["brief"] })); add(step("research", "research", { dependsOn: ["plan"] }));
  ids.forEach(d => { for (let k = 0; k < (o.perDept ?? 1); k++) add(step(k ? `dept:${d}:${k}` : `dept:${d}`, "department", { departmentId: d, dependsOn: ["research"] })); });
  add(step("reconcile", "reconcile", { dependsOn: steps.filter(s => s.kind === "department").map(s => s.id) })); add(step("qa", "qa", { dependsOn: ["reconcile"] })); add(step("final", "final", { dependsOn: ["qa"] }));
  const job: Job = { id: "job-c1", title: "M", brief: "b", status: "done", percent: 100, verified: true, steps, createdAt: T, updatedAt: T, liveNotes: [], revisions: [],
    planSnapshot: { title: "T", researchQuestions: [], assignments: ids.map(d => ({ departmentId: d, task: "t", activity: "a" })) } };
  return buildMissionWorktree({ job });
}
const base: ViewState = { view: "graph", selectedId: null, expandedDepartmentId: null };
const SIZES: { name: string; w: number; h: number; mode: MissionLayoutMode }[] = [{ name: "1920", w: 1224, h: 764, mode: "graph" }, { name: "1440", w: 1416, h: 584, mode: "graph" }, { name: "1366 yielded", w: 867, h: 406, mode: "wide" }, { name: "1366", w: 1342, h: 418, mode: "wide" }];
const lay = (wt: MissionWorktree, s: (typeof SIZES)[number], state: Partial<ViewState> = {}) => layoutWorktree(wt, { width: s.w, height: s.h }, s.mode, { ...base, ...state }, undefined, s.w < 900 ? { tight: 2 } : s.w < 1180 ? { tight: 1 } : undefined);
const cy = (n: LayoutNode) => n.y + n.h / 2;

for (const s of SIZES) {
  const wt = fixture({ depts: 8 }), l = lay(wt, s);
  const core = l.nodes.find(n => n.kind === "mission")!;
  const phases = wt.canonicalPhaseOrder.map(key => l.nodes.find(n => n.id === wt.phases.find(p => p.key === key)!.id)!);
  assert.ok(phases.every(Boolean) && phases.length === 7);
  // 1. Mission Core slot on the left, one phase column to its right.
  assert.ok(phases.every(p => p.x >= core.x + core.w), `${s.name}: the phase column sits right of the Mission Core slot`);
  assert.ok(Math.abs(cy(core) - l.stage.height / 2) < 1, `${s.name}: the core slot is vertically centred`);
  // 2. The column: one x, canonical order top to bottom, even pitch, inside the stage.
  assert.ok(phases.every(p => p.x === phases[0].x && p.w === phases[0].w), "one column: every phase shares x and width");
  for (let i = 1; i < 7; i++) assert.ok(phases[i].y > phases[i - 1].y, `${s.name}: phase ${i + 1} is below phase ${i}`);
  const pitches = phases.slice(1).map((p, i) => Math.round((p.y - phases[i].y) * 10) / 10);
  assert.ok(Math.max(...pitches) - Math.min(...pitches) < 0.3, `${s.name}: even pitch (${pitches.join(",")})`);
  assert.ok(phases[0].y >= 0 && phases[6].y + phases[6].h <= l.stage.height + 0.5);
  // 3. Mission selected (default): the Departments phase is active; its recorded departments are the child column, canonical order top to bottom.
  const rows = l.nodes.filter(n => n.kind === "department").sort((a, b) => a.y - b.y);
  assert.equal(rows.length, 8); assert.equal(activePhaseKey(wt, { ...base }), "departments");
  const hub = phases[3], fanX = hub.x + hub.w;
  assert.ok(rows.every(r => r.x >= fanX + 20), `${s.name}: every row is right of the active phase`);
  // 4. The rows lie on a convex arc about the fan origin: the middle rows reach furthest right, the ends curve back, symmetric about the origin's height when it is centred.
  const mid = Math.max(...rows.map(r => r.x));
  assert.ok(rows[0].x < mid - 1 && rows[rows.length - 1].x < mid - 1, `${s.name}: ends curve back (convex arc)`);
  const centreRow = rows.reduce((b, r) => (Math.abs(cy(r) - cy(hub)) < Math.abs(cy(b) - cy(hub)) ? r : b));
  assert.ok(centreRow.x >= mid - 6, `${s.name}: the row nearest the fan origin reaches furthest`);
  // 5. Only recorded entities; steps are never a third column; no collisions; nothing outside the stage horizontally.
  assert.equal(l.nodes.filter(n => n.kind === "step").length, 0);
  assert.deepEqual(findCollisions(l), [], `${s.name}: no collisions`);
  for (const n of l.nodes) assert.ok(n.x >= -0.5 && n.x + n.w <= s.w + 0.5, `${s.name}: ${n.id} inside the stage horizontally`);
  assert.equal(l.nodes.length, 1 + 7 + 8, "Mission + phases + recorded departments, nothing manufactured");
  const expanded = lay(wt, s, { expandedDepartmentId: wt.departments[0].id, selectedId: wt.departments[0].id });
  assert.equal(expanded.nodes.filter(n => n.kind === "step").length, 0, "an expanded department adds no third column");
  assert.deepEqual(expanded.nodes.filter(n => n.kind !== "step").map(n => [n.id, n.x, n.y]), l.nodes.map(n => [n.id, n.x, n.y]), "selecting / expanding a department moves nothing");
}

// 6. The active phase follows the selection; other phases have no child entities, so the child column is empty (never filled with invented rows).
{
  const wt = fixture({ depts: 6 }), s = SIZES[0];
  const qa = wt.phases.find(p => p.key === "qa")!, research = wt.phases.find(p => p.key === "live-research")!;
  assert.equal(activePhaseKey(wt, { ...base, selectedId: qa.id }), "qa");
  assert.equal(lay(wt, s, { selectedId: qa.id }).nodes.filter(n => n.kind === "department").length, 0);
  assert.equal(activePhaseKey(wt, { ...base, selectedId: research.id }), "live-research");
  const dept = wt.departments[2];
  assert.equal(activePhaseKey(wt, { ...base, selectedId: dept.id }), "departments");
  assert.equal(lay(wt, s, { selectedId: dept.id }).nodes.filter(n => n.kind === "department").length, 6);
  const stepOfDept = wt.steps.find(x => x.departmentId === dept.id)!;
  assert.equal(activePhaseKey(wt, { ...base, selectedId: stepOfDept.id }), "departments");
  // a phase the record lacks keeps its slot as a gap marker; the others do not move
  const full = lay(wt, s), gap = lay(fixture({ depts: 6, omit: ["research"] }), s);
  assert.equal(gap.gaps.length, 1);
  for (const label of ["Client Brief", "Planning", "Departments", "Team Review", "QA", "Final Plan"]) {
    const a = full.nodes.find(n => n.label.startsWith(label))!, b = gap.nodes.find(n => n.label.startsWith(label))!;
    assert.deepEqual([b.x, b.y], [a.x, a.y], `${label} keeps its slot when another phase is missing`);
  }
  const research1 = full.nodes.find(n => n.label.startsWith("Live Research"))!;
  assert.equal(Math.round(gap.gaps[0].y + gap.gaps[0].h / 2), Math.round(research1.y + research1.h / 2), "the gap sits in the slot its phase would have had");
}

// 7. Many departments: still no collisions; the stage scrolls rather than overlapping.
for (const s of SIZES) for (const n of [1, 3, 14]) {
  const l = lay(fixture({ depts: n }), s);
  assert.deepEqual(findCollisions(l), [], `${s.name} n=${n}`);
  assert.equal(l.nodes.filter(x => x.kind === "department").length, n);
  if (n <= 8) assert.equal(l.contentHeight, s.h, `${s.name} n=${n}: fits without vertical scroll`);
}

// 8. Conduit relations survive: the Mission owns every phase (core -> column), the active phase contains its rows.
{
  const wt = fixture({ depts: 5 }), l = lay(wt, SIZES[0]);
  assert.equal(l.edges.filter(e => e.relation === "ownership" && e.rendering === "line").length, 7);
  assert.equal(l.edges.filter(e => e.relation === "phase-membership" && e.rendering === "line").length, 5);
}

// 9. C3 conduit fan: ONE shared origin per fan, exactly one line per real relation (no decorative lines), the selected route is flagged, the fade is a distance in [0, 1], smooth cubic curves.
for (const s of SIZES) {
  const wt = fixture({ depts: 6 }), dept = wt.departments[2];
  for (const sel of [null, dept.id]) {
    const l = lay(wt, s, { selectedId: sel }), plan = planConduits({ layout: l, worktree: wt, selectedId: sel, pulse: null, reducedMotion: false });
    const own = plan.segments.filter(x => x.relation === "ownership"), mem = plan.segments.filter(x => x.relation === "phase-membership");
    assert.equal(own.length, 7, `${s.name}: one core -> phase line per recorded phase`);
    assert.equal(mem.length, 6, `${s.name}: one fan line per REAL child, never extra`);
    assert.equal(new Set(own.map(x => `${x.start.x},${x.start.y}`)).size, 1, "every core line leaves one shared point");
    assert.equal(new Set(mem.map(x => `${x.start.x},${x.start.y}`)).size, 1, "every fan line leaves ONE shared focal point");
    const hub = l.nodes.find(n => n.id === mem[0].from)!;
    assert.ok(mem[0].start.x > hub.x + hub.w && Math.abs(mem[0].start.y - (hub.y + hub.h / 2)) < 1, "the focal point sits just beside the active phase card");
    assert.ok(plan.segments.every(x => x.fade >= 0 && x.fade <= 1));
    assert.ok([...own, ...mem].every(x => /^M[\d. -]+C[\d. -]+$/.test(x.d)), "smooth cubic S-curves, no swirl");
    assert.equal(own.filter(x => x.route).length, 1, "exactly one core conduit is the selected route (the active phase)");
    assert.equal(mem.filter(x => x.route).length, sel ? 1 : 0, "the fan route is the selected department only (none while only the Mission is selected)");
    if (sel) assert.equal(mem.find(x => x.route)!.to, dept.id);
    assert.ok(plan.junctions.some(j => j.kind === "fan-out" && Math.abs(j.x - mem[0].start.x) < 1.5), "the focal point is a fan-out junction");
  }
}

// 10. C5A.1: level 2 is ALWAYS the active phase's real immediate children: departments for Departments, the phase's recorded steps for every other phase. Two levels only; a step row is selectable in the Graph.
for (const s of SIZES) {
  const wt = fixture({ depts: 5 });
  for (const phase of wt.phases.filter(p => p.key !== "departments")) {
    const l = lay(wt, s, { selectedId: phase.id }), rows = l.nodes.filter(n => n.kind === "step");
    assert.deepEqual(rows.map(n => n.id).sort(), [...phase.stepIds].sort(), `${s.name} ${phase.key}: exactly its recorded steps`);
    assert.equal(l.nodes.filter(n => n.kind === "department").length, 0);
    assert.deepEqual(findCollisions(l), [], `${s.name} ${phase.key}: no collisions`);
    const hub = l.nodes.find(n => n.id === phase.id)!;
    assert.ok(rows.every(r => r.x >= hub.x + hub.w + 20 && r.parentId === phase.id && r.depth === 2), "rows sit right of the active phase, one level only");
    const plan = planConduits({ layout: l, worktree: wt, selectedId: phase.id, pulse: null, reducedMotion: false });
    assert.equal(plan.segments.filter(x => x.relation === "phase-membership").length, rows.length, "one fan line per real step");
  }
  const qa = wt.phases.find(p => p.key === "qa")!, stepId = qa.stepIds[0];
  assert.equal(reduceSelection(initialSelection(wt, "graph"), { type: "select", id: stepId }, wt).selectedId, stepId, "a phase's step is selectable");
  assert.equal(lay(wt, s, { selectedId: stepId }).nodes.filter(n => n.kind === "step").length, qa.stepIds.length, "selecting the step keeps the same rows");
}

// 11. The Core and the phase column NEVER move with the selection (the composition is centred on the widest fan, not on what is currently drawn).
for (const s of SIZES) {
  const wt = fixture({ depts: 8 }), pos = (state: Partial<ViewState>) => lay(wt, s, state).nodes.filter(n => n.kind === "mission" || n.kind === "phase").map(n => `${n.id}@${n.x},${n.y}`).join("|");
  const base = pos({});
  for (const id of [...wt.phases.map(p => p.id), wt.departments[3].id, wt.steps[0].id]) assert.equal(pos({ selectedId: id }), base, `${s.name}: selecting ${id} moves nothing`);
}

// 12. C5D: one canonical label per entity: the graph row, the panel title and the shared display label are the same text.
for (const s of SIZES) {
  const wt = fixture({ depts: 3 });
  for (const phase of wt.phases.filter(p => p.key !== "departments")) {
    const rows = lay(wt, s, { selectedId: phase.id }).nodes.filter(n => n.kind === "step");
    rows.forEach(r => { const st = wt.steps.find(x => x.id === r.id)!; assert.equal(r.label, stepDisplayLabel(wt, st), `${phase.key}: graph row == display label`); assert.equal(intelIdentityOf(wt, r.id).title, r.label, `${phase.key}: panel title == graph row`); });
  }
  lay(wt, s).nodes.filter(n => n.kind === "phase" || n.kind === "department").forEach(n => assert.equal(intelIdentityOf(wt, n.id).title, n.label, `${n.kind}: panel title == graph label`));
}

// 13. C6B: in the desktop Graph, Right from ANY phase goes to its currently drawn immediate child row; Left comes back. The phone (no option) behaves exactly as before.
{
  const wt = fixture({ depts: 3 }), graph = { graphSteps: true }, s = SIZES[0];
  const orderedDepartments = lay(wt, s).nodes.filter(n => n.kind === "department").sort((a, b) => a.y - b.y);
  const depts = wt.phases.find(p => p.key === "departments")!;
  assert.equal(navigateWorktree("ArrowRight", depts.id, wt, graph), orderedDepartments[0].id, "Departments -> its first drawn department row (unchanged)");
  assert.equal(navigateWorktree("ArrowRight", depts.id, wt), orderedDepartments[0].id);
  for (const phase of wt.phases.filter(p => p.key !== "departments")) {
    const drawn = lay(wt, s, { selectedId: phase.id }).nodes.filter(n => n.kind === "step").map(n => n.id);
    const next = navigateWorktree("ArrowRight", phase.id, wt, graph);
    assert.ok(next && drawn.includes(next), `${phase.key}: Right lands on a drawn child row`);
    assert.equal(next, phase.stepIds[0], `${phase.key}: the first recorded step`);
    assert.equal(reduceSelection(reduceSelection(initialSelection(wt, "graph"), { type: "select", id: phase.id }, wt), { type: "select", id: next! }, wt).selectedId, next, "selecting it keeps it (Graph)");
    assert.equal(navigateWorktree("ArrowLeft", next!, wt, graph), phase.id, `${phase.key}: Left returns to the phase`);
    assert.equal(navigateWorktree("ArrowDown", next!, wt, graph), null, "a lone row has no sibling to move to");
    assert.equal(navigateWorktree("ArrowRight", phase.id, wt), null, `${phase.key}: without the option (phone) Right does nothing, as before`);
    assert.equal(navigateWorktree("ArrowLeft", next!, wt), wt.mission.id, "without the option Left from that step still goes to the mission, as before");
  }
  const brief = wt.phases.find(p => p.key === "client-brief")!;
  assert.equal(navigateWorktree("ArrowDown", brief.id, wt, graph), wt.phases[1].id, "phase Up / Down / Home / End untouched");
  assert.equal(navigateWorktree("ArrowLeft", brief.id, wt, graph), wt.mission.id, "Left from a phase is still the mission");
  assert.equal(navigateWorktree("ArrowRight", wt.mission.id, wt, graph), wt.phases[0].id, "Right from the mission is still the first phase");
}

// 13b. C6B.1: Left from ANY drawn child row is one press to its parent in the desktop Graph (the expand-collapse step is skipped there; the phone keeps it).
{
  const view = readFileSync(new URL("../src/components/spatial/dive/MissionWorktreeView.tsx", import.meta.url), "utf8"), wt = fixture({ depts: 3 }), graph = { graphSteps: true };
  assert.ok(/const graphKeys = !phone;/.test(view), "the Graph key mode is the desktop (not the phone)");
  assert.ok(/event\.key === "ArrowLeft" && !graphKeys && currentId === selection\.expandedDepartmentId/.test(view), "the collapse-first rule applies only outside the desktop Graph");
  assert.ok(/navigateWorktree\(event\.key, currentId, worktree, \{ graphSteps: graphKeys \}\)/.test(view));
  const depts = wt.phases.find(p => p.key === "departments")!, first = navigateWorktree("ArrowRight", depts.id, wt, graph)!;
  assert.equal(navigateWorktree("ArrowLeft", first, wt, graph), depts.id, "Departments -> first department -> Left -> Departments");
  assert.equal(navigateWorktree("ArrowLeft", first, wt), depts.id, "the tree itself is unchanged");
}

// 14. C7E.2: the child fan spans ~60% of the stage height even with few rows (a pair is capped), the arc is deep (the middle rows reach far right, the ends curve strongly back) and one child stays a single row.
for (const s of SIZES.filter(x => x.mode !== "stack")) {
  const H = s.h;
  for (const n of [3, 4, 8]) {
    const wt = fixture({ depts: n }), rows = lay(wt, s).nodes.filter(x => x.kind === "department").sort((a, b) => a.y - b.y);
    const span = rows[rows.length - 1].y + rows[rows.length - 1].h - rows[0].y;
    if (n >= 4) assert.ok(span >= 0.5 * H && span <= 0.72 * H, `${s.name} n=${n}: rows span 50-72% of the stage height (${Math.round(span)} / ${H})`);
    else assert.ok(span >= 0.3 * H, `${s.name} n=${n}: a few rows still fan out (${Math.round(span)} / ${H})`);
    const mid = Math.max(...rows.map(r => r.x)), ends = Math.min(rows[0].x, rows[rows.length - 1].x);
    const hubR = lay(wt, s).nodes.find(x => x.label.startsWith("Departments"))!, reach = mid - (hubR.x + hubR.w);
    assert.ok(mid - ends >= 0.2 * reach, `${s.name} n=${n}: a deep arc (ends ${Math.round(mid - ends)}px back of a ${Math.round(reach)}px reach)`);
    assert.deepEqual(findCollisions(lay(wt, s)), []);
  }
  const one = lay(fixture({ depts: 1 }), s), only = one.nodes.filter(x => x.kind === "department");
  assert.equal(only.length, 1); const hub = one.nodes.find(x => x.label.startsWith("Departments"))!;
  assert.ok(Math.abs(only[0].y + only[0].h / 2 - (hub.y + hub.h / 2)) < 1, `${s.name}: a single child sits level with its phase`);
  const qa = fixture({ depts: 3 }); const qaPhase = qa.phases.find(p => p.key === "qa")!;
  assert.equal(lay(qa, s, { selectedId: qaPhase.id }).nodes.filter(x => x.kind === "step").length, 1, "a single-step phase keeps one row");
}

// 15. C7E.3.2: a level-2 row's status badge is anchored to its text (a grid after the meta / label, fixed 8px gap), never to the row's far edge; the geometry-pinned corner mark is gone on those rows.
{
  const css = readFileSync(new URL("../src/components/spatial/dive/MissionWorktreeView.module.css", import.meta.url), "utf8"), tail = css.slice(css.indexOf("C7E.3.2"));
  assert.ok(/\.head\{display:grid;grid-template-columns:minmax\(0,max-content\) max-content minmax\(0,1fr\);grid-template-areas:"name name name" "meta badge \.";column-gap:8px/.test(tail), "label line, then meta + badge with an 8px gap");
  assert.ok(/\.head \.badge\{grid-area:badge;position:static;right:auto;bottom:auto/.test(tail), "the badge is in the flow, not absolutely pinned to the row's edge");
  assert.ok(/grid-template-areas:"name badge \."/.test(tail), "the yielded tier (no meta line) puts the dot right after the label");
  assert.ok(/::after\{background:none\}/.test(tail), "no second, corner-pinned status mark on level-2 rows");
}

// 16. C7E.3.2.1: on the yielded tiers a row's dot rides INSIDE the label's text flow (so it follows the last rendered line of a wrapped name); only a name the 2-line clamp cuts falls back to the dot after the label box. 1920 is unchanged.
{
  const base = new URL("../src/components/spatial/dive/", import.meta.url), tsx = readFileSync(new URL("MissionWorktreeView.tsx", base), "utf8"), css = readFileSync(new URL("MissionWorktreeView.module.css", base), "utf8"), tail = css.slice(css.indexOf("C7E.3.2.1"));
  assert.ok(/isRow\(node\) && stageTier \? <span className=\{styles\.flow\}>\{node\.label\}\{badge\(node\)\}<\/span> : node\.label/.test(tsx), "yielded tiers: the badge is inside the label's inline flow");
  assert.ok(/isRow\(node\) && badge\(node, !!stageTier\)/.test(tsx), "the other badge stays the meta-line badge (1920) / the clip fallback (yielded)");
  assert.ok(/label\.scrollHeight > label\.clientHeight \+ 6/.test(tsx) && /data-clip/.test(tsx), "only a clamp-cut label is flagged");
  assert.ok(/--dot-x/.test(tsx) && /--dot-y/.test(tsx) && /measureText\("\\u2026"\)/.test(tsx) && /end \+ 5\.2/.test(tsx), "a clamp-cut label's dot is placed by one measurement pass at the end of the last visible line (text + ellipsis)");
  assert.ok(!/useState/.test(tsx.slice(tsx.indexOf("ellipsisProbe") - 200, tsx.indexOf("ellipsisProbe") + 2200)), "no React state for this layout");
  assert.ok(/\.head b \.badge\{display:inline-flex;vertical-align:middle;margin:-2px 0 -2px 6px\}/.test(tail), "a controlled 6px gap, no line growth");
  assert.ok(/\.head>\.badge\[data-fallback\]\{display:none\}/.test(tail) && /\[data-clip\] \.head>\.badge\[data-fallback\]\{display:inline-flex;position:absolute;grid-area:auto;left:var\(--dot-x,0\);top:var\(--dot-y,0\)/.test(tail), "the clipped label's dot is absolutely placed from the measured point (not a fixed right-edge slot)");
  // C7E.5: the desktop chassis is a function of the stage only (never of the mission's own fan)
  const layoutSrc = readFileSync(new URL("../src/components/spatial/dive/missionWorktreeLayout.ts", import.meta.url), "utf8");
  assert.ok(/const reserve = Math\.max\(120, Math\.min\(available, Math\.max\(\(0\.56 \* H\) \/ 2 \/ 0\.8, 0\.12 \* W\)\)\);/.test(layoutSrc) && !/const reserve = .*model\.departments/.test(layoutSrc), "C7E.5: the chassis centring uses a fixed envelope, not this mission's widest fan");
  // C7E.6: non-destructive mission switch + gear indexing (source contract; the behaviour was recorded in a live run, see state.md)
  const lensSrc = readFileSync(new URL("../src/components/spatial/dive/MissionWorktreeLens.tsx", import.meta.url), "utf8");
  const selSrc = readFileSync(new URL("../src/components/spatial/dive/MissionSelector.tsx", import.meta.url), "utf8");
  const globalsSrc = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  // C7E.6.1: a true content cross-fade (clones of only the outgoing mission-dependent layers; the chassis is never duplicated)
  const ghostSrc = readFileSync(new URL("../src/components/spatial/dive/missionSwitchGhost.ts", import.meta.url), "utf8");
  assert.ok(/captureGhosts\(\)/.test(lensSrc) && /presentGhosts\(ghosts\)/.test(lensSrc) && /prefers-reduced-motion: reduce/.test(lensSrc) && !/MX_OUT_MS/.test(lensSrc), "the previous record stays visible until the next is read, then outgoing layers cross-fade against incoming ones; reduced motion swaps atomically with no clones");
  assert.ok(/inert = true/.test(ghostSrc) && /aria-hidden/.test(ghostSrc) && /data-mx-shell/.test(ghostSrc) && /GHOST_MS = 220, IN_MS = 280, IN_DELAY_MS = 70/.test(ghostSrc), "the outgoing copy is inert, aria-hidden, shell-less; 220ms out / 280ms in after a 70ms delay");
  assert.ok(/html \[data-mx-ghost\]\{pointer-events:none!important\}/.test(globalsSrc) && /@keyframes mx-tout\{from\{opacity:1;translate:0 0\}to\{opacity:0;translate:0 -2px\}\}/.test(globalsSrc) && /mx-tin \.17s cubic-bezier\(\.1,\.9,\.2,1\) \.085s/.test(globalsSrc) && /data-mx-split/.test(ghostSrc) && /html\[data-mx="in"\]/.test(globalsSrc) && !/html\[data-mx="out"\]/.test(globalsSrc) && /prefers-reduced-motion:reduce\)\{html \[data-mx-ghost\],html \[data-mx-ghost\] \*,html\[data-mx\] \*\{animation:none!important\}/.test(globalsSrc) && !/data-mx[^{]*\{[^}]*(blur|filter)/.test(globalsSrc), "C7E.6.2: structural layers overlap softly (220/280ms), typography / value layers hand off tightly (140ms out with -2px, 170ms in after 85ms from +2px); pointer-less, reduced-motion safe, no blur / filter / scale");
  assert.ok(/onPointerDown=\{onGearDown\}/.test(selSrc) && /setPointerCapture/.test(selSrc) && /DRAG_STEP_PX = 32, DRAG_HYSTERESIS_PX = 5/.test(selSrc) && !/coolUntil|DRAG_COOLDOWN/.test(selSrc) && /d\.origin = d\.origin \+ dir \* need/.test(selSrc) && /event\.clientY - d\.origin/.test(selSrc) && !/clientX - d\.origin/.test(selSrc) && /suppressClick/.test(selSrc), "C7E.6.3: the gear is a vertical ratchet: only clientY indexes, a detent every 32px (37px when reversing), the origin is rebased at each detent, no cooldown, and the click after a drag is suppressed");
  assert.ok(/indexBy\(dir, true\)/.test(selSrc) && /wheelSteps\(carry\.current/.test(selSrc) && /data-tick/.test(selSrc), "C7E.6.3: a held drag commits every detent; the wheel accumulates into the same detent system; one restrained ring tick per index");
  // C8: the Mission Core is a glass bubble (gradients only, transform / opacity motion only, persistent, still under reduced motion)
  const glassTsx = readFileSync(new URL("../src/components/spatial/dive/MissionCoreGlass.tsx", import.meta.url), "utf8"), glassCss = readFileSync(new URL("../src/components/spatial/dive/MissionCoreGlass.module.css", import.meta.url), "utf8");
  assert.ok(!/blur\(|filter|feGaussian|backdrop/i.test((glassTsx + glassCss).replace(/\/\*[\s\S]*?\*\//g, "")), "C8: no blur / filter in the glass bubble");
  assert.ok(/@keyframes yaw/.test(glassCss) && /@keyframes spin/.test(glassCss) && /prefers-reduced-motion:reduce\)\{\.glass,\.glass \*\{animation:none!important/.test(glassCss), "C8: continuous slow yaw + drifting flow, still bubble under reduced motion");
}
console.log("test-dive-mission-columns: core slot, phase column, convex child arc, active-phase rule, stability and no-collision checks passed");
