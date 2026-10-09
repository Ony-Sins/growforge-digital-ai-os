import assert from "node:assert/strict";
import type { Job, JobStep } from "../src/lib/jobStore";
import { buildMissionWorktree, type MissionWorktree } from "../src/components/spatial/dive/missionWorktree";
import { ambiguityId, issuesOfNode } from "../src/components/spatial/dive/missionWorktreeAncestry";
import { contextThread, initialSelection, reduceSelection, type SelectionAction, type WorktreeSelection } from "../src/components/spatial/dive/missionWorktreeSelection";
import { workbenchCapabilities } from "../src/components/spatial/dive/missionWorkbench";
import { workbenchContentOf, type Block, type WorkbenchContent } from "../src/components/spatial/dive/missionWorkbenchContent";

/** W5.3C2 contract: QA Workbench content + ambiguity / unresolved-dependency explanation + the Team Review route into it. Pure model, no React. */
const T = "2026-10-01T10:00:00.000Z", T2 = "2026-10-01T10:02:30.000Z";
const step = (id: string, kind: JobStep["kind"], over: Partial<JobStep> = {}): JobStep => ({ id, kind, label: id, activity: "a", status: "done", percent: 100, weight: 10, dependsOn: [], ...over });
const QA_PASS_FIX = "Some intro.\n\n**Verdict:** PASS WITH FIXES\n\n### Required fixes\n1. fix the thing\n";
const QA_NOLINE = "Overall the plan looks fine. PASS in my view. APPROVED.\n\n### Required fixes\nNone";
interface Opts { qa?: string; qaStatus?: JobStep["status"]; pending?: boolean; provider?: string; usage?: boolean; manyAmbiguous?: boolean; kinds?: boolean; qaDup?: boolean }
function fixture(o: Opts = {}): MissionWorktree {
  const steps: JobStep[] = [step("brief", "brief"), step("plan", "plan", { dependsOn: ["brief"] }), step("research", "research", { dependsOn: ["plan"], output: "### Finding 1: q\nb\nSources: none returned" })];
  steps.push(step("dept-a", "department", { departmentId: "sales-bd", dependsOn: ["research"], output: "x" }));
  const reviewDeps: string[] = ["dept-a"];
  if (o.manyAmbiguous) for (let i = 1; i <= 8; i++) { steps.push(step(`dup${i}`, "department", { departmentId: "marketing", dependsOn: [] }), step(`dup${i}`, "department", { departmentId: "finance-ops", dependsOn: [] })); reviewDeps.push(`dup${i}`); }
  if (o.kinds) reviewDeps.push("ghost", "reconcile");
  steps.push(step("reconcile", "reconcile", { dependsOn: o.manyAmbiguous ? reviewDeps.slice(1) : reviewDeps, output: "### Conflicts\nx" }));
  steps.push(step("qa", "qa", { dependsOn: o.qaDup ? ["dup1"] : ["reconcile"], ...(o.provider ? { provider: o.provider } : {}), ...(o.pending ? { status: "pending" as const, percent: 0 } : { status: o.qaStatus ?? "done", startedAt: T, finishedAt: T2, output: o.qa ?? QA_PASS_FIX }),
    ...(o.usage ? { usage: [{ provider: "ollama", model: "qwen2.5:7b-instruct", inputTokens: 10, outputTokens: 5, durationMs: 900, timestamp: T }] } : {}) }), step("final", "final", { dependsOn: ["qa"] }));
  if (o.qaDup) steps.push(step("dup1", "department", { departmentId: "marketing" }), step("dup1", "department", { departmentId: "finance-ops" }));
  const job: Job = { id: "job-w53c2", title: "QA Mission", brief: "b", status: "done", percent: 80, verified: true, steps, createdAt: T, updatedAt: T2, liveNotes: [], revisions: [] };
  return buildMissionWorktree({ job });
}
const run = (wt: MissionWorktree, state: WorktreeSelection, ...actions: SelectionAction[]) => actions.reduce((s, a) => reduceSelection(s, a, wt), state);
const QA = (wt: MissionWorktree) => wt.phases.find(p => p.key === "qa")!.id;
const TR = (wt: MissionWorktree) => wt.phases.find(p => p.key === "team-review")!.id;
const flat = (blocks: Block[]): Block[] => blocks.flatMap(b => (b.kind === "group" ? [b, ...flat(b.blocks)] : [b]));
const of = <K extends Block["kind"]>(c: WorkbenchContent, kind: K) => flat(c.blocks).filter((b): b is Extract<Block, { kind: K }> => b.kind === kind);
const factsOf = (c: WorkbenchContent) => of(c, "facts").flatMap(b => b.facts);
import { breakdownCostText as __bdc, type UsageBreakdown as __UB } from "../src/components/spatial/dive/missionAnalytics";
const bdText = (b: __UB): string => [`Billed cost: ${b.billed}`, `Total: ${b.total.calls} calls · in ${b.total.inputTokens} · out ${b.total.outputTokens} · estimate ${__bdc(b.total.cost)} · ${b.total.cost.state}`, ...b.contributors.map(c => `${c.key}: ${c.calls} calls · in ${c.inputTokens} · out ${c.outputTokens} · estimate ${__bdc(c.cost)} · ${c.cost.state}`)].join("\n");
const text = (c: WorkbenchContent | null): string => flat(c?.blocks ?? []).map(b => b.kind === "depmap" ? `needs ${b.needs} waits ${b.waits} unresolved ${b.unresolved}` : b.kind === "usageBreakdown" ? bdText(b.breakdown) : b.kind === "facts" ? b.facts.map(f => `${f.label}: ${f.value}${f.provenance ? ` [${f.provenance}]` : ""}`).join("\n") : b.kind === "group" ? `${b.title}\n${b.note ?? ""}` : b.kind === "note" ? b.text : b.kind === "text" ? `${b.title ?? ""}\n${b.text}`
  : b.kind === "relations" ? b.items.map(i => `${i.label} ${i.detail ?? ""}`).join("\n") : b.kind === "usage" ? b.rows.map(r => `${r.title} ${r.meta} ${r.estimate}`).join("\n") : b.kind === "empty" ? b.text : b.kind === "unavailable" ? `${b.label} ${b.reason}` : "").join("\n");
