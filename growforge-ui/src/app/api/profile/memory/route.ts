import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  getUserMemory,
  updateUserMemory,
  clearUserMemory,
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
