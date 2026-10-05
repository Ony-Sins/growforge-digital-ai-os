import { NORA_MORPH_PARAMS, NORA_MORPH_STATES, noraMorphState } from "../src/components/spatial/dive/noraMorphModel";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildOverviewSnapshot, type ApprovalFacts, type JobFacts, type OverviewInput } from "../src/lib/overviewSnapshot";
import {
  ageLabel, attentionRows, ATTENTION_ROWS_VISIBLE, activityGraph, briefState, briefStatus, displayTitle, EVIDENCE_LABEL, healthRows, liveStatusText, nowView, operationalStrip, recentRows,
  RECENT_ROWS_VISIBLE, REASON_LABEL, shortDate, snapshotCounts, stageStatusLabel,
} from "../src/components/spatial/dive/overviewBriefingModel";
import { buildActivitySeries } from "../src/lib/overviewSnapshot";
import { noraStageLevel, noraStageParams } from "../src/components/spatial/dive/noraStageModel";
import { LENS_GLYPH } from "../src/components/spatial/GrowForgeGlyph";
import { DIVE_LENSES } from "../src/components/spatial/dive/overviewModel";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const NOW = Date.parse("2026-10-05T12:00:00Z");
const H = 3600_000, D = 24 * H;
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const job = (id: string, o: Partial<JobFacts> = {}): JobFacts => ({ id, title: `Mission ${id}`, status: "done", percent: 100, createdAt: ago(2 * D), updatedAt: ago(2 * D), finishedAt: ago(2 * D), isTest: false, interrupted: false, verified: true, ...o });
const running = (id: string, o: Partial<JobFacts> = {}) => job(id, { status: "running", percent: 40, updatedAt: ago(H), finishedAt: undefined, activeStep: "Plan", ...o });
const failed = (id: string, ageMs: number, o: Partial<JobFacts> = {}) => job(id, { title: `Failed ${id}`, status: "error", error: "x", updatedAt: ago(ageMs), finishedAt: ago(ageMs), ...o });
const approval = (id: string, jobId: string, o: Partial<ApprovalFacts> = {}): ApprovalFacts => ({ id, jobId, jobTitle: `Mission ${jobId}`, stepLabel: "QA", toolName: "t", status: "pending", createdAt: ago(H), ...o });
const input = (o: Partial<OverviewInput> = {}): OverviewInput => ({
  now: NOW, mode: "live", executor: { available: true, jobsExecuting: [], agentsExecuting: [] }, jobs: [], approvals: [], consultations: [], agents: [],
  probes: [{ id: "ollama", label: "Local LLM (Ollama)", online: true, detail: "ok", latencyMs: 9 }], systems: { mcpServers: 1, mcpTools: 2, models: 1, routing: "local-first", notesVaultReachable: true }, financeTrackedModules: 0, ...o,
});
const snap = (o: Partial<OverviewInput> = {}) => buildOverviewSnapshot(input(o));
const cell = (s: ReturnType<typeof snap> | null, id: string) => operationalStrip(s).find(c => c.id === id)!;
const review = { mode: "owner-review" as const, executor: { available: false, jobsExecuting: [], agentsExecuting: [] } };

// 1. SUMMARY: four parts; never implies execution from a persisted `running` record.
{
  assert.deepEqual(operationalStrip(snap()).map(c => c.id), ["state", "executing", "approvals", "services"]);
  const owner = snap({ ...review, jobs: [running("j1", { updatedAt: ago(6 * D) })] });
  assert.equal(cell(owner, "executing").value, "—", "no executor here: execution cannot be confirmed, so no number");
  assert.equal(cell(owner, "executing").caption, "Not confirmable here"); assert.equal(cell(owner, "executing").tone, "muted");
  const none = snap({ jobs: [running("j1")] });
  assert.equal(cell(none, "executing").value, "0"); assert.equal(cell(none, "executing").caption, "None confirmed");
  const live = snap({ jobs: [running("j1")], executor: { available: true, jobsExecuting: ["j1"], agentsExecuting: [] } });
  assert.equal(cell(live, "executing").value, "1"); assert.equal(cell(live, "executing").caption, "Confirmed live"); assert.equal(cell(live, "executing").tone, "live");
  assert.deepEqual(operationalStrip(null).map(c => c.value), ["—", "—", "—", "—"], "no snapshot: unavailable, not zero");
  assert.ok(operationalStrip(null).every(c => c.caption === "Unavailable"));
}

