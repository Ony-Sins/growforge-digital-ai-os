# GrowForge Digital AI OS — Handoff State (slim/current)

> **Last updated:** 2026-09-21, 22:09, Claude Code. Split this file into a slim current-state doc + `state-archive.md` (full pre-split history, zero data loss) to cut the token cost of a fresh session's mandatory first read. Read **"Read this first in a new chat"** below, then jump straight to **§A: Session Handoff**.
> **Repo:** `growforge-digital-ai-os` — app lives in `growforge-ui/`
> **Branch:** `master`
> **Read this file first in a new chat**, then `docs/ROADMAP.md` for the locked phased plan, then `PRODUCT.md`/`DESIGN.md` before any design/UI work. **Full history before 2026-09-21 22:09 — the entire public-preview security saga, the Phase 0-3 UI/UX buildout, every earlier redesign attempt — lives in `state-archive.md`, not here.** Don't read the archive by default; only reach for it if you need the specific reasoning behind an old, settled decision that isn't summarized below.
>
> **Standing rule for every tool that edits this repo (Claude Code, Antigravity, Codex, or anything else):** after any successful task, add an entry to **this file** (not `state-archive.md`, not `growforge-ui/STATE.md` — deprecated, see archive item 33) stating what changed, why, the real system-clock timestamp, and which tool did it. Also apply the **expanded documentation standard** in `CLAUDE.md`: capture the reasoning chain (what was tried/rejected and why, not just the final diff), not just the outcome.
>
> **Token-cost discipline going forward, per explicit user instruction (2026-09-21):** keep this file lean. When it grows past a few recent sessions' worth of detail, move the oldest/most-settled entries into `state-archive.md` (append, dated) and leave a one-line pointer here, the same way this split was done. Don't let it silently balloon back to 184KB.

---

## A. Session Handoff (2026-09-21, 21:54, Claude Code) — READ THIS FIRST

This session ran a long, fast back-and-forth between the user, Claude Code (auditor/verifier), and Antigravity (implementer) — the operating mode declared in `CLAUDE.md` is still active: Claude Code scopes each next step, verifies Antigravity's actual output (reads the diff, re-runs scripts, curls production directly — never just trusts the report), and updates this file; Antigravity implements.

### What's genuinely done and verified this session (not just claimed)

- **Full public-preview data-isolation sweep** — closed, re-confirmed via live `curl` against production with no session cookie, multiple times. Every route touching MCP servers, vault/capability keys, telemetry, jobs/approvals/consultations, and profile data returns empty/blocked for an anonymous visitor. Don't re-litigate this class of bug from scratch if it comes up again — check the *specific new route* first (this is exactly how the `mcp/connect` and `mcp/connect`'s `emptyByoMcpResponse()` regressions were found — new code kept reintroducing the same class of leak in routes the original sweep hadn't touched yet).
- **AI Brain fabricated-node bug** — the four hardcoded fake nodes (`mcp:hubspot`, `mcp:notion`, `tool:open-meteo`, `tool:world-bank`) are gone. Department nodes now only render while a job is actively processing. Capability-key nodes (Higgsfield, configured AI models) are real, pulled from `resolveImageKeys()`/`listAiModels()`. **Independently verified live against production**, not just code-read.
- **Node-deletion confirmation + credential-retention flow** — shared `NodeDeleteConfirmModal.tsx` across MCP servers, BYO-MCP, and capability keys. "Keep on file" genuinely archives (an archived Higgsfield key actually stops resolving for real image generation, not just cosmetically hidden) vs. "Remove completely" (real destroy). Verified by reading every touched file's diff.
- **Laya (`@receptron/laya`) vault-dispatch** — real, free, local, TypeScript-native "System One" decision model (ONNX Runtime). Proof-of-concept then rescoped from "pick one winner across the whole job" to "pick a specialist within each department HQ already assigned" (the first framing was structurally wrong — real GrowForge jobs run 5-6 departments in parallel, a single global winner never made sense). **Independently re-run by Claude Code both times**, not trusted from the report. Currently wired as **log-only observability** inside `orchestrator.ts` — does NOT affect real job dispatch. Step 2 (wiring picks into real execution) is a deliberate decision still not made.
- **Emoji + em-dash UI-copy cleanup** — 10/10 emoji removed, 40/107 em-dashes rewritten (the rest judged legitimate punctuation, not left unfinished).
- **Per-operator branding, empty-by-default** — the dashboard no longer shows the owner's real name/company/logo to a stranger or an unconfigured account. Greeting fallback fixed (was hardcoding the owner's literal name "Ony" for any blank profile), new `/api/profile/logo` upload route (preview-gated, magic-byte validated, same pattern as avatar/cover), `Sidebar.tsx`/`Header.tsx` now show real `identity.logoUrl`/`companyName` with a neutral "set up your brand" placeholder when unset.

