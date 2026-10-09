import assert from "node:assert/strict";
import { resolveStepDependencies } from "../src/components/spatial/dive/missionDependencyModel";

let passed = 0;
function check(name: string, test: () => void) { test(); passed++; console.log(`PASS ${name}`); }
const raw = (id: string, dependsOn: unknown) => ({ id, dependsOn });

check("a recorded dependency resolves to ONE unique step and runs from the prerequisite to the dependent", () => {
  const ids = ["brief", "plan", "research", "dept:marketing", "reconcile"];
  const graph = resolveStepDependencies(ids, [raw("brief", []), raw("plan", ["brief"]), raw("research", ["plan"]), raw("dept:marketing", ["research"]), raw("reconcile", ["dept:marketing"])]);
  assert.deepEqual(graph.findings, []);
  assert.deepEqual(graph.edges.map(edge => [edge.from, edge.to, edge.reference]), [[1, 2, "brief"], [2, 3, "plan"], [3, 4, "research"], [4, 5, "dept:marketing"]]);
});
check("reruns reuse ids: an id shared by several steps is AMBIGUOUS, so it is omitted and reported, never guessed", () => {
  const ids = ["research", "dept:sales-bd", "dept:marketing", "dept:sales-bd", "reconcile"];
  const graph = resolveStepDependencies(ids, [raw("research", []), raw("dept:sales-bd", ["research"]), raw("dept:marketing", ["research"]), raw("dept:sales-bd", ["research"]), raw("reconcile", ["dept:sales-bd", "dept:marketing"])]);
  assert.deepEqual(graph.edges.map(e => [e.from, e.to]), [[1, 2], [1, 3], [1, 4], [3, 5]]);
  const ambiguous = graph.findings.filter(f => f.kind === "ambiguous");
  assert.equal(ambiguous.length, 1); assert.equal(ambiguous[0].ordinal, 5); assert.equal(ambiguous[0].reference, "dept:sales-bd"); assert.match(ambiguous[0].detail, /2 recorded steps share/);
  assert.ok(!graph.edges.some(e => e.reference === "dept:sales-bd" && e.to === 5), "no edge to either duplicate");
});
check("unresolved, self-referencing and malformed dependencies are omitted and reported", () => {
  const ids = ["a", "b", "c", "d"];
  const graph = resolveStepDependencies(ids, [raw("a", ["ghost"]), raw("b", ["b"]), raw("c", "a"), raw("d", ["a", 7, "", null, "a"])]);
  assert.deepEqual(graph.edges.map(e => [e.from, e.to]), [[1, 4]], "the valid reference survives and is de-duplicated");
  const summary = graph.findings.map(f => `${f.kind}:${f.ordinal}`).sort();
  assert.deepEqual(summary, ["malformed:3", "malformed:4", "malformed:4", "malformed:4", "self-reference:2", "unresolved:1"].sort());
  assert.equal(resolveStepDependencies(["a"], [raw("a", undefined)]).findings[0].kind, "malformed");
});
check("an unreadable or misaligned raw record yields NO dependencies, only a finding", () => {
  const none = resolveStepDependencies(["a", "b"], null);
  assert.equal(none.edges.length, 0); assert.equal(none.findings[0].kind, "unavailable");
  for (const rawSteps of [[raw("a", [])], [raw("a", []), raw("zzz", ["a"])], [raw("a", []), raw("b", ["a"]), raw("c", [])]]) {
    const graph = resolveStepDependencies(["a", "b"], rawSteps);
    assert.equal(graph.edges.length, 0); assert.equal(graph.findings[0].kind, "record-mismatch");
  }
});

// ---------- edge grammar ----------
console.log(`${passed} mission dependency checks passed; pure.`);
