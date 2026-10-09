import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Job, JobStep } from "../src/lib/jobStore";
import { departmentDisplayName } from "../src/lib/departmentTaxonomy";
import { buildMissionWorktree, type MissionWorktree } from "../src/components/spatial/dive/missionWorktree";
import { ambiguityId, ambiguityNodeId, isAmbiguityId } from "../src/components/spatial/dive/missionWorktreeAncestry";
import { initialSelection, reduceSelection, type SelectionAction, type WorktreeSelection } from "../src/components/spatial/dive/missionWorktreeSelection";
import { layoutWorktree, findCollisions, type WorktreeView } from "../src/components/spatial/dive/missionWorktreeLayout";
import { workbenchCapabilities } from "../src/components/spatial/dive/missionWorkbench";
import { missionLayoutFor } from "../src/components/spatial/dive/missionFlowModel";
import { placePeek } from "../src/components/spatial/dive/missionWorktreePeekLayout";
import { peekOf, peekSize } from "../src/components/spatial/dive/missionWorktreePeek";
import { WORKBENCH, instrumentShape, placeWorkbench, seamY, stageInsets, workbenchFootprint, workbenchModeFor, workbenchSheetHeight, workbenchVariant } from "../src/components/spatial/dive/missionWorkbenchLayout";

/** W5.2 contract: Workbench plane geometry (pure, from layout + stage), the state invariant, data-driven navigation, Esc and reduced motion. No browser. */
const T = "2026-10-01T10:00:00.000Z";
const step = (id: string, kind: JobStep["kind"], over: Partial<JobStep> = {}): JobStep => ({ id, kind, label: id, activity: "", status: "done", percent: 100, weight: 10, dependsOn: [], ...over });
const DEPTS = ["sales-bd", "marketing", "finance-ops", "client-success", "web-design", "web-dev", "ai-automation", "meta-ads"];
function fixture(o: { depts?: number; ambiguous?: boolean; unknown?: boolean } = {}): MissionWorktree {
  const ids = DEPTS.slice(0, o.depts ?? 3), steps: JobStep[] = [];
  steps.push(step("brief", "brief", { output: "The brief" }), step("plan", "plan", { dependsOn: ["brief"] }));
  steps.push(step("research", "research", { dependsOn: ["plan"], output: "### Finding 1: Q?\nAnswer [1].\nSources: [1]", sources: [{ title: "S1", uri: "https://e.com/1" }] }));
  ids.forEach(d => { for (let k = 0; k < (o.ambiguous ? 2 : 1); k++) steps.push(step(`dept:${d}`, "department", { departmentId: d, dependsOn: ["research"], label: departmentDisplayName(d) })); });
  if (o.unknown) steps.push(step("legacy", "legacy-kind" as never, { label: "Legacy", dependsOn: ["plan"] }));
  steps.push(step("reconcile", "reconcile", { dependsOn: ids.map(d => `dept:${d}`), output: "### Conflicts\nx\n### Agreed direction\n- y" }), step("qa", "qa", { dependsOn: ["reconcile"], output: "notes" }), step("final", "final", { dependsOn: ["qa"] }));
  const job: Job = { id: "job-w52", title: "Apex Mission", brief: "b", status: "done", percent: 60, verified: true, steps, createdAt: T, updatedAt: T, liveNotes: [], revisions: [], planSnapshot: { title: "T", researchQuestions: ["Q?"], assignments: ids.map(d => ({ departmentId: d, task: `${d} task`, activity: "a" })) } };
  return buildMissionWorktree({ job });
}
const run = (wt: MissionWorktree, state: WorktreeSelection, ...actions: SelectionAction[]) => actions.reduce((s, a) => reduceSelection(s, a, wt), state);
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const phaseId = (wt: MissionWorktree, key: string) => wt.phases.find(p => p.key === key)!.id;

