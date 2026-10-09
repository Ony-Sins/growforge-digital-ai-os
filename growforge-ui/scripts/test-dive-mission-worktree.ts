import assert from "node:assert/strict";
import type { Job, JobStep } from "../src/lib/jobStore";
import type { PendingApproval } from "../src/lib/approvalStore";
import type { PendingConsultation } from "../src/lib/consultationStore";
import { buildMissionWorktree, parseResearchFindings, parseReviewOutput, worktreeQueries, CANONICAL_PHASE_ORDER, type WorktreeInput } from "../src/components/spatial/dive/missionWorktree";

/** W1 contract tests for the read-only MissionWorktree adapter. Pure fixtures: no stores read or written. */
const T = "2026-10-01T10:00:00.000Z";
const call = (model = "gemini-2.5-flash") => ({ provider: "gemini", model, inputTokens: 1000, outputTokens: 500, durationMs: 1200, timestamp: T });
const step = (id: string, kind: JobStep["kind"], over: Partial<JobStep> = {}): JobStep => ({ id, kind, label: id, activity: "", status: "done", percent: 100, weight: 10, dependsOn: [], ...over });
const job = (id: string, steps: JobStep[], over: Partial<Job> = {}): Job => ({ id, title: "T", brief: "B", status: "done", percent: 100, verified: true, steps, createdAt: T, updatedAt: T, liveNotes: [], revisions: [], ...over });
const sources = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `Source ${i + 1}`, uri: `https://example.com/${i + 1}` }));
const research = (n: number) => `### Finding 1: Market size?\nBig market [1] and growing [2].\nSources: [1] [2]\n\n### Finding 2: Competitors?\nThree main rivals.\nSources: none returned — treat as unverified`.concat(n > 2 ? `\n\n### Finding 3: Pricing?\nRange known [${n}].\nSources: [${n}]` : "");
const full = (over: { dept?: string[]; sourceCount?: number } = {}) => {
  const depts = over.dept ?? ["sales-bd", "marketing"];
  return job("job-full", [
    step("brief", "brief", { output: "The brief" }),
    step("plan", "plan", { dependsOn: ["brief"], provider: "ollama", usage: [call()], output: "### Departments assigned\n- x" }),
    step("research", "research", { dependsOn: ["plan"], output: research(over.sourceCount ?? 3), sources: sources(over.sourceCount ?? 3), startedAt: T, finishedAt: T }),
    ...depts.map(d => step(`dept:${d}`, "department", { departmentId: d, dependsOn: ["research"], provider: "ollama", usage: [call()], output: `${d} draft`, startedAt: T, finishedAt: T })),
    step("reconcile", "reconcile", { dependsOn: depts.map(d => `dept:${d}`), provider: "ollama", usage: [call("some-unpriced-model")], output: "### Conflicts\nA vs B\n### Dependencies\nA needs B\n### Gaps\nNone\n### Agreed direction\n- go" }),
    step("qa", "qa", { dependsOn: ["reconcile"], provider: "ollama", usage: [call()], output: "**Verdict:** PASS WITH FIXES\n### Unsupported claims\nx\n### Contradictions\ny\n### Missing essentials\nz\n### Required fixes\n1. fix" }),
    step("final", "final", { dependsOn: ["qa"], output: "final" }),
  ], {
    finalOutput: "# Final plan", dossierSnapshot: { text: "d", sources: sources(over.sourceCount ?? 3), verified: true },
    planSnapshot: { title: "T", researchQuestions: ["Market size?", "Competitors?"], assignments: depts.map(d => ({ departmentId: d, task: `${d} task`, activity: "act", ...(d === "marketing" ? { vaultRecommendation: { selectedAgentName: "Ad Specialist", selectedAgentCategory: "paid", band: "direct", confidence: 0.9 } as never } : {}) })) },
  });
};
const build = (j: Job, extra: Partial<WorktreeInput> = {}) => buildMissionWorktree({ job: j, ...extra });

