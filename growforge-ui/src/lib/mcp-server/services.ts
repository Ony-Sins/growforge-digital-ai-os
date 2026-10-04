/**
 * GrowForge MCP Gateway (Phase 1) — canonical read adapters.
 *
 * Each function here is a thin, read-only adapter over an EXISTING GrowForge
 * store/service (jobStore, coreState, aiModelStore, usage, ...). No business
 * logic is re-implemented and no second state model is kept; this layer only
 * (a) selects bounded fields, (b) drops owner identifiers / secrets, and
 * (c) attaches honest state semantics ("registered" is never "active").
 *
 * Imports are done lazily so the startup guard can run before any store module
 * (which snapshots process.cwd()/data and env at import time) is loaded.
 */

import { McpToolError, clampLimit, safeErrorText, safeText, sanitizeDeep, truncate } from "@/lib/mcp-server/safety";
import type { McpActor } from "@/lib/mcp-server/safety";

/** The restart heuristic in jobStore marks any persisted "running" job as errored with this text. */
const INTERRUPTED_MESSAGE = "Interrupted by a server restart before it finished.";

const TEST_JOB_ID = /^job-(test|crash-test|research-verify)/;

export const MISSION_ID_PATTERN = /^[A-Za-z0-9._-]{1,80}$/;

/**
 * A fresh process loads data/*.json once and caches it on globalThis. The MCP
 * process is a *separate* reader from the running Next.js app, so drop those
 * read caches before each call to see the app's latest persisted state.
 * (Only caches are dropped — nothing is written.)
 */
export function refreshCanonicalCaches(): void {
  const g = globalThis as unknown as Record<string, unknown>;
  for (const key of ["__growforgeJobs", "__growforgeConnectors", "__growforgeMcpServers", "__growforgeStore"]) {
    delete g[key];
  }
}

// ---------------------------------------------------------------------------
// Mission (job) helpers
// ---------------------------------------------------------------------------

export type MissionState = "running" | "done" | "error" | "unverified_running_or_interrupted";

interface MissionRow {
  id: string;
  title: string;
  status: MissionState;
  rawStatus: string;
  percent: number;
  verified: boolean;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
  approvedAt: string | null;
  activeStep: string | null;
  hasFinalOutput: boolean;
  isTest: boolean;
}

/**
 * jobStore flips a persisted "running" job to "error: Interrupted…" when loaded
 * by a process that did not start it. Seen from here that is indistinguishable
 * from a genuinely interrupted run, so say exactly that instead of claiming a
 * failure (or a live run) the MCP process cannot actually verify.
 */
function missionState(status: string, error: string | undefined): MissionState {
  if (status === "error" && error === INTERRUPTED_MESSAGE) return "unverified_running_or_interrupted";
  return status as MissionState;
}

async function loadMissionRows(): Promise<MissionRow[]> {
  const { listJobSummaries, getJob } = await import("@/lib/jobStore");
  return listJobSummaries().map((s) => {
    const job = getJob(s.id);
    return {
      id: s.id,
      title: safeText(s.title || "Untitled project", 120),
      status: missionState(s.status, job?.error),
      rawStatus: s.status,
      percent: s.percent,
      verified: s.verified,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      finishedAt: s.finishedAt ?? null,
      approvedAt: s.approvedAt ?? null,
      activeStep: s.activeStep,
      hasFinalOutput: s.hasFinalOutput,
      isTest: TEST_JOB_ID.test(s.id),
    };
  });
}

function missionCounts(rows: MissionRow[]) {
  const real = rows.filter((r) => !r.isTest);
  const by = (st: MissionState) => real.filter((r) => r.status === st).length;
  return {
    total: real.length,
    done: by("done"),
    error: by("error"),
    running: by("running"),
    unverifiedRunningOrInterrupted: by("unverified_running_or_interrupted"),
    testFixturesExcluded: rows.length - real.length,
  };
}

// ---------------------------------------------------------------------------
// Tool services
// ---------------------------------------------------------------------------

