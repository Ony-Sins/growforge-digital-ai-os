import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Job, JobStep } from "../src/lib/jobStore";
import { departmentDisplayName } from "../src/lib/departmentTaxonomy";
import { buildMissionWorktree, type MissionWorktree } from "../src/components/spatial/dive/missionWorktree";
import { initialSelection, reduceSelection, type SelectionAction, type WorktreeSelection } from "../src/components/spatial/dive/missionWorktreeSelection";
import { workbenchCapabilities } from "../src/components/spatial/dive/missionWorkbench";
import { workbenchContentOf, type Block, type WorkbenchContent } from "../src/components/spatial/dive/missionWorkbenchContent";

/** W5.3C1 contract: Team Review Workbench content. Pure model, no React. */
const T = "2026-10-01T10:00:00.000Z", T2 = "2026-10-01T10:02:30.000Z";
const step = (id: string, kind: JobStep["kind"], over: Partial<JobStep> = {}): JobStep => ({ id, kind, label: id, activity: "a", status: "done", percent: 100, weight: 10, dependsOn: [], ...over });
const FULL = "Opening remarks before any heading.\n\n### Conflicts\nA vs B <b>raw</b>\n\n### Dependencies\nA needs B\n\n### Gaps\nNone found\n\n### Agreed direction\n- Ship the pilot first\n- then scale\n";
const PARTIAL = "### Conflicts\nOnly conflicts here\n\n### Gaps\nOne gap";
const UNKNOWN = "### Risks\nrisk text\n\n### Dependencies and blockers\nblocked by X\n\n### Agreed direction (draft)\n- x\n\n### Conflicts\nreal conflict";
const FLAT = "The team mostly agreed. No headings were written.\nSecond line.";
interface Opts { review?: string; pending?: boolean; provider?: string; usage?: boolean; dup?: boolean; error?: string; deptStatus?: JobStep["status"] }
function fixture(o: Opts = {}): MissionWorktree {
  const ids = ["sales-bd", "marketing", "finance-ops"], steps: JobStep[] = [step("brief", "brief"), step("plan", "plan", { dependsOn: ["brief"] }), step("research", "research", { dependsOn: ["plan"], output: "### Finding 1: q\nbody\nSources: none returned" })];
  ids.forEach((d, i) => steps.push(step(`dept:${d}`, "department", { departmentId: d, dependsOn: ["research"], label: departmentDisplayName(d), ...(o.dup && i === 1 ? {} : {}), output: i === 2 ? undefined : `out ${i}`, status: i === 2 && o.deptStatus ? o.deptStatus : "done", ...(i === 2 && o.deptStatus === "error" ? { error: "429 quota sk-abcdefghijklmnop123456" } : {}) })));
  if (o.dup) steps.push(step("dept:marketing", "department", { departmentId: "marketing", dependsOn: ["research"] }));
  steps.push(step("reconcile", "reconcile", { dependsOn: o.dup ? ["dept:sales-bd", "dept:marketing", "dept:finance-ops"] : ids.map(d => `dept:${d}`), ...(o.provider ? { provider: o.provider } : {}), ...(o.pending ? { status: "pending" as const, percent: 0 } : { startedAt: T, finishedAt: T2, output: o.review ?? FULL }), ...(o.error ? { status: "error" as const, error: o.error } : {}),
    ...(o.usage ? { usage: [{ provider: "ollama", model: "qwen2.5:7b-instruct", inputTokens: 300, outputTokens: 120, durationMs: 4000, timestamp: T }, { provider: "gemini", model: "gemini-2.5-flash", inputTokens: 5000, outputTokens: 900, durationMs: 6000, timestamp: T2 }] } : {}) }));
  steps.push(step("qa", "qa", { dependsOn: ["reconcile"] }), step("final", "final", { dependsOn: ["qa"] }));
  const job: Job = { id: "job-w53c", title: "Review Mission", brief: "b", status: "done", percent: 80, verified: true, steps, createdAt: T, updatedAt: T2, liveNotes: [], revisions: [] };
  return buildMissionWorktree({ job });
}
const run = (wt: MissionWorktree, state: WorktreeSelection, ...actions: SelectionAction[]) => actions.reduce((s, a) => reduceSelection(s, a, wt), state);
const TR = (wt: MissionWorktree) => wt.phases.find(p => p.key === "team-review")!.id;
const get = (wt: MissionWorktree, section: Parameters<typeof workbenchContentOf>[2]) => workbenchContentOf(wt, TR(wt), section)!;
const flat = (blocks: Block[]): Block[] => blocks.flatMap(b => (b.kind === "group" ? [b, ...flat(b.blocks)] : [b]));
const of = <K extends Block["kind"]>(c: WorkbenchContent, kind: K) => flat(c.blocks).filter((b): b is Extract<Block, { kind: K }> => b.kind === kind);
const facts = (c: WorkbenchContent) => of(c, "facts").flatMap(b => b.facts);
import { breakdownCostText as __bdc, type UsageBreakdown as __UB } from "../src/components/spatial/dive/missionAnalytics";
const bdText = (b: __UB): string => [`Billed cost: ${b.billed}`, `Total: ${b.total.calls} calls · in ${b.total.inputTokens} · out ${b.total.outputTokens} · estimate ${__bdc(b.total.cost)} · ${b.total.cost.state}`, ...b.contributors.map(c => `${c.key}: ${c.calls} calls · in ${c.inputTokens} · out ${c.outputTokens} · estimate ${__bdc(c.cost)} · ${c.cost.state}`)].join("\n");
const text = (c: WorkbenchContent | null): string => flat(c?.blocks ?? []).map(b => b.kind === "depmap" ? `needs ${b.needs} waits ${b.waits} unresolved ${b.unresolved}` : b.kind === "usageBreakdown" ? bdText(b.breakdown) : b.kind === "facts" ? b.facts.map(f => `${f.label}: ${f.value}${f.provenance ? ` [${f.provenance}]` : ""}`).join("\n") : b.kind === "note" ? b.text : b.kind === "text" ? `${b.title ?? ""}\n${b.text}` : b.kind === "review" ? b.rows.map(r => `${r.mark} ${r.heading} ${r.recognisedAs ?? ""} ${r.recognised ? "" : "Unrecognised"} ${r.text}`).join("\n")
  : b.kind === "relations" ? b.items.map(i => `${i.label} ${i.detail ?? ""}`).join("\n") : b.kind === "usage" ? b.rows.map(r => `${r.title} ${r.meta} ${r.estimate}`).join("\n") : b.kind === "empty" ? b.text : b.kind === "unavailable" ? `${b.label} ${b.reason}` : "").join("\n");