// 2. SUMMARY: state, approvals and services map to snapshot facts with restrained tone.
{
  const calm = snap();
  assert.equal(cell(calm, "state").value, "Nominal"); assert.equal(cell(calm, "state").caption, "No open items");
  assert.equal(cell(calm, "approvals").value, "0"); assert.equal(cell(calm, "approvals").caption, "None waiting"); assert.equal(cell(calm, "services").value, "1/1");
  const degraded = snap({ probes: [{ id: "ollama", label: "x", online: false, detail: "", latencyMs: null }, { id: "n8n", label: "y", online: true, detail: "", latencyMs: 1 }] });
  assert.equal(cell(degraded, "state").value, "Attention"); assert.equal(cell(degraded, "state").tone, "attention"); assert.equal(cell(degraded, "state").caption, "1 open");
  assert.equal(cell(degraded, "services").value, "1/2"); assert.equal(cell(degraded, "services").caption, "1 unreachable"); assert.equal(cell(degraded, "services").tone, "attention");
  const blocked = snap({ jobs: [running("j1")], executor: { available: true, jobsExecuting: ["j1"], agentsExecuting: [] }, approvals: [approval("p1", "j1")] });
  assert.equal(cell(blocked, "state").value, "Critical"); assert.equal(cell(blocked, "state").tone, "critical");
  assert.equal(cell(blocked, "approvals").value, "1"); assert.equal(cell(blocked, "approvals").caption, "Waiting"); assert.equal(cell(blocked, "approvals").tone, "attention");
  assert.equal(cell(snap({ mode: "restricted", jobs: null, probes: null, approvals: null }), "state").value, "Unknown", "restricted/unreadable is unknown, never nominal");
  assert.equal(cell(snap({ approvals: null }), "approvals").value, "—", "unreadable approvals are unknown, not zero");
  assert.match(liveStatusText(calm), /State Nominal/); assert.equal(liveStatusText(null), "Operational state unavailable");
}

// 3. SNAPSHOT panel: recorded counts are recorded counts; unreadable is null.
{
  const s = snap({ jobs: [running("r1"), job("d1"), job("d2"), failed("f1", H), job("i1", { status: "error", interrupted: true, error: "Interrupted", updatedAt: ago(H), finishedAt: ago(H) }), job("job-test-9", { isTest: true })] });
  assert.deepEqual(snapshotCounts(s), { recordedRunning: 1, completed: 2, errors: 2 }, "errors = failed + interrupted; test fixtures excluded");
  assert.equal(snapshotCounts(snap({ jobs: null })), null); assert.equal(snapshotCounts(null), null);
}

// 4. NOW: recorded status is not live execution (the stale persisted mission bug, in words).
{
  const stale = running("j1", { title: "# CLIENT & BUSINESS: Lumen & Co", updatedAt: ago(6 * D) });
  const view = nowView(snap({ ...review, jobs: [stale] }), null);
  assert.equal(view.mission!.evidence, "recorded_unconfirmed"); assert.equal(view.mission!.evidenceLabel, "Recorded as running · no confirmed live executor");
  assert.equal(view.mission!.title, "Lumen & Co", "markdown heading and category prefix are stripped for display");
  assert.doesNotMatch(view.mission!.evidenceLabel, /^Executing/);
  const confirmed = nowView(snap({ jobs: [running("j1")], executor: { available: true, jobsExecuting: ["j1"], agentsExecuting: [] } }), null);
  assert.equal(confirmed.mission!.evidence, "executing"); assert.equal(confirmed.mission!.evidenceLabel, EVIDENCE_LABEL.executing);
  const orphan = nowView(snap({ jobs: [running("j1")] }), null);
  assert.equal(orphan.mission!.evidence, "executor_absent"); assert.match(orphan.mission!.evidenceLabel, /no executor found/);
  assert.equal(stageStatusLabel("active", "recorded_unconfirmed"), "Recorded active"); assert.equal(stageStatusLabel("active", "executor_absent"), "Recorded active"); assert.equal(stageStatusLabel("active", "executing"), "Executing");
  assert.deepEqual((["done", "pending", "error", "skipped"] as const).map(s => stageStatusLabel(s, "recorded_unconfirmed")), ["Completed", "Pending", "Error", "Skipped"]);
  for (const evidence of ["recorded_unconfirmed", "executor_absent"] as const) assert.doesNotMatch(stageStatusLabel("active", evidence), /Executing|In progress/);
}

