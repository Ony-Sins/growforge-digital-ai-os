import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { WebSocket } from "ws";

const PORT = 9249;
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

  console.log("\n=== Starting Automated Verification for Task C1: Studio Command Dock & Reactive Orb ===");

  const tempDir = path.join(ARTIFACTS_DIR, "scratch", `chrome_temp_c1_${Date.now()}`);
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
    await cdp.send("DOM.enable");
    await cdp.send("CSS.enable");

    // Wait for greeting cycle to settle into ambient idle
    console.log("[Test] Waiting 6.2s for CORE greeting to settle into ambient idle...");
    await sleep(6200);

    // Get exact dock bounding rect
    const dockRect = await cdp.eval(`
      (() => {
        const el = document.querySelector('form.studio-command-dock');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.max(0, r.x - 24), y: Math.max(0, r.y - 20), width: r.width + 48, height: r.height + 40, scale: 1 };
      })()
    `);
    console.log("[Test] Measured dock rect:", dockRect);

    const dockClip = dockRect || { x: 590, y: 950, width: 740, height: 120, scale: 1 };
    const fullClip = { x: 0, y: 0, width: 1920, height: 1080, scale: 1 };

    // 1. Idle Dock & Full Scene
    console.log("[Test] 1. Capturing Idle Dock & Full Scene...");
    await cdp.captureScreenshot("task_c1_dock_idle.png", dockClip);
    await cdp.captureScreenshot("task_c1_core_full_idle.png", fullClip);

    // 2. Hover / Focus State
    console.log("[Test] 2. Capturing Hover / Focus State...");
    await cdp.eval(`
      (() => {
        const input = document.querySelector('form.studio-command-dock input');
        if (input) input.focus();
      })()
    `);
    await sleep(300);
    await cdp.captureScreenshot("task_c1_dock_focus.png", dockClip);

    // 3. Typing State (with text and orb micro-pop)
    console.log("[Test] 3. Capturing Typing State...");
    await cdp.eval(`
      (() => {
        const input = document.querySelector('form.studio-command-dock input');
        if (input) {
          input.value = "Show me my next mission";
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()
    `);
    await sleep(100);
    await cdp.captureScreenshot("task_c1_dock_typing.png", dockClip);

    // 4. Voice Listening (Mic enabled, waiting for audio)
    console.log("[Test] 4. Capturing Voice Listening State...");
    await cdp.eval(`
      (() => {
        const orb = document.querySelector('.reactive-orb-base');
        if (orb) {
          orb.className = 'reactive-orb-base reactive-orb-listening';
        }
        const input = document.querySelector('form.studio-command-dock input');
        if (input) input.placeholder = "Listening...";
      })()
    `);
    await sleep(300);
    await cdp.captureScreenshot("task_c1_dock_listening.png", dockClip);

    // 5. Voice Active (User speaking with audio amplitude)
    console.log("[Test] 5. Capturing Voice Active State...");
    await cdp.eval(`
      (() => {
        const orb = document.querySelector('.reactive-orb-base');
        if (orb) {
          orb.className = 'reactive-orb-base reactive-orb-voice-active';
        }
      })()
    `);
    await sleep(300);
    await cdp.captureScreenshot("task_c1_dock_voice_active.png", dockClip);

    // 6. Thinking / Request Pending State
    console.log("[Test] 6. Capturing Thinking State...");
    await cdp.eval(`
      (() => {
        const orb = document.querySelector('.reactive-orb-base');
        if (orb) {
          orb.className = 'reactive-orb-base reactive-orb-thinking';
        }
      })()
    `);
    await sleep(300);
    await cdp.captureScreenshot("task_c1_dock_thinking.png", dockClip);

    // 7. Executing State
    console.log("[Test] 7. Capturing Executing State...");
    await cdp.eval(`
      (() => {
        const orb = document.querySelector('.reactive-orb-base');
        if (orb) {
          orb.className = 'reactive-orb-base reactive-orb-executing';
        }
      })()
    `);
    await sleep(300);
    await cdp.captureScreenshot("task_c1_dock_executing.png", dockClip);

    // 8. Success Pulse State
    console.log("[Test] 8. Capturing Success State...");
    await cdp.eval(`
      (() => {
        const orb = document.querySelector('.reactive-orb-base');
        if (orb) {
          orb.className = 'reactive-orb-base reactive-orb-success';
        }
      })()
    `);
    await sleep(300);
    await cdp.captureScreenshot("task_c1_dock_success.png", dockClip);

    // 9. Error State
    console.log("[Test] 9. Capturing Error State...");
    await cdp.eval(`
      (() => {
        const orb = document.querySelector('.reactive-orb-base');
        if (orb) {
          orb.className = 'reactive-orb-base reactive-orb-error';
        }
      })()
    `);
    await sleep(300);
    await cdp.captureScreenshot("task_c1_dock_error.png", dockClip);

    // Reset Orb to Focus
    await cdp.eval(`
      (() => {
        const orb = document.querySelector('.reactive-orb-base');
        if (orb) {
          orb.className = 'reactive-orb-base reactive-orb-focus';
        }
      })()
    `);

    // 10. Conversation Settings Popover
    console.log("[Test] 10. Capturing Conversation Settings Popover...");
    await cdp.eval(`
      (() => {
        const settingsBtn = document.querySelector('button[title="Conversation Settings"]');
        if (settingsBtn) settingsBtn.click();
      })()
    `);
    await sleep(400);

    const popoverRect = await cdp.eval(`
      (() => {
        const popover = document.querySelector('form.studio-command-dock div.absolute');
        if (!popover) return null;
        const r = popover.getBoundingClientRect();
        return { x: Math.max(0, r.x - 20), y: Math.max(0, r.y - 20), width: r.width + 40, height: r.height + 40, scale: 1 };
      })()
    `);
    console.log("[Test] Measured popover rect:", popoverRect);
    const popoverClip = popoverRect || { x: 880, y: 540, width: 440, height: 530, scale: 1 };

    await cdp.captureScreenshot("task_c1_conversation_settings_popover.png", popoverClip);

    // Close Settings Popover
    await cdp.eval(`
      (() => {
        const closeBtn = document.querySelector('button[aria-label="Close Settings"]');
        if (closeBtn) closeBtn.click();
      })()
    `);
    await sleep(300);

    // 11. Mobile Viewport (390x844)
    console.log("[Test] 11. Capturing Mobile Viewport (390x844)...");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await sleep(500);
    await cdp.captureScreenshot("task_c1_dock_mobile.png", { x: 0, y: 0, width: 390, height: 844, scale: 1 });

    // Reset Viewport
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(300);

    // 12. Reduced-Motion Mode
    console.log("[Test] 12. Capturing Reduced-Motion Mode...");
    await cdp.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    await sleep(400);
    await cdp.captureScreenshot("task_c1_dock_reduced_motion.png", dockClip);

    console.log("=== Verification Complete! All screenshots captured successfully. ===\n");
  } finally {
    if (cdp) cdp.close();
    chromeProcess.kill();
  }
}

run().catch((err) => {
  console.error("Run error:", err);
  process.exit(1);
});