### What's logged as done but is actually NOT fixed

**The AI Brain's procedural silhouette does not visually read as a brain.** `brainGeometry.ts`'s anatomical math is real and correct (dual-ellipsoid hemispheres, longitudinal fissure, temporal lobes, cerebellum, brainstem, gyri/sulci folding, per-user seeding — verified by reading it). The problem is purely rendering density: **3,400 points is too sparse for the shape's actual surface area at the current camera distance** (~1 point per 12 sq. units of surface, points 3.5 units apart rendering at only 2.3 units wide — reads as a perforated, diffuse cloud, not a solid silhouette). Confirmed by the user's own live screenshot. A follow-up prompt specifically asking for density/camera tuning was sent — **it was not applied**: point count (3,400) and camera position (`z=260`) are byte-for-byte unchanged from the rejected version. **Do not mark this done from any future state.md text alone — look at it live, or re-verify the actual `pointCount`/camera values in code before trusting a claim that this is resolved.**

### Ready next step — paste this to Antigravity as-is

```
Task: Fix brain-shell density so the silhouette actually reads — targeted tuning, not a redesign

The generator in brainGeometry.ts and its consumption in NeuralBrainCanvas.tsx are
structurally correct (verified by reading both) — this is a density/framing problem,
not a logic bug. A prior attempt at this exact task did not change anything (point
count and camera position were left byte-for-byte identical) — actually change the
values this time, don't just re-report the existing state.

Do NOT touch the anatomical generation math in brainGeometry.ts (hemisphere shape,
fissure, temporal/cerebellum/stem placement) — it's correct, this is purely a
rendering-density problem.

1. Increase point count significantly — try 10,000-15,000 total (currently 3,400 in
   NeuralBrainCanvas.tsx's call to generateProceduralBrainShell). Confirm frame rate
   stays acceptable.
2. Increase point size (shellMat.size, currently 2.3) proportionally, or reduce camera
   distance (camera.position.set(0, 5, 260) — try closer) so points cover the gaps
   between neighbors. Keep the full shape in frame after any change.
3. If density/size tuning alone doesn't get there, add a thin, low-opacity solid or
   wireframe shell underneath the points (a translucent dual-ellipsoid skin) to
   guarantee the silhouette reads regardless of point density.
4. Re-check FogExp2 density (0.0022) isn't washing out the far hemisphere at the
   tuned camera distance.

tsc/lint clean. Real-timestamped state.md entry — and this time, if you changed the
point count or camera values, say what they actually changed FROM and TO, not just
that it was "tuned."
```

**After that's reported back, verify it live** — this is a visual/perceptual acceptance criterion; code-reading alone only caught the previous failure because the numbers were literally identical. It won't catch a change that's technically different but still visually insufficient. Ask the user for a fresh screenshot before accepting.

### Rest of the backlog, priority order after the brain-density fix

