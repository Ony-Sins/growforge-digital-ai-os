import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GRAPH_MIN_HEIGHT, GRAPH_MIN_WIDTH, WIDE_MIN_WIDTH, compactScopeText, missionLayoutFor } from "../src/components/spatial/dive/missionFlowModel";

let passed = 0;
function check(name: string, test: () => void) { test(); passed++; console.log(`PASS ${name}`); }
const dir = join(process.cwd(), "src", "components", "spatial", "dive");
const source = (file: string) => readFileSync(join(dir, file), "utf8");

check("canonical viewports: 1920 and 1440 keep the approved graph; 1366x768 is the wide flow; 390x844 is the stack", () => {
  assert.equal(missionLayoutFor(1920, 1080), "graph");
  assert.equal(missionLayoutFor(1440, 900), "graph");
  assert.equal(missionLayoutFor(1366, 768), "wide");
  assert.equal(missionLayoutFor(390, 844), "stack");
});
check("graph needs BOTH the width and the height the locked composition was designed for (unchanged 1366x820 limit)", () => {
  assert.equal(missionLayoutFor(GRAPH_MIN_WIDTH, GRAPH_MIN_HEIGHT), "graph");
  assert.equal(missionLayoutFor(GRAPH_MIN_WIDTH - 1, GRAPH_MIN_HEIGHT), "wide");
  assert.equal(missionLayoutFor(GRAPH_MIN_WIDTH, GRAPH_MIN_HEIGHT - 1), "wide");
  assert.equal(missionLayoutFor(1920, 700), "wide", "a wide but short window is never a shrunken graph");
});
check("below the wide threshold every size is the stack (phones, small tablets, narrow windows)", () => {
  assert.equal(missionLayoutFor(WIDE_MIN_WIDTH, 700), "wide");
  assert.equal(missionLayoutFor(WIDE_MIN_WIDTH - 1, 1400), "stack");
  for (const width of [320, 375, 390, 430, 768, 1024]) assert.equal(missionLayoutFor(width, 900), "stack");
});
check("phone scope chip: current depth first, never altering the address; short forms leave the text as is", () => {
  assert.equal(compactScopeText("Mission / AI Solutions for Global Tech Startups / Brand & Growth Marketing · Step 5"), "Step 5 · Brand & Growth Marketing");
  assert.equal(compactScopeText("Mission / AI Solutions for Global Tech Startups / Brand & Growth Marketing"), "Brand & Growth Marketing");
  assert.equal(compactScopeText("Mission / AI Solutions for Global Tech Startups / Inspect · Steps"), "Inspect · Steps");
  assert.equal(compactScopeText("Mission / AI Solutions for Global Tech Startups"), "Mission / AI Solutions for Global Tech Startups");
  assert.equal(compactScopeText("All Missions"), "All Missions");
  const header = source("LensHeader.tsx");
  assert.match(header, /<strong data-scope-full>\{text\}<\/strong>/, "the complete scope text is always in the DOM");
  assert.match(header, /title=\{`NORA scope: \$\{text\}`\}/);
});
check("the lens rail and the phone chrome are one thing on every lens (no per-lens size, position or glass)", () => {
  const css = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");
  const block = css.slice(css.indexOf("Phase 13 refinement:"));
  assert.ok(block.includes('[data-lens]') && !block.includes('[data-lens="Missions"]'), "composer / nav compaction keys on any Dive lens");
  assert.ok(/@media\(max-width:900px\)/.test(block), "phone only");
  const rail = readFileSync(join(dir, "DiveOverview.module.css"), "utf8");
  assert.ok(rail.includes('.shell[data-lens] .lenses.lenses{'), "one rail material for every lens");
  assert.ok(rail.includes('.shell[data-lens] .lenses{top:auto;bottom:56px'), "one phone rail position for every lens");
  assert.ok(!/\.shell\[data-lens="(Missions|Overview)"\] \.lenses\.lenses/.test(rail), "no lens-specific rail material left");
});
check("Mission Field filters: six, one strip, short phone labels while the full recorded label stays the accessible name", () => {
  const field = source("MissionField.tsx");
  assert.match(field, /className=\{styles\.full\}>\{item\.label\}/);
  assert.match(field, /className=\{styles\.short\} aria-hidden="true"/);
  assert.match(field, /title=\{item\.title\}/, "the full mission title stays reachable when truncated");
  const lens = source("MissionLens.tsx");
  assert.deepEqual([...lens.matchAll(/(\w+): "(Running|Queued|Blocked|Completed|Unverified)"/g)].map(match => match[2]), ["Running", "Queued", "Blocked", "Completed", "Unverified"]);
});
console.log(`${passed} mission layout / chrome checks passed; pure, no stores read or written.`);
