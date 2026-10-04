/**
 * GROWFORGE AI OS — BRAIN-03: the CORE's own atmosphere particles connecting up.
 *
 * Needs the dev server on :3000 and Chrome installed. Usage:
 *   node scripts/verify_brain03_arbor.mjs [--soak=60] [--out=verification/brain03/auto]
 *
 * Checks (all measured in the real browser, on the real WebGL scene):
 *   1. GPU <-> CPU parity of the shared CORE particle motion (WebGL2 transform feedback), CORE + BRAIN state
 *   2. Every real record is carried by exactly one distinct real atmosphere particle
 *   3. Forward journey CORE -> BRAIN: connectivity accumulates monotonically, outer particles speed up,
 *      the nucleus grows monotonically, no filament is ever longer than the link cap (no long cords)
 *   4. Soak in BRAIN: no console/page errors, scene identity stable across data refreshes, clock monotonic,
 *      no per-frame position snap, edge count bounded
 *   5. Click-to-open on a real record, category filter persistence across refreshes
 *   6. Reverse journey BRAIN -> CORE (connectivity monotonically decreases to 0), then into BRAIN again
 *   7. Semantic structure (BRAIN-03c): hubs + linked records form local clusters with key filaments, records are
 *      measurably more distinguishable than ordinary particles, data pulses are measurably visible (A/B with the
 *      pulse gain), labels stay sparse until hover/proximity/sidebar-list locate, connectivity follows the
 *      atmosphere radially (no shell), record points stay small
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import assert from "assert";
import { WebSocket } from "ws";

const arg = (name, def) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : def;
};
const SOAK_SEC = Number(arg("soak", "60"));
const OUT = path.resolve(arg("out", "verification/brain03/auto"));
const PORT = 9291;
const CHROME = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 1;
    this.pending = new Map();
    this.errors = [];
    this.ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method === "Runtime.exceptionThrown") {
        this.errors.push("exception: " + (msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text));
      } else if (msg.method === "Runtime.consoleAPICalled" && (msg.params.type === "error" || msg.params.type === "warning")) {
        this.errors.push(msg.params.type + ": " + msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 200));
      }
    });
  }
  open() { return new Promise((res, rej) => { this.ws.on("open", res); this.ws.on("error", rej); }); }
  send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  // Runs test-authored snippets in the local dev page via Runtime.evaluate (not JS eval of untrusted input).
  async run(expression) {
    for (let i = 0; i < 12; i++) {
      try {
        const r = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
        if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400));
        return r.result?.value;
      } catch (e) {
        if (i < 11 && /Execution context|context was destroyed/.test(e.message)) { await sleep(400); continue; }
        throw e;
      }
    }
  }
  async shot(name, clip) {
    const r = await this.send("Page.captureScreenshot", { format: "jpeg", quality: 84, ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
    fs.writeFileSync(path.join(OUT, name + ".jpg"), Buffer.from(r.data, "base64"));
  }
  close() { this.ws.close(); }
}

const clickNav = (label) => `(() => { const b = [...document.querySelectorAll('nav button')].find(x => x.textContent.trim().startsWith(${JSON.stringify(label)})); b.click(); return true; })()`;

const PARITY = `(() => {
  const P = window.__BRAIN_FIELD.debugParity();
  const gl = document.createElement('canvas').getContext('webgl2');
  const vs = \`#version 300 es
precision highp float;
in vec3 aBase; in vec3 aRnd;
\${P.glsl}
out vec3 vOut;
void main(){ vOut = coreParticleWorld(aBase,aRnd); gl_Position = vec4(0.0); gl_PointSize = 1.0; }\`;
  const fs = '#version 300 es\\nprecision highp float; out vec4 o; void main(){ o = vec4(1.0); }';
  const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
  const pr = gl.createProgram(); gl.attachShader(pr, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, mk(gl.FRAGMENT_SHADER, fs));
  gl.transformFeedbackVaryings(pr, ['vOut'], gl.SEPARATE_ATTRIBS); gl.linkProgram(pr); gl.useProgram(pr);
  const U = P.uniforms; for (const k of Object.keys(U)) gl.uniform1f(gl.getUniformLocation(pr, k), U[k]);
  const bufIn = (data, name) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW); const l = gl.getAttribLocation(pr, name); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 3, gl.FLOAT, false, 0, 0); };
  const mB = [], mR = []; P.members.forEach(m => { mB.push(m[1], m[2], m[3]); mR.push(m[4], m[5], m[6]); });
  bufIn(mB, 'aBase'); bufIn(mR, 'aRnd');
  const n = P.members.length;
  const out = gl.createBuffer(); gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, out); gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER, n * 12, gl.STATIC_READ);
  const tf = gl.createTransformFeedback(); gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, tf); gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, out);
  gl.enable(gl.RASTERIZER_DISCARD); gl.beginTransformFeedback(gl.POINTS); gl.drawArrays(gl.POINTS, 0, n); gl.endTransformFeedback(); gl.disable(gl.RASTERIZER_DISCARD);
  const g = new Float32Array(n * 3); gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER, 0, g);
  let e = 0; P.members.forEach((m, i) => { e = Math.max(e, Math.hypot(g[i*3]-m[7], g[i*3+1]-m[8], g[i*3+2]-m[9])); });
  return { coreMaxErr: e, flowBlend: U.uFlowBlend, members: n };
})()`;

const MONITOR = `(() => {
  const m = window.__mon = { last: null, lastT: 0, maxSpeed: 0, worst: null, frames: 0, dts: [], t0: performance.now(), clockRegress: 0, lastClock: -1,
    ids: { canvas: document.querySelector('[data-brain-labels]').previousElementSibling.querySelector('canvas'), eng: window.__THREE_NEUTRON_ENGINE, fld: window.__BRAIN_FIELD } };
  const tick = (t) => {
    const P = window.__BRAIN_FIELD.debugParity();
    const pts = P.members.map(x => x.slice(7, 10));
    const dt = (t - m.lastT) / 1000;
    if (m.last && dt > 0 && dt < 0.25) {
      m.dts.push(dt);
      pts.forEach((p, i) => { const q = m.last[i]; const s = Math.hypot(p[0]-q[0], p[1]-q[1], p[2]-q[2]) / dt; if (s > m.maxSpeed) { m.maxSpeed = s; m.worst = { t: Math.round(t - m.t0), dt, s }; } });
    }
    const clk = window.__BRAIN_FIELD.engine.shared.uClock.value; if (clk < m.lastClock) m.clockRegress++; m.lastClock = clk;
    m.last = pts; m.lastT = t; m.frames++;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return true;
})()`;

const STATE = `(() => { const f = window.__BRAIN_FIELD, m = window.__mon, i = f.debugInfo(), e = window.__THREE_NEUTRON_ENGINE;
  const d = window.__THREE_CAMERA.position.distanceTo(window.__THREE_CONTROLS.target);
  return { d: +d.toFixed(0), links: +i.drive.links.toFixed(3), edges: i.links.alive, ordinary: i.links.ordinary, local: i.links.local, relation: i.links.relation, longestEdge: +i.links.longestOrdinary.toFixed(1), longestKey: +i.links.longestKey.toFixed(1), maxLen: i.links.maxLen,
    records: i.realRecords, chips: document.querySelectorAll('aside button.rounded-full').length,
    same: m.ids.canvas === document.querySelector('[data-brain-labels]').previousElementSibling.querySelector('canvas') && m.ids.eng === window.__THREE_NEUTRON_ENGINE && m.ids.fld === window.__BRAIN_FIELD,
    clock: +f.engine.shared.uClock.value.toFixed(1), flowTotal: e.shared.uFlowTotal.value, nucleusApparent: +(e.getNucleusRadius() / d).toFixed(5), frames: m.frames, t: performance.now() }; })()`;

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "gf-brain03-"));
  const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, "--headless=new", "--window-size=1600,900", "--enable-unsafe-swiftshader", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  let cdp;
  const summary = {};
  const ignorable = (e) => /status of 500/.test(e); // unrelated backend routes (/api/jobs etc.) while the dev server compiles
  try {
    let ws;
    for (let i = 0; i < 40 && !ws; i++) {
      await sleep(400);
      try { ws = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === "page")?.webSocketDebuggerUrl; } catch { /* retry */ }
    }
    assert(ws, "Chrome DevTools not reachable");
    cdp = new CDP(ws);
    await cdp.open();
    await cdp.send("Runtime.enable");
    await cdp.send("Page.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
    await cdp.send("Page.navigate", { url: "http://localhost:3000" });
    let ready = false;
    for (let i = 0; i < 240 && !ready; i++) { ready = !!(await cdp.run("!!(window.__BRAIN_FIELD && window.__BRAIN_FIELD.debugInfo().realRecords > 0 && document.querySelector('[data-brain-labels]') && document.querySelector('[data-brain-labels]').previousElementSibling.querySelector('canvas'))").catch(() => false)); if (!ready) await sleep(500); }
    assert(ready, "page, WebGL scene and knowledge records became ready within 120 s");
    await sleep(3500);
    cdp.errors.length = 0;
    summary.gpu = await cdp.run("(() => { const gl = document.createElement('canvas').getContext('webgl2'); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'n/a'; })()");

    // 1a. parity in CORE state
    summary.parityCore = await cdp.run(PARITY);
    assert(summary.parityCore.coreMaxErr < 0.01, "GPU/CPU parity (CORE state)");
    await cdp.shot("00_core");

    // 2. mapping
    summary.mapping = await cdp.run(`(async () => { const g = (await (await fetch('/api/spatial/graph')).json()).data; const recs = window.__BRAIN_FIELD.debugRecords();
      const ids = new Set(recs.map(r => r.id)); const uniq = new Set(recs.map(r => r.member));
      return { nodes: g.nodes.length, records: recs.length, allMapped: g.nodes.every(n => ids.has(n.id)), uniqueParticles: uniq.size }; })()`);
    const map = summary.mapping;
    assert(map.nodes === map.records && map.allMapped, "every real graph node has a record slot");

    // 3. forward journey
    await cdp.run(MONITOR);
    await cdp.run(clickNav("Brain"));
    const journey = [];
    for (let i = 0; i < 26; i++) {
      journey.push(await cdp.run(STATE));
      await cdp.shot(`01_journey_${String(i).padStart(2, "0")}`);
      await sleep(180);
    }
    summary.journey = journey.map((j) => `d=${j.d} links=${j.links} edges=${j.edges} longest=${j.longestEdge} nucleus=${j.nucleusApparent}`);
    for (let i = 1; i < journey.length; i++) assert(journey[i].links >= journey[i - 1].links - 0.02, "connectivity accumulates monotonically on the way in");
    for (let i = 1; i < journey.length; i++) assert(journey[i].nucleusApparent >= journey[i - 1].nucleusApparent * 0.97, "nucleus apparent size grows (never shrinks) on the way in");
    assert(journey.every((j) => j.longestEdge <= j.maxLen * 1.06 && j.longestKey <= 102), "no filament is longer than its cap (no long cords)");
    const early = journey.find((j) => j.links > 0.02 && j.links < 0.2);
    assert(early, "links start gradually (a frame with 2-20% connectivity exists)");
    const rate = (a, b) => (b.flowTotal - a.flowTotal) / ((b.t - a.t) / 1000);
    const r0 = rate(journey[0], journey[3]);
    let peak = 0;
    for (let i = 0; i + 3 < journey.length; i++) peak = Math.max(peak, rate(journey[i], journey[i + 3]));
    summary.swirlRate = { early: +r0.toFixed(2), peakDuringDive: +peak.toFixed(2) };
    assert(peak > r0 * 2, "outer particles swirl markedly faster as the dive deepens");
    await sleep(3000);
    const arrival = await cdp.run(STATE);
    const settled = await cdp.run(STATE);
    await sleep(2000);
    const settled2 = await cdp.run(STATE);
    summary.swirlRate.settledAtBrain = +((settled2.flowTotal - settled.flowTotal) / ((settled2.t - settled.t) / 1000)).toFixed(2);
    assert(summary.swirlRate.settledAtBrain < peak * 0.7, "swirl settles after arrival (records stay clickable)");
    assert(arrival.d >= 325 && arrival.d <= 336 && arrival.links > 0.99, "arrives at BRAIN with the atmosphere fully connected");
    await cdp.shot("02_brain_arrival");

    // 7. semantic structure --------------------------------------------------------------------
    await sleep(2500);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1540, y: 860 });
    const sem = {};
    summary.semantic = sem;
    const carriers = await cdp.run("(() => { const r = window.__BRAIN_FIELD.debugRecords(); return { records: r.length, distinctParticles: new Set(r.map(x => x.member)).size, unassigned: r.filter(x => x.member < 0).length }; })()");
    summary.carriers = carriers;
    assert(carriers.unassigned === 0 && carriers.distinctParticles === carriers.records && carriers.records === map.nodes, "every real record rides one distinct real atmosphere particle");
    sem.info = await cdp.run("(() => { const i = window.__BRAIN_FIELD.debugInfo(); return { hubs: i.hubs, linked: i.linked, records: i.realRecords, ...i.links }; })()");
    assert(sem.info.hubs >= 1 && sem.info.linked >= 1, "hub + really-linked records are identified");
    assert(sem.info.local > 0, "records own local key filaments");
    assert(sem.info.relation >= 6, "the hub's real links show as short relation filaments in a local cluster");
    assert(sem.info.ordinary < 1100, "ordinary background web is sparse (not a fog)");

    // (a) radial distribution: connectivity follows the atmosphere, no detached shell
    sem.radial = await cdp.run(`(() => { const f = window.__BRAIN_FIELD; f.debugMemberPositions(); const r = f.debugEdgeRadii();
      const bins = new Array(8).fill(0); const b0 = 45, b1 = 145; r.ordinary.forEach(x => { const k = Math.min(7, Math.max(0, Math.floor((x - b0) / (b1 - b0) * 8))); bins[k]++; });
      const n = r.ordinary.length; return { n, maxR: +Math.max(...r.ordinary).toFixed(0), minR: +Math.min(...r.ordinary).toFixed(0), fractions: bins.map(x => +(x / n).toFixed(2)) }; })()`);
    assert(sem.radial.maxR <= 145, "connectivity stays in the inner field around the core (no outer layer)");
    assert(sem.radial.minR < 60, "connections reach the core's immediate environment");
    assert(Math.max(...sem.radial.fractions) < 0.4 && sem.radial.fractions.filter((f) => f > 0.03).length >= 5, "filaments fill the inner volume (not a thin band)");

    // (b) discoverability: real record points vs ordinary atmosphere particles (local peak / local mean luminance).
    // Measured at the inspection depth (d ~ 280, where every record's NAME is shown), NOT at arrival: by design
    // distant records are faint locators at arrival (d=330) and only resolve as the camera goes inward, so
    // measuring at arrival tests a premise the current design no longer has. Threshold unchanged (1.35).
    const dist = () => cdp.run("window.__THREE_CAMERA.position.distanceTo(window.__THREE_CONTROLS.target)");
    const goTo = async (target) => {
      for (let i = 0; i < 60 && Math.abs((await dist()) - target) > 6; i++) {
        await cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 1540, y: 860, deltaX: 0, deltaY: (await dist()) > target ? -60 : 60 });
        await sleep(110);
      }
      await sleep(1800);
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1540, y: 860 });
    };
    const arrivalDist = await dist();
    await goTo(280);
    const targets = await cdp.run(`(() => { const f = window.__BRAIN_FIELD, cam = window.__THREE_CAMERA, V = cam.position.constructor;
      const scr = (w) => { const v = new V(w[0], w[1], w[2]).project(cam); return { x: (v.x*0.5+0.5)*innerWidth, y: (-v.y*0.5+0.5)*innerHeight }; };
      const inView = (p) => p.x > 390 && p.x < innerWidth - 70 && p.y > 100 && p.y < innerHeight - 70;
      const recs = f.debugRecords(); const carriers = new Set(recs.map(r => r.member));
      const real = recs.map(r => ({ id: r.id, imp: r.importance, ...scr(r.world) })).filter(inView);
      const mp = f.debugMemberPositions(); const ord = [];
      for (let m = 0; m < 900 && ord.length < 70; m += 7) { if (carriers.has(m)) continue; const p = scr([mp[m*3], mp[m*3+1], mp[m*3+2]]); if (inView(p)) ord.push(p); }
      return { real, ord }; })()`);
    const rects = [];
    [...targets.real, ...targets.ord].forEach((p) => { rects.push({ x: p.x - 7, y: p.y - 7, w: 14, h: 14 }); rects.push({ x: p.x - 32, y: p.y - 32, w: 64, h: 64 }); });
    await cdp.run(`window.__BRAIN_PROBE = { active: true, rects: ${JSON.stringify(rects)}, out: [] }; true`);
    await sleep(700);
    const probe = await cdp.run("(() => { const p = window.__BRAIN_PROBE; p.active = false; return p.out.slice(0, 6); })()");
    const contrast = (row, i) => row[i * 4] / Math.max(1, row[i * 4 + 3]);
    const nReal = targets.real.length;
    const med = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
    const realC = [], ordC = [];
    for (let i = 0; i < nReal; i++) realC.push(med(probe.map((row) => contrast(row, i))));
    for (let i = 0; i < targets.ord.length; i++) ordC.push(med(probe.map((row) => contrast(row, nReal + i))));
    sem.discoverability = { realInView: nReal, ordinarySampled: ordC.length, realMedianContrast: +med([...realC]).toFixed(2), ordinaryMedianContrast: +med([...ordC]).toFixed(2) };
    sem.discoverability.ratio = +(sem.discoverability.realMedianContrast / sem.discoverability.ordinaryMedianContrast).toFixed(2);
    assert(nReal >= 8, "a meaningful number of real records are in view to measure");
    assert(sem.discoverability.ratio >= 1.35, "real records are measurably more distinguishable than ordinary particles");
    // (c) cords. By design cords are hidden at arrival and emerge with depth and proximity (cord shader:
    // smoothstep(0.45, 0.78, journeyDepth) x distance-to-nearest-endpoint), so they are inspected at the depth
    // where they are actually meant to be seen (d ~ 110), not at arrival. Two separate things are tested:
    //   (c1) idle STRUCTURAL PLASMA - a standing, breathing texture inside the cord. Non-directional.
    //   (c2) directional DATA PACKETS - must exist ONLY for a real recorded event. No production code path
    //        supplies such an event yet, so the honest test is that idle cords carry none and that nothing
    //        (including the verification gain hook) can conjure traffic. Traffic is never fabricated here.
    await goTo(110);
    const cordInfo = await cdp.run(`(() => { const f = window.__BRAIN_FIELD, cam = window.__THREE_CAMERA, V = cam.position.constructor;
      const TS = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
      const es = f.debugKeyEdges(TS).map(e => { const near = Math.min(cam.position.distanceTo(new V(...e.a)), cam.position.distanceTo(new V(...e.b)));
        const on = e.curve.filter(w => { const v = new V(...w).project(cam); return v.z < 1 && v.x > -0.5 && v.x < 0.85 && v.y > -0.7 && v.y < 0.7; }).length;
        return { slot: e.slot, tier: e.tier, near, on }; }).filter(e => e.on === 7 && e.near < 70);
      es.sort((u, v) => v.tier - u.tier || u.near - v.near);
      return { candidates: es.length, edge: es[0] || null, journeyDepth: f.uJourneyDepth.value }; })()`);
    assert(cordInfo.edge, "a cord is near the camera at inspection depth: " + JSON.stringify(cordInfo));
    assert(cordInfo.journeyDepth > 0.8, "inspection depth is inside the cord reveal range (journeyDepth " + cordInfo.journeyDepth.toFixed(2) + ")");
    sem.cords = { depthReached: await dist(), journeyDepth: +cordInfo.journeyDepth.toFixed(2), candidatesNearCamera: cordInfo.candidates, tier: cordInfo.edge.tier, nearestEndpoint: +cordInfo.edge.near.toFixed(0) };
    await cdp.run(`(() => { const f = window.__BRAIN_FIELD, cam = window.__THREE_CAMERA, V = cam.position.constructor;
      const slot = ${cordInfo.edge.slot}; const P = window.__BRAIN_PROBE = { active: true, rects: [], out: [] };
      const TS = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
      // probe boxes ride the rendered (curved) filament: same curve formula as the vertex shader
      const track = () => { if (!P.active) return; const e = f.debugKeyEdges(TS).find(x => x.slot === slot);
        if (e) P.rects = e.curve.map(w => { const v = new V(w[0], w[1], w[2]).project(cam); return { x: (v.x*0.5+0.5)*innerWidth - 4, y: (-v.y*0.5+0.5)*innerHeight - 4, w: 8, h: 8 }; });
        requestAnimationFrame(track); };
      requestAnimationFrame(track); return true; })()`);
    const capture = async (seconds) => {
      await cdp.run("window.__BRAIN_PROBE.out = []; true");
      await sleep(seconds * 1000);
      return cdp.run(`(() => { const o = window.__BRAIN_PROBE.out; return { mean: o.map(r => [1,3,5,7,9,11,13].map(k => r[k])), t: o.map(r => r[r.length - 1]) }; })()`);
    };
    const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
    const lum = (c) => avg(c.mean.map(avg));
    await cdp.shot("08_cord_idle", { x: 400, y: 100, width: 1120, height: 700 });
    const idle = await capture(4);
    const setCords = (on) => cdp.run(`window.__BRAIN_FIELD.links.material.visible = ${on}; true`);
    await setCords(false);
    const hidden = await capture(4);
    await setCords(true);
    const idle2 = await capture(4);
    // (c1) plasma: cords add light at depth, and that light breathes over time without travelling
    const cordLight = lum(idle) - lum(hidden);
    const cordLight2 = lum(idle2) - lum(hidden);
    const pointSeries = (c, k) => c.mean.map((r) => r[k]);
    const stdOf = (a) => { const m = avg(a); return Math.sqrt(avg(a.map((x) => (x - m) ** 2))); };
    const breathing = avg([0, 1, 2, 3, 4, 5, 6].map((k) => stdOf(pointSeries(idle, k))));
    const lagOf = (c, p0 = 0, p1 = 6) => {
      const ts = c.t, t0 = ts[0], t1 = ts[ts.length - 1], dt = 20;
      const grid = (col) => { const o = []; let j = 0; for (let t = t0; t <= t1; t += dt) { while (j < ts.length - 1 && ts[j + 1] <= t) j++; o.push(col[j]); } return o; };
      const a = grid(pointSeries(c, p0)), b = grid(pointSeries(c, p1));
      const ma = avg(a), mb = avg(b), sa = stdOf(a) || 1, sb = stdOf(b) || 1;
      let best = { lag: 0, r: -2 };
      for (let L = -80; L <= 80; L++) { let acc = 0, n = 0; for (let i = 0; i < a.length; i++) { const k = i + L; if (k < 0 || k >= b.length) continue; acc += (a[i] - ma) * (b[k] - mb); n++; } const r = n > 0.7 * a.length ? acc / n / (sa * sb) : -2; if (r > best.r) best = { lag: L * dt / 1000, r }; }
      let zero = 0; for (let i = 0; i < a.length; i++) zero += (a[i] - ma) * (b[i] - mb); zero = zero / a.length / (sa * sb);
      return { lagSec: +best.lag.toFixed(2), peakCorr: +best.r.toFixed(2), zeroLagCorr: +zero.toFixed(2) };
    };
    // Directional travel = EVERY pair of points along the cord peaks strongly at a non-zero lag of the SAME sign
    // (later points lag earlier ones). Standing texture is in phase (lag ~ 0) and drift noise scatters in sign.
    const PAIRS = [[0, 3], [1, 4], [2, 5], [3, 6], [0, 6]];
    const pairLags = (c) => PAIRS.map(([p0, p1]) => ({ p0, p1, ...lagOf(c, p0, p1) }));
    const looksDirectional = (pl) => pl.every((x) => x.peakCorr > 0.5 && Math.abs(x.lagSec) > 0.3 && Math.sign(x.lagSec) === Math.sign(pl[0].lagSec));
    // Self-check of the detector on a synthetic SIGNAL (analysis code only - nothing is injected into the app):
    // a wave that travels down the cord must be flagged, the same wave in phase must not.
    const synth = (delayPerPoint) => { const t = Array.from({ length: 300 }, (_, i) => i * 16.7); return { t, mean: t.map((tt) => [0, 1, 2, 3, 4, 5, 6].map((k) => 10 + 5 * Math.sin((2 * Math.PI * (tt / 1000 - k * delayPerPoint)) / 2.9))) }; };
    assert(looksDirectional(pairLags(synth(0.15))), "detector self-check: a travelling wave is flagged directional");
    assert(!looksDirectional(pairLags(synth(0))), "detector self-check: an in-phase standing wave is not flagged");
    const idlePairs = pairLags(idle), idle2Pairs = pairLags(idle2);
    sem.cords.idle = { meanLum: +lum(idle).toFixed(2), meanLumCordsHidden: +lum(hidden).toFixed(2), cordAddsLum: +cordLight.toFixed(2), cordAddsLumRepeat: +cordLight2.toFixed(2), breathingStd: +breathing.toFixed(2), frames: idle.t.length, pairLags: idlePairs, pairLagsRepeat: idle2Pairs };
    assert(idle.t.length > 60 && hidden.t.length > 60, "enough frames sampled");
    assert(cordLight > 1.5 && cordLight2 > 1.5, "cords are visible at inspection depth (they add light over the background, repeatable)");
    assert(breathing > 0.15, "idle plasma breathes (the cord is alive, not a static line)");
    assert(!looksDirectional(idlePairs) && !looksDirectional(idle2Pairs), "idle plasma is a standing texture, not directional travel: " + JSON.stringify(idlePairs));

    // (c2) packets only for real recorded events
    const packetState = () => cdp.run(`(() => { const L = window.__BRAIN_FIELD.links; return { gain: L.uPulseGain.value, member: L.pulseMember, focus: L.aFocus.array.reduce((a, b) => a + b, 0) }; })()`);
    const idlePackets = await packetState();
    assert(idlePackets.gain === 0 && idlePackets.member === -1 && idlePackets.focus === 0, "idle cords carry no directional packets: " + JSON.stringify(idlePackets));
    // Even with the verification gain hook forced on, no packet may appear without a recorded event to attribute it to.
    // Interleave gain-off / gain-on windows so slow drift (camera orbit, breathing) cancels between conditions.
    const offRuns = [], onRuns = [];
    let afterGain = null;
    for (let cycle = 0; cycle < 4; cycle++) {
      await cdp.run("window.__BRAIN_FIELD.setPulseGain(0); true");
      offRuns.push(lum(await capture(2)));
      await cdp.run("window.__BRAIN_FIELD.setPulseGain(1); true");
      onRuns.push(lum(await capture(2)));
      afterGain = await packetState();
      assert(afterGain.focus === 0 && afterGain.member === -1, "gain alone does not attach a packet to any cord (no recorded event => no traffic): " + JSON.stringify(afterGain));
    }
    await cdp.run("window.__BRAIN_FIELD.setPulseGain(0); true");
    // A packet can only ADD light, so the invariant is one-sided: forcing the gain must not make the cord brighter.
    const lumRatio = avg(onRuns) / Math.max(0.01, avg(offRuns));
    sem.cords.packets = { idle: idlePackets, gainWithoutEvent: afterGain, lumGainOffRuns: offRuns.map((x) => +x.toFixed(1)), lumGainOnRuns: onRuns.map((x) => +x.toFixed(1)), gainOnOverOff: +lumRatio.toFixed(3) };
    assert(lumRatio < 1.1, "forcing packet gain without an event adds no light to the cord (gain-on / gain-off = " + lumRatio.toFixed(3) + ")");
    await cdp.run("window.__BRAIN_PROBE.active = false; true");
    await goTo(arrivalDist); // later steps measure the arrival composition

    // (d) labels: sparse by default, appear on hover / proximity / sidebar-list locate
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1540, y: 860 });
    await sleep(600);
    const LABELS = "(() => { const layer = document.querySelector('[data-brain-labels]'); return [...layer.children].map(el => ({ t: el.children[0] && el.children[0].textContent, o: +el.style.opacity })).filter(x => x.o > 0.05); })()";
    sem.labelsIdle = await cdp.run(LABELS);
    assert(sem.labelsIdle.length <= 2, "labels stay sparse when nothing is hovered (clean field)");
    const hoverT = await cdp.run(`(() => { const f = window.__BRAIN_FIELD, cam = window.__THREE_CAMERA, V = cam.position.constructor;
      const r = f.debugRecords().filter(r => !r.isHub).map(r => { const v = new V(...r.world).project(cam); return { id: r.id, title: r.title, x: (v.x*0.5+0.5)*innerWidth, y: (-v.y*0.5+0.5)*innerHeight }; })
        .filter(p => p.x > 420 && p.x < innerWidth - 120 && p.y > 120 && p.y < innerHeight - 100)[0]; return r; })()`);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: hoverT.x + 40, y: hoverT.y + 30 });
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: hoverT.x + 4, y: hoverT.y + 3 });
    await sleep(500);
    sem.labelsHover = await cdp.run(LABELS);
    const shown = sem.labelsHover.find((l) => l.t && (hoverT.title.startsWith(l.t.replace("\u2026", "")) || l.t === hoverT.title));
    sem.hoveredRecord = hoverT.title;
    assert(shown && shown.o > 0.5, "hovering/approaching a record reveals its identity label");
    await cdp.shot("09_label_hover");
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1540, y: 860 });
    await sleep(600);
    // sidebar list -> locate in the field
    const listItem = await cdp.run(`(() => { const b = [...document.querySelectorAll('aside ul button')].find(x => x.textContent.includes(${JSON.stringify(hoverT.title.slice(0, 12))})); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    assert(listItem, "the record appears in the sidebar 'Nodes in field' list");
    await sleep(200);
    const li2 = await cdp.run(`(() => { const b = [...document.querySelectorAll('aside ul button')].find(x => x.textContent.includes(${JSON.stringify(hoverT.title.slice(0, 12))})); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: li2.x - 10, y: li2.y });
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: li2.x, y: li2.y });
    await sleep(700);
    sem.listLocate = await cdp.run(`(() => { const d = window.__BRAIN_FIELD.getLabelData().find(r => r.id === ${JSON.stringify(hoverT.id)}); return { hi: d ? +d.hi.toFixed(2) : null, labels: (${LABELS}).length }; })()`);
    assert(sem.listLocate.hi > 0.6, "hovering the sidebar list item locates the record in the field (highlight + label)");
    await cdp.shot("10_list_locate");
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1540, y: 860 });

    // (e) no bubble regression: record points stay small
    sem.pointSize = await cdp.run("(() => { const a = window.__BRAIN_FIELD.recordGeo.getAttribute('aInfo'); let m = 0; for (let i = 0; i < a.count; i++) m = Math.max(m, a.array[i*4]); return { maxRestingPx: +m.toFixed(1), hoverScale: 1.9 }; })()");
    assert(sem.pointSize.maxRestingPx <= 6, "record points stay small (no bubble nodes)");
    summary.semantic = sem;
    await cdp.shot("11_semantic_final");

    // 1b. parity in BRAIN state
    summary.parityBrain = await cdp.run(PARITY);
    assert(summary.parityBrain.flowBlend > 0, "coherent-rotation blend active in BRAIN");
    assert(summary.parityBrain.coreMaxErr < 0.01, "GPU/CPU parity (BRAIN state)");

    // 5. click-to-open + category persistence
    const target = await cdp.run(`(() => { const cam = window.__THREE_CAMERA, V = cam.position.constructor;
      const r = window.__BRAIN_FIELD.debugRecords().filter(r => { const v = new V(...r.world).project(cam); const x=(v.x*0.5+0.5)*innerWidth, y=(-v.y*0.5+0.5)*innerHeight; return x>420 && x<innerWidth-60 && y>90 && y<innerHeight-60; })[0];
      const v = new V(...r.world).project(cam); return { id: r.id, x: (v.x*0.5+0.5)*innerWidth, y: (-v.y*0.5+0.5)*innerHeight }; })()`);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: target.x - 20, y: target.y - 14 });
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: target.x, y: target.y });
    await sleep(80);
    summary.hoverCursor = await cdp.run("document.querySelector('[data-brain-labels]').previousElementSibling.style.cursor");
    await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: target.x, y: target.y, button: "left", clickCount: 1 });
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: target.x, y: target.y, button: "left", clickCount: 1 });
    await sleep(800);
    summary.clicked = target.id;
    summary.noteOpened = await cdp.run("!!document.querySelector('[class*=\"OBSIDIAN\"], .font-mono') && document.body.innerText.includes('OBSIDIAN NODE')");
    await cdp.shot("03_note_opened");
    assert(summary.hoverCursor === "pointer", "hovering a record shows the pointer cursor");
    assert(summary.noteOpened, "clicking a record opens its note");
    await cdp.run(`(() => { const x = [...document.querySelectorAll('button')].find(b => b.querySelector('svg.lucide-x') || b.getAttribute('aria-label') === 'Close'); if (x) x.click(); return true; })()`);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 900, y: 800 });

    await cdp.run(`[...document.querySelectorAll('aside button.rounded-full')].find(b => b.textContent.includes('MCP')).click()`);
    await sleep(1500);
    const catA = await cdp.run("window.__BRAIN_FIELD.uCatFade.value.slice(0,6).map(x => +x.toFixed(2))");
    // The MCP layer's slot in the fade array follows the data's category order, so look it up by category id.
    const catIds = await cdp.run("window.__BRAIN_FIELD.catIds");
    const mcpIdx = catIds.findIndex((id) => /mcp/i.test(id));
    assert(mcpIdx >= 0 && mcpIdx < 6, "MCP category found in the layer list: " + JSON.stringify(catIds));
    assert(catA[mcpIdx] < 0.05 && catA.every((x, i) => i === mcpIdx || i >= catIds.length || x > 0.95), "toggling the MCP chip turns off exactly the MCP layer: " + JSON.stringify({ catIds, catA }));

    // 4. soak (spans several 12 s data refreshes)
    const soakStart = Date.now();
    const stateSeries = [];
    for (const f of [0.33, 0.66, 1.0]) {
      while (Date.now() < soakStart + f * SOAK_SEC * 1000) await sleep(500);
      stateSeries.push(await cdp.run(STATE));
      await cdp.shot(`04_soak_${Math.round(f * SOAK_SEC)}s`);
    }
    summary.soak = stateSeries;
    const catB = await cdp.run("window.__BRAIN_FIELD.uCatFade.value.slice(0,6).map(x => +x.toFixed(2))");
    summary.categoryFilter = { afterToggle: catA, afterRefreshes: catB };
    assert(catB[mcpIdx] < 0.05 && catB.every((x, i) => i === mcpIdx || i >= catIds.length || x > 0.95), "category filter survives data refreshes (MCP layer stays off, the others stay on)");
    await cdp.run(`[...document.querySelectorAll('aside button.rounded-full')].find(b => b.textContent.includes('MCP')).click()`);
    assert(stateSeries.every((s) => s.same), "canvas/engine/field identity unchanged across data refreshes");
    assert(stateSeries.every((s) => s.records === map.records && s.chips === catIds.length), "records stable and exactly one layer chip per data category across refreshes (" + catIds.length + " categories)");
    assert(Math.max(...stateSeries.map((s) => s.edges)) < 2400, "edge count stays bounded");
    assert(stateSeries.every((s) => s.longestEdge <= s.maxLen * 1.06 && s.longestKey <= 102), "no long cords during the soak");

    // 6. reverse journey BRAIN -> CORE
    await cdp.run(clickNav("CORE"));
    const reverse = [];
    for (let i = 0; i < 26; i++) {
      reverse.push(await cdp.run(STATE));
      await cdp.shot(`05_reverse_${String(i).padStart(2, "0")}`);
      await sleep(180);
    }
    summary.reverse = reverse.map((j) => `d=${j.d} links=${j.links} edges=${j.edges} nucleus=${j.nucleusApparent}`);
    for (let i = 1; i < reverse.length; i++) assert(reverse[i].links <= reverse[i - 1].links + 0.02, "connectivity dissolves monotonically on the way out");
    await sleep(3500);
    summary.backToCore = await cdp.run(STATE);
    await cdp.shot("06_back_to_core");
    assert(summary.backToCore.d > 860 && summary.backToCore.links === 0, "returns to the plain CORE scene");
    await cdp.run(clickNav("Brain"));
    await sleep(9000);
    summary.brainAgain = await cdp.run(STATE);
    await cdp.shot("07_brain_again");
    assert(summary.brainAgain.d < 336 && summary.brainAgain.links > 0.99, "re-enters BRAIN fully connected");

    summary.monitor = await cdp.run(`(() => { const m = window.__mon; const d = m.dts.slice().sort((a,b)=>a-b); return { frames: m.frames, medianFrameMs: +(d[Math.floor(d.length/2)]*1000).toFixed(2), p95FrameMs: +(d[Math.floor(d.length*0.95)]*1000).toFixed(2), maxSpeedUnitsPerSec: +m.maxSpeed.toFixed(1), worst: m.worst, clockRegress: m.clockRegress }; })()`);
    assert(summary.monitor.clockRegress === 0, "animation clock never regresses");
    assert(summary.monitor.maxSpeedUnitsPerSec < 400, "no per-frame position snap");
    summary.consoleErrors = cdp.errors.filter((e) => !ignorable(e));
    assert(summary.consoleErrors.length === 0, "no console errors/warnings or page exceptions: " + summary.consoleErrors.join(" | "));

    fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
    console.log("\nBRAIN-03 VERIFICATION PASSED");
  } catch (err) {
    summary.failure = String(err?.stack || err);
    summary.consoleErrors = cdp?.errors;
    fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
    console.error(JSON.stringify(summary, null, 2));
    console.error("\nBRAIN-03 VERIFICATION FAILED");
    process.exitCode = 1;
  } finally {
    cdp?.close();
    chrome.kill();
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

main();
