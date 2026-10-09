import assert from "node:assert/strict";
import type { Job, JobStep } from "../src/lib/jobStore";
import { buildMissionWorktree, type MissionWorktree } from "../src/components/spatial/dive/missionWorktree";
import { initialSelection, reduceSelection, type SelectionAction, type WorktreeSelection } from "../src/components/spatial/dive/missionWorktreeSelection";
import { workbenchCapabilities } from "../src/components/spatial/dive/missionWorkbench";
import { safeHttpUrl, workbenchContentOf, type Block, type WorkbenchContent } from "../src/components/spatial/dive/missionWorkbenchContent";

/** W5.3B contract: Live Research Workbench content (questions, findings, sources, output, usage, dependencies). Pure model, no React. */
const T = "2026-10-01T10:00:00.000Z", T2 = "2026-10-01T10:02:30.000Z";
const step = (id: string, kind: JobStep["kind"], over: Partial<JobStep> = {}): JobStep => ({ id, kind, label: id, activity: "a", status: "done", percent: 100, weight: 10, dependsOn: [], ...over });
interface Opts { sources?: number; questions?: string[]; findings?: number; status?: JobStep["status"]; error?: string; verified?: boolean; usage?: boolean; dupDep?: boolean; noPlan?: boolean; rawOutput?: string; badUris?: boolean; pending?: boolean }
const OUTPUT_FOR = (n: number, sources: number) => Array.from({ length: n }, (_, i) => `### Finding ${i + 1}: Question number ${i + 1}?\nThe answer **${i + 1}** is long enough to wrap, see [${(i % Math.max(1, sources)) + 1}] and [${sources + 3}].\n- point a\n- point b\nSources: ${sources ? `[${(i % sources) + 1}]` : "none returned"}`).join("\n\n");
function fixture(o: Opts = {}): MissionWorktree {
  const sources = o.sources ?? 3, findings = o.findings ?? 3;
  const steps: JobStep[] = [step("brief", "brief"), step("plan", "plan", { dependsOn: ["brief"] })];
  steps.push(step("research", "research", {
    dependsOn: o.dupDep ? ["plan", "dup"] : ["plan"], startedAt: T, finishedAt: T2, status: o.pending ? "pending" : o.status ?? "done", percent: o.pending ? 0 : 100, ...(o.error ? { error: o.error } : {}),
    output: o.pending ? undefined : o.rawOutput ?? OUTPUT_FOR(findings, sources),
    sources: Array.from({ length: sources }, (_, i) => ({ title: o.badUris && i === 0 ? "" : `Source title ${i + 1}`, uri: o.badUris ? ["javascript:alert(1)", "https://user:pw@evil.example/x", "ftp://files.example/a", "https://www.example.com/path?q=1"][i % 4] : `https://www.site${i + 1}.example.com/article/${i + 1}` })),
    ...(o.usage ? { usage: [{ provider: "ollama", model: "qwen2.5:7b-instruct", inputTokens: 100, outputTokens: 50, durationMs: 1200, timestamp: T }, { provider: "gemini", model: "gemini-2.5-flash", inputTokens: 2000, outputTokens: 800, durationMs: 3400, timestamp: T2 }] } : {}) }));
  steps.push(step("dup", "department", { departmentId: "sales-bd", dependsOn: o.dupDep ? [] : ["research"] }), step("dup", "department", { departmentId: "marketing", dependsOn: o.dupDep ? [] : ["research"] }), step("dept-a", "department", { departmentId: "finance-ops", dependsOn: ["research"] }));
  steps.push(step("reconcile", "reconcile", { dependsOn: ["dept-a"] }), step("qa", "qa", { dependsOn: ["reconcile"] }), step("final", "final", { dependsOn: ["qa"] }));
  const job: Job = { id: "job-w53b", title: "Research Mission", brief: "b", status: "done", percent: 80, verified: o.verified ?? true, steps, createdAt: T, updatedAt: T2, liveNotes: [], revisions: [],
    ...(o.noPlan ? {} : { planSnapshot: { title: "T", researchQuestions: o.questions ?? ["Q one?", "Q two?"], assignments: [] } }) };
  return buildMissionWorktree({ job });
}
const run = (wt: MissionWorktree, state: WorktreeSelection, ...actions: SelectionAction[]) => actions.reduce((s, a) => reduceSelection(s, a, wt), state);
const LR = (wt: MissionWorktree) => wt.phases.find(p => p.key === "live-research")!.id;
const get = (wt: MissionWorktree, section: Parameters<typeof workbenchContentOf>[2]) => workbenchContentOf(wt, LR(wt), section)!;
const flat = (blocks: Block[]): Block[] => blocks.flatMap(b => (b.kind === "group" ? [b, ...flat(b.blocks)] : [b]));
const of = <K extends Block["kind"]>(c: WorkbenchContent, kind: K) => flat(c.blocks).filter((b): b is Extract<Block, { kind: K }> => b.kind === kind);
import { breakdownCostText as __bdc, type UsageBreakdown as __UB } from "../src/components/spatial/dive/missionAnalytics";
const bdText = (b: __UB): string => [`Billed cost: ${b.billed}`, `Total: ${b.total.calls} calls · in ${b.total.inputTokens} · out ${b.total.outputTokens} · estimate ${__bdc(b.total.cost)} · ${b.total.cost.state}`, ...b.contributors.map(c => `${c.key}: ${c.calls} calls · in ${c.inputTokens} · out ${c.outputTokens} · estimate ${__bdc(c.cost)} · ${c.cost.state}`)].join("\n");
const text = (c: WorkbenchContent | null): string => flat(c?.blocks ?? []).map(b => b.kind === "depmap" ? `needs ${b.needs} waits ${b.waits} unresolved ${b.unresolved}` : b.kind === "usageBreakdown" ? bdText(b.breakdown) : b.kind === "facts" ? b.facts.map(f => `${f.label}: ${f.value}${f.provenance ? ` [${f.provenance}]` : ""}`).join("\n") : b.kind === "group" ? b.title : b.kind === "note" ? b.text : b.kind === "text" ? b.text : b.kind === "inquiry" ? b.rows.map(r => `${r.mark} ${r.text}`).join("\n")
  : b.kind === "findings" ? b.rows.map(r => `${r.mark} ${r.heading} ${r.text} ${r.refs.join(",")}`).join("\n") : b.kind === "sources" ? b.rows.map(r => `${r.mark} ${r.title} ${r.uri} ${r.origin ?? ""}`).join("\n") : b.kind === "usage" ? b.rows.map(r => `${r.title} ${r.meta} ${r.estimate}`).join("\n")
  : b.kind === "review" ? b.rows.map(r => `${r.mark} ${r.heading} ${r.text}`).join(String.fromCharCode(10))
  : b.kind === "relations" ? b.items.map(i => `${i.label} ${i.detail ?? ""}`).join("\n") : b.kind === "empty" ? b.text : b.kind === "unavailable" ? `${b.label} ${b.reason}` : "").join("\n");
