import type { SVGProps } from "react";

/**
 * GrowForge glyph system. One coherent language: 24-unit grid, 1.4 stroke, round caps, built only from rings, arcs,
 * nodes and short rules. No icon library, no stock symbols; where a meaning is better carried by type, no glyph is used.
 * Glyphs inherit `currentColor` and are decorative by default (`aria-hidden`); the control or row that uses one owns the
 * accessible name.
 */

export type GlyphName =
  // Dive lenses
  | "overview" | "missions" | "context" | "finance" | "departments" | "agents" | "workflows" | "tools" | "intelligence"
  // operational state marks
  | "signal" | "fracture" | "seal" | "layers" | "brief" | "snapshot" | "pulse" | "attention"
  // controls
  | "reach" | "arrow" | "gap-add" | "voice" | "transmit" | "dismiss" | "step" | "fold";

const NODE = (x: number, y: number, r = 1.5) => <circle cx={x} cy={y} r={r} fill="currentColor" stroke="none" />;

const SHAPES: Record<GlyphName, React.ReactNode> = {
  // ---- lenses: thin, geometric, one idea each ----
  // aperture: a ring held by four index ticks
  overview: <><circle cx="12" cy="12" r="6.2" /><path d="M12 2.6v2.4M12 19v2.4M2.6 12H5M19 12h2.4" />{NODE(12, 12, 1.4)}</>,
  // target: two rings about a point
  missions: <><circle cx="12" cy="12" r="8.4" /><circle cx="12" cy="12" r="4.4" />{NODE(12, 12, 1.2)}</>,
  // two incomplete fields held around a shared datum
  context: <><path d="M8 4.6a8.4 8.4 0 0 0 0 14.8M16 4.6a8.4 8.4 0 0 1 0 14.8" /><path d="M8 8h8v8H8z" strokeOpacity={.55} />{NODE(12,12,1.2)}</>,
  // paired radial balance, with distinct inward index marks
  finance: <><path d="M12 3.6a8.4 8.4 0 0 0 0 16.8M12 3.6a8.4 8.4 0 0 1 0 16.8" /><path d="M6 9h5M13 15h5M12 6v12" strokeOpacity={.65} /></>,
  // three owners joined: a department is a group
  departments: <><circle cx="12" cy="6.8" r="2.5" /><circle cx="6" cy="17" r="2.5" /><circle cx="18" cy="17" r="2.5" /><path d="M10.8 9l-3.6 5.8M13.2 9l3.6 5.8M8.6 17h6.8" /></>,
  // an autonomous nucleus inside a split field
  agents: <><path d="M6.1 6.1a8.4 8.4 0 0 1 11.8 0M17.9 17.9a8.4 8.4 0 0 1-11.8 0" /><path d="M6 12h3M15 12h3" strokeOpacity={.65} /><circle cx="12" cy="12" r="3" />{NODE(12,12,1)}</>,
  // one path that branches in two
  workflows: <><circle cx="5.2" cy="12" r="1.9" /><circle cx="18.8" cy="6.4" r="1.9" /><circle cx="18.8" cy="17.6" r="1.9" /><path d="M7.1 12h3.2l3-5.6h3.6M10.3 12l3 5.6h3.6" /></>,
  // a keyed aperture with four tool ports
  tools: <><path d="M8 4.6h8l3.4 3.4v8L16 19.4H8L4.6 16V8z" /><path d="M12 3v4M12 17v4M3 12h4M17 12h4" strokeOpacity={.65} /><circle cx="12" cy="12" r="2.4" /></>,
  // a lens resolving three radial signals
  intelligence: <><path d="M5.3 7a8.4 8.4 0 0 1 13.4 0M18.7 17a8.4 8.4 0 0 1-13.4 0" /><path d="M8.2 12a3.8 3.8 0 0 1 7.6 0" />{NODE(12,12,1.3)}{NODE(4,12,1)}{NODE(20,12,1)}</>,
  // ---- state marks ----
  // services: three linked nodes, one link broken (dashed) above a baseline
  signal: <><circle cx="5" cy="17.4" r="2" /><circle cx="12" cy="7" r="2" /><circle cx="19" cy="14.6" r="2" /><path d="M6.4 15.8l4.2-6.9" strokeDasharray="1.6 2.2" /><path d="M13.9 8.1l3.5 4.9" /><path d="M3 21h18" strokeOpacity={0.45} /></>,
  // failure: a faceted cell with a live fault line through it
  fracture: <><path d="M12 2.8l7.6 4.4v9.6L12 21.2l-7.6-4.4V7.2z" /><path d="M12 2.8l7.6 4.4-7.6 4.4-7.6-4.4z" strokeOpacity={0.45} /><path d="M12 11.6v9.6" strokeOpacity={0.45} /><path d="M9.6 8.4l3 2.2-1.8 3 2.6 2.4" strokeWidth={1.7} /></>,
  // approval: a document with a decision clock set into its corner
  seal: <><path d="M6.2 3.6h8.4l3.2 3.2v12.8a1.2 1.2 0 0 1-1.2 1.2H6.2A1.2 1.2 0 0 1 5 19.6V4.8a1.2 1.2 0 0 1 1.2-1.2z" /><path d="M14.4 3.6v3.4h3.4" strokeOpacity={0.45} /><path d="M8.2 10.4h5.6M8.2 13.2h3.4" strokeOpacity={0.45} /><circle cx="16.4" cy="16.8" r="4.1" fill="#06182a" /><path d="M16.4 14.5v2.5l1.5 1" strokeWidth={1.6} /></>,
  // recorded traces at three depths, one newest datum
  layers: <><path d="M5 5.7a8.4 8.4 0 1 1-1.4 8" strokeOpacity={.4} /><path d="M8.3 7.7a5.7 5.7 0 1 1-2 6.4" strokeOpacity={.7} /><path d="M12 8.8a3.2 3.2 0 1 1-3.2 3.2" />{NODE(12,8.8,1.2)}</>,
  // NORA brief: a ring open toward the reader, an inner ring held in it
  brief: <><path d="M19.4 8.4A8.4 8.4 0 1 0 20.4 12" /><circle cx="12" cy="12" r="3.6" />{NODE(12, 12, 1)}</>,
  // operational snapshot: a ring held open, a measured inner arc, a marker on the rim
  snapshot: <><path d="M20.6 8.6A9.6 9.6 0 1 0 21.6 12" /><circle cx="12" cy="12" r="6.2" strokeOpacity={0.45} /><path d="M12 5.8A6.2 6.2 0 0 1 18.2 12" strokeWidth={2} />{NODE(20.6, 8.6, 1.5)}</>,
  // measured field with a restrained central trace
  pulse: <><path d="M6 6a8.4 8.4 0 0 1 12 0M18 18a8.4 8.4 0 0 1-12 0" strokeOpacity={.55} /><path d="M3.6 12h5l2-3 2.8 6 2-3h5" />{NODE(3.6,12,1)}{NODE(20.4,12,1)}</>,
  // attention: a ring and inner ring about a keyed diamond
  attention: <><circle cx="12" cy="12" r="9.6" /><circle cx="12" cy="12" r="6" strokeOpacity={0.45} /><path d="M12 7.6l4.4 4.4-4.4 4.4-4.4-4.4z" strokeWidth={1.6} />{NODE(12, 12, 1.2)}{NODE(12, 2.4, 1.1)}{NODE(12, 21.6, 1.1)}</>,
  // ---- controls ----
  // a thin angle that leads forward
  reach: <path d="M9.4 6.2L15.2 12l-5.8 5.8" />,
  // a long arrow
  arrow: <path d="M4.8 12h13.6M13.4 7l5 5-5 5" />,
  // a cross with an open centre
  "gap-add": <path d="M12 4.6v5.2M12 14.2v5.2M4.6 12h5.2M14.2 12h5.2" />,
  // five level bars
  voice: <path d="M5.6 10.2v3.6M8.8 7v10M12 4.6v14.8M15.2 8.4v7.2M18.4 10.6v2.8" />,
  // a pulse leaving a node
  transmit: <><path d="M10.4 8.2a5.4 5.4 0 0 1 0 7.6M14.2 5.4a9.6 9.6 0 0 1 0 13.2" />{NODE(6.4, 12, 1.7)}</>,
  // an X that never closes at the centre
  dismiss: <path d="M7 7l3.6 3.6M13.4 13.4L17 17M17 7l-3.6 3.6M10.6 13.4L7 17" />,
  // a ring with a forward notch: a step in a sequence
  step: <><circle cx="12" cy="12" r="7.4" /><path d="M12 8.6l3.4 3.4-3.4 3.4" /></>,
  // a thin fold marker
  fold: <path d="M6.6 9.8L12 14.6l5.4-4.8" />,
};

export function GrowForgeGlyph({ name, size = 16, strokeWidth = 1.4, glow = false, ...rest }: { name: GlyphName; size?: number; strokeWidth?: number; glow?: boolean } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" data-gf-glyph={name} style={glow ? { filter: "drop-shadow(0 0 5px rgba(96, 212, 255, .65)) drop-shadow(0 0 14px rgba(40, 140, 230, .35))", ...rest.style } : rest.style} {...rest}>
      {SHAPES[name]}
    </svg>
  );
}

/** The nine Dive lens glyphs, keyed by lens label (same order as the lens rail). */
export const LENS_GLYPH: Record<string, GlyphName> = {
  Overview: "overview", Missions: "missions", Context: "context", Finance: "finance", Departments: "departments",
  Agents: "agents", Workflows: "workflows", Tools: "tools", Intelligence: "intelligence",
};
