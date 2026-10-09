import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Job, JobStep } from "../src/lib/jobStore";
import type { PendingApproval } from "../src/lib/approvalStore";
import { buildMissionWorktree, type MissionWorktree } from "../src/components/spatial/dive/missionWorktree";
import { workbenchCapabilities } from "../src/components/spatial/dive/missionWorkbench";
import { workbenchContentOf, type Block } from "../src/components/spatial/dive/missionWorkbenchContent";
import { approvePlan, planApprovalOf, planApprovalOffered, singleFlight } from "../src/components/spatial/dive/missionWorktreePlanApproval";

/** C1b.1 contract: plan approval in the Worktree. The endpoint, the permission rule and the state all pre-exist; this checks the Worktree uses them truthfully. Pure; no network. */
const T = "2026-10-01T10:00:00.000Z";
const step = (id: string, kind: JobStep["kind"], over: Partial<JobStep> = {}): JobStep => ({ id, kind, label: id, activity: "a", status: "done", percent: 100, weight: 10, dependsOn: [], ...over });
interface Opts { final?: boolean; approvedAt?: string; approvedBy?: string; createdBy?: string; tools?: boolean | "unreadable" }
function fixture(o: Opts = {}): MissionWorktree {
  const steps = [step("brief", "brief"), step("plan", "plan", { dependsOn: ["brief"] }), step("final", "final", { dependsOn: ["plan"] })];
  const job: Job = { id: "job-c1b1", title: "Plan Mission", brief: "b", status: "done", percent: 100, verified: true, steps, createdAt: T, updatedAt: T, liveNotes: [], revisions: [],
    ...(o.final === false ? {} : { finalOutput: "# Final plan\nDo the thing." }), ...(o.approvedAt ? { approvedAt: o.approvedAt } : {}), ...(o.approvedBy ? { approvedBy: o.approvedBy } : {}), ...(o.createdBy ? { createdBy: o.createdBy } : {}) };
  const approvals: PendingApproval[] | undefined = o.tools === "unreadable" ? undefined : o.tools ? [{ id: "ap1", jobId: "job-c1b1", jobTitle: "x", stepId: "plan", stepLabel: "plan", toolName: "send_email", args: { to: "a@b.c" }, status: "pending", createdAt: T } as PendingApproval] : [];
  return buildMissionWorktree({ job, approvals });
}
const flat = (blocks: Block[]): Block[] => blocks.flatMap(b => (b.kind === "group" ? [b, ...flat(b.blocks)] : [b]));
const approvalsText = (wt: MissionWorktree) => flat(workbenchContentOf(wt, wt.mission.id, "approvals")!.blocks).map(b => b.kind === "facts" ? b.facts.map(f => `${f.label}: ${f.value}`).join("\n") : b.kind === "group" ? `${b.title} ${b.note ?? ""}` : b.kind === "empty" ? b.text : b.kind === "unavailable" ? `${b.label} ${b.reason}` : b.kind === "record" ? b.title : "").join("\n");

// 1. The recorded state, exactly as recorded: nothing is implied when approvedAt is absent; "by" only when approvedBy is recorded.
{
  assert.deepEqual(planApprovalOf(fixture()), { approved: null, hasFinalPlan: true });
  assert.deepEqual(planApprovalOf(fixture({ final: false })), { approved: null, hasFinalPlan: false });
  assert.deepEqual(planApprovalOf(fixture({ approvedAt: "2026-10-02T08:30:00.000Z", approvedBy: "owner@x.test" })), { approved: { at: "2026-10-02T08:30:00.000Z", by: "owner@x.test" }, hasFinalPlan: true });
  assert.deepEqual(planApprovalOf(fixture({ approvedAt: "2026-10-02T08:30:00.000Z" })).approved, { at: "2026-10-02T08:30:00.000Z" }, "no approvedBy recorded: no 'by' is invented");
  // approvedBy without approvedAt is NOT an approval
  assert.equal(planApprovalOf(fixture({ approvedBy: "owner@x.test" })).approved, null);
}

