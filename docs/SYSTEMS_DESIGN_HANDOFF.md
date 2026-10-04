# Systems design handoff

Recorded 2026-10-03, 05:54 +06:00, Codex. Ordinary extension check after the bounded Systems architecture and shared-card refinement. This document describes the built Systems surface; it is not a replacement design system or a global token registry. Root `DESIGN.md` and `.impeccable/design.json` are preserved.

## Overview

Systems implements the quiet engineering control plane specified in `docs/SYSTEMS_CONTROL_PLANE.md`: four areas inside the existing dark GrowForge shell, recorded inventory first, contextual inspection second, original configuration forms at explicit depth. The global header, brand, navigation and single NORA remain shared. CORE, Explore and the eight Dive lenses are outside this extension's design scope.

Evidence checked: `SystemsControlPlane.tsx`, its complete module stylesheet, `SettingsOverlay.tsx`, Systems entry/active/context wiring in `SpatialHud.tsx`, shared type rules in `globals.css`, sampled retained form classes in `IntegrationsHub.tsx` and `AiModelManager.tsx`, `PRODUCT.md`, the current state/roadmap, incumbent design frontmatter and sidecar, and the complete Impeccable `reference/document.md`. Captures 01, 02, 13, 14 and 17–21 were visually inspected from `C:/Users/USERAS/.codex/visualizations/systems-control-plane`; the full 01–21 inventory was checked. Screenshot evidence describes those captures, not independently re-executed backend behavior.

## Colors

The Systems canvas uses near-black navy (`#03090f`) and cool light text (`#d7e5ed`). Inventory titles are brighter (`#e0edf3`); explanatory text is quieter (`#a7bdca`). Selected area buttons use a dark cyan surface (`#0c2532`), pale cyan text (`#d9f6fd`) and a fine blue-grey border (`#1b4352`). Keyboard outlines use cyan (`#75d8eb`). Credential and reachability state remain textual; retained forms also carry their existing status and provider colors.

These are observed Systems values from the module stylesheet, not new root palette definitions. Retained blue/gold save controls remain visible in model, REST and n8n screenshots. Their presence is not a new global gradient prescription or a reason to ban an incumbent brand device.

## Typography

The surface inherits Sora headings and Inter body/control text from `globals.css`, with the existing mono stack for code. Its heading is medium weight (500), 28px on larger screens and 23px at the mobile breakpoint, with `.16em` tracking. Section titles are 16px (15px mobile); inspector titles are 17px. Inventory names are 14px; explanatory lines and actions are 12px; inspector values are 13px; field labels are 11px. Detail text uses a 1.6–1.65 line height and wrapping for long identifiers. These roles describe this surface only.

## Layout

The workspace sits below the shared header (104px top inset), with 5vw side insets and a 1500px maximum width. Four horizontally scrollable area controls precede the inventory. Without inspection the inventory is capped at 900px; selection creates an inventory plus 340px inspector grid with a 48px gap. At 1099px and below, side insets become 24px, inspection becomes 310px wide and the gap becomes 22px.

At 640px and below, the workspace uses 16px side insets and a 90px top inset. Selected inspection replaces the inventory in the available vertical space. Discovery becomes an inset full-width panel. Inventory, inspection and deep forms scroll within their reserved region. The bottom reserve is 170px on larger screens and 220px on mobile; scoped dock/conversation offsets keep shared NORA clear. Deep forms conceal NORA visually without introducing a second composer; expanded NORA conceals conflicting inventory and, at narrower widths, inspection.

**The Progressive Disclosure Rule.** Start with recorded rows. Open inspection on selection; expose catalog discovery and full configuration only through explicit actions. Provenance and route-chain detail use disclosure controls rather than permanent dashboard panels.

## Elevation & Depth

Rows are flat at rest, separated by fine rules and tinted on hover. Inspection uses a dark translucent surface (`rgba(4,14,22,.88)`) with a thin border. Deep reused cards share a diagonal dark translucent material (`linear-gradient(145deg,rgba(8,22,32,.97),rgba(3,11,18,.96))`), a blue-grey border (`#24414e`) and a diffuse shadow (`0 18px 64px rgba(0,0,0,.28), inset 0 1px 0 rgba(178,225,242,.04)`). Their scrim uses `rgba(1,5,9,.64)` and a 6px blur. This scoped material covers MCP, REST, model, catalog, runtime and BYO card families while keeping their existing information and actions.

**The Shared Card Material Rule.** Reused Systems forms inherit the same outer material and field treatment. Content-adaptive width, existing controls and provider identity remain intact.

## Shapes

Inspector and discovery panels have softly rounded 14px corners. Area controls and logo holders use 8px corners; actions and fields use 7px. Rows retain rectangular full-width hit areas. Brand marks use source-backed inline SVG paths; unknown/custom resources use existing neutral SVG icons. No new icon font or textual symbol vocabulary is introduced.

## Components

Area navigation uses explicit selected states (`aria-pressed`) and visible keyboard outlines. Row and area hover transitions last 180ms; scoped form buttons use 160ms color/border transitions. Reduced-motion rules remove these transitions; reused pulse classes are disabled within Systems forms so configuration does not appear as activity.

Inspection adapts to the selected record: connection/model configuration, latest runtime snapshot, routing policy, credential inventory or interface preference. Runtime selection resolves the original probe ID against the newest snapshot. Routing edits disclose their process-only, non-persistent scope beside the action and in feedback. Discovery labels entries as catalog definitions or presets, without implying installation.

Deep forms retain endpoint/command information, configuration fields and their original Test/Edit/Disconnect/Save controls. Shared fields use a dark inset background (`#06111a`), blue-grey border (`#294553`) and lighter cyan focused border (`#75c5d8`). Secrets remain masked in retained forms; the credential inventory shows configuration state.

**The Recorded State Rule.** Credential configuration, authentication, measured reachability, model availability and static routing stay distinct in visible copy. Interface presentation does not establish owner authority. This documentation does not certify external tests, credential writes, model calls or deployments.

## Do's and Don'ts

- Do retain the four-area hierarchy, inventory-first flow and useful detailed action cards during the next scoped finish pass.
- Do preserve shared shell/NORA continuity and scrollable safe zones at desktop, tablet and mobile sizes.
- Do keep Systems styling scoped to its surface and reused forms; preserve protected existing IDs and authorization paths.
- Don't turn this surface's composition into a global rule for CORE, Explore or Dive.
- Don't describe configured resources or static route chains as authenticated, available or executing.

Not canonized or repaired: root `DESIGN.md` still carries pre-existing light surface/text tokens, and its sidecar still carries legacy light-glass shadows; both diverge from the locked dark runtime and remain outside this authorized extension. The retained endpoint/command card uses an uppercase miniature label; it is recorded as a carried craft-floor exception, not a typography rule for future surfaces. No global rewrite or unrelated defect repair was performed.
