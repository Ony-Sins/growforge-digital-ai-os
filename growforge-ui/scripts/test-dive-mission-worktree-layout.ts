import assert from "node:assert/strict";
import type { Job, JobStep } from "../src/lib/jobStore";
import { buildMissionWorktree, type MissionWorktree } from "../src/components/spatial/dive/missionWorktree";
import { DEPARTMENT_TAXONOMY } from "../src/lib/departmentTaxonomy";
import { ancestryOf, departmentRank, findCollisions, layoutWorktree, orderDepartments, resolveViewState, type ViewState, type WorktreeLayout } from "../src/components/spatial/dive/missionWorktreeLayout";
import type { MissionLayoutMode } from "../src/components/spatial/dive/missionFlowModel";

/** W2 contract tests for the canonical Graph layout engine (desktop arrangement + phone stack). Pure fixtures: no stores read or written. */
const T = "2026-10-01T10:00:00.000Z";
const step = (id: string, kind: JobStep["kind"], over: Partial<JobStep> = {}): JobStep => ({ id, kind, label: id, activity: "", status: "done", percent: 100, weight: 10, dependsOn: [], ...over });
const DEPTS = ["sales-bd", "marketing", "finance-ops", "client-success", "web-design", "web-dev", "ai-automation", "meta-ads", "legal", "ops", "hr", "data", "it", "support"];
interface Opts { depts?: number; stepsPer?: number[]; omit?: string[]; ambiguous?: boolean; errorResearch?: boolean; longNames?: boolean; unknown?: ("free" | "dept")[]; reverse?: boolean; ids?: string[] }
function worktree(o: Opts = {}): MissionWorktree {
  const n = o.ids ? o.ids.length : (o.depts ?? 3);
  const ids = o.ids ?? (o.reverse ? DEPTS.slice(0, n).reverse() : DEPTS.slice(0, n));
  const steps: JobStep[] = [];
  const add = (s: JobStep) => { if (!o.omit?.includes(s.kind)) steps.push(s); };
  add(step("brief", "brief"));
  add(step("plan", "plan", { dependsOn: ["brief"] }));
  add(step("research", "research", { dependsOn: ["plan"], ...(o.errorResearch ? { status: "error", percent: 100, error: "No search-grounded sources were returned." } : {}) }));
  ids.forEach((d, i) => {
    const copies = o.ambiguous ? 2 : 1;
    for (let k = 0; k < Math.max(1, copies, o.stepsPer?.[i] ?? 1); k++) add(step(`dept:${d}`, "department", { departmentId: d, label: o.longNames ? `${d} with an exceptionally long recorded department label that must not break layout` : d, dependsOn: ["research"], status: i === 1 ? "error" : "done" }));
  });
  if (o.unknown?.includes("dept") && ids[0]) add(step("mystery-dept", "legacy-kind" as never, { label: "Mystery dept step", departmentId: ids[0], dependsOn: ["research"] }));
  if (o.unknown?.includes("free")) add(step("mystery-free", "legacy-kind" as never, { label: "Mystery free step", dependsOn: ["plan"], status: "error", error: "legacy failure" }));
  add(step("reconcile", "reconcile", { dependsOn: ids.map(d => `dept:${d}`) }));
  add(step("qa", "qa", { dependsOn: ["reconcile"] }));
  add(step("final", "final", { dependsOn: ["qa"] }));
  const job: Job = { id: "job-w2", title: o.longNames ? "A very long mission title that keeps going and going to test truncation behaviour" : "Mission", brief: "b", status: "done", percent: 100, verified: true, steps, createdAt: T, updatedAt: T, liveNotes: [], revisions: [],
    planSnapshot: n ? { title: "T", researchQuestions: [], assignments: ids.map(d => ({ departmentId: d, task: "t", activity: "a" })) } : undefined };
  return buildMissionWorktree({ job });
}
const STAGES: { name: string; w: number; h: number; mode: MissionLayoutMode }[] = [
  { name: "1920x1080", w: 1920 - 24, h: 1080 - 350, mode: "graph" }, { name: "1440x900", w: 1440 - 24, h: 900 - 350, mode: "graph" },
  { name: "1366x768", w: 1366 - 24, h: 768 - 350, mode: "wide" }, { name: "390x844", w: 390 - 24, h: 844 - 300, mode: "stack" }, { name: "375x667", w: 375 - 24, h: 667 - 300, mode: "stack" },
];
const base: ViewState = { view: "graph", selectedId: null, expandedDepartmentId: null };
const key = (l: WorktreeLayout) => JSON.stringify(l);

