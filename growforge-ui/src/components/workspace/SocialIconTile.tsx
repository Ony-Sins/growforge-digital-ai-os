import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import type { SocialPlatform } from "@/lib/userMemory";
import { SOCIAL_BRAND_ICONS, SOCIAL_LINKEDIN_FALLBACK, darkenHex, type BrandIcon } from "@/lib/socialIcons";

/** A single consistent "blob" shape (organic asymmetric rounded-square, a
 *  common CSS-only technique — no SVG tracing needed) shared by every tile,
 *  so the row reads as one coherent set rather than mismatched shapes. */
const BLOB_RADIUS = "63% 37% 54% 46% / 43% 37% 63% 57%";

/** Both shadow classes read the same `--icon-glow` custom property rather
 *  than one being set inline — an inline `boxShadow` would permanently win
 *  over any Tailwind `hover:shadow-[...]` class (inline styles always beat
 *  stylesheet rules), which silently killed the hover-glow effect entirely. */
const TILE_CLASSNAME =
  "relative inline-flex shrink-0 items-center justify-center shadow-[0_4px_12px_var(--icon-glow-dim)] transition-transform duration-200 ease-out hover:-translate-y-1.5 hover:scale-110 hover:shadow-[0_10px_24px_var(--icon-glow)]";

function tileStyle(hex: string, size: number): CSSProperties {
  const dark = darkenHex(hex, 0.35);
  return {
    width: size,
    height: size,
    borderRadius: BLOB_RADIUS,
    // darkenHex() already returns a "#"-prefixed value — no extra "#" here.
    backgroundImage: `linear-gradient(135deg, #${hex}, ${dark})`,
    ["--icon-glow" as string]: `#${hex}88`,
    ["--icon-glow-dim" as string]: `#${hex}55`,
  };
}

/** Real official brand mark, rendered white on a diagonal gradient of the
 *  platform's own brand color inside a soft blob shape — a vector SVG icon,
 *  not a rasterized image, so it stays crisp at any size. Hover lifts and
 *  glows with the same brand color, each tile independently. */
export function BrandIconTile({ icon, size = 40 }: { icon: BrandIcon; size?: number }) {
  return (
    <span title={icon.title} className={TILE_CLASSNAME} style={tileStyle(icon.hex, size)}>
      <svg viewBox="0 0 24 24" width={size * 0.52} height={size * 0.52} fill="white">
        <path d={icon.path} />
      </svg>
    </span>
  );
}

/** A phone number has no brand mark — same blob treatment, generic glyph. */
export function GlyphIconTile({ icon: Icon, hex, title, size = 40 }: { icon: LucideIcon; hex: string; title: string; size?: number }) {
  return (
    <span title={title} className={TILE_CLASSNAME} style={tileStyle(hex, size)}>
      <Icon width={size * 0.48} height={size * 0.48} color="white" strokeWidth={2.25} />
    </span>
  );
}

export function SocialIconTile({ platform, size = 40 }: { platform: SocialPlatform; size?: number }) {
  const icon = SOCIAL_BRAND_ICONS[platform];
  if (icon) return <BrandIconTile icon={icon} size={size} />;
  return (
    <span title={SOCIAL_LINKEDIN_FALLBACK.title} className={TILE_CLASSNAME} style={tileStyle(SOCIAL_LINKEDIN_FALLBACK.hex, size)}>
      <span className="font-heading text-white" style={{ fontSize: size * 0.42, fontWeight: 800 }}>
        in
      </span>
    </span>
  );
}
