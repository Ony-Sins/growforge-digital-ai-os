import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import type { CoreState, CoreJobView } from "../src/lib/coreState";
import type { Job } from "../src/lib/jobStore";
import { activeMissions, missionObject, missionLifecycle, selectedMission, missionApprovals, missionCost } from "../src/components/spatial/dive/missionModel";
import { createMission } from "../src/lib/missionClient";

let passed = 0;
async function check(name: string, test: () => void | Promise<void>) { await test(); passed++; console.log(`PASS ${name}`); }
const core = { jobs: [], job: null } as unknown as CoreState;
const summary = { id: "isolated-mission", title: "Marketing Department review", status: "running", percent: 37, createdAt: "2026-10-01T00:00:00Z", isTest: false } as CoreState["jobs"][number];
const job = { ...summary, steps: [], liveNotes: [], revisions: [] } as unknown as Job;
const approval = { id: "isolated-approval", jobId: job.id, stepId: "research", toolName: "search", status: "pending" };
await check("default map excludes history, failed jobs and test fixtures", () => {
  assert.deepEqual(activeMissions({ ...core, jobs: [summary, { ...summary, id: "done", status: "done" }, { ...summary, id: "error", status: "error" }, { ...summary, id: "test", isTest: true }] }).map(item => item.id), [job.id]);
  assert.deepEqual(activeMissions(null), []);
});
await check("canonical display preserves saved identity and progress", () => {
  const item = missionObject(summary); assert.equal(item.id, job.id); assert.match(item.name, /Brand & Growth Marketing/); assert.match(item.context, /37%/); assert.equal(summary.title, "Marketing Department review");
});
await check("lifecycle derives planning and approval holds without relabeling failures", () => {
  assert.equal(missionLifecycle(job), "Active");
  assert.equal(missionLifecycle({ ...job, steps: [{ kind: "plan", status: "active" } as Job["steps"][number]] }), "Planning");
  assert.equal(missionLifecycle(job, [approval]), "Awaiting Approval · Tool action");
  assert.equal(missionLifecycle(job, [{ ...approval, jobId: "other" }]), "Active");
  assert.equal(missionLifecycle({ ...job, status: "error" }, [approval]), "Error");
  assert.equal(missionLifecycle({ ...job, status: "done" }, [approval]), "Completed");
});
await check("awaiting approval requires a real matching pending record", () => {
  for (const status of ["approved", "denied", "expired"]) assert.equal(missionLifecycle(job, [{ ...approval, status }]), "Active");
  assert.equal(missionLifecycle(job, []), "Active");
  assert.equal(missionLifecycle(job, [{ ...approval, jobId: "other" }]), "Active");
  assert.equal(job.status, "running");
});
await check("selected ID rejects incumbent API fallback and missing records", () => {
  assert.throws(() => selectedMission(core, job.id));
  assert.throws(() => selectedMission({ ...core, job: { id: "other" } as CoreJobView }, job.id));
  const selected = { id: job.id } as CoreJobView; assert.equal(selectedMission({ ...core, job: selected }, job.id), selected);
});
await check("approval projection excludes other missions and sensitive arguments", () => {
  const records = [{ ...approval, args: { secret: "fixture-only" } }, { ...approval, jobId: "other" }];
  assert.deepEqual(missionApprovals(records, job.id), [approval]);
});
await check("missing usage and legacy cost estimates are not billing receipts", () => {
  const view = { usage: null } as CoreJobView; assert.match(missionCost(view), /No recorded/);
  assert.match(missionCost({ ...view, usage: { costUsd: null, allCostsKnown: false } as NonNullable<CoreJobView["usage"]> }), /API cost not recorded/);
  assert.doesNotMatch(missionCost({ ...view, usage: { costUsd: 0, allCostsKnown: true } as NonNullable<CoreJobView["usage"]> }), /\$0/);
});
await check("shared creation contract returns server identity and propagates denial", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input, init) => { assert.equal(input, "/api/jobs"); assert.equal(init?.method, "POST"); assert.deepEqual(JSON.parse(String(init?.body)), { brief: "Isolated creation contract" }); return Response.json({ job: { id: job.id } }); };
    assert.equal(await createMission("Isolated creation contract"), job.id);
    globalThis.fetch = async () => Response.json({ error: "Read-only" }, { status: 403 });
    await assert.rejects(createMission("Isolated creation contract"), /Read-only/);
  } finally { globalThis.fetch = originalFetch; }
});

// Import storage-owning modules only after moving into isolated temporary storage.
const originalCwd = process.cwd();
const env = { ...process.env };
const data = path.join(originalCwd, "data");
const digest = (file: string) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const before = new Map(fs.readdirSync(data).filter(name => name.endsWith(".json")).map(name => { const file = path.join(data, name); return [file, digest(file)]; }));
const isolated = fs.mkdtempSync(path.join(os.tmpdir(), "growforge-dive-missions-"));
try {
  process.chdir(isolated);
  delete process.env.BETA_MODE; delete process.env.PUBLIC_PREVIEW_MODE;
  const { isOwnerSession } = await import("../src/lib/session");
  const { POST: approve } = await import("../src/app/api/jobs/[id]/approve/route");
  const { POST: decide } = await import("../src/app/api/approvals/[id]/decide/route");
  await check("authoritative owner policy rejects employee and anonymous actors", () => {
    assert.equal(isOwnerSession(null), false);
    assert.equal(isOwnerSession({ user: { role: "employee", email: "fixture@local" }, expires: "2099-01-01" }), false);
    assert.equal(isOwnerSession({ user: { role: "owner", email: "fixture@local" }, expires: "2099-01-01" }), true);
  });
  for (const [name, handler] of [["plan", approve], ["tool", decide]] as const) {
    await check(`${name} approval routes deny anonymous and preview before record lookup`, async () => {
      (process.env as Record<string, string>).NODE_ENV = "production";
      assert.equal((await handler(new Request("http://localhost/isolated", { method: "POST" }), { params: Promise.resolve({ id: "absent" }) })).status, 401);
      process.env.PUBLIC_PREVIEW_MODE = "true";
      assert.equal((await handler(new Request("http://localhost/isolated", { method: "POST" }), { params: Promise.resolve({ id: "absent" }) })).status, 403);
      delete process.env.PUBLIC_PREVIEW_MODE;
      (process.env as Record<string, string>).NODE_ENV = "development";
      assert.equal((await handler(new Request("http://localhost/isolated", { method: "POST" }), { params: Promise.resolve({ id: "absent" }) })).status, 404);
    });
  }
} finally {
  process.chdir(originalCwd);
  for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
  Object.assign(process.env, env);
  fs.rmSync(isolated, { recursive: true, force: true });
}
await check("all live JSON stores remain byte-identical", () => { for (const [file, hash] of before) assert.equal(digest(file), hash, path.basename(file)); });
console.log(`${passed} checks passed; creation mocked, approval requests isolated, no model calls or live mutations.`);
