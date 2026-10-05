import { DIVE_LENS_REGISTRY, lensById, type DiveLensId } from "./diveLenses";

/**
 * Reload-safe, URL-addressable navigation state for the four top-level surfaces and the Dive lenses.
 *
 * This is the same contract semanticNavigation already emits (`/?tier=brain`, `/?tier=home&lens=missions`,
 * `/?panel=settings&tab=x`), completed rather than replaced:
 *
 *   CORE      /                      (no surface keys)
 *   Explore   /?tier=brain
 *   Dive In   /?lens=<slug>          (a lens implies Dive In; `tier=home` alongside it is accepted)
 *   Systems   /?panel=settings&tab=… (owned by appState; it overlays whatever surface is underneath)
 *
 * Pure functions only (no React / no window) so the UI, NORA routing and tests share one definition.
 */

export type Surface = "core" | "explore" | "dive";

export interface SurfaceLocation {
  surface: Surface;
  /** Set only when surface === "dive". */
  lensId?: DiveLensId;
}

export const SURFACE_KEYS = ["tier", "lens"] as const;
const DEFAULT_LENS: DiveLensId = "lens.overview";

type Search = string | URLSearchParams | Record<string, string | string[] | undefined>;

function get(search: Search, key: string): string | null {
  if (typeof search === "string") return new URLSearchParams(search).get(key);
  if (search instanceof URLSearchParams) return search.get(key);
  const v = search[key];
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

/** Resolves a lens slug (`missions`) to its canonical id, or undefined if it is not a real lens. */
export function lensIdFromSlug(slug: string | null | undefined): DiveLensId | undefined {
  if (!slug) return undefined;
  return DIVE_LENS_REGISTRY.find((l) => l.slug === slug.toLowerCase())?.id;
}

/**
 * Reads the surface out of a query string. Never throws and never returns an unknown lens:
 * a present-but-invalid `lens` still means "the user wanted Dive In", so it lands on Overview
 * rather than silently dropping them on CORE.
 */
export function parseSurfaceLocation(search: Search): SurfaceLocation {
  const rawLens = get(search, "lens");
  if (rawLens !== null && rawLens !== "") return { surface: "dive", lensId: lensIdFromSlug(rawLens) ?? DEFAULT_LENS };
  return { surface: get(search, "tier") === "brain" ? "explore" : "core" };
}

/** The surface keys for a location, in canonical form. CORE is the bare URL. */
export function surfaceParams(location: SurfaceLocation): Record<"tier" | "lens", string | undefined> {
  if (location.surface === "dive") return { tier: undefined, lens: lensById(location.lensId ?? DEFAULT_LENS)?.slug ?? "overview" };
  if (location.surface === "explore") return { tier: "brain", lens: undefined };
  return { tier: undefined, lens: undefined };
}

/** Returns the query string (with leading `?`, or "") with the surface keys replaced and every other key preserved. */
export function withSurface(currentSearch: string, location: SurfaceLocation): string {
  const params = new URLSearchParams(currentSearch);
  // set() keeps an existing key where it already sits, so canonicalizing never reorders the rest of the query.
  for (const [key, value] of Object.entries(surfaceParams(location))) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  const out = params.toString();
  return out ? `?${out}` : "";
}

export function sameSurface(a: SurfaceLocation, b: SurfaceLocation): boolean {
  return a.surface === b.surface && (a.surface !== "dive" || (a.lensId ?? DEFAULT_LENS) === (b.lensId ?? DEFAULT_LENS));
}
