import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { isPublicPreviewMode } from "./previewMode";
import { getSession, isOwnerSession } from "./session";
import { getInternalLoopbackSecret } from "./noraHeadless";
import { prewarmVoiceReasoner } from "./llm";

export const LOCAL_VOICE_ROOM = "room_vs_headless_default";
export const LOCAL_VOICE_AGENT = "nora_voice_agent";
const voiceDir = path.resolve(process.cwd(), "..", "voice-agent");

export async function localVoiceAllowed(req: Request): Promise<boolean> {
  const host = new URL(`http://${req.headers.get("host") || new URL(req.url).host}`).hostname;
  const origin = req.headers.get("origin");
  if (origin && !["http://localhost:3000", "http://127.0.0.1:3000"].includes(origin)) return false;
  return process.env.NODE_ENV === "development" && !isPublicPreviewMode()
    && ["localhost", "127.0.0.1", "[::1]"].includes(host)
    && isOwnerSession(await getSession());
}

export function localBridgeKey(): string {
  const configured = process.env.GROWFORGE_BRIDGE_KEY || process.env.GROWFORGE_INTERNAL_KEY;
  return configured?.trim() || fs.readFileSync(path.join(voiceDir, ".bridge_key"), "utf8").trim();
}

const globalVoice = globalThis as typeof globalThis & { __voiceStartup?: Promise<void> };
export async function ensureLocalVoice(options: { prewarmReasoner?: boolean } = {}): Promise<void> {
  if (globalVoice.__voiceStartup) return globalVoice.__voiceStartup;
  const work = async () => {
    getInternalLoopbackSecret();
    const probe = async () => {
      try { return (await fetch("http://127.0.0.1:7890/health", { signal: AbortSignal.timeout(1000), cache: "no-store" })).ok; }
      catch { return false; }
    };
    if (!await probe()) {
      const python = path.join(voiceDir, ".venv", "Scripts", "python.exe");
      const logDir = path.join(voiceDir, "logs");
      fs.mkdirSync(logDir, { recursive: true });
      const out = fs.openSync(path.join(logDir, "bridge.log"), "a");
      const child = spawn(python, ["-u", path.join(voiceDir, "desktop_bridge.py")], {
        cwd: voiceDir, windowsHide: true, detached: true, stdio: ["ignore", out, out],
      });
      child.on("error", () => {});
      child.unref();
      fs.closeSync(out);
      const deadline = Date.now() + 15000;
      while (!await probe()) {
        if (Date.now() > deadline) throw new Error("DESKTOP_BRIDGE_UNAVAILABLE");
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    }
    const requestedAt = Date.now()/1000;
    const reasonerWarmup = options.prewarmReasoner === false ? Promise.resolve(false) : prewarmVoiceReasoner();
    const response = await fetch("http://127.0.0.1:7890/voice/trigger", {
      method: "POST", headers: { "Content-Type": "application/json", "X-GrowForge-Bridge-Key": localBridgeKey() },
      body: JSON.stringify({ micOwner: "browser_livekit" }), signal: AbortSignal.timeout(90000),
    });
    if (!response.ok) throw new Error("VOICE_AGENT_START_FAILED");
    const deadline = Date.now() + 90000;
    while (true) {
      const status = await fetch("http://127.0.0.1:7890/voice/state", {
        headers: { "X-GrowForge-Bridge-Key": localBridgeKey() }, signal: AbortSignal.timeout(2000), cache: "no-store",
      });
      if (!status.ok) throw new Error("VOICE_STATE_UNAVAILABLE");
      const data = await status.json();
      if (data.agentReady && data.roomName === LOCAL_VOICE_ROOM && data.timestamp >= requestedAt && Date.now()/1000-data.timestamp < 5) { await reasonerWarmup; return; }
      if (Date.now() > deadline) throw new Error("AGENT_NOT_PRESENT");
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  };
  globalVoice.__voiceStartup = work().finally(() => { globalVoice.__voiceStartup = undefined; });
  return globalVoice.__voiceStartup;
}
