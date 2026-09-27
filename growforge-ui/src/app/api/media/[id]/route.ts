import { NextResponse } from "next/server";
import fs from "node:fs";
import { getSession, isPublicPreviewVisitor, isOwnerSession } from "@/lib/session";
import { getMediaFilePath } from "@/lib/mediaStorage";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (isPublicPreviewVisitor(session) || !isOwnerSession(session)) {
    return NextResponse.json(
      { error: "Forbidden. Private media artifacts require owner authorization." },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  const mediaInfo = getMediaFilePath(id);

  if (!mediaInfo) {
    return NextResponse.json({ error: "Media artifact not found or inaccessible." }, { status: 404 });
  }

  try {
    const fileBuffer = fs.readFileSync(mediaInfo.filePath);
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": mediaInfo.mimeType,
        "Content-Length": String(fileBuffer.length),
        "Cache-Control": "private, max-age=86400",
        "Content-Disposition": `inline; filename="${mediaInfo.artifact.fileName}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to read media file." }, { status: 500 });
  }
}
