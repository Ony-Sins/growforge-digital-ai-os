/**
 * GrowForge MCP Gateway — Phase 1 deterministic tests.
 *
 *   npx tsx scripts/test-growforge-mcp-server.ts
 *
 * Spawns the REAL stdio entry as a child process and drives it with the official
 * MCP SDK client. Most checks run against a throw-away fixture data root
 * (GROWFORGE_MCP_ROOT) so results are exact and reproducible; one smoke check runs
 * against the real repo data to prove the adapters work on live state.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  assertLocalDevelopmentEnvironment,
  boundPayload,
  createLocalOwnerActor,
  redactString,
  resetRedactionCache,
  sanitizeDeep,
  sanitizeError,
} from "@/lib/mcp-server/safety";

const UI_ROOT = path.resolve(path.dirname(process.argv[1] ?? "."), "..");
const ENTRY = path.join(UI_ROOT, "scripts", "growforge-mcp-stdio.mts");
const NPX = process.platform === "win32" ? "npx.cmd" : "npx";

// Representative credential material. None of these may ever appear in a tool result.
const SECRETS = {
  openrouter: "sk-or-v1-0123456789abcdef0123456789abcdef0123456789abcdef",
  gemini: "AIzaSyD-FAKEFAKEFAKEFAKEFAKEFAKE12345678",
  groq: "gsk_FAKEFAKEFAKEFAKEFAKEFAKE1234",
  github: "ghp_FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE12",
  jwt: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlIn0.FAKESIGNATUREFAKESIG",
  bearer: "Bearer FAKEBEARERTOKEN0123456789abcdef",
  vaultValue: "vault-plaintext-should-never-leak-9f8e7d",
  connectorAuth: "connector-header-secret-value-123456",
  envOnly: "env-only-secret-value-not-pattern-shaped-77",
};
const MASTER_KEY = crypto.randomBytes(32).toString("hex");

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function sha(file: string) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}
function snapshotDir(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[path.relative(dir, p)] = sha(p);
    }
  };
  walk(dir);
  return out;
}

// ---------------------------------------------------------------------------
// Fixture data root
// ---------------------------------------------------------------------------

function buildFixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gf-mcp-fixture-"));
  const data = path.join(root, "data");
  fs.mkdirSync(data, { recursive: true });
  const now = Date.now();
  const iso = (offsetMin: number) => new Date(now - offsetMin * 60_000).toISOString();

  const step = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
    id,
    kind: "department",
    label: `Step ${id}`,
    departmentId: "marketing",
    activity: "working",
    status,
    percent: status === "done" ? 100 : 0,
    weight: 1,
    dependsOn: [],
    ...extra,
  });
  const usage = (provider: string, model: string, i: number, o: number) => ({
    provider,
    model,
    inputTokens: i,
    outputTokens: o,
    durationMs: 1200,
    timestamp: iso(5),
  });

  const bigSteps = Array.from({ length: 120 }, (_, n) =>
    step(`s${n}`, "done", { output: "x".repeat(2000), usage: [usage("gemini", "gemini-2.5-flash", 100, 50)] }),
  );

  const jobs = [
    {
      id: "job-done-1",
      title: "Launch plan for fixture co",
      brief: `Plan a launch. api_key=${SECRETS.openrouter}`,
      status: "done",
      percent: 100,
      verified: true,
      steps: [
        step("a", "done", { output: `Result with token ${SECRETS.github} and ${SECRETS.jwt}`, usage: [usage("gemini", "gemini-2.5-flash", 1000, 400)] }),
      ],
      finalOutput: `Final ${SECRETS.gemini} ${SECRETS.bearer}`,
      createdAt: iso(120),
      updatedAt: iso(100),
      finishedAt: iso(100),
      approvedAt: iso(90),
      approvedBy: "owner@example.test",
      createdBy: "owner@example.test",
      liveNotes: [],
      revisions: [],
    },
    {
      id: "job-failed-1",
      title: "Broken research run",
      brief: "Research something",
      status: "error",
      percent: 40,
      verified: false,
      error: `Provider rejected key ${SECRETS.groq} at C:\\Users\\someone\\secret\\path\\file.ts`,
      steps: [step("b", "error", { error: `401 Authorization: ${SECRETS.bearer}` })],
      createdAt: iso(60),
      updatedAt: iso(55),
      finishedAt: iso(55),
      liveNotes: [],
      revisions: [],
    },
    {
      id: "job-live-1",
      title: "Persisted as running",
      brief: "In flight",
      status: "running",
      percent: 30,
      verified: false,
      steps: [step("c", "active")],
      createdAt: iso(10),
      updatedAt: iso(9),
      liveNotes: [],
      revisions: [],
    },
    {
      id: "job-big-1",
      title: "Huge mission",
      brief: "Large",
      status: "done",
      percent: 100,
      verified: false,
      steps: bigSteps,
      finalOutput: "y".repeat(50_000),
      createdAt: iso(200),
      updatedAt: iso(190),
      finishedAt: iso(190),
      liveNotes: [],
      revisions: [],
    },
    {
      id: "job-test-fixture",
      title: "synthetic test job",
      brief: "ignored",
      status: "done",
      percent: 100,
      verified: false,
      steps: [],
      createdAt: iso(300),
      updatedAt: iso(300),
      liveNotes: [],
      revisions: [],
    },
  ];
  fs.writeFileSync(path.join(data, "jobs.json"), JSON.stringify(jobs, null, 2));
  fs.writeFileSync(path.join(data, "approvals.json"), "[]");
  fs.writeFileSync(
    path.join(data, "store.json"),
    JSON.stringify({
      agents: [],
      nextLogId: 3,
      logs: [
        { id: 1, timestamp: iso(30), agentId: "qa", level: "info", message: "ran ok" },
        { id: 2, timestamp: iso(20), agentId: "qa", level: "error", message: `failed with ${SECRETS.openrouter}` },
      ],
    }),
  );
  fs.writeFileSync(
    path.join(data, "ai_models.json"),
    JSON.stringify([
      {
        id: "omniroute-default",
        name: "Omniroute",
        providerType: "omniroute",
        baseUrl: "http://user:pw@localhost:20128/v1?key=abc",
        modelName: "auto",
        taskRole: "general",
        isPrimary: true,
        source: "local",
        createdAt: iso(1000),
        status: "active",
        lastTestedAt: iso(15),
        lastStatus: "error",
        lastErrorMessage: `connect failed with ${SECRETS.gemini}`,
      },
      {
        id: "openrouter-default",
        name: "OpenRouter",
        providerType: "openrouter",
        baseUrl: "https://openrouter.ai/api/v1",
        modelName: "some/model",
        taskRole: "general",
        source: "env",
        createdAt: iso(1000),
      },
    ]),
  );
  fs.writeFileSync(
    path.join(data, "mcp-servers.json"),
    JSON.stringify([
      {
        id: "srv1",
        name: "Fixture MCP",
        transport: "stdio",
        command: "npx",
        args: ["-y", "some-server", `--token=${SECRETS.github}`],
        allowedDepartments: [],
        createdAt: iso(500),
        status: "connected",
        errorMessage: `auth failed ${SECRETS.bearer}`,
        detectedTools: [{ name: "t1", description: "d" }],
      },
    ]),
  );
  fs.writeFileSync(
    path.join(data, "connectors.json"),
    JSON.stringify([
      {
        id: "c1",
        name: "Fixture connector",
        method: "POST",
        url: "https://hooks.example.test/path?secret=zzz",
        headers: { Authorization: SECRETS.connectorAuth },
        authMode: "header",
        authHeaderName: "Authorization",
        createdAt: iso(400),
      },
    ]),
  );
  return root;
}

async function seedVault(root: string) {
  // Put a real encrypted value in the fixture vault via the app's own vault code.
  const prevCwd = process.cwd();
  process.chdir(root);
  process.env.VAULT_MASTER_KEY = MASTER_KEY;
  try {
    const { setSecret } = await import("@/lib/serverVault");
    const { SYSTEM_VAULT_ID } = await import("@/lib/llm");
    setSecret(SYSTEM_VAULT_ID, "openrouter", SECRETS.vaultValue);
  } finally {
    process.chdir(prevCwd);
  }
}

// ---------------------------------------------------------------------------
// MCP client helper
// ---------------------------------------------------------------------------

async function connect(root: string, extraEnv: Record<string, string> = {}) {
  const transport = new StdioClientTransport({
    command: NPX,
    // Launch exactly like an MCP client does: from an unrelated cwd, with an explicit tsconfig.
    args: ["tsx", "--tsconfig", path.join(UI_ROOT, "tsconfig.json"), ENTRY],
    cwd: path.resolve(UI_ROOT, ".."),
    stderr: "pipe",
    env: {
      GROWFORGE_MCP_ROOT: root,
      VAULT_MASTER_KEY: MASTER_KEY,
      OPENROUTER_API_KEY: SECRETS.openrouter,
      GEMINI_API_KEY: SECRETS.gemini,
      CUSTOM_SERVICE_TOKEN: SECRETS.envOnly,
      // Probe targets that are guaranteed closed so health results are deterministic.
      OLLAMA_BASE_URL: "http://127.0.0.1:9",
      SEARXNG_BASE_URL: "http://127.0.0.1:9",
      N8N_HOST: "http://127.0.0.1:9",
      COMFYUI_SERVER_URL: "http://127.0.0.1:9",
      ...extraEnv,
    },
  });
  const client = new Client({ name: "gf-test-client", version: "0.0.0" });
  await client.connect(transport);
  return { client, transport };
}

type Envelope = { ok: boolean; tool: string; data?: any; error?: { code: string; message: string }; truncated?: boolean; provenance?: any };
async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content as { type: string; text: string }[])[0]?.text ?? "";
  let env: Envelope | null = null;
  try {
    env = JSON.parse(text);
  } catch {
    env = null;
  }
  return { res, text, env, isError: Boolean(res.isError) };
}

// ---------------------------------------------------------------------------

async function main() {
  console.log("GrowForge MCP Gateway — Phase 1 tests\n");

  // --- Unit: redaction & guard ---------------------------------------------
  console.log("[unit] secret-leak regression + guard");
  process.env.CUSTOM_SERVICE_TOKEN = SECRETS.envOnly;
  resetRedactionCache();
  const samples = [SECRETS.openrouter, SECRETS.gemini, SECRETS.groq, SECRETS.github, SECRETS.jwt, SECRETS.bearer, SECRETS.envOnly, MASTER_KEY];
  for (const s of samples) {
    check(`redactString masks ${s.slice(0, 10)}…`, !redactString(`before ${s} after`).includes(s));
  }
  check("redactString masks key=value pairs", !redactString("password=hunter2hunter2").includes("hunter2hunter2"));
  const deep = sanitizeDeep({
    apiKey: "plainsecretvalue",
    hasApiKey: true,
    totalTokens: 42,
    inputTokens: 7,
    nested: { accessToken: "abc123abc123", headers: { Authorization: "x-y-z-123456" }, note: `k ${SECRETS.groq}` },
  });
  check("sanitizeDeep masks credential-named keys", deep.apiKey === "[REDACTED]" && deep.nested.accessToken === "[REDACTED]");
  check("sanitizeDeep keeps booleans/counters", deep.hasApiKey === true && deep.totalTokens === 42 && deep.inputTokens === 7);
  check("sanitizeDeep redacts string values", !JSON.stringify(deep).includes(SECRETS.groq));
  const e = sanitizeError(new Error("boom at C:\\Users\\me\\proj\\file.ts:10 with " + SECRETS.openrouter));
  check("sanitizeError strips paths + secrets", !e.message.includes("C:\\Users") && !e.message.includes(SECRETS.openrouter) && e.code === "INTERNAL");
  check("guard: PUBLIC_PREVIEW_MODE blocked", !assertLocalDevelopmentEnvironment({ PUBLIC_PREVIEW_MODE: "true" } as any).ok);
  check("guard: BETA_MODE blocked", !assertLocalDevelopmentEnvironment({ BETA_MODE: "true" } as any).ok);
  check("guard: NEXT_PUBLIC_PREVIEW_MODE blocked", !assertLocalDevelopmentEnvironment({ NEXT_PUBLIC_PREVIEW_MODE: "true" } as any).ok);
  check("guard: production blocked", !assertLocalDevelopmentEnvironment({ NODE_ENV: "production" } as any).ok);
  check("guard: Vercel blocked", !assertLocalDevelopmentEnvironment({ VERCEL: "1" } as any).ok);
  check("guard: plain local dev allowed", assertLocalDevelopmentEnvironment({ NODE_ENV: "development" } as any).ok);
  const big = boundPayload({ items: Array.from({ length: 500 }, (_, i) => ({ i, pad: "z".repeat(200) })) });
  check("boundPayload shrinks oversized arrays", big.truncated && JSON.stringify(big.value).length <= 24_000);
  check("actor is local_owner_mcp, no invented ids", createLocalOwnerActor().actorType === "local_owner_mcp" && createLocalOwnerActor().workspaceId === null && createLocalOwnerActor().userId === null);

  // --- Process-level guard --------------------------------------------------
  console.log("\n[process] public-preview guard on the real entry");
  for (const env of [{ PUBLIC_PREVIEW_MODE: "true" }, { BETA_MODE: "true" }, { NODE_ENV: "production" }]) {
    const r = spawnSync(NPX, ["tsx", "--tsconfig", path.join(UI_ROOT, "tsconfig.json"), ENTRY], {
      cwd: path.resolve(UI_ROOT, ".."),
      env: { ...process.env, ...env, GROWFORGE_MCP_ROOT: os.tmpdir() } as NodeJS.ProcessEnv,
      encoding: "utf8",
      shell: process.platform === "win32",
      timeout: 60_000,
    });
    check(
      `entry refuses to start with ${JSON.stringify(env)}`,
      r.status === 78 && /refusing to start/.test(r.stderr) && r.stdout.trim() === "",
      `status=${r.status} stdout=${JSON.stringify(r.stdout.slice(0, 80))}`,
    );
  }

  // --- Fixture suite --------------------------------------------------------
  const root = buildFixture();
  await seedVault(root);
  // setSecret persists asynchronously (write queue) — wait for the vault file to land so the
  // read-only snapshot below measures the SERVER, not our own seeding write.
  for (let i = 0; i < 50 && (!fs.existsSync(path.join(root, "data", "vault.json")) || fs.existsSync(path.join(root, "data", "vault.json.tmp"))); i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  const before = snapshotDir(path.join(root, "data"));
  console.log(`\n[stdio] fixture root ${root}`);
  const { client, transport } = await connect(root);
  const sweep: string[] = [];
  try {
    check("1. server initializes over stdio", client.getServerVersion()?.name === "growforge-readonly");

    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    const expected = [
      "growforge_get_api_usage",
      "growforge_get_mission",
      "growforge_get_model_status",
      "growforge_get_overview",
      "growforge_get_recent_activity",
      "growforge_get_runtime_errors",
      "growforge_get_service_registry",
      "growforge_get_system_health",
      "growforge_get_workspace_summary",
      "growforge_list_missions",
      "growforge_query_brain",
    ];
    check("2. tools list correctly (11 expected)", JSON.stringify(names) === JSON.stringify(expected), names.join(","));
    check("8. no write/execute tool names", !names.some((n) => /(^|_)(create|update|delete|write|run|exec|execute|cancel|send|deploy|set|approve|mutate|shell|sql|post|put|patch|start|stop)(_|$)/.test(n)));
    check("8. every tool annotated readOnly + non-destructive", tools.every((t) => t.annotations?.readOnlyHint === true && t.annotations?.destructiveHint === false));

    // 3. overview returns real canonical state
    const ov = await call(client, "growforge_get_overview");
    sweep.push(ov.text);
    const m = ov.env?.data?.missions;
    check("3. overview reflects canonical jobs (real jobs: 4, test fixture excluded)", ov.env?.ok === true && m?.total === 4 && m?.testFixturesExcluded === 1, JSON.stringify(m));
    check("3. overview: done=2 error=1 unverified=1", m?.done === 2 && m?.error === 1 && m?.unverifiedRunningOrInterrupted === 1 && m?.running === 0, JSON.stringify(m));
    check("3. overview: provenance is read-only", ov.env?.provenance?.readOnly === true);
    check("3. overview: probes report unreachable (closed ports), never 'active'", ov.env?.data?.systems?.probes?.every((p: any) => p.state === "unreachable"));

    // 4. mission reads
    const list = await call(client, "growforge_list_missions", { limit: 2 });
    sweep.push(list.text);
    check("4. list_missions paginates (limit 2, nextOffset 2)", list.env?.data?.items?.length === 2 && list.env?.data?.nextOffset === 2 && list.env?.data?.total === 4);
    const listUnv = await call(client, "growforge_list_missions", { status: "unverified_running_or_interrupted" });
    check("4. list filters unverified state", listUnv.env?.data?.items?.length === 1 && listUnv.env?.data?.items[0].id === "job-live-1");
    const one = await call(client, "growforge_get_mission", { id: "job-done-1" });
    sweep.push(one.text);
    check("4. get_mission returns steps + usage", one.env?.ok === true && one.env?.data?.steps?.length === 1 && one.env?.data?.usage?.calls === 1);
    check("4. get_mission omits owner email", !one.text.includes("owner@example.test"));

    const live = await call(client, "growforge_get_mission", { id: "job-live-1" });
    sweep.push(live.text);
    check("4. unverified mission does not present the restart heuristic as a fact", live.env?.data?.status === "unverified_running_or_interrupted" && !/Interrupted by a server restart/.test(live.text) && !/"error":"Interrupted"/.test(live.text));

    // 5. invalid IDs fail safely
    const badFormat = await call(client, "growforge_get_mission", { id: "../../etc/passwd" });
    check("5. malformed mission id rejected", badFormat.isError || badFormat.env?.ok === false, badFormat.text.slice(0, 120));
    check("5. malformed id error has no stack trace", !/\n\s+at /.test(badFormat.text) && !badFormat.text.includes("node_modules"));
    const missing = await call(client, "growforge_get_mission", { id: "job-does-not-exist" });
    check("5. unknown mission -> NOT_FOUND with generic message", missing.env?.ok === false && missing.env?.error?.code === "NOT_FOUND" && missing.env?.error?.message === "Mission not found.");

    // remaining tools
    for (const [name, args] of [
      ["growforge_get_recent_activity", {}],
      ["growforge_get_system_health", {}],
      ["growforge_get_service_registry", {}],
      ["growforge_get_model_status", {}],
      ["growforge_get_runtime_errors", {}],
      ["growforge_get_api_usage", {}],
      ["growforge_get_workspace_summary", {}],
      ["growforge_query_brain", { query: "marketing" }],
    ] as [string, Record<string, unknown>][]) {
      const r = await call(client, name, args);
      sweep.push(r.text);
      check(`tool ${name} succeeds`, r.env?.ok === true, r.text.slice(0, 160));
    }

    const health = await call(client, "growforge_get_system_health");
    check("health: 4 probes, all measured unreachable", health.env?.data?.probes?.length === 4 && health.env?.data?.probes.every((p: any) => p.state === "unreachable"));
    const reg = await call(client, "growforge_get_service_registry");
    check("registry: records labelled registry_record_only", reg.env?.data?.verification === "registry_record_only" && reg.env?.data?.mcpServers?.total === 1);
    check("registry: no command/args/url/header values exposed", !reg.text.includes("some-server") && !reg.text.includes("--token") && !reg.text.includes("secret=zzz"));
    const mod = await call(client, "growforge_get_model_status");
    check("models: key presence is boolean, endpoint host only", mod.env?.data?.items?.every((i: any) => typeof i.hasApiKey === "boolean") && !mod.text.includes("user:pw") && !mod.text.includes("key=abc"));
    const usage = await call(client, "growforge_get_api_usage");
    check("usage: aggregates recorded step usage and states coverage", usage.env?.data?.totalCalls >= 121 && /Excludes NORA/.test(usage.env?.data?.coverage ?? ""));
    const errs = await call(client, "growforge_get_runtime_errors");
    check("errors: includes failed mission + unverified state, redacted", errs.env?.data?.items?.some((i: any) => i.kind === "mission_error") && errs.env?.data?.items?.some((i: any) => i.kind === "mission_unverified_state"));
    check("errors: file paths scrubbed from messages", !errs.text.includes("C:\\\\Users\\\\someone"));
    const ws = await call(client, "growforge_get_workspace_summary");
    check("workspace: actor local_owner_mcp, workspaceId null, single tenant", ws.env?.data?.actor?.actorType === "local_owner_mcp" && ws.env?.data?.actor?.workspaceId === null && ws.env?.data?.tenancy === "single_tenant_local");

    // resources
    const { resources } = await client.listResources();
    check("resources: exactly workspace/current + runtime/summary", JSON.stringify(resources.map((r) => r.uri).sort()) === JSON.stringify(["growforge://runtime/summary", "growforge://workspace/current"]));
    for (const r of resources) {
      const read = await client.readResource({ uri: r.uri });
      sweep.push(JSON.stringify(read));
      check(`resource ${r.uri} readable`, (read.contents[0] as any).text.includes("{"));
    }

    // 10. large results bounded
    const huge = await call(client, "growforge_get_mission", { id: "job-big-1" });
    sweep.push(huge.text);
    check("10. oversized mission is truncated and flagged", huge.env?.truncated === true && huge.env?.ok === true);
    check("10. payload under 26k chars", huge.text.length < 26_000, String(huge.text.length));
    const bigList = await call(client, "growforge_list_missions", { limit: 50 });
    check("10. limit param is clamped by schema (max 50)", bigList.env?.ok === true);
    const overLimit = await call(client, "growforge_list_missions", { limit: 5000 });
    check("10. limit > 50 rejected by input schema", overLimit.isError || overLimit.env?.ok === false);

    // 6/7. secrets & vault never appear — across EVERY response above
    const all = sweep.join("\n");
    for (const [label, value] of Object.entries(SECRETS)) {
      check(`6/7. no '${label}' secret in any tool/resource output`, !all.includes(value));
    }
    check("6/7. vault master key absent", !all.includes(MASTER_KEY));
    check("6/7. connector Authorization value absent", !all.includes(SECRETS.connectorAuth));
  } finally {
    await client.close();
    await transport.close();
  }

  // read-only: nothing under the fixture data dir changed during the whole session
  const after = snapshotDir(path.join(root, "data"));
  const changed = Object.keys({ ...before, ...after }).filter((k) => before[k] !== after[k]);
  check("8. server wrote nothing (fixture data dir byte-identical)", changed.length === 0, changed.join(","));

  // --- Real-data smoke ------------------------------------------------------
  console.log("\n[stdio] real repo data smoke (read-only)");
  const real = await connect(UI_ROOT, { OLLAMA_BASE_URL: "http://127.0.0.1:9" });
  try {
    const ov = await call(real.client, "growforge_get_overview");
    check("real: overview ok with real mission counts", ov.env?.ok === true && typeof ov.env?.data?.missions?.total === "number", ov.text.slice(0, 200));
    const hl = await call(real.client, "growforge_get_system_health");
    check("real: health ok", hl.env?.ok === true);
    const ml = await call(real.client, "growforge_list_missions", { limit: 5 });
    check("real: list_missions ok", ml.env?.ok === true);
    const firstId = ml.env?.data?.items?.[0]?.id;
    if (firstId) {
      const mm = await call(real.client, "growforge_get_mission", { id: firstId });
      check("real: get_mission ok for first listed id", mm.env?.ok === true);
    }
    const realText = [ov.text, hl.text, ml.text].join("\n");
    check("real: no env secret values leaked", !realText.includes(MASTER_KEY));
  } finally {
    await real.client.close();
    await real.transport.close();
  }

  fs.rmSync(root, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("TEST HARNESS ERROR:", err instanceof Error ? err.message : err);
  process.exit(2);
});
