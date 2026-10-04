/** Regression for BRAIN-04A press latching. Requires the local app on :3000 and Chrome. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "ws";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "gf-drag-selection-"));
const chrome = spawn(process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", [
  "--remote-debugging-port=9297", "--headless=new", "--window-size=1600,900",
  "--enable-unsafe-swiftshader", `--user-data-dir=${profile}`, "about:blank",
], { stdio: "ignore" });
let socket;
let nextId = 1;
const pending = new Map();
try {
  let url;
  for (let i = 0; i < 40 && !url; i++) {
    await sleep(400);
    try { url = (await (await fetch("http://127.0.0.1:9297/json")).json()).find((tab) => tab.type === "page")?.webSocketDebuggerUrl; } catch { /* Chrome starting */ }
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

  // Dispatch the actual pointerdown/click DOM events against the canvas container. This avoids
  // camera orbit during the controlled gestures while exercising its production listeners.
  const cases = await run(`(async () => {
    const container = document.querySelector('[data-brain-labels]').previousElementSibling;
    const field = window.__BRAIN_FIELD;
    const labels = [...document.querySelector('[data-brain-labels]').children];
    const records = field.getLabelData();
    const titleFor = (el) => el.firstElementChild.textContent;
    const pointFor = (el) => { const b=el.getBoundingClientRect(); return {x:b.left+Math.min(24,b.width/2),y:b.top+b.height/2}; };
    const down = (at) => container.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:at.x,clientY:at.y,pointerId:1,pointerType:'mouse',button:0}));
    const up = (at,detail=1) => container.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:at.x,clientY:at.y,detail}));
    const click = (start, end, withPress=true, detail=1) => { if (withPress) down(start); up(end,detail); };
    const selected = () => document.querySelector('[data-brain-inspection] h2')?.textContent || null;
    const close = () => document.querySelector('[aria-label="Close record inspection"]')?.click();
    const settled = () => new Promise(resolve => setTimeout(resolve, 60));
    // Exercise an exposed label, not one clipped behind the sidebar or viewport.
    const target = labels.find(el => { const b=el.getBoundingClientRect();
      return +el.style.opacity >= .18 && b.width > 0 && b.left > 380 && b.top > 90
        && b.right < innerWidth-20 && b.bottom < innerHeight-160; });
    if (!target) return {error:'no pickable label',interactive:field.debugInfo(),visibility:document.querySelector('[data-brain-labels]').style.visibility,opacities:labels.map(e=>e.style.opacity).slice(0,5),distance:window.__THREE_CAMERA.position.distanceTo(window.__THREE_CONTROLS.target)};
    const p=pointFor(target), title=records.find(r => (r.title.length>30 ? r.title.slice(0,29)+'…' : r.title) === titleFor(target))?.title, empty={x:2,y:2};
    const result={target:title,total:records.length};
    click(empty,p); await settled(); result.emptyToNode=selected(); close(); await settled();
    click(p,empty); await settled(); result.nodeToEmpty=selected(); close(); await settled();
    click({x:p.x-6,y:p.y},p); await settled(); result.nodeToNode=selected(); close(); await settled();
    click(empty,p,false,0); await settled(); result.synthetic=selected(); close(); await settled();
    click(p,p); await settled(); result.normal=selected(); close(); await settled();
    down(p); await new Promise(resolve => setTimeout(resolve, 250)); up(p);
    await settled(); result.movingTarget=selected(); close(); await settled();
    // Read each plate's current position immediately before clicking it so ambient motion
    // does not make the test depend on stale coordinates.
    result.records=[];
    for (const rec of records) {
      const el=labels.find(e => titleFor(e) === (rec.title.length>30 ? rec.title.slice(0,29)+'…' : rec.title));
      if (!el || +el.style.opacity < .18) { result.records.push({id:rec.id,skip:'not pickable'}); continue; }
      const q=pointFor(el);
      click(q,q);
      await settled();
      result.records.push({id:rec.id,expected:rec.title,selected:selected(),canonical:rec.node.id});
      close(); await settled();
    }
    return result;
  })()`);
  assert(!cases.error, JSON.stringify(cases));
  assert.equal(cases.emptyToNode, null, "empty to node drag must not select");
  assert.equal(cases.nodeToEmpty, null, "node to empty drag must not select");
  assert.equal(cases.nodeToNode, null, "node to node drag must not select");
  assert.equal(cases.synthetic, cases.target, "synthetic click resolves release target");
  assert.equal(cases.normal, cases.target, "normal click preserves press target");
  assert.equal(cases.movingTarget, cases.target, "moving target click preserves pointerdown record");
  assert.equal(cases.records.length, cases.total);
  assert(cases.records.every((r) => !r.skip && r.id === r.canonical && r.selected === r.expected), "every record opens its canonical target");
  console.log(JSON.stringify({ dragCases: 3, clickCases: 3, canonicalRecords: cases.records.length, passed: true }));
} finally {
  socket?.close();
  chrome.kill();
  await sleep(300);
  try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Chrome may still hold its profile on Windows. */ }
}
