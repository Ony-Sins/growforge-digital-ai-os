import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { getSecretForServerUse } from "@/lib/serverVault";
import { SYSTEM_VAULT_ID } from "@/lib/llm";
import { analyzeImageWithFallback, type VisionStrategy } from "@/lib/model-router";

/**
 * Turns a client-uploaded file into plain text the brief-intake chat can
 * read before it starts asking questions — so a client can hand over an
 * existing brand deck, price list, or a photo of their storefront instead
 * of retyping everything the assistant would otherwise have to ask for.
 *
 * Every extractor here is best-effort: a file that fails to parse returns
 * an explanatory string rather than throwing, so one bad upload never
 * breaks the rest of the intake conversation.
 */

export interface AttachmentResult {
  name: string;
  kind: "pdf" | "docx" | "image" | "text" | "unsupported";
  extractedText: string;
  modelUsed?: string;
}

export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024; // 15MB — generous for a brief's supporting docs, small enough to stay in-memory safely

async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text.trim() || "(PDF parsed but contained no extractable text — it may be scanned/image-only.)";
  } finally {
    await parser.destroy();
  }
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value.trim() || "(Document parsed but contained no text.)";
}

function kindForFile(name: string, mimeType: string): AttachmentResult["kind"] {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (mimeType === "application/pdf" || ext === "pdf") return "pdf";
  if (mimeType.includes("wordprocessingml") || ext === "docx") return "docx";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("text/") || ["txt", "md", "csv"].includes(ext)) return "text";
  return "unsupported";
}

export async function processAttachment(
  name: string,
  mimeType: string,
  buffer: Buffer,
  visionStrategy: VisionStrategy,
): Promise<AttachmentResult> {
  if (buffer.byteLength > MAX_ATTACHMENT_BYTES) {
    return { name, kind: "unsupported", extractedText: `File too large (${Math.round(buffer.byteLength / 1024 / 1024)}MB) — 15MB max.` };
  }

  const kind = kindForFile(name, mimeType);
  try {
    switch (kind) {
      case "pdf":
        return { name, kind, extractedText: await extractPdfText(buffer) };
      case "docx":
        return { name, kind, extractedText: await extractDocxText(buffer) };
      case "text":
        return { name, kind, extractedText: buffer.toString("utf8").trim().slice(0, 20000) };
      case "image": {
        const openRouterKey = getSecretForServerUse(SYSTEM_VAULT_ID, "openrouter") || process.env.OPENROUTER_API_KEY || null;
        const { text, modelUsed } = await analyzeImageWithFallback(
          buffer.toString("base64"),
          mimeType,
          openRouterKey,
          visionStrategy,
        );
        return { name, kind, extractedText: text, modelUsed };
      }
      default:
        return { name, kind: "unsupported", extractedText: `Unsupported file type (${mimeType || "unknown"}).` };
    }
  } catch (err) {
    return {
      name,
      kind,
      extractedText: `Could not process this file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Formats extracted attachment content as a block to prepend to the
 *  intake chat's context — the same shape for every file kind so the
 *  model treats a parsed PDF and an analyzed photo consistently. */
export function formatAttachmentsForPrompt(results: AttachmentResult[]): string {
  if (results.length === 0) return "";
  const blocks = results.map(
    (r) => `--- Attached file: ${r.name} (${r.kind}${r.modelUsed ? `, analyzed via ${r.modelUsed}` : ""}) ---\n${r.extractedText}`,
  );
  return `The client attached ${results.length} file${results.length === 1 ? "" : "s"} — use this as real context, not as something to ask the client to re-explain:\n\n${blocks.join("\n\n")}`;
}
