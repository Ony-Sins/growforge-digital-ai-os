# GrowForge MCP Gateway

GrowForge acts as an MCP **client** (NORA uses external MCP services — `growforge-ui/src/lib/mcp/`) and, with this gateway, as an MCP **server** so compatible local agents (Claude Code, Codex) can query the running AI OS.

**Status: Phase 1 — LOCAL · READ-ONLY · OWNER DEVELOPMENT ONLY.** Remote/customer MCP is *not* built.

## Architecture

```
MCP client (Claude Code / Codex)
   │  stdio (child process, no network port)
   ▼
growforge-ui/scripts/growforge-mcp-stdio.mts      ← transport adapter + startup guard
   │
growforge-ui/src/lib/mcp-server/
   ├─ server.ts    tool registry + resources + createGrowForgeReadOnlyMcpServer(actor)   ← transport-independent
   ├─ services.ts  thin read adapters over EXISTING GrowForge stores (no second state model)
   └─ safety.ts    startup guard · actor model · redaction · error sanitising · size bounds
   │
existing canonical readers: coreState, jobStore, aiModelStore, mcp/store, connectorStore,
                            agentStore, approvalStore, usage, spatial/obsidianReader
```

`createGrowForgeReadOnlyMcpServer(actor)` has no transport dependency; a future Streamable HTTP adapter reuses the same registry.

### Existing MCP infrastructure (left untouched)

| Piece | Role | Notes |
|---|---|---|
| `src/lib/mcp/{client,store,catalog,pluginRegistry}.ts` | MCP **client** — NORA consumes external servers | unchanged |
| `src/lib/mcp/growforgeMcpServer.ts` | In-app server exposing the **executable** native tool catalog to Gemini via `dispatchSafeTool` | different role (execution); unchanged |
| `/mcp-server.js` (repo root) | Legacy stdio server → HTTP `/api/agents`; includes **`run_agent`** (execution) | unchanged; flagged for Phase 2 consolidation |

The new gateway is a separate module so nothing execution-capable shares its surface.

## Phase 1 boundaries

Allowed: bounded reads of authoritative GrowForge state. Forbidden and not implemented: secrets/vault/env, arbitrary file or SQL access, shell/code execution, any write/update/delete, mission create/cancel, workflow execution, deploy, messaging, paid actions, memory mutation, remote transport, OAuth.

## Tool registry (all `readOnlyHint: true`, `destructiveHint: false`)

| Tool | Canonical source | Notes |
|---|---|---|
| `growforge_get_overview` | `coreState.buildCoreState` + `jobStore` | mission counts by state, live probes, queue sizes |
| `growforge_list_missions` | `jobStore.listJobSummaries` | paginated (`limit` ≤ 50, `offset`/`nextOffset`) |
| `growforge_get_mission` | `jobStore.getJob` + `coreState.jobView` | bounded previews only; no owner emails |
| `growforge_get_recent_activity` | `jobStore` + `approvalStore` + `agentStore` logs | merged, time-ordered |
| `growforge_get_system_health` | `coreState.buildCoreState` (live probes) | `reachable` is *measured* now |
| `growforge_get_service_registry` | `mcp/store`, `connectorStore` | `verification: registry_record_only` — registered ≠ active |
| `growforge_get_model_status` | `aiModelStore.listAiModels`, `llm.jobPrefersCloud` | key *presence* boolean only; last recorded test, not live |
| `growforge_get_runtime_errors` | `jobStore`, `agentStore` logs | redacted, paths scrubbed |
| `growforge_get_api_usage` | `usage.summarizeUsage` over step usage | mission-attached calls only; cost = static estimate |
| `growforge_query_brain` | `spatial/obsidianReader.loadSpatialGraph` | titles + ≤240-char snippets; no paths/full bodies |
| `growforge_get_workspace_summary` | departments, agent/mission/model/MCP stores | actor + tenancy + inventory |

Resources (thin wrappers over the same services): `growforge://workspace/current`, `growforge://runtime/summary`.

Every result is an envelope `{ ok, tool, generatedAt, provenance:{source, readOnly, phase}, truncated?, data | error }` returned as both `structuredContent` and JSON text.

