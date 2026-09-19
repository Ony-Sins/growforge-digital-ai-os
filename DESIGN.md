---
name: GrowForge Digital AI OS
description: A navy-and-glass command deck for running an AI agency — crisp, precise, live.
colors:
  navy: "#0b1220"
  bg-app: "#f8fafc"
  bg-surface: "#ffffff"
  bg-glass: "rgba(255, 255, 255, 0.62)"
  bg-glass-strong: "rgba(255, 255, 255, 0.82)"
  bg-sunken: "rgba(11, 18, 32, 0.035)"
  bg-code: "#0b1220"
  border-metal: "rgba(11, 18, 32, 0.08)"
  border-metal-strong: "rgba(11, 18, 32, 0.14)"
  text-secondary: "#475569"
  text-muted: "#94a3b8"
  text-on-navy: "#f8fafc"
  electric: "#0078ff"
  electric-soft: "#4da2ff"
  gold: "#ffc432"
  gold-soft: "#ffd970"
  silver: "#cccccc"
  emerald: "#10b981"
  crimson: "#e11d48"
typography:
  heading:
    fontFamily: "Sora, ui-sans-serif, system-ui, sans-serif"
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
  mono:
    fontFamily: "var(--font-mono), ui-monospace, 'SF Mono', Menlo, monospace"
rounded:
  lg: "0.5rem"
  xl: "0.75rem"
  2xl: "1rem"
spacing:
  xs: "0.375rem"
  sm: "0.625rem"
  md: "1rem"
  lg: "1.25rem"
components:
  button-primary:
    backgroundColor: "linear-gradient({colors.electric}, {colors.gold})"
    textColor: "#ffffff"
    rounded: "{rounded.xl}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "linear-gradient({colors.electric}, {colors.gold})"
  button-secondary:
    backgroundColor: "{colors.bg-surface}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.xl}"
    padding: "6px 12px"
  card-glass:
    backgroundColor: "{colors.bg-glass}"
    rounded: "{rounded.2xl}"
    padding: "20px"
---

# Design System: GrowForge Digital AI OS

## Future visual direction — "The Neural Command Center" (2026-09-19)

The current light Command Deck is an incumbent implementation, not the long-term visual world. The supplied references establish an obsidian neural operating environment with a compact sidebar, global command/search bar, persistent assistant or memory/profile rail, high-signal live-work dashboard, and immersive AI Profile/Brain surface.

- **Atmosphere:** near-black/navy space field, deep blue glass panels, fine electric-blue signal borders, sparse particles, and restrained departmental spectral color only inside telemetry/brain views.
- **Information architecture:** Home answers what is running, blocked, and needs attention; the AI Profile owns Brain, Memory, Activity, Connections, and Profile; inventories remain behind dedicated views rather than filling the home screen.
- **Brain:** the primary landmark; start as data-driven 2D/2.5D telemetry before full WebGL 3D. Departments, agents, tools, and activity appear only when backed by real state.
- **Interaction:** luminous but quiet. Glows mean live, connected, selected, approved, or needs attention; never ambient decoration.
- **Reference boundary:** do not reproduce fictional counts, named projects, copy, or images from the references. They establish composition, density, contrast, and emotional tone—not product facts.

## Overview

**Creative North Star: "The Command Deck"**

GrowForge Digital AI OS reads as the bridge of a small, high-competence ship — not a marketing SaaS dashboard. A crisp navy-and-white hull (`#0b1220` text on a near-white `#f8fafc` field) carries frosted glass panels that float over it, each with a hairline metallic border and a soft blur (`backdrop-filter: blur(20px) saturate(140%)`). Electric blue (`#0078ff`) is the instrument-panel color — links, active states, data flow, primary actions. Gold (`#ffc432`) is reserved and earned: it marks premium/confirmed states, never decoration. Status is legible at a glance through small glowing dots and pulse animations (`node-pulse`, `glow-electric`, `glow-gold`, `glow-crimson`) rather than large banners.

