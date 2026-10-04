/**
 * BRAIN-04B — semantic particle discoverability tunables.
 *
 * Every number that controls how a knowledge-bearing particle separates itself from ordinary
 * atmosphere lives here, so the palette and the contrast budget can be retuned (or swapped for a
 * different visual language — see DESIGN.md's "Neural Command Center" direction) without touching
 * the field architecture, the motion equations or the BRAIN-04A hit testing.
 *
 * Why these exist at all (measured 2026-09-28, full write-up in state.md §A):
 * a record's own peak luminance is already clipped at 255 in every radius band, so it CANNOT be
 * made to stand out by making it brighter. What actually hid records was their background: the
 * two core corona sprites bloom across the inner field, and roughly half the records project
 * within ~150px of the nucleus on screen, where that bloom raises the local mean luminance to
 * ~40-110 against a record peak that cannot exceed 255. The levers below therefore work on
 * SEPARATION (calmer bloom behind the semantic band, crisper structure in the record itself)
 * rather than on raw brightness, which has no headroom left.
 */

/**
 * How much of each corona sprite's opacity is taken back once the atmosphere has fully connected
 * into BRAIN. Both are 0 on the CORE surface (`BrainDrive.links === 0`), so the approved CORE
 * look is bit-for-bit unchanged; they ramp in with the same value that reveals the filaments.
 * The outer corona is damped harder because it is the wide, low-frequency wash that covers the
 * r≈60-130 band where records actually live; the inner one carries the core's identity and is
 * only eased.
 */
export const CORONA_BRAIN_DAMP_INNER = 0.34;
export const CORONA_BRAIN_DAMP_OUTER = 0.52;

/**
 * Slight tightening of the outer corona's radius in BRAIN (fraction of its CORE scale removed at
 * full connection). Pulling the wash inward clears the semantic band without dimming the core
 * itself, so the nucleus still reads as the brightest thing on screen.
 */
export const CORONA_BRAIN_TIGHTEN_OUTER = 0.14;

/**
 * Record sprite structure. A smooth bloom has no edges; the eye separates a record from it by
 * STRUCTURE, not by being brighter than something already clipped to white. So a record is a
 * tight specular core plus a fine rim whose sharpness scales with importance.
 */
export const RECORD_CORE_TIGHTNESS = 15.0; // gaussian exponent on the central dot (was 10.0)
export const RECORD_HALO_BASE = 0.1; // wide soft falloff, kept small so records do not smear
export const RECORD_HALO_BY_IMPORTANCE = 0.1;
/** Fine bright rim: the "engineered marker" cue that a soft glow can never counterfeit. */
export const RECORD_RIM_RADIUS = 0.62;
export const RECORD_RIM_WIDTH = 0.1;
export const RECORD_RIM_STRENGTH = 0.3;
export const RECORD_RIM_BY_IMPORTANCE = 0.34;
/** Hover locator ring (unchanged in kind from BRAIN-03, retuned to sit outside the new rim). */
export const RECORD_HOVER_RING_RADIUS = 0.84;
export const RECORD_HOVER_RING_WIDTH = 0.07;
export const RECORD_HOVER_RING_STRENGTH = 0.8;

/**
 * Glare response. Records that project onto the nucleus's disc are competing with a surface that
 * is already clipped to white — measured local background mean there is ~100-160 against a record
 * peak that cannot exceed 255, so contrast tops out near 2.5 no matter how the record is drawn.
 * The only cue left is high-frequency structure, which a smooth bloom has none of. These control
 * that response, measured in NDC distance from the projected world origin.
 */
export const GLARE_NDC_INNER = 0.12;
export const GLARE_NDC_OUTER = 0.42;
/** Pull the wide soft falloff back where it would only add to the wash it competes with. */
export const GLARE_HALO_WITHDRAW = 0.75;
/** Tighten and strengthen the rim in the same place, so the record reads as an edge, not a blob. */
export const GLARE_RIM_TIGHTEN = 0.42;
export const GLARE_RIM_BOOST = 0.85;

/**
 * Close-encounter response. `uJourneyDepth` (elsewhere in the codebase) is a single scalar tied
 * to distance-from-ORIGIN, so every record swells by the same amount together regardless of
 * whether the camera is actually anywhere near that specific one — measured before this existed:
 * the closest any record's TRUE 3D distance to the camera ever got on a straight radial scroll-in
 * was ~96 world units, even once already deep inside BRAIN (d=142 from origin). Records at the
 * screen edges stayed small dots the whole way down; nothing ever came genuinely close.
 * This is the per-record term that fixes that: computed straight from view-space distance in the
 * vertex shader (`length(mv.xyz)`), so it only fires for whichever specific record the camera's
 * orbit pivot has actually been drawn toward (see SpatialCanvas's exploration-drift), independent
 * of every other record's position. FAR/NEAR are in world units.
 */
/**
 * Minimum "presence" (0 = faint locator, 1 = fully resolved) of a real record once its name is shown,
 * i.e. after BRAIN arrival. 0 at arrival is unchanged (distant records stay faint locators); this only
 * stops a named record from being a near-invisible dot beside its own label. Affects the ~30 real
 * records only, so overall scene brightness is unaffected.
 */
export const RECORD_LABELLED_FLOOR = 0.45;
export const RECORD_CLOSE_FAR = 130;
export const RECORD_CLOSE_NEAR = 16;
/**
 * Point-size clamp at full closeness, in the SAME unscaled units as the existing far-field cap
 * (`38.0` below, before the `* uPxScale` multiply) — the record grows large and legible up close
 * but is capped well short of swallowing the frame. The failure mode this avoids was measured
 * directly: an earlier revision's UNCLAMPED near-field growth produced a giant blank cyan disc
 * that filled roughly half the 900px-tall viewport with no visible structure at all — worse than
 * the small-dot problem it was meant to fix. 210 reads as a genuinely large, detailed node (about
 * 23% of a 900px-tall frame) without ever becoming a screen-filling blob.
 */
export const RECORD_CLOSE_MAX_PX = 210;

/** Record palette — cyan-white, matching the approved BRAIN language. */
export const RECORD_COLOR_EDGE: [number, number, number] = [0.6, 0.92, 1.0];
export const RECORD_COLOR_CORE: [number, number, number] = [1.0, 1.0, 1.0];

/** GLSL literal helper so the shader and the TS tunables can never drift apart. */
export const glsl = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n));
export const glslVec3 = (c: [number, number, number]) => `vec3(${c.map(glsl).join(", ")})`;