const targets = (c: WorkbenchContent) => of(c, "relations").flatMap(b => b.items.flatMap(i => (i.target ? [i.target] : [])));
const sections = (wt: MissionWorktree, id: string) => workbenchCapabilities(wt, id)!.sections.map(s => s.id);

// 1 + 2 + 3. QA verdict exists only with an explicit supported Verdict line; state / progress / wording never manufacture one; it is Parsed from text.
{
  const yes = fixture(), no = fixture({ qa: QA_NOLINE }), needs = fixture({ qa: "**Verdict:** NEEDS WORK" }), pass = fixture({ qa: "**Verdict:** PASS" }), bogus = fixture({ qa: "**Verdict:** APPROVED\nPASS" });
  assert.deepEqual(sections(yes, QA(yes)), ["overview", "inputs", "execution", "qa", "output"]);
  assert.equal(factsOf(workbenchContentOf(yes, QA(yes), "qa")!).find(f => f.label === "Verdict")!.value, "PASS WITH FIXES");
  assert.equal(factsOf(workbenchContentOf(yes, QA(yes), "qa")!).find(f => f.label === "Verdict")!.provenance, "Parsed from text");
  assert.equal(factsOf(workbenchContentOf(yes, QA(yes), "overview")!).find(f => f.label === "Verdict")!.provenance, "Parsed from text");
  assert.match(text(workbenchContentOf(yes, QA(yes), "qa")), /not an approval, a score or a rating/); assert.match(text(workbenchContentOf(yes, QA(yes), "qa")), /\*\*Verdict:\*\* PASS WITH FIXES/);
  assert.equal(factsOf(workbenchContentOf(needs, QA(needs), "qa")!).find(f => f.label === "Verdict")!.value, "NEEDS WORK");
  assert.equal(factsOf(workbenchContentOf(pass, QA(pass), "qa")!).find(f => f.label === "Verdict")!.value, "PASS");
  for (const wt of [no, bogus]) {
    assert.equal(sections(wt, QA(wt)).includes("qa"), false, "no explicit supported line -> no verdict section"); assert.equal(workbenchContentOf(wt, QA(wt), "qa"), null);
    const ov = workbenchContentOf(wt, QA(wt), "overview")!;
    assert.equal(factsOf(ov).find(f => f.label === "Verdict")!.value, "No explicit verdict line recorded");
    assert.match(text(ov), /A finished QA step is not a pass/); assert.equal(/\bPASS\b/.test(text(ov).replace(/not a pass/i, "")), false, "no PASS is inferred from state or wording");
    assert.equal(wt.steps.find(s => s.kind === "qa")!.status, "done"); assert.equal(wt.steps.find(s => s.kind === "qa")!.percent, 100);
  }
  const pending = fixture({ pending: true });
  assert.deepEqual(sections(pending, QA(pending)), ["overview", "inputs", "execution"]); assert.match(text(workbenchContentOf(pending, QA(pending), "overview")), /QA has not run/);
}

