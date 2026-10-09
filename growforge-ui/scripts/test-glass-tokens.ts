import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GLASS_TOKENS } from "../src/components/spatial/glassTokens";

/** S2.2B: the canonical GrowForge glass tokens exist, carry the values extracted from the Overview panel, and the migrated Missions surfaces use them instead of their old teal / navy fills. */
const read = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const globals = read("app/globals.css");
const block = globals.slice(globals.indexOf("GROWFORGE GLASS MATERIAL"));
for (const token of GLASS_TOKENS) assert.ok(new RegExp(`${token}\s*:`).test(block), `${token} is declared on :root`);
// the tokens carry the values that were extracted from Overview's panel ...
const VALUES: [string, string][] = [["--gf-glass-a", "#0d1920cc"], ["--gf-glass-b", "#060d12e8"], ["--gf-glass-c", "#02070bf2"], ["--gf-hairline", "#9cc6dc1f"], ["--gf-gloss", "#ffffff0b"], ["--gf-specular", "#cfefff1f"], ["--gf-facing-glow", "#5db6dc16"], ["--gf-run", "#dff2ff70"], ["--gf-edge-line", "#e1f5ff7a"], ["--gf-edge-top", "#eaf6ff2e"], ["--gf-rule", "#9fc4d81c"], ["--gf-text-title", "#e9f3f8"], ["--gf-text", "#c9dae3"], ["--gf-text-quiet", "#6f8795"], ["--gf-accent", "#a4e6f7"], ["--gf-focus", "#6fb4c9"], ["--gf-champagne", "#cdb27a"], ["--gf-env-base", "#020407"], ["--gf-env-deep", "#010305"]];
for (const [token, literal] of VALUES) assert.ok(block.includes(`${token}: ${literal}`), `${token} = ${literal}`);
// ... and Overview now CONSUMES them (S2.2B.1): no duplicate literal for a tokenised role remains in its CSS, and it reads var(--gf-*)
const OVERVIEW = ["OverviewBriefing", "OverviewAtmosphere", "DiveOverview"].map(n => strip(read(`components/spatial/dive/${n}.module.css`))).join("\n");
for (const [token, literal] of VALUES) {
  const exact = new RegExp(`${literal}(?![0-9a-fA-F])`, "i");
  assert.equal(exact.test(OVERVIEW), false, `Overview no longer redefines ${token} (${literal})`);
}
for (const t of ["--gf-glass-a", "--gf-glass-b", "--gf-glass-c", "--gf-glass-angle", "--gf-gloss", "--gf-specular", "--gf-facing-glow", "--gf-hairline", "--gf-edge-top", "--gf-edge-inner", "--gf-run", "--gf-edge-line", "--gf-rule", "--gf-blur", "--gf-saturate", "--gf-shadow", "--gf-text-title", "--gf-text", "--gf-text-quiet", "--gf-accent", "--gf-focus", "--gf-champagne", "--gf-env-base", "--gf-env-deep"]) assert.ok(OVERVIEW.includes(`var(${t})`), `Overview consumes ${t}`);
// Missions consumes the same family (the `wide` / raised / recess sets are deliberately Missions-overlay only)
const MISSIONS = ["MissionIntelPanel", "MissionIntelBody", "MissionWorkspace"].map(n => strip(read(`components/spatial/dive/${n}.module.css`))).join("\n") + strip(read("components/spatial/workspace-shell/WorkspaceShell.module.css"));
for (const t of ["--gf-glass-a", "--gf-glass-b", "--gf-glass-c", "--gf-glass-wide-a", "--gf-glass-angle", "--gf-gloss", "--gf-specular", "--gf-hairline", "--gf-raised-a", "--gf-recess", "--gf-shadow", "--gf-scrim", "--gf-text-title", "--gf-accent", "--gf-champagne"]) assert.ok(MISSIONS.includes(`var(${t})`), `Missions consumes ${t}`);
// every declared token has at least one consumer somewhere in the app's CSS (no decorative tokens)
import { readdirSync, statSync } from "node:fs";
const allCss: string[] = []; const walk = (d: string) => { for (const e of readdirSync(new URL(`../src/${d}`, import.meta.url))) { const rel = `${d}/${e}`; if (statSync(new URL(`../src/${rel}`, import.meta.url)).isDirectory()) walk(rel); else if (e.endsWith(".css") && e !== "globals.css") allCss.push(strip(read(rel))); } };
walk("components");
const everything = allCss.join("\n");
for (const token of GLASS_TOKENS) assert.ok(everything.includes(`var(${token})`), `${token} has a consumer`);
// migrated surfaces: no old teal slab / navy glass fills, and they read the tokens
const OLD = /#(223f45|173036|0e2227|081317|25444b|1e393f|23424a|1b353b|223f46|1b3439|2d5359|25454b|10304f|091b32|040b17|0a1e3a|04102c|02091a|0e2c4e|081a30)/i;
for (const file of ["components/spatial/dive/MissionIntelPanel.module.css", "components/spatial/dive/MissionIntelBody.module.css", "components/spatial/workspace-shell/WorkspaceShell.module.css", "components/spatial/dive/MissionWorkspace.module.css"]) {
  const css = strip(read(file));
  assert.equal(OLD.test(css), false, `${file}: no pre-S2.2B teal / navy material fill remains`);
  assert.ok(/var\(--gf-/.test(css), `${file}: uses the canonical tokens`);
}
// the workspace, its morph surface and the Intelligence Panel share ONE glass fill
const shell = strip(read("components/spatial/workspace-shell/WorkspaceShell.module.css"));
assert.ok(/\.morph\{[^}]*var\(--gf-glass-a\)[^}]*var\(--gf-glass-b\)[^}]*var\(--gf-glass-c\)/.test(shell.replace(/\s+/g, " ")), "the morph surface wears the primary glass stops");
assert.ok(/var\(--gf-glass-angle\),var\(--gf-glass-a\) 0%,var\(--gf-glass-b\) 38%,var\(--gf-glass-c\) 100%/.test(strip(read("components/spatial/dive/MissionIntelPanel.module.css"))), "the Intelligence Panel wears the primary glass stops");
// legacy Workbench keeps its own look: shared content styles only take the new tokens through fallbacks
const reading = read("components/spatial/dive/WorkbenchReading.module.css");
assert.ok(/var\(--wb-hover,#12313b66\)/.test(reading) && /var\(--wb-recess,#02080b99\)/.test(reading), "shared content styles use token-with-legacy-fallback");
console.log("test-glass-tokens: canonical glass tokens declared with Overview's values; Intelligence Panel, workspace and morph surface share them");
