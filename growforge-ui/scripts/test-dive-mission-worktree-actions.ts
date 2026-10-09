import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import type { Job, JobStep } from "../src/lib/jobStore";
import type { PendingApproval } from "../src/lib/approvalStore";
import { buildMissionWorktree, type MissionWorktree } from "../src/components/spatial/dive/missionWorktree";
import { initialSelection, reduceSelection, type SelectionAction, type WorktreeSelection } from "../src/components/spatial/dive/missionWorktreeSelection";
import { CATEGORY_SECTION, MISSION_ACTION_EVENT, missionActionPlan, parseMissionAction } from "../src/components/spatial/dive/missionWorktreeAction";
import { MISSION_APPROVALS_EVENT, pendingToolApprovals } from "../src/components/spatial/dive/missionWorktreeApprovalsEntry";

/** Cutover contract: MISSION_ACTION_EVENT lands on the canonical Worktree selection (no second selection model), unknown targets fail safe, the tool-approval entry is the existing banner event,
 *  and no legacy Missions route remains. Pure fixtures, no stores, no DOM. */
const T = "2026-10-01T10:00:00.000Z";
const step = (id: string, kind: JobStep["kind"], over: Partial<JobStep> = {}): JobStep => ({ id, kind, label: id, activity: "a", status: "done", percent: 100, weight: 10, dependsOn: [], ...over });
function fixture(tools?: PendingApproval["status"][] | null): MissionWorktree {
  const steps = [step("brief", "brief"), step("plan", "plan", { dependsOn: ["brief"] }),
    step("dept:marketing", "department", { departmentId: "marketing", dependsOn: ["plan"] }), step("dept:sales-bd", "department", { departmentId: "sales-bd", dependsOn: ["plan"] }),
    step("final", "final", { dependsOn: ["dept:marketing", "dept:sales-bd"] })];
  const job: Job = { id: "job-act", title: "Action Mission", brief: "b", status: "done", percent: 100, verified: true, steps, createdAt: T, updatedAt: T, liveNotes: [], revisions: [], finalOutput: "# plan",
    planSnapshot: { title: "T", researchQuestions: [], assignments: [{ departmentId: "marketing", task: "m", activity: "a" }, { departmentId: "sales-bd", task: "s", activity: "a" }] } as unknown as Job["planSnapshot"] };
  const approvals = tools === null ? undefined : (tools ?? []).map((status, i): PendingApproval => ({ id: `ap${i}`, jobId: "job-act", jobTitle: "x", stepId: "dept:marketing", stepLabel: "m", toolName: "send_email", args: {}, status, createdAt: T }));
  return buildMissionWorktree({ job, approvals });
}
const apply = (wt: MissionWorktree, state: WorktreeSelection, plan: SelectionAction[] | null) => (plan ?? []).reduce((s, a) => reduceSelection(s, a, wt), state);
const wt = fixture();
const start = initialSelection(wt, "graph");
const dept = wt.departments[0];
const stepEntity = wt.steps.find(s => s.recordedId === "dept:sales-bd")!;
assert.ok(dept && wt.departments.length === 2, "fixture has two departments");

// 1. The event contract is unchanged and parsing never throws.
{
  assert.equal(MISSION_ACTION_EVENT, "growforge:mission-action");
  assert.deepEqual(parseMissionAction({ kind: "mission", reset: true }), { kind: "mission", reset: true });
  assert.deepEqual(parseMissionAction({ kind: "mission" }), { kind: "mission", reset: false });
  assert.deepEqual(parseMissionAction({ kind: "department", id: dept.canonicalId }), { kind: "department", id: dept.canonicalId });
  assert.deepEqual(parseMissionAction({ kind: "step", ordinal: 4 }), { kind: "step", ordinal: 4 });
  assert.deepEqual(parseMissionAction({ kind: "inspect", category: "Outputs" }), { kind: "inspect", category: "Outputs" });
  for (const bad of [null, undefined, 5, "x", [], {}, { kind: "step", ordinal: 1.5 }, { kind: "step", ordinal: "2" }, { kind: "department" }, { kind: "department", id: "" }, { kind: "inspect", category: 3 }, { kind: "other" }]) assert.equal(parseMissionAction(bad), null, JSON.stringify(bad));
}

// 2. Targets translate to the SAME canonical selection a click would make (entity ids, expansion, trail), via explicit id translation.
{
  const d = apply(wt, start, missionActionPlan({ kind: "department", id: dept.canonicalId }, wt, start));
  assert.equal(d.selectedId, dept.id); assert.equal(d.expandedDepartmentId, dept.id); assert.equal(d.peekOpen, true, "the same Peek a click opens");
  assert.deepEqual(d, reduceSelection(start, { type: "select", id: dept.id }, wt), "identical to the click path");
  const byEntityId = apply(wt, start, missionActionPlan({ kind: "department", id: dept.id }, wt, start));
  assert.equal(byEntityId.selectedId, dept.id, "a full Worktree department id is accepted too");
  const s = apply(wt, start, missionActionPlan({ kind: "step", ordinal: stepEntity.ordinal }, wt, start));
  assert.equal(s.selectedId, stepEntity.id); assert.equal(s.expandedDepartmentId, stepEntity.departmentId, "selecting a step reveals its department, like a click");
  assert.equal(stepEntity.ordinal, wt.steps.indexOf(stepEntity) + 1, "ordinal = 1-based recorded position");
}

