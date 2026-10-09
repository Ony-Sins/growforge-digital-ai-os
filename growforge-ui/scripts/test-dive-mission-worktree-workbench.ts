import assert from "node:assert/strict";
import type { Job, JobStep } from "../src/lib/jobStore";
import { departmentDisplayName } from "../src/lib/departmentTaxonomy";
import { buildMissionWorktree, type MissionWorktree } from "../src/components/spatial/dive/missionWorktree";
import { ambiguityId } from "../src/components/spatial/dive/missionWorktreeAncestry";
import { contextThread, initialSelection, inspectionOf, noraContextFor, reduceSelection, type SelectionAction, type WorktreeSelection } from "../src/components/spatial/dive/missionWorktreeSelection";
import { hasSection, settleSection, workbenchCapabilities, type WorkbenchCapabilitySet, type WorkbenchSectionId } from "../src/components/spatial/dive/missionWorkbench";

/** W5.1 contract: inspection depth (peek -> workbench) of the ONE canonical selection + the truthful Workbench capability registry. Pure fixtures, no stores, no UI. */
const T = "2026-10-01T10:00:00.000Z", T2 = "2026-10-01T10:02:30.000Z";
const step = (id: string, kind: JobStep["kind"], over: Partial<JobStep> = {}): JobStep => ({ id, kind, label: id, activity: "", status: "done", percent: 100, weight: 10, dependsOn: [], ...over });
const DEPTS = ["sales-bd", "marketing", "finance-ops"];
const REVIEW = "### Conflicts\nA vs B\n### Dependencies\nA needs B\n### Gaps\nNone\n### Agreed direction\n- Ship the pilot first";
interface Opts { ambiguous?: boolean; qaVerdict?: boolean; noPlan?: boolean; noSources?: boolean; noReviewOutput?: boolean; unknown?: boolean; approvals?: boolean }
function fixture(o: Opts = {}): MissionWorktree {
  const steps: JobStep[] = [];
  steps.push(step("brief", "brief", { output: "The brief" }));
  steps.push(step("plan", "plan", { dependsOn: ["brief"], provider: "ollama", startedAt: T, finishedAt: T2, usage: [{ provider: "ollama", model: "llama3", inputTokens: 10, outputTokens: 20, durationMs: 100, timestamp: T }] }));
  steps.push(step("research", "research", { dependsOn: ["plan"], startedAt: T, finishedAt: T2, output: "### Finding 1: Q?\nAnswer [1].\nSources: [1]", ...(o.noSources ? {} : { sources: [{ title: "S1", uri: "https://e.com/1" }, { title: "S2", uri: "https://e.com/2" }] }) }));
  DEPTS.forEach((d, i) => { for (let k = 0; k < (o.ambiguous ? 2 : 1); k++) steps.push(step(`dept:${d}`, "department", { departmentId: d, dependsOn: ["research"], label: departmentDisplayName(d), ...(i === 0 ? { provider: "ollama" } : {}) })); });
  if (o.unknown) steps.push(step("legacy", "legacy-kind" as never, { label: "Legacy thing", dependsOn: ["plan"] }));
  steps.push(step("reconcile", "reconcile", { dependsOn: DEPTS.map(d => `dept:${d}`), provider: "ollama", startedAt: T, finishedAt: T2, ...(o.noReviewOutput ? {} : { output: REVIEW }), usage: [{ provider: "ollama", model: "llama3", inputTokens: 1, outputTokens: 1, durationMs: 1, timestamp: T }] }));
  steps.push(step("qa", "qa", { dependsOn: ["reconcile"], output: o.qaVerdict ? "**Verdict:** PASS WITH FIXES\n### Required fixes\n1. fix" : "QA notes without a verdict line", usage: [{ provider: "ollama", model: "llama3", inputTokens: 1, outputTokens: 1, durationMs: 1, timestamp: T }] }));
  steps.push(step("final", "final", { dependsOn: ["qa"] }));
  const job: Job = { id: "job-w51", title: "Apex Mission", brief: "b", status: "done", percent: 60, verified: true, steps, createdAt: T, updatedAt: T, liveNotes: [], revisions: [],
    ...(o.noPlan ? {} : { planSnapshot: { title: "T", researchQuestions: ["Q?"], assignments: DEPTS.map(d => ({ departmentId: d, task: `${d} assignment text`, activity: "a", ...(d === "marketing" ? { vaultRecommendation: { selectedAgentName: "Ad Specialist", selectedAgentCategory: "paid", band: "direct", confidence: 0.9 } as never } : {}) })) } }) };
  return buildMissionWorktree({ job, ...(o.approvals ? { approvals: [], consultations: [] } : {}) });
}
const run = (wt: MissionWorktree, state: WorktreeSelection, ...actions: SelectionAction[]) => actions.reduce((s, a) => reduceSelection(s, a, wt), state);
const start = (wt: MissionWorktree, view: "graph" = "graph") => initialSelection(wt, view);
const phaseId = (wt: MissionWorktree, key: string) => wt.phases.find(p => p.key === key)!.id;
const caps = (wt: MissionWorktree, id: string) => workbenchCapabilities(wt, id)!;
const ids = (set: WorkbenchCapabilitySet) => set.sections.map(s => s.id);
const stateOf = (set: WorkbenchCapabilitySet, id: WorkbenchSectionId) => set.capabilities.find(c => c.id === id)?.state;
const deptStep = (wt: MissionWorktree, i = 0) => wt.steps.find(x => x.departmentId === wt.departments[i].id)!;