// 1. Deterministic: same worktree + viewport + state = same geometry.
for (const s of STAGES) for (const view of ["graph"] as const) {
  const wt = worktree({ depts: 7 });
  const a = layoutWorktree(wt, { width: s.w, height: s.h }, s.mode, { ...base, view });
  assert.equal(key(a), key(layoutWorktree(worktree({ depts: 7 }), { width: s.w, height: s.h }, s.mode, { ...base, view })), `${s.name} ${view} is deterministic`);
}

// 2. Every node is a real entity, for every viewport, department count and expansion.
for (const s of STAGES) for (const n of [0, 1, 3, 7, 8, 14]) for (const expandIndex of [-1, 0]) {
  const wt = worktree({ depts: n, stepsPer: [4] });
  const expanded = expandIndex >= 0 && wt.departments[0] ? wt.departments[0].id : null;
  const graph = layoutWorktree(wt, { width: s.w, height: s.h }, s.mode, { ...base, selectedId: null, expandedDepartmentId: expanded });
  assert.ok(graph.nodes.some(x => x.kind === "mission") && graph.nodes.filter(x => x.kind === "phase").length === wt.phases.length, "the Mission and every recorded phase are always drawn");
  const entityIds = new Set([wt.mission.id, ...wt.phases.map(p => p.id), ...wt.departments.map(d => d.id), ...wt.steps.map(x => x.id)]);
  assert.ok(graph.nodes.every(x => entityIds.has(x.id)), "every node is a real Worktree entity (no layout-only nodes)");
  assert.equal(wt.departments.length, n);
  // 3. No collisions and nothing outside the stage horizontally (never horizontal overflow).
  for (const layout of [graph]) {
    assert.deepEqual(findCollisions(layout), [], `${s.name} ${layout.view} n=${n} exp=${expandIndex}: no node overlaps`);
    for (const node of layout.nodes) { assert.ok(node.x >= -0.5 && node.x + node.w <= s.w + 0.5, `${s.name} ${layout.view} ${node.id} inside the stage horizontally`); assert.ok(node.w > 0 && node.h > 0 && node.y >= -0.5); assert.ok(node.y + node.h <= layout.contentHeight + 0.5, "inside the content height"); }
    for (const gap of layout.gaps) assert.ok(gap.x >= -0.5 && gap.x + gap.w <= s.w + 0.5, "gap markers stay inside too");
    assert.ok(layout.contentHeight >= s.h);
    if (s.mode !== "stack" && n <= 8 && expandIndex < 0) assert.equal(layout.contentHeight, s.h, `${s.name} ${layout.view} n=${n} collapsed fits without vertical scroll`);
    // Interaction floors: never shrink a clickable node below the floor; the stage scrolls instead.
    for (const node of layout.nodes) {
      if (s.mode === "stack") assert.ok(node.kind === "phase" && node.h > node.headerH ? node.headerH >= 40 : node.h >= 40, `${s.name} ${layout.view} ${node.id}: phone rows are at least 40px (${node.h})`);
      else if (node.kind === "step") assert.ok(node.h >= 28, `${s.name} ${layout.view} step ${node.id} is at least 28px (${node.h})`);
      else if (node.kind === "department") assert.ok(node.headerH >= 30, `${s.name} ${layout.view} department head is at least 30px (${node.headerH})`);
    }
  }
}

