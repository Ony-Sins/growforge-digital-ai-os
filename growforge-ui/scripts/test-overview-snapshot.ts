import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ATTENTION_WINDOW_MS, buildOverviewSnapshot, TEST_JOB_ID_PATTERN,
  type ApprovalFacts, type ConsultationFacts, type JobFacts, type OverviewInput, type OverviewSnapshot,
} from "../src/lib/overviewSnapshot";
import { innerCorePhase } from "../src/components/spatial/dive/overviewCommandModel";
import { overviewObjects } from "../src/components/spatial/dive/overviewModel";
import { overviewExecutionLine } from "../src/components/spatial/dive/overviewRuntimeModel";
import { IDLE_NORA_SIGNAL } from "../src/lib/noraVisualSignal";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const NOW = Date.parse("2026-10-05T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const H = 3600_000, D = 24 * H;

const job = (id: string, over: Partial<JobFacts> = {}): JobFacts => ({
  id, title: `Mission ${id}`, status: "done", percent: 100, createdAt: ago(2 * D), updatedAt: ago(2 * D), finishedAt: ago(2 * D),
  isTest: false, interrupted: false, verified: true, ...over,
});
const approval = (id: string, jobId: string, over: Partial<ApprovalFacts> = {}): ApprovalFacts => ({ id, jobId, jobTitle: `Mission ${jobId}`, stepLabel: "QA", toolName: "send_email", status: "pending", createdAt: ago(H), ...over });
const consultation = (id: string, jobId: string, over: Partial<ConsultationFacts> = {}): ConsultationFacts => ({ id, jobId, jobTitle: `Mission ${jobId}`, stepLabel: "Plan", status: "pending", createdAt: ago(H), ...over });
const probes = (online: Record<string, boolean>) => Object.entries(online).map(([id, on]) => ({ id, label: id.toUpperCase(), online: on, detail: on ? "ok" : "not running", latencyMs: on ? 12 : null }));
const input = (over: Partial<OverviewInput> = {}): OverviewInput => ({
  now: NOW, mode: "live", executor: { available: true, jobsExecuting: [], agentsExecuting: [] },
  jobs: [], approvals: [], consultations: [], agents: [], probes: probes({ ollama: true, searxng: true }), systems: { mcpServers: 2, mcpTools: 9, models: 3, routing: "local-first", notesVaultReachable: true },
  financeTrackedModules: 0, ...over,
});
const snap = (over: Partial<OverviewInput> = {}) => buildOverviewSnapshot(input(over));
const kinds = (items: { kind: string }[]) => items.map(i => i.kind);

// 1. Empty state: truthful, nothing invented.
{
  const s = snap();
  assert.equal(s.status.level, "nominal");
  assert.deepEqual(s.attention, []); assert.deepEqual(s.recent, []); assert.deepEqual(s.activeWork, []); assert.deepEqual(s.nextSteps, []);
  assert.deepEqual(s.counts.missions, { total: 0, recordedRunning: 0, executingNow: 0, completed: 0, failed: 0, interrupted: 0, testExcluded: 0 });
  assert.deepEqual(s.executingNow, { missionIds: [], agentIds: [], confirmable: true });
  assert.deepEqual(s.usage, { available: false, reason: "no_usage_recorded" });
}

// 2. ACTIVE MISSION != AGENT EXECUTING. A persisted `active` agent and a persisted `running` job prove nothing by themselves.
{
  const s = snap({
    jobs: [job("j1", { status: "running", percent: 40, updatedAt: ago(H), finishedAt: undefined })],
    agents: [{ id: "a1", name: "Agent One", persistedStatus: "active", lastRun: "running now" }, { id: "a2", name: "Agent Two", persistedStatus: "idle", lastRun: "Never run" }],
  });
  assert.equal(s.counts.missions!.recordedRunning, 1);
  assert.equal(s.counts.missions!.executingNow, 0, "recorded running is not executing");
  assert.equal(s.counts.agents!.persistedActive, 1);
  assert.equal(s.counts.agents!.executingNow, 0, "a persisted active flag is not an executing agent");
  assert.equal(s.agents!.find(a => a.id === "a1")!.executingNow, false);
  // executor present, mission executing, but NO agent executing: the two are independent facts.
  const t = snap({ jobs: [job("j1", { status: "running", percent: 40, updatedAt: ago(H), finishedAt: undefined })], executor: { available: true, jobsExecuting: ["j1"], agentsExecuting: [] }, agents: [{ id: "a1", name: "Agent One", persistedStatus: "active", lastRun: "running now" }] });
  assert.equal(t.counts.missions!.executingNow, 1); assert.equal(t.counts.agents!.executingNow, 0);
  assert.deepEqual(t.executingNow.missionIds, ["j1"]); assert.deepEqual(t.executingNow.agentIds, []);
  assert.equal(t.activeWork[0].reason.code, "mission.executing");
  // and the reverse: an agent running with no mission executing
  const u = snap({ executor: { available: true, jobsExecuting: [], agentsExecuting: ["a1"] }, agents: [{ id: "a1", name: "Agent One", persistedStatus: "active", lastRun: "running now" }] });
  assert.equal(u.counts.agents!.executingNow, 1); assert.equal(u.counts.missions!.executingNow, 0);
}

// 3. PERSISTED "running" != proof an executor is active. With no executor in this process (owner-review) nothing can be executing.
{
  const running = job("j1", { status: "running", percent: 2, updatedAt: ago(6 * D), finishedAt: undefined });
  const s = snap({ mode: "owner-review", executor: { available: false, jobsExecuting: ["j1"], agentsExecuting: ["a1"] }, jobs: [running], agents: [{ id: "a1", name: "A", persistedStatus: "active", lastRun: "x" }] });
  assert.equal(s.counts.missions!.executingNow, 0, "an executor list is ignored when no executor exists");
  assert.equal(s.counts.agents!.executingNow, 0);
  assert.deepEqual(s.executingNow, { missionIds: [], agentIds: [], confirmable: false });
  assert.equal(s.activeWork[0].reason.code, "mission.recorded_running_unconfirmed");
  assert.equal(s.activeWork[0].reason.facts.evidence, "persisted_only");
  assert.equal(s.activeWork[0].priority, "informational", "cannot call an unverifiable running record a failure");
  assert.ok(s.gaps.includes("executor_confirmation"));
  assert.equal(s.status.level, "nominal");
  // a live process with an executor, where a recorded-running job has NO executor, IS suspicious
  const t = snap({ jobs: [running] });
  assert.equal(t.activeWork[0].reason.code, "mission.running_without_executor");
  assert.equal(t.activeWork[0].priority, "attention");
  assert.deepEqual(t.nextSteps.map(n => n.code), ["verify_running_mission"]);
}

// 4. Stalled work: executing, but not updated for over a day.
{
  const s = snap({ jobs: [job("j1", { status: "running", updatedAt: ago(2 * D), finishedAt: undefined })], executor: { available: true, jobsExecuting: ["j1"], agentsExecuting: [] } });
  assert.equal(s.attention[0].reason.code, "mission.stalled"); assert.equal(s.attention[0].priority, "attention");
}

// 5. Error / blocked classification, and refusing to exaggerate old failures.
{
  const s = snap({ jobs: [
    job("f1", { status: "error", error: "boom", updatedAt: ago(H), finishedAt: ago(H) }),
    job("i1", { status: "error", error: "Interrupted by a server restart", interrupted: true, updatedAt: ago(2 * H), finishedAt: ago(2 * H) }),
    job("old", { status: "error", error: "boom", updatedAt: ago(ATTENTION_WINDOW_MS + D), finishedAt: ago(ATTENTION_WINDOW_MS + D) }),
  ] });
  const byId = Object.fromEntries([...s.attention, ...s.recent].map(i => [i.subject.id, i]));
  assert.equal(byId.f1.kind, "mission.failed"); assert.equal(byId.f1.priority, "attention"); assert.equal(byId.f1.reason.code, "mission.failed");
  assert.equal(byId.i1.kind, "mission.interrupted"); assert.equal(byId.i1.priority, "attention");
  assert.equal(byId.old.priority, "informational", "a failure older than the window is history, not attention");
  assert.equal(byId.old.reason.code, "mission.failed.aged");
  assert.deepEqual(s.attention.map(i => i.subject.id), ["f1", "i1"], "most recent first");
  assert.equal(s.counts.missions!.failed, 2); assert.equal(s.counts.missions!.interrupted, 1);
  assert.equal(s.status.level, "attention");
  assert.deepEqual(s.nextSteps.map(n => n.code), ["review_failed_mission"]);
  assert.deepEqual(s.nextSteps[0].derivedFrom, ["mission:f1", "mission:i1"]);
}

// 6. Successful completion is informational and recent, never attention.
{
  const s = snap({ jobs: [job("d1", { finishedAt: ago(H), updatedAt: ago(H) })] });
  assert.deepEqual(s.attention, []);
  assert.deepEqual(kinds(s.recent), ["mission.completed"]);
  assert.equal(s.recent[0].priority, "informational");
  assert.equal(s.recent[0].reason.facts.verified, true);
  assert.equal(s.status.level, "nominal");
}

// 7. Service degradation: one grouped attention item, unknown stays unknown.
{
  const s = snap({ probes: probes({ ollama: false, searxng: true, n8n: false }) });
  const item = s.attention.find(i => i.kind === "services.unreachable")!;
  assert.equal(item.priority, "attention"); assert.equal(item.reason.facts.unreachable, "ollama,n8n"); assert.equal(item.reason.facts.allUnreachable, false);
  assert.equal(s.attention.filter(i => i.kind === "services.unreachable").length, 1, "grouped, not one per service");
  assert.deepEqual(s.counts.services, { measured: 3, reachable: 1, unreachable: 2 }); assert.equal(s.health.degraded, true);
  assert.equal(item.provenance.basis, "measured"); assert.equal(item.provenance.freshness, "live");
  assert.deepEqual(snap({ probes: probes({ ollama: false }) }).attention[0].reason.facts.allUnreachable, true);
  const unknown = snap({ probes: null });
  assert.equal(unknown.counts.services, null); assert.equal(unknown.health.services, null); assert.equal(unknown.health.degraded, null);
  assert.deepEqual(unknown.attention, [], "unmeasured services are unknown, not degraded");
}

// 8. Approval-required: critical only when it blocks work an executor is running; otherwise attention.
{
  const blocking = snap({ jobs: [job("j1", { status: "running", updatedAt: ago(H), finishedAt: undefined })], executor: { available: true, jobsExecuting: ["j1"], agentsExecuting: [] }, approvals: [approval("p1", "j1")] });
  assert.equal(blocking.attention[0].kind, "approval.pending"); assert.equal(blocking.attention[0].priority, "critical");
  assert.equal(blocking.attention[0].reason.code, "approval.blocks_executing_work"); assert.equal(blocking.status.level, "critical");
  assert.equal(blocking.nextSteps[0].code, "decide_pending_approval"); assert.equal(blocking.nextSteps[0].priority, "critical");
  assert.equal(blocking.activeWork[0].reason.facts.waitingOnApproval, true);
  const unverified = snap({ jobs: [job("j1", { status: "running", updatedAt: ago(H), finishedAt: undefined })], approvals: [approval("p1", "j1")] });
  assert.equal(unverified.attention.find(i => i.kind === "approval.pending")!.priority, "attention", "cannot confirm it blocks live work");
  assert.equal(snap({ approvals: null }).counts.approvals, null, "unreadable approvals are unknown, not zero");
  const timedOut = snap({ approvals: [approval("p2", "jX", { status: "timed_out", decidedAt: ago(H) })] });
  assert.equal(timedOut.attention[0].kind, "approval.timed_out");
  const decided = snap({ approvals: [approval("p3", "jX", { status: "approved", decidedAt: ago(H), decidedBy: "owner" })] });
  assert.deepEqual(kinds(decided.recent), ["approval.decided"]); assert.deepEqual(decided.attention, []);
  const asked = snap({ consultations: [consultation("c1", "j1")] });
  assert.equal(asked.attention[0].kind, "consultation.pending"); assert.equal(asked.nextSteps[0].code, "answer_pending_consultation");
  assert.deepEqual(kinds(snap({ consultations: [consultation("c2", "j1", { status: "answered", answeredAt: ago(H) })] }).recent), ["consultation.answered"]);
}

// 9. Finance is not fabricated.
{
  assert.deepEqual(snap().finance, { tracked: false, trackedModules: 0, reason: "no_finance_ledger" });
  assert.ok(snap().gaps.includes("finance_ledger"));
  assert.deepEqual(snap({ financeTrackedModules: 3 }).finance, { tracked: true, trackedModules: 3 });
  // usage: only recorded step usage; an unknown cost is null, never zero
  const s = snap({ jobs: [job("u1", { usage: { calls: 4, totalTokens: 1000, costUsd: null, allCostsKnown: false } }), job("u2", { usage: { calls: 2, totalTokens: 500, costUsd: 0.25, allCostsKnown: true } }), job("u3", { usage: null })] });
  assert.ok(s.usage.available);
  if (s.usage.available) { assert.equal(s.usage.calls, 6); assert.equal(s.usage.totalTokens, 1500); assert.equal(s.usage.costUsd, null, "one unknown cost makes the total unknown"); assert.equal(s.usage.allCostsKnown, false); assert.equal(s.usage.jobsWithUsage, 2); }
  const known = snap({ jobs: [job("u2", { usage: { calls: 2, totalTokens: 500, costUsd: 0.25, allCostsKnown: true } })] });
  assert.ok(known.usage.available && known.usage.costUsd === 0.25);
  assert.deepEqual(snap({ jobs: null }).usage, { available: false, reason: "jobs_unreadable" });
}

// 10. Provenance: every item says where it came from, what produced it and how fresh it is.
{
  const s = snap({
    jobs: [job("j1", { status: "running", updatedAt: ago(30_000), finishedAt: undefined }), job("d1", { updatedAt: ago(3 * D), finishedAt: ago(3 * D) })],
    approvals: [approval("p1", "j1")], consultations: [consultation("c1", "j1")], probes: probes({ ollama: false }),
  });
  const all = [...s.activeWork, ...s.attention, ...s.recent];
  assert.ok(all.length >= 5);
  for (const item of all) {
    assert.ok(item.provenance.source && item.provenance.refs.length >= 1, item.id);
    assert.ok(["recorded", "measured", "derived"].includes(item.provenance.basis));
    assert.ok(item.provenance.observedAt, item.id); assert.ok(item.provenance.ageMs !== null && item.provenance.ageMs >= 0);
    assert.ok(item.reason.code, item.id); assert.ok(item.lens.startsWith("lens."));
  }
  const bySource = (id: string) => all.find(i => i.id === id)!;
  assert.deepEqual(bySource("mission:j1").provenance, { source: "jobStore", basis: "recorded", refs: [{ type: "mission", id: "j1" }], observedAt: ago(30_000), ageMs: 30_000, freshness: "live" });
  assert.equal(bySource("mission:d1").provenance.freshness, "stale");
  assert.equal(bySource("approval:p1").provenance.source, "approvalStore"); assert.equal(bySource("consultation:c1").provenance.source, "consultationStore");
  assert.equal(bySource("services:unreachable").provenance.source, "serviceProbe");
  assert.equal(s.health.services![0].provenance.basis, "measured");
  // provenance must not leak secrets or filesystem paths
  assert.ok(!/[A-Za-z]:\\|\/Users\/|data[\\/]|\.json|vault|key|token/i.test(JSON.stringify(all.map(i => i.provenance))));
}

// 11. Synthetic fixtures never enter the briefing.
{
  assert.ok(TEST_JOB_ID_PATTERN.test("job-test-1") && TEST_JOB_ID_PATTERN.test("test-job-laya-confirm-1") && TEST_JOB_ID_PATTERN.test("job-research-verify-2") && !TEST_JOB_ID_PATTERN.test("job-mumn5hj2-j83p"));
  const s = snap({
    jobs: [job("job-test-1", { isTest: true, status: "error", updatedAt: ago(H), finishedAt: ago(H) }), job("real")],
    approvals: [approval("p1", "test-job-laya-confirm-1"), approval("p2", "job-test-1"), approval("p3", "real", { status: "approved", decidedAt: ago(H) })],
    consultations: [consultation("c1", "job-test-1")],
  });
  assert.equal(s.counts.missions!.total, 1); assert.equal(s.counts.missions!.testExcluded, 1);
  assert.deepEqual(s.attention, []); assert.equal(s.counts.approvals!.pending, 0); assert.equal(s.counts.consultations!.pending, 0);
}

// 12. "Since last visit": no pretending. The seam exists, the capability does not.
{
  const s = snap({ jobs: [job("d1", { finishedAt: ago(H), updatedAt: ago(H) }), job("d2", { finishedAt: ago(5 * D), updatedAt: ago(5 * D) })] });
  assert.deepEqual(s.sinceLastVisit, { supported: false, reason: "no_last_view_record" });
  assert.ok(s.gaps.includes("since_last_visit"));
  const t = snap({ jobs: [job("d1", { finishedAt: ago(H), updatedAt: ago(H) }), job("d2", { finishedAt: ago(5 * D), updatedAt: ago(5 * D) })], lastViewedAt: ago(D) });
  assert.deepEqual(t.sinceLastVisit, { supported: true, lastViewedAt: ago(D), changedItemIds: ["mission:d1"] });
  assert.ok(!t.gaps.includes("since_last_visit"));
}

// 13. Restricted (preview/beta/non-owner) and unreadable sources are "unknown", never an empty-looking all-clear.
{
  const r = snap({ mode: "restricted", executor: { available: true, jobsExecuting: ["j1"], agentsExecuting: [] }, jobs: null, approvals: null, consultations: null, agents: null, probes: null, systems: null });
  assert.equal(r.status.level, "unknown"); assert.deepEqual(r.attention, []); assert.equal(r.counts.missions, null); assert.equal(r.counts.agents, null);
  assert.equal(r.context.executorAvailable, false, "restricted mode never claims an executor");
  assert.equal(r.context_signals, null);
  assert.equal(snap({ jobs: null, probes: null }).status.level, "unknown");
}

// 14. Determinism: same facts, same snapshot, regardless of input order.
{
  const jobs = [job("a", { status: "error", error: "x", updatedAt: ago(H), finishedAt: ago(H) }), job("b", { status: "error", error: "x", updatedAt: ago(H), finishedAt: ago(H) }), job("c", { finishedAt: ago(2 * H), updatedAt: ago(2 * H) })];
  const one = snap({ jobs }); const two = snap({ jobs: [...jobs].reverse() });
  assert.equal(JSON.stringify(one), JSON.stringify(two));
  assert.equal(JSON.stringify(snap({ jobs })), JSON.stringify(one));
}

// 15. No prose in the contract: codes are machine tokens, and the module carries no canned-dialogue phrasing.
{
  const s = snap({ jobs: [job("f1", { status: "error", error: "boom", updatedAt: ago(H), finishedAt: ago(H) })], approvals: [approval("p1", "f1")], probes: probes({ ollama: false }) });
  const token = /^[a-z0-9_.]+$/;
  for (const item of [...s.attention, ...s.recent, ...s.activeWork]) { assert.match(item.kind, token); assert.match(item.reason.code, token); }
  for (const n of s.nextSteps) assert.match(n.code, token);
  for (const g of s.gaps) assert.match(g, token);
  const source = read("../src/lib/overviewSnapshot.ts") + read("../src/lib/overviewSnapshotServer.ts");
  assert.doesNotMatch(source, /good (morning|afternoon|evening)|here is your|you currently have|would you like|let me know|i can help|welcome back/i);
  assert.doesNotMatch(source, /\$\{[^}]*(name|user|owner)[^}]*\}[^;\n]*(hello|hi,|welcome)/i);
}