// 0. STATE INVARIANT (proved, reducer unchanged): a Workbench never outlives its Peek / selection, and its section always belongs to the selected entity.
{
  const wt = fixture({ depts: 4, ambiguous: true, unknown: true });
  const ids = [wt.mission.id, ...wt.phases.map(p => p.id), ...wt.departments.map(d => d.id), ...wt.steps.map(s => s.id), ...wt.departments.map(d => ambiguityId(d.id)), ambiguityId(phaseId(wt, "team-review")), "ghost"];
  const sections = ["overview", "execution", "dependencies", "questions", "findings", "sources", "inputs", "review", "qa", "output", "usage", "assignment", "steps", "problem", "references", "candidates"] as const;
  let seed = 12345; const rnd = (n: number) => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed % n; };
  let s = initialSelection(wt, "graph"), opened = 0;
  for (let i = 0; i < 4000; i++) {
    const pick = rnd(9);
    const action: SelectionAction = pick === 0 ? { type: "openWorkbench" } : pick === 1 ? { type: "closeWorkbench" } : pick === 2 ? { type: "escape" } : pick === 3 ? { type: "reconcile" }
      : pick === 4 ? { type: "setSection", section: sections[rnd(sections.length)] } : pick === 5 ? { type: "toggleExpand", departmentId: wt.departments[rnd(wt.departments.length)].id } : pick === 6 ? { type: "reconcile" } : { type: "select", id: ids[rnd(ids.length)] };
    s = run(wt, s, action);
    if (s.depth === "workbench") {
      opened++;
      assert.equal(s.peekOpen, true, `Workbench open with a closed Peek after ${action.type}`);
      const set = workbenchCapabilities(wt, s.selectedId);
      assert.ok(set, "Workbench open on a non-inspectable selection");
      assert.ok(set!.sections.some(x => x.id === s.section), `active section ${s.section} does not belong to ${s.selectedId}`);
    }
  }
  assert.ok(opened > 200, "the random walk really exercised the Workbench");
}

