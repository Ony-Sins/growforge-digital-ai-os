# GrowForge Digital — Architectural Decision Registry (ADR)

> **Auto-Generated:** 2026-09-15T20:02:34.206Z  

## ADR Index

### ADR 001: Atomic File Store Persistence
- **Status:** Accepted & Implemented (Phase 3)
- **Context:** JSON store writes during unexpected process restarts could corrupt data files.
- **Decision:** Use sequential promise write queues with `.tmp` file writing followed by atomic `fs.promises.rename`.

### ADR 002: Single-Format JSON Decision Tool Calling
- **Status:** Accepted & Implemented (Phase 4)
- **Context:** Multiple cloud & local providers (OpenAI, Anthropic, Gemini, Groq, Ollama) have conflicting native function calling schemas.
- **Decision:** Enforce a unified single-JSON-turn decision protocol with balanced brace depth extraction.

### ADR 003: Department Instruction Versioning (`rules v.<hash>`)
- **Status:** Accepted & Implemented (Phase 4)
- **Context:** Knowing exactly which constitution and department rules produced an execution plan.
- **Decision:** Compute SHA-256 hashes of the exact prompt text and store with every `JobStep`.

### ADR 004: Asynchronous Consultation & Interrupt Layer
- **Status:** Accepted & Implemented (Phase 4)
- **Context:** Sub-agents needing clarification shouldn't crash, guess, or lock the chat UI.
- **Decision:** File-backed consultation store with floating non-blocking UI banner and quick-select option pills.

### ADR 005: n8n Autonomous Tooling with Self-Healing Feedback
- **Status:** Accepted & Implemented (Phase 4)
- **Context:** Autonomous workflow creation frequently hits parameter and schema mismatches.
- **Decision:** Feed exact n8n node error traces back into the sub-agent tool loop for self-directed patching.

### ADR 006: Strategic Challenger & Red-Team Advisory
- **Status:** Accepted & Implemented (Phase 4)
- **Context:** Agency AI should not blindly execute low-ROI or risky client suggestions.
- **Decision:** Enforce strategic pushback in Orchestrator and department prompts, mandating counter-proposals with benchmark evidence.

### Decision: HQ Assigned 6 Departments for "P&E Flooring Solutions AI-Driven Launch"
- **Recorded:** 2026-09-15T20:11:21.687Z
- **Department/Context:** GrowForge HQ · Job job-mu33x8a1-yptz
- **Agreed Resolution & Direction:**
  - **Sales & BD**: Mapping local lead sources
  - **Marketing**: Competitor landscape analysis
  - **Finance & Ops**: Pricing structure design
  - **Web Design / UX**: UI/UX design
  - **Web Development**: Web build
  - **Meta Ads**: Ad strategy setup

### Decision: HQ Reconciled Team Direction for Job job-mu33x8a1-yptz
- **Recorded:** 2026-09-15T20:13:41.950Z
- **Department/Context:** GrowForge HQ · Cross-Department Review
- **Agreed Resolution & Direction:**
  ### Conflicts
  For each place two departments disagree (budgets, pricing, timelines, channel priority, targeting): "**Dept A ↔ Dept B:** what each proposed → **Decision:** the resolution and why."
  
  1. **Web Development ↔ Marketing:**
     - **Web Development:** Proposed a budget of $10,000 for initial Meta Ads.
     - **Marketing:** Suggested a higher initial budget of $20,000 to ensure more aggressive ad spend and higher visibility.
     - **Decision:** The agreed budget for initial Meta Ads is $15,000. This balance provides a robust initial spend while keeping costs within a reasonable range.
     
  2. **Web Development ↔ Sales & Business Development:**
     - **Web Development:** Proposed a fully functional and optimized website with clear CTAs and user-friendly navigation.
     - **Sales & Business 

### Decision: QA Audit Verdict: Pass with fixes for Job job-mu33x8a1-yptz
- **Recorded:** 2026-09-15T20:14:09.444Z
- **Department/Context:** Quality Assurance · Quality Assurance
- **Agreed Resolution & Direction:**
  ### Meta Ads — Ad Strategy Setup
  
  ---
  
  ## Summary
  
  Given the constraints and operator preferences, our ad strategy will focus on establishing a robust, high-velocity campaign structure for GrowForge Digital, leveraging targeted Meta Ads to capture mid-market businesses in key markets. We will prioritize Atlanta, New York, and San Francisco, with a phased execution sprint over 90 days to ensure rapid deployment and optimization. Our approach will be data-driven, with specific financial estimates and clear timelines to align with the agency's launch objectives.
  
  ## Recommendations
  
  ### Immediate Ad Strategy Phases
  
  1. **Phase 1: Market Research & Initial Campaign Setup (Weeks 1-2)**
     - Conduct a secondary market research to gather insights on the current demand for AI automation solutions 
