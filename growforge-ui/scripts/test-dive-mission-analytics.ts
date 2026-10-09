import assert from "node:assert/strict";
import type { Job, JobStep } from "../src/lib/jobStore";
import type { UsageRecord } from "../src/lib/usage";
import { buildMissionWorktree, type MissionWorktree } from "../src/components/spatial/dive/missionWorktree";
import { analyticsOf, analyticsPeekHeight, compactNumber, formatDuration, type Analytics } from "../src/components/spatial/dive/missionAnalytics";
import { peekOf, visibleFacts } from "../src/components/spatial/dive/missionWorktreePeek";
import { workbenchContentOf } from "../src/components/spatial/dive/missionWorkbenchContent";

/** W7.2: every number the analytics surface shows has a deterministic source in the canonical Worktree. Pure fixtures; nothing is read or written. */
const T0 = "2026-10-01T10:00:00.000Z";
const at = (s: number) => new Date(Date.parse(T0) + s * 1000).toISOString();
const rec = (model: string, i: number | null, o: number | null, ms = 2000, provider = "ollama"): UsageRecord => ({ provider, model, inputTokens: i, outputTokens: o, durationMs: ms, timestamp: at(5) });
const step = (id: string, kind: JobStep["kind"], over: Partial<JobStep> = {}): JobStep => ({ id, kind, label: id, activity: "", status: "done", percent: 100, weight: 10, dependsOn: [], ...over });
function mission(o: { model?: string; usage?: boolean; partial?: boolean; failed?: boolean; percent?: number } = {}): MissionWorktree {
  const model = o.model ?? "qwen2.5:7b-instruct";
  const u = (i: number, out: number) => (o.usage === false ? undefined : [rec(model, o.partial ? null : i, out)]);
  const steps: JobStep[] = [
    step("brief", "brief", { startedAt: at(0), finishedAt: at(1) }),
    step("plan", "plan", { dependsOn: ["brief"], startedAt: at(1), finishedAt: at(11), provider: "ollama", usage: u(3000, 400), output: "plan" }),
    step("research", "research", { dependsOn: ["plan"], startedAt: at(11), finishedAt: at(14) }),
    step("dept:a", "department", { departmentId: "marketing", dependsOn: ["research"], startedAt: at(14), finishedAt: at(34), provider: "ollama", usage: u(2000, 700), output: "x".repeat(1234) }),
    step("dept:b", "department", { departmentId: "sales-bd", dependsOn: ["research"], startedAt: at(14), finishedAt: at(44), provider: "ollama", usage: u(2000, 900), status: o.failed ? "error" : "done", error: o.failed ? "429 quota" : undefined }),
    step("reconcile", "reconcile", { dependsOn: ["dept:a", "dept:b"], startedAt: at(44), finishedAt: at(54), provider: "ollama", usage: u(2000, 600) }),
    step("qa", "qa", { dependsOn: ["reconcile"], startedAt: at(54), finishedAt: at(64), provider: "ollama", usage: u(2000, 500), output: "### Verdict\n**Verdict:** PASS" }),
    step("final", "final", { dependsOn: ["qa"], startedAt: at(64), finishedAt: at(74), provider: "ollama", usage: u(2000, 800) }),
  ];
  const job: Job = { id: "job-an", title: "M", brief: "b", status: "done", percent: o.percent ?? 100, verified: true, steps, createdAt: T0, updatedAt: at(80), finishedAt: at(80), liveNotes: [], revisions: [{ id: "r1", message: "change", createdAt: at(90), effect: "queued" }],
    planSnapshot: { title: "T", researchQuestions: [], assignments: [{ departmentId: "marketing", task: "t", activity: "a" }, { departmentId: "sales-bd", task: "t", activity: "a" }] } };
  return buildMissionWorktree({ job });
}
const metric = (a: Analytics, label: string) => a.groups.flatMap(g => g.metrics).find(m => m.label === label);
const tile = (a: Analytics, label: string) => a.tiles.find(m => m.label === label);
const sumTokens = (wt: MissionWorktree, ids?: string[]) => wt.usage.filter(u => !ids || ids.includes(u.stepId)).reduce((n, u) => n + (u.inputTokens ?? 0) + (u.outputTokens ?? 0), 0);

