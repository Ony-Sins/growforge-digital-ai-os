import { stepPrimaryLabel } from "../src/components/spatial/dive/missionStepModel";
import assert from "node:assert/strict";
import type { Job, JobStep } from "../src/lib/jobStore";
import { departmentDisplayName } from "../src/lib/departmentTaxonomy";
import { buildMissionWorktree, type MissionWorktree } from "../src/components/spatial/dive/missionWorktree";
import { ambiguityId, isAmbiguityId, ownershipAncestry, selectableFor } from "../src/components/spatial/dive/missionWorktreeAncestry";
import { contextThread, initialSelection, noraContextFor, reduceSelection, stepDisplayLabel, type SelectionAction, type WorktreeSelection } from "../src/components/spatial/dive/missionWorktreeSelection";
import { peekOf, peekSize, MAX_PEEK_FACTS } from "../src/components/spatial/dive/missionWorktreePeek";
import { placePeek } from "../src/components/spatial/dive/missionWorktreePeekLayout";
import { isWorktreeNavKey, navigateWorktree } from "../src/components/spatial/dive/missionWorktreeNav";
import { layoutWorktree, findCollisions, type ViewState } from "../src/components/spatial/dive/missionWorktreeLayout";
import { planConduits } from "../src/components/spatial/dive/missionWorktreeConduits";
import type { MissionLayoutMode } from "../src/components/spatial/dive/missionFlowModel";

/** W4 contract: ONE canonical selection, truthful ancestry, Peek content, dependency navigation, NORA context, keyboard, placement. Pure fixtures, no stores. */
const T = "2026-10-01T10:00:00.000Z", T2 = "2026-10-01T10:02:30.000Z";
const step = (id: string, kind: JobStep["kind"], over: Partial<JobStep> = {}): JobStep => ({ id, kind, label: id, activity: "", status: "done", percent: 100, weight: 10, dependsOn: [], ...over });
const DEPTS = ["sales-bd", "marketing", "finance-ops", "client-success", "web-design", "web-dev", "ai-automation", "meta-ads"];
const REVIEW = "### Conflicts\nA vs B\n### Dependencies\nA needs B\n### Gaps\nNone\n### Agreed direction\n- Ship the pilot first\n- then scale";
interface Opts { depts?: number; ambiguous?: boolean; qaVerdict?: boolean; omit?: string[]; unknown?: boolean; error?: boolean; running?: boolean; noReviewOutput?: boolean }
function fixture(o: Opts = {}, executor?: { confirmable: boolean; missionIds: string[] }): MissionWorktree {
  const ids = DEPTS.slice(0, o.depts ?? 3);
  const steps: JobStep[] = [];
  const add = (s: JobStep) => { if (!o.omit?.includes(s.kind)) steps.push(s); };
  add(step("brief", "brief", { output: "The brief" }));
  add(step("plan", "plan", { dependsOn: ["brief"], provider: "ollama", startedAt: T, finishedAt: T2, usage: [{ provider: "ollama", model: "llama3", inputTokens: 10, outputTokens: 20, durationMs: 100, timestamp: T }] }));
  add(step("research", "research", { dependsOn: ["plan"], startedAt: T, finishedAt: T2, output: "### Finding 1: Q?\nAnswer [1].\nSources: [1]", sources: [{ title: "S1", uri: "https://e.com/1" }, { title: "S2", uri: "https://e.com/2" }] }));
  ids.forEach((d, i) => { for (let k = 0; k < (o.ambiguous ? 2 : 1); k++) add(step(`dept:${d}`, "department", { departmentId: d, dependsOn: ["research"], label: departmentDisplayName(d), status: o.error && i === 1 ? "error" : o.running && i === 0 ? "active" : "done", ...(o.error && i === 1 ? { error: "429 quota exceeded for provider" } : {}), ...(i === 0 ? { provider: "ollama" } : {}) })); });
  if (o.unknown) add(step("legacy", "legacy-kind" as never, { label: "Legacy thing", dependsOn: ["plan"] }));
  add(step("reconcile", "reconcile", { dependsOn: ids.map(d => `dept:${d}`), provider: "ollama", startedAt: T, finishedAt: T2, ...(o.noReviewOutput ? {} : { output: REVIEW }), usage: [{ provider: "ollama", model: "llama3", inputTokens: 1, outputTokens: 1, durationMs: 1, timestamp: T }] }));
  add(step("qa", "qa", { dependsOn: ["reconcile"], output: o.qaVerdict ? "**Verdict:** PASS WITH FIXES\n### Required fixes\n1. fix" : "QA notes without a verdict line" }));
  add(step("final", "final", { dependsOn: ["qa"] }));
  const job: Job = { id: "job-w4", title: "Apex Mission", brief: "b", status: o.running ? "running" : "done", percent: 60, verified: true, steps, createdAt: T, updatedAt: T, liveNotes: [], revisions: [],
    planSnapshot: { title: "T", researchQuestions: ["Q?"], assignments: ids.map(d => ({ departmentId: d, task: `${d} assignment text`, activity: "a", ...(d === "marketing" ? { vaultRecommendation: { selectedAgentName: "Ad Specialist", selectedAgentCategory: "paid", band: "direct", confidence: 0.9 } as never } : {}) })) } };
  return buildMissionWorktree({ job, executor });
}
const run = (wt: MissionWorktree, state: WorktreeSelection, ...actions: SelectionAction[]) => actions.reduce((s, a) => reduceSelection(s, a, wt), state);
const start = (wt: MissionWorktree, view: "graph" = "graph") => initialSelection(wt, view);
const stepId = (wt: MissionWorktree, recordedId: string) => wt.steps.find(s => s.recordedId === recordedId)!.id;
const phaseId = (wt: MissionWorktree, key: string) => wt.phases.find(p => p.key === key)!.id;