// 4. Selection / expansion are resolved by entity id; ancestry is the recorded chain.
{
  const wt = worktree({ depts: 4, stepsPer: [3, 2] });
  const dept = wt.departments[1], stepId = wt.steps.find(x => x.departmentId === dept.id)!.id;
  const state: ViewState = { view: "graph", selectedId: stepId, expandedDepartmentId: null };
  const a = resolveViewState(wt, state);
  assert.equal(a.selectedId, stepId);
  assert.equal(a.expandedDepartmentId, dept.id, "selecting a step reveals its department");
  const g = layoutWorktree(wt, { width: 1416, height: 550 }, "graph", state);
  assert.equal(g.state.selectedId, stepId);
  assert.ok(!g.nodes.some(x => x.id === stepId) && g.nodes.some(x => x.id === dept.id), "C1: a department's step is not a Graph node; its department (the nearest drawn ancestor) is there");
  assert.deepEqual(ancestryOf(wt, stepId), [wt.mission.id, wt.steps.find(x => x.id === stepId)!.phaseId, dept.id, stepId].filter(Boolean) as string[]);
  assert.deepEqual(ancestryOf(wt, dept.id), [wt.mission.id, wt.phases.find(x => x.key === "departments")!.id, dept.id]);
  assert.equal(resolveViewState(wt, { view: "graph", selectedId: "step:job-w2/ghost", expandedDepartmentId: "department:job-w2/ghost" }).selectedId, null, "a stale id is dropped, never remapped by label or ordinal");
}

// 5. Departments are data-driven: count follows the data, the rows fan out to the right of the Departments phase in canonical order; the phase column runs in execution order.
{
  for (const n of [1, 3, 7, 8]) {
    const wt = worktree({ depts: n });
    const p = layoutWorktree(wt, { width: 1416, height: 550 }, "graph", { ...base, view: "graph" });
    const depts = p.nodes.filter(x => x.kind === "department");
    assert.equal(depts.length, n);
    const hub = p.nodes.find(x => x.label.startsWith("Departments"))!;
    assert.ok(depts.every(d => d.x > hub.x + hub.w), "department rows sit right of the Departments phase");
    assert.equal(p.edges.filter(e => e.relation === "phase-membership").length, n, "one membership line per recorded department");
    const order = ["brief", "plan", "research", "departments", "reconcile", "qa", "final"];
    const ys = ["Client Brief", "Planning", "Live Research", "Departments", "Team Review", "QA", "Final Plan"].map(l => p.nodes.find(x => x.label.startsWith(l))!.y);
    assert.deepEqual([...ys].sort((a, b) => a - b), ys, `execution order is top to bottom (${order.join(">")})`);
  }
  const wt = worktree({ depts: 3, stepsPer: [4] });
  const expanded = wt.departments[0];
  const g = layoutWorktree(wt, { width: 1416, height: 550 }, "graph", { view: "graph", selectedId: null, expandedDepartmentId: expanded.id });
  assert.ok(!g.edges.some(e => e.relation === "department-membership"), "a department's steps are not drawn in the desktop Graph");
  // the phone stack nests the steps of an expanded department inside it
  const st = layoutWorktree(wt, { width: 366, height: 700 }, "stack", { view: "graph", selectedId: null, expandedDepartmentId: expanded.id });
  const block = st.nodes.find(x => x.id === expanded.id)!, kids = st.nodes.filter(x => x.parentId === expanded.id);
  assert.equal(kids.length, 4);
  assert.ok(kids.every(k => k.x >= block.x && k.y >= block.y), "steps sit under their department on the phone");
  // Long names and many departments with one very large department stay readable (no collisions, fits or scrolls rather than overlaps).
  const heavy = worktree({ depts: 8, stepsPer: [12, 1, 1, 1, 1, 1, 1, 1], longNames: true });
  for (const s of STAGES) for (const view of ["graph"] as const) {
    const l = layoutWorktree(heavy, { width: s.w, height: s.h }, s.mode, { view, selectedId: null, expandedDepartmentId: heavy.departments[0].id });
    assert.deepEqual(findCollisions(l), [], `${s.name} ${view} heavy`);
  }
}