export async function getOverview() {
  const { buildCoreState } = await import("@/lib/coreState");
  const [core, rows] = await Promise.all([buildCoreState(null), loadMissionRows()]);
  const focus = core.job;
  return {
    missions: missionCounts(rows),
    focusMission: focus
      ? { id: focus.id, title: safeText(focus.title, 120), status: focus.status, percent: focus.percent }
      : null,
    systems: {
      probes: core.systems.probes.map((p) => ({
        id: p.id,
        label: p.label,
        state: p.online ? "reachable" : "unreachable",
        detail: safeText(p.detail, 80),
        latencyMs: p.latencyMs,
      })),
      mcpServersRegistered: core.systems.mcp.count,
      aiModelsRegistered: core.systems.models.count,
      routing: core.systems.routing,
      pendingApprovals: core.systems.pendingApprovals,
      pendingConsultations: core.systems.pendingConsultations,
      vault: core.systems.vault,
    },
    notes: [
      "Probes are live reachability checks from this process; 'registered' counts are configuration records, not proof of activity.",
    ],
  };
}

export async function listMissions(input: {
  status?: MissionState;
  includeTest?: boolean;
  limit?: number;
  offset?: number;
}) {
  const rows = await loadMissionRows();
  const filtered = rows
    .filter((r) => (input.includeTest ? true : !r.isTest))
    .filter((r) => (input.status ? r.status === input.status : true))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const limit = clampLimit(input.limit, 20, 50);
  const offset = Math.max(0, Math.floor(input.offset ?? 0));
  const items = filtered.slice(offset, offset + limit).map(({ rawStatus: _raw, ...rest }) => rest);
  const next = offset + limit;
  return {
    items,
    total: filtered.length,
    limit,
    offset,
    nextOffset: next < filtered.length ? next : null,
    statusSemantics:
      "'unverified_running_or_interrupted' = persisted as running; this read-only process cannot tell a live run from a crashed one.",
  };
}

export async function getMission(id: string) {
  if (!MISSION_ID_PATTERN.test(id)) throw new McpToolError("INVALID_ARGUMENT", "Invalid mission id format.");
  const { getJob } = await import("@/lib/jobStore");
  const job = getJob(id);
  // Same response for "never existed" and "not visible" — no enumeration signal.
  if (!job) throw new McpToolError("NOT_FOUND", "Mission not found.");
  const { jobView } = await import("@/lib/coreState");
  const view = jobView(job);
  const state = missionState(view.status, job.error);
  return {
    id: view.id,
    title: safeText(view.title, 160),
    brief: safeText(view.brief, 1500),
    status: state,
    percent: view.percent,
    verified: view.verified,
    createdAt: view.createdAt,
    finishedAt: view.finishedAt ?? null,
    approved: Boolean(view.approvedAt),
    approvedAt: view.approvedAt ?? null,
    error:
      state === "unverified_running_or_interrupted"
        ? "Persisted as running; this process cannot tell whether it is live or was interrupted."
        : view.error
          ? safeErrorText(view.error, 300)
          : null,
    revisionCount: view.revisionCount,
    liveNoteCount: view.liveNoteCount,
    steps: view.steps.map((s) => ({
      id: s.id,
      kind: s.kind,
      label: safeText(s.label, 100),
      departmentId: s.departmentId ?? null,
      status: s.status,
      percent: s.percent,
      provider: s.provider ?? null,
      startedAt: s.startedAt ?? null,
      finishedAt: s.finishedAt ?? null,
      outputChars: s.outputChars,
      preview: safeText(s.preview, 400),
      sourceCount: s.sourceCount,
      error: s.error && !(state === "unverified_running_or_interrupted" && s.error === "Interrupted") ? safeErrorText(s.error, 240) : null,
      tokens: s.tokens,
      costUsd: s.costUsd,
      costKnown: s.costKnown,
    })),
    departments: view.departments.filter((d) => d.assigned).map((d) => ({ id: d.id, name: d.name, task: safeText(d.task, 200) })),
    research: { sourceCount: view.research.sourceCount, verified: view.research.verified },
    finalPreview: safeText(view.finalPreview, 600),
    finalChars: view.finalChars,
    usage: view.usage,
  };
}

interface ActivityEvent {
  at: string;
  kind: string;
  source: "job" | "approval" | "agent_log";
  refId: string | null;
  summary: string;
}

