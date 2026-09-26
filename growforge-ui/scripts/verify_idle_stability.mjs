import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACTS_DIR = "C:\\Users\\USERAS\\.gemini\\antigravity-ide\\brain\\e9f900bb-6eb8-40e3-a417-95e2f97d18fa";
const PORT = 9227;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.callbacks = new Map();
    this.events = new Map();

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      } else if (msg.method && this.events.has(msg.method)) {
        for (const cb of this.events.get(msg.method)) {
          cb(msg.params);
        }
      }
    };
  }

  async ready() {
    if (this.ws.readyState === WebSocket.OPEN) return;
    return new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
  }

  async send(method, params = {}) {
    await this.ready();
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(JSON.stringify(res.exceptionDetails));
    }
    return res.result ? res.result.value : undefined;
  }

  async captureScreenshot(filename) {
    const res = await this.send("Page.captureScreenshot", { format: "png" });
    const buffer = Buffer.from(res.data, "base64");
    const outPath = path.join(ARTIFACTS_DIR, filename);
    fs.writeFileSync(outPath, buffer);
    console.log(`[CDP] Screenshot saved: ${filename} (${buffer.length} bytes)`);
  }

  close() {
    this.ws.close();
  }
}

async function run() {
  console.log("[Test] Launching Chrome for Idle Nucleus Stability Verification...");
  const chromeProcess = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${PORT}`,
      "--headless=new",
      "--disable-gpu-watchdog",
      "--disable-features=CalculateNativeWinOcclusion",
      "--window-size=1920,1080",
      "--user-data-dir=" + path.join(ARTIFACTS_DIR, "scratch", "chrome_temp_idle"),
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

    if (!wsUrl) throw new Error("Failed to find Chrome WebSocket debugger target");

    cdp = new CDPClient(wsUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      mobile: false,
    });

    console.log("[Test] Connected to Chrome. Waiting 3s for WebGL scene initialization...");
    await sleep(3000);

    // Initial Screenshot
    await cdp.captureScreenshot("nucleus_idle_initial.png");

    // Continuous 60s monitoring (sample every 5s)
    console.log("[Test] Sampling idle nucleus metrics continuously over 60 seconds...");
    const samples = [];
    for (let s = 0; s <= 12; s++) {
      const sample = await cdp.eval(`
        (() => {
          const eng = window.__THREE_NEUTRON_ENGINE;
          if (!eng) return null;
          const innerScale = eng.coreSprite ? eng.coreSprite.scale.x : null;
          const innerOpacity = eng.coreSprite ? eng.coreSprite.material.opacity : null;
          const outerScale = eng.outerCoronaSprite ? eng.outerCoronaSprite.scale.x : null;
          const outerOpacity = eng.outerCoronaSprite ? eng.outerCoronaSprite.material.opacity : null;
          const nucleusUniforms = eng.nucleusMaterial ? {
            pulse: eng.nucleusMaterial.uniforms.uPulse.value,
            brightness: eng.nucleusMaterial.uniforms.uBrightness.value
          } : null;
          const particleUniforms = eng.shaderMaterial ? {
            pulse: eng.shaderMaterial.uniforms.uPulse.value,
            brightness: eng.shaderMaterial.uniforms.uBrightness.value,
            flowSpeed: eng.shaderMaterial.uniforms.uFlowSpeed.value
          } : null;
          const state = eng.getState();
          return {
            timeSec: ${s * 5},
            state,
            innerScale,
            innerOpacity,
            outerScale,
            outerOpacity,
            nucleusUniforms,
            particleUniforms
          };
        })()
      `);

      if (sample) {
        samples.push(sample);
        console.log(`[Sample t=${s * 5}s] InnerScale=${sample.innerScale?.toFixed(3)}, InnerOpacity=${sample.innerOpacity?.toFixed(4)}, uPulse=${sample.nucleusUniforms?.pulse?.toFixed(4)}`);
      }
      if (s < 12) {
        await sleep(5000);
      }
    }

    // 60s Screenshot
    await cdp.captureScreenshot("nucleus_idle_60s.png");

    // Optical FOV zoom for close-up screenshot and recording
    console.log("[Test] Setting optical FOV zoom on the nucleus...");
    await cdp.eval(`
      (() => {
        const camera = window.__THREE_CAMERA;
        if (camera) {
          camera.fov = 14;
          camera.updateProjectionMatrix();
        }
      })()
    `);
    await sleep(1500);
    await cdp.captureScreenshot("nucleus_idle_closeup.png");

    // Record 4s WebM video of close-up nucleus motion
    console.log("[Test] Recording canvas (4s) for nucleus_idle_recording.webm...");
    await cdp.eval(`
      (() => {
        const canvas = document.querySelector('canvas');
        if (!canvas) return;
        const stream = canvas.captureStream(60);
        const recordedChunks = [];
        const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) recordedChunks.push(e.data);
        };
        window.__RECORDING_PROMISE = new Promise((resolve) => {
          mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          };
        });
        mediaRecorder.start();
        window.__MEDIA_RECORDER = mediaRecorder;
      })()
    `);

    await sleep(4000);

    const videoDataUrl = await cdp.eval(`
      (async () => {
        if (window.__MEDIA_RECORDER && window.__MEDIA_RECORDER.state !== 'inactive') {
          window.__MEDIA_RECORDER.stop();
        }
        return await window.__RECORDING_PROMISE;
      })()
    `);

    if (videoDataUrl) {
      const base64Data = videoDataUrl.replace(/^data:video\/webm;base64,/, "");
      const videoPath = path.join(ARTIFACTS_DIR, "nucleus_idle_recording.webm");
      fs.writeFileSync(videoPath, Buffer.from(base64Data, "base64"));
      console.log(`[Test] Video saved: nucleus_idle_recording.webm (${Buffer.byteLength(base64Data, "base64")} bytes)`);
    }

    // Restore camera FOV
    await cdp.eval(`
      (() => {
        const camera = window.__THREE_CAMERA;
        if (camera) {
          camera.fov = 45;
          camera.updateProjectionMatrix();
        }
      })()
    `);

    // Calculate Variance / Stability Metrics
    const innerScales = samples.map((s) => s.innerScale).filter(Boolean);
    const minScale = Math.min(...innerScales);
    const maxScale = Math.max(...innerScales);
    const scaleVariance = ((maxScale - minScale) / minScale) * 100;

    const innerOpacities = samples.map((s) => s.innerOpacity).filter(Boolean);
    const minOp = Math.min(...innerOpacities);
    const maxOp = Math.max(...innerOpacities);
    const opacityVariance = ((maxOp - minOp) / minOp) * 100;

    const metrics = {
      test_duration_sec: 60,
      samples_count: samples.length,
      scale_stability: {
        min_inner_scale: minScale,
        max_inner_scale: maxScale,
        scale_variance_percent: Number(scaleVariance.toFixed(4)),
        is_rock_solid: scaleVariance < 0.001,
      },
      opacity_stability: {
        min_inner_opacity: minOp,
        max_inner_opacity: maxOp,
        opacity_variance_percent: Number(opacityVariance.toFixed(4)),
        is_rock_solid: opacityVariance < 0.001,
      },
      pulse_uniform: {
        value: samples[0]?.nucleusUniforms?.pulse,
        is_stable_one: samples.every((s) => Math.abs(s.nucleusUniforms?.pulse - 1.0) < 0.0001),
      },
      samples,
    };

    fs.writeFileSync(
      path.join(ARTIFACTS_DIR, "nucleus_idle_stability_metrics.json"),
      JSON.stringify(metrics, null, 2)
    );

    console.log("\n========================================");
    console.log("[Test] IDLE NUCLEUS STABILITY VERIFICATION RESULTS:");
    console.log(JSON.stringify(metrics.scale_stability, null, 2));
    console.log(JSON.stringify(metrics.opacity_stability, null, 2));
    console.log(`Pulse Uniform is 1.0 (Zero Breathing): ${metrics.pulse_uniform.is_stable_one}`);
    console.log("========================================\n");
  } finally {
    if (cdp) cdp.close();
    chromeProcess.kill("SIGKILL");
  }
}

run().catch((e) => {
  console.error("[Test Error]", e);
  process.exit(1);
});
