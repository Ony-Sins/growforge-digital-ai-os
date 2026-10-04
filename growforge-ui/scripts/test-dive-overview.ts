import assert from "node:assert/strict";
import fs from 'node:fs';
import type { CoreState } from "../src/lib/coreState";
import type { Agent } from "../src/lib/agents";
import { overviewHealth, overviewObjects } from "../src/components/spatial/dive/overviewModel";

const empty: CoreState = { generatedAt: "2026-10-01T00:00:00Z", jobs: [], job: null, systems: { probes: [], mcp: { count: 0, servers: [] }, models: { count: 0, list: [] }, routing: "local-first", pendingApprovals: 0, pendingConsultations: 0, vault: { reachable: false, noteCount: 0, latestDaily: null } } };
let passed = 0;
function check(name: string, fn: () => void) { fn(); passed++; console.log(`PASS ${name}`); }
check("missing snapshot never claims healthy", () => assert.equal(overviewHealth(null), "State unavailable"));
check("unmeasured services remain unmeasured", () => assert.equal(overviewHealth(empty), "Health unmeasured"));
check('preview placeholders are not measured failures', () => assert.equal(overviewHealth({...empty,systems:{...empty.systems,probes:[{id:'ollama',label:'Ollama',online:false,detail:'offline in public preview',latencyMs:null}]}}), 'Health unmeasured'));
check('Overview selection participates in the canonical NORA lifecycle', () => {
  const source=fs.readFileSync(new URL('../src/components/spatial/dive/DiveInspector.tsx',import.meta.url),'utf8');
  assert.match(source,/growforge:mission-context/);assert.match(source,/growforge:agent-context/);
  assert.match(source,/if \(closing \|\| object.kind === 'system'\) return/);
  assert.match(source,/detail: null/);assert.match(source,/id: object.id/);
});
check("empty state has only a clearly structural canonical anchor", () => {
  const objects = overviewObjects(empty, []);
  assert.equal(objects.length, 1); assert.equal(objects[0].id, "executive_orchestration"); assert.equal(objects[0].status, "Configured"); assert.match(objects[0].context, /does not indicate an executing agent/);
});
check("completed jobs, waiting jobs and running test fixtures never enter live map", () => {
  const jobs = ["done", "waiting_approval", "running"].map((status, i) => ({ id: `fixture-${i}`, title: "Isolated fixture", status, percent: 20, createdAt: empty.generatedAt, isTest: i === 2 })) as CoreState["jobs"];
  assert.equal(overviewObjects({ ...empty, jobs }, []).length, 1);
});
check("recorded active mission preserves its actual identity", () => {
  const job: CoreState["jobs"][number] = { id: "fixture-real-id", title: "Recorded brief", status: "running", percent: 37, createdAt: empty.generatedAt, isTest: false };
  const objects = overviewObjects({ ...empty, jobs: [job] }, []);
  assert.equal(objects[1].id, job.id); assert.equal(objects[1].name, job.title); assert.match(objects[1].context, /37%/);
});
check("idle templates and previous successful agents are not working agents", () => {
  const roster = ["idle", "success", "error", "active"].map((status, i) => ({ id: `agent-${i}`, name: `Fixture agent ${i}`, status, description: "Test-only fixture", lastRun: empty.generatedAt, division: "Test", icon: "Bot" })) as Agent[];
  const objects = overviewObjects(empty, roster);
  assert.equal(objects.length, 2); assert.equal(objects[1].id, "agent-3");
});
check("offline optional services are reported as measured availability", () => {
  const probes = [{ id: "ollama", label: "Ollama", online: false, detail: "offline", latencyMs: null }] as CoreState["systems"]["probes"];
  assert.equal(overviewHealth({ ...empty, systems: { ...empty.systems, probes } }), "0/1 services reachable");
});
check("all successful probes permit reachable claim", () => {
  const probes = [{ id: "ollama", label: "Ollama", online: true, detail: "online", latencyMs: 10 }] as CoreState["systems"]["probes"];
  assert.equal(overviewHealth({ ...empty, systems: { ...empty.systems, probes } }), "Services reachable");
});
console.log(`${passed} checks passed; no stores written or model calls made.`);
