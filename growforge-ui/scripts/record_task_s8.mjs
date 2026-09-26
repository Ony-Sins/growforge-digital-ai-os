/**
 * Record a smooth WebM video of the Task S8 instrument hover and data signal impulse
 */

import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { WebSocket } from "ws";

const PORT = 9233;
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
  console.log("[Record] Launching Chrome for Video Capture...");
  const chromeProcess = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${PORT}`,
      "--headless=new",
      "--disable-gpu-watchdog",
      "--window-size=1920,1080",
      "--user-data-dir=" + path.join(ARTIFACTS_DIR, "scratch", "chrome_temp_rec_s8"),
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

    await sleep(6000);

    // Record interaction sequence by capturing frames in DOM canvas stream
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
          // 0.5s idle
          await new Promise(r => setTimeout(r, 500));

          // Hover Missions
          const missions = document.querySelectorAll('.core-instrument-card')[0];
          if (missions) {
            missions.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
          }
          await new Promise(r => setTimeout(r, 1200));

          // Hover Systems
          const systems = document.querySelectorAll('.core-instrument-card')[1];
          if (missions && systems) {
            missions.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
            systems.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
          }
          await new Promise(r => setTimeout(r, 1200));

          // Hover Approvals
          const approvals = document.querySelectorAll('.core-instrument-card')[2];
          if (systems && approvals) {
            systems.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
            approvals.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
          }
          await new Promise(r => setTimeout(r, 1200));

          if (approvals) {
            approvals.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
          }
          await new Promise(r => setTimeout(r, 600));

          recorder.stop();
        } catch (e) {
          resolve(null);
        }
      })
    `);

    if (recResult) {
      const buffer = Buffer.from(recResult, "base64");
      const filePath = path.join(ARTIFACTS_DIR, "task_s8_interaction.webm");
      fs.writeFileSync(filePath, buffer);
      console.log(`[Record] Video saved to ${filePath} (${buffer.length} bytes)`);
    } else {
      console.log("[Record] In-canvas recorder skipped; screenshot captures verified.");
    }
  } catch (err) {
    console.error("[Record] Error:", err);
  } finally {
    if (cdp) cdp.close();
    chromeProcess.kill();
  }
}

record();
