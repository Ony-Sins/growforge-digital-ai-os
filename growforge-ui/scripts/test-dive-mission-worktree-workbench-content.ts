import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Job, JobStep } from "../src/lib/jobStore";
import type { PendingApproval } from "../src/lib/approvalStore";
import type { PendingConsultation } from "../src/lib/consultationStore";
import { departmentDisplayName } from "../src/lib/departmentTaxonomy";
import { buildMissionWorktree, type MissionWorktree } from "../src/components/spatial/dive/missionWorktree";
import { ambiguityId } from "../src/components/spatial/dive/missionWorktreeAncestry";
import { initialSelection, reduceSelection, type SelectionAction, type WorktreeSelection } from "../src/components/spatial/dive/missionWorktreeSelection";
import { workbenchCapabilities } from "../src/components/spatial/dive/missionWorkbench";
import { estimateText, workbenchContentOf, type Block, type WorkbenchContent } from "../src/components/spatial/dive/missionWorkbenchContent";

/** W5.3A contract: real Workbench content for Mission / Department / Step from the W1 model. Pure model (no React). */
const T = "2026-10-01T10:00:00.000Z", T2 = "2026-10-01T10:02:30.000Z";
const JOB = "job-w53";
const step = (id: string, kind: JobStep["kind"], over: Partial<JobStep> = {}): JobStep => ({ id, kind, label: id, activity: "latest activity", status: "done", percent: 100, weight: 10, dependsOn: [], ...over });
const DEPTS = ["sales-bd", "marketing", "finance-ops"];
const OUTPUT = "# Heading\n\nA **bold** line with `code`.\n\n- first\n- second\n\n1. one\n2. two\n\n```\nraw block\n```";
interface Opts { running?: boolean; executor?: "confirmed" | "unconfirmed"; dupMarketing?: boolean; approvals?: boolean; extras?: boolean }
function fixture(o: Opts = {}): MissionWorktree {
  const steps: JobStep[] = [];
  steps.push(step("brief", "brief", { output: "The brief" }), step("plan", "plan", { dependsOn: ["brief"], provider: "ollama" }));
  steps.push(step("research", "research", { dependsOn: ["plan"], output: "### Finding 1: Q?\nAnswer [1].\nSources: [1]", sources: [{ title: "S1", uri: "https://e.com/1" }] }));
  DEPTS.forEach((d, i) => {
    const copies = o.dupMarketing && d === "marketing" ? 2 : 1;
    for (let k = 0; k < copies; k++) steps.push(step(`dept:${d}`, "department", { departmentId: d, dependsOn: ["research"], label: departmentDisplayName(d), provider: "ollama", output: OUTPUT, status: o.running && i === 0 ? "active" : "done",
      ...(i === 0 ? { usage: [{ provider: "ollama", model: "qwen2.5:7b-instruct", inputTokens: 100, outputTokens: 50, durationMs: 1200, timestamp: T }, { provider: "gemini", model: "gemini-2.5-flash", inputTokens: 2000, outputTokens: 800, durationMs: 3400, timestamp: T2 }, { provider: "ollama", model: "llama3", inputTokens: 10, outputTokens: 5, durationMs: 500, timestamp: T2 }] } : {}),
      ...(i === 2 ? { status: "error" as const, error: "429 quota exceeded for provider sk-abcdefghijklmnop123456" } : {}) }));
  });
  steps.push(step("reconcile", "reconcile", { dependsOn: DEPTS.map(d => `dept:${d}`), output: "### Conflicts\nx\n### Agreed direction\n- y" }), step("qa", "qa", { dependsOn: ["reconcile"], output: "notes" }), step("final", "final", { dependsOn: o.dupMarketing ? ["qa", "dept:marketing"] : ["qa"] }));
  const job: Job = { id: JOB, title: "Apex Mission", brief: "Launch the thing.\nGoals: many.", status: o.running ? "running" : "done", percent: 60, verified: true, steps, createdAt: T, updatedAt: T2, liveNotes: o.extras ? ["a bare note"] : [],
    revisions: o.extras ? [{ id: "rev1", message: "Please change the tone", createdAt: T2, effect: "queued" }] as never : [], ...(o.extras ? { rerunOf: "job-original", instructionReplayMode: "exact" } as never : {}), finalOutput: o.extras ? "# Final\n\nDone." : undefined,
    planSnapshot: { title: "T", researchQuestions: ["Q?"], assignments: DEPTS.map(d => ({ departmentId: d, task: `${d} assignment text`, activity: "act", ...(d === "marketing" ? { vaultRecommendation: { selectedAgentName: "Ad Specialist", selectedAgentCategory: "paid", band: "direct", confidence: 0.9 } as never } : {}) })) } };
  const approvals: PendingApproval[] | undefined = o.approvals ? [
    { id: "ap1", jobId: JOB, jobTitle: "x", stepId: "dept:sales-bd", stepLabel: "Sales", toolName: "send_email", args: { to: "a@b.c", nested: { x: 1 }, list: [1, 2] }, status: "pending", createdAt: T },
    { id: "ap2", jobId: JOB, jobTitle: "x", stepId: "dept:marketing", stepLabel: "Marketing (dup id)", toolName: "post_ad", args: {}, status: "approved", createdAt: T, decidedAt: T2, decidedBy: "owner" },
  ] : undefined;
  const consultations: PendingConsultation[] | undefined = o.approvals ? [{ id: "co1", jobId: JOB, jobTitle: "x", stepId: "dept:marketing", stepLabel: "Marketing (dup id)", question: "Which budget?", options: ["a", "b"], status: "answered", answer: "a", createdAt: T }] as never : undefined;
  return buildMissionWorktree({ job, approvals, consultations, executor: o.executor ? { confirmable: true, missionIds: o.executor === "confirmed" ? [JOB] : [] } : undefined });
}
const run = (wt: MissionWorktree, state: WorktreeSelection, ...actions: SelectionAction[]) => actions.reduce((s, a) => reduceSelection(s, a, wt), state);
const phaseId = (wt: MissionWorktree, key: string) => wt.phases.find(p => p.key === key)!.id;
const textOf = (blocks: Block[]): string => blocks.map(b => b.kind === "facts" ? b.facts.map(f => `${f.label}: ${f.value}`).join("\n") : b.kind === "group" ? `${b.title}\n${b.note ?? ""}\n${textOf(b.blocks)}` : b.kind === "relations" ? b.items.map(i => `${i.label} ${i.detail ?? ""}`).join("\n")
  : b.kind === "text" ? `${b.title ?? ""}\n${b.text}` : b.kind === "usage" ? b.rows.map(r => `${r.title} ${r.meta} ${r.estimate}`).join("\n") : b.kind === "record" ? `${b.title} ${b.subtitle ?? ""} ${b.body ?? ""}\n${textOf([{ kind: "facts", facts: b.facts }])}` : b.kind === "steps" ? b.rows.map(r => `${r.label} ${r.type} ${r.status}`).join("\n")
  : b.kind === "inquiry" ? b.rows.map(r => `${r.mark} ${r.text}`).join("\n") : b.kind === "findings" ? b.rows.map(r => `${r.mark} ${r.heading} ${r.text}`).join("\n") : b.kind === "sources" ? b.rows.map(r => `${r.mark} ${r.title} ${r.uri}`).join("\n")
  : b.kind === "review" ? b.rows.map(r => `${r.mark} ${r.heading} ${r.text}`).join(String.fromCharCode(10))
  : b.kind === "analytics" ? [...(b.part === "overview" ? [`Completion: ${b.analytics.headline.text}`] : []), ...b.analytics.groups.filter(g => ({ overview: ["Decisions"], execution: ["Progress", "State", "Time", "Structure"], usage: ["Usage"] } as Record<string, string[]>)[b.part].includes(g.title)).flatMap(g => g.metrics.map(m => `${m.label}: ${m.value}`))].join(String.fromCharCode(10)) : b.kind === "timeline" ? b.timeline.rows.map(r => `${r.label} ${r.start}-${r.end}`).join(String.fromCharCode(10)) : b.kind === "depmap" ? `needs ${b.needs} waits ${b.waits} unresolved ${b.unresolved}` : b.kind === "usageBreakdown" ? bdText(b.breakdown) : b.kind === "empty" ? b.text : b.kind === "unavailable" ? `${b.label} ${b.reason}` : b.text).join("\n");