// 1. Geometry across fixtures x stages x views x every selectable entity.
const STAGES: [number, number][] = [[1920, 1080], [1440, 900], [1366, 768], [1280, 720], [1196, 720]];
const WIDTHS: string[] = [];
let placements = 0; const sides = new Set<string>();
for (const wt of [fixture({ depts: 3 }), fixture({ depts: 8, ambiguous: true, unknown: true })]) {
  const all = [wt.mission.id, ...wt.phases.map(p => p.id), ...wt.departments.map(d => d.id), ...wt.steps.map(x => x.id), ...wt.departments.map(d => ambiguityId(d.id))];
  for (const [vw, vh] of STAGES) {
    const mode = missionLayoutFor(vw, vh), ins = stageInsets(mode);
    const root = { width: vw - 24, height: Math.max(240, vh - ins.top - ins.bottom) };
    assert.notEqual(mode, "stack");
    // the root sits between the header (top inset) and the composer / lens rail (bottom inset): the plane lives inside it, so it cannot overlap either.
    assert.ok(ins.top + root.height + ins.bottom <= vh + 1, `${vw}x${vh}: root leaves the composer / rail clear`);
    const foot = workbenchFootprint(root);
    WIDTHS.push(`${vw}x${vh}: plane ${foot.planeW}px, graph ${foot.graphStage.width}px (tier ${foot.tier})`);
    assert.equal(workbenchModeFor(mode), "side");
    assert.ok(foot.planeW >= WORKBENCH.floorPlane && foot.planeW <= WORKBENCH.maxPlane, "plane width bounded");
    assert.ok(foot.graphStage.width + WORKBENCH.gap + foot.planeW + WORKBENCH.scrollbar <= root.width, "graph + plane + gaps fit the root width exactly (no horizontal overflow)");
    for (const view of ["graph"] as WorktreeView[]) for (const id of all) {
      const s = run(wt, initialSelection(wt, view), { type: "select", id }, { type: "openWorkbench" });
      if (s.depth !== "workbench") continue;
      const anchorId = isAmbiguityId(s.selectedId!) ? ambiguityNodeId(s.selectedId!) : s.selectedId!;
      const layout = layoutWorktree(wt, foot.graphStage, mode, { view, selectedId: anchorId, expandedDepartmentId: s.expandedDepartmentId }, undefined, { tight: foot.tier });
      const where = `${vw}x${vh} ${view} ${id}`;
      assert.deepEqual(findCollisions(layout), [], `${where}: the yielded graph has no collisions`);
      layout.nodes.forEach(n => { assert.ok(n.x >= -0.5 && n.x + n.w <= foot.graphStage.width + 0.5, `${where}: ${n.id} inside the yielded stage`); assert.ok(n.w >= 80 && n.h >= 28, `${where}: no tiny node (${n.id} ${n.w}x${n.h})`); });
      // C1: the columnar Graph draws no step, so an undrawn entity has no anchor in it (its detail lives in the Intelligence panel).
      if (view === "graph" && !layout.nodes.some(n => n.id === anchorId)) continue;
      const p = placeWorkbench(layout, anchorId, root, foot);
      if (!p) { assert.fail(`${where}: no placement`); continue; }
      placements++; sides.add(p.side);
      // plane inside the root, readable, never beyond the viewport
      assert.ok(p.plane.x >= 0 && p.plane.x + p.plane.w <= root.width - WORKBENCH.scrollbar + 0.5 && p.plane.y === 0 && p.plane.h === root.height, `${where}: plane inside root`);
      assert.ok(p.plane.h >= 240 && p.plane.w >= WORKBENCH.floorPlane, `${where}: plane readable`);
      // the graph yields: its whole stage lies on the far side of the plane
      const gx0 = p.graphOffset, gx1 = p.graphOffset + layout.stage.width;
      if (p.side === "left") assert.ok(gx0 >= p.plane.x + p.plane.w, `${where}: graph clear of a left plane`); else assert.ok(gx1 <= p.plane.x + 0.5, `${where}: graph clear of a right plane`);
      assert.ok(gx0 >= 0 && gx1 <= root.width, `${where}: graph inside the root`);
      // selected entity visible horizontally, and the side follows the entity
      const a = layout.nodes.find(n => n.id === anchorId)!;
      assert.ok(a.x + p.graphOffset >= 0 && a.x + a.w + p.graphOffset <= root.width, `${where}: selected entity inside the root`);
      assert.equal(p.side, a.x + a.w / 2 < layout.stage.width / 2 ? "left" : "right", `${where}: side follows the entity`);
      // the attachment reaches the graph-facing edge of the plane, from the entity's own edge
      assert.ok(Math.abs(p.attach.y - (a.y + a.h / 2)) < 0.5);
      if (p.side === "left") { assert.equal(p.attach.x1, a.x); assert.ok(p.attach.x2 <= 0); } else { assert.equal(p.attach.x1, a.x + a.w); assert.ok(p.attach.x2 >= layout.stage.width); }
      assert.ok(seamY(p.anchorCy, 0, p.plane.h) >= 34 && seamY(p.anchorCy, 9999, p.plane.h) <= p.plane.h - 34, "the seam marker stays inside the plane");
    }
    // 1366: a readable reserved region, content scrolls inside it
    if (vw === 1366) { assert.equal(root.height, 768 - ins.top - ins.bottom); assert.ok(root.height >= 400, "1366x768 keeps a readable plane height"); assert.ok(foot.planeW >= 440 && foot.graphStage.width >= WORKBENCH.minGraph, `1366 keeps a ${foot.planeW}px plane and a ${foot.graphStage.width}px graph`); }
  }
}
assert.ok(placements > 150, `placements exercised (${placements})`);
assert.deepEqual([...sides].sort(), ["left", "right"], "the plane resolves to BOTH sides depending on the selected entity (never a constant)");

// 2. Entity change repositions (side may flip) without a depth reset, and the plane box keeps its size.
{
  const wt = fixture({ depts: 7 }), mode = "graph" as const, root = { width: 1416, height: 584 }, foot = workbenchFootprint(root);
  const research = phaseId(wt, "live-research"), review = phaseId(wt, "team-review");
  let s = run(wt, initialSelection(wt, "graph"), { type: "select", id: research }, { type: "openWorkbench" });
  const at = (state: WorktreeSelection) => placeWorkbench(layoutWorktree(wt, foot.graphStage, mode, { view: state.view, selectedId: state.selectedId, expandedDepartmentId: state.expandedDepartmentId }, undefined, { tight: foot.tier }), state.selectedId!, root, foot)!;
  const first = at(s);
  s = run(wt, s, { type: "select", id: review });
  assert.equal(s.depth, "workbench", "no depth reset on entity change");
  const second = at(s);
  assert.equal(first.plane.w, second.plane.w); assert.equal(first.plane.h, second.plane.h);
  
}

