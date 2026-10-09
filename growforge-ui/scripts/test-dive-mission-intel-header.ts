import assert from "node:assert/strict";
import { intelHeaderOf, intelProgressOf } from "../src/components/spatial/dive/missionIntelHeader";

/** Task 2B: the Intelligence panel's identity header shows only recorded facts. */
type Live = "confirmed" | "unconfirmed" | "unverifiable" | "not-applicable";
const m = (status: "done" | "error" | "running", live: Live, brief = "Turn ideas into products.") =>
  ({ title: "AI Solutions", brief, status, execution: { recordedStatus: status, recordedActiveStepIds: [] as string[], liveEvidence: live, liveConfirmed: live === "confirmed" } });

assert.deepEqual(intelHeaderOf(m("done", "not-applicable")).status, { label: "Done", tone: "done", note: "Recorded status: done." });
assert.equal(intelHeaderOf(m("error", "not-applicable")).status.label, "Error");
assert.equal(intelHeaderOf(m("error", "not-applicable")).status.tone, "error");
assert.equal(intelHeaderOf(m("running", "confirmed")).status.label, "Running · live");
assert.equal(intelHeaderOf(m("running", "unconfirmed")).status.label, "Running (recorded)");
assert.match(intelHeaderOf(m("running", "unconfirmed")).status.note, /no executor confirms/);
assert.match(intelHeaderOf(m("running", "unverifiable")).status.note, /could not be verified/);
for (const s of ["done", "error", "running"] as const) for (const l of ["confirmed", "unconfirmed", "unverifiable", "not-applicable"] as const)
  assert.ok(!/on track|at risk|healthy|delayed/i.test(JSON.stringify(intelHeaderOf(m(s, l)))), "no invented judgement (On Track / At risk) is ever produced");
assert.equal(intelHeaderOf(m("done", "not-applicable", "  A\n  brief   with   gaps ")).brief, "A brief with gaps", "whitespace is normalised, text untouched");
assert.equal(intelHeaderOf(m("done", "not-applicable", "   ")).brief, null, "no brief recorded -> null (the panel says so; nothing is made up)");
assert.equal(intelHeaderOf(m("done", "not-applicable")).title, "AI Solutions");

// Task 2C: the Mission Progress block is the recorded percent + done / recorded steps; nothing is recomputed from steps.
const steps = (...st: string[]) => st.map(status => ({ status }));
assert.deepEqual(intelProgressOf({ mission: { percent: 69 }, steps: steps("done", "done", "error", "pending") }), { percent: 69, done: 2, total: 4, stepsText: "2 / 4 steps", note: "Completion is the mission's recorded percent (job.percent). 2 of 4 recorded steps have the recorded status done." });
assert.equal(intelProgressOf({ mission: { percent: 100 }, steps: steps("done") }).stepsText, "1 / 1 steps");
assert.equal(intelProgressOf({ mission: { percent: 40 }, steps: steps("active", "done") }).percent, 40, "the percent is NOT derived from the step count");
assert.equal(intelProgressOf({ mission: { percent: 0 }, steps: [] }).stepsText, "No steps recorded", "no steps -> no fraction is invented");
assert.equal(intelProgressOf({ mission: { percent: 130 }, steps: [] }).percent, 100); assert.equal(intelProgressOf({ mission: { percent: -3 }, steps: [] }).percent, 0);
assert.equal(intelProgressOf({ mission: { percent: 72.4 }, steps: [] }).percent, 72);
console.log("test-dive-mission-intel-header: recorded status / title / brief / progress only; no invented On Track");

