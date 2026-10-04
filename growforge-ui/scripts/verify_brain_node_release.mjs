/** Regression for BRAIN node hold/release. Requires the local app on :3000 and Chrome. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "ws";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "gf-node-release-"));
const chrome = spawn(process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", [
  "--remote-debugging-port=9298", "--headless=new", "--window-size=1600,900",
  "--enable-unsafe-swiftshader", `--user-data-dir=${profile}`, "about:blank",
], { stdio: "ignore" });
let socket;
let nextId = 1;
const pending = new Map();
try {
  let url;
  for (let i = 0; i < 40 && !url; i++) {
    await sleep(400);
    try { url = (await (await fetch("http://127.0.0.1:9298/json")).json()).find((tab) => tab.type === "page")?.webSocketDebuggerUrl; } catch { /* Chrome starting */ }
  }
  assert(url, "Chrome debugging endpoint started");
  socket = new WebSocket(url);
  socket.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    const task = pending.get(message.id);
    if (!task) return;
    pending.delete(message.id);
    if (message.error) task.reject(new Error(JSON.stringify(message.error)));
    else task.resolve(message.result);
  });
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const run = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  };
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: "http://localhost:3000" });
  let ready = false;
  for (let i = 0; i < 160 && !ready; i++) {
    ready = await run("!!(window.__BRAIN_FIELD?.debugInfo().realRecords > 0 && window.__THREE_CAMERA && document.querySelector('[data-brain-labels]'))").catch(() => false);
    if (!ready) await sleep(500);
  }
  assert(ready, "local BRAIN records loaded");
  await run("[...document.querySelectorAll('nav[aria-label=\"Primary navigation\"] button')].find(b => b.textContent.trim().startsWith('Explore')).click()");
  await sleep(9500);
  for (let i = 0; i < 12; i++) {
    await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 1560, y: 880, deltaX: 0, deltaY: -120 });
    await sleep(120);
    if (await run("window.__THREE_CAMERA.position.distanceTo(window.__THREE_CONTROLS.target) < 280")) break;
  }
  await sleep(1800);


  // Real mouse input against a real record label.
  const info = await run(`(() => {
    const labels = [...document.querySelector('[data-brain-labels]').children];
    const field = window.__BRAIN_FIELD;
    const el = labels.find(e => +e.style.opacity >= .3 && e.getBoundingClientRect().width > 0);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    const title = el.firstElementChild.textContent;
    const rec = field.getLabelData().find(r => (r.title.length>30 ? r.title.slice(0,29)+'…' : r.title) === title);
    return { x: b.left + Math.min(24, b.width/2), y: b.top + b.height/2, id: rec.id };
  })()`);
  assert(info, "a pickable record label exists");
  const mouse = (type, x, y) => send("Input.dispatchMouseEvent", { type, x, y, button: type === "mouseMoved" ? "none" : "left", clickCount: 1, buttons: type === "mousePressed" ? 1 : 0 });
  // labels drift, so re-read the anchor right before each gesture
  const anchor = () => run(`(() => { const s = window.__BRAIN_FIELD.slots.get(${JSON.stringify(info.id)});
    const v = s.world.clone().project(window.__THREE_CAMERA); const c = document.querySelector('[data-brain-labels]').getBoundingClientRect();
    return { x: c.left + (v.x + 1) / 2 * c.width, y: c.top + (1 - v.y) / 2 * c.height }; })()`);
  let p = await anchor();
  await mouse("mouseMoved", p.x - 30, p.y);
  await mouse("mouseMoved", p.x, p.y);
  await sleep(700);
  const startSlots = await run(`(() => { const f = window.__BRAIN_FIELD; const s = f.slots.get(${JSON.stringify(info.id)}); const out = []; const L = f.links; for (let i = 0; i < L.slotState.length; i++) if (L.slotState[i] === 1 && (L.slotA[i] === s.member || L.slotB[i] === s.member)) out.push(i); return out; })()`);
  const startEdges = startSlots.length;
  const hovered = await run(`window.__BRAIN_FIELD.debugInfo().hovered`);
  assert.equal(hovered, info.id, "pointer hovers the record");

  const probe = `(() => { const f = window.__BRAIN_FIELD; const id = ${JSON.stringify(info.id)}; const s = f.slots.get(id);
    let edges = 0; const slots = []; const L = f.links; for (let i = 0; i < L.slotState.length; i++) if (L.slotState[i] === 1 && (L.slotA[i] === s.member || L.slotB[i] === s.member)) { edges++; slots.push(i); }
    const w = f.recordGeo.getAttribute('aPin').array[s.row*4+3];
    return { w: [s.world.x, s.world.y, s.world.z], off: s.offset.length(), glow: w, edges, slots, card: !!document.querySelector('[data-brain-inspection] h2') }; })()`;

  // 1. frozen while held
  const held0 = await run(probe);
  // HOLD_MS > 0 stretches the cords: neighbours keep drifting while this record stays frozen.
  await sleep(500 + Number(process.env.HOLD_MS || 0));
  const held1 = await run(probe);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  assert(dist(held0.w, held1.w) < 0.01, "record is frozen while hovered/held (moved " + dist(held0.w, held1.w) + ")");

  // 2. click, then release: sample every frame for 5s (the camera may have drifted during a long hold)
  // Aim at the dot, nudging around it until the hit test resolves to THIS record (another record's
  // name plate can overlap the dot after the camera has drifted).
  const hoveredNow = () => run(`window.__BRAIN_FIELD.debugInfo().hovered`);
  let aimed = false;
  for (const [dx, dy] of [[0, 0], [0, 6], [0, -6], [6, 0], [-6, 0], [8, 8], [-8, -8], [8, -8], [-8, 8]]) {
    p = await anchor();
    await mouse("mouseMoved", p.x + dx, p.y + dy);
    await sleep(60);
    if ((await hoveredNow()) === info.id) { p = { x: p.x + dx, y: p.y + dy }; aimed = true; break; }
  }
  assert(aimed, "pointer is on the record before the press");
  const held2 = await run(probe);
  // Trace every frame in the page, starting BEFORE the release, so the release moment itself is measured.
  await run(`(() => { const out = window.__releaseTrace = []; const t0 = performance.now(); const probe = () => ${probe};
    const tick = () => { const r = probe(); r.t = performance.now() - t0; r.released = !!window.__released; out.push(r); if (r.t < 6000) requestAnimationFrame(tick); else window.__releaseDone = true; };
    window.__released = false; window.__releaseDone = false; requestAnimationFrame(tick); })()`);
  await mouse("mousePressed", p.x, p.y);
  await sleep(120);
  await run("window.__released = true");
  await mouse("mouseReleased", p.x, p.y);
  while (!(await run("window.__releaseDone"))) await sleep(200);
  const all = await run("window.__releaseTrace");
  const before = all.filter((r) => !r.released);
  const trace = all.filter((r) => r.released);
  const frozenAt = before.at(-1).w;
  const frozenBefore = before.length > 5 ? dist(before[0].w, before.at(-1).w) : 0;
  assert(frozenBefore < 0.01, "record stays frozen while pressed (" + frozenBefore + ")");
  const selectedPhase = trace.filter((r) => r.t - trace[0].t > 300);
  assert(selectedPhase.length > 10 && selectedPhase[0].card, "info card opened by the click");
  const selDrift = Math.max(...trace.map((r) => dist(r.w, frozenAt)));
  assert(selDrift < 0.01, "clicked record stays frozen while selected (drifted " + selDrift.toFixed(3) + ")");
  assert(selectedPhase.every((r) => r.card && r.glow === 2), "card and selected glow stay on while selected");

  // 3. pointer leaves: still frozen + selected
  await mouse("mouseMoved", 5, 450);
  await sleep(1500);
  const away = await run(probe);
  assert(away.card && away.glow === 2 && dist(away.w, frozenAt) < 0.01, "selection and freeze survive the pointer leaving");

  // 4. click empty space: card closes, record glides back from exactly the frozen spot, cords stay
  await run(`(() => { const out = window.__releaseTrace = []; const t0 = performance.now(); const probe = () => ${probe};
    const tick = () => { const r = probe(); r.t = performance.now() - t0; out.push(r); if (r.t < 5000) requestAnimationFrame(tick); else window.__releaseDone = true; };
    window.__releaseDone = false; requestAnimationFrame(tick); })()`);
  await mouse("mousePressed", 5, 450);
  await mouse("mouseReleased", 5, 450);
  while (!(await run("window.__releaseDone"))) await sleep(200);
  const glide = await run("window.__releaseTrace");
  let maxStep = 0;
  for (let i = 1; i < glide.length; i++) maxStep = Math.max(maxStep, dist(glide[i].w, glide[i - 1].w) / Math.max(1, (glide[i].t - glide[i - 1].t) / 16.7));
  assert(dist(glide[0].w, frozenAt) < 0.5, "glide starts at the frozen position");
  assert(maxStep < 1.2, "no jump during the glide (max " + maxStep.toFixed(3) + "/frame)");
  const moved = dist(glide.at(-1).w, frozenAt);
  assert(moved > 3, "record resumed floating (moved " + moved.toFixed(2) + ")");
  assert(!glide.at(-1).card && glide.at(-1).glow !== 2, "empty click closes card and glow");
  const gliding = glide.filter((r) => r.off > 0.05);
  assert(gliding.length > 20, "record glided back rather than snapping");
  assert(gliding.every((r) => startSlots.every((sl) => r.slots.includes(sl))), "no original cord disconnected during the glide");
  console.log(JSON.stringify({ frozenWhileSelected: selDrift, glideMaxStepPerFrame: maxStep, movedAfterRelease: moved, glideFrames: gliding.length, passed: true }));
} finally {
  socket?.close();
  chrome.kill();
  await sleep(300);
  try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Chrome may still hold its profile on Windows. */ }
}
