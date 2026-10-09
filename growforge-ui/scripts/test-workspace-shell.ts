import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { closeDecision, cycleFocus, escapeStep, railTarget, workspaceFlagFrom, workspaceGeometry, WORKSPACE_BREAKPOINTS, WORKSPACE_RESERVE } from "../src/components/spatial/workspace-shell/workspaceShellModel";
import { HYPOTHETICAL_LABEL, WORKSPACE_TOKENS } from "../src/components/spatial/workspace-shell/workspaceTokens";

/** C8 / S1: the lens-agnostic workspace shell. Pure logic + source contracts (the live behaviour is exercised by the Playwright run recorded in state.md). */
const dir = new URL("../src/components/spatial/workspace-shell/", import.meta.url);
const read = (name: string) => readFileSync(new URL(name, dir), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// 1. Geometry at every supported width: inside the viewport, centred when large, full-screen on phones, the companion's room is kept clear.
for (const [w, h] of [[1920, 1080], [1366, 768], [1024, 768], [768, 1024], [390, 844]] as const) {
  const g = workspaceGeometry({ w, h });
  assert.ok(g.left >= 0 && g.top >= 0 && g.left + g.width <= w && g.top + g.height <= h, `${w}x${h}: inside the viewport`);
  if (w <= WORKSPACE_BREAKPOINTS.full) { assert.equal(g.kind, "full"); assert.deepEqual([g.left, g.top, g.width, g.top + g.height], [0, WORKSPACE_RESERVE.sheetTop, w, h], "a phone gets the whole screen below the app's own top bar (its settings control must not sit on the Close button)"); assert.ok(g.padBottom >= 200, "and keeps its content clear of the companion"); }
  else {
    assert.ok(h - (g.top + g.height) >= WORKSPACE_RESERVE.bottom, `${w}x${h}: the companion's room under the workspace`);
    assert.ok(g.top >= 72, "clear of the top navigation");
  }
  if (w >= WORKSPACE_BREAKPOINTS.inset) assert.ok(Math.abs(g.left - (w - g.width - g.left)) <= 1, `${w}: horizontally centred`);
}
assert.equal(workspaceGeometry({ w: 1920, h: 1080 }).kind, "centred"); assert.equal(workspaceGeometry({ w: 1366, h: 768 }).kind, "centred"); assert.equal(workspaceGeometry({ w: 1100, h: 800 }).kind, "wide"); assert.equal(workspaceGeometry({ w: 800, h: 900 }).kind, "inset");
assert.ok(workspaceGeometry({ w: 1920, h: 1080 }, "reading").width >= workspaceGeometry({ w: 1920, h: 1080 }).width, "reading mode is at least as wide");
// the workspace is independent of anything a lens shows: the same viewport always yields the same box
assert.deepEqual(workspaceGeometry({ w: 1440, h: 900 }), workspaceGeometry({ w: 1440, h: 900 }));

// 2. Closing: guarded when consequential work is in flight, immediate otherwise; Escape peels one layer at a time.
assert.deepEqual(closeDecision("backdrop", null), { action: "close" });
assert.deepEqual(closeDecision("escape", "An approval is in progress."), { action: "confirm", message: "An approval is in progress." });
assert.deepEqual(closeDecision("programmatic", "An approval is in progress."), { action: "close" }, "a close the lens itself decided is never second-guessed");
assert.equal(escapeStep({ mode: "reading", confirming: true }), "dismiss-confirm");
assert.equal(escapeStep({ mode: "reading", confirming: false }), "exit-reading");
assert.equal(escapeStep({ mode: "workspace", confirming: false }), "request-close");

// 3. One focus scope (workspace then companion), wrapping both ways; the rail roves.
assert.equal(cycleFocus(5, 4, false), 0); assert.equal(cycleFocus(5, 0, true), 4); assert.equal(cycleFocus(5, -1, false), 0); assert.equal(cycleFocus(5, -1, true), 4); assert.equal(cycleFocus(0, 0, false), -1);
assert.equal(railTarget(5, 4, "ArrowDown"), 0); assert.equal(railTarget(5, 0, "ArrowUp"), 4); assert.equal(railTarget(5, 2, "Home"), 0); assert.equal(railTarget(5, 2, "End"), 4); assert.equal(railTarget(5, 2, "x"), -1);

// 4. Rollout flag: OFF unless asked; the URL wins over storage and can switch it off.
// default ON (S2.1B.2): a clean session, a plain Missions URL and a stray ?workspace=1 all use the workspace; only an explicit 0 / off / false (URL wins over storage) falls back to the legacy Workbench.
assert.equal(workspaceFlagFrom("", null), true); assert.equal(workspaceFlagFrom("?lens=missions", null), true); assert.equal(workspaceFlagFrom("?workspace=1", null), true); assert.equal(workspaceFlagFrom("", "1"), true);
assert.equal(workspaceFlagFrom("?workspace=0", null), false); assert.equal(workspaceFlagFrom("?workspace=off", null), false); assert.equal(workspaceFlagFrom("?lens=missions&workspace=false", null), false);
assert.equal(workspaceFlagFrom("", "0"), false, "a stored 0 keeps the legacy Workbench"); assert.equal(workspaceFlagFrom("?workspace=1", "0"), true, "the URL wins over storage"); assert.equal(workspaceFlagFrom("?workspace=0", "1"), false);

// 5. Source contracts.
const files = readdirSync(dir).filter(f => /\.(tsx?|css)$/.test(f));
for (const f of files) assert.equal(/from\s+["'](\.\.\/(dive|workspace|[a-z-]+)\/|@\/components\/spatial\/(dive|workspace)\/)/.test(strip(read(f)).replace(/from\s+["']\.\.\/workspace-shell/g, "")), false, `${f}: the shell imports no lens (import boundary)`);
const shell = strip(read("WorkspaceShell.tsx")), layer = strip(read("useWorkspaceLayer.ts")), css = strip(read("WorkspaceShell.module.css"));
assert.ok(/role="dialog"/.test(shell) && /aria-labelledby=\{`ws-title-/.test(shell), "a labelled dialog");
assert.equal(/aria-modal/.test(shell), false, "deliberately NOT aria-modal: the companion is an operable peer; isolation is `inert` on the lens underneath");
assert.ok(/\.inert = true/.test(layer) && /el\.inert = was/.test(layer), "the lens underneath is made inert and restored exactly");
assert.ok(/data-workspace/.test(layer) && /cycleFocus/.test(layer) && /requestAnimationFrame\(\(\) => target\?\.focus/.test(layer), "marker, one focus scope, focus returned on close");
assert.ok(/downOnBackdrop/.test(shell) && /event\.target === event\.currentTarget/.test(shell), "a backdrop close needs the press AND the release on the backdrop itself");
assert.ok(/onKeyDown=\{onKeyDown\}/.test(shell) && !/window\.addEventListener\("keydown"/.test(shell + layer), "Escape is honoured from inside the workspace only (the companion keeps its own Escape)");
assert.ok(/role="alertdialog"/.test(shell) && /data-keep/.test(shell) && /data-discard/.test(shell), "a discard confirmation with a safe default");
assert.ok(/data-hypothetical/.test(shell) && HYPOTHETICAL_LABEL.includes("not recorded") && /dashed/.test(css), "the hypothetical region is reserved and visibly distinct");
// S2.1 (approved exception): the ONLY blur is the overlay's own diffusion (`.backdrop`, token-driven, off for reduced transparency); the workspace body is never blurred and no filter / drop-shadow exists.
const noDiffusion = css.replace(/-webkit-backdrop-filter:blur\(var\(--ws-diffusion\)\);backdrop-filter:blur\(var\(--ws-diffusion\)\);/, "").replace(/-webkit-backdrop-filter:none;backdrop-filter:none;/g, "");
assert.equal(/blur\(|filter\s*:|backdrop-filter|drop-shadow/.test(noDiffusion), false, "no blur / filter / drop shadow beyond the overlay diffusion");
assert.ok(/\.backdrop\{[^}]*backdrop-filter:blur\(var\(--ws-diffusion\)\)/.test(css) && /prefers-reduced-transparency:reduce\)\{\.backdrop\{[^}]*backdrop-filter:none/.test(css), "diffusion lives on the overlay only and yields to reduced transparency");
assert.ok(/prefers-reduced-motion:reduce\)\{[^}]*animation:none/.test(css), "reduced motion removes the animation");
assert.equal(/text-overflow\s*:\s*ellipsis|-webkit-line-clamp|white-space\s*:\s*nowrap/.test(css.replace(/\.tab span[^}]*\}/g, "")), false, "no ellipsis / clamp / nowrap in the shell (titles wrap)");
for (const token of WORKSPACE_TOKENS) assert.ok(css.includes(`${token}:`), `${token} is declared on the shell root`);
// the Missions lens keeps the legacy Workbench unless the flag is on
const lens = readFileSync(new URL("../src/components/spatial/dive/MissionWorktreeLens.tsx", import.meta.url), "utf8");
assert.ok(/workspaceFlag \? \(workspaceOpen/.test(lens) && /else dispatch\(\{ type: "openWorkbench" \}\)/.test(lens), "flag OFF: Explore details still opens the legacy Workbench");
// 6. S2: the Missions adapter shows the REAL recorded content through the existing pipeline (no second data model, no dev placeholder), behind the flag.
const adapter = strip(readFileSync(new URL("../src/components/spatial/dive/MissionWorkspace.tsx", import.meta.url), "utf8"));
assert.ok(/workbenchCapabilities\(/.test(adapter) && /workbenchContentOf\(/.test(adapter) && /<WorkbenchReading /.test(adapter) && /intelIdentityOf\(/.test(adapter), "S2: rail, content, identity come from the existing capability / content / reading pipeline");
assert.ok(/PlanApprovalAction/.test(adapter) && /RevisionRequestAction/.test(adapter) && /ToolApprovalsEntry/.test(adapter) && /guard=\{guard\}/.test(adapter), "S2: approvals and change requests are the same components, and an in-progress one guards closing");
assert.equal(/Simulate|placeholder|dev-trigger|S1 /.test(adapter), false, "S2: no S1 placeholder or dev control remains in the adapter");
assert.ok(/openWorkbench" \) setWorkspaceFor|action\.type === "openWorkbench"\) setWorkspaceFor/.test(lens) || /action\.type === "openWorkbench"\) setWorkspaceFor/.test(lens), "S2: with the flag on every way into the Workbench opens the workspace");
assert.equal(/data-ws-dev-trigger/.test(lens.replace(/\/\*[\s\S]*?\*\//g, "")), false, "S2: the dev-only phone trigger is gone (the Peek's own button is the phone entry)");
assert.ok(/<ToolApprovalsEntry worktree=\{worktree\} \/><\/div><\/div>/.test(adapter) && /closest\("button"\)\) onClose\(\)/.test(adapter), "S2: the global tool-approvals banner lives outside the layer, so its entry hands over to it by closing the workspace");
// 7. S2.2A: shared-surface morph (lens-agnostic): an `origin` element, an empty surface animated between MEASURED rects, content faded (never scaled), origin hidden and always restored, instant under reduced motion.
const morph = strip(read("useWorkspaceMorph.ts")), shellSrc = strip(read("WorkspaceShell.tsx"));
assert.ok(/origin\?: \(\) => HTMLElement \| null/.test(shellSrc) && /useWorkspaceMorph\(/.test(shellSrc), "S2.2A: the shell takes an optional origin");
assert.ok(/getBoundingClientRect/.test(morph) && /\.animate\(/.test(morph) && /left: `\$\{b\.left\}px`/.test(morph) && !/scale\(|transform/.test(morph), "S2.2A: the surface animates between measured rects with geometry, never a transform / scale");
assert.ok(/reduced \|\| !surface/.test(morph) && /restore\(true\)/.test(morph) && /style\.opacity = "0"/.test(morph), "S2.2A: reduced motion hides / restores the origin at once; the origin is never left hidden");
assert.ok(/data-morph="in"\]\{animation:wsMorphIn/.test(css.replace(/\s+/g, "")) || /wsMorphIn/.test(css), "S2.2A: the root only fades over the surface");
assert.equal(/\.morph\{[^}]*(blur|filter)/.test(css), false, "S2.2A: the surface has no blur / filter of its own");
console.log("test-workspace-shell: geometry at 5 widths, close guard, escape ladder, focus scope, flag, import boundary and a11y / motion source contracts passed");
