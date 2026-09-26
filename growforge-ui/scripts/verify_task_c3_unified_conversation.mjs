import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { WebSocket } from "ws";

const PORT = 9253;
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
  console.log("=== Task C3: Unified Spatial Conversation Automated Verification ===");

  const tempProfileDir = path.join(ARTIFACTS_DIR, "scratch", `chrome_temp_c3_${Date.now()}`);
  fs.mkdirSync(tempProfileDir, { recursive: true });

  const chromeProcess = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${tempProfileDir}`,
    "--headless=new",
    "--disable-gpu-watchdog",
    "--window-size=1920,1080",
    "http://localhost:3000",
  ], { stdio: "ignore" });

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
    console.log(`[CDP] Connected to Chrome page target: ${wsUrl}`);

    cdp = new CDPClient(wsUrl);
    await cdp.connect();

    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");

    // Reset conversation history in localStorage for clean verification
    await cdp.eval(`
      (() => {
        localStorage.removeItem("growforge.chat.history");
        localStorage.setItem("growforge.userName", "Ony");
        localStorage.setItem("growforge.assistantName", "Nora");
      })()
    `);

    // Wait for arrival greeting to settle
    console.log("[Test] Waiting 6.2s for CORE arrival greeting to settle...");
    await sleep(6200);

    const fullClip = { x: 0, y: 0, width: 1920, height: 1080, scale: 1 };

    // 1. Initial State: Studio Dock ready in CORE
    console.log("[Test] 1. Capturing Initial CORE State with Studio Command Dock...");
    await cdp.captureScreenshot("task_c3_initial_dock_ready.png", fullClip);

    // 2. Submit Message from Studio Dock
    console.log("[Test] 2. Submitting first message from Studio Command Dock...");
    await cdp.eval(`
      (() => {
        const input = document.querySelector('form.studio-command-dock input');
        const form = document.querySelector('form.studio-command-dock');
        if (input && form) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(input, "Hi Nora, provide an operational brief for our active mission pipeline.");
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
      })()
    `);

    await sleep(250);
    console.log("[Test] Capturing immediate pending thinking shimmer...");
    await cdp.captureScreenshot("task_c3_submission_pending_reveal.png", fullClip);

    // Wait for response to finish
    await sleep(3500);

    // 3. Compact Response in Right-Side Workspace
    console.log("[Test] 3. Capturing Compact Response in Right-Side Workspace (NO legacy drawer!)...");
    await cdp.captureScreenshot("task_c3_compact_response.png", fullClip);

    // Measure and crop compact card
    const cardRect = await cdp.eval(`
      (() => {
        const el = document.querySelector('div[aria-label="Assistant Spatial Workspace"]');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.max(0, r.x - 20), y: Math.max(0, r.y - 20), width: r.width + 40, height: r.height + 40, scale: 1 };
      })()
    `);
    if (cardRect) {
      console.log("[Test] Cropping compact spatial response card:", cardRect);
      await cdp.captureScreenshot("task_c3_compact_card_crop.png", cardRect);
    }

    // 4. Submit Second Message from Dock
    console.log("[Test] 4. Submitting second message from Studio dock...");
    await cdp.eval(`
      (() => {
        const input = document.querySelector('form.studio-command-dock input');
        const form = document.querySelector('form.studio-command-dock');
        if (input && form) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(input, "What is the status of our connected MCP systems?");
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
      })()
    `);
    await sleep(3500);
    console.log("[Test] Capturing second turn in compact mode...");
    await cdp.captureScreenshot("task_c3_second_turn_compact.png", fullClip);

    // 5. Expand into Full History Workspace via Header Assistant Button
    console.log("[Test] 5. Expanding into Full History Workspace via Header Assistant Button...");
    await cdp.eval(`
      (() => {
        const assistantBtn = Array.from(document.querySelectorAll('header button')).find(b => b.textContent.includes('Assistant'));
        if (assistantBtn) assistantBtn.click();
      })()
    `);
    await sleep(600);
    console.log("[Test] Capturing Expanded History Workspace on the right...");
    await cdp.captureScreenshot("task_c3_expanded_history_workspace.png", fullClip);

    // Crop expanded history workspace
    const expandedRect = await cdp.eval(`
      (() => {
        const el = document.querySelector('div[aria-label="Assistant Spatial Workspace"]');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.max(0, r.x - 20), y: Math.max(0, r.y - 20), width: r.width + 40, height: r.height + 40, scale: 1 };
      })()
    `);
    if (expandedRect) {
      console.log("[Test] Cropping expanded history workspace:", expandedRect);
      await cdp.captureScreenshot("task_c3_expanded_history_crop.png", expandedRect);
    }

    // 6. Open Conversation Settings from Layer Header
    console.log("[Test] 6. Opening Conversation Settings from Layer Header...");
    await cdp.eval(`
      (() => {
        const settingsBtn = document.querySelector('div[aria-label="Assistant Spatial Workspace"] button[aria-label="Conversation Settings"]');
        if (settingsBtn) settingsBtn.click();
      })()
    `);
    await sleep(400);
    console.log("[Test] Capturing Conversation Settings Popover from Layer Header...");
    await cdp.captureScreenshot("task_c3_settings_popover_layer.png", fullClip);

    // Close Settings Popover
    await cdp.eval(`
      (() => {
        const closeBtn = document.querySelector('button[aria-label="Close Settings"]');
        if (closeBtn) closeBtn.click();
      })()
    `);
    await sleep(300);

    // 7. Collapse back to compact view using the Collapse action
    console.log("[Test] 7. Collapsing back to compact mode...");
    await cdp.eval(`
      (() => {
        const collapseBtn = Array.from(document.querySelectorAll('div[aria-label="Assistant Spatial Workspace"] button')).find(b =>
          b.textContent.includes('Collapse') || b.getAttribute('aria-label')?.includes('Collapse')
        );
        if (collapseBtn) collapseBtn.click();
      })()
    `);
    await sleep(400);
    await cdp.captureScreenshot("task_c3_collapsed_to_compact.png", fullClip);

    // 8. Mobile Viewport (390x844)
    console.log("[Test] 8. Capturing Mobile Viewport layout...");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await sleep(500);
    await cdp.captureScreenshot("task_c3_mobile_workspace.png", { x: 0, y: 0, width: 390, height: 844, scale: 1 });

    // Reset Viewport
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(300);

    // 9. Reduced Motion
    console.log("[Test] 9. Capturing Reduced-Motion mode...");
    await cdp.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    await sleep(400);
    await cdp.captureScreenshot("task_c3_reduced_motion.png", fullClip);

    console.log("=== Verification Complete! All C3 verification screenshots captured successfully. ===\n");
  } finally {
    if (cdp) cdp.close();
    chromeProcess.kill();
  }
}

run().catch((err) => {
  console.error("Run error:", err);
  process.exit(1);
});