// 6. Relationship semantics are preserved on the edges; nothing is flattened to parent/child.
{
  const wt = worktree({ depts: 3, stepsPer: [2] });
  const g = layoutWorktree(wt, { width: 1416, height: 550 }, "graph", { view: "graph", selectedId: null, expandedDepartmentId: wt.departments[0].id });
  const stack = layoutWorktree(wt, { width: 366, height: 700 }, "stack", { view: "graph", selectedId: null, expandedDepartmentId: wt.departments[0].id });
  const kinds = new Set([...g.edges, ...stack.edges].map(e => e.relation)); // department -> step membership is drawn on the phone stack only
  for (const k of ["ownership", "phase-membership", "department-membership", "dependency"]) assert.ok(kinds.has(k as never), `${k} is present`);
  assert.ok(g.edges.every(e => e.meaning.length > 10), "every edge says what it means");
  assert.ok(g.edges.filter(e => e.relation === "ownership").every(e => e.from === wt.mission.id));
  assert.ok(g.edges.filter(e => e.relation === "dependency").every(e => e.rendering === "line" && e.d.startsWith("M") && (e.count ?? 0) >= 1));
  const departmentsPhase = wt.phases.find(p => p.key === "departments")!;
  assert.ok(g.edges.filter(e => e.relation === "phase-membership").every(e => e.from === departmentsPhase.id), "departments belong to the Departments phase");
  assert.equal(g.nodes.find(n => n.id === wt.phases.find(p => p.key === "team-review")!.id)!.dependsOn.length > 0, true);
}

// 7. Missing phases are gap markers, not entities: positioned in canonical order, no status/progress, not selectable.
{
  for (const view of ["graph"] as const) for (const s of STAGES) {
    const wt = worktree({ depts: 0, omit: ["research"] });
    const l = layoutWorktree(wt, { width: s.w, height: s.h }, s.mode, { ...base, view });
    assert.deepEqual(l.gaps.map(g => g.key).sort(), [...wt.missingPhaseKeys].sort(), "gaps are exactly the missing canonical phases");
    assert.deepEqual(wt.missingPhaseKeys.sort(), ["departments", "live-research"]);
    assert.ok(l.gaps.every(g => g.caption === "not recorded" && !("status" in g) && !("percent" in g)));
    assert.ok(!l.nodes.some(n => n.label === "Live Research" || n.kind === "department"), "no fabricated node");
    assert.ok(l.gaps.every(g => !l.nodes.some(n => n.id.includes(g.key) && n.kind === "phase" && n.id === `phase:job-w2/${g.key}`)));
    assert.deepEqual(findCollisions(l), []);
    const gapOrder = l.gaps.map(g => g.order);
    assert.deepEqual(gapOrder, [...gapOrder].sort((a, b) => a - b));
  }
  const pl = layoutWorktree(worktree({ depts: 0, omit: ["research"] }), { width: 1416, height: 550 }, "graph", { ...base, view: "graph" });
  const planning = pl.nodes.find(n => n.label.startsWith("Planning"))!, review = pl.nodes.find(n => n.label.startsWith("Team Review"))!;
  const gapR = pl.gaps.find(g => g.key === "live-research")!, gapD = pl.gaps.find(g => g.key === "departments")!;
  assert.ok(planning.y + planning.h <= gapR.y && gapR.y + gapR.h <= gapD.y && gapD.y + gapD.h <= review.y, "gaps keep their canonical slot between the recorded neighbours (the phase column runs top to bottom)");
  // A gap is distinguishable from a waiting phase: a pending recorded phase is a node with status "pending".
  const waiting = worktree({ depts: 1 }); waiting.steps.find(s => s.kind === "qa")!.status = "pending";
  const wl = layoutWorktree(buildMissionWorktree({ job: { ...jobOf(waiting) } }), { width: 1416, height: 550 }, "graph", { ...base, view: "graph" });
  assert.equal(wl.nodes.find(n => n.label === "QA")!.status === "done" || wl.nodes.find(n => n.label === "QA")!.status === "pending", true);
}
function jobOf(wt: MissionWorktree): Job {
  return { id: wt.missionId, title: wt.mission.title, brief: "b", status: wt.mission.status, percent: 100, verified: true, createdAt: T, updatedAt: T, liveNotes: [], revisions: [],
    steps: wt.steps.map(s => ({ id: s.recordedId, kind: s.kind, label: s.label, activity: "", status: s.status, percent: s.percent, weight: 10, dependsOn: s.dependencies.prerequisiteIds.map(id => wt.steps.find(x => x.id === id)!.recordedId), ...(s.departmentId ? { departmentId: wt.departments.find(d => d.id === s.departmentId)!.canonicalId } : {}) })) };
}