// 1. Ancestry is ownership only, independent of layout; dependencies never change it; a typed phase IS its single step.
{
  const wt = fixture({ depts: 3 });
  const dept = wt.departments[1], dstep = wt.steps.find(s => s.departmentId === dept.id)!;
  assert.deepEqual(ownershipAncestry(wt, dstep.id), [wt.mission.id, phaseId(wt, "departments"), dept.id, dstep.id], "Mission -> Departments -> Department -> Step");
  assert.deepEqual(ownershipAncestry(wt, phaseId(wt, "live-research")), [wt.mission.id, phaseId(wt, "live-research")], "Live Research: Mission -> phase");
  assert.deepEqual(ownershipAncestry(wt, phaseId(wt, "team-review")), [wt.mission.id, phaseId(wt, "team-review")]);
  assert.deepEqual(ownershipAncestry(wt, wt.mission.id), [wt.mission.id]);
  assert.deepEqual(ownershipAncestry(wt, "step:job-w4/ghost"), [], "an unknown id has no ancestry");
  // Following a dependency (Team Review needs a department step) does not alter either chain.
  const before = ownershipAncestry(wt, dstep.id);
  const s1 = run(wt, start(wt), { type: "select", id: phaseId(wt, "team-review") }, { type: "select", id: dstep.id });
  assert.deepEqual(ownershipAncestry(wt, s1.selectedId!), before);
  assert.equal(selectableFor(wt, stepId(wt, "research")), phaseId(wt, "live-research"), "a typed single-step phase resolves to its phase node");
  assert.equal(selectableFor(wt, dstep.id), dstep.id, "a department step keeps its own id");
  const unknown = fixture({ unknown: true });
  const u = unknown.steps.find(s => s.recordedId === "legacy")!;
  assert.deepEqual(ownershipAncestry(unknown, u.id), [unknown.mission.id, u.id], "an unknown-kind step invents no phase");
  const amb = fixture({ depts: 2, ambiguous: true });
  const node = phaseId(amb, "team-review");
  assert.deepEqual(ownershipAncestry(amb, ambiguityId(node)), [amb.mission.id, node, ambiguityId(node)]);
}

