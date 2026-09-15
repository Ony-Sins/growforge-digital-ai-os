import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Tool } from "@/lib/tools";

/**
 * Piper text-to-speech (https://github.com/rhasspy/piper) — free, offline,
 * fast enough to spawn fresh per call (unlike whisper.cpp, there's no
 * expensive model-load step worth keeping a server warm for).
 *
 * Setup: install Piper, download a voice model (a `.onnx` + matching
 * `.onnx.json`), and point PIPER_MODEL_PATH at the `.onnx` file. Until
 * that's done, the tool reports exactly that instead of failing opaquely —
 * see isConfigured().
 */

const BINARY = process.env.PIPER_BINARY_PATH || "piper";
const MODEL_PATH = process.env.PIPER_MODEL_PATH || "";
const OUTPUT_DIR = process.env.PIPER_OUTPUT_DIR || path.join(process.cwd(), "public", "generated", "audio");
const PUBLIC_URL_PREFIX = "/generated/audio";
const TIMEOUT_MS = 30_000;
const MAX_TEXT_LENGTH = 2000;

function isConfigured(): boolean {
  // MODEL_PATH is an operator-configured env var (a user's local voice
  // model file), not a project source path — turbopackIgnore stops the
  // bundler's static tracer from defensively including the entire project
  // just because it can't prove this path is scoped. See PIPER_MODEL_PATH
  // in .env.example.
  return Boolean(MODEL_PATH) && fs.existsSync(/* turbopackIgnore: true */ MODEL_PATH);
}

function setupInstructions(): string {
  return (
    "Piper isn't set up yet. Install it from https://github.com/rhasspy/piper, download a voice " +
    "model (a .onnx file plus its matching .onnx.json), then set PIPER_MODEL_PATH in .env.local to " +
    "the .onnx file's full path. Set PIPER_BINARY_PATH too if `piper` isn't on your system PATH."
  );
}

function synthesize(text: string): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const filename = `${crypto.randomUUID()}.wav`;
    const outputPath = path.join(OUTPUT_DIR, filename);

    let proc: ReturnType<typeof spawn>;
    try {
      // Same rationale as isConfigured() above — BINARY/MODEL_PATH are
      // operator-configured, not project source paths.
      proc = spawn(/* turbopackIgnore: true */ BINARY, ["--model", MODEL_PATH, "--output_file", outputPath]);
    } catch (err) {
      resolve({ ok: false, output: `Couldn't launch the Piper binary (${BINARY}): ${err instanceof Error ? err.message : String(err)}` });
      return;
    }

    let stderr = "";
    let settled = false;
    const finish = (result: { ok: boolean; output: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };

    const timeout = setTimeout(() => {
      proc.kill();
      finish({ ok: false, output: `Piper timed out after ${TIMEOUT_MS / 1000}s.` });
    }, TIMEOUT_MS);

    proc.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });

    proc.on("error", (err) => {
      finish({ ok: false, output: `Couldn't run the Piper binary (${BINARY}): ${err.message}. Check PIPER_BINARY_PATH.` });
    });

    proc.on("close", (code) => {
      if (code !== 0 || !fs.existsSync(outputPath)) {
        finish({
          ok: false,
          output: `Piper exited with code ${code ?? "unknown"}.${stderr ? ` stderr: ${stderr.slice(0, 500)}` : ""}`,
        });
        return;
      }
      finish({ ok: true, output: `Generated speech audio: ${PUBLIC_URL_PREFIX}/${filename}` });
    });

    proc.stdin?.write(text);
    proc.stdin?.end();
  });
}

export const piperTool: Tool = {
  name: "synthesize_voice",
  description: "Converts text to spoken-word audio, locally and free, using Piper. Returns a URL to the generated .wav file under /generated/audio/.",
  usage: `{ "text": "string — what to say, max ${MAX_TEXT_LENGTH} characters" }`,
  requiresApproval: false,
  async execute(args) {
    const text = typeof args.text === "string" ? args.text.trim() : "";
    if (!text) return { ok: false, output: "text is required." };
    if (text.length > MAX_TEXT_LENGTH) {
      return { ok: false, output: `Text is too long for one call (${text.length} chars) — keep it under ${MAX_TEXT_LENGTH}.` };
    }
    if (!isConfigured()) return { ok: false, output: setupInstructions() };

    try {
      return await synthesize(text);
    } catch (err) {
      return { ok: false, output: `Piper failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  },
};