// 2b. The instrument's silhouette is not a rectangle: stepped, with a controlled cut, mirrored by the component; the variant follows the width.
{
  const rail = instrumentShape(440, 584, "rail", false), strip = instrumentShape(332, 436, "strip", true);
  assert.notEqual(rail.frame, `M0 0H440V584H0Z`); assert.ok(rail.frame.includes("L0 "), "chamfered graph-facing edge");
  assert.ok(rail.left === WORKBENCH.rail && rail.H === WORKBENCH.head);
  assert.match(rail.reading, /L/, "the reading plane has a controlled cut"); assert.ok(rail.reading.includes(`H${440 - WORKBENCH.farInset}`), "the header projects past the reading plane");
  assert.equal(strip.H, WORKBENCH.headPhone); assert.equal(strip.left, 0);
  assert.equal(workbenchVariant(332, true), "strip"); assert.equal(workbenchVariant(988, true), "rail"); assert.equal(workbenchVariant(440, false), "rail");
}

// 3. Phones: an inline sheet in the Peek's slot, never a side plane.
for (const [vw, vh] of [[390, 844], [375, 667], [1024, 768]] as [number, number][]) {
  const wt = fixture({ depts: 3 }), mode = missionLayoutFor(vw, vh), ins = stageInsets(mode);
  assert.equal(mode, "stack"); assert.equal(workbenchModeFor(mode), "sheet", `${vw}x${vh}: below 1180 the explicit mode is the inline sheet`);
  const stage = { width: vw - 24, height: Math.max(240, vh - ins.top - ins.bottom) };
  const sheetH = workbenchSheetHeight(stage);
  assert.ok(sheetH >= WORKBENCH.sheetMin && sheetH <= WORKBENCH.sheetMax, `${vw}: sheet height bounded (${sheetH})`);
  for (const id of [phaseId(wt, "live-research"), phaseId(wt, "team-review"), wt.departments[0].id, wt.steps.find(x => x.departmentId)!.id]) {
    const s = run(wt, initialSelection(wt, "graph"), { type: "select", id }, { type: "openWorkbench" });
    const peek = peekOf(wt, s.selectedId)!;
    const layout = layoutWorktree(wt, stage, mode, { view: "graph", selectedId: s.selectedId, expandedDepartmentId: s.expandedDepartmentId }, { afterId: s.selectedId!, height: sheetH });
    const slot = placePeek(layout, s.selectedId!, [{ ...peekSize(peek, "stack", stage.width), h: sheetH }])!;
    assert.equal(slot.side, "slot"); assert.equal(slot.h, sheetH, "the reserved slot IS the sheet");
    assert.ok(slot.x >= 0 && slot.x + slot.w <= stage.width + 0.5, `${vw}: sheet inside the stage width (no horizontal overflow)`);
    const row = layout.nodes.find(n => n.id === s.selectedId)!;
    assert.ok(slot.y >= row.y + row.h - 1, "the sheet starts directly under the selected row");
    assert.ok(row.h >= 40, "40px minimum target for the selected row");
    assert.ok(layout.contentHeight >= slot.y + slot.h, "the flow grows to hold the sheet (it scrolls inside the Worktree region)");
    assert.equal(findCollisions(layout).length, 0);
  }
}

// 3b. W5.2R-A1 responsive reading-height amendment is active (driven by real W5.3 content).
assert.equal(WORKBENCH.sheetMin, 360); assert.equal(WORKBENCH.sheetMax, 560);

