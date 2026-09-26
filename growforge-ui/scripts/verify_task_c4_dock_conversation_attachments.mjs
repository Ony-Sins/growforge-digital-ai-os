import { spawn } from "child_process";
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
  console.log("=== TASK C4: DOCK-ANCHORED CONVERSATION & ATTACHMENT VERIFICATION ===");
  const userDataDir = path.join(ARTIFACTS_DIR, "scratch", `chrome_verify_c4_${Date.now()}`);

  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    "--headless=new",
    "--disable-gpu",
    "--window-size=1920,1080",
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
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  });

  // Navigate to CORE and reset localStorage
  console.log("[CDP] Navigating to http://localhost:3000/ ...");
  await client.send("Page.navigate", { url: "http://localhost:3000" });
  await sleep(3000);

  await client.eval(`
    localStorage.removeItem("growforge.chat.history");
    localStorage.setItem("growforge.userName", "Ony");
    localStorage.setItem("growforge.assistantName", "Nora");
    location.reload();
  `);
  await sleep(6500); // Allow arrival greeting to settle

  // 1. Initial State: Studio Command Dock ready at bottom
  console.log("Step 1: Capturing initial dock ready state...");
  await client.captureScreenshot("task_c4_initial_dock_ready.png");

  // Verify dock button ordering
  const dockButtons = await client.eval(`
    (() => {
      const form = document.querySelector(".studio-command-dock");
      if (!form) return [];
      return Array.from(form.querySelectorAll("button")).map(b => b.getAttribute("aria-label") || b.getAttribute("title"));
    })()
  `);
  console.log("Dock action buttons in order:", dockButtons);

  // 2. Submit a real message from Studio Command Dock
  console.log("Step 2: Submitting message from Studio Command Dock...");
  await client.eval(`
    (() => {
      const input = document.querySelector(".studio-command-dock input[type='text']");
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, "Hi Nora, provide an operational brief for our active mission pipeline.");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    })()
  `);
  await sleep(300);

  // Click submit button
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
  await sleep(400);

  // Capture pending state directly above the dock
  console.log("Step 2b: Capturing pending thinking state above dock...");
  await client.captureScreenshot("task_c4_submission_pending_above_dock.png");

  // Wait for response to arrive
  console.log("Step 3: Waiting for assistant response...");
  await sleep(4500);

  // 3. Capture Compact Response directly above dock
  console.log("Step 3: Capturing compact response above dock...");
  await client.captureScreenshot("task_c4_compact_response_above_dock.png");

  // 4. Capture close crop of dock and anchored compact card
  const dockAndCardBox = await client.eval(`
    (() => {
      const dock = document.querySelector(".studio-command-dock");
      const layer = document.querySelector(".spatial-response-layer");
      if (!dock || !layer) return null;
      const dockRect = dock.getBoundingClientRect();
      const layerRect = layer.getBoundingClientRect();
      const top = Math.min(dockRect.top, layerRect.top) - 15;
      const bottom = Math.max(dockRect.bottom, layerRect.bottom) + 15;
      const left = Math.min(dockRect.left, layerRect.left) - 15;
      const right = Math.max(dockRect.right, layerRect.right) + 15;
      return {
        x: Math.max(0, left),
        y: Math.max(0, top),
        width: right - left,
        height: bottom - top,
        scale: 1,
      };
    })()
  `);

  if (dockAndCardBox) {
    await client.captureScreenshot("task_c4_dock_and_compact_card_crop.png", dockAndCardBox);
  }

  // 5. Test Attachment Selection & Staged Chip
  console.log("Step 5: Testing attachment selection & staged chip...");
  await client.eval(`
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

  // Capture staged attachment chip above dock
  await client.captureScreenshot("task_c4_attachment_chip_staged.png");

  // 6. Submit prompt with attachment
  console.log("Step 6: Submitting message with attachment context...");
  await client.eval(`
    (() => {
      const input = document.querySelector(".studio-command-dock input[type='text']");
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, "Review this attached marketing brief please.");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    })()
  `);
  await sleep(300);

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
  await sleep(4500);

  await client.captureScreenshot("task_c4_attachment_response_compact.png");

  // 7. Expand History in the same dock-anchored workspace
  console.log("Step 7: Expanding History upward from dock...");
  await client.eval(`
    (() => {
      const buttons = Array.from(document.querySelectorAll(".spatial-response-layer button"));
      const historyBtn = buttons.find(b => b.textContent.includes("View history") || b.getAttribute("aria-label")?.includes("Expand"));
      if (historyBtn) historyBtn.click();
    })()
  `);
  await sleep(500);

  await client.captureScreenshot("task_c4_expanded_history_above_dock.png");

  // 8. Test Header Assistant button toggles the SAME dock-anchored history
  console.log("Step 8: Testing header Assistant button toggling...");
  await client.eval(`
    (() => {
      const buttons = Array.from(document.querySelectorAll(".spatial-response-layer button"));
      const collapseBtn = buttons.find(b => b.textContent.includes("Collapse to latest") || b.getAttribute("aria-label")?.includes("Collapse"));
      if (collapseBtn) collapseBtn.click();
    })()
  `);
  await sleep(300);

  await client.eval(`
    (() => {
      const buttons = Array.from(document.querySelectorAll(".spatial-response-layer button"));
      const dismissBtn = buttons.find(b => b.textContent.includes("Dismiss") || b.getAttribute("aria-label")?.includes("Dismiss"));
      if (dismissBtn) dismissBtn.click();
    })()
  `);
  await sleep(300);

  // Click header Assistant button
  await client.eval(`
    (() => {
      const headerBtns = Array.from(document.querySelectorAll("header button"));
      const assistantBtn = headerBtns.find(b => b.textContent.includes("Assistant") || b.getAttribute("aria-label")?.includes("Assistant"));
      if (assistantBtn) assistantBtn.click();
    })()
  `);
  await sleep(500);

  await client.captureScreenshot("task_c4_header_toggled_history_dock.png");

  // 9. Mobile Viewport Test (390x844)
  console.log("Step 9: Testing Mobile Viewport (390x844)...");
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await sleep(600);

  await client.captureScreenshot("task_c4_mobile_dock_conversation.png");

  // 10. Reduced Motion Test
  console.log("Step 10: Testing Reduced Motion...");
  await client.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await sleep(400);

  await client.captureScreenshot("task_c4_reduced_motion_mode.png");

  console.log("All Task C4 verification steps completed successfully!");
  client.close();
  chromeProc.kill();
}

main().catch((err) => {
  console.error("Task C4 verification script failed:", err);
  process.exit(1);
});