// 5. NOW: confirmed work first; extra records counted; quiet empty state; next step only when it concerns THIS mission.
{
  const s = snap({ jobs: [running("old", { updatedAt: ago(30 * H) }), running("live", { updatedAt: ago(2 * H) }), running("newer", { updatedAt: ago(H) })], executor: { available: true, jobsExecuting: ["live"], agentsExecuting: [] } });
  const view = nowView(s, null);
  assert.equal(view.mission!.id, "live", "confirmed execution outranks a more recent unconfirmed record"); assert.equal(view.more, 2);
  const none = nowView(snap(), null);
  assert.equal(none.mission, null); assert.deepEqual(none.stages, []); assert.equal(none.nextStep, null); assert.equal(none.nextStage, null); assert.equal(nowView(null, null).mission, null);
  const waiting = snap({ jobs: [running("j1")], executor: { available: true, jobsExecuting: ["j1"], agentsExecuting: [] }, approvals: [approval("p1", "j1")] });
  const w = nowView(waiting, null);
  assert.equal(w.mission!.waiting, true); assert.equal(w.nextStep!.code, "decide_pending_approval"); assert.equal(w.nextStep!.lens, "Missions");
  const unrelated = nowView(snap({ jobs: [running("j1")], executor: { available: true, jobsExecuting: ["j1"], agentsExecuting: [] }, probes: [{ id: "ollama", label: "x", online: false, detail: "", latencyMs: null }] }), null);
  assert.equal(unrelated.nextStep, null, "an unreachable-services step does not belong in the mission's Now");
  assert.equal(nowView(snap({ jobs: [running("j1")] }), null).nextStep!.code, "verify_running_mission");
  const step = (id: string, kind: string, status: string) => ({ id, kind, label: id, status, percent: 0, outputChars: 0, preview: "", sourceCount: 0, tokens: null, costUsd: null, costKnown: false });
  const core = { jobs: [{ id: "j1", title: "t", status: "running", percent: 40, createdAt: ago(H), isTest: false }], job: { id: "j1", status: "running", steps: [step("brief", "brief", "done"), step("plan", "plan", "active"), step("research", "research", "pending"), step("qa", "qa", "pending")] } } as never;
  const staged = nowView(snap({ ...review, jobs: [running("j1")] }), core);
  assert.deepEqual(staged.stages.map(x => [x.label, x.statusLabel]), [["brief", "Completed"], ["plan", "Recorded active"], ["research", "Pending"], ["qa", "Pending"]]);
  assert.equal(staged.stagesDone, 1); assert.equal(staged.nextStage, "research");
  assert.deepEqual(nowView(snap({ ...review, jobs: [running("j1")] }), { ...(core as object), job: { id: "other", status: "running", steps: [] } } as never).stages, [], "stages only for the displayed mission");
}

// 6. HEALTH: measured reachability only. No invented percentages.
{
  const s = snap({ probes: [{ id: "ollama", label: "Local LLM (Ollama)", online: true, detail: "3 models pulled", latencyMs: 12 }, { id: "searxng", label: "Live research (SearXNG)", online: false, detail: "not running", latencyMs: null }, { id: "n8n", label: "Automation (n8n)", online: true, detail: "x", latencyMs: null }] });
  assert.deepEqual(healthRows(s), [
    { id: "ollama", name: "Ollama", reachable: true, detail: "Reachable · 12 ms" },
    { id: "searxng", name: "SearXNG", reachable: false, detail: "Unreachable" },
    { id: "n8n", name: "n8n", reachable: true, detail: "Reachable" },
  ]);
  assert.equal(healthRows(snap({ probes: null })), null, "unmeasured is null, not an empty healthy list"); assert.equal(healthRows(null), null);
  assert.ok(!JSON.stringify(healthRows(s)).includes("%"), "no percentages are ever produced");
}

