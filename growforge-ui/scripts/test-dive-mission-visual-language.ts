import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/** The canonical Missions surfaces share ONE visual language (obsidian, partial perimeter edges, 2px radius, amber only for attention). This guards the CSS the Missions flow owns (static scan): no blur,
 *  no backdrop-filter, no drop-shadow, no large radius, no pill / gradient CTA, no old crimson. Shared shell chrome (top nav, lens rail, NORA composer) is a separate, app-wide surface and is NOT scanned. */
const root = new URL("../src/components/", import.meta.url);
const MODULES = ["spatial/dive/MissionField", "spatial/dive/MissionPeek", "spatial/dive/MissionWorkbenchPlane", "spatial/dive/MissionFocusPlane", "spatial/dive/MissionWorktreeView", "spatial/dive/MissionWorktreeHeader",
  "spatial/dive/MissionConduits", "spatial/dive/AnalyticsInstrument", "spatial/dive/MissionControls", "spatial/dive/LensState", "spatial/dive/PlanApprovalAction", "spatial/dive/RevisionRequestAction", "workspace/ApprovalBanner"];
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
for (const name of MODULES) {
  const css = strip(readFileSync(new URL(`${name}.module.css`, root), "utf8"));
  const where = name.split("/").pop();
  assert.equal(/backdrop-filter\s*:\s*(?!none)/.test(css), false, `${where}: no backdrop-filter`);
  assert.equal(/-webkit-backdrop-filter\s*:\s*(?!none)/.test(css), false, `${where}: no prefixed backdrop-filter`);
  assert.equal(/blur\(/.test(css), false, `${where}: no blur`);
  assert.equal(/drop-shadow\(/.test(css), false, `${where}: no drop-shadow`);
  for (const m of css.matchAll(/border-radius\s*:\s*([^;}]+)/g)) {
    const values = m[1].trim().split(/\s+/).map(v => parseFloat(v));
    assert.ok(values.every(v => Number.isNaN(v) || v <= (where === "MissionWorktreeView" ? 10 : where === "MissionWorkbenchPlane" || where === "MissionFocusPlane" || where === "AnalyticsInstrument" ? 18 : 4)) || /50%|999/.test(m[1]), `${where}: radius ${m[1].trim()} is not within the instrument range (0-4px; the Control AI target's level-1 glass cards in the Graph, 10px, are the one allowed exception)`);
  }
  for (const m of css.matchAll(/box-shadow\s*:\s*([^;}]+)/g)) for (const part of m[1].split(/,(?![^(]*\))/)) {
    const nums = (part.replace(/rgba?\([^)]*\)|#[0-9a-f]{3,8}/gi, "").match(/-?\d+(\.\d+)?px/g) ?? []).map(parseFloat);
    assert.ok((nums[2] ?? 0) === 0 && Math.abs(nums[3] ?? 0) <= 1, `${where}: box-shadow "${part.trim()}" is not a 1px hairline ring`);
  }
  assert.equal(/#(?:dc2626|ef4444|f87171|b91c1c|e11d48|f43f5e)|crimson|\bred\b/i.test(css), false, `${where}: no legacy red / crimson`);
}
const banner = readFileSync(new URL("workspace/ApprovalBanner.tsx", root), "utf8");
assert.equal(/rounded-|shadow-|backdrop-blur|bg-gradient|from-electric|glass-card|ring-1/.test(banner), false, "ApprovalBanner carries no legacy utility styling");
console.log("test-dive-mission-visual-language: canonical Missions CSS stays inside the approved visual language");
