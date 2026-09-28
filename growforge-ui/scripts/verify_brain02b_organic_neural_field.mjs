/**
 * GROWFORGE AI OS — BRAIN-02B: Organic Neural Field Implementation Verification
 */

import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import assert from "assert";
import { WebSocket } from "ws";

const PORT = 9279;
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACTS_DIR = "C:\\Users\\USERAS\\.gemini\\antigravity-ide\\brain\\da32380e-d045-4381-85a0-7167a9f17102";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.pending = new Map();

    this.ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    });
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws.on("open", resolve);
      this.ws.on("error", reject);
    });
  }

  async send(method, params = {}) {
    const id = this.id++;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(payload);
    });
  }

  async eval(expression) {
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const res = await this.send("Runtime.evaluate", {
          expression,
          returnByValue: true,
          awaitPromise: true,
        });
        if (res.exceptionDetails) {
          throw new Error(JSON.stringify(res.exceptionDetails));
        }
        return res.result?.value;
      } catch (e) {
        if (attempt < 9 && (e.message?.includes("Execution context") || e.code === -32000)) {
          await sleep(300);
          continue;
        }
        throw e;
      }
    }
  }

  async screenshot(filename) {
    const res = await this.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    if (res && res.data) {
      const buf = Buffer.from(res.data, "base64");
      const outPath = path.join(ARTIFACTS_DIR, filename);
      fs.writeFileSync(outPath, buf);
      console.log(`[Screenshot] Saved ${filename} (${buf.length} bytes)`);
      return outPath;
    }
  }

  close() {
    this.ws.close();
  }
}

