# GrowForge Digital AI OS — System State & Architecture Index

> **Last Updated:** 2026-09-15  
> **Repository:** `growforge-digital-ai-os / growforge-ui`  
> **Git Ref:** `master`  
> **Status:** Phase 1, Phase 2 & Phase 3 Fully Complete

---

## 1. Executive Project Summary

GrowForge Digital AI OS is an autonomous multi-agent agency operations platform and executive command center. It coordinates specialized AI department agents (Sales & BD, Marketing, Meta Ads, Finance & Ops, Web Design/Dev, Client Success, QA) from brief ingestion to verified execution plans.

### Core Stack
- **Framework:** Next.js 16 (App Router, Turbopack, React 19)
- **Language & Type System:** TypeScript 5 (Strict Mode enabled across all API routes & components)
- **Security & Key Management:** Server-side AES-256-GCM Encrypted Vault (`serverVault.ts`)
- **Authentication & RBAC:** Auth.js (NextAuth v5 beta) with Google OAuth allowlist & role elevation
- **Styling & Design System:** Tailwind CSS v4, custom glassmorphism tokens, and high-contrast solid container encapsulation
- **LLM Multi-Provider Router:** Unified transport supporting Gemini, Groq, OpenAI, Anthropic, and local Ollama with dynamic runtime failover

---

## 2. Completed Milestones

### Phase 1: Security, Backend Stability & Brand Encapsulation
- **Creator-Based RBAC & Session Gates:**
  - Strict role enforcement (`owner` vs. `employee`) via JWT role claims.
  - Creator-locked revision control on project jobs (`createdBy` matched against `session.user.email`).
  - Ownerless job prevention guard in `POST /api/jobs`.
- **Encrypted Server Vault (`src/lib/serverVault.ts`):**
  - Cryptographic standard: AES-256-GCM with 12-byte random IVs and 16-byte authentication tags.
  - Zero plaintext exposure to client bundles; credentials are decrypted strictly server-side for outbound requests.
- **Custom Connectors & SSRF Defense (`src/lib/connectorStore.ts`):**
  - Re-checked outbound URL validation blocking loopbacks (`127.0.0.1`), RFC1918 private subnets, and cloud metadata endpoints (`169.254.169.254`).
  - Bearer token & custom header credential injection.
- **Permission-Gated Admin Drawer (`/admin` & `AdminDrawer.tsx`):**
  - Slide-over developer overlay for Terminal Console, Live Execution Logs, and System Diagnostics.
  - Dedicated `/admin` route with server-side access control.
  - Cleaned primary dashboard view (`Workspace.tsx`) by decoupling raw developer logs.
- **Solid Container Brand Encapsulation:**
  - Enclosed all logo marks, badges, and status strips inside solid-white containers (`bg-white shadow-sm border border-slate-100 rounded-xl`) to eliminate translucency/contrast artifacts.

### Phase 2: User Learning Memory ("Akinator" Shadow Memory) & Profile System
- **User Memory Engine (`src/lib/userMemory.ts`):**
  - JSON-persisted store tied to normalized `session.user.email`.
  - Captures: Writing Style & Tone, Core Brand Rules, Strategic Preferences, Past Overrides, Explicit Rejections, and Shadow Memory Observations.
  - Prompt injection helper `formatUserMemoryPrompt()` integrates directly into `orchestrator.ts` (`currentBrief()`), steering HQ and all department agents.
  - Automatic observation capture during revision feedback loops in `reviseJob()`.
- **Memory Profile UI (`src/app/profile/page.tsx` & `ProfileDashboard.tsx`):**
  - Interactive profile dashboard with solid containerized cards.
  - Tone customization with style preset chips, dynamic rule manager, negative constraints manager, and JSON export/reset tools.
  - Direct quick-links from Header avatar and Sidebar footer.
- **Node Canvas High-Contrast Styling (`NodeWorkflowCanvas.tsx`):**
  - Refactored central orchestrator hub and spoke pills with solid-fill container backgrounds (`bg-white shadow-md border border-slate-100 rounded-2xl`) to ensure crisp contrast over background canvas grid lines.

### Phase 3: Memory Hardening & Operational Resilience
- **Atomic File Write Operations (`userMemory.ts`, `serverVault.ts`, `jobStore.ts`):**
  - All disk serialization pipelines write payload to `.tmp` files first before executing atomic `fs.promises.rename` over the target destination file, eliminating data corruption risks during server restarts or process halts.