// 4. The raw QA output is authoritative and unaltered; no raw HTML.
{
  const raw = "<b>x</b>\n**Verdict:** NEEDS WORK\n- a\n```\nc\n```";
  const wt = fixture({ qa: raw });
  const out = of(workbenchContentOf(wt, QA(wt), "output")!, "text")[0];
  assert.equal(out.text, raw); assert.equal(out.format, "markdown"); assert.equal(out.chars, raw.length);
}

// 5. QA inputs: only resolved prerequisites, selectable; provider / usage never invented; estimate != bill.
{
  const wt = fixture({ provider: "ollama", usage: true });
  const inputs = workbenchContentOf(wt, QA(wt), "inputs")!;
  assert.deepEqual(targets(inputs), [TR(wt)], "the one resolved prerequisite: Team Review");
  let s = run(wt, initialSelection(wt, "graph"), { type: "select", id: QA(wt) }, { type: "openWorkbench" }, { type: "setSection", section: "inputs" });
  s = run(wt, s, { type: "select", id: TR(wt) });
  assert.equal(s.depth, "workbench"); assert.equal(s.selectedId, TR(wt)); assert.equal(s.section, "inputs", "Team Review also has Inputs: the valid section is carried");
  s = run(wt, s, { type: "select", id: QA(wt) }); assert.equal(s.section, "inputs");
  const bare = fixture();
  assert.equal(factsOf(workbenchContentOf(bare, QA(bare), "overview")!).find(f => f.label === "Provider")!.value, "Not recorded");
  const u = text(workbenchContentOf(wt, QA(wt), "usage"));
  assert.match(u, /Billed cost: Not recorded/); assert.match(u, /\$0\.00 price-table estimate/); assert.equal(/Billed cost: \$/.test(u), false, "a known $0.00 estimate is never worded as a billed cost");
}

