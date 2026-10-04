import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { DEPARTMENT_TAXONOMY, OVERSIGHT_TAXONOMY, LEGACY_RUNTIME_ROUTES, canonicalDepartmentId, resolveRuntimeRoute, resolveLegacyRuntimeRoute, resolveHumanDepartmentAlias, departmentHasPermission } from "../src/lib/departmentTaxonomy";
import { withInstructionContext, prepareInstructionCall, readInstructionBundle, listInstructionExecutions, instructionReplayStatus, assertSecretFree, type InstructionContext } from "../src/lib/instructionSnapshots";
import { buildRerunJob } from "../src/lib/jobRerun";
import type { Job } from "../src/lib/jobStore";

const app = process.cwd();
const originalEnvironment = { ...process.env };
const originalFetch = globalThis.fetch;
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "growforge-instruction-test-"));
const fixtureApp = path.join(fixtureRoot, "app");
fs.mkdirSync(path.join(fixtureApp, "data"), { recursive: true });
let checks = 0;
async function check(name: string, run: () => void | Promise<void>) { await run(); checks++; console.log(`PASS ${name}`); }
const hash = (text: string) => crypto.createHash("sha256").update(text).digest("hex");
const realJobsFile = path.join(app, "data", "jobs.json");
const realJobsBefore = fs.readFileSync(realJobsFile);
const savedJobs = JSON.parse(realJobsBefore.toString()) as Job[];
process.env.GROWFORGE_INSTRUCTION_STORE_DIR = path.join(fixtureApp, "data", "instruction-executions");
process.env.GROWFORGE_KNOWLEDGE_DIR = fixtureRoot;
process.env.PUBLIC_PREVIEW_MODE = "false";
process.env.BETA_MODE = "false";
process.env.OLLAMA_MODEL = "fixture-model";
for (const key of ["OPENROUTER_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"]) delete process.env[key];
process.chdir(fixtureApp);

