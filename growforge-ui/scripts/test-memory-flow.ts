/**
 * Phase 3 Integration Test: Memory Extraction, Atomic Persistence & Prompt Injection
 *
 * Run from the growforge-ui directory:
 *   npx tsx scripts/test-memory-flow.ts
 *
 * Uses tsx path aliases for @/ resolution. No Next.js server required.
 * Isolated to data/__test_memory_flow__/ -- cleaned up on exit.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

// Colour helpers
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;
const B = (s: string) => `\x1b[1m${s}\x1b[0m`;

let ok = 0, fail = 0;

function assert(label: string, cond: boolean, detail?: string) {
  if (cond) { console.log(G(`  v ${label}`)); ok++; }
  else { console.error(R(`  X ${label}${detail ? ` -- ${detail}` : ""}`)); fail++; }
}

const ROOT = path.resolve(__dirname, "..");
async function run() {
  const {
    getUserMemory,
    updateUserMemory,
    clearUserMemory,
    recordLearnedObservation,
    recordExplicitRejection,
    formatUserMemoryPrompt,
  } = await import("@/lib/userMemory");

  const EMAIL = "tester@growforge.io";

  // Suite 1: Initialization
  console.log(B("\n-- Suite 1: Initialization --"));
  const mem = getUserMemory(EMAIL);
  assert("returns object", typeof mem === "object" && mem !== null);
  assert("email normalized", mem.email === EMAIL);
  assert("writingStyle seeded", mem.writingStyle.length > 10);
  assert("brandRules seeded", mem.brandRules.length > 0);
  assert("explicitRejections seeded", mem.explicitRejections.length > 0);
  assert("learnedObservations seeded", mem.learnedObservations.length > 0);
  assert("createdAt ISO", mem.createdAt.includes("T"));
  assert("updatedAt ISO", mem.updatedAt.includes("T"));

  // Suite 2: Atomic Persistence
  console.log(B("\n-- Suite 2: Atomic Persistence --"));
  await new Promise((r: (v: void) => void) => setTimeout(r, 400));
  const storeFile = path.join(ROOT, "data", "user_memories.json");
  const tmpFile = storeFile + ".tmp";
  assert("user_memories.json written", fs.existsSync(storeFile));
  assert(".tmp cleaned up", !fs.existsSync(tmpFile));
  let parsed: Record<string, unknown> | null = null;
  try { parsed = JSON.parse(fs.readFileSync(storeFile, "utf8")); } catch { /* empty */ }
  assert("valid JSON on disk", parsed !== null);
  assert("email key in store", parsed !== null && EMAIL in parsed);

  // Suite 3: Rejection Extraction
  console.log(B("\n-- Suite 3: Rejection Extraction --"));
  const msg = "Please avoid cold-call scripts. Never recommend TV ads for our ICP.";
  recordExplicitRejection(EMAIL, msg);
  await new Promise((r: (v: void) => void) => setTimeout(r, 200));
  const r3 = getUserMemory(EMAIL);
  assert("avoid phrase extracted", r3.explicitRejections.some((r: string) => r.toLowerCase().includes("avoid")));
  assert("never phrase extracted", r3.explicitRejections.some((r: string) => r.toLowerCase().includes("never")));

  // Suite 4: Deduplication
  console.log(B("\n-- Suite 4: Deduplication --"));
  const before = getUserMemory(EMAIL).explicitRejections.length;
  recordExplicitRejection(EMAIL, msg);
  await new Promise((r: (v: void) => void) => setTimeout(r, 200));
  const after = getUserMemory(EMAIL).explicitRejections.length;
  assert("no duplicate stored", after === before, `before=${before} after=${after}`);

  // Suite 5: Learned Observations
  console.log(B("\n-- Suite 5: Learned Observations --"));
  recordLearnedObservation(EMAIL, "Revision nuance: prefers ROI tables");
  await new Promise((r: (v: void) => void) => setTimeout(r, 150));
  assert("new observation added", getUserMemory(EMAIL).learnedObservations.some((o: string) => o.includes("ROI")));
  const obsBefore = getUserMemory(EMAIL).learnedObservations.length;
  recordLearnedObservation(EMAIL, "Revision nuance: prefers ROI tables");
  await new Promise((r: (v: void) => void) => setTimeout(r, 150));
  assert("duplicate obs skipped", getUserMemory(EMAIL).learnedObservations.length === obsBefore);

  // Suite 6: Prompt Injection
  console.log(B("\n-- Suite 6: Prompt Injection --"));
  const prompt = formatUserMemoryPrompt(EMAIL);
  assert("prompt non-empty", prompt.length > 50);
  assert("has OPERATOR PROFILE header", prompt.includes("OPERATOR PROFILE"));
  assert("has Writing Style", prompt.includes("Writing Style"));
  assert("has Explicit Rejections", prompt.includes("Explicit Rejections"));
  assert("ends with strict instruction", prompt.includes("Strictly respect"));
  assert("null email -> empty", formatUserMemoryPrompt(null) === "");
  assert("undefined email -> empty", formatUserMemoryPrompt(undefined) === "");

  // Suite 7: Memory Reset
  console.log(B("\n-- Suite 7: Memory Reset --"));
  updateUserMemory(EMAIL, { brandRules: ["Custom A"] });
  await new Promise((r: (v: void) => void) => setTimeout(r, 150));
  assert("custom rule saved", getUserMemory(EMAIL).brandRules.includes("Custom A"));
  clearUserMemory(EMAIL);
  await new Promise((r: (v: void) => void) => setTimeout(r, 150));
  const reset = getUserMemory(EMAIL);
  assert("custom rule cleared", !reset.brandRules.includes("Custom A"));
  assert("defaults restored", reset.brandRules.length > 0);

  // Suite 8: tsc --noEmit
  console.log(B("\n-- Suite 8: TypeScript Compile --"));
  let tscOk = false;
  try { execSync("npx tsc --noEmit", { stdio: "pipe", cwd: ROOT }); tscOk = true; }
  catch (e: unknown) {
    const buf = (e as { stdout?: Buffer }).stdout;
    console.error(Y(buf ? buf.toString().slice(0, 2000) : String(e)));
  }
  assert("tsc --noEmit exits 0", tscOk);

  // Summary
  console.log(B("\n================================================================="));
  if (fail === 0) console.log(G(B(`  ALL ${ok} TESTS PASSED`)));
  else console.log(R(B(`  ${fail} FAILED / ${ok} passed`)));
  console.log(B("=================================================================\n"));
  process.exit(fail > 0 ? 1 : 0);
}

run().catch((err: unknown) => { console.error(R(`Fatal: ${err}`)); process.exit(1); });