const targets = (c: WorkbenchContent) => of(c, "relations").flatMap(b => b.items.flatMap(i => (i.target ? [i.target] : [])));

// 1. The raw recorded review is authoritative and unaltered (Output), duplicated on purpose in Review.
{
  const wt = fixture();
  const out = of(get(wt, "output"), "text")[0];
  assert.equal(out.text, FULL); assert.equal(out.format, "markdown"); assert.equal(out.chars, FULL.length);
  assert.equal(readFileSync(new URL("../src/components/spatial/dive/WorkbenchReading.tsx", import.meta.url), "utf8").includes("innerHTML"), false, "no raw HTML rendering");
  const rows = of(get(wt, "review"), "review")[0].rows;
  assert.ok(rows[0].text.includes("<b>raw</b>"), "section text is kept as written");
  assert.match(text(get(wt, "review")), /the recorded review \(Output\) is authoritative/);
}

// 2 + 3. Recognised sections carry Parsed from text; missing headings are never invented; recorded order kept.
{
  const full = fixture(), part = fixture({ review: PARTIAL });
  const fullRows = of(get(full, "review"), "review")[0].rows;
  assert.deepEqual(fullRows.map(r => r.heading), ["Conflicts", "Dependencies", "Gaps", "Agreed direction"]); assert.deepEqual(fullRows.map(r => r.mark), ["01", "02", "03", "04"]);
  assert.match(text(get(full, "review")), /Parsed from text/); assert.match(text(get(full, "overview")), /4 sections parsed \[Parsed from text\]/);
  const partRows = of(get(part, "review"), "review")[0].rows;
  assert.deepEqual(partRows.map(r => r.heading), ["Conflicts", "Gaps"], "only the headings that exist");
  for (const missing of ["Dependencies", "Agreed direction"]) assert.equal(text(get(part, "review")).includes(missing), false, `${missing} is not invented`);
  assert.equal(partRows.some(r => !r.text.trim()), false, "no empty invented section");
  // text before the first heading is kept, labelled neutrally, not dropped
  assert.match(text(get(full, "review")), /Recorded text before the first section[\s\S]*Opening remarks before any heading\./);
}