// C5B: the identity header follows the Graph selection, with only recorded labels / statuses / descriptions.
import { intelIdentityOf } from "../src/components/spatial/dive/missionIntelHeader";
import type { Job, JobStep } from "../src/lib/jobStore";
import { buildMissionWorktree } from "../src/components/spatial/dive/missionWorktree";
{
  const T = "2026-10-01T10:00:00.000Z";
  const st = (id: string, kind: JobStep["kind"], over: Partial<JobStep> = {}): JobStep => ({ id, kind, label: id, activity: "", status: "done", percent: 100, weight: 10, dependsOn: [], ...over });
  const steps = [st("brief", "brief"), st("plan", "plan", { dependsOn: ["brief"] }), st("research", "research", { dependsOn: ["plan"], activity: "Reading the market" }),
    st("dept:sales-bd", "department", { departmentId: "sales-bd", dependsOn: ["research"], status: "error", error: "Provider timeout", activity: "Draft outreach" }), st("dept:legal", "department", { departmentId: "legal", dependsOn: ["research"] }),
    st("reconcile", "reconcile", { dependsOn: ["dept:sales-bd", "dept:legal"] }), st("qa", "qa", { dependsOn: ["reconcile"] }), st("final", "final", { dependsOn: ["qa"] })];
  const job: Job = { id: "j", title: "Mission X", brief: "The brief.", status: "error", percent: 80, verified: false, steps, createdAt: T, updatedAt: T, liveNotes: [], revisions: [],
    planSnapshot: { title: "T", researchQuestions: [], assignments: [{ departmentId: "sales-bd", task: "Win the first ten clients", activity: "a" }, { departmentId: "legal", task: "", activity: "a" }] } };
  const wt = buildMissionWorktree({ job });
  const mission = intelIdentityOf(wt, wt.mission.id);
  assert.equal(mission.eyebrow, "Mission"); assert.equal(mission.title, "Mission X"); assert.equal(mission.brief, "The brief.");
  assert.deepEqual(intelIdentityOf(wt, null), mission, "nothing selected -> the mission");
  const phase = wt.phases.find(p => p.key === "live-research")!, ph = intelIdentityOf(wt, phase.id);
  assert.equal(ph.eyebrow, "Phase"); assert.equal(ph.title, phase.label); assert.equal(ph.status.label, "Done"); assert.match(ph.brief!, /^1 recorded step/);
  const dept = wt.departments.find(d => d.name && d.assignments[0]?.task === "Win the first ten clients")!, dp = intelIdentityOf(wt, dept.id);
  assert.equal(dp.eyebrow, "Department"); assert.equal(dp.title, dept.name); assert.equal(dp.status.tone, "error"); assert.equal(dp.brief, "Win the first ten clients", "the recorded assignment");
  const bare = wt.departments.find(d => d.id !== dept.id)!;
  assert.equal(intelIdentityOf(wt, bare.id).brief, null, "no assignment recorded -> null, never invented");
  const step = wt.steps.find(s => s.phaseKey === "live-research")!, sp = intelIdentityOf(wt, step.id);
  assert.equal(sp.eyebrow, "Step"); assert.equal(sp.brief, "Reading the market"); assert.equal(sp.status.label, "Done");
  assert.equal(intelIdentityOf(wt, wt.steps.find(s => s.status === "error")!.id).brief, "Provider timeout", "an errored step shows its recorded error");
  for (const id of [wt.mission.id, phase.id, dept.id, step.id]) assert.ok(!/on track|at risk|healthy|delayed/i.test(JSON.stringify(intelIdentityOf(wt, id))), "no invented judgement");
}
console.log("test-dive-mission-intel-header: selection-following identity (mission / phase / department / step) checks passed");

// C5C: Explore details reuses the EXISTING Workbench (select the current entity, then openWorkbench); no new detail system.
import { readFileSync } from "node:fs";
{
  const dir = new URL("../src/components/spatial/dive/", import.meta.url), lens = readFileSync(new URL("MissionWorktreeLens.tsx", dir), "utf8"), panel = readFileSync(new URL("MissionIntelPanel.tsx", dir), "utf8");
  assert.ok(/onOpen: \(\) => \{ dispatch\(\{ type: "select", id: selectedId \}\); if \(workspaceFlag\) setWorkspaceFor\(missionId\); else dispatch\(\{ type: "openWorkbench" \}\); \}/.test(lens), "the lens opens the existing Workbench for the current selection (C8 / S1: the new workspace only behind the rollout flag)");
  assert.ok(/workbenchCapabilities\(worktree, selectedId\) \? "ready" : "none"/.test(lens), "an entity with no detail surface offers no button");
  assert.ok(/data-explore/.test(panel) && /Explore details/.test(panel), "the panel carries the action");
  assert.ok(/IntelBody/.test(panel) && !/Mission Progress|aria-hidden="true"><i/.test(panel) && !/onSelect/.test(panel), "the old placeholder blocks and the permanent list rows are gone");
  assert.ok(!/useReducer|useState/.test(panel), "the panel owns no detail state");
}
console.log("test-dive-mission-intel-header: Explore details wiring checks passed");

