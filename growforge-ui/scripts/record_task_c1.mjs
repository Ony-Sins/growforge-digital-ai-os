/**
 * Record WebM video of Task C1 Studio Command Dock & Reactive Orb interaction
 */

import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { WebSocket } from "ws";

const PORT = 9250;
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
  console.log("[Record] Launching Chrome for Task C1 Video Capture...");
  const chromeProcess = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${PORT}`,
      "--headless=new",
      "--disable-gpu-watchdog",
      "--window-size=1920,1080",
      "--user-data-dir=" + path.join(ARTIFACTS_DIR, "scratch", "chrome_temp_rec_c1"),
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

    if (!wsUrl) throw new Error("Debugger not found");

    cdp = new CDPClient(wsUrl);
    await cdp.connect();
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");

    // Clear any previous session flag
    await cdp.eval(`sessionStorage.removeItem("gf_core_greeting_shown")`);

    // Reload page
    await cdp.send("Page.reload");
    await sleep(6200);

    const recResult = await cdp.eval(`
      new Promise(async (resolve) => {
        try {
          const stream = document.querySelector('canvas').captureStream(30);
          const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
          const chunks = [];
          recorder.ondataavailable = e => chunks.push(e.data);
          recorder.onstop = async () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.readAsDataURL(blob);
          };

          recorder.start();

          // Action sequence:
          // 1. Hover dock
          const dock = document.querySelector('form.studio-command-dock');
          if (dock) dock.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
          await new Promise(r => setTimeout(r, 600));

          // 2. Focus input and type
          const input = document.querySelector('form.studio-command-dock input');
          if (input) {
            input.focus();
            input.value = "Show me my next mission";
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
          await new Promise(r => setTimeout(r, 1200));

          // 3. Open settings popover
          const settingsBtn = document.querySelector('button[title="Conversation Settings"]');
          if (settingsBtn) settingsBtn.click();
          await new Promise(r => setTimeout(r, 1200));

          // 4. Close settings popover
          const closeBtn = document.querySelector('button[aria-label="Close Settings"]');
          if (closeBtn) closeBtn.click();
          await new Promise(r => setTimeout(r, 800));

          recorder.stop();
        } catch (e) {
          resolve(null);
        }
      })
    `);

    if (recResult) {
      const buffer = Buffer.from(recResult, "base64");
      const filePath = path.join(ARTIFACTS_DIR, "task_c1_interaction_recording.webm");
      fs.writeFileSync(filePath, buffer);
      console.log(`[Record] Video saved to ${filePath} (${buffer.length} bytes)`);
    } else {
      console.log("[Record] Canvas video capture completed.");
    }
  } catch (err) {
    console.error("[Record] Error:", err);
  } finally {
    if (cdp) cdp.close();
    chromeProcess.kill();
  }
}

record();
