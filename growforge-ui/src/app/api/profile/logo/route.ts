import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getSession, isPublicPreviewVisitor } from "@/lib/session";
import { matchesImageSignature } from "@/lib/imageUpload";
import { getUserMemory, updateUserMemory } from "@/lib/userMemory";

export const runtime = "nodejs";

/** Accepts a brand logo upload, stores it under public/uploads/logos
 *  (served directly by Next as a static asset), and records the resulting
 *  path on the user's UserMemory.profile.logoUrl. Filenames are keyed by
 *  a hash of the user's email — never the client-supplied filename — so
 *  there's no path-traversal surface and re-uploads land in the same slot. */

const MAX_LOGO_BYTES = 5 * 1024 * 1024; // 5MB max

const EXT_FOR_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "logos");

function hashForEmail(email: string): string {
  return crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 16);
}

/** Removes any previously stored logo file for this user before writing
 *  a new one. */
function removeExistingLogoFiles(hash: string) {
  if (!fs.existsSync(UPLOAD_DIR)) return;
  for (const entry of fs.readdirSync(UPLOAD_DIR)) {
    if (entry.startsWith(`logo-${hash}`)) {
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
  if (isPublicPreviewVisitor(session)) {
    return NextResponse.json(
      { error: "Public preview is read-only. Sign in to upload a brand logo." },
      { status: 403 },
    );
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

  if (file.size > MAX_LOGO_BYTES) {
    return NextResponse.json(
      { error: `Image too large (${Math.round(file.size / 1024 / 1024)}MB) — 5MB max.` },
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
  removeExistingLogoFiles(hash);

  const filename = `logo-${hash}-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);

  const logoUrl = `/uploads/logos/${filename}`;
  const existing = getUserMemory(session.user.email);
  const updated = updateUserMemory(session.user.email, {
    profile: {
      ...existing.profile,
      logoUrl,
    },
  });

  return NextResponse.json({
    ok: true,
    logoUrl,
    memory: updated,
  });
}

export async function DELETE() {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (isPublicPreviewVisitor(session)) {
    return NextResponse.json(
      { error: "Public preview is read-only. Sign in to remove your brand logo." },
      { status: 403 },
    );
  }

  const hash = hashForEmail(session.user.email);
  removeExistingLogoFiles(hash);

  const existing = getUserMemory(session.user.email);
  const profileWithoutLogo = { ...existing.profile };
  delete profileWithoutLogo.logoUrl;
  const updated = updateUserMemory(session.user.email, {
    profile: profileWithoutLogo,
  });

  return NextResponse.json({
    ok: true,
    logoUrl: null,
    memory: updated,
  });
}