// C7A: the panel body follows the reference structure for every selection and only ever carries recorded facts (canonical analytics, the Workbench's Steps rows, the Peek facts).
import { INTEL_DOT_ROWS, INTEL_PROGRESS_DOTS, instrumentOf, intelSummaryOf } from "../src/components/spatial/dive/missionIntelHeader";
import { analyticsOf } from "../src/components/spatial/dive/missionAnalytics";
import { workbenchContentOf } from "../src/components/spatial/dive/missionWorkbenchContent";
{
  const T = "2026-10-01T10:00:00.000Z";
  const st = (id: string, kind: JobStep["kind"], over: Partial<JobStep> = {}): JobStep => ({ id, kind, label: id, activity: "", status: "done", percent: 100, weight: 10, dependsOn: [], ...over });
  const steps = [st("brief", "brief"), st("plan", "plan", { dependsOn: ["brief"] }), st("research", "research", { dependsOn: ["plan"], startedAt: "2026-10-01T09:00:00.000Z" }),
    st("dept:sales-bd", "department", { departmentId: "sales-bd", dependsOn: ["research"], activity: "Draft outreach", startedAt: "2026-10-01T09:10:00.000Z" }), st("dept:sales-bd:1", "department", { departmentId: "sales-bd", dependsOn: ["research"], status: "error", percent: 40, error: "Provider timeout" }),
    st("dept:legal", "department", { departmentId: "legal", dependsOn: ["research"] }), st("reconcile", "reconcile", { dependsOn: ["dept:sales-bd", "dept:legal"] }), st("qa", "qa", { dependsOn: ["reconcile"] }), st("final", "final", { dependsOn: ["qa"] })];
  const job: Job = { id: "j2", title: "M", brief: "b", status: "error", percent: 80, verified: false, steps, createdAt: T, updatedAt: T, liveNotes: [], revisions: [],
    planSnapshot: { title: "T", researchQuestions: [], assignments: [{ departmentId: "sales-bd", task: "t", activity: "a" }, { departmentId: "legal", task: "t", activity: "a" }] } };
  const wt = buildMissionWorktree({ job });
  const multi = wt.departments.find(d => d.stepIds.length === 2)!, single = wt.departments.find(d => d.stepIds.length === 1)!;
  // every selection has the same five-part body: headline, four key figures, one analysis card
  for (const id of [null, wt.mission.id, wt.phases[0].id, wt.phases.find(p => p.key === "departments")!.id, multi.id, wt.steps[0].id]) {
    const sm = intelSummaryOf(wt, id);
    assert.ok(sm.headline.text.length > 0 && sm.headline.label.length > 0 && sm.tiles.length === 4 && sm.tiles.map(t => t.label).join() === "API calls,Tokens,API cost,Elapsed" && sm.analysis.lead.length > 0 && sm.analysis.lines.length >= 1 && sm.analysis.lines.length <= 3 && sm.context.length > 0, `${id}: the full reference structure`);
    assert.ok(!/on track|at risk|healthy|delayed|sentiment|trend/i.test(JSON.stringify(sm)), "no invented judgement");
  }
  // Mission: its recorded percent + step count, the phases card
  const mission = intelSummaryOf(wt, wt.mission.id);
  assert.equal(mission.headline.text, "80%"); assert.equal(mission.headline.meta, `${wt.steps.filter(x => x.status === "done").length} / ${wt.steps.length} steps`);
  assert.equal(mission.analysis.lead, "Recorded completion 80%");
  assert.equal(mission.analysis.lines[0], `${wt.steps.filter(x => x.status === "done").length} done, 1 failed and ${wt.steps.filter(x => x.status === "pending").length || 0} pending of ${wt.steps.length} recorded steps.`.replace(", 1 failed and 0 pending", " and 1 failed"), "counts of the recorded step states, in canonical order");
  assert.match(mission.analysis.lines[1], /^Recorded error in .+: Provider timeout$/, "the first recorded failure, with its department, as recorded");
  assert.match(mission.context, /^Last recorded update 2026-10-01 10:00 UTC$/);
  // Department: the canonical analytics + the Workbench's own Steps rows
  const m = intelSummaryOf(wt, multi.id), workbench = workbenchContentOf(wt, multi.id, "steps")!.blocks.find(b => b.kind === "steps");
  assert.equal(m.headline.text, analyticsOf(wt, multi.id)!.headline.text); assert.deepEqual(m.tiles.map(t => t.label), ["API calls", "Tokens", "API cost", "Elapsed"], "the four key figures: calls, tokens, cost, elapsed (no Steps tile)");
  assert.match(m.context, /^Started 2026-10-01 09:10 UTC$/, "the earliest recorded step start");
  assert.equal(m.analysis.lead, `Completion ${analyticsOf(wt, multi.id)!.headline.text}`); assert.match(m.analysis.lines[0], /^1 done and 1 failed of 2 recorded steps\.$/); assert.match(m.analysis.lines[1], /Provider timeout/);
  assert.deepEqual(intelSummaryOf(wt, single.id).analysis.lines, ["1 done of 1 recorded step."], "no failure recorded: no blocker line");
  // Step: ITS OWN analytics and its recorded facts
  const step = wt.steps.find(x => x.phaseKey === "live-research")!, sp = intelSummaryOf(wt, step.id);
  assert.equal(sp.headline.text, `${step.percent}%`); assert.equal(sp.analysis.lead, "Done · 100% recorded");
  assert.match(sp.context, /^Started 2026-10-01 09:00 UTC$/);
  // Phase: its steps; Departments phase: its departments
  assert.match(intelSummaryOf(wt, wt.phases.find(p => p.key === "qa")!.id).analysis.lines[0], /^1 done of 1 recorded step\.$/);
  assert.match(intelSummaryOf(wt, wt.phases.find(p => p.key === "departments")!.id).analysis.lines[1], /^Recorded error in .+: Provider timeout$/);
  assert.equal(intelSummaryOf(wt, "ghost-id").analysis.lead, "Recorded completion 80%", "an unknown id falls back to the mission, never invents");
  const failedStep = wt.steps.find(x => x.status === "error")!, fs = intelSummaryOf(wt, failedStep.id);
  assert.equal(fs.analysis.lead, "Error · 40% recorded"); assert.equal(fs.analysis.lines[0], "Recorded error: Provider timeout");
  assert.ok(intelSummaryOf(wt, step.id).analysis.lines.includes(`Needs ${step.dependencies.prerequisiteIds.length} recorded step${step.dependencies.prerequisiteIds.length === 1 ? "" : "s"}; ${step.dependencies.dependentIds.length} recorded step${step.dependencies.dependentIds.length === 1 ? "" : "s"} ${step.dependencies.dependentIds.length === 1 ? "waits" : "wait"} on it.`), "dependencies stated from the recorded counts");
  assert.ok(!/recommend|should|risk|likely|sentiment|trend/i.test(JSON.stringify([mission.analysis, m.analysis, sp.analysis, fs.analysis])), "no recommendation, risk, sentiment or trend wording");
  assert.equal(mission.instrument?.kind, "distribution"); assert.equal(m.instrument?.kind, "distribution"); assert.equal(sp.instrument?.kind, "progress", "mission / department draw the state distribution, a step its own progress");
  assert.equal(m.instrument!.kind === "distribution" ? m.instrument.columns.reduce((n, c) => n + c.count, 0) : -1, 2, "the department distribution counts exactly its recorded steps");
}

