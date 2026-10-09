import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DIVE_LENS_REGISTRY } from "../src/lib/diveLenses";
import { resolveSemanticRoute } from "../src/lib/semanticNavigation";
import { lensIdFromSlug, parseSurfaceLocation, sameSurface, surfaceParams, withSurface } from "../src/lib/surfaceLocation";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

// 1. Every top-level surface round-trips through the URL.
assert.deepEqual(parseSurfaceLocation(""), { surface: "core" });
assert.deepEqual(parseSurfaceLocation("?tier=home"), { surface: "core" });
assert.deepEqual(parseSurfaceLocation("?tier=brain"), { surface: "explore" });
assert.equal(withSurface("", { surface: "core" }), "", "CORE is the bare URL");
assert.equal(withSurface("", { surface: "explore" }), "?tier=brain");

// 2. All nine lenses restore from, and serialize to, a stable slug.
assert.equal(DIVE_LENS_REGISTRY.length, 9);
for (const lens of DIVE_LENS_REGISTRY) {
  const search = withSurface("", { surface: "dive", lensId: lens.id });
  assert.equal(search, `?lens=${lens.slug}`);
  assert.deepEqual(parseSurfaceLocation(search), { surface: "dive", lensId: lens.id }, `${lens.label} restores from the URL`);
  assert.equal(lensIdFromSlug(lens.slug.toUpperCase()), lens.id, "slugs are case-insensitive on read");
}

// 3. Semantic navigation parity: the path NORA/semantic routing already emits parses to the same surface.
for (const lens of DIVE_LENS_REGISTRY) {
  const route = resolveSemanticRoute({ type: "SHOW_DIVE_LENS", params: { lensId: lens.id } });
  assert.deepEqual(parseSurfaceLocation(new URL(route.path, "http://x").searchParams), { surface: "dive", lensId: lens.id }, `SHOW_DIVE_LENS ${lens.id}`);
}
assert.deepEqual(parseSurfaceLocation(new URL(resolveSemanticRoute({ type: "SHOW_BRAIN" }).path, "http://x").searchParams), { surface: "explore" });
assert.deepEqual(parseSurfaceLocation(new URL(resolveSemanticRoute({ type: "SHOW_DASHBOARD" }).path, "http://x").searchParams), { surface: "core" });
// an unknown lens id falls back to the dashboard route rather than minting a bad URL
assert.equal(resolveSemanticRoute({ type: "SHOW_DIVE_LENS", params: { lensId: "lens.nope" } }).path, resolveSemanticRoute({ type: "SHOW_DASHBOARD" }).path);

// 4. Invalid lens: the user asked for Dive In, so land on Overview (never throw, never drop to CORE, never an unknown id).
for (const bad of ["?lens=nope", "?lens=%20", "?lens=lens.missions", "?lens=<script>", "?lens=missions%00", "?lens=" + "x".repeat(500)]) {
  const loc = parseSurfaceLocation(bad);
  assert.deepEqual(loc, { surface: "dive", lensId: "lens.overview" }, bad.slice(0, 30));
}
assert.deepEqual(parseSurfaceLocation("?lens="), { surface: "core" }, "an empty lens means no lens");
assert.deepEqual(parseSurfaceLocation("?tier=garbage"), { surface: "core" });
assert.deepEqual(parseSurfaceLocation({ tier: "brain", lens: undefined }), { surface: "explore" }, "server searchParams object form");
assert.deepEqual(parseSurfaceLocation({ lens: ["finance", "tools"] }), { surface: "dive", lensId: "lens.finance" }, "first value wins for repeated keys");

// 5. A lens wins over tier (the semantic path carries both: /?tier=home&lens=…).
assert.deepEqual(parseSurfaceLocation("?tier=brain&lens=agents"), { surface: "dive", lensId: "lens.agents" });

// 6. Writing the surface never destroys other state (Systems overlay, view, job, demo flags).
assert.equal(withSurface("?panel=settings&tab=connectors", { surface: "dive", lensId: "lens.tools" }), "?panel=settings&tab=connectors&lens=tools");
assert.equal(withSurface("?lens=tools&panel=settings&tab=connectors", { surface: "core" }), "?panel=settings&tab=connectors", "leaving Dive removes only the lens");
assert.equal(withSurface("?tier=brain&job=abc", { surface: "dive", lensId: "lens.missions" }), "?job=abc&lens=missions", "tier is replaced, job preserved");
assert.deepEqual(surfaceParams({ surface: "dive" }), { tier: undefined, lens: "overview" }, "a dive with no lens id serializes as Overview");

