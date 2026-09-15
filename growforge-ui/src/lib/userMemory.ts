import fs from "node:fs";
import path from "node:path";

/**
 * User Learning Memory ("Akinator" Shadow Memory) Engine.
 *
 * Persists operator-specific brand guidelines, writing style, strategic
 * preferences, learned nuances from past revisions, and explicit rejections.
 * Tied to the lowercased email of the authenticated user.
 *
 * Injected automatically into HQ Orchestrator and department agent prompts
 * so projects adapt to each operator's established voice and rules.
 */

export interface UserMemory {
  email: string;
  writingStyle: string;
  brandRules: string[];
  preferences: Record<string, string>;
  pastOverrides: string[];
  explicitRejections: string[];
  learnedObservations: string[];
  createdAt: string;
  updatedAt: string;
}

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "user_memories.json");

const DEFAULT_WRITING_STYLE =
  "High-conviction, data-driven, executive tone. Concrete numbers, clear timelines, zero fluff, and no generic marketing buzzwords.";

const DEFAULT_BRAND_RULES = [
  "Position GrowForge Digital as an elite, high-velocity AI & growth operations partner.",
  "Always provide clear financial estimates (unit economics, CAC, LTV, ad budgets).",
  "Use USD ($) as standard currency formatting.",
  "Deliver concrete deliverables over high-level theoretical advice.",
];

const DEFAULT_PREFERENCES: Record<string, string> = {
  "target_market": "B2B SaaS, Professional Services & High-Ticket Local Businesses",
  "budget_tier": "Mid-Market Growth ($5,000 – $25,000/mo ad spend)",
  "primary_channels": "Meta Ads, Google Search, Signal-Based Outbound",
  "time_horizon": "90-Day phased execution sprint",
};

const DEFAULT_REJECTIONS = [
  "Never recommend cold phone calling without warm intent signals.",
  "Do not propose outdated monolithic architectures for custom web builds.",
  "Avoid vague platitudes like 'maximize synergy' or 'boost engagement'.",
];

const DEFAULT_OBSERVATIONS = [
  "Operator favors direct conversion copy over lengthy conceptual brand manifestos.",
  "Operator prefers granular ad budget breakdowns with expected CPA/CPL metrics.",
];

type MemoryStore = Record<string, UserMemory>; // email -> UserMemory

let writeQueue: Promise<void> = Promise.resolve();

function now(): string {
  return new Date().toISOString();
}

function loadFromDisk(): MemoryStore {
  try {
    if (!fs.existsSync(STORE_FILE)) return {};
    const raw = fs.readFileSync(STORE_FILE, "utf8");
    if (!raw.trim()) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    console.error("[userMemory] failed to read user_memories.json — starting empty:", err);
    return {};
  }
}

function persist(data: MemoryStore) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const json = JSON.stringify(data, null, 2);
  writeQueue = writeQueue
    .then(() => fs.promises.writeFile(STORE_FILE, json, "utf8"))
    .catch((err) => console.error("[userMemory] failed to persist user_memories.json:", err));
}

let memoryCache: MemoryStore | null = null;

function getStore(): MemoryStore {
  if (!memoryCache) {
    memoryCache = loadFromDisk();
  }
  return memoryCache;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function createDefaultMemory(email: string): UserMemory {
  return {
    email: normalizeEmail(email),
    writingStyle: DEFAULT_WRITING_STYLE,
    brandRules: [...DEFAULT_BRAND_RULES],
    preferences: { ...DEFAULT_PREFERENCES },
    pastOverrides: [],
    explicitRejections: [...DEFAULT_REJECTIONS],
    learnedObservations: [...DEFAULT_OBSERVATIONS],
    createdAt: now(),
    updatedAt: now(),
  };
}

/** Retrieves or initializes user memory for the given email address. */
export function getUserMemory(email: string): UserMemory {
  const norm = normalizeEmail(email);
  const store = getStore();
  if (!store[norm]) {
    store[norm] = createDefaultMemory(norm);
    persist(store);
  }
  return store[norm];
}

/** Updates user memory fields and persists changes to disk. */
export function updateUserMemory(email: string, patch: Partial<Omit<UserMemory, "email" | "createdAt">>): UserMemory {
  const norm = normalizeEmail(email);
  const store = getStore();
  const existing = store[norm] ?? createDefaultMemory(norm);

  const updated: UserMemory = {
    ...existing,
    ...patch,
    preferences: patch.preferences ? { ...patch.preferences } : existing.preferences,
    brandRules: patch.brandRules ? [...patch.brandRules] : existing.brandRules,
    pastOverrides: patch.pastOverrides ? [...patch.pastOverrides] : existing.pastOverrides,
    explicitRejections: patch.explicitRejections ? [...patch.explicitRejections] : existing.explicitRejections,
    learnedObservations: patch.learnedObservations ? [...patch.learnedObservations] : existing.learnedObservations,
    updatedAt: now(),
  };

  store[norm] = updated;
  persist(store);
  return updated;
}

/** Clears and resets a user's memory back to initial clean state. */
export function clearUserMemory(email: string): UserMemory {
  const norm = normalizeEmail(email);
  const store = getStore();
  const reset = createDefaultMemory(norm);
  store[norm] = reset;
  persist(store);
  return reset;
}

/** Records a newly learned observation / revision nuance into user memory. */
export function recordLearnedObservation(email: string, observation: string): void {
  const norm = normalizeEmail(email);
  const mem = getUserMemory(norm);
  const clean = observation.trim();
  if (!clean || mem.learnedObservations.includes(clean)) return;

  const next = [clean, ...mem.learnedObservations].slice(0, 20);
  updateUserMemory(norm, { learnedObservations: next });
}

/**
 * Formats the user's active memory profile into a markdown prompt block
 * ready for injection into HQ Orchestrator and department system prompts.
 */
export function formatUserMemoryPrompt(email: string | null | undefined): string {
  if (!email) return "";
  const mem = getUserMemory(email);

  const sections: string[] = [];

  if (mem.writingStyle?.trim()) {
    sections.push(`- **Preferred Writing Style & Voice**: ${mem.writingStyle.trim()}`);
  }

  if (mem.brandRules?.length > 0) {
    sections.push(`- **Core Brand Tenets & Rules**:\n${mem.brandRules.map((r) => `  * ${r}`).join("\n")}`);
  }

  const prefKeys = Object.keys(mem.preferences ?? {});
  if (prefKeys.length > 0) {
    sections.push(
      `- **Operator Preferences**:\n${prefKeys.map((k) => `  * ${k.replace(/_/g, " ").toUpperCase()}: ${mem.preferences[k]}`).join("\n")}`,
    );
  }

  if (mem.pastOverrides?.length > 0) {
    sections.push(`- **Past Project Overrides (Learned)**:\n${mem.pastOverrides.map((o) => `  * ${o}`).join("\n")}`);
  }

  if (mem.explicitRejections?.length > 0) {
    sections.push(`- **Explicit Rejections (DO NOT DO)**:\n${mem.explicitRejections.map((rej) => `  * ${rej}`).join("\n")}`);
  }

  if (mem.learnedObservations?.length > 0) {
    sections.push(`- **Shadow Memory Observations**:\n${mem.learnedObservations.map((obs) => `  * ${obs}`).join("\n")}`);
  }

  if (sections.length === 0) return "";

  return `### OPERATOR PROFILE & SHADOW MEMORY (APPLY STRICTLY TO THIS RUN)\n${sections.join("\n\n")}\n\nStrictly respect these operator preferences across all department proposals, assumptions, and final synthesis.`;
}