const targets = (c: WorkbenchContent) => of(c, "relations").flatMap(b => b.items.flatMap(i => (i.target ? [i.target] : [])));

// 1. Every recorded question is kept, in order, whole.
{
  const qs = Array.from({ length: 7 }, (_, i) => `Question ${i + 1}: ${"long ".repeat(i === 3 ? 60 : 2)}end?`);
  const wt = fixture({ questions: qs });
  const rows = of(get(wt, "questions"), "inquiry")[0].rows;
  assert.deepEqual(rows.map(r => r.text), qs, "all questions, in recorded order, untruncated");
  assert.deepEqual(rows.map(r => r.mark), ["Q01", "Q02", "Q03", "Q04", "Q05", "Q06", "Q07"]);
  assert.match(text(get(wt, "questions")), /not marked answered/);
  assert.equal(/answered by|answer:/i.test(rows.map(r => r.text).join(" ")), false);
  const none = fixture({ noPlan: true });
  assert.equal(workbenchCapabilities(none, LR(none))!.sections.some(s => s.id === "questions"), false, "no plan snapshot -> no Questions section");
  assert.equal(workbenchContentOf(none, LR(none), "questions"), null);
}

// 2. Every source is kept (0, 1, 26), in order; link safety; no inference.
{
  for (const n of [1, 26]) {
    const wt = fixture({ sources: n });
    const rows = of(get(wt, "sources"), "sources")[0].rows;
    assert.equal(rows.length, n, `${n} sources all inspectable`);
    assert.deepEqual(rows.map(r => r.mark), Array.from({ length: n }, (_, i) => `[${i + 1}]`));
    assert.deepEqual(rows.map(r => r.uri), Array.from({ length: n }, (_, i) => `https://www.site${i + 1}.example.com/article/${i + 1}`));
    assert.equal(rows[0].domain, "site1.example.com"); assert.ok(rows[0].href?.startsWith("https://"));
  }
  const zero = fixture({ sources: 0 });
  assert.equal(of(get(zero, "sources"), "sources").length, 0);
  assert.match(text(get(zero, "sources")), /No source is recorded for this research/);
  const bad = of(get(fixture({ sources: 4, badUris: true }), "sources"), "sources")[0].rows;
  assert.equal(bad[0].href, undefined, "javascript: is never a link"); assert.equal(bad[1].href, undefined, "credentials in a URL are never a link"); assert.equal(bad[2].href, undefined, "ftp: is never a link"); assert.equal(bad[3].href, "https://www.example.com/path?q=1");
  assert.equal(bad[0].title, "javascript:alert(1)", "an empty title falls back to what is recorded (the URI), never an invented publisher");
  assert.equal(safeHttpUrl("not a url"), null); assert.equal(safeHttpUrl("http://a.example/x")!.domain, "a.example");
  const joined = text(get(fixture({ sources: 3 }), "sources"));
  assert.equal(/publisher|author|credib|trust|reliab|published on/i.test(joined), false, "no inferred publisher / date / author / credibility");
}