// 7. Comparison used by the history writer (prevents duplicate / looping entries).
assert.ok(sameSurface({ surface: "core" }, { surface: "core" }));
assert.ok(!sameSurface({ surface: "core" }, { surface: "explore" }));
assert.ok(sameSurface({ surface: "dive" }, { surface: "dive", lensId: "lens.overview" }), "no lens == Overview");
assert.ok(!sameSurface({ surface: "dive", lensId: "lens.tools" }, { surface: "dive", lensId: "lens.agents" }));

// 8. Wiring: the pieces that make reload/Back/Forward real must stay connected (structural guard, not an animation test).
const page = read("../src/app/page.tsx");
assert.ok(page.includes("parseSurfaceLocation") && page.includes("initialDiveLensId"), "server page restores the lens from the URL");
const canvas = read("../src/components/spatial/SpatialCanvas.tsx");
assert.ok(canvas.includes('addEventListener("popstate"') && canvas.includes("window.history.pushState"), "SpatialCanvas owns surface history");
assert.ok(canvas.includes("pendingInstantDiveRef"), "reload on a lens lands inside Dive In without the plunge");
assert.ok(canvas.includes("DIVE_OPEN_EVENT"), "Back/Forward between lenses reuses the semantic growforge:dive-open event");
const appState = read("../src/lib/appState.tsx");
assert.ok(appState.includes('"tier", "lens"') && appState.includes('"push"'), "panel writes preserve the surface; Systems is a history step");
assert.ok(appState.includes('addEventListener("popstate"'), "Systems follows Back/Forward");
const overview = read("../src/components/spatial/dive/DiveOverview.tsx");
assert.ok(overview.includes("initialLensId"), "DiveOverview opens on the URL's lens");

// 9. CORE render-state guards (visual quality itself is verified in the browser, not here).
const engine = read("../src/components/spatial/neutronCore/NeutronCoreEngine.ts");
assert.ok(engine.includes("uMapReady") && engine.includes("baseline(p, t)"), "sphere has a lit procedural baseline until the surface image decodes");
const telemetry = read("../src/app/api/spatial/telemetry/route.ts");
assert.ok(telemetry.includes("isOwnerReviewMode() ? []"), "owner-review never reports persisted jobs as executing");
assert.ok(canvas.includes("Math.min(now - lastFrameTime, 100)"), "frame delta is clamped at the source");

console.log("surface location tests: all passed");

// 10. Canonicalizing an existing URL fixes the surface keys in place without reordering anything else.
assert.equal(withSurface("?lens=Finance&panel=settings&tab=connectors", { surface: "dive", lensId: "lens.finance" }), "?lens=finance&panel=settings&tab=connectors");
assert.equal(withSurface("?lens=bogus", { surface: "dive", lensId: "lens.overview" }), "?lens=overview");
assert.equal(withSurface("?job=abc&tier=brain&view=x", { surface: "explore" }), "?job=abc&tier=brain&view=x");
console.log("surface location canonicalization tests: all passed");

// 11. W0: CORE's Missions card enters the canonical Dive Missions lens, never the legacy "core" tier (which the Explore framing clamp bounced to ?tier=brain).
{
  const hud = read("../src/components/spatial/SpatialHud.tsx");
  const canvas = read("../src/components/spatial/SpatialCanvas.tsx");
  assert.match(hud, /onOpenMissions=\{onOpenMissions \?\? /, "the CORE Missions card uses the supplied canonical opener");
  assert.match(canvas, /const openMissionsLens = useCallback\(\(\) => \{\s*setDiveInitialLens\("lens\.missions"\);\s*startDiveInRef\.current\(\);/, "the opener seeds the Missions lens and starts the existing dive");
  assert.match(canvas, /onOpenMissions=\{openMissionsLens\}/, "SpatialCanvas wires the opener into the HUD");
  assert.ok(!/openMissionsLens[\s\S]{0,400}handleSelectTier\("core"\)/.test(canvas), "the opener must not route through the legacy core tier");
  // The URL that results is the canonical one, and the other CORE-ish entries keep meaning CORE.
  assert.deepEqual(parseSurfaceLocation("?lens=missions"), { surface: "dive", lensId: "lens.missions" });
  assert.deepEqual(parseSurfaceLocation("?tier=core"), { surface: "core" }, "/core and ?tier=core still mean the CORE surface");
  assert.deepEqual(parseSurfaceLocation(new URL(resolveSemanticRoute({ type: "SHOW_CORE" }).path, "http://x").searchParams), { surface: "core" }, "SHOW_CORE still means CORE");
  assert.deepEqual(parseSurfaceLocation(new URL(resolveSemanticRoute({ type: "SHOW_MISSIONS" }).path, "http://x").searchParams), { surface: "dive", lensId: "lens.missions" }, "SHOW_MISSIONS already opens the Missions lens");
}
console.log("W0 missions entry routing tests: all passed");
