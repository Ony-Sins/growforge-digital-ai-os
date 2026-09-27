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
 * Every extractor here is best-effort and fail-safe: files that fail to parse
 * return structured error metadata with success: false. Failed extraction text
 * is strictly isolated and excluded from model prompt context.
 */

export interface AttachmentResult {
  name: string;
  kind: "pdf" | "docx" | "image" | "text" | "unsupported";
  extractedText: string;
  modelUsed?: string;
  success: boolean;
  error?: string;
  truncated?: boolean;
}

export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024; // 15MB max per file
export const MAX_SINGLE_FILE_CHARS = 12000; // 12,000 characters per file
export const TOTAL_ATTACHMENT_CONTEXT_BUDGET = 32000; // 32,000 characters total across all attachments

async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text.trim();
  } finally {
    await parser.destroy();
  }
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value.trim();
}

function kindForFile(name: string, mimeType: string): AttachmentResult["kind"] {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (mimeType === "application/pdf" || ext === "pdf") return "pdf";
  if (mimeType.includes("wordprocessingml") || ext === "docx") return "docx";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("text/") || ["txt", "md", "csv", "json", "ts", "js", "py"].includes(ext)) return "text";
  return "unsupported";
}

export async function processAttachment(
  name: string,
  mimeType: string,
  buffer: Buffer,
  visionStrategy: VisionStrategy,
): Promise<AttachmentResult> {
  if (buffer.byteLength > MAX_ATTACHMENT_BYTES) {
    return {
      name,
      kind: "unsupported",
      extractedText: "",
      success: false,
      error: `File exceeds maximum allowed size (${Math.round(buffer.byteLength / 1024 / 1024)}MB > 15MB limit).`,
    };
  }

  const kind = kindForFile(name, mimeType);
  try {
    switch (kind) {
      case "pdf": {
        const text = await extractPdfText(buffer);
        if (!text) {
          return {
            name,
            kind,
            extractedText: "",
            success: false,
            error: "PDF parsed but contained no extractable text (may be scanned/image-only).",
          };
        }
        const truncated = text.length > MAX_SINGLE_FILE_CHARS;
        const finalText = truncated ? text.slice(0, MAX_SINGLE_FILE_CHARS) + "\n[Content truncated to stay within per-file limit]" : text;
        return { name, kind, extractedText: finalText, success: true, truncated };
      }
      case "docx": {
        const text = await extractDocxText(buffer);
        if (!text) {
          return {
            name,
            kind,
            extractedText: "",
            success: false,
            error: "Document parsed but contained no text.",
          };
        }
        const truncated = text.length > MAX_SINGLE_FILE_CHARS;
        const finalText = truncated ? text.slice(0, MAX_SINGLE_FILE_CHARS) + "\n[Content truncated to stay within per-file limit]" : text;
        return { name, kind, extractedText: finalText, success: true, truncated };
      }
      case "text": {
        const text = buffer.toString("utf8").trim();
        if (!text) {
          return {
            name,
            kind,
            extractedText: "",
            success: false,
            error: "Text file is empty.",
          };
        }
        const truncated = text.length > MAX_SINGLE_FILE_CHARS;
        const finalText = truncated ? text.slice(0, MAX_SINGLE_FILE_CHARS) + "\n[Content truncated to stay within per-file limit]" : text;
        return { name, kind, extractedText: finalText, success: true, truncated };
      }
      case "image": {
        const openRouterKey = getSecretForServerUse(SYSTEM_VAULT_ID, "openrouter") || process.env.OPENROUTER_API_KEY || null;
        const { text, modelUsed } = await analyzeImageWithFallback(
          buffer.toString("base64"),
          mimeType,
          openRouterKey,
          visionStrategy,
        );
        if (!text || text.startsWith("Vision analysis is disabled") || text.startsWith("Could not process")) {
          return {
            name,
            kind,
            extractedText: "",
            success: false,
            error: text || "Image analysis unavailable.",
            modelUsed,
          };
        }
        const truncated = text.length > MAX_SINGLE_FILE_CHARS;
        const finalText = truncated ? text.slice(0, MAX_SINGLE_FILE_CHARS) + "\n[Content truncated to stay within per-file limit]" : text;
        return { name, kind, extractedText: finalText, success: true, modelUsed, truncated };
      }
      default:
        return {
          name,
          kind: "unsupported",
          extractedText: "",
          success: false,
          error: `Unsupported file type (${mimeType || "unknown"}).`,
        };
    }
  } catch (err) {
    return {
      name,
      kind,
      extractedText: "",
      success: false,
      error: `Could not process this file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Formats extracted attachment content as a block to prepend to the
 *  intake chat's context — truthful inclusion status is presented,
 *  and failed extractions are strictly isolated from the prompt context. */
export function formatAttachmentsForPrompt(results: AttachmentResult[]): string {
  if (results.length === 0) return "";

  const statusLines = results.map((r) => {
    if (!r.success) {
      return `- ${r.name} (${r.kind}): [EXCLUDED - Extraction Failed: ${r.error || "Unknown error"}]`;
    }
    if (r.truncated) {
      return `- ${r.name} (${r.kind}${r.modelUsed ? `, via ${r.modelUsed}` : ""}): [INCLUDED - Truncated to budget limit]`;
    }
    return `- ${r.name} (${r.kind}${r.modelUsed ? `, via ${r.modelUsed}` : ""}): [INCLUDED - Full content]`;
  });

  const successful = results.filter((r) => r.success && r.extractedText.trim().length > 0);

  if (successful.length === 0) {
    return `Attached files summary:\n${statusLines.join("\n")}\n\n(No attachment contents could be extracted for model context.)`;
  }

  let remainingBudget = TOTAL_ATTACHMENT_CONTEXT_BUDGET;
  const contentBlocks: string[] = [];

  for (const item of successful) {
    if (remainingBudget <= 0) {
      statusLines.push(`- ${item.name}: [EXCLUDED - Total context budget of ${TOTAL_ATTACHMENT_CONTEXT_BUDGET} chars reached]`);
      continue;
    }
    let text = item.extractedText;
    if (text.length > remainingBudget) {
      text = text.slice(0, remainingBudget) + "\n[Content truncated to stay within total context budget]";
      remainingBudget = 0;
    } else {
      remainingBudget -= text.length;
    }

    contentBlocks.push(
      `--- Attached file: ${item.name} (${item.kind}${item.modelUsed ? `, analyzed via ${item.modelUsed}` : ""}) ---\n${text}`,
    );
  }

  return `The client attached ${results.length} file${results.length === 1 ? "" : "s"}.\n\nAttachments Status:\n${statusLines.join("\n")}\n\n${contentBlocks.join("\n\n")}`;
}
