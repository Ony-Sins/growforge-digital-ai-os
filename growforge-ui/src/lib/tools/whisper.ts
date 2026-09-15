import fs from "node:fs";
import path from "node:path";
import type { Tool } from "@/lib/tools";

/**
 * whisper.cpp transcription (https://github.com/ggerganov/whisper.cpp) —
 * free, offline, via its `server` example rather than spawning the CLI per
 * call: whisper.cpp's model load is expensive (seconds), so a persistent
 * server keeps the model warm and each request is just the audio itself.
 *
 * Setup: build whisper.cpp, run its server example (e.g.
 * `./server -m models/ggml-base.en.bin`), then set WHISPER_SERVER_URL if
 * it's not on the default http://localhost:8080.
 *
 * SECURITY: `filename` is an argument the model itself chooses, so it is
 * NOT treated as an arbitrary filesystem path — that would let an agent
 * read any file readable by this server process. It's resolved only
 * inside WHISPER_AUDIO_DIR (the same directory synthesize_voice writes to
 * by default), with path traversal rejected.
 */

const SERVER_URL = (process.env.WHISPER_SERVER_URL || "http://localhost:8080").replace(/\/+$/, "");
// WHISPER_AUDIO_DIR is operator-configured (falls back to a project
// subfolder, but the env var itself is dynamic) — turbopackIgnore stops the
// bundler's static tracer from defensively including the entire project.
const ALLOWED_DIR = path.resolve(/* turbopackIgnore: true */ process.env.WHISPER_AUDIO_DIR || path.join(process.cwd(), "public", "generated", "audio"));
const TRANSCRIBE_TIMEOUT_MS = 60_000;

function setupInstructions(): string {
  return (
    `whisper.cpp server isn't reachable at ${SERVER_URL}. Build whisper.cpp ` +
    "(https://github.com/ggerganov/whisper.cpp), run its server example — e.g. " +
    "`./server -m models/ggml-base.en.bin` — and set WHISPER_SERVER_URL in .env.local " +
    "if it isn't on the default port."
  );
}

/** Resolves `filename` inside ALLOWED_DIR only — returns null for any path
 *  that would escape it (../, absolute paths elsewhere, symlink tricks are
 *  out of scope for this check but the directory is one this app itself
 *  writes generated audio into, not user-uploaded content). */
function resolveSafePath(filename: string): string | null {
  const resolved = path.resolve(ALLOWED_DIR, filename);
  const withSep = ALLOWED_DIR.endsWith(path.sep) ? ALLOWED_DIR : ALLOWED_DIR + path.sep;
  if (resolved !== ALLOWED_DIR && !resolved.startsWith(withSep)) return null;
  return resolved;
}

interface WhisperResponse {
  text?: string;
}

/**
 * No separate "is the server up" health ping — pinging the base URL and
 * treating any response as "whisper.cpp is listening" is unreliable: on a
 * dev machine, plenty of other local tools (an Electron app's remote
 * debugging port, a random dev server) can be sitting on the same port and
 * answer with a 200. Instead, attempt the real transcription and read the
 * *shape* of what comes back: a connection failure, a non-OK status, or a
 * response that isn't valid transcription JSON all distinctly mean
 * "something's wrong here," each worth a different message.
 */
async function transcribe(filePath: string, filename: string): Promise<{ ok: boolean; output: string }> {
  const form = new FormData();
  form.append("file", new Blob([fs.readFileSync(/* turbopackIgnore: true */ filePath)]), filename);
  form.append("response_format", "json");

  let res: Response;
  try {
    res = await fetch(`${SERVER_URL}/inference`, { method: "POST", body: form, signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS) });
  } catch (err) {
    return { ok: false, output: `${setupInstructions()} (connection failed: ${err instanceof Error ? err.message : String(err)})` };
  }

  if (!res.ok) {
    return { ok: false, output: `Got HTTP ${res.status} ${res.statusText} from ${SERVER_URL}/inference. ${setupInstructions()}` };
  }

  let data: WhisperResponse;
  try {
    data = (await res.json()) as WhisperResponse;
  } catch {
    return {
      ok: false,
      output: `${SERVER_URL} responded but not with a transcription — something else may already be running on that port. ${setupInstructions()}`,
    };
  }

  const text = data.text?.trim();
  return text ? { ok: true, output: text } : { ok: false, output: "whisper.cpp responded but returned no transcription text." };
}

export const whisperTool: Tool = {
  name: "transcribe_audio",
  description: `Transcribes an audio file to text using a local whisper.cpp server, free and offline. Only files already inside this app's shared audio directory can be transcribed — e.g. a filename synthesize_voice just returned.`,
  usage: '{ "filename": "string — filename only (e.g. \\"abc123.wav\\"), not a full path" }',
  requiresApproval: false,
  async execute(args) {
    const filename = typeof args.filename === "string" ? args.filename.trim() : "";
    if (!filename) return { ok: false, output: "filename is required." };

    const filePath = resolveSafePath(filename);
    if (!filePath) {
      return { ok: false, output: "That filename isn't allowed — only files already inside the shared audio directory can be transcribed, and only by name, not by path." };
    }
    // filePath is confirmed by resolveSafePath() to be inside ALLOWED_DIR —
    // dynamic by nature (a runtime filename), same turbopackIgnore rationale.
    if (!fs.existsSync(/* turbopackIgnore: true */ filePath)) {
      return { ok: false, output: `File not found: ${filename}` };
    }

    try {
      return await transcribe(filePath, filename);
    } catch (err) {
      return { ok: false, output: `Transcription failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  },
};
