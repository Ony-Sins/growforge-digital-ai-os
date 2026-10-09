import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DIVE_LENSES } from "../src/components/spatial/dive/overviewModel";
import { DIVE_LENS_IDS, DIVE_LENS_REGISTRY, diveDepth, lensById, resolveDiveIntent, scopeText, semanticAddress } from "../src/lib/diveLenses";
import { FINANCE_MODES, FINANCE_MODULES, financeModule, financeModuleByPhrase, financeModulesFor, financeTrackedCount } from "../src/lib/financeFoundation";
import { errorKindOf, missionState, missionStateCounts, MISSION_STATES, type ErrorKind } from "../src/components/spatial/dive/missionStates";
import { noraSurfaceContext } from "../src/lib/noraSurfaceContext";
import { resolveSemanticRoute } from "../src/lib/semanticNavigation";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

// 1. Nine canonical lenses, one registry, one order.
assert.equal(DIVE_LENS_IDS.length, 9);
assert.deepEqual([...DIVE_LENS_IDS], ["lens.overview", "lens.missions", "lens.context", "lens.finance", "lens.departments", "lens.agents", "lens.workflows", "lens.tools", "lens.intelligence"]);
assert.deepEqual(DIVE_LENS_REGISTRY.map(lens => lens.label), [...DIVE_LENSES], "overviewModel.DIVE_LENSES must mirror the registry");
assert.equal(new Set(DIVE_LENS_REGISTRY.map(lens => lens.slug)).size, 9);
assert.ok(DIVE_LENS_REGISTRY.every(lens => lens.id === `lens.${lens.slug}` && lens.purpose.length > 20 && lens.defaultScope && lens.aliases.length));

// 2. Scope text and the three-depth address model.
assert.equal(scopeText({ lensId: "lens.overview" }), "Overview");
assert.equal(scopeText({ lensId: "lens.missions" }), "All Missions");
assert.equal(scopeText({ lensId: "lens.missions", entity: { type: "mission", id: "j1", label: "Voice V2" } }), "Mission / Voice V2");
assert.equal(scopeText({ lensId: "lens.missions", entity: { type: "mission", id: "j1", label: "Voice V2" }, detail: { type: "step", id: "s1", label: "STT Benchmark" } }), "Mission / Voice V2 / STT Benchmark");
assert.equal(scopeText({ lensId: "lens.finance", entity: { type: "module", id: "finance.api_cost", label: "API Cost" } }), "Finance / API Cost");
assert.equal(scopeText({ lensId: "lens.overview", entity: { type: "mission", id: "j1", label: "X" } }), "Mission / X", "an entity keeps its own noun even from Overview");
assert.ok(scopeText({ lensId: "lens.agents", entity: { type: "agent", id: "a", label: "x".repeat(200) } }).length < 70, "scope labels are bounded");
assert.equal(diveDepth({ lensId: "lens.finance" }), "lens");
assert.equal(diveDepth({ lensId: "lens.finance", entity: { type: "module", id: "m", label: "m" } }), "entity");
assert.equal(diveDepth({ lensId: "lens.finance", entity: { type: "module", id: "m", label: "m" }, detail: { type: "breakdown", id: "b", label: "b" } }), "detail");
assert.equal(diveDepth({ lensId: "lens.finance", detail: { type: "breakdown", id: "b", label: "b" } }), "lens", "a detail without an entity is not a valid depth");
assert.equal(semanticAddress({ lensId: "lens.missions" }), "lens.missions");
assert.equal(semanticAddress({ lensId: "lens.missions", entity: { type: "mission", id: "j1", label: "ignored" }, detail: { type: "step", id: "s1", label: "ignored" } }), "lens.missions/mission:j1/step:s1");
assert.equal(semanticAddress({ lensId: "lens.finance", detail: { type: "breakdown", id: "b", label: "b" } }), "lens.finance", "orphan detail is dropped from the address");