// 4 + 5. Unrecognised headings are retained and never reclassified.
{
  const wt = fixture({ review: UNKNOWN });
  const rows = of(get(wt, "review"), "review")[0].rows;
  assert.deepEqual(rows.map(r => r.heading), ["Risks", "Dependencies and blockers", "Agreed direction (draft)", "Conflicts"], "recorded headings, recorded order");
  const risks = rows[0];
  assert.equal(risks.recognised, false); assert.equal(risks.recognisedAs, undefined); assert.equal(risks.text, "risk text");
  assert.equal(rows[3].recognised, true);
  assert.match(text(get(wt, "review")), /Risks[\s\S]*Unrecognised/);
  for (const r of rows.filter(x => !x.recognised)) assert.ok(!["Conflicts", "Dependencies", "Gaps", "Agreed direction"].includes(r.heading), "an unrecognised heading is not relabelled as a known section");
  assert.equal(rows.length, 4, "nothing discarded");
  // W1 recognises by heading prefix: when it does, the RECORDED heading is shown and the recognition is stated, not substituted.
  const recognisedPrefix = rows.find(r => r.heading === "Dependencies and blockers")!;
  if (recognisedPrefix.recognised) assert.equal(recognisedPrefix.recognisedAs, "Dependencies");
}

// 6. Agreed direction is Parsed from text and never renamed as a decision.
{
  const wt = fixture();
  const t = text(get(wt, "review"));
  assert.match(t, /Agreed direction/); assert.match(t, /No section is a structured finding, decision or approval/);
  assert.equal(/final decision|approved direction|consensus|recommendation|approved by/i.test(t.replace(/No section is a structured finding, decision or approval\./, "")), false, "no renaming into a decision / consensus");
  assert.equal(/severity|risk level|confidence|\d+%/i.test(t), false, "no invented scores");
}

// 7 + 8 + 9. Inputs: resolved prerequisites only, selectable, unresolved never guessed, Workbench stays open.
{
  const wt = fixture();
  const inputs = get(wt, "inputs");
  const tg = targets(inputs);
  assert.equal(tg.length, 3); assert.deepEqual(tg.map(id => wt.steps.find(s => s.id === id)!.recordedId), ["dept:sales-bd", "dept:marketing", "dept:finance-ops"]);
  assert.match(text(inputs), /output recorded/); assert.match(text(inputs), /no output recorded/);
  const only = new Set(wt.steps.find(s => s.recordedId === "reconcile")!.dependencies.prerequisiteIds);
  for (const id of tg) assert.ok(only.has(id), "every listed input is a recorded resolved prerequisite");
  const errored = fixture({ deptStatus: "error" });
  assert.match(text(get(errored, "inputs")), /Error[\s\S]*429 quota/); assert.equal(text(get(errored, "inputs")).includes("sk-abc"), false);
  const dup = fixture({ dup: true });
  const dinputs = get(dup, "inputs");
  const dups = dup.steps.filter(s => s.recordedId === "dept:marketing").map(s => s.id);
  assert.equal(dups.length, 2);
  for (const d of dups) assert.equal(targets(dinputs).includes(d), false, "an ambiguous prerequisite is never guessed as an input");
  assert.match(text(dinputs), /1 recorded reference · 1 match more than one step Open the explanation/); assert.ok(flat(dinputs.blocks).some(b => b.kind === "group" && b.title === "Could not resolve uniquely"), "a separate, labelled group"); assert.equal(targets(dinputs).filter(t => !t.startsWith("ambiguity:")).length, 2, "only the two unambiguous inputs");
  assert.deepEqual(targets(dinputs).filter(t => t.startsWith("ambiguity:")), [`ambiguity:${TR(dup)}`], "W5.3C2: one route to the explanation, kept out of the resolved list");
  assert.match(text(get(dup, "overview")), /Inputs: 2 resolved · 1 recorded reference not resolved uniquely/);
  // selecting an input keeps the Workbench open on the canonical selection
  let s = run(wt, initialSelection(wt, "graph"), { type: "select", id: TR(wt) }, { type: "openWorkbench" }, { type: "setSection", section: "inputs" });
  s = run(wt, s, { type: "select", id: tg[0] });
  assert.equal(s.depth, "workbench"); assert.equal(s.selectedId, tg[0]); assert.equal(s.section, "overview");
  s = run(wt, s, { type: "select", id: TR(wt) });
  assert.equal(s.section, "inputs", "remembered"); assert.equal(run(wt, s, { type: "escape" }).depth, "peek");
}

