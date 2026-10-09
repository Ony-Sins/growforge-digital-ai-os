import assert from "node:assert/strict";
import { missionLiveEvidence } from "../src/components/spatial/dive/missionNucleusModel";
import type { MissionRowState } from "../src/components/spatial/dive/missionStates";

let passed = 0;
function check(name: string, test: () => void) { test(); passed++; console.log(`PASS ${name}`); }
const executor = (missionIds: string[], confirmable: boolean) => ({ executingNow: { missionIds, agentIds: [], confirmable } });

check("only a recorded-running mission can be live; the executor must name that exact mission", () => {
  assert.equal(missionLiveEvidence("running", "m1", executor(["m1"], true)), "confirmed");
  assert.equal(missionLiveEvidence("running", "m1", executor(["m2"], true)), "unconfirmed");
  assert.equal(missionLiveEvidence("running", "m1", executor([], true)), "unconfirmed");
});
check("without a usable executor check, recorded running is unverifiable, never live or stalled", () => {
  assert.equal(missionLiveEvidence("running", "m1", null), "unverifiable");
  assert.equal(missionLiveEvidence("running", "m1", undefined), "unverifiable");
  assert.equal(missionLiveEvidence("running", "m1", executor([], false)), "unverifiable");
  // A stale id list is not trusted when the executor cannot be checked.
  assert.equal(missionLiveEvidence("running", "m1", executor(["m1"], false)), "unverifiable");
});
check("every non-running state is a recorded outcome and ignores executor facts", () => {
  for (const state of ["waiting", "blocked", "completed", "unverified", "checking"] as MissionRowState[]) {
    assert.equal(missionLiveEvidence(state, "m1", executor(["m1"], true)), "not-applicable", state);
  }
});
console.log(`${passed} mission live-evidence checks passed; no stores read or written.`);
