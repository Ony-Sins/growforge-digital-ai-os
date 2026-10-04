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

## Current approved Dive Layer 2 direction — 2026-10-01

Layer 1 is the approved visual baseline: preserve its calmness, density, spacing, palette and progressive disclosure. Mission / Execution changes the lens inside that shell. Display only actual active non-test missions by default; no active missions means the honest empty state. Mission controls disclose creation and recorded history, with new Layer 2 List/Timeline presentation modes based on stored creation timestamps. Selecting a mission discloses a compact summary; Inspect execution exposes one category at a time, including actual steps/timestamps, dependencies, department scopes, context, files/full outputs, revisions, next steps, cost/telemetry, evidence, QA and approvals. Historical selection remains visibly Completed or Error and never changes active counts. Existing NORA receives selected mission context and clears it on dismissal, using one composer. No standalone Missions page/navigation, mission planets or decorative relationships, permanent filters/panels or duplicate assistant input. Missing metadata remains unrecorded. Layer 2 implementation stops for visual review; do not advance to Layer 3.

## Approved Dive Layer 1 direction — 2026-10-01

Dive settles from the existing Explore transition into a near-black, midnight/navy environment with restrained icy cyan, Sora headings, Inter body text, thin glass boundaries and distant ambient particles. Default information is limited to compact mission/agent/approval counts, measured service availability, a quiet execution anchor and NORA access. No walls of cards, permanent sidebars, fictional activity or animated transfer packets. Structural scope is explicitly distinct from execution. Object selection materializes a compact anchored inspector; Context, Skills, Tools and Evidence disclose one category at a time. Empty-space click and Escape dismiss; drag retains camera control. Lens previews change emphasis in the same shell; deeper layers wait for visual review. Reduced motion disables the plunge/flash and overview/inspector entrance animation. Earlier light-hull and spaceship prescriptions below are historical incumbent guidance and do not apply to this approved Dive surface. Explore and its transition composition stay intact.

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

### Dive Overview — native INNER CORE (2026-10-03, Codex)

This bounded Overview refinement preserves the incumbent near-black Dive shell, heading and recorded counters, centered focal volume, truthful execution line, single NORA composer and bottom lens rail. The October 3 user reference authorizes the translucent native volume in Overview only: it supersedes earlier empty-center, no-sphere/orbit and no-ambient-glow prescriptions for this component. Other lenses retain their existing composition and material rules. This records the local implementation; it does not declare user visual approval or extend the reference's fictional activity into the product.

**The Ambient Material Rule.** INNER CORE light and movement describe material, never jobs, agents, service health, execution or transfer traffic. Execution presentation remains separately backed by recorded state; idle has no invented stages or moving packets.

- **Material and shape:** native Three.js geometry and shaders form one continuous translucent outer skin and three open, tilted curved sheets. Broad optical folds and selective cyan/blue edge light carry depth; 22 fixed structural junctions, 15 curved threads and two broken support arcs remain sparse. A concentrated pale nucleus has a soft additive halo. No physical room, floor, platform or external starfield is introduced; the supplied image remains a critique reference, with no shipping raster.
- **Interaction and motion:** membranes, filaments and support arcs drift independently and slowly. Pointer parallax eases with inertia; hover gently raises membrane clarity; click produces a small, decaying scale response and restores/focuses the existing NORA composer. These effects carry no execution meaning.
- **Lifecycle:** reduced motion holds the volume's rotation, breathing, parallax and click scale static, including when the preference changes while mounted. Offscreen or hidden-document frames skip rendering and motion advancement. Unmount cancels animation, disconnects observers/listeners and disposes geometries, materials and the WebGL renderer. Source establishes these behaviors; still captures do not certify motion performance.

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

Layer 2 semantic reconciliation (2026-10-01): Awaiting Approval · Tool action appears only for a matching real pending approval. This is derived presentation, not a stored hold/pause state. Planning is a derived active-plan phase, Completed displays done, and Error stays distinct. No due dates, revenue/business metrics, manual pause/resume or separate discussion capability is represented. List/Timeline are new Layer 2 presentation modes. The 15 available inspection categories disclose one at a time; density and the approved baseline remain fixed.

Dive navigation refinement (2026-10-01 18:14 +06:00, Codex): preserve global navigation at top, operational environment in center, stable compact floating lens rail at bottom-center and inspectors only on deliberate selection. Rail uses faint-border navy glass, restrained cyan active state and no glow; narrow layout horizontally scrolls its contents above global navigation. No rendered layer numbers/footer. Unavailable-feature explanations materialize only on explicit lens request and dismiss with close/Escape/empty click/lens change. Keep inspector/rail clearance. Layer 2 semantics approved; Layer 3 and legacy cleanup remain unauthorized.

