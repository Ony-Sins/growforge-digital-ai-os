import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Job, JobStep } from "../src/lib/jobStore";
import { departmentDisplayName } from "../src/lib/departmentTaxonomy";
import { buildMissionWorktree, type MissionWorktree } from "../src/components/spatial/dive/missionWorktree";
import { contextThread, initialSelection, inspectionOf, noraContextFor, reduceSelection, type SelectionAction, type WorktreeSelection } from "../src/components/spatial/dive/missionWorktreeSelection";
import { workbenchCapabilities } from "../src/components/spatial/dive/missionWorkbench";
import { workbenchContentOf } from "../src/components/spatial/dive/missionWorkbenchContent";
import { FOCUS_MIN_CHARS, focusAvailability, focusableSections, readingMeasure } from "../src/components/spatial/dive/missionWorktreeFocus";
import { layoutWorktree } from "../src/components/spatial/dive/missionWorktreeLayout";
import { planConduits } from "../src/components/spatial/dive/missionWorktreeConduits";

/** W6.1 contract: the third inspection depth (Peek -> Workbench -> Focus) as pure state + availability rules. No React, no layout geometry, no fetch. */
const T = "2026-10-01T10:00:00.000Z", T2 = "2026-10-01T10:02:30.000Z";
const step = (id: string, kind: JobStep["kind"], over: Partial<JobStep> = {}): JobStep => ({ id, kind, label: id, activity: "a", status: "done", percent: 100, weight: 10, dependsOn: [], ...over });
const para = (n: number) => "The recorded text continues with careful detail about the market and the plan. ".repeat(n);
const LONG_REVIEW = `Opening.\n\n### Conflicts\n${para(8)}\n\n### Dependencies\n${para(6)}\n\n### Gaps\n${para(4)}\n\n### Agreed direction\n- ${para(3)}`;
const SHORT_REVIEW = "### Conflicts\nA vs B\n\n### Gaps\nNone";
const LONG_RESEARCH = `### Finding 1: Market size\n${para(10)}\n\n### Finding 2: Competitors\n${para(10)}\n\nSources: none returned`;
function fixture(o: { review?: string; research?: string } = {}): MissionWorktree {
  const ids = ["sales-bd", "marketing"], steps: JobStep[] = [step("brief", "brief"), step("plan", "plan", { dependsOn: ["brief"] }), step("research", "research", { dependsOn: ["plan"], output: o.research ?? LONG_RESEARCH })];
  ids.forEach(d => steps.push(step(`dept:${d}`, "department", { departmentId: d, dependsOn: ["research"], label: departmentDisplayName(d), output: "short" })));
  steps.push(step("reconcile", "reconcile", { dependsOn: ids.map(d => `dept:${d}`), startedAt: T, finishedAt: T2, output: o.review ?? LONG_REVIEW }), step("qa", "qa", { dependsOn: ["reconcile"] }), step("final", "final", { dependsOn: ["qa"] }));
  const job: Job = { id: "job-w61", title: "Focus Mission", brief: "A brief", status: "done", percent: 100, verified: true, steps, createdAt: T, updatedAt: T2, liveNotes: [], revisions: [] };
  return buildMissionWorktree({ job });
}
const run = (wt: MissionWorktree, state: WorktreeSelection, ...actions: SelectionAction[]) => actions.reduce((s, a) => reduceSelection(s, a, wt), state);
const phase = (wt: MissionWorktree, key: string) => wt.phases.find(p => p.key === key)!.id;
const start = (wt: MissionWorktree) => initialSelection(wt, "graph");
/** Selected Team Review, Workbench open on its (long) Output, Focus ready to open. */
const atOutput = (wt: MissionWorktree) => run(wt, start(wt), { type: "select", id: phase(wt, "team-review") }, { type: "openWorkbench" }, { type: "setSection", section: "output" });
const inFocus = (wt: MissionWorktree, scroll = 240) => run(wt, atOutput(wt), { type: "openFocus", scrollTop: scroll });