// 10. Provider and usage are never invented; usage obeys estimate != bill.
{
  const bare = fixture();
  assert.equal(facts(get(bare, "overview")).find(f => f.label === "Provider")!.value, "Not recorded");
  assert.equal(facts(get(bare, "overview")).find(f => f.label === "Usage")!.value, "None recorded");
  assert.equal(workbenchCapabilities(bare, TR(bare))!.sections.some(s => s.id === "usage"), false, "no usage -> no Usage section");
  assert.equal(text(get(bare, "overview")).includes("model"), false, "no model is inferred");
  const used = fixture({ usage: true, provider: "ollama" });
  assert.equal(facts(get(used, "usage")).find(f => f.label === "Provider")!.value, "ollama"); // C7F: provider / usage facts live in Usage
  assert.match(facts(get(used, "usage")).find(f => f.label === "Usage")!.value, /2 calls recorded/);
  const u = text(get(used, "usage"));
  assert.match(u, /Billed cost: Not recorded/); assert.match(u, /qwen2\.5:7b-instruct[\s\S]*\$0\.00 price-table estimate/); assert.match(u, /≈ \$/); assert.equal(/Billed cost: \$/.test(u), false, "a known $0.00 estimate is never worded as a billed cost");
  assert.equal(of(get(used, "usage"), "usage")[0].rows.length, 2);
}

// 11. Pending / no output stays truthful; unstructured text shows only the raw review.
{
  const pending = fixture({ pending: true });
  const caps = workbenchCapabilities(pending, TR(pending))!;
  assert.deepEqual(caps.sections.map(s => s.id), ["overview", "inputs", "execution"], "no Review / Output / Usage sections for a review that has not run (Execution always exists)");
  const o = get(pending, "overview");
  assert.equal(facts(get(pending, "execution")).find(f => f.label === "Recorded")!.value, "Pending"); // C7F: the recorded state lives in Execution
   assert.equal(facts(o).find(f => f.label === "Output")!.value, "No output recorded");
  assert.match(text(o), /has not run[\s\S]*Finished upstream departments do not make it complete/);
  assert.equal(/completed|complete\b/i.test(text(o).replace(/do not make it complete/, "")), false);
  assert.equal(workbenchContentOf(pending, TR(pending), "output"), null); assert.equal(workbenchContentOf(pending, TR(pending), "review"), null);
  const flatText = fixture({ review: FLAT });
  const fcaps = workbenchCapabilities(flatText, TR(flatText))!;
  assert.equal(fcaps.sections.some(s => s.id === "review"), false, "no parsed sections -> no Review tab; nothing invented");
  assert.equal(of(get(flatText, "output"), "text")[0].text, FLAT); assert.match(text(get(flatText, "overview")), /No recognisable section headings[\s\S]*shown as written in Output/);
  const err = fixture({ error: "boom sk-abcdefghijklmnop123456" });
  assert.match(text(get(err, "overview")), /Error: boom/); assert.equal(text(get(err, "overview")).includes("sk-abc"), false);
}

// 12. No generic placeholder for Team Review; only registry sections; QA and ambiguity stay uncovered.
{
  for (const o of [{}, { review: PARTIAL, usage: true }, { review: UNKNOWN }, { review: FLAT }, { pending: true }, { dup: true }] as Opts[]) {
    const wt = fixture(o), caps = workbenchCapabilities(wt, TR(wt))!;
    assert.equal(caps.profile, "review");
    for (const sec of caps.sections) { const c = workbenchContentOf(wt, TR(wt), sec.id); assert.ok(c, `content for ${sec.id}`); assert.equal(/content arrives in W5\.3/i.test(text(c)), false); }
    for (const c of caps.capabilities.filter(x => !x.visible)) assert.equal(workbenchContentOf(wt, TR(wt), c.id), null);
    assert.deepEqual(caps.sections.map(s => s.id).filter(id => !["overview", "inputs", "execution", "review", "output", "usage"].includes(id)), [], "no tab beyond the W5.1 contract");
  }
}
console.log("test-dive-mission-worktree-workbench-review: all W5.3C1 Team Review contract checks passed");
