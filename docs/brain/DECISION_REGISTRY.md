# GrowForge Digital — Architectural Decision Registry (ADR)

> **Auto-Generated:** 2026-09-15T21:52:41.840Z  

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

### ADR 007: Swarm State Persistence, Pollution Guard & Loop Interception
- **Status:** Accepted & Implemented (Phase 5)
- **Context:** Autonomous peer-to-peer swarms can enter infinite handoff loops or pollute shared state during multi-agent delegation.
- **Decision:** Enforce strict `maxDepth = 5` recursion limits with automatic state pausing/saving to `data/swarm_states/{directiveId}.json`, sanitize key/value diff payloads with `applyStateDiff()`, and support seamless state resume upon operator override.

### Decision: Prioritize n8n Self-Hosted Webhooks for Agency Pipeline
- **Recorded:** 2026-09-15T22:45:44.762Z
- **Department/Context:** AI Systems / Automation · Job job-test-agency-mu39g2b8
- **Agreed Resolution & Direction:**
  Deploy n8n self-hosted instance on port 5678 to handle high-throughput client onboarding without third-party cloud execution caps.

### Decision: Kimi-Style Swarm Architecture Activated for Agency Directives
- **Recorded:** 2026-09-15T22:54:26.080Z
- **Department/Context:** Swarm Orchestrator · Swarm Directive swarm-mu39r8k9-ooc0
- **Agreed Resolution & Direction:**
  Decentralized peer-to-peer delegation between Planning, Lead Gen, Webmaster, and Automation sub-agents with 5-step loop guardrail.

### Decision: Prioritize n8n Self-Hosted Webhooks for Agency Pipeline
- **Recorded:** 2026-09-15T22:54:35.786Z
- **Department/Context:** AI Systems / Automation · Job job-test-agency-mu39rg1w
- **Agreed Resolution & Direction:**
  Deploy n8n self-hosted instance on port 5678 to handle high-throughput client onboarding without third-party cloud execution caps.

### Decision: Safe Handoff Chain Certified: Supervisor -> Lead Gen -> Copywriter -> QA
- **Recorded:** 2026-09-15T23:15:58.114Z
- **Department/Context:** Swarm Orchestrator · Directive swarm-mu3aixi3-8zvr
- **Agreed Resolution & Direction:**
  Multi-agent peer delegation verified end-to-end with state isolation and zero pollution.

### Decision: Safe Handoff Chain Certified: Supervisor -> Lead Gen -> Copywriter -> QA
- **Recorded:** 2026-09-15T23:16:19.372Z
- **Department/Context:** Swarm Orchestrator · Directive swarm-mu3ajdwl-yy09
- **Agreed Resolution & Direction:**
  Multi-agent peer delegation verified end-to-end with state isolation and zero pollution.

### Decision: Kimi-Style Swarm Architecture Activated for Agency Directives
- **Recorded:** 2026-09-15T23:16:28.824Z
- **Department/Context:** Swarm Orchestrator · Swarm Directive swarm-mu3ajl74-e2zv
- **Agreed Resolution & Direction:**
  Decentralized peer-to-peer delegation between Planning, Lead Gen, Webmaster, and Automation sub-agents with 5-step loop guardrail.

### Decision: Swarm Completed: Cyclic Ping-Pong Loop Stress Test
- **Recorded:** 2026-09-15T23:46:34.972Z
- **Department/Context:** Agent Swarm Dispatcher · Directive swarm-mu3bmatk-iktz · 5 peer handoffs
- **Agreed Resolution & Direction:**
  QA completed final check with operator approved extra steps

### Decision: Safe Handoff Chain Certified: Supervisor -> Lead Gen -> Copywriter -> QA
- **Recorded:** 2026-09-15T23:46:44.828Z
- **Department/Context:** Swarm Orchestrator · Directive swarm-mu3bmifp-7njw
- **Agreed Resolution & Direction:**
  Multi-agent peer delegation verified end-to-end with state isolation and zero pollution.

### Decision: Kimi-Style Swarm Architecture Activated for Agency Directives
- **Recorded:** 2026-09-15T23:46:48.794Z
- **Department/Context:** Swarm Orchestrator · Swarm Directive swarm-mu3bmlhv-6dm6
- **Agreed Resolution & Direction:**
  Decentralized peer-to-peer delegation between Planning, Lead Gen, Webmaster, and Automation sub-agents with 5-step loop guardrail.

### Decision: Prioritize n8n Self-Hosted Webhooks for Agency Pipeline
- **Recorded:** 2026-09-15T23:46:52.782Z
- **Department/Context:** AI Systems / Automation · Job job-test-agency-mu3bmoko
- **Agreed Resolution & Direction:**
  Deploy n8n self-hosted instance on port 5678 to handle high-throughput client onboarding without third-party cloud execution caps.

### Decision: Swarm Completed: Cyclic Ping-Pong Loop Stress Test
- **Recorded:** 2026-09-15T23:51:02.749Z
- **Department/Context:** Agent Swarm Dispatcher · Directive swarm-mu3bs1fr-bf1s · 5 peer handoffs
- **Agreed Resolution & Direction:**
  QA completed final check with operator approved extra steps

### Decision: Safe Handoff Chain Certified: Supervisor -> Lead Gen -> Copywriter -> QA
- **Recorded:** 2026-09-15T23:51:09.919Z
- **Department/Context:** Swarm Orchestrator · Directive swarm-mu3bs6zc-5w5k
- **Agreed Resolution & Direction:**
  Multi-agent peer delegation verified end-to-end with state isolation and zero pollution.
