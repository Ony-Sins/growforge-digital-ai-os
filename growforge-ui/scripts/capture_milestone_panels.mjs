import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { WebSocket } from "ws";

const PORT = 9299;
const ARTIFACTS_DIR = "C:\\Users\\USERAS\\.gemini\\antigravity-ide\\brain\\da32380e-d045-4381-85a0-7167a9f17102";

async function capturePanels() {
  const chromeProcess = spawn(
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    [
      `--remote-debugging-port=${PORT}`,
      "--headless=new",
      "--disable-gpu-watchdog",
      "--window-size=1920,1080",
      `--user-data-dir=${path.join(ARTIFACTS_DIR, "scratch", "chrome_panels")}`,
      "http://localhost:3000",
    ],
    { stdio: "ignore" }
  );

  await new Promise((r) => setTimeout(r, 2500));

  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json`);
    const targets = await res.json();
    const page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r) => ws.on("open", r));

    let id = 1;
    const send = (method, params = {}) =>
      new Promise((resolve) => {
        const msgId = id++;
        const handler = (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.id === msgId) {
            ws.off("message", handler);
            resolve(msg.result);
          }
        };
        ws.on("message", handler);
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });

    await send("Page.enable");
    await send("Runtime.enable");
    await new Promise((r) => setTimeout(r, 4500));

    // Panel 1: CORE (d=880)
    let shot = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(ARTIFACTS_DIR, "brain01_panel_1_core.png"), Buffer.from(shot.data, "base64"));
    console.log("✓ Panel 1: CORE captured");

    // Move camera to Panel 2: ZOOM (d=720)
    await send("Runtime.evaluate", {
      expression: `(() => {
        const c = window.__THREE_CAMERA;
        const ctrl = window.__THREE_CONTROLS;
        if (c && ctrl) {
          c.position.set(0, 15, 720);
          ctrl.update();
        }
      })()`,
    });
    await new Promise((r) => setTimeout(r, 800));
    shot = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(ARTIFACTS_DIR, "brain01_panel_2_zoom.png"), Buffer.from(shot.data, "base64"));
    console.log("✓ Panel 2: ZOOM captured");

    // Move camera to Panel 3: DIVE (d=580)
    await send("Runtime.evaluate", {
      expression: `(() => {
        const c = window.__THREE_CAMERA;
        const ctrl = window.__THREE_CONTROLS;
        if (c && ctrl) {
          c.position.set(0, 15, 580);
          ctrl.update();
        }
      })()`,
    });
    await new Promise((r) => setTimeout(r, 800));
    shot = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(ARTIFACTS_DIR, "brain01_panel_3_dive.png"), Buffer.from(shot.data, "base64"));
    console.log("✓ Panel 3: DIVE captured");

    // Panel 4: BRAIN (d=460)
    await send("Runtime.evaluate", {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('nav button'));
        const brainBtn = btns.find(b => b.textContent.includes('Brain'));
        if (brainBtn) brainBtn.click();
        const c = window.__THREE_CAMERA;
        const ctrl = window.__THREE_CONTROLS;
        if (c && ctrl) {
          c.position.set(0, 15, 460);
          ctrl.update();
        }
      })()`,
    });
    await new Promise((r) => setTimeout(r, 1200));
    shot = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(ARTIFACTS_DIR, "brain01_panel_4_brain.png"), Buffer.from(shot.data, "base64"));
    console.log("✓ Panel 4: BRAIN captured");

    ws.close();
  } catch (err) {
    console.error("Error capturing panels:", err);
  } finally {
    chromeProcess.kill();
  }
}

capturePanels();
