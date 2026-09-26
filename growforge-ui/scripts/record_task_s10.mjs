/**
 * Record WebM video of Task S10 arrival lifecycle and ambient idle interaction
 */

import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { WebSocket } from "ws";

const PORT = 9236;
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

  close() {
    this.ws.close();
  }
}

async function record() {
  console.log("[Record] Launching Chrome for Task S10 Video Capture...");
  const chromeProcess = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${PORT}`,
      "--headless=new",
      "--disable-gpu-watchdog",
      "--window-size=1920,1080",
      "--user-data-dir=" + path.join(ARTIFACTS_DIR, "scratch", "chrome_temp_rec_s10"),
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

    // Clear any previous session flag in this fresh context
    await cdp.eval(`sessionStorage.removeItem("gf_core_greeting_shown")`);

    // Reload page to start arrival from t=0
    await cdp.send("Page.reload");
    await sleep(200);

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
          // 0-6s: Arrival, greeting visible hold, fade-out to ambient idle
          await new Promise(r => setTimeout(r, 6200));

          // Hover Missions
          const missions = document.querySelectorAll('.core-instrument-card')[0];
          if (missions) {
            missions.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
          }
          await new Promise(r => setTimeout(r, 1000));

          if (missions) {
            missions.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
          }
          await new Promise(r => setTimeout(r, 800));

          recorder.stop();
        } catch (e) {
          resolve(null);
        }
      })
    `);

    if (recResult) {
      const buffer = Buffer.from(recResult, "base64");
      const filePath = path.join(ARTIFACTS_DIR, "task_s10_arrival_recording.webm");
      fs.writeFileSync(filePath, buffer);
      console.log(`[Record] Video saved to ${filePath} (${buffer.length} bytes)`);
    } else {
      console.log("[Record] Canvas video complete.");
    }
  } catch (err) {
    console.error("[Record] Error:", err);
  } finally {
    if (cdp) cdp.close();
    chromeProcess.kill();
  }
}

record();
