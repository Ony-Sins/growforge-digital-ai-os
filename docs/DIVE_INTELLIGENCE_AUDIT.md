# Dive Intelligence — evidence and readiness audit

Audited 2026-10-02, Codex. Layer 7 approved/frozen; Layer 8 implementation is pending visual review. This is an audit artifact, not a second handoff.

## Source boundaries

- `/api/core/state`: authenticated local authorized-team snapshot, original job/step IDs, recorded lifecycle/timestamps and service probe results. Beta/public preview return empty jobs and placeholder service entries. Intelligence excludes test-flagged jobs and placeholder probes. The incumbent test classifier is ID-based; an unflagged historical internal test remains a recorded job, not proof of real client work. Counts describe returned records, not all OS activity or independent events.
- Explicit execution inspection requests this same endpoint with a returned job ID and rejects fallback to another ID. No arbitrary job lookup or background sweep is added.
- `/api/jobs/[id]/usage`: existing authenticated/private-job read, original step IDs and stored call records. Fetched only after an indexed Usage record is selected. Preview denied; beta index is empty and beta proxy denies private paths. The local app is an authorized-team store, not a tenant-partitioned telemetry warehouse. No beta/auth or authorization change was made.
- UsageRecord stores provider, model, nullable input/output tokens, call duration and completion timestamp. No billing cost, request ID, run/attempt ID or routing rationale exists in this usage schema. Missing token reporting remains missing. Summed tokens appear only when every call reports both counts.
- `usage.ts`/Core projections calculate monetary estimates from a manually maintained static price table. Intelligence never uses those estimates: API cost is null / Not recorded, including local-model calls. No total economic cost claim.
- Core approval count is a queue snapshot, not job attribution, permission to act or manual pause. Error lifecycle and per-step error presence are recorded; no invented success-rate score. Full error/output content remains in Missions.
- `telemetryStore.ts` is process-memory state with at most 30 events; retention, completeness, tenant partitioning and stable causal correlations are insufficient for durable tracing. Registry counts do not prove connected/reachable services.
- `/api/spatial/dive` lacks a direct enforced session check and supplies presentation topology/packets. It is not used by Intelligence. Existing security behavior is not modified in this UI task.
- `llm.ts` computes fallbackOccurred/fallbackFrom but searches found no downstream persistence of those fields. Current routing preference is configuration, not a recorded decision receipt. No routing evidence view is fabricated.
- `instructionSnapshots.ts` preserves immutable instruction bundles/hashes, execution-attempt metadata and provider/model result receipts. Existing original/current rerun modes reproduce captured system instruction configuration only: not identical output, historical provider availability, retrieved facts or tool state. This is a useful foundation, not complete Replay.

## Evidence semantics

MEASURED: persisted runtime status/timestamps, provider/model and provider-reported token counts, client-measured call duration, actual probe result/latency.
DERIVED: stored-call count, complete token sum, completed-stage timestamp difference and pending queue count. Formulas are inspectable. Stage elapsed time is not summed call duration. Unknown cost and missing data are availability states, never measurements of zero.
ASSUMED: reserved for explicit user/simulation inputs. No assumed inputs or simulations are introduced.

Selection IDs are namespaced projections over authoritative job IDs (`execution:<job.id>`, `usage:<job.id>`) and service IDs (`probe:<id>`). Queue ID is explicitly a snapshot projection. Completion/event timestamps are preserved; no synthesized event chronology. Call ordinals are presentation only and are not invented runtime identities.

## Missing architecture and readiness

| Capability | Existing foundation | Required before truthful implementation |
|---|---|---|
| Trace | Job/step IDs, usage completion timestamps; instruction execution IDs/receipts; small volatile event buffer | Durable workspace-scoped append-only event/span store, parent/correlation IDs, attempt/tool/approval links, event sequencing, retention/completeness contracts and protected paginated read projection |
| Execution Replay | Stored stages/outputs and immutable instruction versions; explicit original/current rerun policy | Complete ordered event/input/output/dependency/approval capture, external tool/retrieval versions, attempt correlation, safe read-only replay timeline. A rerun is not deterministic replay |
| Scenario Lab | Existing real execution records | Explicit assumed-input scenario schema, isolated simulation engine/results, versioned model/price assumptions, provenance and baseline comparison; no live action side effects |
| Model Bench | Historical usage by actual model/provider | Versioned benchmark datasets/rubrics, comparable workload cohorts, evaluator and quality evidence, run/attempt/request IDs, controlled conditions and cost receipts; historical use alone cannot rank models |
| Context Integrity / OS Audit | Instruction hashes/bundles, selected current source records | Per-request resolved context manifest with source versions, tenant ownership, inclusion/exclusion reasons, token allocation, provenance/consent and integrity verification. No Context Health score supported |
| Recorded API cost | Token and model receipts, legacy static estimates | Provider billing receipt ingestion, currency/unit/period, per-call identifiers and reconciliation; versioned pricing registry must separately label estimates. Economic cost requires separate labor/infrastructure accounting |
| Routing/tool receipts | Provider returned; some instruction result receipts and volatile tool events | Durable selection rationale/eligible candidates/policy version/fallback errors, request/attempt IDs and redacted tool result/status receipts joined to job/step/approval |

## Deliberately omitted

No Trace/Replay controls, Scenario Lab, Model Bench, normalized Context Audit, rankings, pricing estimates, synthetic health/efficiency, autonomous learning/action engine, telemetry persistence, secret/config viewers or execution actions. NORA receives only bounded selected evidence and clears on inspection dismissal or lens/surface unmount. Hide/restore and Focus remain presentation state.