### State semantics
- **No ACTIVE-from-catalog.** Registry/model entries report `registryStatus`/`lastTest`, never "active". Liveness only comes from probes in `get_system_health`.
- **`unverified_running_or_interrupted`**: `jobStore` rewrites any persisted `running` job to `error: Interrupted…` when loaded by a *different process*. The gateway maps exactly that case to this state, because from a separate process a live run and a crashed run are indistinguishable. (A test pins this coupling to jobStore's message.)

## Security model

- **Startup guard** (`assertLocalDevelopmentEnvironment`): refuses to start (exit 78, nothing on stdout) when `PUBLIC_PREVIEW_MODE`, `NEXT_PUBLIC_PREVIEW_MODE`, `BETA_MODE`, `NODE_ENV=production`, or a hosted platform env (`VERCEL*`, `CF_*`) is present. No override flag exists by design.
- **No listener**: stdio only. stdout carries protocol only; `console.log/info/debug` are redirected to stderr.
- **Redaction layer** on every payload: known key shapes (OpenAI/OpenRouter/Anthropic, Google, Groq, HF, GitHub, Slack, AWS, JWT, Bearer, PEM, 64-hex), `key=value` pairs, the *values* of every sensitive-named env var, and credential-named object keys. Booleans/counters (`hasApiKey`, `totalTokens`) are kept.
- **Not returned at all**: MCP server `command/args/url/env`, connector URLs/headers (host only), model base URLs (host only), user emails (`createdBy/approvedBy`), filesystem paths.
- **Errors**: stable codes (`INVALID_ARGUMENT|NOT_FOUND|PERMISSION_DENIED|UNAVAILABLE|INTERNAL`); messages are redacted + path-scrubbed + truncated; never stacks. Unknown and invisible missions return the same `NOT_FOUND`.
- **Bounds**: list limits ≤ 50, per-field truncation, 24 000-char payload ceiling (largest arrays are halved and `truncated: true` is set).
- **Actor model** (`McpActor`): `actorType`, `userId`, `workspaceId`, `platformRole`, `workspaceRole`, `permissions`. Phase 1 builds only `local_owner_mcp` (ids are `null` — GrowForge stores are single-tenant, nothing is invented). Each tool declares a `read:*` permission checked on every call; the server factory rejects any other actor type.
- **Read-only proof**: the test snapshots the data dir byte-for-byte before/after a full tool sweep.

## Connect (local)

Claude Code (already registered, local scope — no secrets in config):

```
claude mcp add --scope local growforge-readonly -- cmd /c npx tsx --tsconfig C:\Ony\GrowForge-Digital-AI-OS\growforge-ui\tsconfig.json C:\Ony\GrowForge-Digital-AI-OS\growforge-ui\scripts\growforge-mcp-stdio.mts
```
(Git Bash: prefix with `MSYS_NO_PATHCONV=1`, or it rewrites `/c`.) `--tsconfig` is required: the server uses the app's `@/` path aliases and is launched from arbitrary directories.

Codex (`~/.codex/config.toml`) — **not applied automatically**:

```toml
[mcp_servers.growforge-readonly]
command = "cmd"
args = ["/c", "npx", "tsx", "--tsconfig", "C:\\Ony\\GrowForge-Digital-AI-OS\\growforge-ui\\tsconfig.json", "C:\\Ony\\GrowForge-Digital-AI-OS\\growforge-ui\\scripts\\growforge-mcp-stdio.mts"]
```
No `env` block: the server reads `growforge-ui/.env.local` itself and never echoes it.

Tests: `cd growforge-ui && npx tsx scripts/test-growforge-mcp-server.ts` (80 checks; spawns the real entry).

## Known limitations
- `tsx` is not a project dependency (existing scripts also use `npx tsx`); first launch may fetch it. Adding it as a devDependency is recommended.
- Stores are file-backed single-tenant; there is no workspace scoping to enforce yet.
- Redaction is pattern + env-value based. A free-text secret with no recognisable shape that is *not* in env could pass through inside mission text/brain snippets (bounded, owner-local).
- Live in-process telemetry (`telemetryStore`) and the Next.js process stderr are unreachable from a separate process, so they are not exposed.
- Canonical readers occasionally self-seed missing files (`aiModelStore`, `agentStore`). Not triggered when the files exist; the read-only test would catch a regression.
- `OBSIDIAN_VAULT_DIR` unset ⇒ vault reported `reachable: false` (accurate, but empty brain vault section).
- `get_api_usage` excludes NORA chat/voice turns (not recorded per mission) and is not reconciled with provider billing.

## Future phases (not built)
- **Phase 2 — write actions** behind explicit approval: create/cancel mission, approve/deny approval, run workflow. Must go through the existing approval queue and `toolBroker`, per-tool `write:*` permissions, idempotency keys, audit log; consolidate/retire root `mcp-server.js` `run_agent`.
- **Phase 3 — remote**: Streamable HTTP transport reusing `createGrowForgeReadOnlyMcpServer`; OAuth 2.1 (PKCE, dynamic client registration), per-user/workspace actors (`remote_user_mcp`), workspace-scoped stores first, rate limits, audit trail, Origin/DNS-rebinding protection, no startup in preview/beta until a reviewed policy allows it.
- Customer connectors, ChatGPT/Claude remote connectors and interactive MCP UI come after Phase 3.