// 7. ATTENTION: only snapshot items; critical first; repeated issues grouped; bounded; nothing when empty.
{
  const s = snap({
    jobs: [running("live"), failed("f1", H), failed("f2", 2 * H), failed("f3", 3 * H), failed("old", 20 * D)],
    executor: { available: true, jobsExecuting: ["live"], agentsExecuting: [] },
    approvals: [approval("p1", "live"), approval("p2", "f1"), approval("p3", "f2")],
    consultations: [{ id: "c1", jobId: "f1", jobTitle: "Failed f1", stepLabel: "Plan", status: "pending", createdAt: ago(2 * H) }],
    probes: [{ id: "ollama", label: "Local LLM (Ollama)", online: false, detail: "", latencyMs: null }, { id: "searxng", label: "x", online: false, detail: "", latencyMs: null }, { id: "n8n", label: "y", online: true, detail: "", latencyMs: 1 }],
  });
  const { rows, hidden } = attentionRows(s);
  assert.equal(rows[0].priority, "critical"); assert.equal(rows[0].headline, "Approval blocking live work"); assert.equal(rows[0].glyph, "seal");
  assert.ok(rows.some(r => r.headline === "3 missions need review" && r.count === 3 && r.subject === "Failed f1 +2 more"), "repeated failures are ONE row");
  assert.ok(rows.some(r => r.headline === "2 approvals waiting" && r.count === 2), "non-critical approvals group; the critical one stays its own row");
  assert.equal(rows.filter(r => r.entity.type === "service").length, 0, "service reachability is stated in the status line and the health disclosure, so it is not repeated as an Attention row");
  assert.ok(!rows.some(r => /old/.test(r.subject)), "aged failures are history, not attention");
  assert.equal(rows.length, ATTENTION_ROWS_VISIBLE); assert.equal(hidden, 0, "four non-service issues fill the four visible rows");
  const expanded = attentionRows(s, true);
  assert.equal(expanded.hidden, 0); assert.equal(expanded.rows.length, rows.length + hidden, "reveal contains the actual remaining priorities");
  assert.deepEqual(expanded.rows.slice(0, rows.length), rows, "revealing preserves priority order and grouping");
  assert.equal(new Set(expanded.rows.map(row => row.id)).size, expanded.rows.length, "revealing never duplicates issues");
  assert.ok(rows.every(r => r.entity.id && r.entity.type), "rows carry the entity a future NORA focus needs");
  assert.deepEqual(attentionRows(snap()), { rows: [], hidden: 0 }); assert.deepEqual(attentionRows(null), { rows: [], hidden: 0 });
  const single = attentionRows(snap({ jobs: [failed("only", H)] })).rows;
  assert.equal(single.length, 1); assert.equal(single[0].headline, "Mission failed"); assert.equal(single[0].count, 1); assert.equal(single[0].missionId, "only");
  assert.equal(REASON_LABEL["service.unreachable"], "Services unreachable");
  assert.ok(Object.values(REASON_LABEL).every(label => !/!|urgent|alert|emergency/i.test(label)), "severity is never shouted");
}

