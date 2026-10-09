import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Job, JobStep } from "../src/lib/jobStore";
import { buildMissionWorktree, type MissionWorktree } from "../src/components/spatial/dive/missionWorktree";
import { workbenchCapabilities } from "../src/components/spatial/dive/missionWorkbench";
import { workbenchContentOf, type Block } from "../src/components/spatial/dive/missionWorkbenchContent";
import { MIN_REVISION_LENGTH, requestRevision, revisionMessageValid, revisionOffered } from "../src/components/spatial/dive/missionWorktreeRevision";

/** C1b.2 contract: Request a change in the Worktree. The endpoint, the permission rule and the record all pre-exist; this checks the Worktree uses them truthfully. Pure; no network. */
const T = "2026-10-01T10:00:00.000Z";
const step = (id: string, kind: JobStep["kind"], over: Partial<JobStep> = {}): JobStep => ({ id, kind, label: id, activity: "a", status: "done", percent: 100, weight: 10, dependsOn: [], ...over });
function fixture(o: { createdBy?: string; changes?: boolean } = {}): MissionWorktree {
  const steps = [step("brief", "brief"), step("plan", "plan", { dependsOn: ["brief"] })];
  const job: Job = { id: "job-c1b2", title: "Revise Mission", brief: "b", status: "done", percent: 100, verified: true, steps, createdAt: T, updatedAt: T, liveNotes: [],
    revisions: o.changes ? [{ id: "r1", message: "Please change the tone", createdAt: "2026-10-02T08:30:00.000Z", effect: "reran", redoneSteps: ["plan"] }, { id: "r2", message: "Shorter intro", createdAt: "2026-10-03T08:30:00.000Z", effect: "queued" }] : [],
    ...(o.createdBy ? { createdBy: o.createdBy } : {}) };
  return buildMissionWorktree({ job, approvals: [] });
}
const flat = (blocks: Block[]): Block[] => blocks.flatMap(b => (b.kind === "group" ? [b, ...flat(b.blocks)] : [b]));
const text = (wt: MissionWorktree) => flat(workbenchContentOf(wt, wt.mission.id, "requestedChanges")!.blocks).map(b => b.kind === "record" ? `${b.title} ${b.body ?? ""} ${(b.facts ?? []).map(f => `${f.label}: ${f.value}`).join(" ")}` : b.kind === "empty" ? b.text : "").join("\n");

// 1. The section stays reachable with zero recorded changes (it is the action's home), says so truthfully, and keeps recorded changes unchanged.
{
  const section = (wt: MissionWorktree) => workbenchCapabilities(wt, wt.mission.id)!.sections.find(s => s.id === "requestedChanges");
  assert.ok(section(fixture()), "reachable with no recorded change");
  assert.equal(workbenchCapabilities(fixture(), fixture().mission.id)!.capabilities.find(c => c.id === "requestedChanges")!.state, "recorded-empty", "the state is still recorded-empty: nothing is implied");
  assert.match(text(fixture()), /No requested change is recorded\./);
  assert.equal(section(fixture({ changes: true }))!.count, 2);
  const shown = text(fixture({ changes: true }));
  assert.match(shown, /Please change the tone/); assert.match(shown, /Steps were re-run/); assert.match(shown, /Re-ran: plan/); assert.match(shown, /Shorter intro/); assert.match(shown, /Queued/);
}

// 2. Who is OFFERED the action: an owner, or the authenticated viewer who IS the recorded creator. A recorded creator alone never offers it to anyone else. UX only; the server re-checks.
{
  const made = fixture({ createdBy: "creator@x.test" }), noCreator = fixture();
  const who = (email: string | null, role: string | null = "employee") => ({ email, role });
  assert.equal(revisionOffered(made, "owner", null), true, "workspace owner");
  assert.equal(revisionOffered(made, "employee", who("boss@x.test", "owner")), true, "authenticated owner session");
  assert.equal(revisionOffered(noCreator, "owner", null), true, "owner, no creator recorded");
  assert.equal(revisionOffered(made, "employee", who("creator@x.test")), true, "the actual creator");
  assert.equal(revisionOffered(made, "employee", who("  Creator@X.test ")), true, "the same identity, case/space-insensitive like the server (it lower-cases the session email)");
  assert.equal(revisionOffered(made, "employee", who("other@x.test")), false, "REGRESSION: unrelated employee + mission created by someone else -> no action");
  assert.equal(revisionOffered(made, "employee", who("other@x.test", "tester")), false);
  assert.equal(revisionOffered(made, "employee", null), false, "viewer unknown (not read yet / signed out / dev bypass): never assumed to be the creator");
  assert.equal(revisionOffered(made, "employee", who(null)), false, "no email on the session");
  assert.equal(revisionOffered(noCreator, "employee", who("creator@x.test")), false, "no creator recorded: only an owner");
  for (const role of ["employee", "member", "viewer", "", "OWNER"]) assert.equal(revisionOffered(made, role, who("other@x.test", null)), false, `${role || "(empty role)"} is not an owner`);
}

