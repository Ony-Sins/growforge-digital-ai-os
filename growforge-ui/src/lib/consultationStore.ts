import fs from "node:fs";
import path from "node:path";

/**
 * Asynchronous user consultation store (data/consultations.json).
 * Allows sub-agents and department workflows to raise interactive questions,
 * seek strategic clarifications, or present options to the operator mid-run.
 *
 * Like approvalStore.ts, jobStore.ts, and serverVault.ts, this uses the
 * atomic tmp-then-rename write pattern with a sequential promise queue to
 * ensure corruption-free persistence.
 */

export type ConsultationStatus = "pending" | "answered" | "timed_out";

export interface PendingConsultation {
  id: string;
  jobId: string;
  jobTitle: string;
  stepId: string;
  stepLabel: string;
  departmentId?: string;
  question: string;
  options?: string[];
  status: ConsultationStatus;
  answer?: string;
  createdAt: string;
  answeredAt?: string;
  answeredBy?: string;
}

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "consultations.json");
const MAX_RECORDS = 200;

const globalForStore = globalThis as unknown as { __growforgeConsultations?: PendingConsultation[] };

function loadFromDisk(): PendingConsultation[] {
  try {
    if (!fs.existsSync(STORE_FILE)) return [];
    const raw = fs.readFileSync(STORE_FILE, "utf8");
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("[consultationStore] failed to read/parse consultations.json — starting empty:", err);
    return [];
  }
}

let writeQueue: Promise<void> = Promise.resolve();

function persist() {
  const json = JSON.stringify(getStore(), null, 2);
  const tmp = STORE_FILE + ".tmp";
  writeQueue = writeQueue
    .then(async () => {
      await fs.promises.mkdir(DATA_DIR, { recursive: true });
      await fs.promises.writeFile(tmp, json, "utf8");
      await fs.promises.rename(tmp, STORE_FILE);
    })
    .catch((err) => console.error("[consultationStore] failed to persist consultations.json:", err));
}

function getStore(): PendingConsultation[] {
  if (!globalForStore.__growforgeConsultations) globalForStore.__growforgeConsultations = loadFromDisk();
  return globalForStore.__growforgeConsultations;
}

export function createConsultation(input: {
  jobId: string;
  jobTitle: string;
  stepId: string;
  stepLabel: string;
  departmentId?: string;
  question: string;
  options?: string[];
}): PendingConsultation {
  const consultation: PendingConsultation = {
    id: `cst-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    status: "pending",
    createdAt: new Date().toISOString(),
    ...input,
  };
  const store = getStore();
  store.unshift(consultation);
  if (store.length > MAX_RECORDS) store.length = MAX_RECORDS;
  persist();
  return consultation;
}

export function getConsultation(id: string): PendingConsultation | undefined {
  return getStore().find((c) => c.id === id);
}

export function listPendingConsultations(): PendingConsultation[] {
  return getStore().filter((c) => c.status === "pending");
}

export function answerConsultation(id: string, answer: string, answeredBy: string): boolean {
  const consultation = getConsultation(id);
  if (!consultation || consultation.status !== "pending") return false;
  consultation.status = "answered";
  consultation.answer = answer.trim();
  consultation.answeredAt = new Date().toISOString();
  consultation.answeredBy = answeredBy;
  persist();
  return true;
}

export function markConsultationTimedOut(id: string): void {
  const consultation = getConsultation(id);
  if (!consultation || consultation.status !== "pending") return;
  consultation.status = "timed_out";
  consultation.answeredAt = new Date().toISOString();
  persist();
}