export async function getRecentActivity(input: { limit?: number; since?: string }) {
  const limit = clampLimit(input.limit, 20, 50);
  const sinceMs = input.since ? Date.parse(input.since) : NaN;
  const events: ActivityEvent[] = [];

  const rows = (await loadMissionRows()).filter((r) => !r.isTest);
  for (const r of rows) {
    events.push({ at: r.createdAt, kind: "mission_created", source: "job", refId: r.id, summary: `Mission created: ${r.title}` });
    if (r.finishedAt) {
      events.push({ at: r.finishedAt, kind: `mission_${r.status}`, source: "job", refId: r.id, summary: `Mission ${r.status}: ${r.title}` });
    }
    if (r.approvedAt) {
      events.push({ at: r.approvedAt, kind: "mission_approved", source: "job", refId: r.id, summary: `Mission approved: ${r.title}` });
    }
  }

  const { listPendingApprovals } = await import("@/lib/approvalStore");
  for (const a of listPendingApprovals()) {
    events.push({
      at: a.createdAt,
      kind: "approval_pending",
      source: "approval",
      refId: a.id,
      summary: safeText(`Approval pending for tool ${a.toolName} (${a.jobTitle})`, 200),
    });
  }

  const { getLogs } = await import("@/lib/agentStore");
  for (const l of getLogs(100)) {
    events.push({
      at: l.timestamp,
      kind: `agent_log_${l.level}`,
      source: "agent_log",
      refId: l.agentId,
      summary: safeText(l.message, 200),
    });
  }

  const filtered = events
    .filter((e) => (Number.isFinite(sinceMs) ? Date.parse(e.at) >= sinceMs : true))
    .sort((a, b) => b.at.localeCompare(a.at));
  return {
    items: filtered.slice(0, limit),
    total: filtered.length,
    limit,
    sources: ["jobs.json", "approvals.json (pending only)", "agent run log (store.json)"],
    notes: ["In-process live telemetry (telemetryStore) is not readable from this separate process and is not included."],
  };
}

export async function getSystemHealth() {
  const { buildCoreState } = await import("@/lib/coreState");
  const core = await buildCoreState(null);
  const checkedAt = core.generatedAt;
  return {
    checkedAt,
    probes: core.systems.probes.map((p) => ({
      id: p.id,
      label: p.label,
      state: p.online ? "reachable" : "unreachable",
      detail: safeText(p.detail, 80),
      latencyMs: p.latencyMs,
    })),
    vaultNotes: core.systems.vault,
    routing: core.systems.routing,
    pendingApprovals: core.systems.pendingApprovals,
    pendingConsultations: core.systems.pendingConsultations,
    semantics: "reachable = answered a short-timeout HTTP health probe from this process just now. Nothing is inferred from config.",
  };
}

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export async function getServiceRegistry() {
  const [{ listMcpServers }, { listConnectors }] = await Promise.all([import("@/lib/mcp/store"), import("@/lib/connectorStore")]);
  const mcp = listMcpServers().map((s) => ({
    id: s.id,
    name: safeText(s.name, 80),
    transport: s.transport,
    origin: s.origin ?? "custom",
    registryStatus: s.status ?? "unknown",
    lastPing: s.lastPing ?? null,
    toolCount: s.detectedTools?.length ?? 0,
    hasCredential: s.hasCredential,
    restrictedToDepartments: s.allowedDepartments.length > 0,
    lastError: s.errorMessage ? safeErrorText(s.errorMessage, 160) : null,
  }));
  const connectors = listConnectors().map((c) => ({
    id: c.id,
    name: safeText(c.name, 80),
    method: c.method,
    authMode: c.authMode,
    host: hostOf(c.url),
    hasCredential: c.hasSecret,
    headerCount: c.headerCount,
  }));
  return {
    mcpServers: { items: mcp.slice(0, 50), total: mcp.length },
    restConnectors: { items: connectors.slice(0, 50), total: connectors.length },
    verification: "registry_record_only",
    semantics:
      "These are configuration records. 'registryStatus' is what GrowForge last stored, not a live check — use growforge_get_system_health for live reachability.",
  };
}