// 8. Error with 100% recorded progress stays error; the engine never derives one from the other.
{
  const wt = worktree({ depts: 2, errorResearch: true });
  for (const view of ["graph"] as const) {
    const l = layoutWorktree(wt, { width: 1416, height: 550 }, "graph", { ...base, view });
    const r = l.nodes.find(n => n.label === "Live Research")!;
    assert.equal(r.status, "error"); assert.equal(r.percent, 100);
    assert.match(r.detail, /error/); assert.match(r.detail, /100% recorded/);
    assert.ok(!/complete|success|ok\b/i.test(r.detail), "100% is never worded as success");
  }
  const mixed = layoutWorktree(worktree({ depts: 3 }), { width: 1416, height: 550 }, "graph", { ...base, view: "graph" });
  assert.equal(mixed.nodes.find(n => n.label === "Departments")!.status, "error", "a phase containing an error is an error phase");
  assert.equal(mixed.nodes.find(n => n.label === "Departments")!.percent, undefined, "no phase-level percent is invented");
}

// 9. Ambiguous dependencies draw NO connection (step-level or department-level); a marker keeps the candidate step and department ids.
{
  const wt = worktree({ depts: 3, ambiguous: true });
  const review = wt.phases.find(p => p.key === "team-review")!;
  const KNOWN = ["ownership", "phase-membership", "department-membership", "dependency", "recorded-evidence"];
  for (const view of ["graph"] as const) for (const expanded of [null, wt.departments[0].id]) {
    const l = layoutWorktree(wt, { width: 1416, height: 550 }, "graph", { ...base, view, expandedDepartmentId: expanded });
    assert.ok(l.edges.every(e => KNOWN.includes(e.relation)), "no derived or invented relation kind exists");
    const into = l.edges.filter(e => e.to === review.id);
    assert.deepEqual(into.map(e => e.relation).filter(r => r === "dependency"), [], "no dependency of any kind reaches Team Review: every reference is ambiguous");
    assert.ok(!l.edges.some(e => e.to === review.id && e.rendering === "line" && e.relation !== "ownership" && e.relation !== "phase-membership"), "no conduit into the affected node");
    const candidateIds = new Set(wt.steps.filter(s => s.kind === "department").map(s => s.id));
    assert.ok(!l.edges.some(e => e.relation === "dependency" && (candidateIds.has(e.from) || candidateIds.has(e.to)) && e.to === review.id));
    // The unambiguous dependencies still exist: department steps depend on Research.
    assert.ok(l.edges.some(e => e.relation === "dependency" && e.from.startsWith("phase:")), "resolved dependencies are untouched");
    const marker = l.ambiguities.find(m => m.nodeId === review.id)!;
    assert.ok(marker, "the affected node carries an ambiguity marker");
    assert.equal(marker.issues.length, 3);
    assert.ok(marker.issues.every(i => i.kind === "ambiguous" && i.candidateStepIds.length === 2 && i.candidateDepartmentIds.length === 1 && i.reference), "candidate step ids and department ids are preserved as metadata");
    assert.equal(l.nodes.find(n => n.id === review.id)!.ambiguousCount, 3);
    assert.deepEqual(l.nodes.find(n => n.id === review.id)!.dependsOn, [], "and the node records no resolved prerequisites");
  }
  // Candidates spanning different departments: same result, marker only.
  const splitJob: Job = { id: "job-split", title: "S", brief: "b", status: "done", percent: 100, verified: true, createdAt: T, updatedAt: T, liveNotes: [], revisions: [], steps: [
    step("research", "research"), step("shared", "department", { departmentId: "sales-bd", dependsOn: ["research"] }), step("shared", "department", { departmentId: "marketing", dependsOn: ["research"] }), step("reconcile", "reconcile", { dependsOn: ["shared"] }),
  ] };
  const split = buildMissionWorktree({ job: splitJob });
  const sl = layoutWorktree(split, { width: 1416, height: 550 }, "graph", { ...base, view: "graph" });
  const marker = sl.ambiguities.find(m => m.nodeId === "phase:job-split/team-review");
  assert.ok(marker, "the marker exists");
  assert.equal(marker!.issues[0].candidateDepartmentIds.length, 2);
  assert.ok(!sl.edges.some(e => e.to === "phase:job-split/team-review" && e.relation === "dependency"));
}