// 2. The Approvals section words it truthfully in every case.
{
  const none = approvalsText(fixture());
  assert.match(none, /Plan approval: Not recorded/); assert.match(none, /A final plan is recorded\. No approval of it is recorded\./);
  assert.doesNotMatch(none, /Recorded 20|approved by|Approved/i, "absence of approvedAt is never worded as approval");
  assert.match(approvalsText(fixture({ final: false, tools: true })), /No final plan is recorded yet, so there is nothing to approve\./, "reachable here because a tool approval exists");
  const done = approvalsText(fixture({ approvedAt: "2026-10-02T08:30:00.000Z", approvedBy: "owner@x.test" }));
  assert.match(done, /Plan approval: Recorded 2026-10-02 08:30 UTC by owner@x\.test/); assert.match(done, /did not execute any external tool/);
  assert.match(approvalsText(fixture({ approvedAt: "2026-10-02T08:30:00.000Z" })), /Plan approval: Recorded 2026-10-02 08:30 UTC(?! by)/);
  // the tool approval records stay separate and unchanged
  const withTools = approvalsText(fixture({ tools: true }));
  assert.match(withTools, /Tool approval requests/); assert.match(withTools, /send_email/);
  assert.match(approvalsText(fixture()), /No approval is recorded for this mission\./, "no tool approvals: the original sentence is kept");
}

// 3. The section is reachable whenever a plan decision exists, never hidden by an empty / unreadable tool-approvals list; unchanged otherwise.
{
  const vis = (wt: MissionWorktree) => workbenchCapabilities(wt, wt.mission.id)!.sections.some(s => s.id === "approvals");
  assert.equal(vis(fixture()), true, "final plan recorded, zero tool approvals: the plan decision is reachable");
  assert.equal(vis(fixture({ tools: "unreadable" })), true, "tool approvals unreadable: still reachable, and it says so");
  assert.match(workbenchCapabilities(fixture({ tools: "unreadable" }), fixture().mission.id)!.sections.find(s => s.id === "approvals")!.reason ?? "", /Tool approvals could not be read/);
  assert.equal(vis(fixture({ approvedAt: "2026-10-02T08:30:00.000Z", final: false })), true, "an approval on record is always shown");
  assert.equal(vis(fixture({ final: false })), false, "no final plan, no approval, no tool approvals: nothing to show (unchanged)");
  assert.equal(vis(fixture({ final: false, tools: "unreadable" })), false);
  const withTools = workbenchCapabilities(fixture({ tools: true }), fixture().mission.id)!.sections.find(s => s.id === "approvals")!;
  assert.equal(withTools.count, 1, "the count stays the tool approval count");
}

// 4. Who is OFFERED the action: the existing owner rule only (UX; the server re-checks).
{
  const eligible = fixture(), approved = fixture({ approvedAt: "2026-10-02T08:30:00.000Z" }), noPlan = fixture({ final: false });
  assert.equal(planApprovalOffered(eligible, "owner"), true);
  for (const role of ["admin", "member", "viewer", "", "OWNER"]) assert.equal(planApprovalOffered(eligible, role), false, `${role || "(empty role)"}: not offered`);
  assert.equal(planApprovalOffered(fixture({ createdBy: "someone@x.test" }), "member"), false, "being the creator does not make approval available (owner only, unlike revise)");
  assert.equal(planApprovalOffered(approved, "owner"), false, "already approved: not offered again");
  assert.equal(planApprovalOffered(noPlan, "owner"), false, "no final plan: not offered");
}