// 8. RECENT: a few real events, newest first, formatted as dates; decisions kept distinct from missions.
{
  const s = snap({
    jobs: [job("d1", { finishedAt: ago(2 * H), updatedAt: ago(2 * H) }), failed("f1", 10 * D), job("i1", { status: "error", error: "Interrupted", interrupted: true, updatedAt: ago(11 * D), finishedAt: ago(11 * D) })],
    approvals: [approval("p1", "d1", { status: "approved", decidedAt: ago(4 * H), decidedBy: "o" })],
  });
  const { rows, summary } = recentRows(s);
  assert.deepEqual(rows.map(r => r.outcome), ["completed", "approved", "failed", "interrupted"]);
  assert.deepEqual(rows.map(r => r.recordKind), ["mission", "decision", "mission", "mission"]);
  assert.deepEqual(summary, { completed: 1, failed: 1, interrupted: 1, decisions: 1 });
  assert.deepEqual(rows.map(r => r.when), ["2h ago", "4h ago", "10d ago", "11d ago"]); assert.equal(rows[2].dateLabel, "Sep 25");
  assert.equal(RECENT_ROWS_VISIBLE, 3);
  assert.deepEqual(recentRows(snap()), { rows: [], summary: { completed: 0, failed: 0, interrupted: 0, decisions: 0 } });
  assert.equal(shortDate("2026-09-29T12:17:03.235Z"), "Sep 29"); assert.equal(shortDate(null), "");
  assert.equal(ageLabel(ago(30_000), new Date(NOW).toISOString()), "just now"); assert.equal(ageLabel(ago(5 * 60_000), new Date(NOW).toISOString()), "5m ago"); assert.equal(ageLabel(ago(90 * D), new Date(NOW).toISOString()), "3mo ago");
}

// 9. NORA BRIEF: a factual evidence line and plain navigation. No speech, no templates.
{
  assert.equal(briefStatus(snap({ ...review, jobs: [running("j1")] })), "No confirmed live executor · 1 recorded as running");
  assert.equal(briefStatus(snap({ ...review })), "No confirmed live executor");
  assert.equal(briefStatus(snap({ jobs: [running("j1")] })), "1 recorded as running · none confirmed");
  assert.equal(briefStatus(snap({ jobs: [running("j1")], executor: { available: true, jobsExecuting: ["j1"], agentsExecuting: [] } })), "1 executing · confirmed");
  assert.equal(briefStatus(snap()), "No active execution"); assert.equal(briefStatus(null), "Operational state unavailable");
  assert.deepEqual(displayTitle("# CLIENT & BUSINESS: Lumen & Co — DTC Skincare Brand\nlong brief body"), "Lumen & Co — DTC Skincare Brand"); assert.equal(displayTitle("   "), "Untitled");
}

