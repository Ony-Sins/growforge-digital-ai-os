import assert from "node:assert/strict";
import { noraSurfaceContext, type NoraSurface } from "../src/lib/noraSurfaceContext";
import type { GraphNode } from "../src/lib/spatial/obsidianReader";

const record = { id: "record-real", title: "Executive Orchestration", departmentId: "executive_orchestration", source: "agents", excerpt: "Documented policy" } as GraphNode;
const mission = { id: "job-real", title: "Recorded mission", context: '{"status":"done"}' };
for (const surface of ["CORE", "Explore", "Dive In", "Systems"] as NoraSurface[]) {
  const empty = noraSurfaceContext(surface);
  assert.ok(empty.includes(`"surface":"${surface}"`));
  assert.ok(empty.includes('"selection":null'));
}
assert.ok(noraSurfaceContext("Explore", record, mission).includes('"recordId":"record-real"'));
assert.ok(!noraSurfaceContext("Explore", record, mission).includes("job-real"));
assert.ok(noraSurfaceContext("Dive In", record, mission).includes('"missionId":"job-real"'));
assert.ok(!noraSurfaceContext("Dive In", record, mission).includes("record-real"));
for (const surface of ["CORE", "Systems"] as NoraSurface[]) {
  assert.ok(!noraSurfaceContext(surface, record, mission).includes("record-real"));
  assert.ok(!noraSurfaceContext(surface, record, mission).includes("job-real"));
}
assert.ok(noraSurfaceContext("Explore", null, mission).includes('"selection":null'));
assert.ok(noraSurfaceContext("Dive In", record, null).includes('"selection":null'));
assert.ok(noraSurfaceContext("Explore", { ...record, excerpt: "x".repeat(10000) }).length < 2500);
console.log("PASS surface context, canonical record identity, mission identity, dismissal, cross-surface isolation and bounded record excerpt; no requests or stores written.");