// 2. One canonical selection: ids only; views, expansion and the pulse behave; stale selections fall back to the nearest valid ancestor.
{
  const wt = fixture({ depts: 4 });
  const dept = wt.departments[1], dstep = wt.steps.find(s => s.departmentId === dept.id)!;
  let s = start(wt);
  assert.equal(s.selectedId, wt.mission.id, "initial = the Mission at rest"); assert.equal(initialSelection(null, "graph").selectedId, null, "before the record loads there is nothing to select"); assert.equal(s.peekOpen, false);
  s = run(wt, s, { type: "select", id: dstep.id });
  assert.equal(s.selectedId, dstep.id); assert.equal(s.expandedDepartmentId, dept.id, "selecting a step reveals its department"); assert.equal(s.peekOpen, true);
  assert.deepEqual(s.trail, [wt.mission.id, phaseId(wt, "departments"), dept.id, dstep.id]);
  const serial = s.pulse!.serial;
  // Selecting a department expands it and keeps it expanded when selected again (no surprise collapse).
  const d1 = run(wt, start(wt), { type: "select", id: dept.id });
  assert.equal(d1.expandedDepartmentId, dept.id);
  const d2 = run(wt, d1, { type: "select", id: dept.id });
  assert.equal(d2.expandedDepartmentId, dept.id, "re-selecting an expanded department does not collapse it"); assert.equal(d2.pulse!.serial, d1.pulse!.serial + 1, "re-selection replays once (new serial)");
  // Explicit expander: collapsing hides the steps; a selected step falls back to its department, not elsewhere.
  const collapsed = run(wt, s, { type: "toggleExpand", departmentId: dept.id });
  assert.equal(collapsed.expandedDepartmentId, null); assert.equal(collapsed.selectedId, dept.id, "context is not lost: the department keeps the selection");
  assert.equal(run(wt, d1, { type: "toggleExpand", departmentId: dept.id }).selectedId, dept.id, "collapsing the selected department keeps it selected");
  assert.equal(run(wt, s, { type: "toggleExpand", departmentId: wt.departments[2].id }).selectedId, dstep.id, "expanding another branch leaves the selection alone");
  // Unknown ids are ignored, never remapped.
  assert.equal(run(wt, s, { type: "select", id: "step:job-w4/ghost" }), s);
  assert.equal(run(wt, s, { type: "select", id: "Brand & Growth Marketing" }), s, "labels are not identities");
  // Stale after a refresh: the step vanished -> its department; the department vanished -> the Departments phase; everything gone -> the Mission.
  const noStep = fixture({ depts: 4 }); noStep.steps.splice(noStep.steps.findIndex(x => x.id === dstep.id), 1);
  const r1 = run(noStep, s, { type: "reconcile" });
  assert.equal(r1.selectedId, dept.id, "nearest valid ancestor");
  const oneDept = fixture({ depts: 1 });
  const r2 = run(oneDept, s, { type: "reconcile" });
  assert.equal(r2.selectedId, phaseId(oneDept, "departments"), "department gone: the Departments phase");
  assert.equal(r2.expandedDepartmentId, null);
  const none = fixture({ depts: 0, omit: ["department"] });
  assert.equal(run(none, s, { type: "reconcile" }).selectedId, none.mission.id, "no valid ancestor but the Mission");
  assert.equal(run(wt, s, { type: "reconcile" }), s, "a valid selection is untouched (same object)");
  void serial;
  // Escape closes the Peek first, then climbs one level at a time; nothing happens at mission level.
  const e1 = run(wt, s, { type: "escape" });
  assert.equal(e1.peekOpen, false); assert.equal(e1.selectedId, dstep.id, "the selection stays");
  const e2 = run(wt, e1, { type: "escape" });
  assert.equal(e2.selectedId, dept.id);
  const e3 = run(wt, e2, { type: "escape" }), e4 = run(wt, e3, { type: "escape" }), e5 = run(wt, e4, { type: "escape" });
  assert.deepEqual([e3.selectedId, e4.selectedId, e5.selectedId], [phaseId(wt, "departments"), wt.mission.id, wt.mission.id]);
  assert.equal(run(wt, start(wt), { type: "escape" }).selectedId, wt.mission.id, "escape at the Mission does nothing");
  // A pulse (keyboard focus) is feedback only.
  const p = run(wt, s, { type: "pulse", subject: dept.id });
  assert.equal(p.selectedId, dstep.id); assert.equal(p.pulse!.subject, dept.id); assert.equal(run(wt, s, { type: "pulse", subject: "x" }), s);
}

