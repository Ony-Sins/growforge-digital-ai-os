import fs from "node:fs";
import { DEPARTMENTS } from "@/lib/departments";
import { getJob, listJobSummaries, type Job, type JobStep } from "@/lib/jobStore";
import { summarizeUsage, estimateCost, type UsageRecord } from "@/lib/usage";
import { jobPrefersCloud, SYSTEM_VAULT_ID } from "@/lib/llm";
import { listPendingApprovals } from "@/lib/approvalStore";
import { listPendingConsultations } from "@/lib/consultationStore";
import { listAiModels } from "@/lib/aiModelStore";
import { listMcpServers } from "@/lib/mcp/store";
import { getSecretForServerUse } from "@/lib/serverVault";
import { DEFAULT_VAULT_DIR } from "@/lib/spatial/obsidianReader";

/**
 * Everything the /core page shows is assembled here from real stores and real
 * live probes — jobs.json, the approval queue, the MCP/model registries, and
 * short-timeout health checks against the local services. Nothing is
 * synthesized: a service that doesn't answer is reported "offline", a job with
 * no recorded token usage says so instead of inventing numbers.
 */

export interface CoreStepView {
  id: string;
  kind: JobStep["kind"];
  label: string;
  departmentId?: string;
  status: JobStep["status"];
  percent: number;
  provider?: string;
  startedAt?: string;
  finishedAt?: string;
  outputChars: number;
  preview: string;
  sourceCount: number;
  error?: string;
  tokens: number | null;
  costUsd: number | null;
  costKnown: boolean;
}

export interface CoreDeptView {
  id: string;
  name: string;
  assigned: boolean;
  task?: string;
  step?: CoreStepView;
  blueprint?: { name: string; category: string; band: "direct" | "confirm" | "escalate"; confidence: number };
}

export interface CoreJobView {
  id: string;
  title: string;
  brief: string;
  status: Job["status"];
  percent: number;
  verified: boolean;
  createdAt: string;
  finishedAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  createdBy?: string;
  error?: string;
  revisionCount: number;
  liveNoteCount: number;
  steps: CoreStepView[];
  departments: CoreDeptView[];
  research: { sourceCount: number; verified: boolean; provider?: string; sources: { title: string; url: string }[] };
  finalPreview: string;
  finalChars: number;
  usage: {
    calls: number;
    totalTokens: number;
    durationMs: number;
    costUsd: number | null;
    allCostsKnown: boolean;
    providers: { provider: string; model: string; calls: number; tokens: number }[];
  } | null;
}

export interface CoreProbe {
  id: "ollama" | "searxng" | "n8n" | "comfyui";
  label: string;
  online: boolean;
  detail: string;
  latencyMs: number | null;
}

export interface CoreState {
  generatedAt: string;
  jobs: { id: string; title: string; status: Job["status"]; percent: number; createdAt: string; isTest: boolean }[];
  job: CoreJobView | null;
  systems: {
    probes: CoreProbe[];
    mcp: { count: number; servers: { name: string; toolCount: number }[] };
    models: { count: number; list: { name: string; provider: string; isPrimary: boolean }[] };
    routing: "local-first" | "cloud-first";
    pendingApprovals: number;
    pendingConsultations: number;
    vault: { reachable: boolean; noteCount: number; latestDaily: string | null };
  };
}

const TEST_JOB_ID = /^job-(test|crash-test|research-verify)/;

async function probe(
  id: CoreProbe["id"],
  label: string,
  url: string,
  okDetail: (body: unknown) => string,
  timeoutMs = 2500,
): Promise<CoreProbe> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" }).finally(() => clearTimeout(timer));
    const latencyMs = Date.now() - start;
    if (!res.ok) return { id, label, online: false, detail: `HTTP ${res.status}`, latencyMs };
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { id, label, online: true, detail: okDetail(body), latencyMs };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return { id, label, online: false, detail: aborted ? "no response" : "not running", latencyMs: null };
  }
}

function stepView(step: JobStep): CoreStepView {
  const records: UsageRecord[] = step.usage ?? [];
  let tokens: number | null = null;
  let costUsd: number | null = null;
  let costKnown = false;
  if (records.length > 0) {
    tokens = records.reduce((s, r) => s + (r.inputTokens ?? 0) + (r.outputTokens ?? 0), 0);
    const costs = records.map(estimateCost);
    costKnown = costs.every((c) => c.usd !== null);
    costUsd = costKnown ? costs.reduce((s, c) => s + (c.usd ?? 0), 0) : null;
  }
  const output = step.output ?? "";
  return {
    id: step.id,
    kind: step.kind,
    label: step.label,
    departmentId: step.departmentId,
    status: step.status,
    percent: step.percent,
    provider: step.provider,
    startedAt: step.startedAt,
    finishedAt: step.finishedAt,
    outputChars: output.length,
    preview: output.slice(0, 700),
    sourceCount: step.sources?.length ?? 0,
    error: step.error,
    tokens,
    costUsd,
    costKnown,
  };
}

