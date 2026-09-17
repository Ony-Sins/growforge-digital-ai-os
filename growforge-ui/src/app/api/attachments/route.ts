import { NextResponse } from "next/server";
import { processAttachment, formatAttachmentsForPrompt, type AttachmentResult } from "@/lib/attachments";
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

  const visionStrategy = getStrategy();
  const results: AttachmentResult[] = await Promise.all(
    files.map(async (file) => {
      const buffer = Buffer.from(await file.arrayBuffer());
      return processAttachment(file.name, file.type, buffer, visionStrategy);
    }),
  );

  return NextResponse.json({ results, context: formatAttachmentsForPrompt(results) });
}