// 1. Peek -> Workbench -> Peek on the SAME entity; Esc order Workbench -> Peek -> closed -> (W4 climb).
{
  const wt = fixture(), lr = phaseId(wt, "live-research");
  let s = run(wt, start(wt), { type: "select", id: lr });
  assert.equal(s.depth, "peek"); assert.equal(s.peekOpen, true);
  s = run(wt, s, { type: "openWorkbench" });
  assert.equal(s.depth, "workbench"); assert.equal(s.selectedId, lr, "opening the Workbench never changes the entity");
  s = run(wt, s, { type: "escape" });
  assert.equal(s.depth, "peek"); assert.equal(s.peekOpen, true); assert.equal(s.selectedId, lr, "Esc: Workbench -> Peek for the same entity");
  s = run(wt, s, { type: "escape" });
  assert.equal(s.peekOpen, false); assert.equal(s.depth, "peek"); assert.equal(s.selectedId, lr, "second Esc = approved W4 behaviour: close the Peek, selection stays");
  s = run(wt, s, { type: "escape" });
  assert.equal(s.selectedId, wt.mission.id, "third Esc climbs one level (W4)");
  assert.equal(run(wt, start(wt), { type: "openWorkbench" }).depth, "peek", "no Workbench without an open Peek");
  assert.equal(run(wt, run(wt, start(wt), { type: "select", id: lr }), { type: "closeWorkbench" }).depth, "peek");
  assert.equal(run(wt, run(wt, start(wt), { type: "select", id: lr }, { type: "openWorkbench" }), { type: "closeWorkbench" }).depth, "peek", "explicit close = back to Peek");
}

// 2. One canonical owner: no second selection state, identity is the W1 id.
{
  const wt = fixture(), tr = phaseId(wt, "team-review");
  const s = run(wt, start(wt), { type: "select", id: tr }, { type: "openWorkbench" });
  assert.deepEqual(Object.keys(s).sort(), ["depth", "expandedDepartmentId", "peekOpen", "pulse", "resume", "section", "sectionMemory", "selectedId", "trail", "view"], "inspection adds depth + section (+ the W6.1 Focus resume record) only; no second entity / view / NORA selection");
  assert.equal(s.selectedId, tr);
  assert.equal(workbenchCapabilities(wt, s.selectedId)?.entityId, tr, "the capability set addresses the entity by its W1 id");
  assert.equal(workbenchCapabilities(wt, "Team Review"), null, "a label is never an identity");
  assert.equal(workbenchCapabilities(wt, "step:job-w51/ghost"), null);
  assert.equal(workbenchCapabilities(wt, null), null);
  assert.deepEqual(contextThread(wt, s.selectedId).map(x => x.id), [wt.mission.id, tr], "the Context Thread comes from the same selection");
}

// 3. Graph <-> Pipeline preserves depth, section, expansion, selection; no packet replay.
{
  const wt = fixture(), dept = wt.departments[1], dstep = deptStep(wt, 1);
  const s = run(wt, start(wt, "graph"), { type: "select", id: dstep.id }, { type: "openWorkbench" }, { type: "setSection", section: "dependencies" });
  assert.equal(s.expandedDepartmentId, dept.id); assert.equal(s.section, "dependencies");
}