export async function getModelStatus() {
  const [{ listAiModels }, { jobPrefersCloud }] = await Promise.all([import("@/lib/aiModelStore"), import("@/lib/llm")]);
  const models = listAiModels().map((m) => ({
    id: m.id,
    name: safeText(m.name, 80),
    providerType: m.providerType,
    modelName: safeText(m.modelName, 100),
    taskRole: m.taskRole,
    isPrimary: m.isPrimary ?? false,
    registryStatus: m.status ?? "active",
    isConfigured: m.isConfigured,
    hasApiKey: m.hasApiKey,
    keySource: m.source,
    endpointHost: hostOf(m.baseUrl),
    lastTest: m.lastTestedAt
      ? {
          at: m.lastTestedAt,
          result: m.lastStatus ?? null,
          latencyMs: m.lastLatencyMs ?? null,
          error: m.lastErrorMessage ? safeErrorText(m.lastErrorMessage, 160) : null,
        }
      : null,
  }));
  return {
    routing: jobPrefersCloud() ? "cloud-first" : "local-first",
    items: models.slice(0, 50),
    total: models.length,
    semantics:
      "'isConfigured' means a key/endpoint is present; 'lastTest' is the last recorded connection test, not live availability. No key material is returned.",
  };
}

export async function getRuntimeErrors(input: { limit?: number; includeTest?: boolean }) {
  const limit = clampLimit(input.limit, 20, 50);
  const { listJobSummaries, getJob } = await import("@/lib/jobStore");
  const items: { at: string; kind: string; source: string; refId: string | null; message: string }[] = [];

  for (const s of listJobSummaries()) {
    if (!input.includeTest && TEST_JOB_ID.test(s.id)) continue;
    const job = getJob(s.id);
    if (!job) continue;
    const state = missionState(job.status, job.error);
    if (state === "error" && job.error) {
      items.push({ at: job.finishedAt ?? job.updatedAt, kind: "mission_error", source: "job", refId: job.id, message: safeErrorText(job.error, 240) });
    } else if (state === "unverified_running_or_interrupted") {
      items.push({
        at: job.updatedAt,
        kind: "mission_unverified_state",
        source: "job",
        refId: job.id,
        message: "Persisted as running; may be live in the app or interrupted by a restart.",
      });
    }
    for (const step of job.steps) {
      if (step.status === "error" && step.error && step.error !== "Interrupted") {
        items.push({ at: step.finishedAt ?? job.updatedAt, kind: "step_error", source: "job", refId: `${job.id}/${step.id}`, message: safeErrorText(step.error, 240) });
      }
    }
  }

  const { getLogs } = await import("@/lib/agentStore");
  for (const l of getLogs(200)) {
    if (l.level === "error") items.push({ at: l.timestamp, kind: "agent_log_error", source: "agent_log", refId: l.agentId, message: safeErrorText(l.message, 240) });
  }

  items.sort((a, b) => b.at.localeCompare(a.at));
  return {
    items: items.slice(0, limit),
    total: items.length,
    limit,
    sources: ["jobs.json errors", "agent run log errors"],
    notes: ["Process-level stderr of the running Next.js app is not persisted by GrowForge and is not available here."],
  };
}

export async function getApiUsage(input: { days?: number }) {
  const days = Math.max(1, Math.min(365, Math.floor(input.days ?? 30)));
  const cutoff = Date.now() - days * 86_400_000;
  const [{ listJobSummaries, getJob }, { summarizeUsage }] = await Promise.all([import("@/lib/jobStore"), import("@/lib/usage")]);

  const records: import("@/lib/usage").UsageRecord[] = [];
  let jobsWithUsage = 0;
  for (const s of listJobSummaries()) {
    const job = getJob(s.id);
    if (!job) continue;
    const jobRecords = job.steps.flatMap((st) => st.usage ?? []).filter((r) => Date.parse(r.timestamp) >= cutoff);
    if (jobRecords.length) jobsWithUsage += 1;
    records.push(...jobRecords);
  }
  const summary = summarizeUsage(records);
  return {
    windowDays: days,
    jobsWithUsage,
    totalCalls: summary.totalCalls,
    totalInputTokens: summary.totalInputTokens,
    totalOutputTokens: summary.totalOutputTokens,
    totalDurationMs: summary.totalDurationMs,
    estimatedCostUsd: summary.totalCostUsd,
    allCostsKnown: summary.allCostsKnown,
    byProviderModel: summary.providers.slice(0, 30).map((p) => ({
      provider: p.provider,
      model: safeText(p.model, 80),
      calls: p.calls,
      inputTokens: p.totalInputTokens,
      outputTokens: p.totalOutputTokens,
      estimatedCostUsd: p.estimatedCostUsd,
      costKnown: p.costKnown,
    })),
    coverage:
      "Only LLM calls recorded on mission steps (jobs.json). Excludes NORA chat/voice turns and any call not attached to a mission; not reconciled with provider billing. Cost is a static price-table estimate; null where the model is not priced.",
  };
}

