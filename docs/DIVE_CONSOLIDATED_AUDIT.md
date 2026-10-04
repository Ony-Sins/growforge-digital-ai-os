# Dive consolidated architecture / state / regression audit

2026-10-03. Current local filesystem audited after user approval of Layer 8. All eight lenses are structurally approved. No new features, aesthetic redesign, backend/store/auth changes, model calls, commits or deployment.

## Result

PASS for the bounded Dive architecture after material corrections. Suitable for Antigravity premium visual/responsive review. This is not a deployment or universal security certification.

## State and NORA

Selections are lens-owned; deliberately applied department filters remain distinct from selected-object scope. Clearing Agents filtering now preserves its inspector. On mobile its Clear control remains reachable while inspecting. Leaving a lens clears selected objects; dismissing inspectors clears shared NORA object scope. NORA hide/restore and Focus preserve selections and mounted composer state. Existing shared chip/marker/request priority covers mission, department, agent, workflow, context, toolRecord and intelligence evidence. Overview's generic real mission/agent inspector now emits the same canonical events and cleanup; no second context store or chip was introduced. Current local state has no active mission/agent, so that path was verified with regression fixtures/source assertions rather than fabricated live activity.

Intelligence selected job details now invalidate/reload when the parent evidence timestamp changes; stale detail fields cannot be attached to a newer snapshot. Protected reads validate job identity.

## Identity and projection

Mission job.id, department taxonomy IDs, existing specialist IDs, workflow definition/step IDs, graph/context field IDs, connector/model/service IDs and Intelligence evidence IDs remain authoritative. Context field IDs are scoped by the current-user read, not global independently verified fact identities. Tools no longer matches default model identity by display title or synthesizes inventory when source reads are absent. Projection regressions check unique IDs and preview/test exclusion. Provider/model usage matching is combination-level evidence; receipts do not identify the configured model record, so it cannot certify instance-level attribution.

## Truth semantics

Tools reports unavailable permission/auth/config evidence as unverified. Explicit recorded model metadata can establish configuration; catalog/definition existence cannot. Model availability is not established by an Ollama service probe. Missing core data does not fabricate offline services; preview placeholders are excluded. Unknown latency is not rendered as 0 ms. Historical provider/model use does not imply current availability. Department tool filtering describes recorded relationships, not permission grants. No backend permission system was added.

Missions previously described CoreState cost estimates as recorded cost. That value originates in the legacy static-price estimator. Mission inspection now says API cost not recorded; estimates are not billing receipts. Missing/partial token reporting is identified; economic cost remains unknown. Intelligence already excludes estimates. The estimator, historical jobs and rerun behavior are unchanged.

Overview excludes preview-placeholder probes from measured health. Context/source/knowledge/loaded/freshness distinctions and static structure/event-backed activity remain preserved. No assumed metrics or simulation added.

## Navigation and shared shell

Explicit Explore selection after a CORE-origin Dive now finishes the existing reverse crossing then honors Explore as the requested destination. Explore-origin Dive preserves the existing camera/inspection return. Wheel behavior remains ordinary zoom/scroll, with no implicit Dive entry. Pending exit navigation cancels on a different immediate exit or renewed Dive entry.

Single NORA composer; hide/restore and Focus restoration, conversation settings and attachment menu audited. NORA-focused Escape closes the conversation first; inspector-focused Escape clears the selection. Mobile can hide an overlapping inspector while the conversation is open without destroying selection; minimize restores inspection. Department tabs retain aria-selected and no invalid aria-pressed.

## Responsive evidence

Default lenses exercised at 1920x1080, 1440x650, 900x900 and 390x844. No horizontal page overflow; rail remains in its safe zone and scrolls horizontally on mobile. Later lenses were successfully selected. Selected workflow, model/tool, service/evidence and historical mission inspectors measured at all four sizes; short content fits and long content scrolls internally. Mobile department/agent inspection and independent filter clearing checked. Conversation settings scroll within their own available bounds; composer remains separate. Cosmetic rail discoverability and inspector hierarchy remain for Antigravity, without data-model changes.

## Verification

16 regression suites: Overview, Missions, Departments, Agents, Workflows, Context, Tools, Intelligence, Dive journey, entity presentation, direct-record hover, system index, taxonomy, NORA surface context, Tools NORA presentation, shell visibility. PASS. Historical compatibility checked 19 saved jobs and live store bytes remained unchanged. TypeScript PASS. Focused lint PASS, zero warnings. Production build PASS, 42 generated pages; 10 incumbent dynamic filesystem tracing warnings remain. No live model/agent/tool execution or chat submission used for proof.

## Remaining architecture / evidence gaps

- Durable tenant/workspace event spans and correlation/parent IDs, routing reasons, tool/retrieval receipts: required for Trace and full Execution Replay.
- Complete resolved context/input/instruction snapshots and safe protected projections: Context Integrity/Router and replay.
- Explicit assumption/scenario engine: Scenario Lab.
- Controlled cohorts, evaluators and request identity: Model Bench.
- Provider billing receipts, currency reconciliation and versioned pricing registry: measured API cost. API cost is not total economic cost.
- Effective authentication/grant inventory and per-model checks: truthful present tool availability. Current bounded read paths do not expose these.
- humanizerEngine.ts exists; runtime usage remains partially wired/manual. Automatic NORA/entity generation integration is post-UI work.
- Ten existing filesystem-tracing warnings in beta store, vault reading and tool filesystem paths: post-UI backend/deployment cleanup. No functional regression demonstrated here; deployment exposure review remains necessary before release.
- Pre-existing light DESIGN frontmatter differs from approved dark live UI: documentation reconciliation belongs to the later Antigravity handoff, not a visual rollback.

No Context Router, Decisions, Knowledge ingestion, Trace/Replay, Model Bench, Scenario Lab, Pricing Registry, Security & Usage Console, Template Library, entitlements or release-channel system implemented. Existing beta/auth isolation preserved; no new telemetry warehouse claimed.

Next ownership: Antigravity consolidated premium polish and responsive cleanup, separately authorized beta synchronization, then human UI-lock review. Stop adding Dive features.

## Files changed in this audit

- growforge-ui/src/components/spatial/SpatialCanvas.tsx
- growforge-ui/src/components/spatial/dive/AgentsLens.tsx and AgentsLens.module.css
- growforge-ui/src/components/spatial/dive/DepartmentsLens.tsx
- growforge-ui/src/components/spatial/dive/DiveInspector.tsx
- growforge-ui/src/components/spatial/dive/IntelligenceLens.tsx
- growforge-ui/src/components/spatial/dive/MissionInspector.tsx and missionModel.ts
- growforge-ui/src/components/spatial/dive/ToolsLens.tsx and toolModel.ts
- growforge-ui/src/components/spatial/dive/overviewModel.ts
- growforge-ui/scripts/test-dive-agents.ts, test-dive-tools.ts, test-dive-intelligence.ts, test-dive-overview.ts, test-dive-missions.ts and test-dive-journey.ts
- PRODUCT.md, docs/ROADMAP.md, state.md and this report

Systems currently opens the existing Connections Hub overlay rather than a separate Dive lens. It hides the conversation while open and restores the selected Dive inspection when closed. Actual CORE/Explore surface changes clear Dive object scope; this overlay restoration is distinct from navigation. No standalone Systems/NORA architecture was invented in this audit.

Live UI proof: C:/Users/USERAS/.codex/visualizations/dive-consolidated-audit/tools-nora.png.