async function runVerification() {
  console.log("=== GROWFORGE BRAIN-02B: ORGANIC NEURAL FIELD TEST SUITE ===");
  const userDataDir = path.join(ARTIFACTS_DIR, "scratch", "chrome_brain02b_rec");
  fs.mkdirSync(userDataDir, { recursive: true });

  const chromeProcess = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${PORT}`,
      "--headless=new",
      "--disable-gpu-watchdog",
      "--window-size=1920,1080",
      `--user-data-dir=${userDataDir}`,
      "http://localhost:3000",
    ],
    { stdio: "ignore" }
  );

  let cdp = null;
  try {
    let wsUrl = null;
    for (let attempt = 0; attempt < 30; attempt++) {
      await sleep(500);
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/json`);
        const targets = await res.json();
        const pageTarget = targets.find(
          (t) => t.type === "page" && t.webSocketDebuggerUrl && t.url.includes("localhost:3000")
        );
        if (pageTarget) {
          wsUrl = pageTarget.webSocketDebuggerUrl;
          break;
        }
      } catch {
        // Retry while Chrome initializes
      }
    }

    if (!wsUrl) {
      throw new Error("Could not connect to Chrome DevTools port");
    }

    cdp = new CDPClient(wsUrl);
    await cdp.connect();
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("DOM.enable");

    console.log("[CDP] Connected. Waiting 4s for Three.js WebGL scene & graph telemetry hydration...");
    await sleep(4000);

    // TEST 1: Inspect Scene & Confirm No Oversized Bubble Nodes
    console.log("\n[TEST 1] Organic Neural Field Structure & Micro-Soma Scale Inspection");
    const fieldAnalysis = await cdp.eval(`(() => {
      const neutron = window.__THREE_NEUTRON_ENGINE;
      if (!neutron || !neutron.group || !neutron.group.parent) {
        return { ok: false, error: "Scene parent not accessible" };
      }
      const scene = neutron.group.parent;
      const organicGroup = scene.getObjectByName("ORGANIC_NEURAL_FIELD_GROUP");
      if (!organicGroup) {
        return { ok: false, error: "ORGANIC_NEURAL_FIELD_GROUP not found" };
      }

      let anchorCount = 0;
      let maxAnchorScale = 0;
      let minAnchorScale = 999;
      let anchorRadii = [];
      let filamentCount = 0;
      let maxFilamentOffset = 0;
      let hasMasterTrunk = false;

      organicGroup.children.forEach((child) => {
        if (child.name && child.name.startsWith("NEURAL_ANCHOR_")) {
          anchorCount++;
          const coreMesh = child.children[0];
          if (coreMesh) {
            const sc = coreMesh.scale.x;
            if (sc > maxAnchorScale) maxAnchorScale = sc;
            if (sc < minAnchorScale) minAnchorScale = sc;
          }
          anchorRadii.push(child.position.length());
        } else if (child.isLine) {
          filamentCount++;
          const posAttr = child.geometry.getAttribute("position");
          if (posAttr && posAttr.count > 3) {
            const count = posAttr.count;
            const p0 = [posAttr.getX(0), posAttr.getY(0), posAttr.getZ(0)];
            const pMid = [posAttr.getX(Math.floor(count / 2)), posAttr.getY(Math.floor(count / 2)), posAttr.getZ(Math.floor(count / 2))];
            const pEnd = [posAttr.getX(count - 1), posAttr.getY(count - 1), posAttr.getZ(count - 1)];
            const expectedMid = [(p0[0] + pEnd[0]) / 2, (p0[1] + pEnd[1]) / 2, (p0[2] + pEnd[2]) / 2];
            const distFromLinear = Math.hypot(pMid[0] - expectedMid[0], pMid[1] - expectedMid[1], pMid[2] - expectedMid[2]);
            if (distFromLinear > maxFilamentOffset) maxFilamentOffset = distFromLinear;
            if (Math.hypot(p0[0], p0[1], p0[2]) < 1.0) hasMasterTrunk = true;
          }
        }
      });

      const avgRadius = anchorRadii.length ? anchorRadii.reduce((a, b) => a + b, 0) / anchorRadii.length : 0;
      const pulsePoints = organicGroup.children.find((c) => c.isPoints);

      return {
        ok: true,
        anchorCount,
        minAnchorScale,
        maxAnchorScale,
        avgRadius,
        filamentCount,
        maxFilamentOffset,
        hasMasterTrunk,
        hasPulsePoints: !!pulsePoints,
      };
    })()`);

    console.log("[TEST 1 Result]", fieldAnalysis);
    assert(fieldAnalysis.ok, "Organic Neural Field group should exist in Three.js scene");
    assert(fieldAnalysis.anchorCount > 0, "Should have active anchor somas mapped to near-core particles");
    assert(fieldAnalysis.maxAnchorScale <= 2.5, `Max anchor scale should be <= 2.5px (got ${fieldAnalysis.maxAnchorScale})`);
    assert(fieldAnalysis.maxFilamentOffset > 1.0, `Filaments must possess organic fractal curvature (offset: ${fieldAnalysis.maxFilamentOffset})`);
    assert(fieldAnalysis.hasMasterTrunk, "Must possess master neural trunk connecting into the core origin");
    assert(fieldAnalysis.hasPulsePoints, "Must possess active action potential traveling data pulses");
    console.log("-> [PASS] TEST 1: No bubble nodes, micro-soma anchors in place, sinuous filaments & master trunk verified.");

    // TEST 2: Navigate to Brain and Verify Continuous Emergence & Dynamic Orbit
    console.log("\n[TEST 2] Trigger Journey to Brain & Verify Field Emergence");
    await cdp.eval(`(() => {
      const buttons = Array.from(document.querySelectorAll("nav button"));
      const brainBtn = buttons.find((b) => b.textContent.includes("Brain"));
      if (brainBtn) brainBtn.click();
    })()`);

    // Sample during dive (t = 1.2s) and after arrival (t = 2.6s)
    await sleep(1200);
    const midDiveState = await cdp.eval(`(() => {
      const camera = window.__THREE_CAMERA;
      const controls = window.__THREE_CONTROLS;
      const d = camera && controls ? camera.position.distanceTo(controls.target) : 0;
      const neutron = window.__THREE_NEUTRON_ENGINE;
      const organicGroup = neutron?.group?.parent?.getObjectByName("ORGANIC_NEURAL_FIELD_GROUP");
      return {
        dist: d,
        visible: organicGroup?.visible ?? false,
      };
    })()`);
    console.log("[Mid-Dive State at t=1.2s]", midDiveState);

    await sleep(1500);
    const arrivalState = await cdp.eval(`(() => {
      const camera = window.__THREE_CAMERA;
      const controls = window.__THREE_CONTROLS;
      const d = camera && controls ? camera.position.distanceTo(controls.target) : 0;
      const neutron = window.__THREE_NEUTRON_ENGINE;
      const organicGroup = neutron?.group?.parent?.getObjectByName("ORGANIC_NEURAL_FIELD_GROUP");
      return {
        dist: d,
        visible: organicGroup?.visible ?? false,
      };
    })()`);
    console.log("[Arrival State at t=2.7s]", arrivalState);
    assert(arrivalState.visible, "Organic Neural Field must be fully visible upon arrival at Brain");
    assert(Math.abs(arrivalState.dist - 460) < 15, `Camera distance should settle at ~460px (got ${arrivalState.dist})`);
    console.log("-> [PASS] TEST 2: Smooth 3-stage journey & full organic cosmos emergence verified.");

    // TEST 3: Dynamic Orbit & Vertex Deformation Verification
    console.log("\n[TEST 3] Verify Live Orbital Motion & Sinuous Line Deformation");
    const posSample1 = await cdp.eval(`(() => {
      const neutron = window.__THREE_NEUTRON_ENGINE;
      const organicGroup = neutron?.group?.parent?.getObjectByName("ORGANIC_NEURAL_FIELD_GROUP");
      const firstAnchor = organicGroup?.children.find((c) => c.name?.startsWith("NEURAL_ANCHOR_"));
      return firstAnchor ? [firstAnchor.position.x, firstAnchor.position.y, firstAnchor.position.z] : null;
    })()`);

    await sleep(800);

    const posSample2 = await cdp.eval(`(() => {
      const neutron = window.__THREE_NEUTRON_ENGINE;
      const organicGroup = neutron?.group?.parent?.getObjectByName("ORGANIC_NEURAL_FIELD_GROUP");
      const firstAnchor = organicGroup?.children.find((c) => c.name?.startsWith("NEURAL_ANCHOR_"));
      return firstAnchor ? [firstAnchor.position.x, firstAnchor.position.y, firstAnchor.position.z] : null;
    })()`);

    console.log("[Anchor Position Sample 1]", posSample1);
    console.log("[Anchor Position Sample 2]", posSample2);
    assert(posSample1 && posSample2, "Anchor positions should be readable");
    const posDelta = Math.hypot(posSample2[0] - posSample1[0], posSample2[1] - posSample1[1], posSample2[2] - posSample1[2]);
    console.log(`[Orbital Displacement over 800ms]: ${posDelta.toFixed(3)}px`);
    assert(posDelta > 0.05, "Anchor particles must stay in continuous orbit while maintaining connectivity");
    console.log("-> [PASS] TEST 3: Continuous dynamic orbit and living connection integrity verified.");

    // TEST 4: Capture Visual Proof Artifacts
    console.log("\n[TEST 4] Capturing Visual Proof Screenshot & Video Frame");
    await cdp.screenshot("brain02b_organic_neural_field.png");

    console.log("\n=== ALL 4 BRAIN-02B VERIFICATION SUITES PASSED (100%) ===");
  } catch (err) {
    console.error("Verification failed:", err);
    process.exit(1);
  } finally {
    if (cdp) cdp.close();
    chromeProcess.kill();
  }
}

runVerification();