// 4 + 5 + 6. Selecting another entity while the Workbench is open: stays open, follows the selection; section kept only when valid, else the new default.
{
  const wt = fixture();
  const lr = phaseId(wt, "live-research"), tr = phaseId(wt, "team-review"), qa = phaseId(wt, "qa"), dstep = deptStep(wt);
  let s = run(wt, start(wt), { type: "select", id: lr }, { type: "openWorkbench" }, { type: "setSection", section: "sources" });
  assert.equal(s.section, "sources");
  s = run(wt, s, { type: "select", id: dstep.id });
  assert.equal(s.depth, "workbench", "Workbench stays open"); assert.equal(s.selectedId, dstep.id);
  assert.equal(s.section, "overview", "Sources does not exist for a step -> that entity's default");
  assert.equal(hasSection(workbenchCapabilities(wt, s.selectedId), s.section), true, "the active section always belongs to the selected entity");
  // Valid section is carried: Team Review -> QA both have Output.
  const q = run(wt, start(wt), { type: "select", id: tr }, { type: "openWorkbench" }, { type: "setSection", section: "output" }, { type: "select", id: qa });
  assert.equal(q.depth, "workbench"); assert.equal(q.section, "output", "valid section preserved on the next entity");
  // Unavailable / foreign sections cannot be activated: state is returned unchanged.
  assert.equal(run(wt, s, { type: "setSection", section: "questions" }), s);
  assert.equal(stateOf(caps(wt, lr), "usage"), "unavailable");
  assert.equal(run(wt, run(wt, start(wt), { type: "select", id: lr }, { type: "openWorkbench" }), { type: "setSection", section: "usage" }).section, "overview");
  // setSection outside the Workbench is ignored.
  assert.equal(run(wt, start(wt), { type: "select", id: lr }, { type: "setSection", section: "sources" }).section, "overview");
  // Closing the Peek always leaves the Workbench.
  const closed = run(wt, run(wt, start(wt), { type: "select", id: lr }, { type: "openWorkbench" }), { type: "escape" }, { type: "escape" });
  assert.equal(closed.depth, "peek"); assert.equal(closed.peekOpen, false);
  // Selecting from a closed Peek while depth is peek does not open the Workbench.
  assert.equal(run(wt, closed, { type: "select", id: tr }).depth, "peek");
  // Collapsing the selected step's department moves selection to the department: the section is re-derived for it.
  const c = run(wt, start(wt), { type: "select", id: dstep.id }, { type: "openWorkbench" }, { type: "setSection", section: "approvals" }, { type: "toggleExpand", departmentId: wt.departments[0].id });
  assert.equal(c.selectedId, wt.departments[0].id); assert.equal(c.depth, "workbench"); assert.equal(c.section, "overview", "Approvals is not a department section");
}

// 7. Per-entity section memory (transient).
{
  const wt = fixture();
  const lr = phaseId(wt, "live-research"), tr = phaseId(wt, "team-review"), dstep = deptStep(wt);
  let s = run(wt, start(wt), { type: "select", id: lr }, { type: "openWorkbench" }, { type: "setSection", section: "sources" });
  s = run(wt, s, { type: "select", id: dstep.id });
  assert.equal(s.section, "overview");
  s = run(wt, s, { type: "select", id: lr });
  assert.equal(s.section, "sources", "returning to Live Research restores Sources");
  assert.equal(s.sectionMemory[lr], "sources"); assert.equal(s.sectionMemory[dstep.id], undefined, "only explicit choices are remembered");
  s = run(wt, s, { type: "setSection", section: "findings" }, { type: "select", id: tr }, { type: "setSection", section: "review" }, { type: "select", id: lr });
  assert.equal(s.section, "findings", "memory is per entity");
  assert.equal(run(wt, s, { type: "select", id: tr }).section, "review");
  const set = caps(wt, lr);
  assert.equal(settleSection(set, { [lr]: "findings" }, "sources"), "findings", "remembered beats carried");
  assert.equal(settleSection(set, {}, "sources"), "sources", "carried beats default");
  assert.equal(settleSection(set, {}, "qa"), "overview");
  assert.equal(settleSection(set, { [lr]: "qa" }, null), "overview", "a stale remembered section is ignored");
  assert.equal(settleSection(null, {}, "sources"), "overview");
}