// 1. Availability is about long recorded reading matter, never about layout; short content has no Focus.
{
  const wt = fixture(), tr = phase(wt, "team-review");
  for (const section of ["output", "review"] as const) { const a = focusAvailability(wt, tr, section); assert.equal(a.available, true, `Team Review ${section}: long recorded review -> Focus`); assert.ok(a.chars >= FOCUS_MIN_CHARS); }
  assert.equal(focusAvailability(wt, tr, "overview").available, false, "an overview is facts, never a reading destination");
  assert.equal(focusAvailability(wt, tr, "inputs").available, false, "relationship rows are navigation, not reading");
  const short = fixture({ review: SHORT_REVIEW });
  for (const section of ["output", "review"] as const) { const a = focusAvailability(short, phase(short, "team-review"), section); assert.equal(a.available, false, `short ${section}`); assert.ok(a.chars < FOCUS_MIN_CHARS && a.reason.length > 0); }
  // research findings are reading matter too; the same rule, a different profile
  assert.equal(focusAvailability(wt, phase(wt, "live-research"), "findings").available, true);
  assert.equal(focusAvailability(fixture({ research: "### Finding 1: q\nbody" }), phase(wt, "live-research"), "findings").available, false);
  // boundary: exactly at the threshold counts, one under does not (measured by the same reading rule)
  const filler = (n: number) => `### Conflicts\n${"x".repeat(n - "Conflicts".length)}`;
  const at = fixture({ review: filler(FOCUS_MIN_CHARS) }), under = fixture({ review: filler(FOCUS_MIN_CHARS - 1) });
  const measure = (w: MissionWorktree) => readingMeasure(workbenchContentOf(w, phase(w, "team-review"), "review")!.blocks).chars;
  assert.ok(measure(at) >= measure(under) && focusAvailability(at, phase(at, "team-review"), "review").available !== focusAvailability(under, phase(under, "team-review"), "review").available, "the threshold is a sharp, deterministic line");
}

// 2. No empty Focus destination anywhere: every available section is a visible, non-empty section with reading content; History/Revision never offered.
{
  const wt = fixture();
  const ids = [wt.mission.id, ...wt.phases.map(p => p.id), ...wt.departments.map(d => d.id), ...wt.steps.map(s => s.id)];
  let offered = 0;
  for (const id of ids) {
    const caps = workbenchCapabilities(wt, id);
    for (const section of ["overview", "execution", "dependencies", "questions", "findings", "sources", "inputs", "review", "qa", "output", "evidence", "usage", "approvals", "consultations", "requestedChanges", "lineage", "history", "assignment", "steps", "problem", "references", "candidates"] as const) {
      const a = focusAvailability(wt, id, section), cap = caps?.sections.find(s => s.id === section);
      if (!a.available) { assert.ok(a.reason.length > 0, "an unavailable Focus always says why"); continue; }
      offered += 1;
      assert.ok(cap && cap.state !== "recorded-empty" && cap.state !== "unavailable", `${id}/${section}: a visible section with something recorded`);
      const content = workbenchContentOf(wt, id, section)!; assert.ok(content, "has content");
      const m = readingMeasure(content.blocks); assert.ok(m.chars >= FOCUS_MIN_CHARS || m.sources >= 12, "has real reading matter");
      assert.notEqual(section, "history", "History / Revision UI is never reintroduced through Focus");
    }
    assert.ok(focusableSections(wt, id).every(s => caps!.sections.some(c => c.id === s)), "focusable sections are a subset of the Workbench sections, in its order");
    assert.equal(focusAvailability(wt, id, "history").available, false);
  }
  assert.ok(offered >= 4, "the fixture really has Focus-worthy sections (Team Review output/review, research findings/output)");
  assert.equal(focusAvailability(wt, null, "overview").available, false); assert.equal(focusAvailability(wt, "not-an-entity", "output").available, false);
}