Dive native interior visual pass (2026-10-01 18:40 +06:00, Codex): user authorized DIVE IN UI.png as the primary visual reference. This supersedes the earlier empty-state central configured anchor/orbit presentation for Dive. Native CSS gradients and decorative SVG curved membranes/edge light/lower reflection preserve a dark negative-space center; no screenshot background, sphere, solar-system objects or orbital rings. Header remains unchanged; title precedes the bottom-centered icon lens rail with restrained entrance motion and reduced-motion override. Empty Overview hides the visible Execution Map heading and configured structural anchor; real counters remain. Existing mission/agent selection, progressive inspector and requested-only Intelligence response are preserved. Pure presentation pass: no mission runtime/schema/lifecycle/approval/NORA/data-contract changes. Layer 2 visual review remains the stop; Layer 3 and legacy cleanup are not authorized.

> **2026-10-01 19:04 +06:00, Codex — final Dive visual polish, UNCOMMITTED; stopped for visual approval.** Approved composition preserved. Changed only DiveInterior.tsx and DiveOverview.module.css: peripheral surface falloff and thin membrane edges; removed hard lower horizon/floor curves and replaced reflection with diffuse depth haze; retained four extremely faint warm peripheral traces; 37/59/71-second low-amplitude light/drift effects with reduced-motion overrides; rail glass/icon balance refined without changing bottom placement or enlarging controls. No runtime, mission/schema/lifecycle/NORA/approval/navigation architecture changes; no new data/objects/panels. TS, focused lint, 8 Layer 1 and 12 Layer 2 checks PASS; build PASS. Desktop 1920x1080 and narrow 390x844 inspected; contextual mission inspector and Intelligence preserved. Reduced motion source-verified, not browser-emulated. Review screenshots in external dive-layer2/final-polish. No Layer 3, commit/push/deploy/reset/stash. User approved preceding interior direction; this polish awaits separate visual approval.

> **2026-10-01 19:27 +06:00, Codex — USER VISUAL APPROVAL: Dive base environment and Layer 1/2 foundation LOCKED; continuity review complete, UNCOMMITTED.** User authorized the attached approval/continuity brief. Preserve the current internal CORE membrane/depth, negative space, palette, ambient motion character, title hierarchy, rail position/material and progressive disclosure. Future lenses resolve inside this persistent shell; no separate visual worlds/default dashboards/permanent sidebars. Layer 1 approved; Layer 2 architecture/semantics approved (Active, Planning, Awaiting Approval, Completed, Error over unchanged runtime). Mission controls/List/Timeline/history/creation remain deliberate disclosure. Layer 3 still requires explicit authorization.
>
> **Review/fix:** Live CORE -> Explore -> Dive reviewed at normal desktop viewport. Found one clear shared-header terminology mismatch: Assistant on CORE/Explore versus NORA on Dive. SpatialHud.tsx now consistently labels the same control NORA in visible text, accessible name and tooltip; handlers/placement/state unchanged. Source reviewed transition cancellation, origin-directed plunge, visibility switch, camera/FOV/exposure reset and reduced-motion branches. Browser verified Explore reader selection + Escape; Dive settlement hides Explore objects; NORA opens within Dive with one composer and closes; Intelligence appears only on request and Escape clears it; returned clean Overview. CORE's brighter sphere, Explore's knowledge-panel density and Dive's restrained interior are purposeful approved differences, left alone. Explore's 8 department count derives from current source-backed graph records rather than the ten canonical taxonomy entities; potential label ambiguity recorded for a separately scoped semantic clarification, no data changes. Explore NORA currently returns to CORE by established handler while Dive opens in place; preserved navigation architecture, not redesigned.
>
> **Validation:** TypeScript PASS; SpatialHud focused lint PASS; production build PASS. Reduced-motion navigation/flash/CSS verified in source, not forced browser preference or GPU-motion profiling. No mission/data/runtime/NORA logic/approval changes or external operational actions. Earlier polish 8+12 tests remain valid (only label changed). Review proof: external dive-layer2/final-polish/continuity/aligned-dive-header.jpg. No commit/push/deploy/reset/stash. Stop before Layer 3.

> **2026-10-01 19:54 +06:00, Codex — bounded cross-surface NORA and Explore counter corrections, UNCOMMITTED; complete, STOP before Layer 3.** User explicitly authorized behavior changes while preserving locked composition. SpatialHud reuses the one continuously mounted CoreCommandCenter across CORE/Explore/Dive/Systems: header toggle no longer calls onSelectTier; non-CORE surfaces show conversation-only mode. Systems is the existing settings overlay, retained beneath NORA with original category/state. Open NORA is layered above readers; capture-phase Escape closes NORA before underlying inspection dismissal. No camera/lens/selection mutation on NORA open/close. SpatialCanvas passes its existing selected record to the shared HUD.
>
> **Context:** noraSurfaceContext.ts assembles bounded read-only current-surface context through the existing attachmentContext request field. CORE/Systems discard object scopes; Explore includes only its actual stable record ID, canonical department ID, title/source/bounded excerpt; Dive includes only the existing selected recorded mission context. No selection yields explicit null. MissionInspector's existing mount/unmount cleanup remains unchanged. Other surfaces never consume retained mission state. Closing NORA preserves valid selection; dismissal clears its scope. No additional composer/chat store/provider/system created; no messages/model/tool calls submitted.
>
> **Counter audit:** obsidianReader builds graph nodes from real root *_Agent_System.md files, classified by the canonical taxonomy. Eight nodes are kind department; Executive Orchestration and Quality/Risk/Governance are oversight; Growth Demand/Meta Ads sources are branches. Counter measures the currently loaded department-classified source records, not complete canonical topology or verified operating agents. Label is 8 Department Records. Removed the ten-entity taxonomy fallback for unclassified graph data (now actual matching records only). Demo Layers semantics retained; no records fabricated or added.
>