// 5. The request: the existing endpoint, POST, no body, the id encoded; the REAL server error is surfaced.
{
  const calls: { url: string; init: unknown }[] = [];
  const reply = (status: number, body: unknown, jsonThrows = false) => async (url: string, init: { method: string }) => { calls.push({ url, init }); return { ok: status >= 200 && status < 300, status, json: async () => { if (jsonThrows) throw new Error("not json"); return body; } } as Pick<Response, "ok" | "status" | "json">; };
  assert.deepEqual(await approvePlan("job-c1b1", reply(200, { job: {} })), { ok: true });
  assert.equal(calls[0].url, "/api/jobs/job-c1b1/approve"); assert.deepEqual(calls[0].init, { method: "POST" }, "POST with no body and no extra headers");
  await approvePlan("a b/c", reply(200, {})); assert.equal(calls[1].url, "/api/jobs/a%20b%2Fc/approve", "the id is encoded");
  assert.deepEqual(await approvePlan("j", reply(403, { error: "Only an owner can decide approvals." })), { ok: false, error: "Only an owner can decide approvals." });
  assert.deepEqual(await approvePlan("j", reply(400, { error: "This project has no final plan yet." })), { ok: false, error: "This project has no final plan yet." });
  assert.deepEqual(await approvePlan("j", reply(401, { error: "Unauthorized." })), { ok: false, error: "Unauthorized." });
  assert.deepEqual(await approvePlan("j", reply(502, null, true)), { ok: false, error: "Approval failed (HTTP 502)." }, "a non-JSON failure still reports the real status");
  assert.deepEqual(await approvePlan("j", reply(500, { error: "" })), { ok: false, error: "Approval failed (HTTP 500)." });
  assert.deepEqual(await approvePlan("j", async () => { throw new Error("Failed to fetch"); }), { ok: false, error: "Failed to fetch" }, "a network failure reports its own message");
  assert.equal((await approvePlan("j", reply(200, null, true))).ok, true, "a successful empty / non-JSON body is still a success");
}

// 6. No duplicate submission while pending (synchronous lock).
{
  let calls = 0, release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const guarded = singleFlight(async () => { calls += 1; await gate; return "done"; });
  const first = guarded(), second = guarded(), third = guarded();
  assert.equal(guarded.pending(), true); assert.equal(await second, null); assert.equal(await third, null); assert.equal(calls, 1, "a double click sends one request");
  release(); assert.equal(await first, "done"); assert.equal(guarded.pending(), false);
  assert.equal(await guarded(), "done"); assert.equal(calls, 2, "usable again after it settles");
  const failing = singleFlight(async () => { throw new Error("boom"); });
  await assert.rejects(failing(), /boom/); assert.equal(failing.pending(), false, "a failure releases the lock");
}

// 7. No new API / schema / state: the only request is the existing endpoint; revalidation is the existing reads; no second approval state.
{
  const dir = new URL("../src/components/spatial/dive/", import.meta.url);
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  const logic = strip(readFileSync(new URL("missionWorktreePlanApproval.ts", dir), "utf8")), view = strip(readFileSync(new URL("PlanApprovalAction.tsx", dir), "utf8")), hook = strip(readFileSync(new URL("useMissionWorktree.ts", dir), "utf8"));
  assert.deepEqual([...logic.matchAll(/\/api\/[^"'`]*/g)].map(m => m[0]), ["/api/jobs/${encodeURIComponent(jobId)}/approve"], "the only endpoint the logic names");
  assert.equal(/fetch\(|\/api\//.test(view), false, "the component sends nothing itself");
  assert.deepEqual([...hook.matchAll(/["'`](\/api\/[^"'`]*)/g)].map(m => m[1]).sort(), ["/api/approvals", "/api/consultations", "/api/jobs/${encodeURIComponent(id)}"], "revalidation re-reads the same three existing endpoints");
  assert.match(hook, /\[missionId, tick\]/); assert.match(hook, /return \{ worktree, reload \}/);
  assert.equal(/localStorage|sessionStorage|useReducer|createContext/.test(view + logic), false, "no parallel approval state");
}

console.log("test-dive-mission-worktree-plan-approval: all C1b.1 plan approval contract checks passed");
