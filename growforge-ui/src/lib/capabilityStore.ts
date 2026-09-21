import fs from "node:fs";
import path from "node:path";

export interface CapabilityStatusRecord {
  id: string; // e.g. "higgsfield", "n8n", etc.
  status: "active" | "archived" | "disconnected";
  updatedAt: string;
}

const DATA_DIR = path.join(process.cwd(), "data");
const CAP_FILE = path.join(DATA_DIR, "capability_status.json");

function loadCapabilityStatus(): Record<string, CapabilityStatusRecord> {
  try {
    if (!fs.existsSync(CAP_FILE)) return {};
    const raw = fs.readFileSync(CAP_FILE, "utf8");
    if (!raw.trim()) return {};
    return JSON.parse(raw);
  } catch (err) {
    console.error("[capabilityStore] failed to read capability_status.json:", err);
    return {};
  }
}

let writeQueue: Promise<void> = Promise.resolve();

function saveCapabilityStatus(data: Record<string, CapabilityStatusRecord>): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const json = JSON.stringify(data, null, 2);
  const tmp = CAP_FILE + ".tmp";
  writeQueue = writeQueue
    .then(() => fs.promises.writeFile(tmp, json, "utf8"))
    .then(() => fs.promises.rename(tmp, CAP_FILE))
    .catch((err) => {
      console.error("[capabilityStore] failed to persist capability_status.json:", err);
    });
}

/** Returns true if the capability is not archived or disconnected */
export function isCapabilityActive(id: string): boolean {
  const data = loadCapabilityStatus();
  const rec = data[id];
  if (!rec) return true; // Default active if configured and not explicitly archived
  return rec.status === "active";
}

export function setCapabilityStatus(id: string, status: "active" | "archived" | "disconnected"): void {
  const data = loadCapabilityStatus();
  data[id] = { id, status, updatedAt: new Date().toISOString() };
  saveCapabilityStatus(data);
}

export function getCapabilityStatus(id: string): "active" | "archived" | "disconnected" {
  const data = loadCapabilityStatus();
  return data[id]?.status ?? "active";
}

export function archiveCapability(id: string): void {
  setCapabilityStatus(id, "archived");
}

export function reactivateCapability(id: string): void {
  setCapabilityStatus(id, "active");
}