// 3 + 4. Findings: parsed from text; [n] markers are neutral references, never structured support.
{
  const wt = fixture({ sources: 3, findings: 4 });
  const ov = get(wt, "overview");
  assert.equal((of(ov, "facts")[0].facts.find(f => f.label === "Findings")!).provenance, "Parsed from text");
  const fc = get(wt, "findings");
  assert.match(text(fc), /Parsed from text/); assert.match(text(fc), /not a recorded claim → source mapping/);
  const rows = of(fc, "findings")[0].rows;
  assert.deepEqual(rows.map(r => r.mark), ["F01", "F02", "F03", "F04"], "original order");
  assert.deepEqual(rows[0].refs, [1, 6], "markers exactly as they appear in the recorded text"); assert.deepEqual(rows[0].unmatched, [6], "a marker with no recorded source position is flagged neutrally");
  assert.equal(rows[0].text.includes("The answer **1**"), true, "finding text preserved");
  const all = text(fc) + text(get(wt, "sources"));
  assert.equal(/supported by|support(s|ed)? |verified by|verif(y|ies)|backed by|proven|evidence for/i.test(all.replace(/not a recorded claim → source mapping/g, "").replace(/is recorded, not verified/g, "").replace(/says nothing about which claim it supports/g, "")), false, "no sentence upgrades a marker into verification");
  for (const f of of(fc, "findings")[0].rows) assert.equal("target" in f, false, "a finding has no link to a source entity");
  for (const s of of(get(wt, "sources"), "sources")[0].rows) assert.equal("target" in s, false);
  // Sources carry source-level facts only: no derived Finding -> Source wording unless a structured relationship is recorded (none is).
  const srcBlock = get(wt, "sources"), src = of(srcBlock, "sources")[0].rows;
  for (const row of src) { assert.deepEqual(Object.keys(row).sort(), ["domain", "href", "mark", "origin", "title", "uri"], "a source row holds only source-level fields"); }
  const srcText = text(srcBlock);
  assert.equal(/mention|cited|citation|belongs? to|supports?|supported|verif(y|ies|ied by)|backs?|finding/i.test(srcText.replace(/A source here is recorded, not verified\./, "")), false, "no finding -> source wording in the Sources ledger");
  assert.equal(of(srcBlock, "sources").flatMap(b => b.rows).some(r => "mentionedIn" in r || "mentioned" in r || "citedIn" in r), false);
  const rendered = (await import("node:fs")).readFileSync(new URL("../src/components/spatial/dive/WorkbenchReading.tsx", import.meta.url), "utf8");
  assert.equal(/mentioned|mentionedIn|cited/i.test(rendered.slice(rendered.indexOf("function Sources"), rendered.indexOf("function BlockView"))), false, "the Sources renderer has no such wording either");
  assert.match(rendered, /References appearing in recorded text/, "the Findings section keeps its literal-reference wording"); assert.match(text(fc), /not a recorded claim → source mapping/);
  const none = of(get(fixture({ sources: 0 }), "findings"), "findings")[0].rows;
  assert.equal(none.every(r => r.textSaysNoSources), true, "'none returned' in the text is reported as what the text says");
}

