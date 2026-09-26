import { spawn, execSync } from "child_process";
import fs from "fs";
import path from "path";
import { WebSocket } from "ws";

const PORT = 9254;
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

async function record() {
  console.log("=== Task C3: Recording Unified Spatial Conversation Interaction Video ===");

  const tempProfileDir = path.join(ARTIFACTS_DIR, "scratch", `chrome_record_c3_${Date.now()}`);
  fs.mkdirSync(tempProfileDir, { recursive: true });

  const tempFramesDir = path.join(ARTIFACTS_DIR, "scratch", "task_c3_video_frames");
  if (fs.existsSync(tempFramesDir)) {
    fs.rmSync(tempFramesDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempFramesDir, { recursive: true });

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
    console.log(`[CDP] Connected to Chrome for recording: ${wsUrl}`);

    cdp = new CDPClient(wsUrl);
    await cdp.connect();

    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");

    // Reset conversation history in localStorage
    await cdp.eval(`
      (() => {
        localStorage.removeItem("growforge.chat.history");
        localStorage.setItem("growforge.userName", "Ony");
        localStorage.setItem("growforge.assistantName", "Nora");
      })()
    `);

    // Wait for arrival greeting to settle
    console.log("[Record] Waiting 6.2s for CORE arrival greeting to settle...");
    await sleep(6200);

    let frameIndex = 0;
    let recording = true;

    const captureLoop = async () => {
      while (recording) {
        try {
          const res = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 80 });
          const buffer = Buffer.from(res.data, "base64");
          const framePath = path.join(tempFramesDir, `frame_${String(frameIndex++).padStart(4, "0")}.jpg`);
          fs.writeFileSync(framePath, buffer);
        } catch {}
        await sleep(100); // 10 fps
      }
    };

    const capturePromise = captureLoop();

    // 1. Type prompt 1
    console.log("[Record] Typing prompt 1...");
    const prompt1 = "Hi Nora, provide an operational brief for our active mission pipeline.";
    for (let i = 1; i <= prompt1.length; i += 3) {
      const sub = prompt1.slice(0, i);
      await cdp.eval(`
        (() => {
          const input = document.querySelector('form.studio-command-dock input');
          if (input) {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(input, ${JSON.stringify(sub)});
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        })()
      `);
      await sleep(60);
    }

    await sleep(400);

    // Submit prompt 1
    console.log("[Record] Submitting prompt 1...");
    await cdp.eval(`
      (() => {
        const form = document.querySelector('form.studio-command-dock');
        if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      })()
    `);

    await sleep(3500);

    // 2. Type prompt 2
    console.log("[Record] Typing prompt 2...");
    const prompt2 = "What is the status of our connected MCP systems?";
    for (let i = 1; i <= prompt2.length; i += 3) {
      const sub = prompt2.slice(0, i);
      await cdp.eval(`
        (() => {
          const input = document.querySelector('form.studio-command-dock input');
          if (input) {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(input, ${JSON.stringify(sub)});
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        })()
      `);
      await sleep(60);
    }

    await sleep(400);

    // Submit prompt 2
    console.log("[Record] Submitting prompt 2...");
    await cdp.eval(`
      (() => {
        const form = document.querySelector('form.studio-command-dock');
        if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      })()
    `);

    await sleep(3500);

    // 3. Expand History from Header Assistant button
    console.log("[Record] Expanding History from Header Assistant button...");
    await cdp.eval(`
      (() => {
        const assistantBtn = Array.from(document.querySelectorAll('header button')).find(b => b.textContent.includes('Assistant'));
        if (assistantBtn) assistantBtn.click();
      })()
    `);

    await sleep(2200);

    // 4. Open Settings from Layer Header
    console.log("[Record] Opening Settings from Layer Header...");
    await cdp.eval(`
      (() => {
        const settingsBtn = document.querySelector('div[aria-label="Assistant Spatial Workspace"] button[aria-label="Conversation Settings"]');
        if (settingsBtn) settingsBtn.click();
      })()
    `);

    await sleep(1800);

    // Close Settings
    await cdp.eval(`
      (() => {
        const closeBtn = document.querySelector('button[aria-label="Close Settings"]');
        if (closeBtn) closeBtn.click();
      })()
    `);

    await sleep(1000);

    // 5. Collapse back to compact
    console.log("[Record] Collapsing to compact...");
    await cdp.eval(`
      (() => {
        const collapseBtn = Array.from(document.querySelectorAll('div[aria-label="Assistant Spatial Workspace"] button')).find(b =>
          b.textContent.includes('Collapse') || b.getAttribute('aria-label')?.includes('Collapse')
        );
        if (collapseBtn) collapseBtn.click();
      })()
    `);

    await sleep(1500);

    recording = false;
    await capturePromise;

    console.log(`[Record] Captured ${frameIndex} frames.`);

    // Encode to WebM using ffmpeg
    const outputVideo = path.join(ARTIFACTS_DIR, "task_c3_unified_conversation_recording.webm");
    try {
      execSync(`ffmpeg -y -framerate 10 -i "${tempFramesDir}\\frame_%04d.jpg" -c:v libvpx-vp9 -pix_fmt yuv420p -b:v 1M "${outputVideo}"`);
      console.log("[Record] Video recording generated successfully:", outputVideo);
    } catch (err) {
      console.warn("[Record] FFmpeg conversion failed:", err.message);
    }
  } finally {
    if (cdp) cdp.close();
    chromeProcess.kill();
  }
}

record().catch((err) => {
  console.error("Recording error:", err);
  process.exit(1);
});