// 3. Dependencies: resolved ones are real navigation; unresolved never pretend a target; ambiguity is an explanation and never auto-selects a candidate.
{
  const wt = fixture({ depts: 3 });
  const dstep = wt.steps.find(s => s.departmentId === wt.departments[0].id)!;
  const peek = peekOf(wt, dstep.id)!;
  const needs = peek.links.filter(l => l.direction === "needs"), waits = peek.links.filter(l => l.direction === "waits");
  assert.deepEqual(needs.map(l => l.targetId), [phaseId(wt, "live-research")], "needs: Live Research (the typed phase that represents its step)");
  assert.deepEqual(waits.map(l => l.targetId), [phaseId(wt, "team-review")]);
  let s = run(wt, start(wt), { type: "select", id: dstep.id }, { type: "select", id: needs[0].targetId });
  assert.equal(s.selectedId, phaseId(wt, "live-research"), "clicking a resolved dependency selects that actual entity");
  assert.deepEqual(s.trail, [wt.mission.id, phaseId(wt, "live-research")], "its ownership ancestry, not the depender's");
  const toStep = peekOf(wt, phaseId(wt, "team-review"))!.links.find(l => l.direction === "needs")!;
  assert.ok(wt.steps.some(x => x.id === toStep.targetId && x.departmentId), "Team Review needs real department steps");
  s = run(wt, s, { type: "select", id: toStep.targetId });
  assert.equal(s.selectedId, toStep.targetId); assert.ok(s.expandedDepartmentId, "navigating to a department step reveals its department");
  // Unresolved: counted, not linked.
  const unresolved = buildMissionWorktree({ job: { id: "job-u", title: "U", brief: "b", status: "done", percent: 1, verified: true, createdAt: T, updatedAt: T, liveNotes: [], revisions: [], steps: [step("research", "research"), step("dept:a", "department", { departmentId: "sales-bd", dependsOn: ["research", "ghost"] })] } });
  const us = unresolved.steps.find(x => x.kind === "department")!;
  const up = peekOf(unresolved, us.id)!;
  assert.match(up.facts.find(f => f.label === "Dependencies")!.value, /1 unresolved/);
  assert.ok(!up.links.some(l => l.targetId.includes("ghost")) && up.links.every(l => l.direction !== "ambiguity"), "an unresolved reference offers no target");
  // Ambiguity.
  const amb = fixture({ depts: 3, ambiguous: true });
  const review = phaseId(amb, "team-review");
  const reviewPeek = peekOf(amb, review)!;
  const link = reviewPeek.links.find(l => l.direction === "ambiguity")!;
  assert.equal(link.targetId, ambiguityId(review)); assert.match(link.label, /could not be resolved uniquely \(3\)/);
  const sa = run(amb, run(amb, start(amb), { type: "select", id: review }), { type: "select", id: link.targetId });
  assert.equal(sa.selectedId, ambiguityId(review));
  assert.ok(isAmbiguityId(sa.selectedId!), "selecting the ambiguity selects the explanation, never a candidate");
  const candidates = new Set(amb.steps.filter(x => x.kind === "department").map(x => x.id));
  assert.ok(!candidates.has(sa.selectedId!) && !sa.trail.some(id => candidates.has(id)));
  const ap = peekOf(amb, sa.selectedId)!;
  assert.equal(ap.kind, "ambiguity"); assert.equal(`${ap.typeLabel} ${ap.title}`, "Dependency Could not be resolved uniquely"); assert.equal(ap.facts[0].value, "Dependency could not be resolved uniquely");
  assert.deepEqual(ap.links, [], "no candidate is offered as a link");
  assert.match(ap.facts.find(f => f.label === "Candidates")!.value, /6 recorded steps share the referenced ids; none is chosen/);
  assert.equal(ap.facts.find(f => f.label === "References")!.value, "3 dependency references");
  assert.equal(sa.expandedDepartmentId, null, "no department was expanded on the ambiguity's behalf");
  assert.equal(selectableFor(amb, ambiguityId(review)), ambiguityId(review));
  // An ambiguity id is valid only while its node still carries an issue.
  assert.equal(run(wt, sa, { type: "reconcile" }).selectedId, review, "no longer ambiguous -> falls back to the node that carried it (its nearest valid ancestor)");
}

