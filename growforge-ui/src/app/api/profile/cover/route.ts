import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { matchesImageSignature } from "@/lib/imageUpload";
import { getUserMemory, updateUserMemory } from "@/lib/userMemory";

export const runtime = "nodejs";

/** Same pattern as /api/profile/avatar — cover photo upload, stored under
 *  public/uploads/covers, recorded on UserMemory.profile.coverPhotoUrl. */

const MAX_COVER_BYTES = 8 * 1024 * 1024; // wider aspect banner image, a bit more headroom than the avatar

const EXT_FOR_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "covers");

function hashForEmail(email: string): string {
  return crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 16);
}

function removeExistingCoverFiles(hash: string) {
  if (!fs.existsSync(UPLOAD_DIR)) return;
  for (const entry of fs.readdirSync(UPLOAD_DIR)) {
    if (entry.startsWith(`cover-${hash}`)) {
      try {
        fs.unlinkSync(path.join(UPLOAD_DIR, entry));
      } catch {
        // best-effort cleanup only
      }
    }
  }
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided (expected a \"file\" field)." }, { status: 400 });
  }

  const ext = EXT_FOR_MIME[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: "Unsupported image type — use PNG, JPEG, WEBP, or GIF." },
      { status: 400 },
    );
  }

  if (file.size > MAX_COVER_BYTES) {
    return NextResponse.json(
      { error: `Image too large (${Math.round(file.size / 1024 / 1024)}MB) — 8MB max.` },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!matchesImageSignature(buffer, ext)) {
    return NextResponse.json(
      { error: "File content doesn't match its declared image type." },
      { status: 400 },
    );
  }

  const hash = hashForEmail(session.user.email);
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  removeExistingCoverFiles(hash);

  const filename = `cover-${hash}-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);

  const coverPhotoUrl = `/uploads/covers/${filename}`;
  const existing = getUserMemory(session.user.email);
  const updated = updateUserMemory(session.user.email, {
    profile: { ...existing.profile, coverPhotoUrl },
  });

  return NextResponse.json({ memory: updated, coverPhotoUrl });
}

export async function DELETE() {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const hash = hashForEmail(session.user.email);
  removeExistingCoverFiles(hash);

  const existing = getUserMemory(session.user.email);
  const updated = updateUserMemory(session.user.email, {
    profile: { ...existing.profile, coverPhotoUrl: undefined },
  });

  return NextResponse.json({ memory: updated });
}