import { breakdownCostText as __bdc, type UsageBreakdown as __UB } from "../src/components/spatial/dive/missionAnalytics";
const bdText = (b: __UB): string => [`Billed cost: ${b.billed}`, `Total: ${b.total.calls} calls · in ${b.total.inputTokens} · out ${b.total.outputTokens} · estimate ${__bdc(b.total.cost)} · ${b.total.cost.state}`, ...b.contributors.map(c => `${c.key}: ${c.calls} calls · in ${c.inputTokens} · out ${c.outputTokens} · estimate ${__bdc(c.cost)} · ${c.cost.state}`)].join("\n");
const all = (c: WorkbenchContent | null) => (c ? textOf(c.blocks) : "");
const relationTargets = (blocks: Block[]): string[] => blocks.flatMap(b => b.kind === "relations" ? b.items.flatMap(i => (i.target ? [i.target] : [])) : b.kind === "group" ? relationTargets(b.blocks) : []);

// 1. No placeholder remains for Mission / Department / Step; every VISIBLE section has content; sections not in the registry have none; uncovered profiles keep their placeholder.
{
  const wt = fixture({ approvals: true, extras: true });
  let checked = 0;
  for (const id of [wt.mission.id, ...wt.departments.map(d => d.id), ...wt.steps.map(s => s.id), phaseId(wt, "planning"), phaseId(wt, "final-plan"), phaseId(wt, "client-brief")]) {
    const set = workbenchCapabilities(wt, id)!;
    for (const section of set.sections.map(s => s.id)) {
      const c = workbenchContentOf(wt, id, section);
      assert.ok(c, `content for ${set.profile} ${id} / ${section}`);
      assert.equal(/content arrives in W5\.3/i.test(all(c)), false, "no placeholder text");
      assert.ok(c!.blocks.length > 0);
      checked++;
    }
    for (const c of set.capabilities.filter(x => !x.visible)) assert.equal(workbenchContentOf(wt, id, c.id), null, `${c.id} is not visible for ${id}, so it has no content`);
    assert.equal(workbenchContentOf(wt, id, "sources"), null, "a section the profile does not have yields nothing");
  }
  assert.ok(checked > 40);
  assert.equal(workbenchContentOf(wt, "ghost", "overview"), null);
  const src = readFileSync(new URL("../src/components/spatial/dive/MissionWorkbenchPlane.tsx", import.meta.url), "utf8");
  assert.match(src, /content arrives in W5\.3/, "the placeholder remains ONLY as the fallback for uncovered sections");
  assert.match(src, /content\s*\?\s*<WorkbenchReading/, "real content replaces the placeholder when it exists");
}