// 10. Structure: addressable regions, replaceable centre, no canned dialogue, no model/voice/camera behaviour.
{
  const comp = read("../src/components/spatial/dive/OverviewBriefing.tsx");
  const runtime = read("../src/components/spatial/dive/OverviewRuntime.tsx");
  const model = read("../src/components/spatial/dive/overviewBriefingModel.ts");
  const css = read("../src/components/spatial/dive/OverviewBriefing.module.css");
  assert.match(comp, /if \(!rows\.length\) return null;[\s\S]*data-surface="attention"/, "Attention renders nothing when empty");
  assert.match(comp, /data-brief-me data-foundation="true" aria-disabled="true"/); assert.match(comp, /onClick=\{\(event\) => event\.preventDefault\(\)\}/, "Brief me performs no action");
  assert.doesNotMatch(comp + runtime + model, /fetch\(|chatComplete|openai|anthropic|gemini|speechSynthesis|SpeechSynthesisUtterance|navigator\.mediaDevices|getUserMedia|MediaPipe/i, "no model, voice, camera or gesture behaviour");
  assert.doesNotMatch(comp + runtime + model + css, /good (morning|afternoon|evening)|welcome back|here is your|you currently have|would you like|let me know|how can i help|steady operations|systems aligned|intelligence ready|sir\b/i, "no canned NORA phrases, reference copy or persona");
  for (const surface of ["summary", "snapshot", "health", "attention", "recent", "brief"]) assert.ok(comp.includes(`data-surface="${surface}"`), `${surface} is an addressable surface`);
  assert.match(comp, /data-entity-type=\{row\.entity\.type\} data-entity-id=\{row\.entity\.id\}/);
  assert.match(runtime, /data-nora-briefing-stage/); assert.match(runtime, /data-nora-stage-object/, "the centre object lives in one replaceable slot");
  assert.match(runtime, /data-briefing-projection-layer aria-hidden="true"/);
  assert.doesNotMatch(runtime, /CoreOrbField|NeutronCore|data-core\b|>CORE</, "the Overview object is not the CORE and not coupled to CORE runtime");
  assert.doesNotMatch(runtime, /data-execution-halo|styles\.pipeline/); assert.match(css, /prefers-reduced-motion/);
}

// 11. GROWFORGE GLYPHS ONLY: no stock icon library in the Overview, the lens rail, or the dock controls.
{
  const dir = "../src/components/spatial/dive/";
  const overviewFiles = ["OverviewBriefing.tsx", "OverviewRuntime.tsx", "DiveOverview.tsx"].map(f => [f, read(dir + f)] as const);
  for (const [name, source] of overviewFiles) assert.doesNotMatch(source, /lucide|react-icons|heroicons|@mui\/icons|fontawesome|material-icons|@radix-ui\/react-icons|phosphor/i, `${name} uses no icon library`);
  const dock = read("../src/components/spatial/CoreCommandCenter.tsx");
  for (const stock of ["<Plus ", "<Mic ", "<Send "]) assert.ok(!dock.includes(stock), `dock composer no longer uses ${stock.trim()}`);
  assert.match(dock, /GrowForgeGlyph name="gap-add"/); assert.match(dock, /GrowForgeGlyph name="voice"/); assert.match(dock, /GrowForgeGlyph name="transmit"/);
  const glyphs = read("../src/components/spatial/GrowForgeGlyph.tsx");
  assert.doesNotMatch(glyphs, /^import .* from ["'](?!react)/m, "the glyph module imports nothing but React types");
  assert.deepEqual(Object.keys(LENS_GLYPH), [...DIVE_LENSES], "one glyph per lens, in lens order"); assert.equal(new Set(Object.values(LENS_GLYPH)).size, 9, "every lens glyph is distinct");
  assert.match(read(dir + "DiveOverview.tsx"), /LENS_GLYPH\[name\]/, "the lens rail renders GrowForge glyphs");
}

// 12. NORA Brief carries no navigation (the lens rail owns it); one fixed note, one inert action.
{
  const comp = read("../src/components/spatial/dive/OverviewBriefing.tsx");
  const model = read("../src/components/spatial/dive/overviewBriefingModel.ts");
  const brief = comp.slice(comp.indexOf("export function BriefPanel"));
  assert.doesNotMatch(brief, /onLens|Open Missions|Inspect Agents|View Evidence|Inspect Services|shortcuts/, "NORA Brief has no lens-navigation actions");
  assert.doesNotMatch(model, /briefShortcuts|Inspect Services/);
  assert.equal(briefState(snap()), "Briefing is not connected yet"); assert.equal(briefState(null), "Waiting for operational state");
  assert.doesNotMatch(comp + model, /BRIEF_NOTE|briefNote/, "the Brief carries one state and one action, no explanatory note");
  assert.equal((brief.match(/<button/g) ?? []).length, 1, "exactly one action: Brief me");
}

// 13. The graph is derived from supplied job records only.
{
  const DAY = 86_400_000, at = (d: number, h = 12) => new Date(Math.floor(NOW / DAY) * DAY - d * DAY + h * 3_600_000).toISOString();
  const jobs = [job("a", { status: "done", finishedAt: at(1), updatedAt: at(1) }), job("b", { status: "done", finishedAt: at(1), updatedAt: at(1) }), job("c", { status: "error", finishedAt: at(3), updatedAt: at(3) }),
    job("d", { status: "error", interrupted: true, finishedAt: at(3), updatedAt: at(3) }), job("old", { status: "done", finishedAt: at(40), updatedAt: at(40) }),
    job("t", { status: "done", isTest: true, finishedAt: at(1), updatedAt: at(1) }), job("r", { status: "running", updatedAt: at(0) })];
  const series = buildActivitySeries(jobs, NOW)!;
  assert.equal(series.buckets.length, 14); assert.equal(series.buckets.at(-1)!.day, new Date(Math.floor(NOW / DAY) * DAY).toISOString().slice(0, 10));
  assert.deepEqual(series.total, { completed: 2, errors: 2 }, "only in-window, non-test, finished jobs");
  assert.equal(series.buckets[12].completed, 2); assert.equal(series.buckets[10].errors, 2); assert.equal(series.activeDays, 2);
  assert.equal(series.buckets.reduce((n, b) => n + b.completed + b.errors, 0), 4, "no value that is not a job");
  assert.equal(series.provenance.refs.length, 4); assert.equal(series.provenance.basis, "derived");
  const g = activityGraph(snap({ jobs }));
  assert.equal(g.state, "series"); assert.equal(g.max, 2); assert.deepEqual(g.points.map(p => p.completed + p.errors).reduce((a, b) => a + b, 0), 4);
  // empty history: truthful, no trend
  const empty = activityGraph(snap({ jobs: [job("old", { finishedAt: at(40), updatedAt: at(40) })] }));
  assert.equal(empty.state, "empty"); assert.match(empty.caption, /No recorded outcomes/); assert.ok(empty.points.every(p => p.completed === 0 && p.errors === 0));
  // one day of history: no trend is claimed
  const one = activityGraph(snap({ jobs: [job("x", { finishedAt: at(2), updatedAt: at(2) })] }));
  assert.equal(one.state, "sparse"); assert.equal(one.caption, "Insufficient history for a trend");
  assert.equal(activityGraph(snap({ jobs: null })).state, "unavailable"); assert.equal(activityGraph(null).state, "unavailable");
  // determinism and no invention: same input, same series
  assert.deepEqual(activityGraph(snap({ jobs })), activityGraph(snap({ jobs })));
  const comp = read("../src/components/spatial/dive/OverviewBriefing.tsx"), model = read("../src/components/spatial/dive/overviewBriefingModel.ts");
  assert.doesNotMatch(comp + model, /Math\.random|\d+%|uptime|health score|utilization/i, "no fabricated percentages, scores or random values");
}

// 14. The NORA stage object reacts to snapshot STATE, never to an invented number; persisted running != executing.
{
  assert.equal(noraStageLevel(null), "unknown");
  assert.equal(noraStageLevel(snap()), "idle");
  assert.equal(noraStageLevel(snap({ ...review, jobs: [running("j1")] })), "idle", "a persisted running job with no executor is not execution");
  assert.equal(noraStageLevel(snap({ jobs: [running("j1")], executor: { available: true, jobsExecuting: ["j1"], agentsExecuting: [] } })), "executing");
  assert.equal(noraStageLevel(snap({ probes: [{ id: "ollama", label: "x", online: false, detail: "", latencyMs: null }] })), "degraded");
  assert.equal(noraStageParams("idle").travellers, 0); assert.equal(noraStageParams("attention").travellers, 0, "only confirmed execution produces travelling pulses");
  assert.ok(noraStageParams("executing").travellers > 0); assert.ok(noraStageParams("executing").energy > noraStageParams("idle").energy);
  const runtime = read("../src/components/spatial/dive/OverviewRuntime.tsx");
  assert.match(runtime, /NoraStageField/); assert.doesNotMatch(runtime, /<InnerCore|NeutronCore|CoreOrbField/, "the Overview stage is its own component, not the CORE");
  const stage = read("../src/components/spatial/dive/NoraStageField.tsx");
  const procedural = read("../src/components/spatial/dive/NoraMorphField.tsx");
  assert.doesNotMatch(stage + procedural, /<img|new Image\(|nora-stage-core\.png/, "every motion mode is generated; no static-image substitution");
}

// 15. Every glyph the Overview uses resolves to a GrowForge glyph.
{
  const glyphs = read("../src/components/spatial/GrowForgeGlyph.tsx");
  const used = new Set<string>();
  for (const f of ["OverviewBriefing.tsx", "OverviewRuntime.tsx", "DiveOverview.tsx", "overviewBriefingModel.ts"]) for (const m of read("../src/components/spatial/dive/" + f).matchAll(/(?:name|glyph)[=:]\s*[{"']+([a-z-]+)["']/g)) used.add(m[1]);
  for (const name of ["snapshot", "pulse", "attention", "brief", "arrow", "reach", "layers"]) assert.ok(used.has(name) || glyphs.includes(`${name}:`) || glyphs.includes(`"${name}":`), `${name} defined`);
  for (const name of used) assert.ok(new RegExp(`(^|\\s|")${name}"?:`, "m").test(glyphs) || name === "name", `glyph "${name}" resolves to a GrowForge glyph`);
}

// 16. FINAL DARK REDESIGN: Morph Field (not an orb), de-duplication, disclosure, no navigation in the Brief.
{
  const dir = "../src/components/spatial/dive/";
  const morph = read(dir + "NoraMorphField.tsx"), runtime = read(dir + "OverviewRuntime.tsx"), comp = read(dir + "OverviewBriefing.tsx"), css = read(dir + "OverviewBriefing.module.css");
  // every named state exists, resolves from real inputs, and only activity states carry travelling light
  assert.deepEqual([...NORA_MORPH_STATES], ["idle", "listening", "thinking", "retrieving", "speaking", "presenting", "executing", "attention"]);
  for (const state of NORA_MORPH_STATES) assert.ok(NORA_MORPH_PARAMS[state].energy > 0, `${state} has parameters`);
  assert.equal(noraMorphState("idle", "idle"), "idle"); assert.equal(noraMorphState("idle", "listening"), "listening"); assert.equal(noraMorphState("idle", "thinking"), "thinking");
  assert.equal(noraMorphState("idle", "speaking"), "speaking"); assert.equal(noraMorphState("idle", "success"), "presenting");
  assert.equal(noraMorphState("executing", "idle"), "executing", "confirmed execution drives the executing state");
  assert.equal(noraMorphState("attention", "idle"), "attention"); assert.equal(noraMorphState("degraded", "idle"), "idle", "unreachable services alone are not a NORA attention state");
  assert.equal(NORA_MORPH_PARAMS.idle.flow, 0); assert.equal(NORA_MORPH_PARAMS.attention.flow, 0, "no travelling light without activity");
  assert.ok(NORA_MORPH_PARAMS.executing.flow > 0); assert.ok(NORA_MORPH_PARAMS.attention.warm > 0 && NORA_MORPH_PARAMS.idle.warm === 0);
  // it is a morphing topology, not a sphere/ring/orb, and not the CORE
  assert.doesNotMatch(morph, /\.arc\(|Math\.cos\(a\) \* R|CoreOrbField|NeutronCore|<InnerCore\b|dive\/InnerCore|<img|new Image\(|\.scale\(/, "no circle drawing, no whole-object scale, no CORE coupling, no artwork");
  assert.match(morph, /prefers-reduced-motion/); assert.match(morph, /document\.hidden/, "pauses when hidden");
  assert.match(morph, /aria-label="Open NORA"/); assert.match(morph, /Fresnel/i);
  assert.doesNotMatch(read(dir + "NoraStageField.tsx"), /NoraStageProcedural/, "the ring object is gone");
  // de-duplication and progressive disclosure
  assert.doesNotMatch(runtime, /COMMAND OVERVIEW|HealthPanel|eyebrow/); assert.match(runtime, /HealthDisclosure/);
  assert.match(comp, /<details[^>]*data-surface="health"[^>]*open=\{degraded\}/, "health is collapsed when healthy, opened when degraded");
  const a = attentionRows(snap({ probes: [{ id: "ollama", label: "x", online: false, detail: "", latencyMs: null }] }));
  assert.equal(a.rows.length, 0, "unreachable services are in the status line and the health disclosure, not repeated as an Attention row");
  assert.doesNotMatch(comp, /\d+%|uptime|\bcpu\b|\bram\b/i, "no fabricated health figures");
  // the only chart caption restates nothing the counts already show
  assert.doesNotMatch(comp.slice(comp.indexOf("<figcaption>"), comp.indexOf("</figcaption>")), /totals/);
  // no uppercase micro-labels in the redesigned stylesheet
  assert.doesNotMatch(css, /text-transform:\s*uppercase|letter-spacing:\s*\.[1-9]/, "sentence-case type, no tracked uppercase labels");
  // The only permitted illumination is the real data line, nodes and error markers (restrained drop-shadow); panels and text carry none.
  assert.doesNotMatch(css.replace(/\.chart(Line|Dot|Err|Glow|Point)[^{]*\{[^}]*\}/g, ""), /drop-shadow|text-shadow/i, "no coloured glow outside the data line and error markers");
}

console.log("overview briefing tests: all passed");