// C7B: the headline instrument draws the recorded distribution (one dot per recorded child; scaled only past the dot rows, and then declared) or the step's own recorded progress; nothing else.
{
  const seg = (status: "done" | "error" | "pending", count: number) => ({ status, label: status, count });
  const d = instrumentOf([seg("done", 3), seg("error", 1), seg("pending", 1)], 60, true);
  assert.ok(d && d.kind === "distribution" && d.unit === 1 && d.columns.map(c => c.dots).join() === "3,0,1,1,0", "one dot per recorded child");
  const big = instrumentOf([seg("done", 14), seg("error", 3)], 80, true);
  assert.ok(big && big.kind === "distribution" && big.unit === 2 && big.columns[0].dots === Math.ceil(14 / 2) && big.columns[0].dots <= INTEL_DOT_ROWS && big.columns[3].dots === 2, "scaled only past the dot rows (and the unit is exposed for the legend)");
  assert.ok(instrumentOf([seg("error", 1)], 0, true)!.kind === "distribution" && (instrumentOf([seg("error", 1)], 0, true) as { columns: { dots: number }[] }).columns[3].dots === 1, "a recorded child is never rounded away");
  const pr = instrumentOf([], 40, false);
  assert.deepEqual(pr, { kind: "progress", percent: 40, dots: INTEL_PROGRESS_DOTS, filled: 8 }, "a step: its own recorded percent as a dotted track");
  assert.equal(instrumentOf([], null, false), null, "nothing recorded: no instrument");
  assert.equal(instrumentOf([], null, true), null, "a composition with no recorded child and no percent draws nothing");
}