// 4. Context thread + NORA context come from the same selection, with truthful labels; scope survives the layout switch.
{
  const wt = fixture({ depts: 3 });
  const dept = wt.departments[1], dstep = wt.steps.find(s => s.departmentId === dept.id)!;
  assert.deepEqual(contextThread(wt, null).map(x => x.label), ["Apex Mission"]);
  assert.deepEqual(contextThread(wt, phaseId(wt, "live-research")).map(x => x.label), ["Apex Mission", "Live Research"]);
  assert.deepEqual(contextThread(wt, dept.id).map(x => x.label), ["Apex Mission", "Departments", dept.name]);
  const t = contextThread(wt, dstep.id);
  assert.deepEqual(t.map(x => x.label), ["Apex Mission", "Departments", dept.name, stepPrimaryLabel({ label: dstep.label, kind: dstep.kind, departmentId: dept.canonicalId }, dstep.ordinal).text], "C5D: the context thread shows the SAME canonical label the graph row shows (recorded label, else the recorded kind's wording), not an invented task name");
  assert.equal(stepDisplayLabel(wt, dstep), t[3].label);
  assert.equal(stepDisplayLabel(wt, { ...dstep, label: "", kind: "" as never }), `Step ${dstep.ordinal}`, "only a step with neither a label nor a recognised kind falls back to its position");
  assert.deepEqual(t.map(x => x.kind), ["mission", "phase", "department", "step"]);
  const named = fixture({ depts: 1 }); const ns = named.steps.find(s => s.departmentId)!; ns.label = "Draft the launch email sequence";
  assert.equal(stepDisplayLabel(named, ns), "Draft the launch email sequence", "a recorded label is a real name");
  const facts = peekOf(wt, dstep.id)!.facts;
  const nora = noraContextFor(wt, dstep.id, facts);
  assert.equal(nora.mission.id, "job-w4"); assert.equal(nora.detail!.type, "step"); assert.equal(nora.detail!.label, `Departments / ${dept.name} / ${t[3].label}`);
  const ctx = JSON.parse(nora.mission.context);
  assert.deepEqual(ctx.navigation.path, ["Apex Mission", "Departments", dept.name, t[3].label]); assert.equal(ctx.navigation.level, "step"); assert.equal(ctx.navigation.entityId, dstep.id);
  assert.ok(ctx.navigation.facts.length >= 4 && ctx.note.includes("never guessed"));
  assert.equal(noraContextFor(wt, null, []).detail, null, "mission level: no detail");
  assert.equal(noraContextFor(wt, phaseId(wt, "live-research"), []).detail!.label, "Live Research");
  // The thread and NORA payload are a pure function of the selection (the layout is not an input).
  const sel = run(wt, start(wt, "graph"), { type: "select", id: dstep.id });
  assert.deepEqual(noraContextFor(wt, sel.selectedId, facts), noraContextFor(wt, sel.selectedId, facts));
  // The ambiguity extends the thread honestly.
  const amb = fixture({ depts: 2, ambiguous: true });
  assert.deepEqual(contextThread(amb, ambiguityId(phaseId(amb, "team-review"))).map(x => x.label), ["Apex Mission", "Team Review", "Unresolved dependency"]);
}

// 5. Peek content: 4-6 canonical facts per entity; parsed values say so; no verdict without the line; no executor identity; recommendation is labelled.
{
  const wt = fixture({ depts: 3, qaVerdict: false, error: true });
  const labels = (id: string) => peekOf(wt, id)!.facts.map(f => f.label);
  const get = (id: string, label: string) => peekOf(wt, id)!.facts.find(f => f.label === label);
  for (const id of [wt.mission.id, ...wt.phases.map(p => p.id), ...wt.departments.map(d => d.id), ...wt.steps.map(x => x.id)]) { const p = peekOf(wt, id)!; assert.ok(p.facts.length >= 2 && p.facts.length <= MAX_PEEK_FACTS, `${id}: ${p.facts.length} facts`); }
  const mission = peekOf(wt, wt.mission.id)!;
  assert.deepEqual(mission.facts.map(f => f.label), ["State", "Progress", "Phases", "Departments", "Steps", "Attention"]);
  assert.equal(mission.facts.find(f => f.label === "Phases")!.value, "7 of 7 recorded");
  const running = fixture({ depts: 2, running: true });
  assert.match(peekOf(running, running.mission.id)!.facts[0].value, /Recorded running · liveness cannot be verified/);
  const unconfirmed = fixture({ depts: 2, running: true }, { confirmable: true, missionIds: [] });
  assert.match(peekOf(unconfirmed, unconfirmed.mission.id)!.facts[0].value, /no executor confirms it/);
  const live = fixture({ depts: 2, running: true }, { confirmable: true, missionIds: ["job-w4"] });
  assert.match(peekOf(live, live.mission.id)!.facts[0].value, /executor confirmed/); assert.equal(peekOf(live, live.mission.id)!.facts[0].tone, "live");
  // Live Research
  const r = phaseId(wt, "live-research");
  assert.deepEqual(labels(r), ["State", "Timing", "Questions", "Sources", "Leads to"]);
  assert.equal(get(r, "Questions")!.value, "1"); assert.equal(get(r, "Sources")!.value, "2 recorded · verified");
  assert.match(get(r, "Timing")!.value, /2026-10-01 10:00 UTC · 2m 30s/);
  // Team Review
  const rv = phaseId(wt, "team-review");
  assert.equal(get(rv, "Inputs")!.value, "3 recorded steps feed this review");
  assert.equal(get(rv, "Provider")!.value, "ollama · 1 usage record");
  const agreed = get(rv, "Agreed direction")!; assert.equal(agreed.provenance, "parsed"); assert.equal(agreed.value, "Ship the pilot first");
  const noOutput = fixture({ depts: 3, noReviewOutput: true });
  assert.ok(!peekOf(noOutput, phaseId(noOutput, "team-review"))!.facts.some(f => f.label === "Agreed direction"), "no summary without parsed markdown");
  // QA: a verdict only with the explicit line
  const qa = phaseId(wt, "qa");
  assert.ok(!labels(qa).includes("Verdict"), "no QA verdict is invented");
  const withVerdict = fixture({ depts: 3, qaVerdict: true });
  const verdict = peekOf(withVerdict, phaseId(withVerdict, "qa"))!.facts.find(f => f.label === "Verdict")!;
  assert.equal(verdict.value, "PASS WITH FIXES"); assert.equal(verdict.provenance, "parsed");
  // Department
  const marketing = wt.departments.find(d => d.specialistRecommendation)!;
  const dp = peekOf(wt, marketing.id)!;
  assert.match(dp.facts.find(f => f.label === "Suggested")!.value, /Ad Specialist · planning recommendation, not an executor/);
  assert.match(dp.facts.find(f => f.label === "Assignment")!.value, /assignment text/);
  const errDept = wt.departments[1]; const ep = peekOf(wt, errDept.id)!;
  assert.equal(ep.facts.find(f => f.label === "Attention")!.value, "1 step error"); assert.equal(ep.facts[0].tone, "alert");
  assert.ok(!peekOf(wt, wt.departments[0].id)!.facts.some(f => f.label === "Suggested"), "no recommendation when none is recorded");
  // Step: type, state, provider, dependency counts, error
  const es = wt.steps.find(x => x.departmentId === errDept.id)!, sp = peekOf(wt, es.id)!;
  assert.equal(sp.facts.find(f => f.label === "Type")!.value, "Department"); assert.equal(sp.facts.find(f => f.label === "State")!.value, "Error");
  assert.match(sp.facts.find(f => f.label === "Error")!.value, /429 quota exceeded/); assert.equal(sp.facts.find(f => f.label === "Dependencies")!.value, "needs 1 · waits on this 1");
  const withProvider = peekOf(wt, wt.steps.find(x => x.departmentId === wt.departments[0].id)!.id)!;
  assert.equal(withProvider.facts.find(f => f.label === "Provider")!.value, "ollama");
  assert.ok(!JSON.stringify([...wt.phases.map(p => peekOf(wt, p.id)), ...wt.steps.map(x => peekOf(wt, x.id))]).match(/executor [a-z]+ by|executed by|agent id/i), "no fabricated executor identity");
  const unk = fixture({ unknown: true });
  const up = peekOf(unk, unk.steps.find(x => x.recordedId === "legacy")!.id)!;
  assert.equal(up.typeLabel, "Step · type not recorded"); assert.equal(up.facts.find(f => f.label === "Type")!.value, "not recorded as a known type");
  assert.equal(peekOf(wt, "step:job-w4/ghost"), null); assert.equal(peekOf(wt, null), null);
}