// 8. Live Research capability set.
{
  const wt = fixture(), set = caps(wt, phaseId(wt, "live-research"));
  assert.equal(set.profile, "research");
  assert.deepEqual(ids(set), ["overview", "questions", "findings", "sources", "execution", "output", "dependencies"], "usage is not recorded for research -> not exposed");
  assert.equal(stateOf(set, "questions"), "available");
  assert.equal(stateOf(set, "findings"), "parsed");
  assert.equal(set.capabilities.find(c => c.id === "findings")?.provenance, "Parsed from text");
  assert.equal(set.capabilities.find(c => c.id === "sources")?.count, 2);
  assert.equal(stateOf(set, "usage"), "unavailable");
  assert.equal(set.defaultSection, "overview");
  const np = fixture({ noPlan: true }), noPlan = caps(np, phaseId(np, "live-research"));
  assert.equal(stateOf(noPlan, "questions"), "unavailable"); assert.ok(noPlan.capabilities.find(c => c.id === "questions")?.reason);
  assert.equal(ids(noPlan).includes("questions"), false);
  assert.equal(noPlan.capabilities.find(c => c.id === "questions")?.count, undefined, "no fabricated zero");
  const none = fixture({ noSources: true }), ns = caps(none, phaseId(none, "live-research"));
  assert.equal(stateOf(ns, "sources"), "recorded-empty", "recorded-empty is distinct from unavailable"); assert.ok(ids(ns).includes("sources"), "an empty recorded source list is itself a fact and is exposed");
}

// 9. Team Review + QA.
{
  const wt = fixture(), set = caps(wt, phaseId(wt, "team-review"));
  assert.equal(set.profile, "review");
  assert.deepEqual(ids(set), ["overview", "inputs", "execution", "review", "output", "usage"]);
  assert.equal(stateOf(set, "review"), "parsed"); assert.equal(set.capabilities.find(c => c.id === "review")?.provenance, "Parsed from text");
  assert.equal(stateOf(set, "inputs"), "derived");
  const none = fixture({ noReviewOutput: true }), s2 = caps(none, phaseId(none, "team-review"));
  assert.equal(stateOf(s2, "review"), "unavailable"); assert.equal(stateOf(s2, "output"), "unavailable");
  assert.deepEqual(ids(s2), ["overview", "inputs", "execution", "usage"]);
  const no = fixture(), yes = fixture({ qaVerdict: true });
  assert.equal(stateOf(caps(no, phaseId(no, "qa")), "qa"), "unavailable", "no Verdict line -> no QA verdict section");
  assert.equal(ids(caps(no, phaseId(no, "qa"))).includes("qa"), false);
  const qa = caps(yes, phaseId(yes, "qa"));
  assert.equal(qa.profile, "qa"); assert.equal(stateOf(qa, "qa"), "parsed"); assert.deepEqual(ids(qa), ["overview", "inputs", "execution", "qa", "output", "usage"]);
}

// 10. Ordinary Step, Department, Mission, unknown kind.
{
  const wt = fixture(), set = caps(wt, deptStep(wt).id);
  assert.equal(set.profile, "step");
  assert.deepEqual(ids(set), ["overview", "execution", "dependencies"], "no output / usage / approvals recorded for this step -> not shown");
  assert.equal(stateOf(set, "approvals"), "unavailable", "approvals were not read");
  assert.equal(stateOf(set, "output"), "unavailable");
  const reads = fixture({ approvals: true }), d2 = caps(reads, reads.steps.find(x => x.departmentId)!.id);
  assert.equal(stateOf(d2, "approvals"), "recorded-empty", "a successful read with no rows is recorded-empty, NOT unavailable");
  assert.equal(d2.capabilities.find(c => c.id === "approvals")?.count, 0);
  assert.equal(ids(d2).includes("approvals"), false, "nothing to show -> no empty section");
  assert.deepEqual(ids(caps(wt, phaseId(wt, "planning"))), ["overview", "execution", "dependencies", "usage"]);
  const dep = caps(wt, wt.departments.find(d => d.canonicalId === "brand_growth_marketing")!.id);
  assert.equal(dep.profile, "department"); assert.deepEqual(ids(dep), ["overview", "assignment", "steps", "execution", "dependencies"]);
  assert.match(dep.capabilities.find(c => c.id === "assignment")?.reason ?? "", /planning recommendation, not proof of execution/);
  assert.equal(stateOf(dep, "dependencies"), "derived");
  assert.equal(caps(wt, wt.departments.find(d => d.canonicalId === "strategic_intelligence")!.id).capabilities.find(c => c.id === "assignment")?.reason, undefined, "no specialist -> no recommendation note");
  const na = fixture({ noPlan: true }), dn = caps(na, na.departments[0].id);
  assert.equal(stateOf(dn, "assignment"), "unavailable"); assert.deepEqual(ids(dn), ["overview", "steps", "execution", "dependencies"]);
  const m = caps(wt, wt.mission.id);
  assert.equal(m.profile, "mission");
  assert.equal(stateOf(m, "history"), "unavailable", "no durable history is recorded"); assert.equal(ids(m).includes("history"), false);
  assert.deepEqual(ids(m), ["overview", "execution", "usage", "requestedChanges"], "no final output, approvals or lineage recorded here; Requested changes stays reachable (C1b.2: it is the home of Request a change) and its state stays recorded-empty");
  assert.equal(stateOf(m, "approvals"), "unavailable"); assert.equal(stateOf(m, "lineage"), "recorded-empty"); assert.equal(stateOf(m, "requestedChanges"), "recorded-empty");
  const u = fixture({ unknown: true }), us = u.steps.find(x => !x.kindKnown)!;
  assert.deepEqual(ids(caps(u, us.id)), ["overview", "execution", "dependencies"], "an unknown-kind step stays inspectable");
  assert.equal(caps(wt, phaseId(wt, "departments")).profile, "departments-phase");
}