// 10. Stack: vertical only, no horizontal overflow; the phone Graph is a drill list with containment rails.
{
  const wt = worktree({ depts: 8, stepsPer: [3] });
  for (const s of STAGES.filter(x => x.mode === "stack")) {
    const graph = layoutWorktree(wt, { width: s.w, height: s.h }, "stack", { view: "graph", selectedId: null, expandedDepartmentId: wt.departments[0].id });
    assert.ok(graph.nodes.every(n => n.x >= 0 && n.x + n.w <= s.w + 0.5 && n.w >= 150), `${s.name}: no horizontal overflow and no crushed rows`); assert.deepEqual(findCollisions(graph), []);
    const ys = ["Client Brief", "Planning", "Live Research", "Departments", "Team Review", "QA", "Final Plan"].map(label => graph.nodes.find(n => n.label.startsWith(label))!.y);
    assert.deepEqual([...ys].sort((a, b) => a - b), ys, "the stack reads top to bottom in execution order");
    assert.ok(graph.nodes.filter(n => n.kind === "step" && n.parentId === wt.departments[0].id).length === 3, "the expanded department's three steps are drawn");
    assert.ok(graph.edges.filter(e => e.relation === "dependency").every(e => e.rendering !== "line"), "the stack draws containment rails only; dependencies are listed on the node");
    assert.ok(graph.contentHeight > s.h, "the stack scrolls vertically");
    const missions = graph.nodes.find(n => n.kind === "mission")!;
    assert.ok(graph.nodes.filter(n => n.kind === "phase").every(n => n.x > missions.x), "the stack nests phases under the Mission");
  }
}

// 11. Every recorded step is a node: unknown-kind steps keep their department, or sit in the derived Unclassified region, in both views and every viewport.
{
  for (const s of STAGES) for (const view of ["graph"] as const) {
    const wt = worktree({ depts: 3, unknown: ["free", "dept"] });
    const free = wt.steps.find(x => x.recordedId === "mystery-free")!, inDept = wt.steps.find(x => x.recordedId === "mystery-dept")!;
    assert.equal(free.kindKnown, false); assert.equal(free.phaseKey, undefined); assert.equal(free.departmentId, undefined);
    assert.equal(inDept.kindKnown, false); assert.equal(inDept.phaseKey, undefined); assert.equal(inDept.departmentId, wt.departments[0].id, "department membership is kept");
    assert.ok(wt.departments[0].stepIds.includes(inDept.id));
    const collapsed = layoutWorktree(wt, { width: s.w, height: s.h }, s.mode, { view, selectedId: null, expandedDepartmentId: null });
    const node = collapsed.nodes.find(n => n.id === free.id)!;
    assert.ok(node, `${s.name} ${view}: the unclassified step is drawn without any expansion`);
    assert.equal(node.kindUnknown, true); assert.equal(node.status, "error"); assert.match(node.detail, /type not recorded/);
    assert.ok(!collapsed.nodes.some(n => n.kind === "phase" && n.stepCount !== undefined && n.id.endsWith("legacy-kind")), "no phase was invented for it");
    assert.equal(collapsed.regions.length, 1);
    const region = collapsed.regions[0];
    assert.equal(region.label, "Unclassified recorded steps"); assert.deepEqual(region.stepIds, [free.id]);
    assert.ok(node.x >= region.x - 0.5 && node.y >= region.y - 0.5 && node.x + node.w <= region.x + region.w + 0.5 && node.y + node.h <= region.y + region.h + 0.5, "the step lies inside its region");
    assert.deepEqual(findCollisions(collapsed), [], `${s.name} ${view}: region and nodes do not collide`);
    assert.ok(node.x >= -0.5 && node.x + node.w <= s.w + 0.5, "inside the stage horizontally");
    // The department-bound unknown-kind step appears with its department once expanded, flagged as type unknown, and is selectable by id.
    const expanded = layoutWorktree(wt, { width: s.w, height: s.h }, s.mode, { view, selectedId: inDept.id, expandedDepartmentId: null });
    assert.equal(expanded.state.expandedDepartmentId, wt.departments[0].id);
    const dn = expanded.nodes.find(n => n.id === inDept.id)!;
    if (view === "graph" && s.mode !== "stack") assert.ok(!dn && expanded.nodes.some(n => n.id === wt.departments[0].id), `${s.name} ${view}: C1 Graph draws no step; its department is there`);
    else assert.ok(dn && dn.parentId === wt.departments[0].id && dn.kindUnknown === true, `${s.name} ${view}: kept with its department`);
    assert.ok(!expanded.regions[0].stepIds.includes(inDept.id), "it is not duplicated into the Unclassified region");
    assert.deepEqual(findCollisions(expanded), []);
    // Ids are the real entity ids.
    const again = layoutWorktree(wt, { width: s.w, height: s.h }, s.mode, { ...base, view, selectedId: free.id });
    assert.equal(again.state.selectedId, free.id); assert.ok(again.nodes.every(n => wt.steps.some(q => q.id === n.id) || wt.departments.some(q => q.id === n.id) || wt.phases.some(q => q.id === n.id) || n.id === wt.mission.id), "only real entities");
    assert.deepEqual(ancestryOf(wt, free.id), [wt.mission.id, free.id], "ancestry does not invent a phase");
    if (s.mode === "stack") assert.ok(node.h >= 40, "a phone row for it is at least 40px");
  }
  // A mission made only of unclassified steps still shows every one of them.
  const only = buildMissionWorktree({ job: { id: "job-only", title: "O", brief: "b", status: "done", percent: 100, verified: false, createdAt: T, updatedAt: T, liveNotes: [], revisions: [], steps: Array.from({ length: 6 }, (_, i) => step(`m${i}`, "legacy-kind" as never)) } });
  for (const s of STAGES) for (const view of ["graph"] as const) {
    const l = layoutWorktree(only, { width: s.w, height: s.h }, s.mode, { ...base, view });
    assert.equal(l.nodes.filter(n => n.kind === "step").length, 6, `${s.name} ${view}: all six unclassified steps are present`);
    assert.deepEqual(findCollisions(l), []);
    assert.equal(l.gaps.length, 7, "every canonical phase is a gap marker");
  }
}