// 16. The Overview consumes the snapshot's distinctions (UI wiring, not visual acceptance).
{
  const sn: OverviewSnapshot = snap({ jobs: [job("j1", { status: "running", updatedAt: ago(H), finishedAt: undefined })] });
  const agents = [{ id: "a1", name: "A", status: "active", description: "d", lastRun: "running now" }] as never;
  assert.equal(overviewObjects(null, agents).filter(o => o.kind === "agent").length, 1, "legacy callers keep the recorded view");
  assert.equal(overviewObjects(null, agents, new Set()).filter(o => o.kind === "agent").length, 0, "with a snapshot, an unconfirmed active agent is not shown as working");
  assert.equal(overviewObjects(null, agents, new Set(["a1"])).filter(o => o.kind === "agent").length, 1);
  const core = { jobs: [{ id: "j1", title: "t", status: "running", percent: 3, createdAt: ago(H), isTest: false }], systems: { pendingApprovals: 0, probes: [] } } as never;
  assert.equal(innerCorePhase(core, IDLE_NORA_SIGNAL), "executing", "legacy: recorded running");
  assert.equal(innerCorePhase(core, IDLE_NORA_SIGNAL, false, false, false), "idle", "snapshot says nothing is executing");
  assert.equal(innerCorePhase(core, IDLE_NORA_SIGNAL, false, false, true), "executing");
  assert.match(overviewExecutionLine(core, 0, sn), /1 active mission · 0 executing/);
  const noExec = snap({ mode: "owner-review", executor: { available: false, jobsExecuting: [], agentsExecuting: [] }, jobs: [job("j1", { status: "running", updatedAt: ago(H), finishedAt: undefined })] });
  assert.match(overviewExecutionLine(core, 0, noExec), /execution not confirmed/);
  const overview = read("../src/components/spatial/dive/DiveOverview.tsx");
  assert.ok(overview.includes('"/api/overview"') && overview.includes("snapshot.executingNow"));
  const runtime = read("../src/components/spatial/dive/OverviewRuntime.tsx");
  assert.ok(runtime.includes("operationalStrip(snapshot)") && runtime.includes("nowView(snapshot, core)"), "Overview regions are driven by the snapshot");
  const route = read("../src/app/api/overview/route.ts");
  assert.ok(route.includes("buildOverviewSnapshot") && route.includes("restrictedOverviewInput") && !/export async function (POST|PUT|PATCH|DELETE)/.test(route), "the endpoint is read-only");
  const server = read("../src/lib/overviewSnapshotServer.ts");
  for (const store of ["jobStore", "approvalStore", "consultationStore", "agentStore", "durableJobEngine", "coreState"]) assert.ok(server.includes(`@/lib/${store}`), `reads the canonical ${store}`);
  assert.doesNotMatch(server, /writeFile|appendFile|mkdir|unlink|rename|\.set\(|persist\(/, "gatherer never writes");
}

// 17. Current owner-review projection (skipped where it is not present): the real data obeys the same rules.
{
  const dir = join("C:/Ony/GrowForge-owner-review-runtime/data");
  if (existsSync(join(dir, "jobs.json"))) {
    type RawJob = { id: string; title: string; status: JobFacts["status"]; percent: number; createdAt: string; updatedAt: string; finishedAt?: string; approvedAt?: string; error?: string; verified?: boolean; steps?: { error?: string }[] };
    const raw = JSON.parse(readFileSync(join(dir, "jobs.json"), "utf8")) as RawJob[];
    const jobs: JobFacts[] = raw.map(j => ({
      id: j.id, title: j.title, status: j.status, percent: j.percent, createdAt: j.createdAt, updatedAt: j.updatedAt, finishedAt: j.finishedAt, approvedAt: j.approvedAt,
      isTest: TEST_JOB_ID_PATTERN.test(j.id), error: j.error, interrupted: /interrupt/i.test(String(j.error ?? "")) || (j.steps ?? []).some((step) => /^interrupted$/i.test(String(step.error ?? ""))), verified: !!j.verified,
    }));
    const approvals = existsSync(join(dir, "approvals.json")) ? (JSON.parse(readFileSync(join(dir, "approvals.json"), "utf8")) as ApprovalFacts[]) : [];
    const s = buildOverviewSnapshot({ ...input({ mode: "owner-review", executor: { available: false, jobsExecuting: [], agentsExecuting: [] }, jobs, approvals, financeTrackedModules: 0 }), now: Date.now() });
    const real = jobs.filter(j => !j.isTest);
    assert.equal(s.counts.missions!.total, real.length);
    assert.equal(s.counts.missions!.recordedRunning, real.filter(j => j.status === "running").length);
    assert.equal(s.counts.missions!.executingNow, 0, "the review instance never reports executing work");
    assert.ok(s.activeWork.every(i => i.reason.facts.evidence === "persisted_only"));
    assert.notEqual(s.status.level, "critical");
    assert.ok([...s.attention, ...s.recent, ...s.activeWork].every(i => i.subject.label.length > 0 && !/undefined|null/.test(i.subject.label)));
    assert.equal(s.finance.tracked, false);
    console.log(`  owner-review projection: ${real.length} real missions, ${s.counts.missions!.recordedRunning} recorded running, 0 executing, level=${s.status.level}`);
  } else console.log("  owner-review projection not present: skipped");
}

console.log("overview snapshot tests: all passed");
