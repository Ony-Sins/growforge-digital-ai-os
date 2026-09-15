import fs from "node:fs";
import path from "node:path";

/**
 * Human-in-the-loop approval queue for tools the agent loop marks
 * requiresApproval (see tools.ts) — currently just call_connector. A job
 * runs unattended in the background with no live connection to a specific
 * browser tab, so "ask a human" can't mean "block on a click" directly; it
 * means write a record here, and have the caller (orchestrator.ts) poll
 * this store until someone decides, or it times out.
 *
 * File-backed with the same atomic tmp-then-rename write pattern as every
 * other store in this app (jobStore.ts, serverVault.ts, connectorStore.ts).
 */

export type ApprovalStatus = "pending" | "approved" | "denied" | "timed_out";

export interface PendingApproval {
  id: string;
  jobId: string;
  jobTitle: string;
  stepId: string;
  stepLabel: string;
  toolName: string;
  args: Record<string, unknown>;
  status: ApprovalStatus;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
}

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "approvals.json");
const MAX_RECORDS = 200;

const globalForStore = globalThis as unknown as { __growforgeApprovals?: PendingApproval[] };

function loadFromDisk(): PendingApproval[] {
  try {
    if (!fs.existsSync(STORE_FILE)) return [];
    const raw = fs.readFileSync(STORE_FILE, "utf8");
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("[approvalStore] failed to read/parse approvals.json — starting empty:", err);
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
    .catch((err) => console.error("[approvalStore] failed to persist approvals.json:", err));
}

function getStore(): PendingApproval[] {
  if (!globalForStore.__growforgeApprovals) globalForStore.__growforgeApprovals = loadFromDisk();
  return globalForStore.__growforgeApprovals;
}

export function createApproval(input: {
  jobId: string;
  jobTitle: string;
  stepId: string;
  stepLabel: string;
  toolName: string;
  args: Record<string, unknown>;
}): PendingApproval {
  const approval: PendingApproval = {
    id: `appr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    status: "pending",
    createdAt: new Date().toISOString(),
    ...input,
  };
  const store = getStore();
  store.unshift(approval);
  if (store.length > MAX_RECORDS) store.length = MAX_RECORDS;
  persist();
  return approval;
}

export function getApproval(id: string): PendingApproval | undefined {
  return getStore().find((a) => a.id === id);
}

export function listPendingApprovals(): PendingApproval[] {
  return getStore().filter((a) => a.status === "pending");
}

/** Owner-only in practice — enforced by the API route, not here. Returns
 *  false if the approval was already decided (e.g. it timed out just
 *  before a click landed) so the caller can tell the difference between
 *  "recorded" and "too late". */
export function decideApproval(id: string, decision: "approved" | "denied", decidedBy: string): boolean {
  const approval = getApproval(id);
  if (!approval || approval.status !== "pending") return false;
  approval.status = decision;
  approval.decidedAt = new Date().toISOString();
  approval.decidedBy = decidedBy;
  persist();
  return true;
}

export function markTimedOut(id: string): void {
  const approval = getApproval(id);
  if (!approval || approval.status !== "pending") return;
  approval.status = "timed_out";
  approval.decidedAt = new Date().toISOString();
  persist();
}
