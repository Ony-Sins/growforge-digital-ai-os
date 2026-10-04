import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { canonicalDepartmentId, departmentDisplayName, departmentTaxon, resolveRuntimeRoute } from "@/lib/departmentTaxonomy";
import { scrubSecrets } from "@/lib/security/toolBroker";

export type InstructionReplayMode = "original" | "current";
export interface InstructionContext {
  jobId: string;
  stepId: string;
  phase: string;
  generation?: string;
  departmentId: string;
  runtimeRouteId?: string;
  replayMode?: InstructionReplayMode;
  originalBundles?: Record<string, string>;
  onCaptured?: (execution: InstructionExecution) => void;
}
export interface InstructionExecution {
  schemaVersion: 1;
  id: string;
  jobId: string;
  stepId: string;
  phase: string;
  generation: string;
  canonicalDepartmentId: string;
  runtimeRouteId: string;
  displayNameAtExecution: string;
  bundleVersion: 1;
  instructionHash: string;
  bundleRef: string;
  createdAt: string;
  replayMode: InstructionReplayMode;
  provider: string;
  requestedModel: string;
  routingPolicyVersion: string;
  maxTokens?: number;
  allowPaid: boolean;
}
interface InstructionBundle { version: 1; instructionHash: string; systemPrompt: string }
const frozenPayloads = new WeakMap<InstructionContext, string>();
const contextStore = new AsyncLocalStorage<InstructionContext>();
const storageRoot = () => process.env.GROWFORGE_INSTRUCTION_STORE_DIR || path.join(process.cwd(), "data", "instruction-executions");
const HASH = /^[a-f0-9]{64}$/;
export const instructionKey = (stepId: string, phase: string) => `${stepId}:${phase}`;
export function withInstructionContext<T>(context: InstructionContext, run: () => T): T {
  return contextStore.run(context, run);
}

