import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getUserMemory, updateUserMemory } from "@/lib/userMemory";

export const runtime = "nodejs";

/** Accepts a profile-picture upload, stores it under public/uploads/avatars
 *  (served directly by Next as a static asset), and records the resulting
 *  path on the user's UserMemory.profile.avatarUrl. Filenames are keyed by
 *  a hash of the user's email — never the client-supplied filename — so
 *  there's no path-traversal surface and re-uploads land in the same slot. */

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB — generous for a profile photo, small enough to serve instantly

const EXT_FOR_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "avatars");

function hashForEmail(email: string): string {
  return crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 16);
}

/** Removes any previously stored avatar file for this user (any extension,
 *  any cache-busting suffix) before writing the new one, so switching image
 *  formats or re-uploading never leaves orphaned files behind. */
function removeExistingAvatarFiles(hash: string) {
  if (!fs.existsSync(UPLOAD_DIR)) return;
  for (const entry of fs.readdirSync(UPLOAD_DIR)) {
    if (entry.startsWith(`avatar-${hash}`)) {
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

  if (file.size > MAX_AVATAR_BYTES) {
    return NextResponse.json(
      { error: `Image too large (${Math.round(file.size / 1024 / 1024)}MB) — 5MB max.` },
      { status: 400 },
    );
  }

  const hash = hashForEmail(session.user.email);
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  removeExistingAvatarFiles(hash);

  const filename = `avatar-${hash}-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);

  const avatarUrl = `/uploads/avatars/${filename}`;
  const existing = getUserMemory(session.user.email);
  const updated = updateUserMemory(session.user.email, {
    profile: { ...existing.profile, avatarUrl },
  });

  return NextResponse.json({ memory: updated, avatarUrl });
}

export async function DELETE() {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const hash = hashForEmail(session.user.email);
  removeExistingAvatarFiles(hash);

  const existing = getUserMemory(session.user.email);
  const updated = updateUserMemory(session.user.email, {
    profile: { ...existing.profile, avatarUrl: undefined },
  });

  return NextResponse.json({ memory: updated });
}
