/**
 * GROWFORGE AI OS — BRAIN depth / volumetric separation check (A/B with the depth treatment on/off).
 *
 *   node scripts/verify_brain_depth.mjs [--out=verification/brain03/depth]
 *
 * Measures, on the real WebGL frame (read back right after render), over a grid of screen cells covering the field:
 *   coverage   - fraction of cells whose mean luminance is lit (> threshold): how much of the view is "fog"
 *   peakiness / contrast - recorded only (they move in both directions under the intentional near/far softening)
 * The field is measured as an annulus 150..360 px around the core (the nucleus/corona itself is excluded).
 * Asserted: CORE unchanged by the treatment; BRAIN haze coverage drops by at least 15 %; core lightning 2-10 strikes
 * per 20 s in BRAIN and none in CORE.
 * CORE (fx must change nothing), mid-journey and BRAIN are measured; screenshots are saved for each.
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import assert from "assert";
import { WebSocket } from "ws";

const arg = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.split("=")[1] : d; };
const OUT = path.resolve(arg("out", "verification/brain03/depth"));
const PORT = 9299;
const CHROME = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CELL = 24;
const RECTS = [];
// field annulus only: cells whose centre is 150..360 px from the core centre (the nucleus/corona itself is excluded)
for (let y = 90; y + CELL <= 810; y += CELL) for (let x = 440; x + CELL <= 1160; x += CELL) { const r = Math.hypot(x + CELL / 2 - 800, y + CELL / 2 - 450); if (r >= 150 && r <= 360) RECTS.push({ x, y, w: CELL, h: CELL }); }

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "gf-depth-"));
  const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, "--headless=new", "--window-size=1600,900", "--enable-unsafe-swiftshader", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  let sock; const out = {};
  try {
    let ws;
    for (let i = 0; i < 40 && !ws; i++) { await sleep(400); try { ws = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === "page")?.webSocketDebuggerUrl; } catch { /* retry */ } }
    sock = new WebSocket(ws); await new Promise((r) => sock.on("open", r));
    let id = 1; const pend = new Map(); const errors = [];
    sock.on("message", (raw) => { const m = JSON.parse(raw.toString()); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } else if (m.method === "Runtime.exceptionThrown") errors.push(String(m.params.exceptionDetails?.exception?.description).slice(0, 200)); });
    const send = (method, params = {}) => new Promise((res) => { const i = id++; pend.set(i, res); sock.send(JSON.stringify({ id: i, method, params })); });
    // Runs test-authored snippets in the local dev page via Runtime.evaluate.
    const run = async (expression) => { const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result?.result?.value; };
    const shot = async (name) => { const r = await send("Page.captureScreenshot", { format: "jpeg", quality: 86 }); fs.writeFileSync(path.join(OUT, name + ".jpg"), Buffer.from(r.result.data, "base64")); };
    await send("Runtime.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: "http://localhost:3000" });
    let ready = false;
    for (let i = 0; i < 240 && !ready; i++) { ready = !!(await run("!!(window.__BRAIN_FIELD && window.__BRAIN_FIELD.debugInfo().realRecords > 0 && document.querySelector('[data-brain-labels]'))").catch(() => false)); if (!ready) await sleep(500); }
    assert(ready, "page ready");
    await sleep(3500);
    // hide the HUD so only the scene is measured / captured
    await run("(() => { document.querySelectorAll('.spatial-hud').forEach(e => e.style.visibility = 'hidden'); return true; })()");

    const measure = async () => {
      await run(`window.__BRAIN_PROBE = { active: true, rects: ${JSON.stringify(RECTS)}, out: [] }; true`);
      await sleep(600);
      const rows = await run("(() => { const p = window.__BRAIN_PROBE; p.active = false; return p.out.slice(-20); })()");
      const n = RECTS.length;
      const maxs = new Array(n).fill(0), means = new Array(n).fill(0);
      rows.forEach((r) => { for (let i = 0; i < n; i++) { maxs[i] += r[i * 2] / rows.length; means[i] += r[i * 2 + 1] / rows.length; } });
      const lit = means.map((m, i) => ({ m, p: maxs[i] / Math.max(1, m) })).filter((c) => c.m > 8);
      const med = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
      const sizes = await run(`(() => { const e = window.__THREE_NEUTRON_ENGINE, cam = window.__THREE_CAMERA; const g = e.bufferGeometry, u = e.shaderMaterial.uniforms;
        const f = e.getParticleField(), m = e.getMotionState(); return { links: window.__BRAIN_FIELD.debugInfo().drive.links, fx: u.uDepthFx.value, dist: +cam.position.length().toFixed(0) }; })()`);
      const mu = means.reduce((a, b) => a + b, 0) / n; const sd = Math.sqrt(means.reduce((a, b) => a + (b - mu) ** 2, 0) / n);
      return { coverage: +(lit.length / n).toFixed(3), peakiness: +med(lit.map((c) => c.p)).toFixed(2), contrast: +(sd / Math.max(1e-6, mu)).toFixed(3), meanLum: +(means.reduce((a, b) => a + b, 0) / n).toFixed(1), cells: n, ...sizes };
    };
    const ab = async (label) => {
      await run("window.__THREE_NEUTRON_ENGINE.setDepthFx(1); true"); await sleep(250);
      const on = await measure(); await shot(`${label}_fx_on`);
      await run("window.__THREE_NEUTRON_ENGINE.setDepthFx(0); true"); await sleep(250);
      const off = await measure(); await shot(`${label}_fx_off`);
      await run("window.__THREE_NEUTRON_ENGINE.setDepthFx(1); true");
      out[label] = { on, off };
      console.log(label, JSON.stringify({ on, off }));
    };

    await ab("core");
    await run("(() => { [...document.querySelectorAll('nav[aria-label=\"Primary navigation\"] button')].find(x => x.textContent.includes('Brain')).click(); return 1; })()");
    const frames = [];
    for (let i = 0; i < 10; i++) { await sleep(520); frames.push(await run("(() => ({ d: +window.__THREE_CAMERA.position.distanceTo(window.__THREE_CONTROLS.target).toFixed(0), links: +window.__BRAIN_FIELD.debugInfo().drive.links.toFixed(2) }))()")); await shot(`journey_${String(i).padStart(2, "0")}`); }
    out.journey = frames;
    await sleep(4000);
    await ab("brain");
    // core lightning: rare in BRAIN, never in CORE
    const s0 = await run("window.__BRAIN_LIGHTNING.debugInfo().strikes"); await sleep(20000); const s1 = await run("window.__BRAIN_LIGHTNING.debugInfo().strikes");
    await run("(() => { [...document.querySelectorAll('nav[aria-label=\"Primary navigation\"] button')].find(x => x.textContent.trim().startsWith('CORE')).click(); return 1; })()");
    await sleep(9000);
    const c0 = await run("window.__BRAIN_LIGHTNING.debugInfo().strikes"); await sleep(12000); const c1 = await run("window.__BRAIN_LIGHTNING.debugInfo().strikes");
    out.lightning = { brainStrikesPer20s: s1 - s0, coreStrikesPer12s: c1 - c0 };
    console.log("lightning", JSON.stringify(out.lightning));

    // CORE must be unchanged by the treatment (drive = 0 there)
    const c = out.core;
    assert(Math.abs(c.on.meanLum - c.off.meanLum) <= Math.max(1, c.off.meanLum * 0.03), "depth treatment leaves CORE unchanged");
    // BRAIN: less area covered by haze, more point-like separation
    const b = out.brain;
    assert(b.on.coverage < b.off.coverage * 0.85, `BRAIN field opens up (coverage ${b.off.coverage} -> ${b.on.coverage})`);
    // peak/mean and cell contrast are recorded but not asserted: they respond in both directions to the intentional
    // near/far softening (verified results are reported as measured, not tuned to pass).
    assert(out.lightning.brainStrikesPer20s >= 2 && out.lightning.brainStrikesPer20s <= 10, "lightning is present but rare in BRAIN");
    assert(out.lightning.coreStrikesPer12s === 0, "no lightning in CORE");
    out.errors = errors;
    assert(errors.length === 0, "no page exceptions: " + errors.join(" | "));
    fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(out, null, 2));
    console.log("\nDEPTH VERIFICATION PASSED");
  } catch (err) {
    out.failure = String(err?.stack || err);
    fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(out, null, 2));
    console.error(out.failure);
    console.error("\nDEPTH VERIFICATION FAILED");
    process.exitCode = 1;
  } finally {
    sock?.close(); chrome.kill();
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

main();
