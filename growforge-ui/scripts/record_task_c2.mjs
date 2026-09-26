/**
 * Record WebM video of Task C2 Native Spatial Conversation Flow
 */

import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { WebSocket } from "ws";

const PORT = 9252;
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
  console.log("[Record] Launching Chrome for Task C2 Video Capture...");
  const chromeProcess = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${PORT}`,
      "--headless=new",
      "--disable-gpu-watchdog",
      "--window-size=1920,1080",
      "--user-data-dir=" + path.join(ARTIFACTS_DIR, "scratch", "chrome_temp_rec_c2"),
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

    // Wait for greeting to settle
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

          // 1. Type and submit first message from dock
          const input = document.querySelector('form.studio-command-dock input');
          const form = document.querySelector('form.studio-command-dock');
          if (input && form) {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(input, "Show me my next mission");
            input.dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise(r => setTimeout(r, 600));
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
          }

          // 2. Wait for thinking + response presentation
          await new Promise(r => setTimeout(r, 3200));

          // 3. Second question
          if (input && form) {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(input, "What is our MCP system status?");
            input.dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise(r => setTimeout(r, 600));
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
          }

          await new Promise(r => setTimeout(r, 3200));

          recorder.stop();
        } catch (e) {
          resolve(null);
        }
      })
    `);

    if (recResult) {
      const buffer = Buffer.from(recResult, "base64");
      const filePath = path.join(ARTIFACTS_DIR, "task_c2_spatial_conversation_recording.webm");
      fs.writeFileSync(filePath, buffer);
      console.log(`[Record] Video saved to ${filePath} (${buffer.length} bytes)`);
    } else {
      console.log("[Record] Video capture completed.");
    }
  } catch (err) {
    console.error("[Record] Error:", err);
  } finally {
    if (cdp) cdp.close();
    chromeProcess.kill();
  }
}

record();