// 3. The minimum request length is the existing one: 5 characters after trimming.
{
  assert.equal(MIN_REVISION_LENGTH, 5);
  for (const bad of ["", "    ", "abcd", "  abcd  ", "\n abcd \n"]) assert.equal(revisionMessageValid(bad), false, JSON.stringify(bad));
  for (const good of ["abcde", "  abcde  ", "Cut the budget"]) assert.equal(revisionMessageValid(good), true, JSON.stringify(good));
}

// 4. The request: the existing endpoint, POST JSON { message } (trimmed), the id encoded; the REAL server error is surfaced.
{
  const calls: { url: string; init: { method: string; headers: Record<string, string>; body: string } }[] = [];
  const reply = (status: number, body: unknown, jsonThrows = false) => async (url: string, init: { method: string; headers: Record<string, string>; body: string }) => { calls.push({ url, init }); return { ok: status >= 200 && status < 300, status, json: async () => { if (jsonThrows) throw new Error("not json"); return body; } } as Pick<Response, "ok" | "status" | "json">; };
  assert.deepEqual(await requestRevision("job-c1b2", "  Cut the budget  ", reply(200, { job: {} })), { ok: true });
  assert.equal(calls[0].url, "/api/jobs/job-c1b2/revise"); assert.equal(calls[0].init.method, "POST"); assert.deepEqual(calls[0].init.headers, { "Content-Type": "application/json" });
  assert.deepEqual(JSON.parse(calls[0].init.body), { message: "Cut the budget" }, "trimmed, and nothing else is sent");
  await requestRevision("a b/c", "Cut the budget", reply(200, {})); assert.equal(calls[1].url, "/api/jobs/a%20b%2Fc/revise", "the id is encoded");
  const before = calls.length;
  assert.equal((await requestRevision("j", "abcd", reply(200, {}))).ok, false); assert.equal(calls.length, before, "too short: nothing is sent");
  assert.deepEqual(await requestRevision("j", "Cut the budget", reply(403, { error: "Only the person who launched this project, or an owner, can change it." })), { ok: false, error: "Only the person who launched this project, or an owner, can change it." });
  assert.deepEqual(await requestRevision("j", "Cut the budget", reply(404, { error: "Project not found." })), { ok: false, error: "Project not found." });
  assert.deepEqual(await requestRevision("j", "Cut the budget", reply(500, { error: "Revision failed." })), { ok: false, error: "Revision failed." });
  assert.deepEqual(await requestRevision("j", "Cut the budget", reply(502, null, true)), { ok: false, error: "Change request failed (HTTP 502)." }, "a non-JSON failure still reports the real status");
  assert.deepEqual(await requestRevision("j", "Cut the budget", reply(400, { error: "" })), { ok: false, error: "Change request failed (HTTP 400)." });
  assert.deepEqual(await requestRevision("j", "Cut the budget", async () => { throw new Error("Failed to fetch"); }), { ok: false, error: "Failed to fetch" });
  assert.equal((await requestRevision("j", "Cut the budget", reply(200, null, true))).ok, true, "a successful non-JSON body is still a success");
}

// 5. No new API / schema / state: the only request is the existing endpoint; the component sends nothing itself, claims nothing, and reuses the single-flight lock; no storage.
{
  const dir = new URL("../src/components/spatial/dive/", import.meta.url);
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  const logic = strip(readFileSync(new URL("missionWorktreeRevision.ts", dir), "utf8")), view = strip(readFileSync(new URL("RevisionRequestAction.tsx", dir), "utf8"));
  assert.deepEqual([...logic.matchAll(/\/api\/[^"'`]*/g)].map(m => m[0]), ["/api/jobs/${encodeURIComponent(jobId)}/revise"], "the only endpoint the logic names");
  assert.equal(/fetch\(|\/api\//.test(view), false, "the component sends nothing itself");
  assert.match(view, /singleFlight\(/); assert.match(view, /may make this mission’s work run again/); assert.match(view, /not a discussion-only message/);
  assert.equal(/localStorage|sessionStorage|useReducer|createContext/.test(view + logic), false, "no parallel revision state");
  assert.equal(/re-ran|reran|was re-run|has been re-run|Revision recorded|Change recorded/i.test(view), false, "the component never claims a recorded change or a re-run: only the section shows recorded state");
  const wiring = strip(readFileSync(new URL("MissionWorktreeView.tsx", dir), "utf8"));
  assert.match(wiring, /selection\.section === "requestedChanges"\s*\?\s*<RevisionRequestAction worktree=\{worktree\} onRequested=\{onReload\}/, "wired to the mission's Requested changes section with the existing reload");
}

console.log("test-dive-mission-worktree-revision: all C1b.2 request-a-change contract checks passed");