// 11. Ambiguity: explanation context, never a normal entity.
{
  const wt = fixture({ ambiguous: true }), node = phaseId(wt, "team-review"), id = ambiguityId(node);
  const set = caps(wt, id);
  assert.equal(set.profile, "ambiguity"); assert.equal(set.defaultSection, "problem", "the ambiguity default is Problem");
  assert.deepEqual(ids(set).sort(), ["candidates", "problem", "references"]);
  for (const forbidden of ["overview", "execution", "output", "usage", "dependencies", "steps"] as const) assert.equal(set.capabilities.some(c => c.id === forbidden), false, `ambiguity has no ${forbidden}`);
  let s = run(wt, start(wt), { type: "select", id }, { type: "openWorkbench" });
  assert.equal(s.depth, "workbench"); assert.equal(s.section, "problem");
  s = run(wt, s, { type: "setSection", section: "candidates" });
  assert.equal(s.section, "candidates");
  s = run(wt, s, { type: "select", id: wt.departments[0].id });
  assert.equal(s.section, "overview", "candidates does not exist for a department -> default");
  assert.equal(run(wt, s, { type: "select", id }).section, "candidates", "ambiguity memory");
}

// 12. Unavailable data stays unavailable; nothing is fabricated; defaults are deterministic and belong to the set.
{
  const wt = fixture({ ambiguous: true, unknown: true });
  const all = [wt.mission.id, ...wt.phases.map(p => p.id), ...wt.departments.map(d => d.id), ...wt.steps.map(s => s.id), ...wt.departments.map(d => ambiguityId(d.id))];
  let checked = 0;
  for (const id of all) {
    const set = workbenchCapabilities(wt, id);
    if (!set) continue;
    checked++;
    assert.equal(set.sections.some(c => c.id === set.defaultSection), true, `default section exists for ${id}`);
    for (const c of set.capabilities) {
      if (c.state === "unavailable") { assert.equal(c.visible, false); assert.ok(c.reason, `unavailable ${c.id} on ${id} carries a reason`); assert.equal(c.count, undefined, `no fabricated count for unavailable ${c.id}`); }
      if (c.state === "parsed") assert.equal(c.provenance, "Parsed from text");
      if (c.state === "derived") assert.equal(c.provenance, "Derived");
    }
    assert.equal(JSON.stringify(workbenchCapabilities(wt, id)), JSON.stringify(set), "deterministic");
  }
  assert.ok(checked > 8);
}

// 13. NORA context carries Workbench depth only while open; selection stays the source of truth; stale selection reconciles.
{
  const wt = fixture(), lr = phaseId(wt, "live-research");
  let s = run(wt, start(wt), { type: "select", id: lr });
  assert.equal(inspectionOf(wt, s), null);
  assert.equal(noraContextFor(wt, s.selectedId, [], inspectionOf(wt, s)).mission.context.includes("inspection"), false, "Peek context unchanged from W4");
  s = run(wt, s, { type: "openWorkbench" }, { type: "setSection", section: "sources" });
  const ins = inspectionOf(wt, s)!;
  assert.deepEqual(ins.path, ["Apex Mission", "Live Research", "Sources"]);
  const ctx = JSON.parse(noraContextFor(wt, s.selectedId, [], ins).mission.context);
  assert.equal(ctx.navigation.entityId, lr); assert.deepEqual(ctx.navigation.inspection.path, ["Apex Mission", "Live Research", "Sources"]);
  const stale = { ...s, selectedId: "step:job-w51/ghost", trail: [wt.mission.id, lr, "step:job-w51/ghost"] };
  const fixed = run(wt, stale, { type: "reconcile" });
  assert.equal(fixed.selectedId, lr); assert.equal(hasSection(workbenchCapabilities(wt, fixed.selectedId), fixed.section), true);
}
console.log("test-dive-mission-worktree-workbench: all W5.1 contract checks passed");
