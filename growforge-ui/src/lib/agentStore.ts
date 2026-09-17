import fs from "node:fs";
import path from "node:path";
import { agents as seedAgents, type Agent, type AgentStatus } from "@/lib/agents";
import type { LogEntry } from "@/lib/types";
import { chatComplete, LlmError } from "@/lib/llm";

export type { LogEntry };

interface Store {
  agents: Agent[];
  logs: LogEntry[];
  nextLogId: number;
}

interface PersistedStore {
  agents: Agent[];
  logs: LogEntry[];
  nextLogId: number;
}

// Resolved relative to the Next.js server process's cwd, which is the
// growforge-ui project root for both `next dev` and `next start`.
const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");

const globalForStore = globalThis as unknown as { __growforgeStore?: Store };

function seedLogs(): LogEntry[] {
  return [
    {
      id: 1,
      timestamp: new Date().toISOString(),
      agentId: "agents-orchestrator",
      level: "info",
      message: "orchestrator ready — 7 agents registered",
    },
  ];
}

function seedStore(): Store {
  return {
    agents: seedAgents.map((a) => ({ ...a })),
    logs: seedLogs(),
    nextLogId: 2,
  };
}

/** Loads growforge-ui/data/store.json if it exists and looks well-formed. */
function loadFromDisk(): Store | null {
  try {
    if (!fs.existsSync(STORE_FILE)) return null;
    const raw = fs.readFileSync(STORE_FILE, "utf8");
    if (!raw.trim()) return null;

    const parsed = JSON.parse(raw) as Partial<PersistedStore>;
    if (!Array.isArray(parsed.agents) || !Array.isArray(parsed.logs)) {
      console.warn("[agentStore] store.json is malformed (missing agents/logs array) — reseeding.");
      return null;
    }

    const highestLogId = parsed.logs.reduce((max, l) => Math.max(max, l.id ?? 0), 0);
    return {
      agents: parsed.agents,
      logs: parsed.logs,
      nextLogId: typeof parsed.nextLogId === "number" ? parsed.nextLogId : highestLogId + 1,
    };
  } catch (err) {
    console.error("[agentStore] failed to read/parse store.json — falling back to seed data:", err);
    return null;
  }
}

// Serializes writes so overlapping persist() calls can't interleave and
// corrupt the file; each write waits for the previous one to settle.
let writeQueue: Promise<void> = Promise.resolve();

function persist(store: Store) {
  const snapshot: PersistedStore = {
    agents: store.agents,
    logs: store.logs,
    nextLogId: store.nextLogId,
  };
  const json = JSON.stringify(snapshot, null, 2);

  // Fire-and-forget from the caller's perspective — request handlers don't
  // await this, so a disk write never adds latency to a response.
  writeQueue = writeQueue
    .then(() => fs.promises.writeFile(STORE_FILE, json, "utf8"))
    .catch((err) => {
      console.error("[agentStore] failed to persist store.json:", err);
    });
}

function initStore(): Store {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const loaded = loadFromDisk();
  if (loaded) {
    return loaded;
  }

  const seeded = seedStore();
  persist(seeded); // create store.json on first run so it's on disk immediately
  return seeded;
}

/**
 * Module-initialization entry point: on first access in this server
 * process, load persisted state from growforge-ui/data/store.json, or seed
 * from src/lib/agents.ts if the file doesn't exist yet. The globalThis guard
 * keeps this from re-running (and re-reading disk) on every Next.js dev
 * Fast Refresh of this module within the same process.
 */
function getStore(): Store {
  if (!globalForStore.__growforgeStore) {
    globalForStore.__growforgeStore = initStore();
  }
  return globalForStore.__growforgeStore;
}

export function listAgents(): Agent[] {
  return getStore().agents;
}

export function getAgent(id: string): Agent | undefined {
  return getStore().agents.find((a) => a.id === id);
}

function appendLog(agentId: string | null, level: LogEntry["level"], message: string): LogEntry {
  const store = getStore();
  const entry: LogEntry = {
    id: store.nextLogId++,
    timestamp: new Date().toISOString(),
    agentId,
    level,
    message,
  };
  store.logs.push(entry);
  // keep the ring buffer bounded
  if (store.logs.length > 500) store.logs.splice(0, store.logs.length - 500);
  persist(store);
  return entry;
}

export function getLogs(limit = 50, agentId?: string): LogEntry[] {
  const store = getStore();
  const filtered = agentId ? store.logs.filter((l) => l.agentId === agentId) : store.logs;
  return filtered.slice(-limit).reverse();
}

/** Total log entry count in the store (not limited/sliced), for summary
 *  metrics like the Executive Funnel's "Completed Runs" card. */
export function getLogsCount(agentId?: string): number {
  const store = getStore();
  return agentId ? store.logs.filter((l) => l.agentId === agentId).length : store.logs.length;
}

function setStatus(id: string, status: AgentStatus, lastRun: string) {
  const store = getStore();
  const agent = getAgent(id);
  if (agent) {
    agent.status = status;
    agent.lastRun = lastRun;
    persist(store);
  }
}

/**
 * Dispatches a real agent run: flips it to "active" immediately and returns
 * fast (the caller doesn't wait for completion), then actually calls the
 * configured LLM with the agent's role and the requested task as its
 * prompt, and records whatever it genuinely produced — or genuinely failed
 * with — once that call resolves. There is no per-agent instructions file
 * (unlike the 8 real departments in departments.ts), so the agent's own
 * `description` stands in as its system prompt; this is a lighter-weight
 * single-task agent, not a full department pipeline.
 */
export async function runAgent(
  id: string,
  params?: Record<string, unknown>,
): Promise<{ agent: Agent; log: LogEntry }> {
  const agent = getAgent(id);
  if (!agent) {
    throw new Error(`Unknown agent: ${id}`);
  }

  setStatus(id, "active", "running now");
  const dispatchLog = appendLog(
    id,
    "info",
    `[${id}] dispatched${params && Object.keys(params).length ? ` with params ${JSON.stringify(params)}` : ""}`,
  );

  const task =
    typeof params?.taskDescription === "string" && params.taskDescription.trim()
      ? params.taskDescription.trim()
      : "Perform your role once and report a concise, concrete result.";

  const systemPrompt = [
    `You are ${agent.name}, an agent at GrowForge Digital.`,
    `Your role: ${agent.description}`,
    "",
    "Complete the task below and report a concise, concrete result (2-6 sentences). " +
      "If you genuinely cannot complete it — missing information, or it requires an action this system doesn't expose " +
      "(e.g. deploying code, sending a real email) — say so plainly rather than pretending success.",
  ].join("\n");

  // Fire-and-forget from the caller's perspective — the dispatch endpoint
  // returns immediately; the log stream / status endpoint reflects the
  // real outcome once the model call actually finishes.
  void chatComplete(systemPrompt, [{ role: "user", content: task }], { maxTokens: 600 })
    .then(({ text }) => {
      setStatus(id, "success", "just now");
      appendLog(id, "success", `[${id}] ${text.trim().slice(0, 800)}`);
    })
    .catch((err) => {
      const message = err instanceof LlmError ? err.message : err instanceof Error ? err.message : String(err);
      setStatus(id, "error", "just now");
      appendLog(id, "error", `[${id}] ✗ ${message}`);
    });

  return { agent, log: dispatchLog };
}