// 1. A normal completed mission: ids, ownership, the seven phases in canonical order, department fan-out, outputs.
{
  const wt = build(full());
  assert.equal(wt.missionId, "job-full");
  assert.equal(wt.mission.id, "mission:job-full");
  assert.deepEqual(wt.canonicalPhaseOrder, ["client-brief", "planning", "live-research", "departments", "team-review", "qa", "final-plan"]);
  assert.deepEqual(wt.phases.map(p => p.key), [...CANONICAL_PHASE_ORDER], "all seven are recorded, in canonical order");
  assert.deepEqual(wt.phases.map(p => p.order), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(wt.missingPhaseKeys, []);
  assert.equal(wt.steps.length, 8);
  assert.equal(wt.steps[0].id, "step:job-full/brief", "step identity is the recorded step id");
  assert.equal(wt.mission.status, "done");
  assert.ok(wt.mission.finalOutputId && wt.outputs.find(o => o.id === wt.mission.finalOutputId)?.text === "# Final plan");
  assert.deepEqual(build(full()), wt, "rebuilding gives identical entities and ids (stable)");
  const q = worktreeQueries(wt);
  assert.ok([wt.mission, ...wt.phases, ...wt.departments, ...wt.steps, ...wt.outputs, ...wt.sources, ...wt.usage].every(e => q.ownerOf(e.id) === "mission:job-full"), "every entity answers which Mission owns it");
  assert.equal(q.phaseOf("step:job-full/qa")?.key, "qa");
  assert.equal(q.departmentOf("step:job-full/dept:marketing")?.name.length ? "ok" : "none", "ok");
}

// 2. Blocked / error mission: recorded error stays on the step and mission; nothing is smoothed over.
{
  const j = full();
  j.status = "error"; j.error = "Department execution failed: Marketing";
  j.steps.find(s => s.id === "dept:marketing")!.status = "error";
  j.steps.find(s => s.id === "dept:marketing")!.error = "429 quota";
  const wt = build(j);
  assert.equal(wt.mission.status, "error");
  assert.equal(wt.mission.error, "Department execution failed: Marketing");
  assert.equal(wt.steps.find(s => s.recordedId === "dept:marketing")!.error, "429 quota");
  const departments = wt.phases.find(p => p.key === "departments")!;
  assert.equal(departments.status, "error");
  assert.deepEqual(departments.statusCounts, { done: 1, error: 1 });
  assert.equal(departments.recordedPercent, undefined, "a multi-step phase has no percent of its own");
  assert.equal("recordedPercent" in departments, false);
}

// 3. Recorded-running but executor-unconfirmed: recorded status and live evidence are separate, and never merged per step.
{
  const j = full();
  j.status = "running";
  j.steps.find(s => s.id === "reconcile")!.status = "active";
  const unconfirmed = build(j, { executor: { confirmable: true, missionIds: [] } });
  assert.equal(unconfirmed.mission.execution.recordedStatus, "running");
  assert.equal(unconfirmed.mission.execution.liveEvidence, "unconfirmed");
  assert.equal(unconfirmed.mission.execution.liveConfirmed, false);
  assert.deepEqual(unconfirmed.mission.execution.recordedActiveStepIds, ["step:job-full/reconcile"]);
  assert.equal(build(j, { executor: { confirmable: true, missionIds: ["job-full"] } }).mission.execution.liveEvidence, "confirmed");
  assert.equal(build(j, { executor: { confirmable: false, missionIds: ["job-full"] } }).mission.execution.liveEvidence, "unverifiable", "an unreadable executor never confirms");
  assert.equal(build(j).mission.execution.liveEvidence, "unverifiable", "no executor facts -> unverifiable");
  const confirmed = build(j, { executor: { confirmable: true, missionIds: ["job-full"] } });
  const active = confirmed.steps.find(s => s.recordedId === "reconcile")!;
  assert.equal(active.execution.recordedActive, true);
  assert.equal(active.execution.executorEvidence.available, false, "Mission-level confirmation is NOT extended to a step");
  assert.match(active.execution.executorEvidence.reason, /not recorded/i);
  assert.equal(build(full(), { executor: { confirmable: true, missionIds: ["job-full"] } }).mission.execution.liveEvidence, "not-applicable", "a finished mission has no live claim");
}

// 4. Department fan-out: parallel Departments phase, truthful feeds, departments derived and mission-scoped.
{
  const wt = build(full({ dept: ["sales-bd", "marketing", "finance-ops"] }));
  const phase = wt.phases.find(p => p.key === "departments")!;
  assert.equal(phase.stepIds.length, 3);
  assert.equal(phase.parallel?.state, "parallel");
  assert.deepEqual(phase.dependsOnPhaseIds, ["phase:job-full/live-research"]);
  const q = worktreeQueries(wt);
  assert.deepEqual(q.feeds("team-review").map(s => s.recordedId), ["dept:sales-bd", "dept:marketing", "dept:finance-ops"], "Team Review is fed by every department step");
  assert.deepEqual(q.feeds("qa").map(s => s.recordedId), ["reconcile"]);
  assert.deepEqual(q.feeds("final-plan").map(s => s.recordedId), ["qa"], "what precedes Final Plan");
  assert.deepEqual(q.feeds("departments").map(s => s.recordedId), ["research"]);
  assert.deepEqual(q.consumers("live-research").map(s => s.recordedId), ["dept:sales-bd", "dept:marketing", "dept:finance-ops"]);
  assert.deepEqual(q.dependents("step:job-full/dept:marketing").map(s => s.recordedId), ["reconcile"]);
  assert.deepEqual(q.prerequisites("step:job-full/reconcile").map(s => s.recordedId), ["dept:sales-bd", "dept:marketing", "dept:finance-ops"]);
  assert.equal(wt.departments.length, 3);
  const marketing = wt.departments.find(d => d.canonicalId === "marketing" || d.name.length)!;
  assert.ok(marketing.id.startsWith("department:job-full/"));
  assert.deepEqual(wt.relations.filter(r => r.kind === "department-membership").length, 3);
  assert.ok(wt.relations.filter(r => r.kind === "dependency").every(r => r.reference), "dependency relations keep the recorded reference");
  // Containment is not dependency: a department does not "parent" a dependency.
  assert.ok(!wt.relations.some(r => r.kind === "ownership" && r.to.startsWith("department:") && r.from.startsWith("step:")));
  // A specialist recommendation is a recommendation, with no execution claim attached.
  const rec = wt.departments.find(d => d.specialistRecommendation)!;
  assert.equal(rec.specialistRecommendation?.name, "Ad Specialist");
  assert.match(rec.provenance.specialistRecommendation.note ?? "", /not proof/i);
  // A single department is "single", not claimed parallel.
  assert.equal(build(full({ dept: ["sales-bd"] })).phases.find(p => p.key === "departments")!.parallel?.state, "single");
  // Reused taxonomy ids across missions cannot collide.
  const other = buildMissionWorktree({ job: { ...full(), id: "job-other" } });
  const shared = wt.departments.map(d => d.id).filter(id => other.departments.some(o => o.id === id));
  assert.deepEqual(shared, [], "department identity is scoped to its mission");
}

// 5. Live Research with many sources: nothing is truncated to six; markers are text-parsed, mapping is explicitly unavailable.
{
  const wt = build(full({ sourceCount: 24 }));
  assert.equal(wt.sources.length, 24, "all sources, not the UI's 6-source subset");
  const step = wt.steps.find(s => s.kind === "research")!;
  assert.equal(step.research!.sourceIds.length, 24);
  assert.deepEqual(wt.sources.slice(0, 2).map(s => [s.index, s.title, s.uri]), [[1, "Source 1", "https://example.com/1"], [2, "Source 2", "https://example.com/2"]]);
  assert.equal(wt.sources[23].index, 24);
  assert.deepEqual(step.research!.questions, ["Market size?", "Competitors?"]);
  assert.equal(step.research!.findings.length, 3);
  assert.deepEqual(step.research!.findings[0].markers, [1, 2]);
  assert.equal(step.research!.findings[1].sourcesNone, true);
  assert.deepEqual(step.research!.citationMarkers, [1, 2, 24]);
  assert.deepEqual(step.research!.unresolvedMarkers, []);
  assert.deepEqual(wt.sources[0].citedInFindings, [1]);
  assert.equal(step.research!.verified, true);
  assert.equal(step.research!.claimSourceMapping.available, false, "no structured claim->source mapping is claimed");
  assert.equal(step.research!.provenance.findings.label, "Parsed from text");
  assert.equal(step.research!.provenance.questions.label, "Recorded");
  assert.equal(wt.outputs.find(o => o.id === step.outputId)!.text.startsWith("### Finding 1"), true, "the raw markdown stays available");
  // Markers pointing past the recorded list are reported, not repaired.
  assert.deepEqual(build(full({ sourceCount: 3 })).steps.find(s => s.kind === "research")!.research!.unresolvedMarkers, []);
  const short = full(); short.dossierSnapshot = { text: "d", sources: sources(1), verified: true };
  assert.deepEqual(build(short).steps.find(s => s.kind === "research")!.research!.unresolvedMarkers, [2, 3]);
  // No sources: a distinct recorded state, not an empty success.
  const none = full(); none.dossierSnapshot = { text: "d", sources: [], verified: false }; none.steps.find(s => s.kind === "research")!.sources = []; none.steps.find(s => s.kind === "research")!.status = "error"; none.steps.find(s => s.kind === "research")!.error = "No search-grounded sources were returned.";
  const noSources = build(none).steps.find(s => s.kind === "research")!;
  assert.equal(noSources.research!.noSources, true);
  assert.equal(noSources.research!.verified, false);
  assert.equal(noSources.error, "No search-grounded sources were returned.");
  // Sources fall back to the research step's own list when there is no dossier (a job after a partial rerun).
  const noDossier = full(); delete noDossier.dossierSnapshot;
  assert.equal(build(noDossier).sources.length, 3);
  assert.equal(build(noDossier).sources[0].origin, "research-step");
  // Parsing helper edge cases.
  assert.deepEqual(parseResearchFindings("no headings here"), []);
}

// 6. Team Review / QA markdown: parsed view marked as parsed; raw output preserved; verdict parsed, not typed.
{
  const wt = build(full());
  const review = wt.steps.find(s => s.kind === "reconcile")!;
  assert.deepEqual(review.review!.sections.map(s => s.key), ["conflicts", "dependencies", "gaps", "agreed-direction"]);
  assert.equal(review.review!.sections.every(s => s.recognized), true);
  assert.equal(review.review!.sections[3].text, "- go");
  assert.equal(review.review!.provenance.sections.label, "Parsed from text");
  assert.equal(wt.outputs.find(o => o.id === review.outputId)!.text.includes("### Conflicts\nA vs B"), true, "raw markdown preserved");
  const qa = wt.steps.find(s => s.kind === "qa")!;
  assert.equal(qa.review!.verdict, "PASS WITH FIXES");
  assert.deepEqual(qa.review!.sections.map(s => s.key), ["unsupported-claims", "contradictions", "missing-essentials", "required-fixes"]);
  assert.equal(parseReviewOutput("qa", "**Verdict:** NEEDS WORK\n").verdict, "NEEDS WORK");
  assert.equal(parseReviewOutput("qa", "**Verdict:** PASS\n").verdict, "PASS");
  assert.equal(parseReviewOutput("qa", "no verdict line").verdict, undefined, "no verdict is invented");
  const odd = parseReviewOutput("reconcile", "### Conflicts\na\n### Something else\nb");
  assert.deepEqual(odd.sections.map(s => [s.heading, s.recognized]), [["Conflicts", true], ["Something else", false]], "unrecognized headings are kept, flagged");
  assert.deepEqual(parseReviewOutput("reconcile", "plain text, no headings").sections, [], "no sections are fabricated from unstructured text");
  const pending = full(); pending.steps.find(s => s.id === "reconcile")!.output = undefined;
  assert.equal(build(pending).steps.find(s => s.kind === "reconcile")!.review, undefined, "no output -> no parsed view");
}

// 7. Unresolved / ambiguous dependencies are reported, never guessed.
{
  const j = job("job-dup", [
    step("research", "research"),
    step("dept:sales-bd", "department", { departmentId: "sales-bd", dependsOn: ["research"] }),
    step("dept:sales-bd", "department", { departmentId: "sales-bd", dependsOn: ["research"] }),
    step("reconcile", "reconcile", { dependsOn: ["dept:sales-bd", "ghost", "reconcile"] }),
  ]);
  const wt = build(j);
  assert.deepEqual(wt.steps.map(s => [s.id, s.idUnique]), [["step:job-dup/research", true], ["step:job-dup/dept:sales-bd#2", false], ["step:job-dup/dept:sales-bd#3", false], ["step:job-dup/reconcile", true]], "duplicate recorded ids get position-qualified entity ids and say so");
  const reconcile = wt.steps[3];
  assert.deepEqual(reconcile.dependencies.prerequisiteIds, [], "nothing is resolved by guessing");
  assert.deepEqual(reconcile.dependencies.issues.map(i => [i.kind, i.reference]).sort(), [["ambiguous", "dept:sales-bd"], ["self-reference", "reconcile"], ["unresolved", "ghost"]]);
  assert.deepEqual(reconcile.dependencies.issues.find(i => i.kind === "ambiguous")!.candidateStepIds, ["step:job-dup/dept:sales-bd#2", "step:job-dup/dept:sales-bd#3"]);
  assert.deepEqual(wt.steps[1].dependencies.prerequisiteIds, ["step:job-dup/research"], "the unique reference still resolves");
  // Approvals naming a non-unique id are not attributed to either step.
  const approval: PendingApproval = { id: "a1", jobId: "job-dup", jobTitle: "T", stepId: "dept:sales-bd", stepLabel: "S", toolName: "send", args: {}, status: "pending", createdAt: T };
  const unique: PendingApproval = { ...approval, id: "a2", stepId: "research" };
  const wta = build(j, { approvals: [approval, unique, { ...approval, id: "a3", jobId: "someone-else" }] });
  assert.equal(wta.approvals!.length, 2, "only this mission's approvals");
  assert.equal(wta.approvals!.find(a => a.approvalId === "a1")!.stepId, undefined);
  assert.equal(wta.approvals!.find(a => a.approvalId === "a1")!.provenance.stepId.label, "Not recorded");
  assert.equal(wta.approvals!.find(a => a.approvalId === "a2")!.stepId, "step:job-dup/research");
  assert.deepEqual(wta.steps[0].approvalIds, ["approval:job-dup/a2"]);
  // Unreadable lists are undefined (no claim), not empty.
  assert.equal(build(j).approvals, undefined);
  assert.equal(build(j, { approvals: null, consultations: null }).consultations, undefined);
  assert.deepEqual(build(j, { approvals: [], consultations: [] }).approvals, []);
  const ask: PendingConsultation = { id: "c1", jobId: "job-dup", jobTitle: "T", stepId: "research", stepLabel: "R", question: "Which?", status: "pending", createdAt: T };
  assert.equal(build(j, { consultations: [ask] }).consultations![0].stepId, "step:job-dup/research");
}

// 8. Rerun lineage and requested changes; revision HISTORY and an event timeline are explicitly not recorded.
{
  const j = full();
  j.rerunOf = "job-original"; j.instructionReplayMode = "original"; j.liveNotes = ["make it shorter"];
  j.revisions = [{ id: "r1", message: "cut the budget", createdAt: T, effect: "reran", redoneSteps: ["dept:marketing"] }];
  const wt = build(j);
  assert.deepEqual(wt.mission.lineage, { rerunOf: "job-original", replayMode: "original" });
  assert.deepEqual(wt.mission.requestedChanges, [{ id: "r1", message: "cut the budget", createdAt: T, effect: "reran", redoneSteps: ["dept:marketing"] }]);
  assert.deepEqual(wt.mission.liveNotes, ["make it shorter"]);
  assert.equal(wt.mission.history.revisionHistory.available, false);
  assert.equal(wt.mission.history.revisionHistory.provenance.label, "Not recorded");
  assert.equal(wt.mission.history.eventTimeline.available, false);
  assert.equal(wt.mission.provenance.requestedChanges.label, "Recorded");
  assert.equal(build(full()).mission.lineage.rerunOf, undefined);
  assert.equal("rerunOf" in build(full()).mission.lineage, false);
  assert.ok(!(wt.relations.some(r => (r.kind as string) === "revision")) && !("revisions" in wt), "no revision entity exists");
}

// 9. Missing provider / usage: undefined plus provenance, never zero or an empty default; estimate is not billed cost.
{
  const wt = build(full());
  const brief = wt.steps.find(s => s.kind === "brief")!;
  assert.equal(brief.provider, undefined);
  assert.equal("provider" in brief, false);
  assert.equal(brief.provenance.provider.label, "Not recorded");
  assert.equal(brief.usageTotals, undefined);
  assert.deepEqual(brief.usageIds, []);
  assert.equal(brief.provenance.usage.label, "Not recorded");
  assert.equal(brief.startedAt, undefined);
  assert.equal(brief.provenance.timestamps.label, "Not recorded");
  const researchStep = wt.steps.find(s => s.kind === "research")!;
  assert.equal(researchStep.provider, undefined, "research records no provider here and none is invented");
  assert.equal(researchStep.usageTotals, undefined);
  const planned = wt.steps.find(s => s.kind === "plan")!;
  assert.equal(planned.provider, "ollama");
  assert.equal(planned.usageTotals?.calls, 1);
  const priced = wt.usage.find(u => u.stepId === planned.id)!;
  assert.equal(priced.estimate.basis, "static-price-table");
  assert.ok(priced.estimate.usd !== null && priced.estimate.usd > 0);
  assert.equal(priced.billedCost.available, false, "billed cost stays unavailable");
  const unpriced = wt.usage.find(u => u.model === "some-unpriced-model")!;
  assert.equal(unpriced.estimate.usd, null);
  assert.equal(unpriced.estimate.priced, false);
  assert.equal(wt.mission.usage!.estimateComplete, false);
  assert.equal(wt.mission.usage!.estimatedCostUsd, null, "one unpriced call makes the total unknown, not partial-as-total");
  assert.equal(wt.mission.billedCost.available, false);
  const nullTokens = full(); nullTokens.steps[1].usage = [{ ...call(), inputTokens: null }];
  assert.equal(build(nullTokens).steps[1].usageTotals!.reportedTokens.complete, false);
  assert.equal(wt.usage.every(u => u.provenance.tokens.label === "Recorded"), true);
  assert.equal(wt.mission.provenance.usage.class, "B");
}

// 10. Legacy fixture with a missing canonical phase: absent means not recorded, never waiting / complete / 0%.
{
  const legacy = job("job-legacy", [step("plan", "plan"), step("final", "final", { dependsOn: ["plan"] }), step("weird", "legacy-kind" as never)], { planSnapshot: undefined, dossierSnapshot: undefined });
  const wt = build(legacy);
  assert.deepEqual(wt.phases.map(p => p.key), ["planning", "final-plan"]);
  assert.deepEqual(wt.missingPhaseKeys, ["client-brief", "live-research", "departments", "team-review", "qa"]);
  assert.ok(wt.phases.every(p => p.status === "done"));
  assert.ok(!wt.phases.some(p => p.key === "departments"), "no Departments phase is fabricated");
  assert.deepEqual(wt.departments, []);
  assert.deepEqual(wt.mission.unphasedStepIds, ["step:job-legacy/weird"], "an unknown kind belongs to no canonical phase");
  assert.equal(wt.steps[2].phaseId, undefined);
  assert.equal(wt.steps[0].dependencies.prerequisiteIds.length, 0);
  assert.equal(worktreeQueries(wt).feeds("final-plan")[0].recordedId, "plan");
  assert.deepEqual(worktreeQueries(wt).feeds("team-review"), [], "a missing phase has no feeds, not an empty fake");
  // Research questions are undefined without a plan snapshot, with the reason in provenance.
  const noPlan = full(); delete noPlan.planSnapshot;
  const r = build(noPlan).steps.find(s => s.kind === "research")!.research!;
  assert.equal(r.questions, undefined);
  assert.equal(r.provenance.questions.label, "Not recorded");
  assert.equal(build(noPlan).departments.length, 2, "departments still derive from the recorded department steps");
  assert.equal(build(noPlan).departments[0].origin.assignment, false);
  assert.deepEqual(build(noPlan).departments[0].assignments, []);
  assert.equal(build(noPlan).departments[0].specialistRecommendation, undefined);
}

console.log("mission worktree checks passed; pure fixtures, no stores read or written.");