// 3. mission / reset.
{
  const inDept = apply(wt, start, missionActionPlan({ kind: "department", id: dept.canonicalId }, wt, start));
  const keep = apply(wt, inDept, missionActionPlan({ kind: "mission" }, wt, inDept));
  assert.equal(keep.selectedId, wt.mission.id); assert.equal(keep.expandedDepartmentId, dept.id, "no reset: the department stays expanded");
  const reset = apply(wt, inDept, missionActionPlan({ kind: "mission", reset: true }, wt, inDept));
  assert.equal(reset.selectedId, wt.mission.id); assert.equal(reset.expandedDepartmentId, null, "reset collapses it");
}

// 4. inspect(category) opens the mission Workbench on the section that now holds that reading.
{
  const sectionFor = (category: string) => { const next = apply(wt, start, missionActionPlan({ kind: "inspect", category }, wt, start)); return next.depth === "workbench" && next.selectedId === wt.mission.id ? next.section : null; };
  assert.equal(sectionFor("Outputs"), "output"); assert.equal(sectionFor("Cost"), null, "no usage recorded in this fixture: the section is not offered, so the action fails safe");
  assert.equal(sectionFor("Approvals"), "approvals"); assert.equal(sectionFor("Tools"), "approvals"); assert.equal(sectionFor("Steps"), "execution"); assert.equal(sectionFor("Identity"), "overview");
  for (const category of ["History", "Dependencies", "Agents", "Evidence", "Quality", "Nonsense", "__proto__", "toString"]) assert.equal(missionActionPlan({ kind: "inspect", category }, wt, start), null, `${category}: no mission-level home -> rejected`);
  assert.equal(CATEGORY_SECTION.History, null, "History is deliberately not resurrected");
}

// 5. Unknown targets change nothing; Focus is left first so an external action is never swallowed by the inert background.
{
  assert.equal(missionActionPlan({ kind: "department", id: "no-such-department" }, wt, start), null);
  assert.equal(missionActionPlan({ kind: "step", ordinal: 99 }, wt, start), null);
  assert.equal(missionActionPlan({ kind: "step", ordinal: 0 }, wt, start), null);
  const inFocus: WorktreeSelection = { ...start, peekOpen: true, depth: "focus" };
  assert.deepEqual(missionActionPlan({ kind: "step", ordinal: stepEntity.ordinal }, wt, inFocus)?.[0], { type: "closeFocus" });
}

// 6. Tool approvals: the entry counts only PENDING requests of this mission, reports "unreadable" as null (never zero), and uses the existing banner event.
{
  assert.equal(MISSION_APPROVALS_EVENT, "growforge:mission-approvals");
  assert.equal(pendingToolApprovals(fixture(["pending", "approved", "pending", "rejected" as never])), 2);
  assert.equal(pendingToolApprovals(fixture([])), 0);
  assert.equal(pendingToolApprovals(fixture(null)), null, "unreadable is not zero");
}

// 7. One source of truth / no legacy route: the lens mounts only the Worktree; the old flag, fallback and presentation are gone; the legacy files do not exist.
{
  const dir = new URL("../src/components/spatial/dive/", import.meta.url);
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  const lens = strip(readFileSync(new URL("MissionLens.tsx", dir), "utf8")), worktreeLens = strip(readFileSync(new URL("MissionWorktreeLens.tsx", dir), "utf8"));
  assert.match(lens, /<MissionWorktreeLens missionId={selected.id}/); assert.doesNotMatch(lens, /<MissionWorktreeLens key=/, "C7E.6: the Lens is never remounted by a mission switch (the chassis stays mounted)"); assert.doesNotMatch(lens, /initialView/, "there is one view: no layout is chosen at open");
  assert.equal(/worktree["']?\)|searchParams|URLSearchParams|legacy|SelectedMission|MissionNucleus|NORA SCOPE/i.test(lens), false, "no preview flag, legacy fallback or old presentation in the lens");
  for (const gone of ["MissionNucleus.tsx", "MissionNucleusConcepts.tsx", "MissionDepartments.tsx", "MissionFlow.tsx", "MissionFocus.tsx", "MissionDeepInspection.tsx", "MissionActions.tsx", "missionAction.ts", "useMissionLayout.ts", "useMissionJob.ts", "missionNoraContext.ts", "missionFocusModel.ts"]) assert.equal(existsSync(new URL(gone, dir)), false, `${gone} is gone`);
  assert.match(worktreeLens, /addEventListener\(MISSION_ACTION_EVENT/, "the action event is heard where the canonical selection lives");
  assert.equal(/setExpanded|setSelection|useState<.*FocusSelection/.test(worktreeLens), false, "no second selection state");
  const diveCss = readFileSync(new URL("DiveOverview.module.css", dir), "utf8"), controlsCss = readFileSync(new URL("MissionControls.module.css", dir), "utf8");
  assert.equal(/:has\(\[data-worktree\]\)/.test(diveCss), false, "the Worktree is not a conditional preview any more");
  assert.match(controlsCss, /@media\(max-width:1179px\)\{\s*\.root\{position:fixed;top:82px/, "Mission controls is reachable below 1180 (identity row)");
  assert.equal(/display:none/.test(controlsCss), false, "no width hides Mission controls");
  assert.equal(/missionControls|controlSurface|inspectionAction|missionHistory|historyTimeline/.test(diveCss), false, "no legacy Mission controls rules left in the shared module");
}

console.log("test-dive-mission-worktree-actions: all cutover action / approvals-entry / single-route contract checks passed");