NORA refinement (2026-10-01 21:30 +06:00, Codex): shared bottom composer is the sole entry; bare luminous reactive + followed by a thin separator, mic/send on right. One centered upward transparent transcript; details/settings/attachments requested only. Fixed glyph hit area, smooth state light, hover and pressed feedback, reduced motion. No header launcher or right chat drawer. This supersedes the earlier circular + reference treatment by explicit user steering. Dive environment remains locked.

NORA alignment (2026-10-01 22:08 +06:00, Codex): all surfaces use Dive's raised bottom composer anchor and measured 14px panel-to-composer gap. Shared contextual glass uses dark navy/black translucent fill, restrained edge and 8px blur; no blue milky veil. Glyph-only + remains with visible typing/listening glow and separator.

NORA continuity polish (2026-10-01 22:39 +06:00, Codex): shared dark glass also applies to global header shells, with 8px blur; fixed compositor geometry, 14px transcript gap and 240ms/4px restrained reveal (reduced-motion off). Explore empty-space dismissal matches reader-close inspection cleanup. Dive journey uses one reversible 1600ms camera path through the existing CORE, without added warp scenery. Locked Dive composition and Layer 2 semantics remain unchanged; review checkpoint before Layer 3.

CORE membrane continuity (2026-10-01 23:03 +06:00, Codex): reversible journey owns surface attenuation, interior resolution and late controls together; retain exterior-facing CORE shader, no white flash or rear-face white rim. Electric-blue peripheral haze settles into the locked dark interior; preserve centre, rail and composition. Record hit targets now follow actual visible-body radius, so nearby empty space does not freeze nodes. Visual-review stop before Layer 3.

Dive Departments extension (2026-10-02, Codex; visual approval pending): Departments extends the locked Dive shell with a quiet list of eight canonical departments and a separate oversight row. Selection reveals one compact inspector using shared dark glass and available source-backed categories. On narrow screens, inspection temporarily replaces the list. The existing lens rail and single NORA composer remain in place. No new design tokens or environment composition; this authorization supersedes earlier Layer 3-not-authorized checkpoint wording only for the bounded Departments lens.

Departments hierarchy refinement (2026-10-02 13:54 +06:00, Codex; visual approval pending): dedicated Departments title and canonical eight-department/two-oversight summary, precision rows, content-sized inspector with collapsed Provenance, and Context rail label. Locked Dive environment, shared glass, typography and runtime remain unchanged.

NORA popover clearance (2026-10-02 14:01 +06:00, Codex): Conversation Settings and action menus stay within the current conversation workspace and scroll internally when required. Attachment disclosure respects available viewport height. Composer, lens rail and shared glass remain unchanged.

### Dive Overview — command extension (2026-10-04 01:39 +06:00, Codex)

Overview extends the incumbent Dive shell with four secondary surfaces: Mission Status, Service Reachability, Recent Activity and Quick Actions. They preserve near-black translucent fills, restrained cyan edges and controls, hairline borders, rounded panels, Sora headings and Inter body text. Desktop places two thin surfaces on each side of the existing native INNER CORE; narrow screens retain CORE above a bounded card scroller, with the single composer and lens rail below. Recorded execution stages replace the surrounding surfaces when present. This is an Overview-only composition, not a system-wide dashboard prescription; incumbent tokens and `.impeccable/design.json` are preserved.

Mission totals exclude test runs, activity follows recorded creation time, and reachability comes from recorded probes. Missing snapshots and unmeasured services remain explicit. Navigation actions open existing lenses or mission inspection. The four surfaces do not establish new health, progress, queue or agent-availability signals.

For this component only, the earlier Ambient Material Rule now distinguishes idle material from state response: idle membrane drift remains ambient, while the existing renderer's light, clarity and motion parameters respond to the single composer's actual focus, capture, request and response signals, recorded running jobs, pending approvals and an observed running-to-completed transition. A complete JSON reply receives a finite presentation dwell; it does not represent streamed progress. Streaming and speaking hooks remain false in the current composer, with no microphone amplitude or synthetic audio visualization. Reduced motion retains static geometry; source behavior and desktop/mobile stills do not certify live motion, performance, provider responses or microphone operation.

Not canonized or repaired in this bounded amendment: the incumbent heading/inspector eyebrows, historical light-world token/sidecar mismatch and earlier removed-support-arc prose. These are inherited craft or documentation drift outside the extension, not reusable rules.
