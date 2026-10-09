import assert from "node:assert/strict";
import { cycleIndex, filterReel, indexOfMission, wheelSteps, type ReelItem } from "../src/components/spatial/dive/missionSelectorModel";
import { readFileSync } from "node:fs";

/** Mission selector (W7 target Task 1): pure model checks + the wiring contract. No stores read or written. */
const item = (id: string, title: string, stateLabel = "Completed", percent = 100): ReelItem => ({ id, title, state: "completed", stateLabel, percent });
const reel = [item("a", "Apex Thermal Labs"), item("b", "AI Solutions for Global Tech Startups", "Blocked", 69), item("c", "GrowForge Digital NA"), item("d", "Heat pump pilot", "Running", 40)];

// 1. Position: "N of M" comes from the recorded reel; a mission that is not in it has no position (the selector stays hidden).
assert.equal(indexOfMission(reel, "c"), 2); assert.equal(indexOfMission(reel, "zzz"), -1);

// 2. Stepping is a ring: previous from the first goes to the last, next from the last to the first; an empty reel has no index.
assert.equal(cycleIndex(4, 0, -1), 3); assert.equal(cycleIndex(4, 3, 1), 0); assert.equal(cycleIndex(4, 1, 1), 2); assert.equal(cycleIndex(4, 2, -1), 1);
assert.equal(cycleIndex(1, 0, 1), 0); assert.equal(cycleIndex(0, 0, 1), -1);
assert.equal(cycleIndex(4, 1, 9), 2, "large deltas wrap too");

// 3. Search: case-insensitive on the recorded title and state label; empty query keeps reel order; no match is an empty list (never a guess).
assert.deepEqual(filterReel(reel, "").map(r => r.id), ["a", "b", "c", "d"]);
assert.deepEqual(filterReel(reel, "  heat ").map(r => r.id), ["d"]);
assert.deepEqual(filterReel(reel, "BLOCKED").map(r => r.id), ["b"]);
assert.deepEqual(filterReel(reel, "ai sol").map(r => r.id), ["b"]);
assert.deepEqual(filterReel(reel, "nothing like this"), []);

// 4. Wheel / trackpad: one mission per 48 px of travel, the remainder carries over, one gesture never skips more than 3 missions; direction follows the sign.
assert.deepEqual(wheelSteps(0, 100), { steps: 1, carry: 0 }, "a mouse notch (deltaY 100) is ONE mission, never two");
assert.deepEqual(wheelSteps(0, 120), { steps: 1, carry: 0 });
assert.deepEqual(wheelSteps(0, -100), { steps: -1, carry: 0 });
assert.deepEqual(wheelSteps(0, 30), { steps: 0, carry: 30 });
assert.equal(wheelSteps(30, 30).steps, 1, "small trackpad deltas accumulate");
assert.equal(wheelSteps(0, 4000).steps, 1, "a huge single event is still one step");
assert.equal(wheelSteps(0, -4000).steps, -1);
let carry = 0, moved = 0; for (let i = 0; i < 40; i++) { const r = wheelSteps(carry, 6); carry = r.carry; moved += r.steps; }
assert.equal(moved, 5, "40 ticks of 6 px = 240 px = 5 missions");

// 5. Wiring contract (static): the selector switches through the lens' one onSelect path, is not part of the URL, is hidden on phones and under a deeper reading plane.
const dir = new URL("../src/components/spatial/dive/", import.meta.url);
const selector = readFileSync(new URL("MissionSelector.tsx", dir), "utf8");
assert.ok(/addEventListener\("wheel"[\s\S]*passive: false/.test(selector), "a non-passive wheel listener on the gear");
assert.ok(/ArrowUp[\s\S]*ArrowDown/.test(selector), "keyboard Up / Down on the gear");
assert.ok(!/history\.(push|replace)State|location\./.test(selector), "the selector never touches browser history");
const lens = readFileSync(new URL("MissionWorktreeLens.tsx", dir), "utf8");
assert.ok(/const switchMission = \(id: string\) => \{[^}]*onSwitch\(id\); \};/.test(lens), "C7E.6.1: the selector switches through the one canonical onSwitch (after capturing the outgoing layers)");
// The selector hangs beneath the Mission Core (mounted by the view as `coreAddon`, same props): desktop only, hidden while the Workbench / Focus hold the stage.
assert.ok(/coreAddon=\{phone \? undefined : <MissionSelector embedded[\s\S]*onSelect=\{switchMission\}[\s\S]*hidden=\{selection\.peekOpen && selection\.depth !== "peek"\}/.test(lens) && (lens.match(/<MissionSelector/g) ?? []).length === 1, "exactly one selector: beneath the Core, desktop only, hidden while a deeper reading plane holds the stage");
const field = readFileSync(new URL("MissionLens.tsx", dir), "utf8");
assert.ok(/onSwitch=\{onSelect\}/.test(field) && /const reel = useMemo/.test(field), "the reel is every recorded mission and switches via the Field's own onSelect");
console.log("test-dive-mission-selector: ring stepping, search, wheel accumulation and wiring contract checks passed");

// C6D2: Pipeline is retired everywhere: no layout switch on desktop or phone, no `setView`, no `"pipeline"` value; the canonical Graph is the only view.
import { readFileSync as readSource } from "node:fs";
{
  const dir = new URL("../src/components/spatial/dive/", import.meta.url), read = (f: string) => readSource(new URL(f, dir), "utf8");
  const header = read("MissionWorktreeHeader.tsx"), lensSrc = read("MissionWorktreeLens.tsx"), selection = read("missionWorktreeSelection.ts"), layout = read("missionWorktreeLayout.ts"), conduits = read("missionWorktreeConduits.ts");
  assert.ok(!/Worktree layout|onView|aria-pressed/.test(header), "no layout switch in the header (desktop or phone)");
  assert.ok(!/setView|initialView/.test(lensSrc + selection), "no runtime path can change the view");
  assert.ok(!/"pipeline"/.test(layout + conduits + selection + lensSrc + header + read("MissionWorktreeView.tsx")), 'no "pipeline" view value anywhere in the Worktree code');
  assert.ok(/export type WorktreeView = "graph";/.test(layout), "the only view value is graph");
  assert.ok(!/layoutPipelineDesktop|layoutPair|morphFrames/.test(layout), "the Pipeline layout branch is gone");
  assert.ok(!/elbow|splitAt|mergeAt|reconvergence|arrowDir/.test(conduits), "the Pipeline conduit buses / arrows are gone");
  assert.ok(/initialSelection\(null, "graph"\)/.test(lensSrc), "Missions always opens in the Graph");
}
console.log("test-dive-mission-selector: Pipeline fully retired (no control, no view value, no layout / conduit branch) checks passed");
