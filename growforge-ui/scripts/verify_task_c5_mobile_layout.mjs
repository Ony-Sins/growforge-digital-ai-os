import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { WebSocket } from "ws";

const PORT = 9255;
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACTS_DIR = "C:\\Users\\USERAS\\.gemini\\antigravity-ide\\brain\\c4d3a79e-3f94-4ece-92cb-7ef887dc3776";

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

async function fetchWsUrl(port) {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`);
  const pages = await res.json();
  const page = pages.find((p) => p.type === "page") || pages[0];
  return page.webSocketDebuggerUrl;
}

async function main() {
  console.log("=== TASK C5: MOBILE CORE LAYOUT VERIFICATION ===");
  const userDataDir = path.join(ARTIFACTS_DIR, "scratch", `chrome_verify_c5_${Date.now()}`);

  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    "--headless=new",
    "--disable-gpu",
    "--window-size=390,844",
    "about:blank",
  ]);

  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
    await sleep(300);
    try {
      wsUrl = await fetchWsUrl(PORT);
      if (wsUrl) break;
    } catch {}
  }

  if (!wsUrl) {
    chromeProc.kill();
    throw new Error("Could not connect to Chrome debugging endpoint.");
  }

  const client = new CDPClient(wsUrl);
  await client.connect();

  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("DOM.enable");

  // ==========================================
  // SCENARIO 1: Viewport 390x844 (Standard Mobile)
  // ==========================================
  console.log("Scenario 1: Testing 390x844 (iPhone 14/15 size)...");
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });

  await client.send("Page.navigate", { url: "http://localhost:3000" });
  await sleep(3000);

  await client.eval(`
    localStorage.removeItem("growforge.chat.history");
    localStorage.setItem("growforge.userName", "Ony");
    localStorage.setItem("growforge.assistantName", "Nora");
    location.reload();
  `);
  await sleep(6500); // Allow arrival greeting to settle

  // 1. Initial State on 390x844: Dock clearly above bottom nav
  console.log("Step 1.1: Capturing 390x844 idle resting state...");
  await client.captureScreenshot("task_c5_390x844_idle_dock_above_nav.png");

  // 2. Submit Message on 390x844
  console.log("Step 1.2: Submitting message on 390x844...");
  await client.eval(`
    (() => {
      const input = document.querySelector(".studio-command-dock input[type='text']");
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, "Provide an operational brief for our Growth pipeline.");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    })()
  `);
  await sleep(400);

  await client.eval(`
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
  console.log("Waiting 4.5s for assistant response...");
  await sleep(4500);
  await client.captureScreenshot("task_c5_390x844_compact_response.png");

  // 3. Expand History on 390x844
  console.log("Step 1.3: Expanding history on 390x844...");
  await client.eval(`
    (() => {
      const buttons = Array.from(document.querySelectorAll(".spatial-response-layer button"));
      const viewHistBtn = buttons.find(b => b.textContent.includes("View history") || b.getAttribute("title")?.includes("Expand"));
      if (viewHistBtn) viewHistBtn.click();
    })()
  `);
  await sleep(600);
  await client.captureScreenshot("task_c5_390x844_expanded_history.png");

  // 4. Stage Attachment Chip on Mobile
  console.log("Step 1.4: Staging attachment chip on 390x844...");
  await client.eval(`
    (() => {
      const fileInput = document.querySelector("input[type='file']");
      if (!fileInput) return;
      const file = new File(["Brand marketing brief contents."], "growth_brief.txt", { type: "text/plain" });
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    })()
  `);
  await sleep(1500);
  await client.captureScreenshot("task_c5_390x844_attachment_staged.png");

  // 5. Open Settings Popover on 390x844
  console.log("Step 1.5: Opening settings popover on 390x844...");
  await client.eval(`
    (() => {
      const form = document.querySelector(".studio-command-dock");
      const settingsBtn = form ? form.querySelector("button[title='Conversation Settings']") : null;
      if (settingsBtn) settingsBtn.click();
    })()
  `);
  await sleep(400);
  await client.captureScreenshot("task_c5_390x844_settings_popover.png");

  // Close settings popover & collapse layer
  await client.eval(`
    (() => {
      const closeBtn = document.querySelector("button[aria-label='Close Settings']");
      if (closeBtn) closeBtn.click();
      const collapseBtn = document.querySelector("button[title='Collapse to latest message']");
      if (collapseBtn) collapseBtn.click();
    })()
  `);
  await sleep(300);

  // ==========================================
  // SCENARIO 2: Viewport 375x812 (Compact Mobile / iPhone Mini)
  // ==========================================
  console.log("Scenario 2: Testing 375x812 (iPhone Mini / SE size)...");
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 375,
    height: 812,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await sleep(600);
  await client.captureScreenshot("task_c5_375x812_compact_layout.png");

  // ==========================================
  // SCENARIO 3: Viewport 428x926 (Wider Mobile / iPhone Pro Max)
  // ==========================================
  console.log("Scenario 3: Testing 428x926 (iPhone Pro Max size)...");
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 428,
    height: 926,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await sleep(600);
  await client.captureScreenshot("task_c5_428x926_wide_mobile.png");

  // ==========================================
  // SCENARIO 4: Mobile Virtual Keyboard Simulation
  // ==========================================
  console.log("Scenario 4: Testing Virtual Keyboard open (simulating 260px keyboard offset)...");
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await client.eval(`
    (() => {
      const dock = document.querySelector(".studio-command-dock-wrapper");
      const layer = document.querySelector(".spatial-response-layer-wrapper");
      if (dock) dock.style.setProperty("--kb-offset", "260px");
      if (layer) layer.style.setProperty("--kb-offset", "260px");
    })()
  `);
  await sleep(400);
  await client.captureScreenshot("task_c5_mobile_keyboard_open.png");

  // Reset keyboard offset
  await client.eval(`
    (() => {
      const dock = document.querySelector(".studio-command-dock-wrapper");
      const layer = document.querySelector(".spatial-response-layer-wrapper");
      if (dock) dock.style.removeProperty("--kb-offset");
      if (layer) layer.style.removeProperty("--kb-offset");
    })()
  `);
  await sleep(300);

  // ==========================================
  // SCENARIO 5: Reduced Motion Mode
  // ==========================================
  console.log("Scenario 5: Testing Reduced Motion mode...");
  await client.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await sleep(400);
  await client.captureScreenshot("task_c5_reduced_motion.png");

  console.log("All Task C5 verification scenarios completed successfully!");
  client.close();
  chromeProc.kill();
}

main().catch((err) => {
  console.error("Task C5 verification failed:", err);
  process.exit(1);
});