// 4. Data-driven navigation, no remount, single instance, accessibility wiring, no forbidden paint costs, reduced motion. (Source-level: the shell has no React test renderer here.)
{
  const plane = read("../src/components/spatial/dive/MissionWorkbenchPlane.tsx"), view = read("../src/components/spatial/dive/MissionWorktreeView.tsx");
  const css = read("../src/components/spatial/dive/MissionWorkbenchPlane.module.css"), viewCss = read("../src/components/spatial/dive/MissionWorktreeView.module.css");
  assert.match(plane, /caps\.sections\.map/, "the spine is generated from the W5.1 capabilities");
  for (const label of ["Overview", "Questions", "Findings", "Sources", "Dependencies", "Inputs", "Assignment"]) assert.equal(plane.includes(`"${label}"`), false, `no hard-coded "${label}" tab`);
  assert.equal(/\bworkbenchSectionLabel\b|SECTION_LABEL/.test(plane), false, "labels come from the registry, not the shell");
  assert.match(plane, /role="tablist"/); assert.match(plane, /aria-selected/); assert.match(plane, /role="tabpanel"/); assert.match(plane, /aria-labelledby=\{`wb-title-/); assert.match(plane, /role="region"/);
  assert.match(plane, /onKeyDown=\{event => move\(event, i\)\}/, "keyboard section navigation");
  assert.equal(/<MissionWorkbenchPlane[^>]*\bkey=/.test(view), false, "the plane is never keyed by selection / section: no remount, no teardown");
  assert.equal((view.match(/<MissionWorkbenchPlane\b/g) ?? []).length, 2, "exactly one desktop plane and one phone sheet render sites");
  assert.match(view, /type: "closeWorkbench"/); assert.match(view, /key !== "Escape"/);
  assert.equal(/requestAnimationFrame|getBoundingClientRect|setInterval/.test(plane + read("../src/components/spatial/dive/missionWorkbenchLayout.ts")), false, "no rAF / measurement / polling in the plane or its geometry");
  // The Workbench / graph geometry stays pure numbers. The ONE exception is the label-dot pass of C7E.3.2.2 (a single event-driven layout effect that only sets two CSS custom properties on a clamp-cut level-2 row);
  // it is cut out here and asserted separately: still no rAF / polling anywhere, and no React state in it.
  const dotPass = /\/\/ Yielded tiers: a row's dot rides[\s\S]*?\}, \[layout, stageTier\]\);/.exec(view)?.[0] ?? "";
  assert.ok(dotPass.length > 0 && /--dot-x/.test(dotPass) && !/useState|requestAnimationFrame|setInterval|setTimeout/.test(dotPass), "the one measurement pass is the dot placement: event-driven, no state, no timers");
  assert.equal(/getBoundingClientRect|requestAnimationFrame|setInterval/.test(view.replace(dotPass, "")), false, "no other measurement or polling in the view");
  for (const text of [css, viewCss]) assert.equal(/backdrop-filter|filter\s*:|blur\(|drop-shadow|box-shadow:[^;]*\d+px \d+px \d+px/.test(text.replace(/\/\*[\s\S]*?\*\//g, "")), false, "no blur / filter / large shadow");
  // reduced motion: every transition / animation the Workbench adds is switched off
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{\.plane,\.joint,\.mark i,\.frame,\.read,\.content,\.id,\.sheet\{transition:none;animation:none\}\}/);
  assert.match(viewCss, /@media\(prefers-reduced-motion:reduce\)\{\.stage,\.node\{transition:none\}\.node \.head small\{animation:none\}\.wbAttach\{animation:none\}\}/);
  // targets
  assert.match(css, /\.plane\[data-variant="strip"\] \.mark\{[^}]*min-height:44px/); assert.match(css, /\.plane\[data-variant="strip"\] \.back\{height:44px/);
}

// 5. Esc is Workbench -> Peek ONLY (never out of the Mission), from every Workbench state.
{
  const wt = fixture({ depts: 3 }), dstep = wt.steps.find(x => x.departmentId)!.id;
  let s = run(wt, initialSelection(wt, "graph"), { type: "select", id: dstep }, { type: "openWorkbench" });
  const before = { selectedId: s.selectedId, trail: s.trail, expanded: s.expandedDepartmentId };
  s = run(wt, s, { type: "escape" });
  assert.equal(s.depth, "peek"); assert.equal(s.peekOpen, true);
  assert.deepEqual({ selectedId: s.selectedId, trail: s.trail, expanded: s.expandedDepartmentId }, before, "Esc from the Workbench does not climb or collapse anything");
}
console.log(WIDTHS.filter((v, i, a) => a.indexOf(v) === i).join("\n"));
console.log("test-dive-mission-worktree-workbench-geometry: all W5.2 geometry / shell checks passed");
