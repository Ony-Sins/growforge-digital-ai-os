# Product

> **2026-09-19 future visual direction:** Three user-provided reference screens set the future direction: an **obsidian neural command center** — immersive dark-space canvas, fine electric-blue glass boundaries, restrained spectral neuron/brain energy, compact instrument-like navigation, and an always-present assistant/memory rail. This is a future interface replacement, not a claim that the current light Command Deck already matches it. The AI Profile owns Brain, Memory, Activity, Connections, and Profile. Home answers what is running, blocked, and needs attention. The brain, counts, activity pulse, and glowing connections must be driven by real job, tool, memory, and approval state. Reference imagery establishes the emotional destination, never permission to invent activity.

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Today, confirmed:** the sole user is Arif Md. Anjum Ony ("Ony"), Founder & CEO of GrowForge Digital, an AI-powered digital marketing/web-dev/automation consultancy. He operates his own agency through this software — it is currently a single-operator tool, not yet open to other accounts.

**Confirmed direction (2026-09-17):** the product is being built toward multi-tenant from the start. Future users are other business owners/solopreneurs who sign up to run their own agency-style operations through the same system — each getting their own department pipeline, AI Brain, and memory/context, structurally similar to how Ony uses it for GrowForge Digital today. Two account shapes are the current working idea, not yet built: **Solopreneur** (one user profile, same departments/agents as today) and **Company** (a company profile that can create sub-profiles for team members, each with their own AI Brain/memory connected back to the shared company context, with pricing scaling by sub-profile count). This is a confirmed direction, not yet a built feature — see the roadmap's Phase 6 scope.

## Product Purpose

GrowForge Digital AI OS runs a simulated AI agency: a client brief goes through HQ planning, live research, up to 8 specialist departments working in parallel, cross-department review, QA, and a final plan — producing real, research-backed growth strategy and execution, not generic AI chatbot output. Its purpose is to give an operator (today: Ony; later: any signed-up business owner) the leverage of a full agency team without needing to hire one, while keeping a human in control of every consequential action.

## Positioning

The mechanism a chatbot or generic "AI marketing assistant" cannot truthfully copy: GrowForge runs an actual multi-department pipeline with named specialist roles (Revenue & Business Development, Marketing & Brand Strategy, Paid Media & Performance Advertising, Finance & Operations, Client Success & Program Management, Digital Design & User Experience, Web Development & Engineering, AI Systems & Intelligent Automation), each backed by its own real operating-instructions document, producing a cross-reviewed, QA'd deliverable — and it never claims research, verification, or a completed real-world action (e.g. an n8n workflow going live) unless that action genuinely happened, checkable against the real system it touched. Every consequential real-world action (deploying a live automation, calling an external connector) requires explicit owner approval before it executes — proposal and execution are structurally separate, not a prompt-level promise.

## Operating Context

- The live pipeline: brief → HQ plan → live research (Gemini grounding, DuckDuckGo no-key fallback) → parallel department drafts → HQ cross-department review → QA → final plan, all visible and inspectable on the Live Projects canvas as it runs.
- Real external integrations already proven live: n8n workflow automation (create/activate/execute, approval-gated), MCP connectors (Linear, Asana, Notion, HubSpot, GitHub, Apollo.io token-based; Google/Slack/Meta Ads/Microsoft/Figma OAuth-based, not yet built).
- Multi-provider LLM routing (Gemini/Groq/OpenAI/Anthropic/OpenRouter/Ollama) with automatic fallback; the operator currently runs on the free OpenRouter/Ollama tier by deliberate choice, accepting slower and occasionally less reliable model behavior as a known tradeoff, not a defect to chase.
- A separate lightweight 7-agent roster exists for quick one-off text/analysis tasks; it has no tool-execution capability (a plain LLM completion), distinct from the real department pipeline.
- A 279-file generic persona library (`.claude/vault/`) exists as a manually-browsed reference collection; it is not GrowForge's own departments and nothing in it is wired into the running app.

## Capabilities and Constraints

**Confirmed capabilities:** real multi-department AI pipeline; real live web research with graceful (if currently unreliable) fallback; real n8n automation execution behind an approval gate; real MCP tool connectors; real per-job revision/change-request flow; real owner-vs-employee role gating; real per-user learned-preference memory (writing style, brand rules, rejections) injected into future jobs.

**Confirmed constraints:** free-tier LLM reliability is an accepted, explicit tradeoff — department task-assignment and tool-calling compliance are not 100% reliable on the free tier today, and this is treated as a model-capability limit, not something to endlessly re-engineer around. Live research currently has no fully reliable no-key fallback (Gemini quota exhausts quickly; DuckDuckGo's scrape fallback is intermittently anti-bot-blocked) — a genuine open gap, not yet solved.

**Explicitly undecided:** exact multi-tenant account/billing model (solopreneur vs company sub-profile pricing) — direction confirmed, mechanics not designed.

## Brand Commitments

- Product name: **GrowForge Digital AI OS**. Parent brand it operates on behalf of today: **GrowForge Digital**, an AI-powered digital marketing/web development/automation consultancy founded by Ony.
- Visual identity in place: navy/electric-blue/gold palette, a glass-card UI language, `logo-mark.png` brand mark. Existing implementation is the current visual authority — see `DESIGN.md` when it exists (not yet generated as of this writing; run `/impeccable document` to capture it from the live code).
- Tone: the operator (Ony) has explicitly asked for professional, "classy" department naming over casual abbreviations, and for the product to read as sophisticated rather than templated/generic SaaS.

## Evidence on Hand

- `GrowForge Digital — Company Constitution.md` (repo root) — authoritative company identity, service areas, AI organization structure, escalation/approval rules.
- Eight real `*_Agent_System.md` files (repo root) — each department's actual operating instructions, read live by the running app.
- `docs/ROADMAP.md` — the locked, phased build plan; current phase and full history of what's shipped and why.
- Real completed project outputs exist in the running app's job history (e.g. "Pet Accessory Business Growth Plan," "P&E Flooring Solutions Growth Plan") as concrete evidence of actual pipeline output — do not fabricate case studies or testimonials beyond what these real runs produced.
- No external customer testimonials, press, or case studies exist yet — do not invent them.

## Product Principles

1. **Never claim something is real, live, or verified when it isn't.** This is the project's founding correction (Phase 0) and its single non-negotiable rule — a fake progress claim, a decorative status badge with no backing state, or an unreachable tool call is treated as a defect at the same severity as a crash.
2. **Propose, then execute only with explicit approval.** Every department may draft and recommend autonomously; anything that touches a real external system, spends money, or commits the organization requires the human owner's explicit sign-off first.
3. **Match the visual and structural weight of what's actually underneath.** The system is a genuine multi-department pipeline, not a chatbot skin — the UI should read that way, not as a generic AI SaaS template.
4. **Sequence capability before spectacle.** A visualization of an agent's work is only built once the underlying capability it depicts is real (see Phase 4-before-5 in the roadmap) — never animate a lie.
5. **Free-tier-first, upgrade optional.** The system must work meaningfully on free/local models by default; paid provider keys are an explicit user opt-in for speed/quality, never a requirement baked into the core experience.

## Accessibility & Inclusion

No project-specific accessibility requirement has been established yet beyond standard web practice.