// 3. Peek -> Workbench -> Focus is strict, on the same canonical entity; opening preserves everything else.
{
  const wt = fixture(), tr = phase(wt, "team-review");
  const peek = run(wt, start(wt), { type: "select", id: tr });
  assert.equal(reduceSelection(peek, { type: "openFocus" }, wt), peek, "Focus is not reachable from Peek: it is the THIRD depth");
  const wb = run(wt, peek, { type: "openWorkbench" });
  assert.equal(reduceSelection(wb, { type: "openFocus" }, wt), wb, "the Workbench's default section (Overview) has nothing to read: no Focus");
  const before = atOutput(wt), after = reduceSelection(before, { type: "openFocus", scrollTop: 240 }, wt);
  assert.equal(after.depth, "focus"); assert.equal(after.peekOpen, true);
  for (const key of ["selectedId", "view", "expandedDepartmentId", "section", "sectionMemory", "trail", "pulse", "peekOpen"] as const) assert.deepEqual(after[key], before[key], `opening Focus preserves ${key}`);
  assert.deepEqual(after.resume, { entityId: tr, section: "output", scrollTop: 240, serial: 1 });
  assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort(), "Focus adds no second selection state");
  // a department with an expanded branch keeps it
  const dept = wt.departments[0], expanded = run(wt, start(wt), { type: "select", id: dept.id });
  assert.equal(expanded.expandedDepartmentId, dept.id, "selecting a department expands it; nothing about Focus changes that");
  // scrollTop is sanitised, never trusted
  assert.equal(run(wt, atOutput(wt), { type: "openFocus", scrollTop: -50 }).resume!.scrollTop, 0); assert.equal(run(wt, atOutput(wt), { type: "openFocus", scrollTop: Number.NaN }).resume!.scrollTop, 0);
  assert.equal(run(wt, atOutput(wt), { type: "openFocus" }).resume!.scrollTop, 0); assert.equal(run(wt, atOutput(wt), { type: "openFocus", scrollTop: 12.6 }).resume!.scrollTop, 13);
  // opening twice is a no-op
  assert.equal(reduceSelection(after, { type: "openFocus", scrollTop: 999 }, wt), after);
}

// 4. Esc / Back order: Focus -> Workbench -> Peek -> closed -> parent. The section survives Focus -> Workbench.
{
  const wt = fixture(), tr = phase(wt, "team-review"), f = inFocus(wt);
  const e1 = reduceSelection(f, { type: "escape" }, wt);
  assert.equal(e1.depth, "workbench"); assert.equal(e1.selectedId, tr); assert.equal(e1.section, "output"); assert.equal(e1.peekOpen, true);
  const e2 = reduceSelection(e1, { type: "escape" }, wt); assert.equal(e2.depth, "peek"); assert.equal(e2.peekOpen, true); assert.equal(e2.selectedId, tr);
  const e3 = reduceSelection(e2, { type: "escape" }, wt); assert.equal(e3.peekOpen, false); assert.equal(e3.selectedId, tr);
  const e4 = reduceSelection(e3, { type: "escape" }, wt); assert.equal(e4.selectedId, wt.mission.id, "then it climbs to the parent");
  // Back control = closeFocus (same step as the first Esc); it does nothing outside Focus
  assert.deepEqual(reduceSelection(f, { type: "closeFocus" }, wt), e1);
  const wb = atOutput(wt); assert.equal(reduceSelection(wb, { type: "closeFocus" }, wt), wb, "closeFocus outside Focus is inert");
}

// 5. Returning restores the exact Workbench section and its scroll record; the record dies when the Workbench context changes.
{
  const wt = fixture(), f = inFocus(wt, 612), back = reduceSelection(f, { type: "closeFocus" }, wt);
  assert.equal(back.depth, "workbench"); assert.equal(back.section, "output");
  assert.deepEqual(back.resume, { entityId: phase(wt, "team-review"), section: "output", scrollTop: 612, serial: 1 }, "the surface can restore scrollTop 612 once, keyed by serial");
  assert.equal(reduceSelection(back, { type: "setSection", section: "review" }, wt).resume, null, "another section: no stale scroll");
  assert.equal(reduceSelection(back, { type: "escape" }, wt).resume, null, "closing the Workbench drops it");
  assert.equal(reduceSelection(back, { type: "select", id: phase(wt, "live-research") }, wt).resume, null, "another entity drops it");
  const again = reduceSelection(back, { type: "openFocus", scrollTop: 40 }, wt);
  assert.equal(again.resume!.serial, 2, "a new opening is a new record"); assert.equal(again.resume!.scrollTop, 40);
}

// 6. The background is inert while Focus is open: no silent retargeting, no replay.
{
  const wt = fixture(), f = inFocus(wt), other = phase(wt, "live-research"), dept = wt.departments[0];
  const inert: SelectionAction[] = [{ type: "select", id: other }, { type: "select", id: dept.id }, { type: "toggleExpand", departmentId: dept.id }, { type: "pulse", subject: other }, { type: "openWorkbench" }, { type: "closeWorkbench" }, { type: "setSection", section: "review" }, { type: "openFocus", scrollTop: 5 }];
  for (const action of inert) assert.equal(reduceSelection(f, action, wt), f, `${action.type} in Focus changes nothing`);
  assert.equal(f.selectedId, phase(wt, "team-review"));
}