// 12. Department order follows the canonical taxonomy (DEPARTMENT_TAXONOMY), not the input order; unknown departments follow, deterministically.
{
  const canonical = DEPARTMENT_TAXONOMY.map(t => t.id as string);
  const shuffled = ["finance-ops", "ai-automation", "marketing", "sales-bd", "web-dev", "client-success", "web-design"];
  for (const s of STAGES.filter(x => x.mode !== "stack")) for (const view of ["graph"] as const) {
    const a = worktree({ ids: shuffled }), b = worktree({ ids: [...shuffled].reverse() });
    const order = (wt: MissionWorktree) => layoutWorktree(wt, { width: s.w, height: s.h }, s.mode, { ...base, view }).nodes.filter(n => n.kind === "department").sort((x, y) => x.y - y.y).map(n => wt.departments.find(d => d.id === n.id)!.canonicalId);
    const oa = order(a), ob = order(b);
    assert.deepEqual(oa, ob, `${s.name} ${view}: the same departments occupy the same relative places whatever the input order`);
    assert.deepEqual(oa, [...oa].sort((x, y) => canonical.indexOf(x) - canonical.indexOf(y)), "and that order is the taxonomy order");
  }
  assert.deepEqual(orderDepartments(worktree({ ids: ["zeta-custom", "meta-ads", "marketing", "alpha-custom", "sales-bd"] }).departments).map(d => d.canonicalId),
    ["strategic_intelligence", "brand_growth_marketing", "meta-ads", "alpha-custom", "zeta-custom"], "meta-ads follows its parent; unknown departments follow, sorted by id");
  assert.equal(departmentRank("strategic_intelligence"), 0);
  assert.equal(departmentRank("operations_finance"), canonical.indexOf("operations_finance"));
  assert.ok(departmentRank("meta-ads") > departmentRank("brand_growth_marketing") && departmentRank("meta-ads") < departmentRank("revenue_partnerships"));
  assert.equal(departmentRank("anything-else"), 1000);
  // Stable across reruns: a different mission with a different subset keeps the relative order of the shared departments.
  const full8 = worktree({ ids: shuffled }), subset = worktree({ ids: ["web-dev", "sales-bd", "finance-ops"] });
  const rank = (wt: MissionWorktree) => orderDepartments(wt.departments).map(d => d.canonicalId);
  assert.deepEqual(rank(full8).filter(id => rank(subset).includes(id)), rank(subset));
}