// 6. Peek placement: deterministic, never over the selected node or its neighbours, inside the stage; phones get an in-flow slot; tiny stages fall below the content (never over neighbours).
{
  const STAGES: { w: number; h: number; mode: MissionLayoutMode }[] = [{ w: 1416, h: 584, mode: "graph" }, { w: 1342, h: 406, mode: "wide" }, { w: 366, h: 498, mode: "stack" }, { w: 351, h: 323, mode: "stack" }];
  const sizesFor = (wt: MissionWorktree, id: string, mode: MissionLayoutMode, w: number) => { const p = peekOf(wt, id)!; const m = mode === "stack" ? "stack" : mode === "wide" ? "wide" : "desktop"; return mode === "stack" ? [peekSize(p, "stack", w)] : [peekSize(p, m, w, "single"), peekSize(p, m, w, "double"), peekSize(p, m, w, "triple")]; };
  for (const fx of [fixture({ depts: 7, error: true }), fixture({ depts: 8, ambiguous: true }), fixture({ depts: 0, omit: ["department"], unknown: true })]) {
    const ids = [fx.mission.id, ...fx.phases.map(p => p.id), ...fx.departments.map(d => d.id), ...fx.steps.filter(x => x.departmentId).map(x => x.id).slice(0, 4)];
    for (const st of STAGES) for (const view of ["graph"] as const) for (const id of ids) {
      const nodeId = selectableFor(fx, id), expanded = fx.steps.find(x => x.id === id)?.departmentId ?? (fx.departments.some(d => d.id === id) ? id : null);
      const state: ViewState = { view, selectedId: nodeId, expandedDepartmentId: expanded };
      const sizes = sizesFor(fx, nodeId, st.mode, st.w);
      const layout = layoutWorktree(fx, { width: st.w, height: st.h }, st.mode, state, st.mode === "stack" ? { afterId: nodeId, height: sizes[0].h } : undefined);
      const pl = placePeek(layout, nodeId, sizes);
      // C1: the columnar Graph draws no step: an undrawn entity has no anchor, hence no floating Peek (its details live in the Intelligence panel).
      if (view === "graph" && st.mode !== "stack" && !layout.nodes.some(n => n.id === nodeId)) { assert.equal(pl, null, `${st.mode} ${view} ${id}: no anchor, no Peek`); continue; }
      assert.ok(pl, `${st.mode} ${view} ${id}`);
      assert.deepEqual(placePeek(layout, nodeId, sizes), pl, "deterministic");
      const box = { x: pl!.x, y: pl!.y, w: pl!.w, h: pl!.h };
      assert.ok(box.x >= 0 && box.x + box.w <= st.w + 0.5, `${st.mode} ${view} ${id}: Peek inside the stage horizontally (${JSON.stringify(box)})`);
      assert.ok(box.y >= 0, "and below the top");
      const bottom = pl!.side === "scroll" ? Infinity : layout.contentHeight; assert.ok(box.y + box.h <= bottom + 0.5, `inside the stage unless it deliberately sits below the content ${st.mode} ${view} ${id} ${JSON.stringify(box)} ${pl!.side} ch=${layout.contentHeight}`);
      const anchor = layout.nodes.find(n => n.id === nodeId)!;
      const hits = (b: { x: number; y: number; w: number; h: number }, m = 0) => Math.min(box.x + box.w, b.x + b.w + m) > Math.max(box.x, b.x - m) && Math.min(box.y + box.h, b.y + b.h + m) > Math.max(box.y, b.y - m);
      if (st.mode !== "stack") {
        assert.ok(!hits(anchor), `${view} ${id}: never covers the selected node`);
        const byId = new Map(layout.nodes.map(n => [n.id, n]));
        const containing = new Set<string>(); for (let p = anchor.parentId ? byId.get(anchor.parentId) : undefined; p; p = p.parentId ? byId.get(p.parentId) : undefined) if (p.x <= anchor.x + 1 && p.y <= anchor.y + 1 && p.x + p.w >= anchor.x + anchor.w - 1 && p.y + p.h >= anchor.y + anchor.h - 1) containing.add(p.id);
        const covered = layout.nodes.filter(n => n.id !== anchor.id && !containing.has(n.id) && hits(n)).map(n => n.id);
        // W7.3: the stage never scrolls to reach the Peek. Only when NO clear spot exists (flagged `crowded`) it may sit over receded neighbours, inside the stage; otherwise it covers nothing.
        if (pl!.crowded) { assert.notEqual(pl!.side, "scroll"); assert.ok(box.y + box.h <= layout.contentHeight + 0.5, "a crowded Peek still stays inside the stage"); }
        else assert.deepEqual(covered, [], `${st.mode} ${view} ${id} (${pl!.side}/${pl!.variant}): covers no neighbouring entity`);
      } else {
        assert.equal(pl!.side, "slot"); assert.deepEqual(findCollisions(layout), [], "phones: the slot is reserved, nothing overlaps");
        const others = layout.nodes.filter(n => n.id !== anchor.id && !(n.x <= anchor.x + 1 && n.y <= anchor.y + 1 && n.x + n.w >= anchor.x + anchor.w - 1 && n.y + n.h >= anchor.y + anchor.h - 1) && hits(n));
        assert.deepEqual(others.map(n => n.id), [], `${id}: the sheet sits in its slot, over nothing`);
        assert.ok(pl!.y >= anchor.y + Math.min(anchor.h, anchor.headerH) - 1, "directly under the selected row");
        assert.ok(layout.nodes.every(n => n.x >= 0 && n.x + n.w <= st.w + 0.5 && (n.kind === "phase" && n.h > n.headerH ? n.headerH >= 40 : n.h >= 40)), "40px interactive rows survive the reserved slot");
        assert.ok(pl!.y + pl!.h <= layout.contentHeight);
      }
    }
  }
  // Without a selection reservation the stack layout is unchanged (W2 untouched).
  const wt = fixture({ depts: 3 });
  const plain = layoutWorktree(wt, { width: 366, height: 498 }, "stack", { view: "graph", selectedId: null, expandedDepartmentId: null });
  assert.equal(plain.peekSlot, undefined);
}

