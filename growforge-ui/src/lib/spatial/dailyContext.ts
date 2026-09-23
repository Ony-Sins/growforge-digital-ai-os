import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_VAULT_DIR } from "./obsidianReader";

/**
 * Daily context node — v1, deliberately minimal.
 *
 * One real vault note per day (`YYYY-MM-DD Context.md`), appended to as
 * meaningful things happen. Raw timestamped log, not a distilled summary —
 * a summary can always be generated FROM a raw log later; the reverse isn't
 * true, so raw-log is the safe default while it's still unclear (by design,
 * per the user) whether raw or distilled is what actually feels useful.
 *
 * `isDaily` on the read side (obsidianReader.ts) already recognizes any
 * vault note whose title starts with YYYY-MM-DD — this file only needs to
 * produce that shape, no changes needed on the graph-reading side.
 *
 * Only one trigger wired for this first version: messages sent to the AI
 * Assistant (src/app/api/router/route.ts). More triggers (connector added,
 * job completed, etc.) are a deliberate follow-up once this proves useful,
 * not built speculatively now.
 */

function todayFileName(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day} Context.md`;
}

function nowTimeLabel(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Append one timestamped line to today's context note, creating the note
 * (with a minimal header) if it doesn't exist yet. Never throws — a failure
 * to log context should never break the actual feature that triggered it.
 */
export async function logContextEvent(summary: string): Promise<void> {
  try {
    const filePath = path.join(DEFAULT_VAULT_DIR, todayFileName());
    const line = `- ${nowTimeLabel()} — ${summary.trim()}\n`;

    try {
      await fs.access(filePath);
      await fs.appendFile(filePath, line, "utf8");
    } catch {
      const dateLabel = todayFileName().replace(" Context.md", "");
      const header = `# ${dateLabel} Context\n\nDaily activity log for GrowForge Digital AI OS — created automatically.\n\n`;
      await fs.writeFile(filePath, header + line, "utf8");
    }
  } catch (err) {
    console.error("[dailyContext] Failed to log context event (non-fatal):", err);
  }
}