try {
  await check("canonical identity, route and human alias namespaces are distinct", () => {
    assert.equal(resolveLegacyRuntimeRoute("sales-bd"), "strategic_intelligence");
    assert.equal(resolveLegacyRuntimeRoute("sales_bd"), "revenue_partnerships");
    assert.equal(resolveHumanDepartmentAlias("Sales/BD"), "revenue_partnerships");
    assert.equal(resolveHumanDepartmentAlias("sales-bd"), undefined);
    assert.equal(resolveRuntimeRoute("revenue_partnerships"), "sales_bd");
    assert.equal(resolveRuntimeRoute("meta-ads"), "meta-ads");
    assert.equal(canonicalDepartmentId("meta-ads"), "brand_growth_marketing");
    assert.equal(resolveLegacyRuntimeRoute("constructor"), undefined);
    assert.equal(resolveRuntimeRoute("constructor"), undefined);
    for (const taxon of [...DEPARTMENT_TAXONOMY, ...OVERSIGHT_TAXONOMY]) {
      assert.ok(!Object.hasOwn(LEGACY_RUNTIME_ROUTES, taxon.id));
      assert.equal(resolveRuntimeRoute(taxon.id), taxon.runtimeRouteId);
    }
  });
  await check("all legacy permission combinations retain exact authorization meaning", () => {
    const routes = Object.keys(LEGACY_RUNTIME_ROUTES);
    for (const grant of routes) for (const route of routes) {
      assert.equal(departmentHasPermission([grant], route), grant === route);
      if (route !== "meta-ads") assert.equal(departmentHasPermission([grant], canonicalDepartmentId(route)), grant === route);
    }
    assert.equal(departmentHasPermission(["brand_growth_marketing"], "meta-ads"), false);
    assert.equal(departmentHasPermission(["meta-ads"], "brand_growth_marketing"), false);
    assert.equal(departmentHasPermission(["revenue_partnerships"], "sales-bd"), false);
    assert.equal(departmentHasPermission(["executive_orchestration"], "qa"), false);
    assert.equal(departmentHasPermission(["unknown"], "unknown"), false);
  });
  const context: InstructionContext = { jobId: "fixture", stepId: "qa", phase: "draft", departmentId: "quality_risk_governance" };
  const system = "Constitution, department policy, blueprint, evidence rules and final execution wrapper. Version 1.";
  const captured = withInstructionContext(context, () => prepareInstructionCall(system, { provider: "ollama", requestedModel: "fixture-model", maxTokens: 100 }));
  await check("exact persisted system text and full hash agree before execution", () => {
    assert.equal(captured.systemPrompt, system);
    assert.equal(captured.execution!.instructionHash, hash(system));
    assert.equal(readInstructionBundle(captured.execution!.bundleRef).systemPrompt, system);
    assert.equal(listInstructionExecutions("fixture").length, 1);
  });
  await check("current attempt freezes its assembled payload across retries", () => {
    const retry = withInstructionContext(context, () => prepareInstructionCall("modified after attempt", { provider: "ollama", requestedModel: "fixture-model" }));
    assert.equal(retry.systemPrompt, system);
    assert.equal(retry.execution!.bundleRef, captured.execution!.bundleRef);
  });
  await check("snapshots survive a separate process reload", () => {
    const child = path.join(fixtureRoot, "reload.ts");
    fs.writeFileSync(child, `import {readInstructionBundle} from ${JSON.stringify(path.join(app, "src/lib/instructionSnapshots.ts").replaceAll("\\", "/"))}; console.log(readInstructionBundle(process.env.TEST_BUNDLE_REF!).instructionHash);`);
    const result = execFileSync(process.execPath, [...process.execArgv, child], { cwd: app, env: { ...process.env, TSX_TSCONFIG_PATH: path.join(app, "tsconfig.json"), TEST_BUNDLE_REF: captured.execution!.bundleRef }, encoding: "utf8" });
    assert.equal(result.trim(), hash(system));
  });
  await check("original and current configurations select different immutable payloads", () => {
    const replay = withInstructionContext({ ...context, replayMode: "original", originalBundles: { "qa:draft": captured.execution!.bundleRef } }, () => prepareInstructionCall("Version 2", { provider: "ollama", requestedModel: "fixture-model" }));
    const current = withInstructionContext({ ...context }, () => prepareInstructionCall("Version 2", { provider: "ollama", requestedModel: "fixture-model" }));
    assert.equal(replay.systemPrompt, system); assert.equal(current.systemPrompt, "Version 2");
    assert.equal(readInstructionBundle(captured.execution!.bundleRef).systemPrompt, system);
  });
  await check("missing and corrupt snapshots fail closed", () => {
    assert.throws(() => withInstructionContext({ ...context, replayMode: "original" }, () => prepareInstructionCall(system, { provider: "ollama", requestedModel: "fixture-model" })), /unavailable/);
    assert.throws(() => readInstructionBundle("../escape"), /Invalid/);
    const ref = "f".repeat(64);
    fs.writeFileSync(path.join(process.env.GROWFORGE_INSTRUCTION_STORE_DIR!, "bundles", `${ref}.json`), JSON.stringify({ version: 1, instructionHash: ref, systemPrompt: "tampered" }));
    assert.throws(() => readInstructionBundle(ref), /integrity/);
  });
  await check("known credential forms and arbitrary protected environment secrets are rejected", () => {
    process.env.FIXTURE_CONNECTOR_SECRET = "fixture-sensitive-value";
    for (const secret of ["sk-" + "X".repeat(32), "Authorization: Bearer xyz", "access_token=opaque-value", "refresh_token: opaque-value", "https://user:password@example.com", "fixture-sensitive-value", "-----BEGIN PRIVATE KEY-----"]) {
      assert.throws(() => assertSecretFree(secret), /blocked/);
    }
    const before = listInstructionExecutions("secret-fixture").length;
    assert.throws(() => withInstructionContext({ ...context, jobId: "secret-fixture" }, () => prepareInstructionCall("access_token=opaque-value", { provider: "ollama", requestedModel: "fixture-model" })), /blocked/);
    assert.equal(listInstructionExecutions("secret-fixture").length, before);
    delete process.env.FIXTURE_CONNECTOR_SECRET;
  });
  await check("all owned department assemblies pass the credential boundary", async () => {
    const { loadInstructions } = await import("../src/lib/departments");
    const knowledge = process.env.GROWFORGE_KNOWLEDGE_DIR;
    process.env.GROWFORGE_KNOWLEDGE_DIR = path.resolve(app, "..");
    try { for (const file of fs.readdirSync(path.resolve(app, "..")).filter(file => file.endsWith("_Agent_System.md"))) assertSecretFree(loadInstructions(file)); }
    finally { process.env.GROWFORGE_KNOWLEDGE_DIR = knowledge; }
  });
  await check("19 legacy jobs retain hashes and explicitly lack original snapshots", () => {
    assert.equal(savedJobs.length, 19);
    for (const job of savedJobs) {
      assert.equal(instructionReplayStatus(job.id).state, "original-instruction-snapshot-unavailable");
      for (const step of job.steps) if (step.departmentId) assert.ok(resolveRuntimeRoute(step.departmentId));
      assert.throws(() => buildRerunJob({ ...job, status: "done" }, "original"), /unavailable/i);
    }
  });
  await check("current reruns create a new canonical record without altering historical source", () => {
    const source = savedJobs.find(job => job.status !== "running")!;
    const before = JSON.stringify(source);
    const next = buildRerunJob(source, "current");
    assert.notEqual(next.id, source.id); assert.equal(next.rerunOf, source.id); assert.equal(next.identitySchemaVersion, 2);
    assert.equal(next.instructionReplayMode, "current"); assert.equal(next.planSnapshot, undefined);
    assert.equal(next.approvedAt, undefined); assert.equal(next.approvedBy, undefined);
    assert.equal(JSON.stringify(source), before);
  });

  // Real model transport and orchestration stage with a mocked network, isolated data/docs.
  fs.writeFileSync(path.join(fixtureApp, "data/ai_models.json"), JSON.stringify([{ id: "ollama-local", providerType: "ollama", modelName: "fixture-model", isPrimary: true }]));
  fs.writeFileSync(path.join(fixtureRoot, "GrowForge Digital — Company Constitution.md"), "Constitution V1. CEO approvals required.");
  fs.writeFileSync(path.join(fixtureRoot, "Quality_Assurance_Agent_System.md"), "Owned governance document V1.");
  const { saveJob, getJob } = await import("../src/lib/jobStore");
  const { runQaStage } = await import("../src/lib/orchestrator");
  const stageJob: Job = { id: "stage-fixture", title: "Isolated QA", brief: "fixture", status: "running", percent: 0, verified: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), liveNotes: [], revisions: [], steps: [{ id: "qa", kind: "qa", label: "Quality, Risk & Governance", activity: "Queued", weight: 1, dependsOn: [], status: "pending", percent: 0 }] };
  saveJob(stageJob);
  let sentSystem = "";
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(String(options?.body));
    sentSystem = body.messages[0].content;
    const execution = listInstructionExecutions(stageJob.id).at(-1)!;
    assert.ok(execution, "attempt must be on disk before request");
    assert.equal(readInstructionBundle(execution.bundleRef).systemPrompt, sentSystem);
    assert.equal(execution.instructionHash, hash(sentSystem));
    assert.ok(!JSON.stringify(execution).includes("headers"));
    return Response.json({ message: { content: "Verdict: PASS" }, prompt_eval_count: 10, eval_count: 5 });
  };
  await check("real QA stage snapshots every final wrapper before the exact model request", async () => {
    await runQaStage(stageJob.id, [], "fixture review", { text: "fixture dossier", sources: [], verified: false });
    assert.ok(sentSystem.includes("Constitution V1")); assert.ok(sentSystem.includes("Owned governance document V1"));
    assert.ok(sentSystem.includes("EVIDENCE RULES")); assert.ok(sentSystem.includes("independent QA reviewer"));
    assert.ok(sentSystem.includes("Produce, in Markdown"));
    assert.ok(sentSystem.includes("Numbered, specific instructions for the final plan"));
    assert.equal(getJob(stageJob.id)!.steps[0].instructionsHash, hash(sentSystem));
  });
  const originalStagePrompt = sentSystem;
  await check("later rule edits cannot change a retried stage snapshot", async () => {
    fs.writeFileSync(path.join(fixtureRoot, "Quality_Assurance_Agent_System.md"), "Owned governance document V2.");
    await runQaStage(stageJob.id, [], "fixture review", { text: "fixture dossier", sources: [], verified: false });
    assert.equal(sentSystem, originalStagePrompt);
  });
  await check("fresh current stage sees new rules while old bundles remain immutable", async () => {
    saveJob({ ...structuredClone(stageJob), id: "stage-current", steps: [{ ...stageJob.steps[0], instructionExecutions: undefined, instructionsHash: undefined }] });
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(String(options?.body)); sentSystem = body.messages[0].content;
      const record = listInstructionExecutions("stage-current").at(-1)!;
      assert.equal(readInstructionBundle(record.bundleRef).systemPrompt, sentSystem);
      return Response.json({ message: { content: "Verdict: PASS" } });
    };
    await runQaStage("stage-current", [], "fixture review", { text: "fixture dossier", sources: [], verified: false });
    assert.ok(sentSystem.includes("document V2")); assert.notEqual(sentSystem, originalStagePrompt);
    assert.equal(readInstructionBundle(listInstructionExecutions(stageJob.id)[0].bundleRef).systemPrompt, originalStagePrompt);
  });
  await check("tool-loop snapshots include the actual tool catalog and approval instructions", async () => {
    const { runToolLoop } = await import("../src/lib/tools");
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      const record = listInstructionExecutions("tool-loop-fixture").at(-1)!;
      assert.equal(readInstructionBundle(record.bundleRef).systemPrompt, body.messages[0].content);
      assert.ok(body.messages[0].content.includes("requires owner approval"));
      assert.ok(body.messages[0].content.includes("fixture_lookup"));
      return Response.json({ message: { content: '{"action":"final","text":"No operation requested."}' } });
    };
    const result = await withInstructionContext({ jobId: "tool-loop-fixture", stepId: "dept:brand_growth_marketing", phase: "tool-gather", departmentId: "brand_growth_marketing" }, () => runToolLoop({ systemPrompt: "Owned tool-gather instructions.", task: "Fixture", tools: [{ name: "fixture_lookup", description: "Fixture description", usage: "{query:string}", requiresApproval: true, execute: async () => { throw new Error("No tool execution allowed in this test."); } }] }));
    assert.equal(result.calls.length, 0);
  });
  await check("grounded research snapshots the instruction layer and excludes HTTP credentials", async () => {
    const { researchViaGemini } = await import("../src/lib/research");
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      const record = listInstructionExecutions("research-fixture").at(-1)!;
      assert.equal(readInstructionBundle(record.bundleRef).systemPrompt, body.systemInstruction.parts[0].text);
      assert.ok(!JSON.stringify(record).includes("fixture-api-credential"));
      return Response.json({ candidates: [{ content: { parts: [{ text: "Fixture sourced finding" }] }, groundingMetadata: { groundingChunks: [{ web: { uri: "https://example.com/fixture", title: "Fixture source" } }] } }] });
    };
    await withInstructionContext({ jobId: "research-fixture", stepId: "research", phase: "research-0", departmentId: "strategic_intelligence" }, () => researchViaGemini("Fixture question", "Fixture context", "fixture-api-credential"));
  });
  await check("concurrent execution contexts retain independent department identities", async () => {
    await Promise.all(["strategic_intelligence", "revenue_partnerships"].map(departmentId => withInstructionContext({ jobId: "concurrent-fixture", stepId: `dept:${departmentId}`, phase: "draft", departmentId }, async () => {
      await Promise.resolve();
      const record = prepareInstructionCall(`Scope: ${departmentId}`, { provider: "ollama", requestedModel: "fixture-model" }).execution!;
      assert.equal(record.canonicalDepartmentId, departmentId);
      assert.equal(record.runtimeRouteId, resolveRuntimeRoute(departmentId));
    })));
  });
  await check("storage failure prevents the model request", async () => {
    const { chatComplete } = await import("../src/lib/llm");
    const previous = process.env.GROWFORGE_INSTRUCTION_STORE_DIR;
    const blocker = path.join(fixtureRoot, "storage-blocker"); fs.writeFileSync(blocker, "file");
    process.env.GROWFORGE_INSTRUCTION_STORE_DIR = blocker;
    let calls = 0; globalThis.fetch = async () => { calls++; throw new Error("Unexpected network call."); };
    try {
      await assert.rejects(withInstructionContext({ ...context, jobId: "blocked-storage" }, () => chatComplete("Fixture instructions", [{ role: "user", content: "Fixture" }])));
      assert.equal(calls, 0);
    } finally { process.env.GROWFORGE_INSTRUCTION_STORE_DIR = previous; }
  });
  await check("rerun API denies anonymous and public-preview requests", async () => {
    const { POST } = await import("../src/app/api/jobs/[id]/rerun/route");
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    process.env.PUBLIC_PREVIEW_MODE = "false";
    const request = () => new Request("http://localhost/api/jobs/fixture/rerun", { method: "POST", body: JSON.stringify({ instructionMode: "current" }), headers: { "Content-Type": "application/json" } });
    assert.equal((await POST(request(), { params: Promise.resolve({ id: "fixture" }) })).status, 401);
    process.env.PUBLIC_PREVIEW_MODE = "true";
    assert.equal((await POST(request(), { params: Promise.resolve({ id: "fixture" }) })).status, 403);
    process.env.PUBLIC_PREVIEW_MODE = "false";
  });
  await check("original rerun preserves a legacy branch route independently of its parent identity", async () => {
    const source: Job = { ...structuredClone(stageJob), id: "branch-source", status: "done", planSnapshot: { title: "fixture", researchQuestions: [], assignments: [{ departmentId: "meta-ads", task: "fixture", activity: "fixture" }] }, steps: [
      { ...stageJob.steps[0], id: "brief", kind: "brief" }, { ...stageJob.steps[0], id: "plan", kind: "plan" },
      { ...stageJob.steps[0], id: "dept:meta-ads", kind: "department", departmentId: "meta-ads" },
      { ...stageJob.steps[0], id: "reconcile", kind: "reconcile" }, { ...stageJob.steps[0], id: "qa", kind: "qa" }, { ...stageJob.steps[0], id: "final", kind: "final" },
    ] };
    for (const step of source.steps.filter(step => !["brief", "plan"].includes(step.id))) {
      for (const phase of step.kind === "department" ? ["draft", "tool-gather"] : ["draft"]) {
        withInstructionContext({ jobId: source.id, stepId: step.id, departmentId: step.departmentId ?? "executive_orchestration", phase }, () => prepareInstructionCall("original branch fixture", { provider: "ollama", requestedModel: "fixture-model" }));
      }
    }
    const before = JSON.stringify(source); const next = buildRerunJob(source, "original");
    assert.equal(JSON.stringify(source), before);
    assert.equal(next.planSnapshot!.assignments[0].departmentId, "brand_growth_marketing");
    assert.equal(next.planSnapshot!.assignments[0].runtimeRouteId, "meta-ads");
    assert.equal(next.planSnapshot!.assignments[0].stepId, "dept:meta-ads");
    assert.equal(next.steps.find(step => step.id === "plan")!.status, "done");
    assert.ok(next.originalInstructionBundles!["dept:meta-ads:tool-gather"]);
    const { jobView } = await import("../src/lib/coreState");
    const view = jobView(next);
    assert.equal(view.departments.find(department => department.id === "meta-ads")!.assigned, true);
    assert.equal(view.departments.find(department => department.id === "brand_growth_marketing")!.assigned, false);
  });
  await check("production saved jobs remain byte-for-byte unchanged", () => assert.deepEqual(fs.readFileSync(realJobsFile), realJobsBefore));
  const { flushBrainLogs } = await import("../src/lib/brainLogger");
  await flushBrainLogs();
  console.log(`${checks} instruction foundation checks PASS. Mocked network; isolated storage: ${fixtureRoot}`);
} finally {
  globalThis.fetch = originalFetch;
  process.chdir(app);
  for (const key of Object.keys(process.env)) if (!(key in originalEnvironment)) delete process.env[key];
  Object.assign(process.env, originalEnvironment);
}
