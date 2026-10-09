import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DIVE_TIMING, SHARED_ENVIRONMENT_LENSES, pickTravel, sharedDepth, strataPlacement } from "../src/components/spatial/dive/diveDepthModel";

let passed = 0;
function check(name: string, test: () => void) { test(); passed++; console.log(`PASS ${name}`); }
const dir = join(process.cwd(), "src", "components", "spatial", "dive");
const source = (file: string) => readFileSync(join(dir, file), "utf8");
const tsx = readdirSync(dir).filter(file => file.endsWith(".tsx"));

check("only Overview and Missions share the environment; Overview is front, Missions recedes (deeper with a mission selected), others are untouched (null)", () => {
  assert.deepEqual([...SHARED_ENVIRONMENT_LENSES], ["Overview", "Missions"]);
  assert.equal(sharedDepth("Overview", false), "front");
  assert.equal(sharedDepth("Overview", true), "front", "a stale mission selection never changes Overview");
  assert.equal(sharedDepth("Missions", false), "recede");
  assert.equal(sharedDepth("Missions", true), "deep");
  for (const lens of ["Context", "Finance", "Departments", "Agents", "Workflows", "Tools", "Intelligence"] as const) assert.equal(sharedDepth(lens, true), null);
});
check("transition budget: the lingering layer and the selection convergence stay inside the 500-900ms perceptual window; reduced motion is near-instant", () => {
  assert.ok(DIVE_TIMING.leave >= 300 && DIVE_TIMING.leave <= 600);
  assert.ok(DIVE_TIMING.pick >= 300 && DIVE_TIMING.pick <= 500);
  assert.ok(DIVE_TIMING.reducedLeave <= 160 && DIVE_TIMING.reducedPick === 0);
});
check("strata placement is deterministic, composition-only and stays inside the corridor; planes, offsets and groups vary without ranking anything", () => {
  const places = Array.from({ length: 30 }, (_, index) => strataPlacement(index));
  assert.deepEqual(places, Array.from({ length: 30 }, (_, index) => strataPlacement(index)));
  for (const place of places) {
    assert.ok(place.width >= 86 && place.width <= 100);
    assert.ok(place.left >= 0 && place.left + place.width <= 100.0001, "never leaves the corridor");
    assert.ok(place.slantL >= 4 && place.slantL <= 14 && place.slantR >= 4 && place.slantR <= 14, "restrained chamfer");
    assert.ok(place.catchAt >= 18 && place.catchAt <= 82);
  }
  assert.equal(strataPlacement(0).gap, 0);
  assert.equal(strataPlacement(0).plane, 0, "the first stratum is on the nearest plane");
  assert.deepEqual([...new Set(places.map(place => place.plane))].sort(), [0, 1, 2]);
  assert.ok(new Set(places.map(place => place.left)).size >= 5, "asymmetric offsets");
  assert.ok(places.some(place => place.gap > 0), "negative space between depth groups");
  assert.ok(strataPlacement(3).catchAt < strataPlacement(5).catchAt, "the specular lobe leans toward the centre (a right-shifted stratum catches on its left)");
  assert.equal(strataPlacement(-1).width, strataPlacement(6).width);
});
check("pick travel is the vertical distance to the nucleus point", () => {
  assert.equal(pickTravel(700, 443), -257);
  assert.equal(pickTravel(300, 443), 143);
  assert.equal(pickTravel(443.4, 443), 0);
});
check("exactly ONE NORA instance and ONE atmosphere exist in the Dive tree (no duplicated NORA, no lens-owned backdrop)", () => {
  const norafield = tsx.filter(file => /<NoraStageField\b/.test(source(file)));
  const atmosphere = tsx.filter(file => /<OverviewAtmosphere\b/.test(source(file)));
  assert.deepEqual(norafield, ["OverviewRuntime.tsx"]);
  assert.deepEqual(atmosphere, ["OverviewRuntime.tsx"]);
  // The Missions lens used to add faint "nucleus trace" curves (MissionsAtmosphere): removed as background noise. No lens layer paints a backdrop, traces or arcs.
  assert.ok(!tsx.includes("MissionsAtmosphere.tsx") && !/MissionsAtmosphere/.test(source("DiveOverview.tsx")), "no Missions atmosphere layer (no background traces / arcs)");
});
check("Overview stays mounted behind Missions; the Mission layer lingers (inert) instead of unmounting abruptly", () => {
  const overview = source("DiveOverview.tsx");
  assert.match(overview, /depth !== null && <OverviewRuntime depth=\{depth\}/);
  assert.match(overview, /useLensPresence\(lens === "Missions"/);
  assert.match(overview, /inert=\{missionLayer\.leaving \? true : undefined\}/);
  assert.match(source("OverviewRuntime.tsx"), /inert=\{front \? undefined : true\}/);
});
check("persistent pieces are rendered once by the shell, not per lens: lens rail, global scope provider; composer lives outside the Dive tree", () => {
  const overview = source("DiveOverview.tsx");
  assert.equal((overview.match(/<nav className=\{styles\.lenses\}/g) ?? []).length, 1);
  assert.equal((overview.match(/<DiveInterior \/>/g) ?? []).length, 1);
  assert.ok(!/CoreCommandCenter/.test(overview), "the composer is not mounted by a lens");
});
check("Mission Field shows only verified facts: title, recorded state label and recorded percent (no invented fields)", () => {
  const whole = source("MissionField.tsx");
  const field = whole.slice(whole.indexOf("items.map((item, index)"), whole.indexOf("</ul>"));
  assert.deepEqual([...field.matchAll(/item\.(\w+)/g)].map(match => match[1]).filter((value, index, all) => all.indexOf(value) === index).sort(), ["id", "percent", "state", "stateLabel", "title"]);
});
console.log(`${passed} dive environment checks passed; no stores read or written.`);
