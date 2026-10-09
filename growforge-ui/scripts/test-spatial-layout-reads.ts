import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Phase 15B2 guard: the SpatialCanvas animation loop must not read DOM geometry unless it can use it.
let passed = 0;
function check(name: string, test: () => void) { test(); passed++; console.log(`PASS ${name}`); }
const source = readFileSync(join(process.cwd(), "src", "components", "spatial", "SpatialCanvas.tsx"), "utf8");
const loop = source.slice(source.indexOf("// Record labels - the same rule for every node"), source.indexOf("renderer.render(scene, camera);", source.indexOf("// Record labels - the same rule for every node")));

check("the per-frame label block measures panels/viewport only while the label layer is live", () => {
  const live = loop.indexOf("const labelsLive = visible > 0.01;");
  assert.ok(live > 0, "labelsLive gate exists");
  const firstRead = loop.indexOf("getBoundingClientRect");
  assert.ok(firstRead > live, "no getBoundingClientRect before the gate");
  assert.match(loop.slice(live, firstRead), /if \(labelsLive\) \{/, "the geometry reads sit inside the gate");
});
check("core projection for label avoidance is computed only while labels are live", () => {
  assert.match(loop, /const corePx=labelsLive \? projectToPixels\(ZERO_VEC\) : null;/);
  assert.match(loop, /const coreEdge = labelsLive && neutronCore \?/);
});
check("the container size is cached and invalidated by the resize handler and a container ResizeObserver, never read per frame", () => {
  assert.match(source, /const containerSize = \{ w: container\.clientWidth, h: container\.clientHeight \};/);
  assert.match(source, /containerSizeObserver\.observe\(container\)/);
  assert.match(source, /containerSize\.w = w;\s+containerSize\.h = h;/);
  assert.match(source, /containerSizeObserver\.disconnect\(\)/);
  assert.ok(!/container\.clientWidth|container\.clientHeight/.test(loop), "the label block reads the cached size");
  const project = source.slice(source.indexOf("const projectToPixels"), source.indexOf("const projectToPixels") + 400);
  assert.ok(!/clientWidth|clientHeight/.test(project), "projectToPixels reads the cached size");
});
check("each label's size is measured once per frame, not once per candidate", () => {
  assert.equal((loop.match(/el\.offsetWidth/g) ?? []).length, 1);
  assert.equal((loop.match(/el\.offsetHeight/g) ?? []).length, 1);
});
console.log(`${passed} spatial layout-read checks passed`);