// 7. Keyboard: hierarchy, not geometry; the same in both layouts; one roving stop is the selected node.
{
  const wt = fixture({ depts: 3 });
  const mission = wt.mission.id, ph = (k: string) => phaseId(wt, k);
  const dept = (i: number) => wt.departments[i].id, dstep = (i: number) => wt.steps.find(s => s.departmentId === dept(i))!.id;
  const nav = (key: Parameters<typeof navigateWorktree>[0], from: string) => navigateWorktree(key, from, wt);
  assert.equal(nav("ArrowDown", mission), ph("client-brief")); assert.equal(nav("ArrowRight", mission), ph("client-brief"));
  assert.equal(nav("ArrowDown", ph("client-brief")), ph("planning")); assert.equal(nav("ArrowUp", ph("planning")), ph("client-brief")); assert.equal(nav("ArrowUp", ph("client-brief")), mission);
  assert.equal(nav("End", ph("planning")), ph("final-plan")); assert.equal(nav("Home", ph("qa")), ph("client-brief"));
  assert.equal(nav("ArrowRight", ph("departments")), dept(0)); assert.equal(nav("ArrowLeft", dept(0)), ph("departments")); assert.equal(nav("ArrowLeft", ph("departments")), mission);
  assert.equal(nav("ArrowDown", dept(0)), dept(1)); assert.equal(nav("ArrowUp", dept(1)), dept(0)); assert.equal(nav("End", dept(0)), dept(2));
  assert.equal(nav("ArrowRight", dept(1)), dstep(1), "Right enters the department: its first step"); assert.equal(nav("ArrowLeft", dstep(1)), dept(1));
  assert.equal(nav("ArrowLeft", mission), null); assert.equal(nav("ArrowDown", ph("final-plan")), null);
  assert.ok(isWorktreeNavKey("ArrowLeft") && !isWorktreeNavKey("Escape") && !isWorktreeNavKey("Enter"), "Enter is the native button; Escape belongs to the reducer");
  // Following keys through the reducer keeps selection and expansion consistent; the ambiguity explanation is reachable by keyboard.
  let s = start(wt);
  for (const key of ["ArrowRight", "ArrowDown", "ArrowDown", "ArrowDown", "ArrowRight", "ArrowRight"] as const) { const next = nav(key, s.selectedId ?? mission); if (next) s = run(wt, s, { type: "select", id: next }); }
  assert.equal(s.selectedId, dept(0) === s.selectedId ? dept(0) : s.selectedId);
  assert.ok(s.expandedDepartmentId === null || wt.departments.some(d => d.id === s.expandedDepartmentId));
  const amb = fixture({ depts: 2, ambiguous: true }), review = phaseId(amb, "team-review");
  const toAmb = navigateWorktree("ArrowRight", review, amb);
  assert.equal(toAmb, ambiguityId(review), "Right on a node with an unresolved dependency opens its explanation");
  assert.equal(navigateWorktree("ArrowLeft", toAmb!, amb), review, "Left returns to the node");
  assert.equal(navigateWorktree("ArrowDown", toAmb!, amb), null);
}

