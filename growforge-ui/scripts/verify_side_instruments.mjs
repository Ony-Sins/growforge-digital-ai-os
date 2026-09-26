/**
 * Automated Verification Script for TASK S2: CORE SIDE INSTRUMENT CINEMATIC REFINEMENT
 * Uses Chrome DevTools Protocol to capture desktop 1920x1080 and mobile 390x844 screenshots
 * and close-ups of the refined holographic status instruments.
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
  console.log("[Test] Launching Chrome for CORE Side Instruments Verification...");
  const chromeProcess = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${PORT}`,
      "--headless=new",
      "--disable-gpu-watchdog",
      "--disable-features=CalculateNativeWinOcclusion",
      "--window-size=1920,1080",
      "--user-data-dir=" + path.join(ARTIFACTS_DIR, "scratch", "chrome_temp_side_instruments"),
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

    console.log("[Test] Connected to Chrome. Waiting 6s for scene initialization...");
    await sleep(6000);

    // 1. Capture Full Desktop CORE with Left Ambient Cluster
    await cdp.captureScreenshot("core_left_cluster_desktop.png");

    // 2. Capture Close-up of the complete Left Ambient Cluster
    await cdp.captureScreenshot("core_left_cluster_closeup.png", {
      x: 60,
      y: 300,
      width: 250,
      height: 230,
      scale: 1,
    });

    // Individual close-ups
    await cdp.captureScreenshot("core_left_cluster_missions.png", {
      x: 70,
      y: 310,
      width: 230,
      height: 75,
      scale: 1,
    });

    await cdp.captureScreenshot("core_left_cluster_systems.png", {
      x: 70,
      y: 375,
      width: 230,
      height: 75,
      scale: 1,
    });

    await cdp.captureScreenshot("core_left_cluster_approvals.png", {
      x: 70,
      y: 440,
      width: 230,
      height: 75,
      scale: 1,
    });

    // 3. Test interaction: Click Missions side card
    console.log("[Test] Clicking Missions side card...");
    await cdp.eval(`
      (() => {
        const btns = Array.from(document.querySelectorAll('section button'));
        const missionsCard = btns.find(b => b.textContent && b.textContent.includes('MISSIONS'));
        if (missionsCard) missionsCard.click();
      })()
    `);
    await sleep(1500);
    await cdp.captureScreenshot("core_side_instruments_missions_clicked.png");

    // 4. Return to CORE
    console.log("[Test] Returning to CORE...");
    await cdp.eval(`
      (() => {
        const btns = Array.from(document.querySelectorAll('header nav button, header button'));
        const coreBtn = btns.find(b => b.textContent && b.textContent.includes('CORE'));
        if (coreBtn) coreBtn.click();
      })()
    `);
    await sleep(1500);

    // 5. Mobile Viewport (390 x 844)
    console.log("[Test] Testing mobile responsive viewport (390 x 844)...");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await sleep(1500);
    await cdp.captureScreenshot("core_side_instruments_mobile.png");

    console.log("\n========================================");
    console.log("[Test] CORE SIDE INSTRUMENT REFINEMENT VERIFICATION COMPLETE!");
    console.log("========================================\n");

  } catch (err) {
    console.error("[Test] Error during verification:", err);
  } finally {
    if (cdp) cdp.close();
    chromeProcess.kill();
  }
}

run();