// 2. Mission content: truthful, quiet, no invented history.
{
  const wt = fixture({ approvals: true, extras: true });
  const over = all(workbenchContentOf(wt, wt.mission.id, "overview"));
  const execAll = all(workbenchContentOf(wt, wt.mission.id, "execution"));
  // C7F: the Overview is a summary; the recorded state and the executor facts live in Execution (nothing dropped).
  assert.match(execAll, /Recorded: Done/); assert.match(execAll, /Executor: Not applicable/); assert.equal(/Executor:/.test(over), false, "the executor fact is not repeated in the Overview"); assert.match(over, /Phases: 7 of 7 recorded/); assert.match(over, /Departments: 3/); assert.match(over, /Attention: 1 step in error/); assert.match(over, /Launch the thing\./);
  assert.equal(over.includes("sk-abcdefghijklmnop123456"), false, "recorded errors are sanitised");
  const exec = all(workbenchContentOf(wt, wt.mission.id, "execution"));
  for (const sec of ["execution", "lineage", "overview"] as const) assert.equal(/history|timeline|revision/i.test(all(workbenchContentOf(wt, wt.mission.id, sec)).replace(/Requested change/gi, "")), false, `History is not rendered in Mission ${sec}`);
  assert.equal(wt.mission.history.eventTimeline.available, false); assert.equal(wt.mission.history.revisionHistory.available, false); assert.equal(workbenchCapabilities(wt, wt.mission.id)!.capabilities.find(c => c.id === "history")!.state, "unavailable", "History stays unavailable internally"); assert.match(exec, /a bare note/); assert.match(exec, /Phases/);
  assert.match(all(workbenchContentOf(wt, wt.mission.id, "requestedChanges")), /Please change the tone/);
  assert.match(all(workbenchContentOf(wt, wt.mission.id, "lineage")), /job-original/);
  const out = workbenchContentOf(wt, wt.mission.id, "output")!;
  assert.ok(out.blocks.some(b => b.kind === "text" && b.format === "markdown" && b.text.startsWith("# Final")), "the final output is rendered as formatted text, not JSON");
  // history is never invented: it is not a visible section
  assert.equal(workbenchCapabilities(wt, wt.mission.id)!.sections.some(s => s.id === "history"), false);
  const missing = fixture();
  assert.match(all(workbenchContentOf(missing, missing.mission.id, "overview")), /Phases: 7 of 7 recorded/);
}

