import { spawn, execSync } from "child_process";
import fs from "fs";
import path from "path";
import { WebSocket } from "ws";

const PORT = 9260;
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
  console.log("=== Task C4: Recording Dock-Anchored Conversation & Attachment Support ===");

  const tempProfileDir = path.join(ARTIFACTS_DIR, "scratch", `chrome_record_c4_${Date.now()}`);
  fs.mkdirSync(tempProfileDir, { recursive: true });

  const tempFramesDir = path.join(ARTIFACTS_DIR, "scratch", "task_c4_video_frames");
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

    if (!wsUrl) {
      throw new Error("Could not acquire CDP target.");
    }

    cdp = new CDPClient(wsUrl);
    await cdp.connect();

    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("DOM.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      mobile: false,
    });

    // Reset storage for clean demonstration
    await cdp.eval(`
      localStorage.removeItem("growforge.chat.history");
      localStorage.setItem("growforge.userName", "Ony");
      localStorage.setItem("growforge.assistantName", "Nora");
      location.reload();
    `);

    await sleep(6500); // Allow arrival greeting to complete

    let frameIndex = 0;
    let recording = true;

    const captureLoop = async () => {
      while (recording) {
        try {
          const res = await cdp.send("Page.captureScreenshot", {
            format: "jpeg",
            quality: 80,
          });
          const buffer = Buffer.from(res.data, "base64");
          const framePath = path.join(tempFramesDir, `frame_${String(frameIndex++).padStart(4, "0")}.jpg`);
          fs.writeFileSync(framePath, buffer);
        } catch {}
        await sleep(100); // 10 fps
      }
    };

    const capturePromise = captureLoop();

    // 1. Stage an attachment
    console.log("[Record] Staging an attachment...");
    await cdp.eval(`
      (() => {
        const fileInput = document.querySelector(".studio-command-dock input[type='file']");
        if (fileInput) {
          const file = new File(["Brand: GrowthFlow\\nObjective: Launch Meta & Google Ads campaigns with 3x ROAS target."], "growthflow_brief.txt", { type: "text/plain" });
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);
          fileInput.files = dataTransfer.files;
          fileInput.dispatchEvent(new Event("change", { bubbles: true }));
        }
      })()
    `);
    await sleep(1500);

    // 2. Type message
    console.log("[Record] Typing prompt...");
    const promptText = "Review this attached marketing brief for our campaigns.";
    for (let i = 1; i <= promptText.length; i += 3) {
      const sub = promptText.slice(0, i);
      await cdp.eval(`
        (() => {
          const input = document.querySelector(".studio-command-dock input[type='text']");
          if (input) {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(input, ${JSON.stringify(sub)});
            input.dispatchEvent(new Event("input", { bubbles: true }));
          }
        })()
      `);
      await sleep(60);
    }
    await sleep(400);

    // 3. Submit
    console.log("[Record] Submitting prompt with attachment...");
    await cdp.eval(`
      (() => {
        const form = document.querySelector(".studio-command-dock");
        const submitBtn = form?.querySelector("button[type='submit']");
        if (submitBtn) {
          submitBtn.click();
        } else if (form) {
          form.requestSubmit();
        }
      })()
    `);

    await sleep(4000);

    // 4. Expand History upward from dock
    console.log("[Record] Expanding History upward from dock...");
    await cdp.eval(`
      (() => {
        const buttons = Array.from(document.querySelectorAll(".spatial-response-layer button"));
        const historyBtn = buttons.find(b => b.textContent.includes("View history") || b.getAttribute("aria-label")?.includes("Expand"));
        if (historyBtn) historyBtn.click();
      })()
    `);

    await sleep(2200);

    // 5. Collapse back to compact
    console.log("[Record] Collapsing back to compact...");
    await cdp.eval(`
      (() => {
        const buttons = Array.from(document.querySelectorAll(".spatial-response-layer button"));
        const collapseBtn = buttons.find(b => b.textContent.includes("Collapse to latest") || b.getAttribute("aria-label")?.includes("Collapse"));
        if (collapseBtn) collapseBtn.click();
      })()
    `);

    await sleep(1500);

    // 6. Dismiss
    console.log("[Record] Dismissing compact response...");
    await cdp.eval(`
      (() => {
        const buttons = Array.from(document.querySelectorAll(".spatial-response-layer button"));
        const dismissBtn = buttons.find(b => b.textContent.includes("Dismiss") || b.getAttribute("aria-label")?.includes("Dismiss"));
        if (dismissBtn) dismissBtn.click();
      })()
    `);

    await sleep(1200);

    // 7. Toggle History from Header Assistant button
    console.log("[Record] Toggling History from Header Assistant button...");
    await cdp.eval(`
      (() => {
        const headerBtns = Array.from(document.querySelectorAll("header button"));
        const assistantBtn = headerBtns.find(b => b.textContent.includes("Assistant") || b.getAttribute("aria-label")?.includes("Assistant"));
        if (assistantBtn) assistantBtn.click();
      })()
    `);

    await sleep(2000);

    recording = false;
    await capturePromise;

    console.log(`[Record] Captured ${frameIndex} frames.`);

    // Encode to WebM using ffmpeg
    const outputVideo = path.join(ARTIFACTS_DIR, "task_c4_dock_conversation_recording.webm");
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