function jobView(job: Job): CoreJobView {
  const steps = job.steps.map(stepView);
  const assignments = job.planSnapshot?.assignments ?? [];

  const departments: CoreDeptView[] = DEPARTMENTS.map((dept) => {
    const assignment = assignments.find((a) => a.departmentId === dept.id);
    const step = steps.find((s) => s.kind === "department" && s.departmentId === dept.id);
    const rec = assignment?.vaultRecommendation;
    return {
      id: dept.id,
      name: dept.name,
      assigned: Boolean(assignment || step),
      task: assignment?.task,
      step,
      blueprint: rec
        ? { name: rec.selectedAgentName, category: rec.selectedAgentCategory, band: rec.band, confidence: rec.confidence }
        : undefined,
    };
  });

  const researchStep = job.steps.find((s) => s.kind === "research");
  const sources = (job.dossierSnapshot?.sources ?? researchStep?.sources ?? []).slice(0, 6);
  const allSources = job.dossierSnapshot?.sources ?? researchStep?.sources ?? [];

  const allRecords: UsageRecord[] = job.steps.flatMap((s) => s.usage ?? []);
  let usage: CoreJobView["usage"] = null;
  if (allRecords.length > 0) {
    const summary = summarizeUsage(allRecords);
    usage = {
      calls: summary.totalCalls,
      totalTokens: summary.totalInputTokens + summary.totalOutputTokens,
      durationMs: summary.totalDurationMs,
      costUsd: summary.totalCostUsd,
      allCostsKnown: summary.allCostsKnown,
      providers: summary.providers.map((p) => ({
        provider: p.provider,
        model: p.model,
        calls: p.calls,
        tokens: p.totalInputTokens + p.totalOutputTokens,
      })),
    };
  }

  const final = job.finalOutput ?? "";
  return {
    id: job.id,
    title: job.title,
    brief: job.brief,
    status: job.status,
    percent: job.percent,
    verified: job.verified,
    createdAt: job.createdAt,
    finishedAt: job.finishedAt,
    approvedAt: job.approvedAt,
    approvedBy: job.approvedBy,
    createdBy: job.createdBy,
    error: job.error,
    revisionCount: job.revisions.length,
    liveNoteCount: job.liveNotes.length,
    steps,
    departments,
    research: {
      sourceCount: allSources.length,
      verified: job.dossierSnapshot?.verified ?? job.verified,
      provider: researchStep?.provider,
      sources: sources.map((s) => ({ title: s.title, url: s.uri })),
    },
    finalPreview: final.slice(0, 900),
    finalChars: final.length,
    usage,
  };
}

function vaultStatus(): CoreState["systems"]["vault"] {
  try {
    const files = fs.readdirSync(DEFAULT_VAULT_DIR).filter((f) => f.toLowerCase().endsWith(".md"));
    const daily = files.filter((f) => /^\d{4}-\d{2}-\d{2}/.test(f)).sort();
    return { reachable: true, noteCount: files.length, latestDaily: daily.length ? daily[daily.length - 1] : null };
  } catch {
    return { reachable: false, noteCount: 0, latestDaily: null };
  }
}

export async function buildCoreState(requestedJobId?: string | null): Promise<CoreState> {
  const summaries = listJobSummaries();
  const jobs = summaries.map((j) => ({
    id: j.id,
    title: j.title || "Untitled project",
    status: j.status,
    percent: j.percent,
    createdAt: j.createdAt,
    isTest: TEST_JOB_ID.test(j.id),
  }));

  // Default focus: a running real job, else the newest real finished job, else
  // whatever exists — never a test fixture unless it is all there is.
  jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const real = jobs.filter((j) => !j.isTest);
  const defaultId =
    real.find((j) => j.status === "running")?.id ?? real.find((j) => j.status === "done")?.id ?? real[0]?.id ?? jobs[0]?.id;
  const chosen = (requestedJobId && getJob(requestedJobId)) || (defaultId ? getJob(defaultId) : undefined);

  const n8nHost = (
    getSecretForServerUse(SYSTEM_VAULT_ID, "integrations:n8n:host") ||
    process.env.N8N_HOST ||
    "http://127.0.0.1:5678"
  ).replace(/\/$/, "");
  const ollamaBase = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/v1\/?$/, "").replace(/\/$/, "");
  const searxBase = (process.env.SEARXNG_BASE_URL || "http://localhost:8088").replace(/\/+$/, "");
  const comfyBase = (process.env.COMFYUI_SERVER_URL || "http://127.0.0.1:8188").replace(/\/+$/, "");

  const mcpServers = listMcpServers();
  const probes = await Promise.all([
      probe("ollama", "Local LLM (Ollama)", `${ollamaBase}/api/tags`, (b) => {
        const n = (b as { models?: unknown[] } | null)?.models?.length ?? 0;
        return `${n} model${n === 1 ? "" : "s"} pulled`;
      }),
      probe("searxng", "Live research (SearXNG)", `${searxBase}/healthz`, () => "self-hosted search"),
      probe("n8n", "Automation (n8n)", `${n8nHost}/healthz`, () => "workflow engine"),
      probe("comfyui", "Image generation (ComfyUI)", `${comfyBase}/system_stats`, () => "GPU image server"),
  ]);

  const models = listAiModels();

  return {
    generatedAt: new Date().toISOString(),
    jobs,
    job: chosen ? jobView(chosen) : null,
    systems: {
      probes,
      mcp: {
        count: mcpServers.length,
        servers: mcpServers.map((s) => ({ name: s.name, toolCount: s.detectedTools?.length ?? 0 })),
      },
      models: {
        count: models.length,
        list: models.map((m) => ({ name: m.name, provider: String(m.providerType), isPrimary: m.isPrimary ?? false })),
      },
      routing: jobPrefersCloud() ? "cloud-first" : "local-first",
      pendingApprovals: listPendingApprovals().length,
      pendingConsultations: listPendingConsultations().length,
      vault: vaultStatus(),
    },
  };
}
