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
  const radiusKm = Number(searchParams.get("radiusKm")) || 10;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng query params are required numbers." }, { status: 400 });
  }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "GrowForge-Digital-AI-OS/1.0 (internal team tool; profile location picker)",
        Accept: "application/json",
      },
    });
    if (!res.ok) throw new Error(`Nominatim returned ${res.status}`);
    const data = await res.json();
    const address = data.address || {};
    const city: string | undefined = address.city || address.town || address.village || address.municipality || address.suburb;
    const state: string | undefined = address.state || address.region || address.province;
    const country: string | undefined = address.country;
    const postcode: string | undefined = address.postcode;
    const placeType: string | undefined = data.type || data.category;
    const label: string =
      data.display_name ||
      [city, state, country].filter(Boolean).join(", ") ||
      `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

    let osmPoiCount: number | undefined;

    if (searchParams.get("marketContext") === "true") {
      try {
        const radiusM = Math.min(Math.max(radiusKm, 1), 100) * 1000;
        const overpassQuery = `[out:json][timeout:3];(node["amenity"](around:${radiusM},${lat},${lng});node["shop"](around:${radiusM},${lat},${lng});node["office"](around:${radiusM},${lat},${lng}););out count;`;
        const overpassUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;
        const opRes = await fetch(overpassUrl, {
          headers: {
            "User-Agent": "GrowForge-Digital-AI-OS/1.0 (internal team tool; market research)",
          },
          signal: AbortSignal.timeout(3000),
        });
        if (opRes.ok) {
          const opData = await opRes.json();
          const total = opData.elements?.[0]?.tags?.total;
          if (typeof total === "string" || typeof total === "number") {
            osmPoiCount = Number(total);
          }
        }
      } catch {
        // Overpass timeout or offline — gracefully continue with Nominatim context
      }
    }

    return NextResponse.json({
      label,
      city,
      state,
      country,
      postcode,
      placeType,
      osmPoiCount,
    });
  } catch {
    // Nominatim hiccup or offline — the picker still works with raw
    // coordinates as the label, just less readable.
    return NextResponse.json({ label: `${lat.toFixed(4)}, ${lng.toFixed(4)}` });
  }
}
