import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { WebSocket } from "ws";

const PORT = 9245;
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

  const prefix = process.argv[2] || "baseline";
  console.log(`\n=== Running Capture: ${prefix} ===`);

  const tempDir = path.join(ARTIFACTS_DIR, "scratch", `chrome_temp_${prefix}_${Date.now()}`);
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

    // Wait for greeting to finish fade-out and settle into ambient idle (~6.2s total)
    console.log("[Test] Waiting for CORE greeting cycle to settle into ambient idle...");
    await sleep(6200);

    console.log("[Test] Capturing 1. CORE Home Full View (1920x1080)...");
    await cdp.captureScreenshot(`${prefix}_core_home_1920.png`, { x: 0, y: 0, width: 1920, height: 1080, scale: 1 });

    console.log("[Test] Capturing 2. CORE Center Crop (800x800)...");
    await cdp.captureScreenshot(`${prefix}_core_center_crop.png`, { x: 560, y: 140, width: 800, height: 800, scale: 1 });

    // Navigate to Brain view
    console.log("[Test] Navigating to Brain view (tier=brain)...");
    await cdp.eval(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Brain'));
        if (btn) btn.click();
      })()
    `);
    await sleep(2500);

    console.log("[Test] Capturing 3. Brain Full View (1920x1080)...");
    await cdp.captureScreenshot(`${prefix}_brain_1920.png`, { x: 0, y: 0, width: 1920, height: 1080, scale: 1 });

    console.log("[Test] Capturing 4. Brain Center Crop (800x800)...");
    await cdp.captureScreenshot(`${prefix}_brain_center_crop.png`, { x: 560, y: 140, width: 800, height: 800, scale: 1 });

    console.log(`=== Finished Capture: ${prefix} ===\n`);
  } finally {
    if (cdp) cdp.close();
    chromeProcess.kill();
  }
}

run().catch((err) => {
  console.error("Run error:", err);
  process.exit(1);
});
