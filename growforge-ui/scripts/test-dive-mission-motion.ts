import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DIVE_TIMING, MISSION_ANCHOR_TOP, convergencePoint } from "../src/components/spatial/dive/diveDepthModel";
import { MISSION_STATES } from "../src/components/spatial/dive/missionStates";

let passed = 0;
function check(name: string, test: () => void) { test(); passed++; console.log(`PASS ${name}`); }
const dir = join(process.cwd(), "src", "components", "spatial", "dive");
const read = (file: string) => readFileSync(join(dir, file), "utf8");
const near = (actual: number, expected: number, tolerance = 1) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

check("selection timing is unchanged by the polish (Phase 11 budget): 420ms convergence, 420ms lingering exit, reduced motion = immediate", () => {
  assert.equal(DIVE_TIMING.pick, 420);
  assert.equal(DIVE_TIMING.leave, 420);
  assert.equal(DIVE_TIMING.reducedPick, 0);
  assert.ok(DIVE_TIMING.handoff > 0 && DIVE_TIMING.handoff < DIVE_TIMING.pick, "the selection is committed while the chosen stratum is still converging, so the nucleus resolves UNDER it (no empty beat)");
});
check("convergence target: the graph keeps the approved vertical-only travel to the centre line", () => {
  const point = convergencePoint(1920, 1080, { left: 0, top: 0, width: 1920, height: 1080 });
  assert.deepEqual([point.x, point.y, point.horizontal], [960, 1080 * (MISSION_ANCHOR_TOP / 100), false]);
  assert.equal(convergencePoint(1440, 900, { left: 0, top: 0, width: 1440, height: 900 }).horizontal, false);
});
check("convergence target: the responsive flows converge on where THEIR nucleus resolves (measured live: within 1px at 1366x768, 390x844, 375x667)", () => {
  const wide = convergencePoint(1366, 768, { left: 0, top: 0, width: 1366, height: 768 });
  near(wide.x, 178); near(wide.y, 315); assert.equal(wide.horizontal, true);
  const phone = convergencePoint(390, 844, { left: 0, top: 0, width: 390, height: 844 });
  near(phone.x, 195); near(phone.y, 290); assert.equal(phone.horizontal, true);
  const stress = convergencePoint(375, 667, { left: 0, top: 0, width: 375, height: 667 });
  near(stress.x, 188); near(stress.y, 287);
});
