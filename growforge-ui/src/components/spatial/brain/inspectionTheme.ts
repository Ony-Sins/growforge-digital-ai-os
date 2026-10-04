/**
 * Centralised look for BRAIN node inspection — the hover preview card and the holographic
 * inspection panel. Every surface, border, glow and type ramp used by those two surfaces is
 * declared here so the theme can be retuned (or replaced wholesale, see DESIGN.md's
 * "Neural Command Center" direction) without touching interaction code.
 *
 * Readability rule: these surfaces sit over a moving particle field, so the backing plate is
 * opaque enough to hold small type on its own — the blur is depth, not the legibility budget.
 */

/** Raw tokens, shared by the Tailwind class strings below and by the imperatively-built card. */
export const INSPECT_TOKENS = {
  /** Panel body — dark enough for 11px mono to stay legible over drifting particles. */
  surface: "rgba(5, 11, 22, 0.93)",
  surfaceRaised: "rgba(8, 17, 31, 0.96)",
  edge: "rgba(56, 189, 248, 0.28)",
  edgeStrong: "rgba(125, 226, 255, 0.85)",
  glow: "0 0 1px rgba(56,189,248,0.45), 0 18px 48px rgba(0,0,0,0.72), 0 0 42px rgba(56,189,248,0.10)",
  textPrimary: "rgba(238, 250, 255, 0.98)",
  textSecondary: "rgba(186, 214, 232, 0.82)",
  kicker: "rgba(125, 211, 252, 0.88)",
} as const;

/** Inline style block for the hover preview card (built with DOM APIs in the animate path). */
export const HOVER_CARD_CSS = `
  position: absolute;
  left: 0;
  top: 0;
  opacity: 0;
  max-width: 260px;
  padding: 8px 11px 9px;
  border: 1px solid ${INSPECT_TOKENS.edge};
  border-left: 2px solid ${INSPECT_TOKENS.edgeStrong};
  border-radius: 6px;
  background: ${INSPECT_TOKENS.surface};
  box-shadow: ${INSPECT_TOKENS.glow};
  backdrop-filter: blur(10px) saturate(130%);
  pointer-events: none;
  will-change: transform, opacity;
  transition: opacity 140ms ease-out;
`;

/** Class names the hover card's three lines use; styled in globals.css. */
export const HOVER_CARD_CLASSES = {
  kicker: "brain-hovercard__kicker",
  title: "brain-hovercard__title",
  meta: "brain-hovercard__meta",
} as const;

/** Tailwind class strings for the holographic inspection panel (NoteReaderModal). */
export const INSPECT_PANEL = {
  /** Outer positioner — never intercepts clicks itself, only the plate inside does. */
  frame:
    "fixed z-30 top-20 bottom-24 right-6 w-full max-w-md pointer-events-none flex items-stretch " +
    "animate-in fade-in slide-in-from-right-8 duration-300 motion-reduce:animate-none",
  plate:
    "pointer-events-auto relative flex flex-col w-full rounded-lg overflow-hidden " +
    "bg-[rgba(5,11,22,0.93)] border border-cyan-400/30 backdrop-blur-2xl text-slate-200 " +
    "shadow-[0_0_1px_rgba(56,189,248,0.45),0_18px_48px_rgba(0,0,0,0.72),0_0_42px_rgba(56,189,248,0.10)]",
  bracket: "pointer-events-none absolute w-4 h-4 border-cyan-300/80 z-10",
  scanline:
    "pointer-events-none absolute top-0 inset-x-4 h-px bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent " +
    "animate-pulse motion-reduce:animate-none",
  header: "relative px-5 pt-4 pb-3 border-b border-cyan-400/25 bg-cyan-400/[0.045]",
  kicker: "font-mono text-[10px] uppercase tracking-[0.15em]",
  title: "text-base font-bold text-white truncate font-heading mt-1 tracking-wide",
  body: "flex-1 overflow-y-auto px-5 py-5 space-y-6 custom-scrollbar",
  closeButton:
    "p-1.5 rounded-sm border border-cyan-400/25 text-cyan-300/80 shrink-0 transition-colors " +
    "hover:text-white hover:border-cyan-300/60 hover:bg-cyan-400/10 " +
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-300/70",
} as const;
