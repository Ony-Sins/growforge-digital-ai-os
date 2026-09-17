import { NextResponse } from "next/server";
import { processAttachment, formatAttachmentsForPrompt, MAX_ATTACHMENT_BYTES, type AttachmentResult } from "@/lib/attachments";
import { getStrategy } from "@/lib/llm";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

/** Accepts multipart/form-data with one or more "file" entries, extracts
 *  text (PDF/DOCX/plain text) or a vision-model description (images) from
 *  each, and returns both the per-file results and a single formatted
 *  block ready to prepend to the next chat message's context.
 *
 *  Gated the same way every other route here is (see jobs/route.ts):
 *  parsing files and calling a vision API on the server's behalf is real
 *  work an unauthenticated caller could otherwise abuse for free. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data." }, { status: 400 });
  }

  const files = formData.getAll("file").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided (expected one or more \"file\" fields)." }, { status: 400 });
  }
  if (files.length > 10) {
    return NextResponse.json({ error: "Too many files — 10 max per upload." }, { status: 400 });
  }
  // Reject oversized files by their reported size (free — File.size is
  // metadata, no read required) before ever buffering any of them. The
  // byteLength check inside processAttachment runs too late to help here:
  // by then every file in this batch has already been fully read into
  // memory concurrently, which is itself the resource-exhaustion risk.
  const oversized = files.find((f) => f.size > MAX_ATTACHMENT_BYTES);
  if (oversized) {
    return NextResponse.json(
      { error: `"${oversized.name}" is too large (${Math.round(oversized.size / 1024 / 1024)}MB) — ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB max per file.` },
      { status: 400 },
    );
  }

  const visionStrategy = getStrategy();
  const results: AttachmentResult[] = await Promise.all(
    files.map(async (file) => {
      const buffer = Buffer.from(await file.arrayBuffer());
      return processAttachment(file.name, file.type, buffer, visionStrategy);
    }),
  );

  return NextResponse.json({ results, context: formatAttachmentsForPrompt(results) });
}
