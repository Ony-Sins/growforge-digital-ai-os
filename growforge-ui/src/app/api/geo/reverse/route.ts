import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

/** Reverse-geocodes a lat/lng into a human-readable label via OpenStreetMap's
 *  free Nominatim API — proxied through our own server (not called directly
 *  from the browser) so we can set the User-Agent Nominatim's usage policy
 *  requires (https://operations.osmfoundation.org/policies/nominatim/) and
 *  avoid exposing that dependency to the client. No API key, no billing —
 *  matches the map itself (Leaflet + OpenStreetMap tiles, same reasoning). */

export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng query params are required numbers." }, { status: 400 });
  }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=14`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "GrowForge-Digital-AI-OS/1.0 (internal team tool; profile location picker)",
        Accept: "application/json",
      },
    });
    if (!res.ok) throw new Error(`Nominatim returned ${res.status}`);
    const data = await res.json();
    const label: string =
      data.display_name ||
      [data.address?.city || data.address?.town || data.address?.village, data.address?.country].filter(Boolean).join(", ") ||
      `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    return NextResponse.json({ label });
  } catch {
    // Nominatim hiccup or offline — the picker still works with raw
    // coordinates as the label, just less readable.
    return NextResponse.json({ label: `${lat.toFixed(4)}, ${lng.toFixed(4)}` });
  }
}