// 6 + 7 + 8 + 9. Ambiguity: never chooses, every reference inspectable, candidates retained but not ranked or resolved, no guessed relationship.
{
  const wt = fixture({ manyAmbiguous: true }), node = TR(wt), id = ambiguityId(node);
  assert.deepEqual(sections(wt, id), ["problem", "references", "candidates"], "the W5.1 contract: no Overview");
  const issues = issuesOfNode(wt, node);
  assert.equal(issues.length, 8);
  const problem = workbenchContentOf(wt, id, "problem")!, p = text(problem);
  assert.match(p, /Selected: None/); assert.match(p, /No candidate was selected because the recorded reference is not unique/);
  assert.equal(/\b(likely|best match|probably|suggested|most relevant|recommend\w*|closest|top)\b/i.test(p + text(workbenchContentOf(wt, id, "references")) + text(workbenchContentOf(wt, id, "candidates"))), false, "no ranking / suggestion wording anywhere");
  assert.match(p, /References: 8 recorded references/); assert.match(p, /Matches more than one step: 8/); assert.match(p, /Candidates: 16 recorded steps/);
  assert.deepEqual(factsOf(problem).filter(f => f.target).map(f => f.target), [node], "the only link is to the affected real node (inspection), never to a candidate"); assert.deepEqual(targets(problem), []);
  // all references, in recorded order
  const refs = of(workbenchContentOf(wt, id, "references")!, "relations")[0].items;
  assert.equal(refs.length, 8); assert.deepEqual(refs.map(r => r.label), issues.map(i => `“${i.reference}”`)); assert.equal(refs.every(r => r.unresolved && !r.target), true, "no reference row is a link");
  assert.match(refs[0].detail!, /Matches more than one step · on .* · 2 candidates/);
  // candidates: retained, in recorded order, unranked, not selectable
  const cand = workbenchContentOf(wt, id, "candidates")!;
  assert.match(text(cand), /Candidate identities are shown to explain the ambiguity\. None has been selected as the dependency\./);
  const groups = flat(cand.blocks).filter((b): b is Extract<Block, { kind: "group" }> => b.kind === "group");
  assert.equal(groups.length, 8, "one group per reference");
  const g0 = of({ ...cand, blocks: groups[0].blocks }, "relations")[0].items;
  assert.equal(g0.length, 2); assert.equal(g0.every(c => !c.target && c.unresolved), true, "candidates never navigate or resolve");
  const ordinals = g0.map(c => Number(/position (\d+)/.exec(c.detail!)![1]));
  assert.deepEqual(ordinals, [...ordinals].sort((a, b) => a - b), "recorded order, not a ranking");
  assert.equal(targets(cand).length, 0);
  // no guessed relationship
  const review = wt.steps.find(s => s.recordedId === "reconcile")!;
  for (const d of wt.steps.filter(s => /^dup\d$/.test(s.recordedId))) { assert.equal(review.dependencies.prerequisiteIds.includes(d.id), false); assert.equal(d.dependencies.dependentIds.includes(review.id), false); }
}

// 6b. Other issue kinds keep their real W1 kind.
{
  const wt = fixture({ kinds: true }), id = ambiguityId(TR(wt));
  const refs = of(workbenchContentOf(wt, id, "references")!, "relations")[0].items;
  assert.ok(refs.some(r => /Matches no recorded step/.test(r.detail!)) && refs.some(r => /Step names itself/.test(r.detail!)), "unresolved and self-reference stay what they are");
  assert.match(text(workbenchContentOf(wt, id, "problem")), /No recorded step has this id/); assert.match(text(workbenchContentOf(wt, id, "problem")), /lists itself as a prerequisite/);
  assert.equal(sections(wt, id).includes("candidates"), false, "no candidates when nothing is ambiguous");
}