// 3. Estimate != bill; a local-model estimate of 0 is never "Cost $0".
{
  assert.match(estimateText(0, true), /^\$0\.00 price-table estimate/, "a price-table zero (local / free) is a known $0.00 estimate");
  assert.match(estimateText(0, true), /local or free/);
  assert.equal(estimateText(null, false).includes("$"), false);
  assert.match(estimateText(0.0123, true), /^≈ \$0\.01 price-table estimate$/);
  const wt = fixture();
  const usage = workbenchContentOf(wt, wt.mission.id, "usage")!;
  const text = all(usage);
  assert.match(text, /Billed cost: Not recorded/); assert.match(text, /≈ \$\d/, "the priced model shows an ESTIMATE"); assert.match(text, /price-table/);
  assert.equal(/Billed cost: \$/.test(text), false, "a $0.00 estimate is never worded as billed cost"); assert.equal(/ollama · llama3[^\n]*cost \$/.test(text), false, "an unpriced model never gets a $ amount");
  assert.match(text, /ollama · qwen2\.5:7b-instruct[\s\S]*\$0\.00 price-table estimate/); assert.match(text, /ollama · llama3[\s\S]*No price-table estimate for this model/); assert.match(text, /Total: 3 calls[^\n]*estimate ≥ \$0\.0008 · partial/, "one unpriced model makes the total a minimum, never a full figure"); assert.match(text, /ollama · llama3[^\n]*estimate Not recorded · unknown/, "an unpriced model is Not recorded, never $0");
  assert.equal(/\bcost\b[^\n]*\$/i.test(text.replace(/price-table/gi, "")), false, "no line calls an estimate a cost / bill");
  const stepUse = all(workbenchContentOf(wt, wt.steps.find(s => s.departmentId)!.id, "usage"));
  assert.match(stepUse, /Billed cost: Not recorded/); assert.match(stepUse, /gemini · gemini-2\.5-flash/); assert.match(stepUse, /in 2,000 · out 800/);
}

// 4. Recorded-running != confirmed-live.
{
  const unconfirmed = fixture({ running: true, executor: "unconfirmed" }), confirmed = fixture({ running: true, executor: "confirmed" }), unreadable = fixture({ running: true });
  const u = workbenchContentOf(unconfirmed, unconfirmed.mission.id, "execution")!, c = workbenchContentOf(confirmed, confirmed.mission.id, "execution")!; // C7F: state / executor facts live in Execution
  const factOf = (content: WorkbenchContent, label: string) => (content.blocks.find(b => b.kind === "facts") as Extract<Block, { kind: "facts" }>).facts.find(f => f.label === label)!;
  assert.equal(factOf(u, "Recorded").value, "Running"); assert.match(factOf(u, "Executor").value, /no executor confirms it/); assert.equal(factOf(u, "Executor").tone, "alert");
  assert.equal(factOf(c, "Recorded").value, "Running"); assert.match(factOf(c, "Executor").value, /^Confirmed live/); assert.equal(factOf(c, "Executor").tone, "live");
  assert.match(all(workbenchContentOf(unreadable, unreadable.mission.id, "execution")), /Executor state could not be read/);
  assert.match(all(workbenchContentOf(unconfirmed, unconfirmed.mission.id, "execution")), /not shown as live/);
  assert.equal(/not shown as live/.test(all(workbenchContentOf(confirmed, confirmed.mission.id, "execution"))), false);
  const activeStep = unconfirmed.steps.find(s => s.status === "active")!;
  assert.match(all(workbenchContentOf(unconfirmed, activeStep.id, "execution")), /Nothing here proves a live executor/);
  assert.match(all(workbenchContentOf(unconfirmed, activeStep.id, "execution")), /Executor Per-step executor evidence is not recorded/);
}

