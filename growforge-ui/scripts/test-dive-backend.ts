import assert from "node:assert/strict";
import { buildConfiguredTopology, getDiveStateSnapshot } from "../src/lib/spatial/diveState";
import { DEPARTMENT_TAXONOMY, OVERSIGHT_TAXONOMY } from "../src/lib/departmentTaxonomy";

async function runDiveBackendTests() {
  console.log("=== DIVE IN BACKEND ARCHITECTURE & TOPOLOGY TESTS ===");

  // 1. Topology Structure Check
  console.log("[Test 1] Verifying configured topology structure...");
  const topology = buildConfiguredTopology();
  assert.equal(topology.nodes.length, 10, "Must have exactly 10 canonical department/oversight nodes");

  const expectedTaxa = [...DEPARTMENT_TAXONOMY, ...OVERSIGHT_TAXONOMY];
  for (const taxon of expectedTaxa) {
    const found = topology.nodes.find((n) => n.id === taxon.id);
    assert.ok(found, `Node ${taxon.id} must exist in topology`);
    assert.equal(found.name, taxon.name);
    assert.equal(found.kind, taxon.kind);
    assert.equal(found.runtimeRouteId, taxon.runtimeRouteId);
    assert.ok(found.subnodes.length >= 1, `Node ${taxon.id} must have subnodes`);
    for (const sub of found.subnodes) {
      assert.equal(sub.parentId, taxon.id, "Subnode parentId must match parent node");
    }
  }
  console.log("-> PASS: 10 canonical nodes and subnode hierarchies verified.");

  // 2. Structural Cords Verification
  console.log("[Test 2] Verifying directional structural cords...");
  assert.ok(topology.cords.length >= 10, "Must have at least 10 configured cords");
  const nodeIds = new Set(topology.nodes.map((n) => n.id));

  for (const cord of topology.cords) {
    assert.ok(nodeIds.has(cord.sourceId), `Cord source ${cord.sourceId} must be a valid node`);
    assert.ok(nodeIds.has(cord.targetId), `Cord target ${cord.targetId} must be a valid node`);
    assert.ok(
      ["orchestration", "data_pipeline", "oversight_gate", "handoff"].includes(cord.kind),
      `Cord kind ${cord.kind} must be valid`
    );
  }
  console.log(`-> PASS: ${topology.cords.length} structural cords verified with valid source/target pairs.`);

  // 3. Preview Mode Isolation Check
  console.log("[Test 3] Verifying Public Preview mode data isolation...");
  process.env.PUBLIC_PREVIEW_MODE = "true";
  const previewSnapshot = await getDiveStateSnapshot();
  assert.equal(previewSnapshot.liveState.isLive, false);
  assert.equal(previewSnapshot.liveState.activeJobId, null);
  assert.equal(previewSnapshot.packets.length, 0);
  assert.equal(previewSnapshot.events.length, 0);
  console.log("-> PASS: Preview mode strictly zero-state without leaking owner jobs/events.");

  // 4. Local Snapshot & Real Job Mapping
  console.log("[Test 4] Verifying local live state resolution...");
  delete process.env.PUBLIC_PREVIEW_MODE;
  const localSnapshot = await getDiveStateSnapshot();
  assert.equal(localSnapshot.topology.nodes.length, 10);
  assert.ok(Array.isArray(localSnapshot.events));
  assert.ok(Array.isArray(localSnapshot.packets));
  assert.ok(localSnapshot.updatedAt);
  console.log("-> PASS: Local live state snapshot generated successfully.");

  console.log("\n=== ALL DIVE IN BACKEND CHECKS PASSED (100% SUCCESS) ===");
}

runDiveBackendTests().catch((err) => {
  console.error("DIVE IN backend test failed:", err);
  process.exit(1);
});
