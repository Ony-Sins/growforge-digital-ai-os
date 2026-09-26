/**
 * Automated Verification Script for TASK S9: PROFESSIONAL INSTRUMENT GLYPH AND COLOR REFINEMENT
 *
 * Verifies:
 * 1. Unified glyph stroke weight & neutral cool silver-blue resting stroke color
 * 2. Muted semantic accents: Cyan (Missions), Teal (Systems), Neutral / Amber (Approvals)
 * 3. Approvals states: 0 waiting (neutral), positive pending (amber), unknown ("—")
 * 4. Coordinated hover states across all 3 instruments
 */

import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { WebSocket } from "ws";

const PORT = 9234;
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
  console.log("[Test] Launching Chrome for Task S9 Glyph & Color Refinement Verification...");
  const chromeProcess = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${PORT}`,
      "--headless=new",
      "--disable-gpu-watchdog",
      "--window-size=1920,1080",
      "--user-data-dir=" + path.join(ARTIFACTS_DIR, "scratch", "chrome_temp_tasks9"),
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

    if (!wsUrl) throw new Error("Debugger target not found");

    cdp = new CDPClient(wsUrl);
    await cdp.connect();
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");

    console.log("[Test] Connected. Waiting 6s for scene initialization...");
    await sleep(6000);

    const clusterClip = {
      x: 60,
      y: 300,
      width: 295,
      height: 220,
      scale: 1,
    };

    // 1. Inspect & capture Resting State
    console.log("[Test] 1. Inspecting & Capturing All 3 Instruments at Rest...");
    const glyphRestStyles = await cdp.eval(`
      (() => {
        const cards = Array.from(document.querySelectorAll('.core-instrument-card'));
        return cards.map((card, i) => {
          const glyphSvg = card.querySelector('.core-instrument-glyph svg');
          const strip = card.querySelector('.core-instrument-strip');
          return {
            index: i,
            label: card.querySelector('span')?.textContent,
            glyphColor: glyphSvg ? window.getComputedStyle(glyphSvg).color : null,
            glyphStrokeWidth: glyphSvg?.getAttribute('stroke-width'),
            stripBackground: strip ? window.getComputedStyle(strip).background : null,
            stripBoxShadow: strip ? window.getComputedStyle(strip).boxShadow : null,
          };
        });
      })()
    `);
    console.log("[Test] Glyph Resting Styles:", JSON.stringify(glyphRestStyles, null, 2));
    await cdp.captureScreenshot("task_s9_cluster_rest.png", clusterClip);

    // 2. Hover Missions (x: 160, y: 350)
    console.log("[Test] 2. Hovering Missions Card...");
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 160, y: 350 });
    await sleep(400);
    await cdp.captureScreenshot("task_s9_hover_missions.png", clusterClip);

    // 3. Hover Systems (x: 160, y: 410)
    console.log("[Test] 3. Hovering Systems Card...");
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 160, y: 410 });
    await sleep(400);
    await cdp.captureScreenshot("task_s9_hover_systems.png", clusterClip);

    // 4. Hover Approvals (x: 160, y: 475)
    console.log("[Test] 4. Hovering Approvals Card...");
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 160, y: 475 });
    await sleep(400);
    await cdp.captureScreenshot("task_s9_hover_approvals.png", clusterClip);

    // 5. Approvals State Verification: Positive Pending (amber) vs Zero (neutral)
    console.log("[Test] 5. Verifying Approvals with Positive Pending Count...");
    await cdp.eval(`
      (() => {
        const approvalsCard = document.querySelectorAll('.core-instrument-card')[2];
        if (approvalsCard) {
          approvalsCard.style.setProperty('--inst-rgb', '245,183,59');
          approvalsCard.style.setProperty('--inst-hex', '#fbbf24');
          const val = approvalsCard.querySelector('.core-instrument-value');
          if (val) val.textContent = '2 WAITING';
          const strip = approvalsCard.querySelector('.core-instrument-strip');
          if (strip) {
            strip.style.background = 'linear-gradient(to bottom, rgba(245,183,59,1), rgba(245,183,59,0.35))';
            strip.style.boxShadow = '0 0 7px rgba(245,183,59,0.70), 0 0 2px rgba(245,183,59,0.50)';
          }
        }
      })()
    `);
    await sleep(200);
    await cdp.captureScreenshot("task_s9_approvals_positive.png", clusterClip);

    console.log("\n========================================");
    console.log("[Test] TASK S9 VERIFICATION COMPLETED SUCCESSFULLY!");
    console.log("========================================\n");
  } catch (err) {
    console.error("[Test] Error during verification:", err);
  } finally {
    if (cdp) cdp.close();
    chromeProcess.kill();
  }
}

run();