// 5. Unique-step approval / consultation binding.
{
  const wt = fixture({ approvals: true, dupMarketing: true });
  const sales = wt.steps.find(s => s.departmentId === wt.departments.find(d => d.canonicalId === "strategic_intelligence")!.id)!;
  assert.equal(sales.approvalIds.length, 1);
  assert.match(all(workbenchContentOf(wt, sales.id, "approvals")), /send_email/);
  assert.match(all(workbenchContentOf(wt, sales.id, "approvals")), /to: a@b\.c/); assert.equal(all(workbenchContentOf(wt, sales.id, "approvals")).includes("{"), false, "no raw JSON");
  const dups = wt.steps.filter(s => s.recordedId === "dept:marketing");
  assert.equal(dups.length, 2);
  for (const d of dups) { assert.deepEqual(d.approvalIds, []); assert.deepEqual(d.consultationIds, []); }
  const mission = all(workbenchContentOf(wt, wt.mission.id, "approvals"));
  assert.match(mission, /post_ad/); assert.match(mission, /Not bound: the recorded step id is not unique/);
  assert.match(all(workbenchContentOf(wt, wt.mission.id, "consultations")), /Which budget\?[\s\S]*Not bound/);
  for (const d of dups) assert.equal(workbenchCapabilities(wt, d.id)!.sections.some(x => x.id === "approvals" || x.id === "consultations"), false, "no attached approval -> no section");
}

// 6. Unresolved dependencies are never guessed.
{
  const wt = fixture({ dupMarketing: true });
  const review = phaseId(wt, "team-review");
  const dups = wt.steps.filter(s => s.recordedId === "dept:marketing").map(s => s.id);
  const reviewCaps = workbenchCapabilities(wt, review)!;
  assert.ok(reviewCaps.capabilities.length > 0);
  // Team Review has no content in this task, but the SAME relationship builder serves the Step profile: check it on the Final Plan / QA chain and on the departments.
  const dept = wt.departments.find(d => d.canonicalId === "brand_growth_marketing")!;
  const deps = workbenchContentOf(wt, dept.id, "dependencies")!;
  const targets = relationTargets(deps.blocks);
  for (const d of dups) assert.equal(targets.includes(d), false, "a duplicated step id is never offered as a target");
  const qa = workbenchContentOf(wt, phaseId(wt, "qa"), "dependencies");
  assert.equal(qa, null, "QA content is a later task");
  const reconcileSet = workbenchCapabilities(wt, review)!;
  assert.equal(reconcileSet.profile, "review");
  const finalPhase = phaseId(wt, "final-plan");
  const fc = workbenchContentOf(wt, finalPhase, "dependencies")!;
  assert.ok(fc, "Final Plan is a step-profile node and carries the ambiguous reference");
  const ftext = all(fc);
  assert.match(ftext, /Unresolved/); assert.match(ftext, /Reference matches more than one step/); assert.match(ftext, /“dept:marketing”/);
  assert.match(ftext, /not guessed/);
  const ftargets = relationTargets(fc.blocks);
  for (const d of dups) assert.equal(ftargets.includes(d), false, "no candidate is offered as a target");
  assert.deepEqual(ftargets.filter(t => t.startsWith("ambiguity:")), [ambiguityId(finalPhase)], "only the explanation entity is selectable for the unresolved reference");
  assert.equal(ftargets.includes(phaseId(wt, "qa")), true, "the resolved prerequisite stays selectable");
  // an unresolved reference is plain (not a button) unless it is the explanation entity
  const issueNode = wt.phases.find(p => p.stepIds.some(id => wt.steps.find(s => s.id === id)!.dependencies.issues.length > 0));
  assert.ok(issueNode, "the fixture really carries an unresolved reference");
}

// 7. Department content: Steps are every recorded step, selectable; Assignment labels the specialist as a planning recommendation; dependencies are resolved ones only.
{
  const wt = fixture();
  const marketing = wt.departments.find(d => d.canonicalId === "brand_growth_marketing")!;
  const a = all(workbenchContentOf(wt, marketing.id, "assignment"));
  assert.match(a, /marketing assignment text/); assert.match(a, /Planning recommendation/); assert.match(a, /does not show that this specialist executed anything/); assert.match(a, /Ad Specialist/);
  const plain = all(workbenchContentOf(wt, wt.departments.find(d => d.canonicalId === "strategic_intelligence")!.id, "assignment"));
  assert.equal(/Planning recommendation/.test(plain), false);
  const steps = workbenchContentOf(wt, marketing.id, "steps")!.blocks[0] as Extract<Block, { kind: "steps" }>;
  assert.equal(steps.rows.length, marketing.stepIds.length); assert.deepEqual(steps.rows.map(r => r.target), marketing.stepIds);
  const over = all(workbenchContentOf(wt, marketing.id, "overview"));
  assert.match(over, /Recorded as: brand_growth_marketing/); assert.equal(/1 step · 1 done/.test(over), false, "the department Overview does not repeat the step tally"); assert.match(all(workbenchContentOf(wt, marketing.id, "execution")), /1 step · 1 done/, "C7F: it moved to Execution");
  const fin = wt.departments.find(d => d.canonicalId === "operations_finance")!;
  assert.match(all(workbenchContentOf(wt, fin.id, "overview")), /Attention/); assert.equal(all(workbenchContentOf(wt, fin.id, "overview")).includes("sk-abc"), false);
  const needs = relationTargets(workbenchContentOf(wt, marketing.id, "dependencies")!.blocks);
  assert.ok(needs.includes(phaseId(wt, "live-research")) && needs.includes(phaseId(wt, "team-review")), "resolved relationships are selectable entities");
}