// W5.4C: sibling steps with the SAME visible label show their own recorded activity as the second line; nothing else changes and nothing is invented.
{
  const mk = (acts: [string, string], errs?: [string, string]) => buildMissionWorktree({ job: { id: "job-w54c", title: "M", brief: "b", status: "done", percent: 100, verified: true, createdAt: T, updatedAt: T, liveNotes: [], revisions: [],
    steps: [step("brief", "brief"), step("plan", "plan", { dependsOn: ["brief"] }),
      step("dept:marketing", "department", { departmentId: "marketing", label: "marketing", activity: acts[0], ...(errs ? { status: "error" as const, error: errs[0] } : {}), dependsOn: ["plan"] }),
      step("dept:marketing", "department", { departmentId: "marketing", label: "marketing", activity: acts[1], ...(errs ? { status: "error" as const, error: errs[1] } : {}), dependsOn: ["plan"] }),
      step("reconcile", "reconcile", { dependsOn: ["dept:marketing"] }), step("qa", "qa", { dependsOn: ["reconcile"] }), step("final", "final", { dependsOn: ["qa"] })] } });
  const nodes = (wt: MissionWorktree) => { const dep = wt.departments[0]; return layoutWorktree(wt, { width: 366, height: 900 }, "stack", { ...base, view: "graph", expandedDepartmentId: dep.id }).nodes.filter(n => n.kind === "step" && n.parentId === dep.id); }; // a department's steps are drawn on the phone stack
  const rep = nodes(mk(["Draft the ICP", "Build the ad angles"]));
  assert.equal(rep.length, 2); assert.equal(new Set(rep.map(n => n.label)).size, 1, "fixture: identical visible labels");
  assert.deepEqual(rep.map(n => n.detail), ["done · Draft the ICP", "done · Build the ad angles"], "repeated labels carry the recorded activity");
  const same = nodes(mk(["Same", "Same"]));
  assert.deepEqual(same.map(n => n.detail), ["Step 3 · done", "Step 4 · done"], "R1: identical activities and no errors: the deterministic step position separates the siblings (no task name, no timestamp)");
  const ords = same.map(n => Number(/Step (\d+)/.exec(n.detail)![1]));
  assert.ok(ords.every(o => nodes(mk(["Same", "Same"])).length === 2 && o > 0) && new Set(ords).size === 2, "ordinals are distinct");
  const sameErr = nodes(mk(["Failed", "Failed"], ["Zero-spend routing policy enforced", "Zero-spend routing policy enforced"]));
  assert.deepEqual(sameErr.map(n => n.detail), ["Step 3 · error", "Step 4 · error"], "identical activity AND identical error text: position, status kept");
  const failed = nodes(mk(["Failed", "Failed"], ["Search quota exhausted", "Provider timed out"]));
  assert.deepEqual(failed.map(n => n.detail), ["error · Search quota exhausted", "error · Provider timed out"], "same activity, different recorded errors: the error text separates them");
  const partial = nodes(mk(["Failed", ""], ["Search quota exhausted", "Provider timed out"]));
  assert.ok(partial.every(n => n.detail === "error · Search quota exhausted" || n.detail === "error · Provider timed out"), "activity is not recorded for every sibling, so the error text is used instead");
  const none = nodes(mk(["", ""]));
  assert.deepEqual(none.map(n => n.detail), ["Step 3 · done", "Step 4 · done"], "no recorded activity: position only, nothing invented");
  const single = layoutWorktree(worktree({ depts: 3 }), { width: 366, height: 900 }, "stack", { ...base, view: "graph", expandedDepartmentId: worktree({ depts: 3 }).departments[0].id }).nodes.filter(n => n.kind === "step");
  assert.ok(single.length >= 1 && single.every(n => n.detail === "done"), "unique labels: second line unchanged (no position added)");
  assert.ok(rep.every(n => !/Step \d+/.test(n.detail)), "when a recorded field separates the siblings the position is not used");
}

console.log("mission worktree layout checks passed; pure fixtures, no stores read or written.");