/** Fail closed before disk/network. Never redact a snapshot independently of execution. */
export function assertSecretFree(text: string): void {
  if (scrubSecrets(text) !== text || /(?:authorization\s*:\s*\S+|\bBearer\s+\S+|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:access_token|refresh_token|oauth_token|client_secret|connector_secret|vault_credential)\s*[=:]\s*["']?[^\s"',;]{4,}|https?:\/\/[^\s/@]+:[^\s/@]+@)/i.test(text)) {
    throw new Error("Instruction persistence blocked: credential material detected.");
  }
  for (const [name, value] of Object.entries(process.env)) {
    if (value && value.length >= 8 && /(?:SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY|CREDENTIAL|AUTHORIZATION)/i.test(name) && text.includes(value)) {
      throw new Error("Instruction persistence blocked: protected environment value detected.");
    }
  }
}

/** fsync the temporary file, then publish without replacement. Existing files stay immutable. */
function immutableWrite(dir: string, filename: string, value: unknown): void {
  const json = JSON.stringify(value, null, 2);
  assertSecretFree(json);
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, filename);
  const temporary = path.join(dir, `.${crypto.randomUUID()}.tmp`);
  const fd = fs.openSync(temporary, "wx", 0o600);
  try { fs.writeFileSync(fd, json, "utf8"); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  try { fs.linkSync(temporary, target); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST" || fs.readFileSync(target, "utf8") !== json) throw error;
  } finally { fs.unlinkSync(temporary); }
}

export function readInstructionBundle(ref: string): InstructionBundle {
  if (!HASH.test(ref)) throw new Error("Invalid instruction bundle reference.");
  const bundle = JSON.parse(fs.readFileSync(path.join(storageRoot(), "bundles", `${ref}.json`), "utf8")) as InstructionBundle;
  if (bundle.version !== 1 || bundle.instructionHash !== ref || crypto.createHash("sha256").update(bundle.systemPrompt).digest("hex") !== ref) throw new Error("Instruction bundle integrity check failed.");
  assertSecretFree(bundle.systemPrompt);
  return bundle;
}

export function listInstructionExecutions(jobId: string): InstructionExecution[] {
  const dir = path.join(storageRoot(), "executions");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(file => file.endsWith(".json")).map(file => JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as InstructionExecution).filter(record => record.jobId === jobId).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/** Safe metadata only. Instructions reproduce configuration, never identical model output. */
export function instructionReplayStatus(jobId: string) {
  const executions = listInstructionExecutions(jobId);
  return { state: executions.length ? "instruction-snapshots-available" : "original-instruction-snapshot-unavailable", executions, reproduces: "captured system instruction configuration", doesNotGuarantee: "identical output, historical provider availability, tool state or retrieved facts", runtimePolicy: "current authorization, approvals and provider routing remain enforced" };
}

export function selectOriginalBundles(jobId: string, required: readonly { stepId: string; phase: string }[]): Record<string, string> {
  const records = listInstructionExecutions(jobId);
  const result: Record<string, string> = {};
  for (const item of required) {
    const record = records.filter(record => record.stepId === item.stepId && record.phase === item.phase).at(-1);
    if (!record) throw new Error(`Original instruction snapshot unavailable: ${item.stepId}/${item.phase}.`);
    readInstructionBundle(record.bundleRef);
    result[instructionKey(item.stepId, item.phase)] = record.bundleRef;
  }
  return result;
}

/** Called before EACH provider attempt, after all instruction wrappers are assembled. */
export function prepareInstructionCall(currentSystem: string, routing: { provider: string; requestedModel: string; maxTokens?: number; allowPaid?: boolean }): { systemPrompt: string; execution?: InstructionExecution } {
  const context = contextStore.getStore();
  if (!context) return { systemPrompt: currentSystem };
  const canonicalId = canonicalDepartmentId(context.departmentId);
  const taxon = departmentTaxon(canonicalId);
  const route = resolveRuntimeRoute(context.runtimeRouteId ?? context.departmentId);
  if (!taxon || !route || canonicalDepartmentId(route) !== canonicalId) throw new Error("Unknown or inconsistent execution department identity/route.");
  const replayMode = context.replayMode ?? "current";
  const originalRef = context.originalBundles?.[instructionKey(context.stepId, context.phase)];
  if (replayMode === "original" && !originalRef) throw new Error("Original instruction snapshot unavailable for this execution phase.");
  const systemPrompt = replayMode === "original" ? readInstructionBundle(originalRef!).systemPrompt : frozenPayloads.get(context) ?? currentSystem;
  frozenPayloads.set(context, systemPrompt);
  assertSecretFree(systemPrompt);
  const instructionHash = crypto.createHash("sha256").update(systemPrompt).digest("hex");
  immutableWrite(path.join(storageRoot(), "bundles"), `${instructionHash}.json`, { version: 1, instructionHash, systemPrompt } satisfies InstructionBundle);
  // Hash the reloaded persisted content; this same string is passed to the provider.
  const persisted = readInstructionBundle(instructionHash);
  const execution: InstructionExecution = {
    schemaVersion: 1, id: crypto.randomUUID(), jobId: context.jobId, stepId: context.stepId, phase: context.phase, generation: context.generation ?? context.jobId,
    canonicalDepartmentId: canonicalId, runtimeRouteId: route, displayNameAtExecution: departmentDisplayName(canonicalId),
    bundleVersion: 1, instructionHash: persisted.instructionHash, bundleRef: instructionHash, createdAt: new Date().toISOString(),
    replayMode, provider: routing.provider, requestedModel: routing.requestedModel, maxTokens: routing.maxTokens,
    allowPaid: routing.allowPaid === true, routingPolicyVersion: "zero-spend-current-authorization-v1",
  };
  immutableWrite(path.join(storageRoot(), "executions"), `${execution.id}.json`, execution);
  context.onCaptured?.(execution);
  return { systemPrompt: persisted.systemPrompt, execution };
}

/** Append a receipt; never modify the snapshot/attempt when the provider finishes. */
export function recordInstructionResult(execution: InstructionExecution | undefined, result: { provider: string; model: string }): void {
  if (!execution) return;
  immutableWrite(path.join(storageRoot(), "receipts"), `${execution.id}.json`, { executionId: execution.id, provider: result.provider, model: result.model, completedAt: new Date().toISOString() });
}