// 5. Zero-source research is visibly distinct from sourced and from verified research.
{
  const sourced = fixture({ sources: 5, verified: true }), zero = fixture({ sources: 0, verified: false }), unverified = fixture({ sources: 5, verified: false });
  const fact = (wt: MissionWorktree, label: string) => of(get(wt, "overview"), "facts")[0].facts.find(f => f.label === label)!;
  assert.equal(fact(sourced, "Evidence").value, "5 sources recorded"); assert.equal(fact(sourced, "Evidence").tone, undefined);
  assert.equal(fact(zero, "Evidence").value, "No source recorded"); assert.equal(fact(zero, "Evidence").tone, "alert");
  assert.match(text(get(zero, "overview")), /the evidence is missing/);
  assert.equal(/evidence is missing/.test(text(get(sourced, "overview"))), false);
  const factE = (wt: MissionWorktree, label: string) => of(get(wt, "execution"), "facts")[0].facts.find(f => f.label === label)!; // C7F: the verified flag lives in Execution
  assert.match(factE(unverified, "Verified flag").value, /^Not set/); assert.equal(fact(unverified, "Evidence").value, "5 sources recorded", "having sources is not verification");
  assert.match(factE(sourced, "Verified flag").value, /^Set/);
  assert.equal(fact(zero, "Sources").value, "0");
  const pending = fixture({ sources: 0, pending: true });
  assert.equal(fact(pending, "Evidence").value, "No source recorded yet"); assert.equal(/evidence is missing/.test(text(get(pending, "overview"))), false, "a research step that has not run is not 'missing evidence'");
}

// 6. error + 100% progress stays representable; recorded error is sanitised.
{
  const wt = fixture({ status: "error", error: "429 quota exceeded for sk-abcdefghijklmnop123456" });
  const f = of(get(wt, "overview"), "facts")[0].facts, fe = of(get(wt, "execution"), "facts")[0].facts; // C7F: Recorded / Progress live in Execution
  assert.equal(fe.find(x => x.label === "Recorded")!.value, "Error"); assert.equal(fe.find(x => x.label === "Progress")!.value, "100% recorded");
  assert.match(text(get(wt, "overview")), /not reconciled/); assert.equal(text(get(wt, "overview")).includes("sk-abc"), false); assert.match(f.find(x => x.label === "Error")!.value, /429 quota/); assert.equal(f.some(x => x.label === "Recorded" || x.label === "Progress"), false, "the Overview no longer repeats them");
}

// 7. The raw recorded output is preserved untouched (formatting is the renderer's job, never a rewrite).
{
  const raw = "# Raw\n\n<script>alert(1)</script>\n\n- a\n- b\n\n```\ncode\n```\n[1] and **bold**";
  const wt = fixture({ rawOutput: raw });
  const out = of(get(wt, "output"), "text")[0];
  assert.equal(out.text, raw); assert.equal(out.chars, raw.length); assert.equal(out.format, "markdown");
  const css = (await import("node:fs")).readFileSync(new URL("../src/components/spatial/dive/WorkbenchReading.tsx", import.meta.url), "utf8");
  assert.equal(/dangerouslySetInnerHTML|innerHTML/.test(css), false, "no raw HTML is ever rendered");
  const long = fixture({ rawOutput: "line\n".repeat(5000) });
  assert.equal(of(get(long, "output"), "text")[0].text.length, 25000, "a long output is not truncated");
}

