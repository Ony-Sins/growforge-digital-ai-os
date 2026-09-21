# Working on GrowForge Digital AI OS

## Read this first, every session

1. Read `state.md` (this directory, repo root) — the single handoff doc for this project. Not `growforge-ui/STATE.md` (deprecated stub, see below).
2. Then `docs/ROADMAP.md` — the locked phased plan, source of truth for what phase the project is in.
3. Then `PRODUCT.md` and `DESIGN.md` (repo root) before any design/UI work.
4. Before assuming `state.md` is complete: `git log --oneline -20` and check whether any recent commit isn't narrated there. This project has been edited by more than one AI tool (see below) — a commit existing in git without a matching entry in `state.md` is the single most common way this project's history goes stale. If you find one, backfill it before building on top of it.

## Two tools work on this repo — keep them in their lanes

The user runs Claude Code (this session, typically via VS Code) alongside **Antigravity** (a separate agentic IDE, often driven by prompts drafted in a Gemini/AI Studio session). Both edit the same repository. This has caused real problems before: Antigravity's embedded browser hangs attaching to Turbopack's dev server, it has dropped its own session trajectory mid-task, and once went badly off-track building generic content instead of following the actual spec. The division of labor that emerged from direct experience, and that should be treated as the default:

- **Claude Code (this session): surgical, targeted fixes.** UI/component bugs, hydration mismatches, styling/brand-token enforcement, single-file or few-file changes — anything where "inspect a specific line, fix it, verify" is the shape of the work.
- **Antigravity: broader reasoning, architecture, multi-file scaffolding.** New subsystems, multi-agent orchestration work, anything genuinely exploratory or spanning many files at once.

This is a guideline for judgment, not a hard gate — if the user asks this session to do broader work, do it. But when a task is ambiguous and touches this split, default to the lane above.

**Current operating mode (started 2026-09-20, see state.md §3 for the full log):** Claude Code acts as auditor, QA, and prompt-writer — scoping each next step into a single bounded task, verifying what Antigravity reports back (spot-check real files/output, don't just trust the claim), and updating state.md — while Antigravity does the actual implementation. This continues until the remaining work is primarily UI polish, at which point Claude Code resumes direct implementation (its actual lane per the division above). If you're a fresh session reading this: check state.md's most recent entries to see whether this mode is still active before assuming the default division of labor above applies as-is.

## `state.md` is the only handoff file — keep it that way

- `growforge-ui/STATE.md` (uppercase, inside `growforge-ui/`) is **deprecated**. It used to be a second, independently-maintained handoff doc and diverged badly from the real one before being retired on 2026-09-20 (see `state.md` §3 item 33 for the full story). It now just points back here. Never write real content into it again — if you see it drifting back into use, that's a bug to flag, not a pattern to continue.
- After any session that changes code (bug fix, feature, refactor — not just a Claude Code session; if you're Antigravity, Codex, or any other tool and you're reading this, the same rule applies to you), update `state.md` with what changed and why, before ending the session. Don't rely on git history alone to reconstruct intent later — the "why" is what git log doesn't capture, and it's the part that actually prevents repeated mistakes.
- **Every `state.md` entry must state when it happened and which tool made it** — e.g. `(2026-09-20, 14:05, Claude Code)` or `(2026-09-20, Antigravity)`. Get the real timestamp from the system/shell clock, not a guess. This is what makes it possible to reconcile drift across tools later (see item 33's story) instead of discovering it after the fact.
- Brand tokens, phase status, and roadmap decisions belong in `state.md`/`docs/ROADMAP.md`/`DESIGN.md`. Don't let a second copy of any of these start growing in a tool-specific location (an IDE's own scratch file, a differently-cased duplicate, etc.).
- **Document the reasoning, not just the outcome (explicit user instruction, 2026-09-21).** A `state.md` entry that only says what got built is not enough — a fresh session reading it cold must be able to reconstruct *how the decision got made*, not just what it landed on. Every entry should cover, where applicable:
  - **The actual bug/problem found**, described concretely (what was seen, how it was confirmed — e.g. "reproduced live via incognito window," "independently re-ran the script myself," not just "found an issue").
  - **What was tried and rejected along the way, and why** — a wrong hypothesis chased before the real cause surfaced is worth keeping, not cleaning up after the fact. If an idea, design direction, or approach was proposed and the user turned it down, say what it was and the actual reason given, the same way the roadmap's rejected-ideas amendment (2026-09-21) does.
  - **How the plan/fix took shape** — if it went through iterations (a first attempt that was wrong, a correction, a rescoping), log that chain, not just the final version.
  - **The verification that actually happened**, specifically — not just "tsc/lint clean," but what was independently re-run or re-checked, and what that confirmed or contradicted about a prior claim.
  - Goal: someone (or some AI) opening this repo cold, with zero memory of this conversation, should be able to read `state.md` and know exactly what's going on and why things are the way they are — not just what the current code looks like.
