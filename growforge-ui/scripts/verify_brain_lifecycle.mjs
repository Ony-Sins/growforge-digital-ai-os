/**
 * GROWFORGE AI OS — BRAIN knowledge-layer lifecycle: labels / hover / selection must exist ONLY on the BRAIN surface.
 *
 * Four BRAIN cycles: Systems opened directly over BRAIN (hovered + selected record), reverse BRAIN->CORE journey sampled
 * mid-flight with a selected record, hover-only exit via MISSIONS, search-focused record + manual scroll-out (pivot glide,
 * old record position not clickable). Asserts stable record->particle mapping and a centred CORE target on every return. Needs the dev server on :3000 and Chrome.
 *   node scripts/verify_brain_lifecycle.mjs [--out=verification/brain03/lifecycle]
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import assert from "assert";
import { WebSocket } from "ws";

const arg = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.split("=")[1] : d; };
const OUT = path.resolve(arg("out", "verification/brain03/lifecycle"));
const PORT = 9293;
const CHROME = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url); this.id = 1; this.pending = new Map(); this.errors = [];
    this.ws.on("message", (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.id && this.pending.has(m.id)) { const { resolve, reject } = this.pending.get(m.id); this.pending.delete(m.id); if (m.error) reject(new Error(JSON.stringify(m.error))); else resolve(m.result); }
      else if (m.method === "Runtime.exceptionThrown") this.errors.push("exception: " + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text));
      else if (m.method === "Runtime.consoleAPICalled" && (m.params.type === "error" || m.params.type === "warning")) this.errors.push(m.params.type + ": " + m.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 200));
    });
  }
  open() { return new Promise((res, rej) => { this.ws.on("open", res); this.ws.on("error", rej); }); }
  send(method, params = {}) { const id = this.id++; return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  // Runs test-authored snippets in the local dev page via Runtime.evaluate.
  async run(expression) {
    for (let i = 0; i < 12; i++) {
      try {
        const r = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
        if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500));
        return r.result?.value;
      } catch (e) { if (i < 11 && /Execution context|context was destroyed/.test(e.message)) { await sleep(400); continue; } throw e; }
    }
  }
  async shot(name) { const r = await this.send("Page.captureScreenshot", { format: "jpeg", quality: 82 }); fs.writeFileSync(path.join(OUT, name + ".jpg"), Buffer.from(r.data, "base64")); }
  close() { this.ws.close(); }
}

const nav = (label) => `(() => { const b = [...document.querySelectorAll('nav[aria-label="Primary navigation"] button')].find(x => x.textContent.trim().startsWith(${JSON.stringify(label)})); b.click(); return true; })()`;

// One consistent snapshot of everything the user could see or interact with from the BRAIN knowledge layer.
const SNAP = `(() => {
  const layer = document.querySelector('[data-brain-labels]');
  const labels = layer ? [...layer.children].map(el => ({ t: el.children[0] && el.children[0].textContent, o: +(+el.style.opacity).toFixed(2), hot: el.dataset.hot === '1', vis: getComputedStyle(el).visibility })).filter(x => x.o > 0.02 && x.vis !== 'hidden') : [];
  const layerCS = layer ? getComputedStyle(layer) : null;
  const cam = window.__THREE_CAMERA, ctl = window.__THREE_CONTROLS, f = window.__BRAIN_FIELD, e = window.__THREE_NEUTRON_ENGINE;
  const active = [...document.querySelectorAll('nav[aria-label="Primary navigation"] button')].find(b => b.className.includes('from-cyan-200'));
  const container = document.querySelector('[data-brain-labels]').previousElementSibling;
  return {
    surface: active ? active.textContent.trim() : null,
    d: +cam.position.distanceTo(ctl.target).toFixed(0),
    target: [ctl.target.x, ctl.target.y, ctl.target.z].map(v => +v.toFixed(0)),
    labelsVisible: labels.length, labels: labels.map(l => l.t), labelDetail: labels.map(l => ({ t: l.t, o: l.o, hot: l.hot })),
    layerDisplay: layerCS ? layerCS.display : null, layerChildren: layer ? layer.children.length : 0,
    cursor: container.style.cursor,
    noteOpen: document.body.innerText.includes('OBSIDIAN NODE') || document.body.innerText.includes('CLICK CONNECTION TO NAVIGATE'),
    searchOpen: !!document.querySelector('input[placeholder^="Search notes"]'),
    interactive: f.debugInfo().interactive,
    hoveredInField: f.debugInfo().hovered,
    canvasSame: window.__id0 ? window.__id0.canvas === document.querySelector('[data-brain-labels]').previousElementSibling.querySelector('canvas') && window.__id0.eng === e && window.__id0.fld === f : null,
    flowTotal: +e.shared.uFlowTotal.value.toFixed(1),
  };
})()`;

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "gf-life-"));
  const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, "--headless=new", "--window-size=1600,900", "--enable-unsafe-swiftshader", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  let cdp; const steps = []; let failure = null; const summaryExtra = {};
  const log = async (name, expect) => {
    const s = await cdp.run(SNAP); steps.push({ name, ...s });
    await cdp.shot(name.replace(/[^a-z0-9]+/gi, "_"));
    if (expect) { try { expect(s); } catch (e) { failure = failure || `${name}: ${e.message}`; steps[steps.length - 1].FAILED = e.message; } }
    return s;
  };
  try {
    let ws;
    for (let i = 0; i < 40 && !ws; i++) { await sleep(400); try { ws = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === "page")?.webSocketDebuggerUrl; } catch { /* retry */ } }
    cdp = new CDP(ws); await cdp.open();
    await cdp.send("Runtime.enable"); await cdp.send("Page.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
    await cdp.send("Page.navigate", { url: "http://localhost:3000" });
    let ready = false;
    for (let i = 0; i < 240 && !ready; i++) {
      ready = !!(await cdp.run("!!(window.__BRAIN_FIELD && window.__BRAIN_FIELD.debugInfo().realRecords > 0 && window.__THREE_CAMERA && document.querySelector('[data-brain-labels]') && document.querySelector('[data-brain-labels]').previousElementSibling.querySelector('canvas'))").catch(() => false));
      if (!ready) await sleep(500);
    }
    assert(ready, "page, WebGL scene and knowledge records became ready within 120 s");
    await sleep(3500);
    await cdp.run("window.__id0 = { canvas: document.querySelector('[data-brain-labels]').previousElementSibling.querySelector('canvas'), eng: window.__THREE_NEUTRON_ENGINE, fld: window.__BRAIN_FIELD }; true");
    cdp.errors.length = 0;

    const BRAIN_D = [325, 336];
    const inBrain = (s) => { assert.ok(s.d >= BRAIN_D[0] && s.d <= BRAIN_D[1], `camera at BRAIN distance (d=${s.d})`); assert.ok(s.interactive, "BRAIN is interactive"); };
    const centered = (s) => assert.ok(s.target.every((v) => Math.abs(v) <= 1), `orbit target centred on the nucleus (${s.target})`);
    const noBrain = (s) => {
      assert.strictEqual(s.labelsVisible, 0, "no BRAIN labels visible: " + JSON.stringify(s.labels));
      assert.notStrictEqual(s.cursor, "pointer", "no hover cursor");
      assert.strictEqual(s.noteOpen, false, "no note open");
      assert.strictEqual(s.searchOpen, false, "no search panel");
      assert.ok(!s.interactive, "field not interactive (no clickable targets)");
      assert.strictEqual(s.hoveredInField, null, "no lingering hovered record in the field");
    };
    const MAPPING = "(() => { const m = {}; window.__BRAIN_FIELD.debugRecords().forEach(r => { m[r.id] = r.member; }); return { m, runs: window.__BRAIN_FIELD.debugInfo().assignmentRuns }; })()";
    const pickRecord = `(() => { const f = window.__BRAIN_FIELD, cam = window.__THREE_CAMERA, V = cam.position.constructor;
      return f.debugRecords().filter(r => !r.isHub).map(r => { const v = new V(...r.world).project(cam); return { id: r.id, title: r.title, x: (v.x*0.5+0.5)*innerWidth, y: (-v.y*0.5+0.5)*innerHeight }; })
        .filter(p => p.x > 420 && p.x < innerWidth - 380 && p.y > 120 && p.y < innerHeight - 100)[0]; })()`;
    const hover = async (p) => {
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x + 30, y: p.y + 20 });
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x + 2, y: p.y + 1 });
      await sleep(450);
    };
    const click = async (x, y) => {
      await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    };
    const closeSystems = () => cdp.run(`(() => { const bs = [...document.querySelectorAll('button')].filter(b => b.querySelector('svg.lucide-x') && b.getBoundingClientRect().width > 0);
      bs.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top || b.getBoundingClientRect().right - a.getBoundingClientRect().right);
      if (!bs[0]) return false; bs[0].click(); return true; })()`);
    const mappings = [];
    const checkMapping = async (label) => {
      const cur = await cdp.run(MAPPING);
      mappings.push({ label, runs: cur.runs, records: Object.keys(cur.m).length });
      if (mappings.length > 1) {
        const first = mappingRef.m;
        const changed = Object.keys(first).filter((id) => first[id] !== cur.m[id]);
        assert.strictEqual(changed.length, 0, `${label}: record->particle mapping changed for ${changed.join(", ")}`);
        assert.strictEqual(cur.runs, mappingRef.runs, `${label}: carriers were re-assigned (runs ${mappingRef.runs} -> ${cur.runs})`);
      } else mappingRef = cur;
      assert.ok(Object.values(cur.m).every((m) => m >= 0) && new Set(Object.values(cur.m)).size === Object.keys(cur.m).length, `${label}: every record has one distinct particle`);
    };
    let mappingRef = null;

    await log("01_core_start", (s) => { noBrain(s); centered(s); });

    // ---- cycle 1: CORE -> BRAIN
    await cdp.run(nav("Brain")); await sleep(9500);
    await log("02_brain_arrived", (s) => { inBrain(s); assert.strictEqual(s.labelsVisible, 0, "no always-on label for any node (incl. the hub): " + JSON.stringify(s.labels)); });
    await checkMapping("cycle1");

    // hover + select a record, then open SYSTEMS directly from BRAIN
    const r1 = await cdp.run(pickRecord);
    await hover(r1);
    await log("03_brain_hover", (s) => { assert.ok(s.labelsVisible >= 1); assert.strictEqual(s.cursor, "pointer"); assert.strictEqual(s.hoveredInField, r1.id); });
    await click(r1.x + 2, r1.y + 1); await sleep(900);
    await log("04_brain_selected", (s) => { assert.ok(s.noteOpen, "note opened in BRAIN"); });
    const beforeSystems = steps[steps.length - 1];
    await cdp.run(nav("Systems")); await sleep(1200);
    await log("05_systems_over_brain", (s) => {
      assert.strictEqual(s.labelsVisible, 0, "no BRAIN labels under Systems: " + JSON.stringify(s.labels));
      assert.ok(!s.interactive, "BRAIN not interactive under Systems");
      assert.strictEqual(s.hoveredInField, null, "hover cleared when Systems opens");
      assert.notStrictEqual(s.cursor, "pointer");
    });
    assert.ok(await closeSystems(), "Systems panel closed via its close button"); await sleep(1200);
    await log("06_systems_closed_back_in_brain", (s) => {
      inBrain(s);
      assert.deepStrictEqual(s.target, beforeSystems.target, "Systems did not move the camera pivot");
      assert.strictEqual(s.canvasSame, true);
    });
    const r1b = await cdp.run(pickRecord);
    await hover(r1b);
    await log("06b_brain_labels_restored", (s) => { assert.ok(s.labelsVisible >= 1, "labels work again after Systems closes"); assert.strictEqual(s.cursor, "pointer"); });

    // hover + select again, then reverse journey BRAIN -> CORE; CORE is selected mid-flight
    const r2 = await cdp.run(pickRecord);
    await hover(r2);
    await click(r2.x + 2, r2.y + 1); await sleep(900);
    await log("07_brain_selected_again", (s) => { assert.ok(s.noteOpen); });
    await cdp.run(nav("CORE"));
    let sawCoreMidJourney = false;
    for (const [i, wait] of [300, 600, 700, 900, 1000].entries()) {
      await sleep(wait);
      const s = await log(`08_reverse_mid_${i}`, noBrain);
      if (s.surface === "CORE" && s.d < 600) sawCoreMidJourney = true;
    }
    assert.ok(sawCoreMidJourney, "sampled CORE selected while the camera was still inside former BRAIN distance");
    await sleep(6000);
    await log("09_core_arrived", (s) => { noBrain(s); centered(s); assert.ok(s.d > 850, "camera back at CORE distance"); assert.strictEqual(s.canvasSame, true); });

    // ---- cycle 2: BRAIN again, hover only, leave via MISSIONS, then CORE
    await cdp.run(nav("Brain")); await sleep(9500);
    await log("10_brain_again", (s) => { inBrain(s); assert.strictEqual(s.canvasSame, true, "canvas/engine/field never rebuilt"); });
    await checkMapping("cycle2");
    const r3 = await cdp.run(pickRecord);
    await hover(r3);
    await log("11_brain_hover_only", (s) => { assert.strictEqual(s.cursor, "pointer"); });
    await cdp.run(nav("Missions")); await sleep(4500);
    await log("12_missions", (s) => { noBrain(s); centered(s); });
    await cdp.run(nav("CORE")); await sleep(9500);
    await log("13_core_via_missions", (s) => { noBrain(s); centered(s); assert.ok(s.d > 850); });

    // ---- cycle 3: BRAIN, focus a record via search (moves the orbit pivot onto it), then MANUAL scroll-out
    await cdp.run(nav("Brain")); await sleep(9500);
    await log("14_brain_third", (s) => { inBrain(s); });
    await checkMapping("cycle3");
    const focusTitle = r1.title;
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1540, y: 860 });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "/", code: "Slash", text: "/", windowsVirtualKeyCode: 191 });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "/", code: "Slash", windowsVirtualKeyCode: 191 });
    await sleep(400);
    await cdp.send("Input.insertText", { text: focusTitle });
    await sleep(400);
    const picked = await cdp.run(`(() => { const input = document.querySelector('input[placeholder^="Search notes"]'); if (!input) return false;
      const b = [...input.closest('div').parentElement.querySelectorAll('button')].find(x => x.textContent.includes(${JSON.stringify(focusTitle)})); if (!b) return false; b.click(); return true; })()`);
    assert.ok(picked, "search result for the record was clickable");
    await sleep(900);
    const focused = await log("15_brain_search_focused", (s) => {
      assert.ok(s.noteOpen, "search selection opens the note");
      assert.ok(Math.hypot(...s.target) > 20, `orbit pivot moved onto the record (${s.target})`);
    });
    const lastRecordPx = await cdp.run(`(() => { const r = window.__BRAIN_FIELD.debugRecords().find(x => x.title === ${JSON.stringify(focusTitle)}); const cam = window.__THREE_CAMERA, V = cam.position.constructor; const v = new V(...r.world).project(cam); return { x: (v.x*0.5+0.5)*innerWidth, y: (-v.y*0.5+0.5)*innerHeight }; })()`);
    // close the note first so the canvas receives the wheel; the selection itself is part of what must be cleaned up
    await cdp.run(`(() => { const x = [...document.querySelectorAll('button')].find(b => b.querySelector('svg.lucide-x') && b.getBoundingClientRect().right > innerWidth - 200 && b.getBoundingClientRect().top < 160); if (x) x.click(); return true; })()`);
    await sleep(300);
    // user scrolls out manually (no nav click) and keeps sampling the pivot during the glide
    await cdp.run(`(() => { const ctl = window.__THREE_CONTROLS; const P = window.__PIVOT = []; const t0 = performance.now();
      const tick = () => { P.push([Math.round(performance.now() - t0), +ctl.target.length().toFixed(2)]); if (P.length < 900) requestAnimationFrame(tick); }; requestAnimationFrame(tick); return true; })()`);
    for (let i = 0; i < 40; i++) {
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 800, y: 450, deltaX: 0, deltaY: 120 });
      await sleep(45);
      const d = await cdp.run("window.__THREE_CAMERA.position.distanceTo(window.__THREE_CONTROLS.target)");
      if (d > 760) break;
    }
    await sleep(3500);
    await log("16_core_after_manual_scroll_out", (s) => { noBrain(s); centered(s); assert.strictEqual(s.surface, "CORE", "manual scroll-out lands on CORE"); assert.ok(s.d > 660, `camera at CORE range (d=${s.d})`); });
    const pivot = await cdp.run("window.__PIVOT");
    const start = Math.hypot(...focused.target);
    const mids = pivot.filter(([, l]) => l > start * 0.05 && l < start * 0.95).length;
    let maxStep = 0;
    for (let i = 1; i < pivot.length; i++) maxStep = Math.max(maxStep, pivot[i - 1][1] - pivot[i][1]);
    const nonIncreasing = pivot.every((p, i) => i === 0 || p[1] <= pivot[i - 1][1] + 0.01);
    summaryExtra.pivotGlide = { startLen: +start.toFixed(1), frames: pivot.length, intermediateFrames: mids, maxStepPerFrame: +maxStep.toFixed(2), nonIncreasing, endLen: pivot[pivot.length - 1][1] };
    assert.ok(mids >= 8, `pivot glides home (only ${mids} intermediate frames -> snap)`);
    assert.ok(maxStep < start * 0.2, `no pivot snap (max per-frame step ${maxStep.toFixed(2)} of ${start.toFixed(1)})`);
    assert.ok(nonIncreasing, "pivot moves monotonically toward the nucleus");
    // the record's old screen position must not be clickable any more
    await click(lastRecordPx.x, lastRecordPx.y); await sleep(700);
    await log("17_click_old_record_position", (s) => { noBrain(s); });

    // ---- cycle 4: BRAIN again; mapping still identical after four entries (and several data refreshes)
    await cdp.run(nav("Brain")); await sleep(9500);
    await log("18_brain_fourth", (s) => { inBrain(s); centered(s); assert.strictEqual(s.canvasSame, true); });
    await checkMapping("cycle4");
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1560, y: 880 });
    await sleep(900);
    await log("19_brain_rest_no_labels", (s) => { assert.strictEqual(s.labelsVisible, 0, "no name visible at rest for any node: " + JSON.stringify(s.labels)); });
    for (let i = 0; i < 12; i++) {
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 1560, y: 880, deltaX: 0, deltaY: -120 });
      await sleep(120);
      const d = await cdp.run("window.__THREE_CAMERA.position.distanceTo(window.__THREE_CONTROLS.target)");
      if (d < 280) break;
    }
    await sleep(1800);
    const total = (await cdp.run("window.__BRAIN_FIELD.debugInfo().realRecords"));
    await log("20_brain_deep_zoom_all_names", (s) => {
      assert.ok(s.surface === "Brain" && s.d < 290 && s.d > 245, `zoomed deeper inside BRAIN (d=${s.d})`);
      assert.ok(s.labelsVisible >= Math.ceil(total * 0.8), `all names soft-appear when zoomed deeper (${s.labelsVisible}/${total})`);
      assert.ok(s.labelDetail.every((l) => l.o <= 0.5 && !l.hot), "names are soft (faint, no glow) until hovered: " + JSON.stringify(s.labelDetail.filter((l) => l.o > 0.5 || l.hot)));
    });
    const r4 = await cdp.run(pickRecord);
    await hover(r4);
    await log("21_brain_deep_hover_glow", (s) => {
      const hot = s.labelDetail.filter((l) => l.hot);
      assert.strictEqual(hot.length, 1, "exactly the hovered name glows: " + JSON.stringify(hot));
      assert.ok(r4.title.startsWith(hot[0].t.replace("\u2026", "")), `glowing name is the hovered record (${hot[0].t} vs ${r4.title})`);
      assert.ok(hot[0].o >= 0.95, `hovered name at full brightness (${hot[0].o})`);
      assert.ok(s.labelDetail.filter((l) => !l.hot).every((l) => l.o <= 0.95), "the other names stay dimmer than the hovered one");
    });
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1560, y: 880 });
    for (let i = 0; i < 12; i++) {
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 1560, y: 880, deltaX: 0, deltaY: 120 });
      await sleep(120);
      const d = await cdp.run("window.__THREE_CAMERA.position.distanceTo(window.__THREE_CONTROLS.target)");
      if (d > 335) break;
    }
    await sleep(1800);
    await log("22_brain_zoomed_back_names_fade", (s) => { assert.ok(s.surface === "Brain", "still in BRAIN"); assert.strictEqual(s.labelsVisible, 0, "names fade again at normal BRAIN distance: " + JSON.stringify(s.labels)); });

    // motion never restarted: shared flow integral is non-decreasing across every snapshot
    const flows = steps.filter((x) => "flowTotal" in x).map((x) => x.flowTotal);
    summaryExtra.flowMonotonic = flows.every((v, i) => i === 0 || v >= flows[i - 1]);
    summaryExtra.mappings = mappings;
    assert.ok(summaryExtra.flowMonotonic, "shared CORE motion integral never reset: " + flows.join(","));

    const consoleErrors = cdp.errors.filter((e) => !/status of 500/.test(e));
    fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify({ steps, failure, consoleErrors, ...summaryExtra }, null, 2));
    console.log(steps.filter((s) => "surface" in s).map((s) => `${s.FAILED ? "FAIL" : "ok  "} ${s.name.padEnd(28)} surface=${String(s.surface).padEnd(9)} d=${String(s.d).padEnd(4)} labels=${s.labelsVisible}${s.labels.length ? " " + JSON.stringify(s.labels) : ""} cursor=${s.cursor || "-"} note=${s.noteOpen} search=${s.searchOpen} interactive=${s.interactive} layer=${s.layerDisplay}${s.FAILED ? "  <- " + s.FAILED : ""}`).join("\n"));
    console.log("pivot glide:", JSON.stringify(summaryExtra.pivotGlide)); console.log("mappings:", JSON.stringify(summaryExtra.mappings)); console.log("flow monotonic:", summaryExtra.flowMonotonic);
    console.log("console errors:", consoleErrors.length ? consoleErrors : "none");
    console.log(failure || consoleErrors.length ? "\nLIFECYCLE VERIFICATION FAILED" : "\nLIFECYCLE VERIFICATION PASSED");
    if (failure || consoleErrors.length) process.exitCode = 1;
  } catch (err) {
    console.error("SCRIPT ERROR", err); process.exitCode = 1;
    fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify({ steps, failure: String(err), ...summaryExtra }, null, 2));
  } finally {
    cdp?.close(); chrome.kill();
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

main();