// 8. Usage: estimate, not bill.
{
  const wt = fixture({ usage: true });
  const u = get(wt, "usage"), t = text(u);
  assert.match(t, /Billed cost: Not recorded/); assert.match(t, /ollama · qwen2\.5:7b-instruct[\s\S]*\$0\.00 price-table estimate/); assert.match(t, /≈ \$/); assert.equal(/Billed cost: \$/.test(t), false, "a known $0.00 estimate is never worded as a billed cost");
  assert.equal(of(u, "usage")[0].rows.length, 2);
  const none = fixture();
  assert.equal(workbenchCapabilities(none, LR(none))!.sections.some(s => s.id === "usage"), false, "no usage recorded -> no Usage section");
}

// 9 + 10. Dependencies: resolved are selectable, unresolved are never guessed.
{
  const wt = fixture();
  const deps = get(wt, "dependencies");
  const tg = targets(deps);
  assert.ok(tg.includes(wt.phases.find(p => p.key === "planning")!.id), "Needs first: Planning");
  assert.ok(tg.some(id => wt.steps.find(s => s.id === id)?.recordedId === "dept-a"), "Waits on this: a department step");
  const dupFx = fixture({ dupDep: true });
  const dc = get(dupFx, "dependencies");
  const dups = dupFx.steps.filter(s => s.recordedId === "dup").map(s => s.id);
  assert.equal(dups.length, 2);
  assert.match(text(dc), /Unresolved/); assert.match(text(dc), /matches more than one step|matches no recorded step/);
  for (const d of dups) assert.equal(targets(dc).includes(d), false, "an ambiguous reference never offers a candidate");
  assert.deepEqual(targets(dc).filter(t => t.startsWith("ambiguity:")), [`ambiguity:${LR(dupFx)}`], "only the explanation entity");
}

// 11. Selecting a related entity keeps the Workbench open on the canonical selection; section memory per entity.
{
  const wt = fixture({ usage: true });
  let s = run(wt, initialSelection(wt, "graph"), { type: "select", id: LR(wt) }, { type: "openWorkbench" }, { type: "setSection", section: "sources" });
  const target = targets(get(wt, "dependencies")).find(id => id.startsWith("step:"))!;
  s = run(wt, s, { type: "select", id: target });
  assert.equal(s.depth, "workbench"); assert.equal(s.selectedId, target); assert.equal(s.section, "overview", "the new entity's default (Sources is not a Step section)");
  s = run(wt, s, { type: "select", id: LR(wt) });
  assert.equal(s.section, "sources", "Live Research remembers its section"); assert.equal(s.depth, "workbench");
  assert.equal(run(wt, s, { type: "escape" }).depth, "peek");
}

// 12. No generic placeholder remains for Live Research; only registry-visible sections have content.
{
  for (const opts of [{}, { sources: 0, usage: true }, { sources: 26, usage: true, findings: 5 }, { sources: 1 }] as Opts[]) {
    const wt = fixture(opts), caps = workbenchCapabilities(wt, LR(wt))!;
    assert.equal(caps.profile, "research");
    for (const sec of caps.sections) { const c = workbenchContentOf(wt, LR(wt), sec.id); assert.ok(c, `content for ${sec.id}`); assert.equal(/content arrives in W5\.3/i.test(text(c)), false); }
    for (const c of caps.capabilities.filter(x => !x.visible)) assert.equal(workbenchContentOf(wt, LR(wt), c.id), null);
    assert.deepEqual(caps.sections.map(s => s.id).filter(id => !["overview", "questions", "findings", "sources", "execution", "output", "usage", "dependencies"].includes(id)), [], "no tab beyond the W5.1 registry");
  }
}
console.log("test-dive-mission-worktree-workbench-research: all W5.3B Live Research contract checks passed");