1. **Daily context-node memory system** — the user's spec: every 24 hours a new "context node," permanently connected to the core, queryable indefinitely (even "100 years later"), honest "nothing found" fallback when nothing relevant exists. Explicitly deferred — needs its own dedicated design session (data model, retrieval strategy) before any code, the same rigor Phase 4 item 4 got in `docs/ROADMAP.md`. Do not let Antigravity start building this from a one-line prompt.
2. **Laya Step 2** — decide whether to wire real per-department picks into actual agent execution. Real dispatch-affecting decision, not a quick fix.
3. **Pipeline visual replacement** (`ProjectCanvas.tsx`'s node-and-line look) — user explicitly rejected the n8n/Zapier boxes-and-arrows aesthetic; three directions were proposed (mission-control timeline, orbital/particle, progress-capillary stack), orbital/particle was the preferred one. Not yet scoped into a build task.
4. **Profile page** — rejected multiple times as too LinkedIn-shaped/generic-CRUD-form. Needs an "AI briefing/debrief screen" reframe (what the AI understands about the business), not another guess at a social-profile-style redesign. User does not want to look at it right now — don't revisit unprompted.
5. Vault routing step 3 execution-wiring, the real campaign-creative pipeline (research → multi-asset generation → approval/regenerate loop, per the Higgsfield integration ask), Gemini's image-gen 404 (`imagen-3.0-generate-002` invalid for the API version called) — all open, unscoped, lower priority than the above.
6. NVIDIA NemoClaw — deferred pending the user's own WSL2/Docker setup, not a code task.

### Working tree / push state as of this entry

Everything through the branding fix (commit `b1321f3`) is pushed to `origin/master`. This file-split commit will be the next one — push it too before starting the density-fix prompt above, so nothing crosses a session boundary unpushed.

---

## B. What this project is

A Next.js 16 (Turbopack, App Router) multi-department AI agency automation platform. Real pipeline: `brief → HQ plan → live research → departments (parallel) → HQ cross-department review → QA → final plan`, in `src/lib/orchestrator.ts`. 8 real departments (`src/lib/departments.ts`), each backed by a real `*_Agent_System.md` file at the repo root, plus HQ and QA. Multi-provider LLM routing (`src/lib/llm.ts`, `src/lib/model-router.ts`) across Gemini/Groq/OpenAI/Anthropic/OpenRouter/Ollama. A separate 7-agent single-dispatch roster (`src/lib/agents.ts`) exists for quick one-off text tasks — zero tool access, deliberately lightweight (see archive §2 decisions). A 207-entry vault agent catalog (`src/data/vaultCapabilities.json`, pruned from 279 — see archive item 50) is reference-only, with Laya-based per-department retrieval now logged-but-not-yet-live (see §A above).

## C. Where the project is (see `docs/ROADMAP.md` for full phase detail)

- **Phase 0 (Trust & Correctness) — DONE.**
- **Phase 1 (Core Capability Growth) — closed-enough.** n8n tool proven correct end-to-end; reliable *unprompted* department tool-calling on free-tier models isn't there yet, accepted per explicit user direction.
- **Phase 2 (Agent & Task Coverage Review) — DONE.**
- **Phase 3 (UI/UX Foundation) — DONE.**
- **Phase 3.5/3.6 (UX Hardening, Stabilization) — DONE**, several rounds, see archive for full detail.
- **Phase 4 (Real Capability Expansion) — in progress.** BYO capability keys done (image-gen). Vault retrieval-narrowing (item 4) has a working Laya proof-of-concept, not yet wired to real dispatch. Meta Ads MCP, master findings doc (done — `MasterFindingsView.tsx`), trigger.dev — not started.
- **Phase 5 (AI Brain 3D Experience) — in progress.** Real nodes, deletion flow, and per-operator branding done this session; procedural brain silhouette built but not yet visually acceptable (see §A). Voice for the AI Assistant persona, per-user brain layout variation — not started.
- **Phase 6 (Self-Healing / Self-Learning) — not started.** Now also covers the daily context-node memory system spec from this session (§A item 1) and the peer-to-peer shared-agent-memory vision.

## D. Known, accepted issues carried forward

- **Live research is currently non-functional**: Gemini quota exhausted (free tier) + DuckDuckGo fallback anti-bot-blocked. Not fixed by the LLM strategy dropdown. Genuinely blocked until one clears or a different fallback is built.
- **n8n tool-calling reliability from a real LLM-driven job** is unresolved and explicitly deprioritized (Phase 1). Tool itself is proven correct; model isn't reliably choosing to call it yet.
- `ExecutiveFunnel.tsx`'s cataloged-agents count now reads `vaultDataRaw.length` live (fixed this session, was previously hardcoded).
- **Impeccable's hooks run automatically** on every UI Edit/Write and at end of turn — expect `PostToolUse` hook messages with design findings; triage each per its own instructions.
- **Turbopack dev-server crash pattern**: repeated live-edit sessions can trigger `FATAL: ... Cell CellId ... no longer exists`. Self-recovers via pm2, but can leave a stale bundle mid-crash. Fix: `pm2 stop growforge-ui`, `rm -rf .next`, `pm2 restart growforge-ui`.
- Any hidden file input triggered via `ref.click()` must use `sr-only`, never `hidden`/`display:none` — see memory `feedback_hidden_file_input_click.md`.

## E. Full history

Everything before this split (2026-09-21, 22:09) — the entire public-preview security saga (item-by-item), the full Phase 0-3 UI/UX buildout narrative, every earlier profile-redesign attempt and why each was rejected, the Vercel deployment diagnosis, the connector-icon/branding work, and more — is preserved verbatim in **`state-archive.md`** at the repo root. Nothing was deleted; this split only changes what a fresh session loads by default.