// 1. Mission: every number is a sum / count of canonical records, and each carries its source.
{
  const wt = mission(), a = analyticsOf(wt, wt.mission.id)!;
  assert.equal(a.kind, "mission");
  assert.equal(a.headline.percent, 100); assert.match(a.headline.source, /job\.percent/);
  assert.equal(tile(a, "API calls")!.value, String(wt.usage.length), "API calls = the recorded usage records");
  assert.equal(tile(a, "Tokens")!.value, compactNumber(sumTokens(wt)), "tokens = provider-reported input + output over every recorded call");
  assert.equal(metric(a, "API calls")!.value, "6");
  assert.equal(tile(a, "Steps")!.value, `${wt.steps.length}/${wt.steps.length}`, "steps = done / recorded");
  assert.equal(metric(a, "Elapsed")!.value, formatDuration(80_000), "elapsed = finishedAt - createdAt");
  assert.equal(metric(a, "Requested changes")!.value, "1");
  assert.equal(metric(a, "QA verdict")!.value, "PASS"); assert.match(metric(a, "QA verdict")!.source, /Verdict/);
  assert.equal(a.composition!.segments.reduce((n, s) => n + s.count, 0), wt.steps.length, "the state bar accounts for every recorded step");
  for (const m of [...a.tiles, ...a.groups.flatMap(g => g.metrics)]) assert.ok(m.source.length > 8, `${m.label} states where it comes from`);
  assert.ok(a.split && a.split.input + a.split.output === sumTokens(wt), "the input / output split is the reported tokens, and only when every call reported both");
}