// C7D: the ONE NORA chat input is pinned to the Intelligence panel footer by CSS only (same component, same state), and only while the panel is mounted (desktop Missions).
{
  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8"), panelCss = readFileSync(new URL("../src/components/spatial/dive/MissionIntelPanel.module.css", import.meta.url), "utf8");
  const dock = /html\[data-intel-inset\] \.studio-command-dock-wrapper\{([^}]*)\}/.exec(css)?.[1] ?? "";
  assert.ok(/right:30px!important/.test(dock) && /bottom:30px!important/.test(dock) && /left:auto!important/.test(dock), "the dock sits in the panel footer (right / bottom inside the 16px panel margin)");
  assert.ok(/--nora-width:calc\(var\(--intel-inset, 0px\) - 44px\)!important/.test(dock), "its width is the panel width minus the panel padding");
  assert.ok(/html\[data-intel-inset\] \.nora-conversation\{[^}]*right:30px!important/.test(css), "the conversation opens just above it, in the same column");
  assert.ok(!/left:calc\(\(100vw - var\(--intel-inset/.test(css.slice(css.indexOf("C7D"))) , "the old bottom-centre placement of the chatbar is gone on desktop Missions");
  assert.ok(/\.panel\{padding-bottom:76px\}/.test(panelCss), "the panel body reserves the footer");
  const panelSrc = readFileSync(new URL("../src/components/spatial/dive/MissionIntelPanel.tsx", import.meta.url), "utf8");
  assert.ok(/setAttribute\("data-intel-inset", ""\)/.test(panelSrc) && !/NoraChat|CoreCommandCenter/.test(panelSrc), "the panel only flags itself; it does not create a second chat");
}

// C7E.3.1: the API cost tile reuses analytics.cost (billed vs estimate) and never invents $0.
import { costMetric } from "../src/components/spatial/dive/missionIntelHeader";
{
  const cost = (billed: string, estimate: string) => costMetric({ billed, estimate, estimateNote: "note" });
  assert.deepEqual([cost("$1.20", "≈ $0.0150").value, cost("$1.20", "≈ $0.0150").sub], ["$1.20", "Billed"], "a recorded billed cost wins and is labelled Billed");
  const est = cost("Not recorded", "≈ $0.0150");
  assert.deepEqual([est.value, est.sub], ["≈ $0.0150", "Estimated · price table"], "an existing estimate is clearly labelled Estimated");
  for (const missing of ["Not available", "No usage recorded"]) { const c = cost("Not recorded", missing); assert.equal(c.value, "Not recorded", `${missing}: never a $0 or an invented amount`); assert.ok(!/\$/.test(c.value + (c.sub ?? ""))); }
  assert.deepEqual([cost("Not recorded", "$0.00").value, cost("Not recorded", "$0.00").sub], ["$0.00", "Estimated · local / free model"], "a known zero estimate is shown as $0.00, labelled an estimate");
  const T = "2026-10-01T10:00:00.000Z";
  const st = (id: string, kind: JobStep["kind"], over: Partial<JobStep> = {}): JobStep => ({ id, kind, label: id, activity: "", status: "done", percent: 100, weight: 10, dependsOn: [], ...over });
  const wt2 = buildMissionWorktree({ job: { id: "jc", title: "C", brief: "b", status: "done", percent: 100, verified: true, createdAt: T, updatedAt: T, liveNotes: [], revisions: [], steps: [st("brief", "brief"), st("plan", "plan", { dependsOn: ["brief"] })] } });
  for (const id of [wt2.mission.id, wt2.phases[0].id, wt2.steps[0].id]) {
    const k = intelSummaryOf(wt2, id).tiles;
    assert.deepEqual(k.map(x => x.label), ["API calls", "Tokens", "API cost", "Elapsed"]);
    assert.equal(k[2].value, "Not recorded", "no usage recorded: cost is Not recorded, not $0");
  }
}
console.log("test-dive-mission-intel-header: panel body (reference structure, recorded facts only) checks passed");
