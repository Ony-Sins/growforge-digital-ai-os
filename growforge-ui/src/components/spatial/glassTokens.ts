/**
 * The canonical GrowForge glass material tokens (S2.2B). Declared on :root in src/app/globals.css: the SINGLE source of truth (values extracted from the Overview lens's actual
 * implementation, which now consumes them too). Every lens, workspace, panel and transition surface adopts these names instead of hard-coding material colours. A test keeps this list and
 * the stylesheet in step. Roles: environment, primary glass (+ `wide` for very large overlays), light on the glass, edges, depth inside the glass,
 * diffusion / separation, typography hierarchy, accents.
 */
export const GLASS_TOKENS = [
  "--gf-env-base", "--gf-env-deep",
  "--gf-glass-a", "--gf-glass-b", "--gf-glass-c", "--gf-glass-wide-a", "--gf-glass-wide-b", "--gf-glass-wide-c", "--gf-glass-angle",
  "--gf-gloss", "--gf-specular", "--gf-facing-glow",
  "--gf-hairline", "--gf-edge-top", "--gf-edge-inner", "--gf-rule", "--gf-run", "--gf-edge-line",
  "--gf-raised-a", "--gf-raised-b", "--gf-raised-edge", "--gf-raised-hover", "--gf-recess",
  "--gf-blur", "--gf-saturate", "--gf-shadow", "--gf-scrim",
  "--gf-text-title", "--gf-text", "--gf-text-body", "--gf-text-quiet",
  "--gf-accent", "--gf-accent-ring", "--gf-focus", "--gf-champagne", "--gf-champagne-ring",
] as const;