// 8. Selecting a Step row keeps the Workbench open on the SAME canonical selection; section memory per entity; no close / reopen.
{
  const wt = fixture();
  const marketing = wt.departments.find(d => d.canonicalId === "brand_growth_marketing")!;
  let s = run(wt, initialSelection(wt, "graph"), { type: "select", id: marketing.id }, { type: "openWorkbench" }, { type: "setSection", section: "steps" });
  const row = (workbenchContentOf(wt, s.selectedId, s.section)!.blocks[0] as Extract<Block, { kind: "steps" }>).rows[0];
  s = run(wt, s, { type: "select", id: row.target });
  assert.equal(s.depth, "workbench", "the Workbench stays open"); assert.equal(s.selectedId, row.target); assert.equal(s.section, "overview", "Steps is not a Step section: default");
  assert.ok(workbenchContentOf(wt, s.selectedId, s.section), "the new entity renders its own content immediately");
  s = run(wt, s, { type: "setSection", section: "output" }, { type: "select", id: marketing.id });
  assert.equal(s.section, "steps", "remembered for the Department"); assert.equal(s.depth, "workbench");
  s = run(wt, s, { type: "select", id: row.target });
  assert.equal(s.section, "output", "remembered for the Step"); assert.match(all(workbenchContentOf(wt, s.selectedId, s.section)), /Heading/);
  // a link from a Step's Dependencies selects the real target
  const deps = relationTargets(workbenchContentOf(wt, row.target, "dependencies")!.blocks);
  assert.ok(deps.length >= 2);
  const next = run(wt, s, { type: "select", id: deps[0] });
  assert.equal(next.depth, "workbench"); assert.equal(next.selectedId, deps[0]);
  // Esc still goes Workbench -> Peek
  assert.equal(run(wt, next, { type: "escape" }).depth, "peek");
}

// 9. Step content: truthful type, execution facts, full output, per-usage rows.
{
  const wt = fixture();
  const s = wt.steps.find(x => x.departmentId === wt.departments.find(d => d.canonicalId === "strategic_intelligence")!.id)!;
  const over = all(workbenchContentOf(wt, s.id, "overview"));
  assert.match(over, /Label: Strategic Intelligence/i); assert.match(over, /Type: Department/); assert.equal(/Progress:/.test(over), false, "C7F: the progress fact is the summary row's Completion"); assert.match(all(workbenchContentOf(wt, s.id, "execution")), /Progress: 100% recorded/);
  assert.match(all(workbenchContentOf(wt, s.id, "execution")), /Provider: ollama/); assert.match(all(workbenchContentOf(wt, s.id, "execution")), /Models: qwen2\.5:7b-instruct · gemini-2\.5-flash · llama3/);
  const out = workbenchContentOf(wt, s.id, "output")!.blocks[0] as Extract<Block, { kind: "text" }>;
  assert.equal(out.text, OUTPUT, "the FULL recorded output, unaltered"); assert.equal(out.format, "markdown"); assert.equal(out.chars, OUTPUT.length);
  const rows = (workbenchContentOf(wt, s.id, "usage")!.blocks.find(b => b.kind === "usage") as Extract<Block, { kind: "usage" }>).rows;
  assert.equal(rows.length, 3); assert.match(rows[0].estimate, /\$0\.00 price-table estimate/); assert.match(rows[1].estimate, /≈ \$/); assert.match(rows[2].estimate, /No price-table estimate/);
  const failed = wt.steps.find(x => x.status === "error")!;
  assert.match(all(workbenchContentOf(wt, failed.id, "execution")), /Recorded error[\s\S]*429 quota exceeded/); assert.equal(all(workbenchContentOf(wt, failed.id, "execution")).includes("sk-abc"), false);
  const unknown = fixture();
  const note = all(workbenchContentOf(unknown, phaseId(unknown, "planning"), "overview"));
  assert.match(note, /Type: Planning/);
}
console.log("test-dive-mission-worktree-workbench-content: all W5.3A content contract checks passed");