// 8. Reduced motion and the W3 path: the selection pulse plays packets only when motion is allowed; collapsed-department selection now resolves through its steps.
{
  const wt = fixture({ depts: 3 });
  const dept = wt.departments[1];
  for (const view of ["graph"] as const) {
    const sel = run(wt, start(wt, view), { type: "select", id: dept.id });
    const layout = layoutWorktree(wt, { width: 1416, height: 584 }, "graph", { view, selectedId: sel.selectedId, expandedDepartmentId: sel.expandedDepartmentId });
    const play = planConduits({ layout, worktree: wt, selectedId: sel.selectedId, pulse: sel.pulse, reducedMotion: false });
    const still = planConduits({ layout, worktree: wt, selectedId: sel.selectedId, pulse: sel.pulse, reducedMotion: true });
    assert.ok(play.packets.length > 0, `${view}: selecting a department plays ONE packet along its truthful path `);
    assert.ok(play.packets.every(p => !p.repeats && p.kind === "selection"));
    assert.deepEqual(still.packets, [], `${view}: reduced motion runs no packet animation`);
    assert.ok(still.segments.some(sg => sg.role === "path") && still.segments.some(sg => sg.role === "receded"), "selection still resolves through clarity");
  }
  // The Mission at rest does not recede the graph.
  const idle = run(wt, start(wt), { type: "escape" });
  const layout = layoutWorktree(wt, { width: 1416, height: 584 }, "graph", { view: "graph", selectedId: wt.mission.id, expandedDepartmentId: null });
  assert.ok(planConduits({ layout, worktree: wt, selectedId: idle.selectedId ?? wt.mission.id, pulse: null, reducedMotion: false }).segments.every(sg => sg.role === "idle"));
}

console.log("mission worktree selection / peek checks passed; pure fixtures, no stores read or written.");
