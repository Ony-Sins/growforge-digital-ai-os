/**
 * Automated Verification Script for FLOATING COMMAND SPINE Header Micro-Detail Polish
 * Uses Chrome DevTools Protocol to capture desktop (CORE, Missions, Brain, Systems, Settings, Assistant)
 * and close-up header spine screenshots, plus mobile (390x844).
 */

import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { WebSocket } from "ws";

const PORT = 9229;
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACTS_DIR = "C:\\Users\\USERAS\\.gemini\\antigravity-ide\\brain\\e9f900bb-6eb8-40e3-a417-95e2f97d18fa";

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
    const res = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res.result?.value;
  }

  async captureScreenshot(filename, clip = null) {
    const params = { format: "png" };
    if (clip) params.clip = clip;
    const res = await this.send("Page.captureScreenshot", params);
    const buffer = Buffer.from(res.data, "base64");
    const filePath = path.join(ARTIFACTS_DIR, filename);
    fs.writeFileSync(filePath, buffer);
    console.log(`[CDP] Screenshot saved: ${filename} (${buffer.length} bytes)`);
    return filePath;
  }

  close() {
    this.ws.close();
  }
}

async function run() {
  console.log("[Test] Launching Chrome for Floating Command Spine Header Verification...");
  const chromeProcess = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${PORT}`,
      "--headless=new",
      "--disable-gpu-watchdog",
      "--disable-features=CalculateNativeWinOcclusion",
      "--window-size=1920,1080",
      "--user-data-dir=" + path.join(ARTIFACTS_DIR, "scratch", "chrome_temp_header_micro"),
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
      } catch {}
    }

    if (!wsUrl) throw new Error("Failed to find Chrome WebSocket debugger target");

    cdp = new CDPClient(wsUrl);
    await cdp.connect();
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      mobile: false,
    });

    console.log("[Test] Connected to Chrome. Waiting 3s for WebGL scene initialization...");
    await sleep(3000);

    // 1. Capture CORE screen with refined Floating Command Spine
    await cdp.captureScreenshot("header_floating_core.png");

    // Close-up of the header spine at top of CORE
    await cdp.captureScreenshot("header_spine_closeup.png", {
      x: 0,
      y: 0,
      width: 1920,
      height: 140,
      scale: 1,
    });

    // Capture signal pulse in motion (2 seconds later)
    await sleep(2200);
    await cdp.captureScreenshot("header_spine_pulse_transit.png", {
      x: 0,
      y: 0,
      width: 1920,
      height: 140,
      scale: 1,
    });

    // 2. Click Missions navigation button
    console.log("[Test] Navigating to Missions...");
    await cdp.eval(`
      (() => {
        const btns = Array.from(document.querySelectorAll('header nav button'));
        const missionsBtn = btns.find(b => b.textContent && b.textContent.includes('Missions'));
        if (missionsBtn) missionsBtn.click();
      })()
    `);
    await sleep(1500);
    await cdp.captureScreenshot("header_floating_missions.png");

    // 3. Click Brain navigation button
    console.log("[Test] Navigating to Brain...");
    await cdp.eval(`
      (() => {
        const btns = Array.from(document.querySelectorAll('header nav button'));
        const brainBtn = btns.find(b => b.textContent && b.textContent.includes('Brain'));
        if (brainBtn) brainBtn.click();
      })()
    `);
    await sleep(1500);
    await cdp.captureScreenshot("header_floating_brain.png");

    // 4. Click Systems navigation button
    console.log("[Test] Testing Systems navigation button...");
    await cdp.eval(`
      (() => {
        const btns = Array.from(document.querySelectorAll('header nav button'));
        const systemsBtn = btns.find(b => b.textContent && b.textContent.includes('Systems'));
        if (systemsBtn) systemsBtn.click();
      })()
    `);
    await sleep(1500);
    await cdp.captureScreenshot("header_floating_systems.png");

    // Close Settings / Systems modal
    console.log("[Test] Closing Settings overlay...");
    await cdp.eval(`
      (() => {
        const closeBtn = document.querySelector('button[aria-label="Close Settings"]') || document.querySelector('button[aria-label="Close settings"]') || document.querySelector('div.fixed.inset-0.z-50 button');
        if (closeBtn) closeBtn.click();
        else window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      })()
    `);
    await sleep(1000);

    // 5. Return to CORE
    console.log("[Test] Returning to CORE...");
    await cdp.eval(`
      (() => {
        const brandBtn = document.querySelector('header button[aria-label="GrowForge CORE home"]');
        if (brandBtn) brandBtn.click();
      })()
    `);
    await sleep(1000);

    // 6. Test Settings button in Right Pod
    console.log("[Test] Testing Settings icon button in Right Pod...");
    await cdp.eval(`
      (() => {
        const settingsBtn = document.querySelector('header button[aria-label="Settings"]');
        if (settingsBtn) settingsBtn.click();
      })()
    `);
    await sleep(1500);
    await cdp.captureScreenshot("header_floating_settings.png");

    // Close settings overlay
    console.log("[Test] Closing Settings overlay...");
    await cdp.eval(`
      (() => {
        const closeBtn = document.querySelector('button[aria-label="Close Settings"]') || document.querySelector('button[aria-label="Close settings"]') || document.querySelector('div.fixed.inset-0.z-50 button');
        if (closeBtn) closeBtn.click();
        else window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      })()
    `);
    await sleep(1000);

    // 7. Test Assistant button in Right Pod
    console.log("[Test] Testing Assistant button in Right Pod...");
    await cdp.eval(`
      (() => {
        const assistantBtn = Array.from(document.querySelectorAll('header button')).find(b => b.textContent && b.textContent.includes('Assistant'));
        if (assistantBtn) assistantBtn.click();
      })()
    `);
    await sleep(1500);
    await cdp.captureScreenshot("header_floating_assistant.png");

    // Close assistant drawer
    console.log("[Test] Closing Assistant drawer...");
    await cdp.eval(`
      (() => {
        const closeBtn = document.querySelector('button[aria-label="Close Assistant"]') || document.querySelector('button[aria-label="Close chat"]') || document.querySelector('aside button');
        if (closeBtn) closeBtn.click();
        else window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      })()
    `);
    await sleep(1000);

    // 8. Mobile Viewport (390 x 844)
    console.log("[Test] Testing mobile responsive header (390 x 844)...");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await sleep(1500);
    await cdp.captureScreenshot("header_floating_mobile.png");

    console.log("\n========================================");
    console.log("[Test] FLOATING COMMAND SPINE HEADER VERIFICATION COMPLETE!");
    console.log("========================================\n");

  } catch (err) {
    console.error("[Test] Error during verification:", err);
  } finally {
    if (cdp) cdp.close();
    chromeProcess.kill();
  }
}

run();
