import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { WebSocket } from "ws";

const PORT = 9251;
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACTS_DIR = "C:\\Users\\USERAS\\.gemini\\antigravity-ide\\brain\\a0df3a7c-1d8b-461c-9031-b349d129453b";

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

  async eval(expression) {
    const res = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res.result?.value;
  }

  close() {
    this.ws.close();
  }
}

async function run() {
  if (!fs.existsSync(ARTIFACTS_DIR)) {
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  }

  console.log("\n=== Starting Automated Verification for Task C2: Native Spatial Conversation Flow ===");

  const tempDir = path.join(ARTIFACTS_DIR, "scratch", `chrome_temp_c2_${Date.now()}`);
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const chromeProcess = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${PORT}`,
      "--headless=new",
      "--disable-gpu-watchdog",
      "--window-size=1920,1080",
      `--user-data-dir=${tempDir}`,
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

    // Wait for arrival greeting to settle
    console.log("[Test] Waiting 6.2s for CORE greeting to settle...");
    await sleep(6200);

    const fullClip = { x: 0, y: 0, width: 1920, height: 1080, scale: 1 };

    // 1. Initial State: Submit first prompt from dock using React input setter
    console.log("[Test] 1. Submitting message from Studio Dock...");
    await cdp.eval(`
      (() => {
        const input = document.querySelector('form.studio-command-dock input');
        const form = document.querySelector('form.studio-command-dock');
        if (input && form) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(input, "Show me my next mission");
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
      })()
    `);

    // Capture pending state (thinking shimmer and skeleton)
    await sleep(250);
    console.log("[Test] Capturing pending thinking state...");
    await cdp.captureScreenshot("task_c2_submission_pending.png", fullClip);

    // Wait for real response from /api/router
    console.log("[Test] Waiting for assistant response...");
    await sleep(3500);

    // 2. Spatial Response Layer Active
    console.log("[Test] 2. Capturing Spatial Response Layer in right-side negative space...");
    await cdp.captureScreenshot("task_c2_spatial_response_active.png", fullClip);

    // Crop right-side spatial response card
    const responseRect = await cdp.eval(`
      (() => {
        const el = document.querySelector('div[aria-label="Assistant Spatial Response"]');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.max(0, r.x - 20), y: Math.max(0, r.y - 20), width: r.width + 40, height: r.height + 40, scale: 1 };
      })()
    `);
    console.log("[Test] Measured response card rect:", responseRect);
    if (responseRect) {
      await cdp.captureScreenshot("task_c2_spatial_response_card_crop.png", responseRect);
    }

    // 3. Second Message from Dock
    console.log("[Test] 3. Submitting second message from dock...");
    await cdp.eval(`
      (() => {
        const input = document.querySelector('form.studio-command-dock input');
        const form = document.querySelector('form.studio-command-dock');
        if (input && form) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(input, "What is the current health of our MCP connections?");
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
      })()
    `);
    await sleep(3500);
    console.log("[Test] Capturing second response...");
    await cdp.captureScreenshot("task_c2_spatial_response_second_turn.png", fullClip);

    // 4. Open Full Conversation History in Drawer via Top-Right Assistant Button
    console.log("[Test] 4. Opening full conversation history via top-right Assistant button...");
    await cdp.eval(`
      (() => {
        const assistantBtn = Array.from(document.querySelectorAll('header button')).find(b => b.textContent.includes('Assistant'));
        if (assistantBtn) assistantBtn.click();
      })()
    `);
    await sleep(600);
    await cdp.captureScreenshot("task_c2_drawer_history_opened_manually.png", fullClip);

    // Close Drawer
    await cdp.eval(`
      (() => {
        const closeBtn = document.querySelector('button[aria-label="Close Assistant"]');
        if (closeBtn) closeBtn.click();
      })()
    `);
    await sleep(400);

    // 5. Mobile Viewport (390x844)
    console.log("[Test] 5. Capturing Mobile Viewport layout...");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await sleep(500);
    await cdp.captureScreenshot("task_c2_spatial_response_mobile.png", { x: 0, y: 0, width: 390, height: 844, scale: 1 });

    // Reset Viewport
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(300);

    // 6. Reduced Motion
    console.log("[Test] 6. Capturing Reduced-Motion mode...");
    await cdp.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    await sleep(400);
    await cdp.captureScreenshot("task_c2_spatial_response_reduced_motion.png", fullClip);

    console.log("=== Verification Complete! All C2 verification screenshots captured. ===\n");
  } finally {
    if (cdp) cdp.close();
    chromeProcess.kill();
  }
}

run().catch((err) => {
  console.error("Run error:", err);
  process.exit(1);
});