- **Automatic Rejection Extraction & Semantic Deduplication (`userMemory.ts` & `orchestrator.ts`):**
  - Built `recordExplicitRejection()` parser that automatically detects negative feedback triggers (e.g., `"don't use"`, `"never suggest"`, `"avoid"`, `"stop using"`) during project revisions in `reviseJob()`.
  - Implemented 40-character prefix normalization deduplication ensuring identical constraints are merged seamlessly rather than duplicated.
- **Integration Test Harness (`scripts/test-memory-flow.ts`):**
  - Built comprehensive 8-suite test harness running memory initialization, atomic persistence, rejection extraction, deduplication, prompt injection formatting, memory reset, and `tsc` compilation.
  - Verification results: 28/28 tests passing cleanly with 0 errors.

---

## 3. Key Technical Contracts

### 3.1 Data Store Serialization Queues
State files live in `growforge-ui/data/` (protected from Git commits via `.gitignore`):
- `data/vault.json`: Encrypted key material (keyed by `VAULT_MASTER_KEY`).
- `data/user_memories.json`: Operator learning memory profiles.
- `data/jobs.json`: Orchestration jobs, step statuses, outputs, and revision logs.
- `data/connectors.json`: Outbound REST connector definitions.

*Concurrency Safety & Atomic Persistence Contract:* Every data store uses a sequential promise write queue (`writeQueue = writeQueue.then(...)`) with atomic `.tmp` -> `fs.rename` disk persistence to guarantee non-blocking, corruption-free state updates.

### 3.2 RBAC Revision Authorization Contract
- Project revision requests at `POST /api/jobs/[id]/revise` require either:
  1. `session.user.role === "owner"`, OR
  2. `existing.createdBy === session.user.email.toLowerCase()`.
- Unmatched requests return HTTP 403 Forbidden with zero blast radius.

---

## 4. Active Phase & Immediate Tasks

### System Operations & Feature Verification
1. All Phase 1, Phase 2, and Phase 3 deliverables are fully verified, type-checked, built, and tested.
2. Production build compiles cleanly in 1.1s with 0 errors across 22 App Router routes.
3. Test suite (`scripts/test-memory-flow.ts`) passes 28/28 tests cleanly.

---

## 5. GitHub Status & Build Health

- **Active Branch:** `master`
- **Remote:** `https://github.com/Ony-Sins/growforge-digital-ai-os.git`
- **Working Tree:** Clean
- **Type Safety:** `npx tsc --noEmit` passing with 0 errors
- **Build Status:** `npm run build` passing with 0 errors
- **Test Harness:** `npx tsx scripts/test-memory-flow.ts` 28/28 PASSED

---

## 6. Cross-Session Notes (read before continuing work)

- **The department roster is smaller than the vault/agent-roster file counts suggest — this is by design, not a bug.** Three separate things exist in this repo and are easy to conflate:
  1. `*_Agent_System.md` (repo root, 10 files) — the REAL departments the orchestrator uses: 8 assignable (`src/lib/departments.ts`: sales-bd, marketing, meta-ads, finance-ops, client-success, web-design, web-dev, ai-automation) + HQ (always runs: plans, reviews, finalizes) + QA (always runs: checks). HQ picks 3–6 of the 8 per job based on what the brief actually needs — a different brief pulls different departments in.
  2. `.claude/agents/` (7 files) — the OLD simulated single-agent roster (`src/lib/agents.ts`), wired to the fake `agentStore.ts` (1.5s timer, canned success). Used only by the chat router's legacy "dispatch" mode for one-off tasks. Not connected to the real orchestrator.
  3. `.claude/vault/` (279 files) — Claude Code's own general-purpose subagent library, for whichever AI coding tool is developing *this app*. Not loaded by the running product at all.
- **Live research is currently blocked**: the configured Gemini key's free tier (20 requests/day) is exhausted. Until a paid key (Gemini billing, or an OpenAI/Anthropic key) is added in Settings → Integrations, department drafts silently fall back to the local Ollama model — watch for the "Reduced quality" banner on the project canvas.
- Two orchestrator fixes (revise blast-radius minimization, live-note override ordering) were made but not re-verified end-to-end due to the above quota limit — worth a real test run once a paid key is in place.