export async function queryBrain(input: { query: string; source?: string; limit?: number }) {
  const q = input.query.trim().toLowerCase();
  if (q.length < 2) throw new McpToolError("INVALID_ARGUMENT", "Query must be at least 2 characters.");
  const limit = clampLimit(input.limit, 10, 25);
  const { loadSpatialGraph } = await import("@/lib/spatial/obsidianReader");
  const graph = await loadSpatialGraph();

  const scored: { node: (typeof graph.nodes)[number]; score: number; matchedIn: string[]; snippet: string }[] = [];
  for (const node of graph.nodes) {
    if (input.source && node.source !== input.source) continue;
    const title = node.title.toLowerCase();
    const body = (node.content ?? node.excerpt ?? "").toLowerCase();
    const inTitle = title.includes(q);
    const bodyIdx = body.indexOf(q);
    if (!inTitle && bodyIdx < 0) continue;
    const raw = node.content ?? node.excerpt ?? "";
    const snippet =
      bodyIdx >= 0
        ? raw.slice(Math.max(0, bodyIdx - 80), bodyIdx + 160).replace(/\s+/g, " ").trim()
        : (node.excerpt ?? "").slice(0, 200);
    scored.push({
      node,
      score: (inTitle ? 10 : 0) + (bodyIdx >= 0 ? 3 : 0) + Math.min(node.degree, 10) / 10,
      matchedIn: [inTitle ? "title" : "", bodyIdx >= 0 ? "content" : ""].filter(Boolean),
      snippet,
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return {
    query: truncate(input.query, 120),
    items: scored.slice(0, limit).map((s) => ({
      id: s.node.id,
      title: safeText(s.node.title, 120),
      source: s.node.source,
      category: s.node.categoryLabel,
      matchedIn: s.matchedIn,
      snippet: safeText(s.snippet, 240),
      connections: s.node.degree,
      lastModified: s.node.lastModified ?? null,
    })),
    totalMatches: scored.length,
    graph: { nodes: graph.summary.totalNotes, categories: graph.categories.map((c) => ({ id: c.id, count: c.count })) },
    notes: ["Read-only search over the same graph the Brain UI renders. Filesystem paths and full note bodies are never returned."],
  };
}

export async function getWorkspaceSummary(actor: McpActor) {
  const [{ CANONICAL_DEPARTMENTS }, { listAgents }, rows, { listMcpServers }, { listAiModels }] = await Promise.all([
    import("@/lib/departments"),
    import("@/lib/agentStore"),
    loadMissionRows(),
    import("@/lib/mcp/store"),
    import("@/lib/aiModelStore"),
  ]);
  const { DEFAULT_VAULT_DIR } = await import("@/lib/spatial/obsidianReader");
  return {
    actor: {
      actorType: actor.actorType,
      platformRole: actor.platformRole,
      workspaceId: actor.workspaceId,
      workspaceRole: actor.workspaceRole,
      permissions: [...actor.permissions],
    },
    tenancy: "single_tenant_local",
    mode: "local_development",
    departments: {
      count: CANONICAL_DEPARTMENTS.length,
      items: CANONICAL_DEPARTMENTS.map((d) => ({ id: d.id, name: safeText(d.name, 80) })),
    },
    agentsRegistered: listAgents().length,
    missions: missionCounts(rows),
    mcpServersRegistered: listMcpServers().length,
    aiModelsRegistered: listAiModels().length,
    brainVaultConfigured: Boolean(DEFAULT_VAULT_DIR),
    notes: [
      "GrowForge stores are not yet workspace-scoped; this is the single local owner workspace. workspaceId is null rather than invented.",
    ],
  };
}

/** Final defence: whatever a service returned, strip credential-shaped keys/values. */
export function finalizePayload<T>(data: T): T {
  return sanitizeDeep(data);
}