// 7. Focus navigation is the only retarget, and it never replays a packet or opens an empty Focus.
{
  const wt = fixture(), f = inFocus(wt), research = phase(wt, "live-research"), dept = wt.departments[0];
  const moved = reduceSelection(f, { type: "focusNavigate", id: research }, wt);
  assert.equal(moved.depth, "focus"); assert.equal(moved.selectedId, research);
  assert.ok(focusAvailability(wt, research, moved.section).available, "it lands on a readable section of the target");
  assert.equal(moved.pulse, f.pulse, "no pulse: no conduit packet is replayed by Focus navigation");
  assert.deepEqual(moved.trail, [wt.mission.id, research]); assert.equal(moved.resume, null);
  assert.equal(moved.sectionMemory[research], moved.section);
  const nothing = reduceSelection(f, { type: "focusNavigate", id: dept.id }, wt);
  assert.equal(nothing.selectedId, dept.id); assert.equal(nothing.depth, "workbench", "a target with nothing worth reading lands in its Workbench, never an empty Focus");
  assert.equal(nothing.expandedDepartmentId, dept.id, "selection bookkeeping (expansion) follows the explicit navigation");
  assert.equal(reduceSelection(f, { type: "focusNavigate", id: "nope" }, wt), f, "unknown target");
  assert.equal(reduceSelection(f, { type: "focusNavigate", id: phase(wt, "team-review") }, wt), f, "same entity, same section: nothing");
  assert.equal(reduceSelection(atOutput(wt), { type: "focusNavigate", id: research }, wt).selectedId, phase(wt, "team-review"), "outside Focus it does nothing");
}

// 8. A reconcile while Focus is open is not a selection event: Focus, entity and section stay and no packet can replay.
{
  const wt = fixture(), f = inFocus(wt), g = reduceSelection(f, { type: "reconcile" }, wt);
  assert.equal(g.depth, "focus"); assert.equal(g.selectedId, f.selectedId); assert.equal(g.section, f.section); assert.deepEqual(g.resume, f.resume);
  const layout = layoutWorktree(wt, { width: 1416, height: 600 }, "graph", { view: "graph", selectedId: g.selectedId, expandedDepartmentId: g.expandedDepartmentId });
  assert.deepEqual(planConduits({ layout, worktree: wt, selectedId: g.selectedId, pulse: null, reducedMotion: false }).packets.filter(p => p.kind === "selection"), [], "no selection packet replays");
}

// 9. NORA and the Context Thread keep the same context at Focus; Focus never outlives its content.
{
  const wt = fixture(), wb = atOutput(wt), f = inFocus(wt);
  assert.deepEqual(contextThread(wt, f.selectedId), contextThread(wt, wb.selectedId));
  const a = inspectionOf(wt, wb)!, b = inspectionOf(wt, f)!;
  assert.equal(b.depth, "focus"); assert.deepEqual(b.section, a.section); assert.deepEqual(b.path, a.path, "the same NORA path (Mission / Team Review / Output)");
  assert.equal(inspectionOf(wt, reduceSelection(f, { type: "escape" }, wt))!.depth, "workbench"); assert.equal(inspectionOf(wt, { ...f, peekOpen: false }), null);
  const nora = noraContextFor(wt, f.selectedId, [], b); assert.match(nora.mission.context, /"depth":"focus"/); assert.equal(nora.detail!.id, f.selectedId);
  // a data refresh that shrinks the content drops Focus to the Workbench (reconcile re-settles), and a vanished entity closes inspection sensibly
  const shrunk = fixture({ review: SHORT_REVIEW }), r = reduceSelection(f, { type: "reconcile" }, shrunk);
  assert.equal(r.depth, "workbench"); assert.equal(r.section, "output"); assert.equal(r.selectedId, f.selectedId); assert.equal(r.resume, null);
  assert.equal(reduceSelection(f, { type: "reconcile" }, wt), f, "unchanged data: nothing moves");
}

// 10. No new fetch / API / schema, and no History UI.
{
  for (const file of ["missionWorktreeFocus.ts", "missionWorktreeSelection.ts"]) {
    const src = readFileSync(new URL(`../src/components/spatial/dive/${file}`, import.meta.url), "utf8");
    assert.equal(/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|document\.|window\./.test(src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")), false, `${file}: pure state, no fetch / storage / DOM`);
  }
}

console.log("test-dive-mission-worktree-focus: all W6.1 Focus contract checks passed");