// 2. Cost truth: billed is never recorded; the price-table estimate is separate and never a bill; a free / local model is not "$0".
{
  const local = analyticsOf(mission(), mission().mission.id)!;
  assert.equal(local.cost.billed, "Not recorded"); assert.equal(local.cost.estimate, "$0.00"); assert.match(local.cost.estimateNote, /not a bill/i);
  assert.equal(local.cost.estimate, "$0.00"); assert.ok(!/Billed[^"]*\$/.test(JSON.stringify(local.cost.billed)), "the $0.00 is the labelled price-table estimate; billed cost stays Not recorded");
  const priced = mission({ model: "gpt-4o-mini" }), pa = analyticsOf(priced, priced.mission.id)!;
  assert.match(pa.cost.estimate, /^≈ \$\d/); assert.equal(pa.cost.billed, "Not recorded"); assert.match(pa.cost.estimateNote, /Not billed spend/);
  assert.equal(metric(pa, "Billed cost")!.value, "Not recorded"); assert.match(metric(pa, "Estimated cost")!.sub!, /not spend/);
  const unpriced = mission({ model: "some-unpriced-model-x" }), ua = analyticsOf(unpriced, unpriced.mission.id)!;
  assert.equal(ua.cost.estimate, "Not available", "an unpriced model has no estimate (never a guess)");
  const none = mission({ usage: false }), na = analyticsOf(none, none.mission.id)!;
  assert.equal(tile(na, "API calls")!.value, "Not recorded"); assert.equal(tile(na, "Tokens")!.value, "Not recorded"); assert.equal(na.cost.estimate, "No usage recorded");
  assert.equal(na.split, undefined, "no tokens, no split");
  const part = mission({ partial: true }), qa = analyticsOf(part, part.mission.id)!;
  assert.match(tile(qa, "Tokens")!.sub!, /partial/); assert.equal(qa.split, undefined, "a split needs every call to report both counts");
}

// 3. Percentages are real: recorded as recorded, or done / recorded steps; no denominator, no percent.
{
  const wt = mission({ failed: true, percent: 83 }), m = analyticsOf(wt, wt.mission.id)!;
  assert.equal(m.headline.percent, 83, "the mission percent is the recorded percent, not recomputed");
  const dept = wt.departments.find(d => d.id === wt.steps.find(s => s.recordedId === "dept:b")!.departmentId)!, d = analyticsOf(wt, dept.id)!;
  assert.equal(d.headline.percent, 0); assert.match(d.headline.source, /Derived: done steps \/ recorded steps/);
  const ok = analyticsOf(wt, wt.steps.find(s => s.recordedId === "dept:a")!.departmentId!)!;
  assert.equal(ok.headline.percent, 100);
  const phase = analyticsOf(wt, wt.phases.find(p => p.key === "qa")!.id)!;
  assert.equal(phase.headline.percent, 100); assert.match(phase.headline.source, /single step|own recorded percent/);
  const sector = analyticsOf(wt, wt.phases.find(p => p.key === "departments")!.id)!;
  assert.equal(sector.headline.percent, 50, "Departments phase: 1 of 2 steps done (derived)");
  assert.ok(m.composition!.segments.some(s => s.status === "error" && s.count === 1), "a failed step is counted as failed");
}

// 4. Attribution: usage belongs to the step that recorded it; a phase / department total is the sum over its own steps.
{
  const wt = mission(), dept = wt.departments.find(d => d.id === wt.steps.find(s => s.recordedId === "dept:a")!.departmentId)!, a = analyticsOf(wt, dept.id)!;
  assert.equal(tile(a, "API calls")!.value, "1"); assert.equal(tile(a, "Tokens")!.value, compactNumber(sumTokens(wt, dept.stepIds)));
  const sector = analyticsOf(wt, wt.phases.find(p => p.key === "departments")!.id)!, ids = wt.departments.flatMap(d => d.stepIds);
  assert.equal(tile(sector, "API calls")!.value, String(wt.usage.filter(u => ids.includes(u.stepId)).length));
  assert.equal(sector.distributions[0].title, "Tokens by department"); assert.equal(sector.distributions[0].rows.length, 2);
  const m = analyticsOf(wt, wt.mission.id)!;
  assert.ok(m.distributions.some(d => d.title === "Tokens by department") && m.distributions.some(d => d.title === "Tokens by phase"), "real distributions (two or more rows) are drawn");
  assert.ok(!m.distributions.some(d => d.title.includes("model")), "one model is a number, not a chart");
  const two = mission(); two.usage[0] = { ...two.usage[0], model: "other-model" };
  assert.ok(analyticsOf(two, two.mission.id)!.distributions.some(d => d.title.includes("model")), "two models make a real distribution");
  for (const row of m.distributions.flatMap(d => d.rows)) assert.match(row.display, /\d+%$/);
  const st = wt.steps.find(s => s.recordedId === "dept:a")!, sa = analyticsOf(wt, st.id)!;
  assert.equal(sa.kind, "step"); assert.equal(tile(sa, "Duration")!.value, formatDuration(20_000)); assert.equal(tile(sa, "Provider")!.value, "ollama"); assert.equal(tile(sa, "Provider")!.sub, "qwen2.5:7b-instruct");
  assert.equal(tile(sa, "Output")!.value, "1.2k chars"); assert.match(metric(sa, "Recorded state")!.source, /executor evidence is not recorded/i, "no executor identity is inferred");
  const noOut = analyticsOf(wt, wt.steps.find(s => s.recordedId === "dept:b")!.id)!;
  assert.equal(tile(noOut, "Output")!.value, "None");
  const empty = buildMissionWorktree({ job: { id: "job-e", title: "E", brief: "b", status: "done", percent: 100, verified: false, steps: [], createdAt: T0, updatedAt: T0, liveNotes: [], revisions: [] } });
  const e = analyticsOf(empty, empty.mission.id)!;
  assert.equal(e.composition, undefined, "no steps, no composition bar"); assert.equal(tile(e, "Steps")!.value, "None");
}

// 5. Nothing decorative: no scores, health, efficiency or confidence; unknown / marker ids have no analytics; the Peek hides only what the header already carries.
{
  const wt = mission(), all = [wt.mission.id, ...wt.phases.map(p => p.id), ...wt.departments.map(d => d.id), ...wt.steps.map(s => s.id)];
  for (const id of all) {
    const a = analyticsOf(wt, id)!;
    assert.ok(a, id); assert.ok(!/efficien|health|score|confidence|rating|trend/i.test(JSON.stringify(a)), `${id}: no invented measure`);
    assert.ok(a.tiles.length === 6 && analyticsPeekHeight(a) > 100);
    const peek = peekOf(wt, id)!;
    assert.equal(peek.analytics?.entityId, id);
    assert.ok(visibleFacts(peek).every(f => !a.covers.includes(f.label)) && visibleFacts(peek).length <= peek.facts.length);
  }
  assert.equal(analyticsOf(wt, null), null); assert.equal(analyticsOf(wt, "step:nope"), null);
  // The Workbench Overview of every profile opens with the same instrument; the Departments sector (previously a placeholder) has real content.
  for (const id of all) { const c = workbenchContentOf(wt, id, "overview"); assert.ok(c && c.blocks[0].kind === "analytics", `${id}: Workbench Overview opens with the analytics instrument`); }
  const sector = wt.phases.find(p => p.key === "departments")!.id;
  assert.ok(workbenchContentOf(wt, sector, "execution"), "Departments phase Execution has real content");
  assert.ok(workbenchContentOf(wt, wt.mission.id, "usage"), "the Usage section stays");
}
console.log("test-dive-mission-analytics: every metric carries its source; billed != estimate; percentages have denominators; usage attributed only through recorded steps");

// C7G timeline (grouping by verified department): a group is a WINDOW (earliest start to latest finish), never a sum of durations; a department is named only when `step.departmentId` resolves to a recorded department; generic kind wording is never a name.
{
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/components/spatial/dive/missionAnalytics.ts", import.meta.url), "utf8");
  const tl = src.slice(src.indexOf("export function executionTimelineOf"));
  assert.ok(/worktree\.departments\.find\(d => d\.id === s\.departmentId\)/.test(tl) && /startMs: Math\.min\(/.test(tl) && /endMs: Math\.max\(/.test(tl), "groups are keyed by a verified department and use the min start / max end window");
  assert.equal(/reduce\(\([^)]*\) => [^)]*\+\s*\(?[a-z]+\.endMs\s*-\s*[a-z]+\.startMs/.test(tl), false, "overlapping durations are never summed");
  assert.ok(/labelSource === "recorded-label" \? r\.label : `Step \$\{i \+ 1\}`/.test(tl), "a step without a recorded label of its own is Step N inside its department");
  assert.ok(/omitted: steps\.length - rows\.length/.test(tl), "steps without both stamps are counted, not drawn, not guessed");
}
