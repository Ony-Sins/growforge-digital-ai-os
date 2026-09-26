/**
 * Automated Verification Script for TASK S7: RESTORE PREMIUM MICRO-GLOW FEEDBACK
 * Captures all 7 required states:
 * 1. Side instruments at rest
 * 2. Missions hovered
 * 3. Systems hovered
 * 4. Approvals hovered
 * 5. Active CORE navigation button at rest
 * 6. Active CORE navigation button hovered
 * 7. Active Missions navigation button hovered
 */

import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { WebSocket } from "ws";

const PORT = 9231;
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
  console.log("[Test] Launching Chrome for Micro-Glow Verification...");
  const chromeProcess = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${PORT}`,
      "--headless=new",
      "--disable-gpu-watchdog",
      "--window-size=1920,1080",
      "--user-data-dir=" + path.join(ARTIFACTS_DIR, "scratch", "chrome_temp_microglow"),
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

    console.log("[Test] Connected. Waiting 6s for scene initialization...");
    await sleep(6000);

    // 1. Side instruments at rest
    console.log("[Test] 1. Capturing Side instruments at rest...");
    await cdp.captureScreenshot("microglow_instruments_rest.png", {
      x: 60,
      y: 300,
      width: 250,
      height: 230,
      scale: 1,
    });

    // 2. Missions hovered (x: 160, y: 350)
    console.log("[Test] 2. Hovering Missions card...");
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 160, y: 350 });
    await sleep(300);
    await cdp.captureScreenshot("microglow_missions_hovered.png", {
      x: 60,
      y: 300,
      width: 250,
      height: 230,
      scale: 1,
    });

    // 3. Systems hovered (x: 160, y: 410)
    console.log("[Test] 3. Hovering Systems card...");
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 160, y: 410 });
    await sleep(300);
    await cdp.captureScreenshot("microglow_systems_hovered.png", {
      x: 60,
      y: 300,
      width: 250,
      height: 230,
      scale: 1,
    });

    // 4. Approvals hovered (x: 160, y: 475)
    console.log("[Test] 4. Hovering Approvals card...");
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 160, y: 475 });
    await sleep(300);
    await cdp.captureScreenshot("microglow_approvals_hovered.png", {
      x: 60,
      y: 300,
      width: 250,
      height: 230,
      scale: 1,
    });

    // Move mouse away to neutral space (x: 10, y: 10)
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 10, y: 10 });
    await sleep(300);

    // 5. Active CORE navigation button at rest (Center nav pod: x: ~880, y: 30)
    console.log("[Test] 5. Capturing Active CORE navigation button at rest...");
    await cdp.captureScreenshot("microglow_nav_core_rest.png", {
      x: 750,
      y: 10,
      width: 420,
      height: 80,
      scale: 1,
    });

    // 6. Active CORE navigation button hovered (x: ~805, y: 32)
    console.log("[Test] 6. Hovering Active CORE navigation button...");
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 805, y: 32 });
    await sleep(300);
    await cdp.captureScreenshot("microglow_nav_core_hovered.png", {
      x: 750,
      y: 10,
      width: 420,
      height: 80,
      scale: 1,
    });

    // 7. Click Missions nav button to make it active, then hover over it
    console.log("[Test] 7. Selecting Missions in nav and hovering active Missions button...");
    await cdp.eval(`
      (() => {
        const btns = Array.from(document.querySelectorAll('header nav button'));
        const missionsNav = btns.find(b => b.textContent && b.textContent.includes('Missions'));
        if (missionsNav) missionsNav.click();
      })()
    `);
    await sleep(1000);
    // Hover Missions nav button (x: ~890, y: 32)
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 890, y: 32 });
    await sleep(300);
    await cdp.captureScreenshot("microglow_nav_missions_hovered.png", {
      x: 750,
      y: 10,
      width: 420,
      height: 80,
      scale: 1,
    });

    console.log("\n========================================");
    console.log("[Test] ALL 7 MICRO-GLOW CAPTURES COMPLETED SUCCESSFULLY!");
    console.log("========================================\n");
  } catch (err) {
    console.error("[Test] Error during verification:", err);
  } finally {
    if (cdp) cdp.close();
    chromeProcess.kill();
  }
}

run();