// 3. Spoken phrases resolve to semantic intents, never to DOM text. Nothing executes here.
assert.deepEqual(resolveDiveIntent("Nora, open Missions."), { kind: "open-lens", lensId: "lens.missions" });
assert.deepEqual(resolveDiveIntent("Nora, open Finance."), { kind: "open-lens", lensId: "lens.finance" });
assert.deepEqual(resolveDiveIntent("open the context"), { kind: "open-lens", lensId: "lens.context" });
assert.deepEqual(resolveDiveIntent("Nora, show API costs"), { kind: "open-entity", lensId: "lens.finance", entity: { type: "module", id: "finance.api_cost" } });
assert.deepEqual(resolveDiveIntent("show me the budget"), { kind: "open-entity", lensId: "lens.finance", entity: { type: "module", id: "finance.budget" } });
assert.deepEqual(resolveDiveIntent("Nora, show Voice V2"), { kind: "find-entity", query: "voice v2" }, "dynamic entities need a live lookup");
assert.deepEqual(resolveDiveIntent("Nora, go back."), { kind: "back" });
assert.deepEqual(resolveDiveIntent("back"), { kind: "back" });
assert.equal(resolveDiveIntent("what is the weather"), null);
assert.equal(resolveDiveIntent("   "), null);
for (const id of DIVE_LENS_IDS) assert.equal(resolveSemanticRoute({ type: "SHOW_DIVE_LENS", params: { lensId: id } }).path, `/?tier=home&lens=${lensById(id)!.slug}`);
assert.equal(resolveSemanticRoute({ type: "SHOW_DIVE_LENS", params: { lensId: "lens.nope" } }).action, "SHOW_DASHBOARD", "an unknown lens id is never trusted");
assert.equal(resolveSemanticRoute({ type: "SHOW_DIVE_LENS" }).action, "SHOW_DASHBOARD");