The two brand faces already live in the type system: **Sora** carries every heading with a slight negative tracking (`-0.01em`) for a confident, engineered feel; **Inter** carries body copy for maximum legibility during real reading (job outputs, plan text). This is a deliberate pairing, not a default — do not substitute either for a generic system font.

**Key Characteristics:**
- Frosted glass panels on a light, near-white base — never a dark app shell.
- Electric blue = action/data. Gold = rare, earned confirmation. Both together only on the highest-priority calls to action (primary buttons, the trophy/final-plan accent).
- Status is conveyed by small glowing/pulsing dots and thin animated flow-lines, not color-blocked banners.
- Motion is subtle and physical (soft lift on hover, gentle scale, slow float on the brand mark) — never bouncy or elastic.

## Colors

The palette is a light, glass command surface with two reserved accent colors and a small status vocabulary — not a rainbow.

### Primary
- **Instrument Blue** (`#0078ff`, soft variant `#4da2ff`): the primary interactive color — links, active nav state, "in progress" glows, the leading half of every primary-action gradient. This is the color of something happening right now.

### Secondary
- **Earned Gold** (`#ffc432`, soft variant `#ffd970`): confirmation, premium, and completion — the trailing half of primary-action gradients, the "Approved"/trophy accent on a finished plan, the owner-role badge. Never used as a base/background color; it appears as an accent or on completion, never as decoration on an idle element.

### Neutral
- **Deep Hull Navy** (`#0b1220`): primary text color and the one place the palette goes dark — code/terminal surfaces and text on light backgrounds.
- **App White** (`#f8fafc`): the page background — the "hull" every glass panel floats above.
- **Surface White** (`#ffffff`): solid card backgrounds where full opacity (not glass) is needed.
- **Slate Secondary** (`#475569`) / **Slate Muted** (`#94a3b8`): secondary and tertiary text — captions, metadata, timestamps.
- **Metal Border** (`rgba(11,18,32,0.08)`, strong variant `rgba(11,18,32,0.14)`): hairline borders on every glass/solid card — never a solid gray border.

### Status
- **Emerald** (`#10b981`): success, done, verified.
- **Crimson** (`#e11d48`): error, denied, destructive action.

### Named Rules
**The Earned Gold Rule.** Gold never appears on an idle or default element. It marks something that has actually completed, been approved, or reached a premium/owner state — using it decoratively (e.g. a gold icon tile on every card heading) breaks the signal.

## Typography

**Heading Font:** Sora (with ui-sans-serif, system-ui fallback)
**Body Font:** Inter (with ui-sans-serif, system-ui fallback)
**Label/Mono Font:** system mono stack (SF Mono, Menlo fallback)

**Character:** Sora's slightly geometric, engineered letterforms carry authority at heading size with tightened tracking; Inter recedes into pure legibility for body copy and long-form plan output. The pairing reads as "precision instrument," not "friendly SaaS."

### Hierarchy
- **Heading** (Sora, `-0.01em` tracking): all `h1`–`h6` and `.font-heading` — section titles, card titles, modal headers.
- **Body** (Inter, default tracking): all paragraph and UI copy, including long-form job/plan output rendered as Markdown.
- **Label/Mono** (mono stack): timestamps, hashes, status codes, terminal/log output, IDs.

## Layout

A single scrolling dashboard (`max-w-7xl`, `p-4 md:p-6`) rather than tab-switched pages — sidebar navigation scrolls to an anchored section instead of swapping views, so nav position must always match physical section order (a fixed rule as of 2026-09-17, not a suggestion). Cards stack in a vertical rhythm with consistent `gap-4`–`gap-6` spacing; a persistent sidebar (`w-64`/`w-72`) and header (`h-16`) frame the scroll area at desktop widths, collapsing the sidebar below `md`.