// 10 + 11. Team Review with 0 resolved + unresolved references: Inputs is inspectable, separate, and routes to the explanation.
{
  const wt = fixture({ manyAmbiguous: true });
  assert.ok(sections(wt, TR(wt)).includes("inputs"), "Inputs stays visible with 0 resolved + unresolved references");
}
{
  const wt = fixture({ manyAmbiguous: true });
  // dept-a resolves for the review ONLY when it is in the dependsOn list: here it is not -> 0 resolved + 8 unresolved
  const inputs = workbenchContentOf(wt, TR(wt), "inputs")!;
  assert.match(text(inputs), /No resolved input is recorded/);
  const grp = flat(inputs.blocks).find((b): b is Extract<Block, { kind: "group" }> => b.kind === "group" && b.title === "Could not resolve uniquely")!;
  assert.ok(grp); assert.match(grp.note!, /8 recorded references are not listed as inputs and no step was chosen for them/);
  assert.deepEqual(targets(inputs), [ambiguityId(TR(wt))], "the only route is the canonical ambiguity entity");
  assert.match(text(inputs), /8 recorded references · 8 match more than one step Open the explanation/);
  assert.match(text(workbenchContentOf(wt, TR(wt), "overview")), /Inputs: 0 resolved · 8 recorded references not resolved uniquely/);
  // mixed: resolved rows stay separate from the unresolved group
  const mixed = fixture({ kinds: true });
  const mi = workbenchContentOf(mixed, TR(mixed), "inputs")!;
  assert.equal(targets(mi).filter(t => !t.startsWith("ambiguity:")).length, 1); assert.equal(targets(mi).filter(t => t.startsWith("ambiguity:")).length, 1);
  assert.equal(of(mi, "relations")[0].items.some(i => /recorded reference/.test(i.label)), false, "an unresolved reference is not in the resolved list");
  // QA with an unresolved prerequisite has the same route
  const q = fixture({ qaDup: true });
  assert.ok(sections(q, QA(q)).includes("inputs")); assert.deepEqual(targets(workbenchContentOf(q, QA(q), "inputs")!), [ambiguityId(QA(q))]);
}

// 12 + 13. Opening the explanation keeps the Workbench open with a truthful Context Thread; Graph <-> Pipeline preserves it.
{
  const wt = fixture({ manyAmbiguous: true }), id = ambiguityId(TR(wt));
  let s = run(wt, initialSelection(wt, "graph"), { type: "select", id: TR(wt) }, { type: "openWorkbench" }, { type: "setSection", section: "inputs" });
  s = run(wt, s, { type: "select", id });
  assert.equal(s.depth, "workbench"); assert.equal(s.selectedId, id); assert.equal(s.section, "problem", "the ambiguity default");
  const thread = contextThread(wt, s.selectedId);
  assert.deepEqual(thread.map(t => t.kind), ["mission", "phase", "ambiguity"]); assert.equal(thread[thread.length - 1].label, "Unresolved dependency");
  assert.equal(thread[1].id, TR(wt), "ancestry is the affected node's, plus the marker; no fabricated ancestry");
  s = run(wt, s, { type: "setSection", section: "references" }, { type: "select", id: TR(wt) });
  assert.equal(s.section, "inputs"); s = run(wt, s, { type: "select", id });
  assert.equal(s.section, "references", "remembered for the ambiguity entity");
  assert.equal(run(wt, s, { type: "escape" }).depth, "peek");
  // the ambiguity is not a Worktree node: the node it explains is the only real entity involved
  assert.equal(wt.steps.some(x => x.id === id) || wt.phases.some(x => x.id === id) || wt.departments.some(x => x.id === id), false);
}

// 14. No placeholder for QA or ambiguity; only registry sections.
{
  for (const o of [{}, { qa: QA_NOLINE }, { pending: true }, { provider: "ollama", usage: true }, { manyAmbiguous: true }, { kinds: true }, { qaDup: true }] as Opts[]) {
    const wt = fixture(o);
    for (const id of [QA(wt), TR(wt), ambiguityId(TR(wt)), ambiguityId(QA(wt))]) {
      const caps = workbenchCapabilities(wt, id);
      if (!caps) continue;
      for (const sec of caps.sections) { const c = workbenchContentOf(wt, id, sec.id); assert.ok(c, `content for ${caps.profile} ${sec.id}`); assert.equal(/content arrives in W5\.3/i.test(text(c)), false); }
      for (const c of caps.capabilities.filter(x => !x.visible)) assert.equal(workbenchContentOf(wt, id, c.id), null);
      assert.deepEqual(caps.sections.map(s => s.id).filter(x => !["overview", "inputs", "execution", "review", "qa", "output", "usage", "problem", "references", "candidates"].includes(x)), []);
    }
  }
}
console.log("test-dive-mission-worktree-workbench-qa-ambiguity: all W5.3C2 contract checks passed");