// 4. Finance holds structure only: no value, estimate or currency anywhere, and nothing tracked.
assert.deepEqual([...FINANCE_MODES], ["Business", "Personal", "Combined"]);
assert.equal(FINANCE_MODULES.length, 6);
assert.deepEqual(FINANCE_MODULES.map(module => module.label), ["Total Spend", "API Cost", "Subscriptions", "Budget", "Cash Flow", "Expense Activity"]);
assert.equal(financeTrackedCount(), 0);
for (const entry of FINANCE_MODULES) {
  for (const text of [entry.purpose, entry.unavailable, entry.breakdown]) assert.ok(!/[$€£¥]|\d/.test(text), `finance copy must not carry a figure: ${text}`);
  assert.ok(/not tracked|no .* connected|no budget/i.test(entry.unavailable), `${entry.id} must say it has no source`);
  assert.equal(financeModule(entry.id), entry);
}
assert.equal(financeModuleByPhrase("api costs")?.id, "finance.api_cost");
assert.equal(financeModuleByPhrase("weather"), undefined);
assert.ok(!financeModulesFor("Personal").some(module => module.id === "finance.api_cost"), "API cost is business-only, hidden (not zeroed) in Personal");
assert.ok(financeModulesFor("Business").some(module => module.id === "finance.api_cost"));
const financeSource = read("../src/components/spatial/dive/FinanceLens.tsx");
assert.ok(!/fetch\(|XMLHttpRequest|localStorage|useSWR/.test(financeSource), "the Finance foundation performs no data reads or storage");
assert.ok(!/[$€£¥]\s?\d|\.toFixed|toLocaleString\(.*currency/.test(financeSource), "no money formatting in the Finance foundation");

// 5. Mission states: derived from recorded facts only; unknown is null, never a guessed zero.
const jobs = [
  { id: "r1", status: "running" as const }, { id: "r2", status: "running" as const }, { id: "d1", status: "done" as const },
  { id: "e1", status: "error" as const }, { id: "e2", status: "error" as const },
];
const waiting = new Set(["r2"]);
const kinds = new Map<string, ErrorKind>([["e1", "interrupted"], ["e2", "failed"]]);
assert.deepEqual(MISSION_STATES, ["running", "waiting", "blocked", "completed", "unverified"]);
assert.equal(missionState(jobs[0], waiting, kinds), "running");
assert.equal(missionState(jobs[1], waiting, kinds), "waiting");
assert.equal(missionState(jobs[2], waiting, kinds), "completed");
assert.equal(missionState(jobs[3], waiting, kinds), "unverified");
assert.equal(missionState(jobs[4], waiting, kinds), "blocked");
assert.equal(missionState(jobs[3], waiting, new Map()), "checking", "an errored job is not called blocked until its record is read");
assert.deepEqual(missionStateCounts(jobs, waiting, kinds), { running: 1, waiting: 1, blocked: 1, completed: 1, unverified: 1 });
assert.equal(missionStateCounts(jobs, null, kinds).waiting, null, "unreadable approvals make waiting undeterminable, not zero");
const unresolved = missionStateCounts(jobs, waiting, new Map());
assert.equal(unresolved.blocked, null); assert.equal(unresolved.unverified, null); assert.equal(unresolved.running, 1);
assert.deepEqual(missionStateCounts([], waiting, kinds), { running: 0, waiting: 0, blocked: 0, completed: 0, unverified: 0 }, "a known empty set is a real zero");
assert.equal(errorKindOf({ error: "Interrupted by a server restart before it finished." }), "interrupted");
assert.equal(errorKindOf({ error: "Provider timeout", steps: [{ error: "Interrupted" }] }), "interrupted");
assert.equal(errorKindOf({ error: "Provider timeout", steps: [{ error: "429" }] }), "failed");
assert.equal(errorKindOf({}), "failed");

// 6. NORA scope reaches the model only as a scope label, and only on Dive In. Old output is unchanged.
const scope = { lensId: "lens.finance", lens: "Finance", scope: "Finance / API Cost", address: "lens.finance/module:finance.api_cost", entity: { type: "module", id: "finance.api_cost", label: "API Cost" } };
const base = noraSurfaceContext("Dive In");
assert.equal(noraSurfaceContext("Dive In", null, null, null, null, null, null, null, null, null), base, "a null scope leaves the context byte-identical");
const withScope = noraSurfaceContext("Dive In", null, null, null, null, null, null, null, null, scope);
assert.ok(withScope.includes('"diveScope"') && withScope.includes("Finance / API Cost") && withScope.includes("implies no recorded data"));
assert.equal(noraSurfaceContext("Systems", null, null, null, null, null, null, null, null, scope), noraSurfaceContext("Systems"), "scope is ignored outside Dive In");
assert.equal(noraSurfaceContext("CORE", null, null, null, null, null, null, null, null, scope), noraSurfaceContext("CORE"));

// 7. Wiring contracts (source-level, so a refactor cannot silently drop them).
const overview = read("../src/components/spatial/dive/DiveOverview.tsx");
assert.ok(overview.includes("data-semantic-id={lensByLabel(name)?.id}"), "every lens button carries its semantic id");
assert.ok(overview.includes("DIVE_OPEN_EVENT") && overview.includes("lensTrail"), "semantic open + back channel exists");
assert.ok(overview.includes("<FinanceLens") && overview.includes("<DiveScopeProvider"));
const header = read("../src/components/spatial/dive/LensHeader.tsx");
assert.ok(header.includes("data-lens-id") && header.includes("data-nora-scope") && header.includes("data-entity-id"));
assert.ok(/metric\.value \?\? "(?:—|\\u2014)"/.test(header), "unknown metrics render as an em dash, never a zero");
// Missions is the Worktree (its own contextual header carries the Context Thread NORA reads); the other eight lenses share LensHeader.
{ const missions = read("../src/components/spatial/dive/MissionLens.tsx"); assert.ok(missions.includes("<MissionsIndexHeader") && missions.includes("<MissionWorktreeLens"), "MissionLens is the Worktree + its index header"); }
for (const lens of ["DepartmentsLens", "AgentsLens", "WorkflowsLens", "ContextLens", "ToolsLens", "IntelligenceLens", "FinanceLens"]) {
  assert.ok(read(`../src/components/spatial/dive/${lens}.tsx`).includes("<LensHeader"), `${lens} uses the shared LensHeader`);
}
const core = read("../src/components/spatial/CoreCommandCenter.tsx");
assert.ok(core.includes("DIVE_SCOPE_EVENT") && (core.match(/intelligenceRecord, diveScope/g) ?? []).length >= 3, "NORA receives the scope in every context call");

console.log("PASS nine-lens registry parity, scope text and three-depth addressing, spoken intents resolve semantically, Finance carries no figures or reads and Personal is a separate hidden scope, mission states are derived from recorded facts with null for unknown, NORA scope is a label only and unchanged when absent, shared header/state wiring.");