## Elevation & Depth

The system is glass-layered, not shadow-lifted: depth comes primarily from `backdrop-filter` blur/saturation plus a hairline metal border, not from heavy drop shadows. Shadows that do exist are soft, diffuse, and directional (angled down-and-out), used to separate a floating panel from the page rather than to fake a heavy physical object.

### Shadow Vocabulary
- **Glass card** (`0 1px 0 rgba(255,255,255,0.6) inset, 0 12px 32px -20px rgba(11,18,32,0.25)`): the standard floating panel — inset highlight on top edge, soft diffuse shadow below.
- **Glass card, strong** (`0 1px 0 rgba(255,255,255,0.7) inset, 0 16px 40px -22px rgba(11,18,32,0.28)`): modals and elevated overlays — same language, slightly more separation.
- **Glow (electric/gold/crimson)** (`0 0 0 1px <color>/28-35%, 0 0 24px <color>/28-32%`): a soft colored halo used for live/active status indicators, never for static decoration.

### Named Rules
**The Glass-Not-Shadow Rule.** Depth is conveyed by blur and a hairline border first; a heavy drop shadow on a static element is a tell that it's not following this system.

## Shapes

Corners are consistently rounded and generous — `rounded-xl` (0.75rem) for buttons, inputs, and small controls; `rounded-2xl` (1rem) for cards and panels. Borders are always hairline (`1px`) and low-contrast (the metal-border tokens), never a heavy stroke. No sharp corners anywhere in the current system.

## Components

### Buttons
- **Shape:** `rounded-xl` (0.75rem), consistent across every variant.
- **Primary:** gradient background `from-electric to-gold`, white text, `px-3–4 py-1.5–2.5`, `font-semibold`, soft shadow.
- **Hover/Focus:** subtle scale (`hover:scale-[1.02]`), never a color swap alone — motion confirms interactivity.
- **Secondary/Ghost:** solid white or transparent background, hairline metal border, secondary-slate text, hover shifts text to navy or electric.

### Cards / Containers (`.glass-card`, `.glass-card-strong`)
- **Corner Style:** `rounded-xl`/`rounded-2xl`.
- **Background:** translucent white (`rgba(255,255,255,0.62)` standard, `0.82` strong) with backdrop blur.
- **Shadow Strategy:** see Elevation & Depth's glass-card shadow.
- **Border:** hairline metal border.

### Status Indicators
- **Style:** a small filled dot (`StatusDot`), color-coded (electric = active/pulsing, emerald = success, crimson = error, muted = idle), paired with a short label — never a large colored banner for routine status.

### Inputs / Fields
- **Style:** hairline metal border, white/glass background, `rounded-xl`.
- **Focus:** border shifts to electric at ~50% opacity (`focus:border-electric/50`), no heavy glow ring.

### Navigation (Sidebar)
- **Style:** flat list, `rounded-lg` items, active item gets a soft electric-to-gold gradient background wash plus a small glowing electric dot on the right edge — not a solid color block or a left border indicator.

## Do's and Don'ts

### Do:
- **Do** use the electric-to-gold gradient only for the single highest-priority action in a given view.
- **Do** pair every glass panel with a hairline metal border and soft blur — never a bare translucent fill with no border.
- **Do** use small glowing/pulsing status dots for live state instead of large color-blocked banners.
- **Do** keep Sora for headings and Inter for body — never substitute a generic system font for either.

### Don't:
- **Don't** use gold as a background or decorative color on an idle/default element — it signals "earned/confirmed" and loses meaning if used casually.
- **Don't** add heavy drop shadows for depth — this system is glass-and-blur, not shadow-lifted.
- **Don't** use bounce/elastic easing on any transition — motion here is a subtle, confident lift, never playful overshoot.
- **Don't** introduce a second background pattern (solid dark shell, flat-color cards) — the light glass-on-white hull is the one visual language across the whole app.
