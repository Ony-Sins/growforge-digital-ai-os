import assert from "node:assert/strict";
import type { Job, JobStep } from "../src/lib/jobStore";
import { departmentDisplayName } from "../src/lib/departmentTaxonomy";
import { ancestryOf, layoutWorktree, type StageBox } from "../src/components/spatial/dive/missionWorktreeLayout";
import { buildMissionWorktree, type MissionWorktree } from "../src/components/spatial/dive/missionWorktree";
import { FOCUS, WORKBENCH, focusPlaneWidth, focusShape, placeFocus, placeWorkbench, workbenchFootprint } from "../src/components/spatial/dive/missionWorkbenchLayout";

/** W6.2 geometry contract: Focus grows from the Workbench's side; the graph is only nudged; the selected entity + ancestry stay in the free strip. Pure. */
const T = "2026-10-01T10:00:00.000Z";
const step = (id: string, kind: JobStep["kind"], over: Partial<JobStep> = {}): JobStep => ({ id, kind, label: id, activity: "a", status: "done", percent: 100, weight: 10, dependsOn: [], ...over });
function fixture(): MissionWorktree {
  const ids = ["sales-bd", "marketing", "finance-ops"], steps: JobStep[] = [step("brief", "brief"), step("plan", "plan", { dependsOn: ["brief"] }), step("research", "research", { dependsOn: ["plan"] })];
  ids.forEach(d => steps.push(step(`dept:${d}`, "department", { departmentId: d, dependsOn: ["research"], label: departmentDisplayName(d) })));
  steps.push(step("reconcile", "reconcile", { dependsOn: ids.map(d => `dept:${d}`) }), step("qa", "qa", { dependsOn: ["reconcile"] }), step("final", "final", { dependsOn: ["qa"] }));
  const job: Job = { id: "job-w62", title: "M", brief: "b", status: "done", percent: 100, verified: true, steps, createdAt: T, updatedAt: T, liveNotes: [], revisions: [] };
  return buildMissionWorktree({ job });
}
const STAGES: StageBox[] = [{ width: 1896, height: 764 }, { width: 1416, height: 584 }, { width: 1342, height: 406 }, { width: 1256, height: 358 }, { width: 1156, height: 358 }];
const wt = fixture();
const phases = (key: string) => wt.phases.find(p => p.key === key)!.id;

// 1. the instrument's width: bounded, grows beyond the Workbench, always leaves a usable strip
for (const stage of STAGES) {
  const w = focusPlaneWidth(stage), wb = workbenchFootprint(stage).planeW;
  assert.ok(w > wb, `${stage.width}: Focus is substantially larger than the Workbench (${w} > ${wb})`);
  assert.ok(w <= FOCUS.maxPlane && w >= WORKBENCH.minPlane);
  assert.ok(stage.width - WORKBENCH.scrollbar - w >= FOCUS.minStrip - 1, `${stage.width}: a free strip of at least ${FOCUS.minStrip} remains`);
}
assert.equal(focusPlaneWidth(STAGES[0]), 1100, "bounded above"); assert.equal(focusPlaneWidth({ width: 1156, height: 358 }), 720, "bounded below by its minimum on the narrowest side layout");

// 2. growth: same side, same height, contains the Workbench plane; `from` is exactly the inset of the old plane
for (const stage of STAGES) for (const key of ["qa", "client-brief", "live-research", "team-review"]) {
  const fp = workbenchFootprint(stage), id = phases(key);
  const layout = layoutWorktree(wt, fp.graphStage, "graph", { view: "graph", selectedId: id, expandedDepartmentId: null }, undefined, { tight: fp.tier });
  const wb = placeWorkbench(layout, id, stage, fp)!, lit = new Set(ancestryOf(wt, id)), focus = placeFocus(layout, id, lit, stage, wb)!;
  assert.equal(focus.side, wb.side, "expands from the same side");
  assert.equal(focus.plane.y, wb.plane.y); assert.equal(focus.plane.h, wb.plane.h);
  assert.ok(focus.plane.x <= wb.plane.x && focus.plane.x + focus.plane.w >= wb.plane.x + wb.plane.w, "contains the Workbench footprint");
  const growth = focus.plane.w - wb.plane.w;
  assert.deepEqual(focus.from, wb.side === "left" ? { top: 0, right: growth, bottom: 0, left: 0 } : { top: 0, right: 0, bottom: 0, left: growth }, "growth starts from the old plane");
  // the graph is not re-laid-out: same layout object, only an offset; the selected entity sits fully inside the free strip
  const anchor = layout.nodes.find(n => n.id === id)!, x0 = anchor.x + focus.graphOffset, x1 = x0 + anchor.w;
  assert.ok(x0 >= focus.strip.x0 + FOCUS.margin - 1 && x1 <= focus.strip.x1 - FOCUS.margin + 1, `${stage.width}/${key}: selected entity [${x0},${x1}] inside strip [${focus.strip.x0},${focus.strip.x1}]`);
  // the plane never overlaps the strip
  assert.ok(wb.side === "right" ? focus.plane.x >= focus.strip.x1 : focus.plane.x + focus.plane.w <= focus.strip.x0);
  // the attachment bridge ends on the instrument's graph-facing edge (stage coordinates)
  const edge = wb.side === "right" ? focus.plane.x : focus.plane.x + focus.plane.w;
  assert.equal(Math.round(focus.attach.x2 + focus.graphOffset), edge, "bridge reaches the new plane edge"); assert.equal(focus.anchorCy, anchor.y + anchor.h / 2);
}

// 3. ancestry stays legible when it fits the strip, and degrades to the selected entity when it does not (never the other way round)
{
  const stage = STAGES[0], fp = workbenchFootprint(stage), id = phases("qa");
  const layout = layoutWorktree(wt, fp.graphStage, "graph", { view: "graph", selectedId: id, expandedDepartmentId: null }, undefined, { tight: fp.tier });
  const wb = placeWorkbench(layout, id, stage, fp)!, lit = new Set(ancestryOf(wt, id)), focus = placeFocus(layout, id, lit, stage, wb)!;
  const litBox = layout.nodes.filter(n => lit.has(n.id)), l0 = Math.min(...litBox.map(n => n.x)) + focus.graphOffset, l1 = Math.max(...litBox.map(n => n.x + n.w)) + focus.graphOffset;
  assert.ok(l0 >= focus.strip.x0 + FOCUS.margin - 1 && l1 <= focus.strip.x1 - FOCUS.margin + 1, "at 1920 the whole lit ancestry is inside the strip");
  const none = placeFocus(layout, id, new Set(), stage, wb)!; assert.ok(none && Number.isFinite(none.graphOffset), "an empty lit set falls back to the selected entity");
  assert.equal(placeFocus(layout, "nope", lit, stage, wb), null, "unknown anchor");
  assert.deepEqual(placeFocus(layout, id, lit, stage, wb), focus, "deterministic");
}

// 4. the instrument's strata: a slab with one inset reading field; phones go full-bleed
{
  const d = focusShape(1000, 700, false), p = focusShape(366, 492, true);
  assert.equal(d.near, FOCUS.rim); assert.equal(d.H, FOCUS.head); assert.match(d.reading, /^M22 112H/); assert.equal(p.near, 0); assert.match(p.reading, /^M0 112H366V492H0Z$/, "phone reader is full-bleed");
  assert.equal(d.catches.length, 2); assert.ok(d.titanium.startsWith("M32 0H14"), "partial titanium edge, not a closed border");
}
console.log("test-dive-mission-worktree-focus-geometry: all W6.2 Focus geometry checks passed");
