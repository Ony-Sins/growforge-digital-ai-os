import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  getUserMemory,
  updateUserMemory,
  clearUserMemory,
  SOCIAL_PLATFORMS,
  type UserMemory,
} from "@/lib/userMemory";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const memory = getUserMemory(session.user.email);
  return NextResponse.json({ memory });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: Partial<UserMemory>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const patch: Partial<Omit<UserMemory, "email" | "createdAt">> = {};

  if (body.profile && typeof body.profile === "object") {
    const p = body.profile;
    const socials: Partial<Record<(typeof SOCIAL_PLATFORMS)[number], string>> = {};
    if (p.socials && typeof p.socials === "object") {
      for (const platform of SOCIAL_PLATFORMS) {
        const v = p.socials[platform];
        if (typeof v === "string" && v.trim()) socials[platform] = v.trim().slice(0, 300);
      }
    }
    const loc = p.location;
    const validLocation =
      loc &&
      typeof loc === "object" &&
      typeof loc.label === "string" &&
      typeof loc.lat === "number" &&
      typeof loc.lng === "number" &&
      Number.isFinite(loc.lat) &&
      Number.isFinite(loc.lng)
        ? { label: loc.label.trim().slice(0, 200), lat: loc.lat, lng: loc.lng }
        : undefined;

    patch.profile = {
      fullName: typeof p.fullName === "string" ? p.fullName.trim().slice(0, 200) : "",
      designation: typeof p.designation === "string" ? p.designation.trim().slice(0, 200) : "",
      companyName: typeof p.companyName === "string" ? p.companyName.trim().slice(0, 200) : "",
      about: typeof p.about === "string" ? p.about.trim().slice(0, 2000) : "",
      phone: typeof p.phone === "string" && p.phone.trim() ? p.phone.trim().slice(0, 40) : undefined,
      socials,
      // Explicitly set (even to undefined) rather than omitted — the merge
      // in updateUserMemory replaces this key wholesale from whatever's
      // present here, same reasoning as `socials` above. Omitting the key
      // entirely would mean "leave it alone"; this route's contract is that
      // the identity save always sends the complete current state.
      location: validLocation,
    };
  }

  if (typeof body.writingStyle === "string") {
    patch.writingStyle = body.writingStyle.slice(0, 1000);
  }

  if (Array.isArray(body.brandRules)) {
    patch.brandRules = body.brandRules.filter((r): r is string => typeof r === "string" && r.trim().length > 0).slice(0, 30);
  }

  if (body.preferences && typeof body.preferences === "object") {
    const cleanPrefs: Record<string, string> = {};
    for (const [k, v] of Object.entries(body.preferences)) {
      if (typeof k === "string" && typeof v === "string") {
        cleanPrefs[k.trim().toLowerCase()] = v.trim().slice(0, 500);
      }
    }
    patch.preferences = cleanPrefs;
  }

  if (Array.isArray(body.pastOverrides)) {
    patch.pastOverrides = body.pastOverrides.filter((o): o is string => typeof o === "string" && o.trim().length > 0).slice(0, 30);
  }

  if (Array.isArray(body.explicitRejections)) {
    patch.explicitRejections = body.explicitRejections.filter((rej): rej is string => typeof rej === "string" && rej.trim().length > 0).slice(0, 30);
  }

  if (Array.isArray(body.learnedObservations)) {
    patch.learnedObservations = body.learnedObservations.filter((obs): obs is string => typeof obs === "string" && obs.trim().length > 0).slice(0, 30);
  }

  const updated = updateUserMemory(session.user.email, patch);
  return NextResponse.json({ memory: updated });
}

export async function DELETE() {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const reset = clearUserMemory(session.user.email);
  return NextResponse.json({ memory: reset, message: "User memory profile reset to default clean state." });
}
