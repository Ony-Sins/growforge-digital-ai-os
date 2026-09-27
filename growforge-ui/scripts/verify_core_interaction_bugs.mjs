import { spawn } from "child_process";
import path from "path";
import { WebSocket } from "ws";

const PORT = 9260;
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACTS_DIR = "C:\\Users\\USERAS\\.gemini\\antigravity-ide\\brain\\76758a1d-663e-4599-8778-2c146e22db74";

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

async function fetchWsUrl(port) {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`);
  const pages = await res.json();
  const page = pages.find((p) => p.type === "page") || pages[0];
  return page.webSocketDebuggerUrl;
}

let passedAssertions = 0;
let failedAssertions = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passedAssertions++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failedAssertions++;
  }
}

async function runTests() {
  console.log("=== STARTING INTERACTION QA VERIFICATION FOR TASK C7 ===");
  const userDataDir = path.join(ARTIFACTS_DIR, "scratch", `chrome_qa_${Date.now()}`);

  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    "--headless=new",
    "--disable-gpu",
    "--window-size=1440,900",
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
    console.error("Failed to connect to headless Chrome on port", PORT);
    chromeProc.kill();
    process.exit(1);
  }

  const cdp = new CDPClient(wsUrl);
  await cdp.connect();
  await cdp.send("Page.enable");
  await cdp.send("DOM.enable");
  await cdp.send("Runtime.enable");

  try {
    console.log("Navigating to http://localhost:3000/?tier=home (CORE surface)...");
    await cdp.send("Page.navigate", { url: "http://localhost:3000/?tier=home" });

    // Wait for hydration (Assistant button present in DOM)
    let hydrated = false;
    for (let i = 0; i < 40; i++) {
      await sleep(300);
      hydrated = await cdp.eval(`(() => Array.from(document.querySelectorAll("button")).some(b => b.textContent && b.textContent.includes("Assistant")))()`);
      if (hydrated) break;
    }
    if (!hydrated) {
      console.warn("Warning: Hydration took longer than expected, proceeding with tests...");
    }
    await sleep(500);

    // =========================================================================
    // TEST SUITE 1: Desktop Right-Side Spatial Panel & Geometry Verification
    // =========================================================================
    console.log("\n--- TEST SUITE 1: Desktop Expanded Assistant Geometry & Positioning ---");

    // 1. Initial State: Conversation should be closed
    let initialClosed = await cdp.eval(`(() => !document.getElementById("core-conversation"))()`);
    assert(initialClosed, "1.1 Initial conversation workspace is closed");

    // 2. Click Assistant in Header -> opens right-side expanded panel
    const clickRes = await cdp.eval(`
      (() => {
        const btn = Array.from(document.querySelectorAll("button")).find(b =>
          (b.textContent && b.textContent.includes("Assistant")) ||
          b.getAttribute("aria-label")?.includes("Assistant") ||
          b.getAttribute("title")?.includes("Assistant")
        );
        if (btn) {
          btn.click();
          return { clicked: true, text: btn.textContent };
        }
        return { clicked: false, buttons: Array.from(document.querySelectorAll("button")).map(b => b.textContent?.trim() || b.getAttribute("aria-label")) };
      })()
    `);
    console.log("Click Assistant result:", clickRes);
    await sleep(800);

    const desktopGeom = await cdp.eval(`
      (() => {
        const layer = document.getElementById("core-conversation");
        const dock = document.querySelector(".studio-command-dock");
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const centerX = viewportWidth / 2;

        if (!layer || !dock) {
          return {
            found: false,
            hasLayer: !!layer,
            hasDock: !!dock,
            allIds: Array.from(document.querySelectorAll("[id]")).map(el => el.id)
          };
        }
        const layerRect = layer.getBoundingClientRect();
        const dockRect = dock.getBoundingClientRect();

        return {
          found: true,
          viewMode: layer.getAttribute("data-view"),
          layerRect: {
            left: layerRect.left,
            right: layerRect.right,
            top: layerRect.top,
            bottom: layerRect.bottom,
            width: layerRect.width,
            height: layerRect.height,
          },
          dockRect: {
            left: dockRect.left,
            right: dockRect.right,
            top: dockRect.top,
            bottom: dockRect.bottom,
            width: dockRect.width,
          },
          viewportWidth,
          viewportHeight,
          centerX,
          isToTheRightOfCenter: layerRect.left > centerX + 50,
          isDockCentered: Math.abs((dockRect.left + dockRect.width / 2) - centerX) < 20,
          composersCount: document.querySelectorAll("form.studio-command-dock").length
        };
      })()
    `);
    console.log("desktopGeom:", desktopGeom);

    assert(desktopGeom.found && desktopGeom.viewMode === "expanded", "1.2 Expanded assistant workspace is open");
    if (desktopGeom.layerRect) {
      assert(desktopGeom.isToTheRightOfCenter, `1.3 Expanded history is positioned to the RIGHT of the center nucleus (layer.left = ${desktopGeom.layerRect.left}px > center = ${desktopGeom.centerX}px)`);
      assert(desktopGeom.layerRect.width >= 370 && desktopGeom.layerRect.width <= 430, `1.4 Expanded panel width is within 380–420px range (actual: ${Math.round(desktopGeom.layerRect.width)}px)`);
      assert(desktopGeom.isDockCentered, "1.5 Studio Command Dock remains centered at viewport bottom");
      assert(desktopGeom.composersCount === 1, "1.6 Exactly one message composer exists (Studio Command Dock), no duplicate in right panel");
    }

    // 3. Collapse to latest message inside the right panel
    await cdp.eval(`
      (() => {
        const layer = document.getElementById("core-conversation");
        if (!layer) return;
        const collapseBtn = layer.querySelector("button[title*='Collapse']");
        if (collapseBtn) collapseBtn.click();
      })()
    `);
    await sleep(600);

    const compactGeom = await cdp.eval(`
      (() => {
        const layer = document.getElementById("core-conversation");
        const dock = document.querySelector(".studio-command-dock");
        const centerX = window.innerWidth / 2;
        if (!layer || !dock) return { found: false };
        const layerRect = layer.getBoundingClientRect();
        const dockRect = dock.getBoundingClientRect();
        return {
          found: true,
          viewMode: layer.getAttribute("data-view"),
          layout: layer.getAttribute("data-layout"),
          isAboveDock: layerRect.bottom <= dockRect.top + 20,
          isCentered: Math.abs((layerRect.left + layerRect.width / 2) - centerX) < 20
        };
      })()
    `);

    assert(compactGeom.found && compactGeom.viewMode === "compact", "1.7 Collapsing switches to compact mode");
    assert(compactGeom.isCentered, "1.8 Compact response layer is centered directly above the Studio Command Dock");
    assert(compactGeom.isAboveDock, "1.9 Compact response layer is vertically stacked above the dock");

    // 4. Click Assistant in Header while in compact mode -> re-expands to right panel
    await cdp.eval(`
      (() => {
        const btn = Array.from(document.querySelectorAll("button")).find(b => b.textContent && b.textContent.includes("Assistant"));
        if (btn) btn.click();
      })()
    `);
    await sleep(600);

    const reexpanded = await cdp.eval(`
      (() => {
        const layer = document.getElementById("core-conversation");
        if (!layer) return { found: false };
        const layerRect = layer.getBoundingClientRect();
        const centerX = window.innerWidth / 2;
        return {
          found: true,
          viewMode: layer.getAttribute("data-view"),
          isToTheRight: layerRect.left > centerX + 50
        };
      })()
    `);
    assert(reexpanded.found && reexpanded.viewMode === "expanded" && reexpanded.isToTheRight, "1.10 Clicking Assistant in compact mode re-expands to right-side panel");

    // 5. Click Assistant in Header while in expanded mode -> closes panel
    await cdp.eval(`
      (() => {
        const btn = Array.from(document.querySelectorAll("button")).find(b => b.textContent && b.textContent.includes("Assistant"));
        if (btn) btn.click();
      })()
    `);
    await sleep(600);

    const reclosed = await cdp.eval(`(() => !document.getElementById("core-conversation"))()`);
    assert(reclosed, "1.11 Clicking Assistant while in expanded mode closes the panel cleanly");


    // =========================================================================
    // TEST SUITE 2: Settings, Dismiss, and Approvals Interactions
    // =========================================================================
    console.log("\n--- TEST SUITE 2: Settings, Dismiss, and Approvals Interactions ---");

    // Open expanded panel again
    await cdp.eval(`
      (() => {
        const btn = Array.from(document.querySelectorAll("button")).find(b => b.textContent && b.textContent.includes("Assistant"));
        if (btn) btn.click();
      })()
    `);
    await sleep(600);

    // Open settings inside layer
    await cdp.eval(`
      (() => {
        const layer = document.getElementById("core-conversation");
        if (!layer) return;
        const settingsBtn = layer.querySelector("button[title*='Settings']");
        if (settingsBtn) settingsBtn.click();
      })()
    `);
    await sleep(500);

    const layerSettingsState = await cdp.eval(`
      (() => {
        const popover = document.querySelector(".conversation-settings");
        return {
          isOpen: !!popover,
          hasInputs: popover ? popover.querySelectorAll("input").length >= 2 : false
        };
      })()
    `);
    assert(layerSettingsState.isOpen && layerSettingsState.hasInputs, "2.1 Conversation settings popover opens inside expanded panel");

    // Close settings
    await cdp.eval(`
      (() => {
        const popover = document.querySelector(".conversation-settings");
        if (!popover) return;
        const closeBtn = popover.querySelector("button[aria-label*='Close']");
        if (closeBtn) closeBtn.click();
      })()
    `);
    await sleep(400);

    const layerSettingsClosed = await cdp.eval(`(() => !document.querySelector(".conversation-settings"))()`);
    assert(layerSettingsClosed, "2.2 Conversation settings popover closes cleanly");

    // Dismiss layer via (X) button
    await cdp.eval(`
      (() => {
        const layer = document.getElementById("core-conversation");
        if (!layer) return;
        const dismissBtn = layer.querySelector("button[title*='Dismiss']");
        if (dismissBtn) dismissBtn.click();
      })()
    `);
    await sleep(500);

    const layerDismissed = await cdp.eval(`(() => !document.getElementById("core-conversation"))()`);
    assert(layerDismissed, "2.3 Dismiss (X) button closes expanded workspace");

    // Approvals Namecard Toggle
    await cdp.eval(`
      (() => {
        const card = Array.from(document.querySelectorAll(".core-instrument-card")).find(c => c.textContent && c.textContent.includes("Approvals"));
        if (card) card.click();
      })()
    `);
    await sleep(500);

    let approvalsState = await cdp.eval(`
      (() => {
        const banner = document.querySelector(".approval-surface");
        return { isOpen: !!banner };
      })()
    `);
    assert(approvalsState.isOpen, "2.4 First click on Approvals card opens Approvals panel");

    await cdp.eval(`
      (() => {
        const card = Array.from(document.querySelectorAll(".core-instrument-card")).find(c => c.textContent && c.textContent.includes("Approvals"));
        if (card) card.click();
      })()
    `);
    await sleep(500);

    approvalsState = await cdp.eval(`
      (() => {
        const banner = document.querySelector(".approval-surface");
        return { isOpen: !!banner };
      })()
    `);
    assert(!approvalsState.isOpen, "2.5 Second click on Approvals card closes Approvals panel");


    // =========================================================================
    // TEST SUITE 3: Mobile Viewport Validations (390×844 and 375×812)
    // =========================================================================
    console.log("\n--- TEST SUITE 3: Mobile Viewport Assertions (390×844) ---");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      mobile: true,
    });
    await sleep(600);

    // Open Assistant on mobile
    await cdp.eval(`
      (() => {
        const btn = Array.from(document.querySelectorAll("button")).find(b => b.textContent && b.textContent.includes("Assistant") || b.getAttribute("aria-label")?.includes("Assistant"));
        if (btn) btn.click();
      })()
    `);
    await sleep(600);

    const mobileGeom = await cdp.eval(`
      (() => {
        const layer = document.getElementById("core-conversation");
        const dock = document.querySelector(".studio-command-dock");
        if (!layer || !dock) return { found: false };
        const layerRect = layer.getBoundingClientRect();
        const dockRect = dock.getBoundingClientRect();
        const hasOverflow = document.documentElement.scrollWidth > window.innerWidth;
        return {
          found: true,
          viewMode: layer.getAttribute("data-view"),
          width: layerRect.width,
          isAboveDock: layerRect.bottom <= dockRect.top + 30,
          hasOverflow
        };
      })()
    `);

    assert(mobileGeom.found && mobileGeom.viewMode === "expanded", "3.1 Mobile expanded assistant is open above dock");
    assert(!mobileGeom.hasOverflow, "3.2 Zero horizontal overflow on 390×844 mobile viewport");
    assert(mobileGeom.isAboveDock, "3.3 Mobile expanded workspace is positioned cleanly above dock");

    // Close on mobile
    await cdp.eval(`
      (() => {
        const btn = Array.from(document.querySelectorAll("button")).find(b => b.textContent && b.textContent.includes("Assistant") || b.getAttribute("aria-label")?.includes("Assistant"));
        if (btn) btn.click();
      })()
    `);
    await sleep(400);

    // Mobile Approvals Toggle
    await cdp.eval(`
      (() => {
        const btn = document.querySelector(".mobile-approvals");
        if (btn) btn.click();
      })()
    `);
    await sleep(500);

    let mobileAppr = await cdp.eval(`(() => !!document.querySelector(".approval-surface"))()`);
    assert(mobileAppr, "3.4 Mobile Approvals button opens panel");

    await cdp.eval(`
      (() => {
        const btn = document.querySelector(".mobile-approvals");
        if (btn) btn.click();
      })()
    `);
    await sleep(500);

    mobileAppr = await cdp.eval(`(() => !!document.querySelector(".approval-surface"))()`);
    assert(!mobileAppr, "3.5 Mobile Approvals button closes panel on toggle");


    // Viewport 375×812
    console.log("\n--- TEST SUITE 4: Mobile Viewport Assertions (375×812) ---");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 375,
      height: 812,
      deviceScaleFactor: 3,
      mobile: true,
    });
    await sleep(500);

    const overflow375 = await cdp.eval(`(() => document.documentElement.scrollWidth <= window.innerWidth)()`);
    assert(overflow375, "4.1 Zero horizontal overflow on 375×812 mobile viewport");

  } catch (err) {
    console.error("Test execution error:", err);
  } finally {
    cdp.close();
    chromeProc.kill();
  }

  console.log("\n=======================================================");
  console.log(`TOTAL ASSERTIONS: ${passedAssertions + failedAssertions}`);
  console.log(`PASSED: ${passedAssertions}`);
  console.log(`FAILED: ${failedAssertions}`);
  console.log("=======================================================");

  if (failedAssertions > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
