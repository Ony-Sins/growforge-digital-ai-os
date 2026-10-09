import type { Job, JobStep } from "@/lib/jobStore";
import type { PendingApproval } from "@/lib/approvalStore";
import type { PendingConsultation } from "@/lib/consultationStore";
import { canonicalDepartmentId, departmentScopeLabel } from "@/lib/departmentTaxonomy";
import { estimateCost, type UsageRecord } from "@/lib/usage";
import { resolveStepDependencies, type DependencyFindingKind } from "./missionDependencyModel";
import { missionLiveEvidence, type LiveEvidence } from "./missionNucleusModel";

/**
 * MissionWorktree (W1): ONE read-only, pure normalization of the recorded Job (+ approvals, consultations, executor facts) into the
 * entities the Mission Graph, Peek, Workbench, Focus reader and NORA context will all consume. No fetches, no persistence,
 * no UI. A field that is not recorded is `undefined` (or an explicit `Unavailable`), never an empty default, and every surfaced field
 * carries provenance. Nothing here is inferred from labels or from the Mission-level state.
 *
 * Provenance classes (internal, from the capability audit): A recorded and readable today; B recorded but needing a secondary read
 * (planSnapshot, dossier, per-call usage, instruction records); C derived / partial / ambiguous; D not recorded. UI copy uses `label`,
 * never the letter.
 */

/* ------------------------------------------------------------------ provenance */
export type ProvenanceClass = "A" | "B" | "C" | "D";
export type ProvenanceLabel = "Recorded" | "Derived" | "Parsed from text" | "Not recorded";
export interface Provenance { class: ProvenanceClass; label: ProvenanceLabel; note?: string }
const recorded = (note?: string): Provenance => ({ class: "A", label: "Recorded", ...(note ? { note } : {}) });
const secondary = (note?: string): Provenance => ({ class: "B", label: "Recorded", ...(note ? { note } : {}) });
const derived = (note?: string): Provenance => ({ class: "C", label: "Derived", ...(note ? { note } : {}) });
const parsed = (note?: string): Provenance => ({ class: "C", label: "Parsed from text", ...(note ? { note } : {}) });
const notRecorded = (note?: string): Provenance => ({ class: "D", label: "Not recorded", ...(note ? { note } : {}) });
export type FieldProvenance = Record<string, Provenance>;

/** An explicit "this does not exist in the record", with the reason. Never replaced by a default value. */
export interface Unavailable { available: false; reason: string; provenance: Provenance }
const unavailable = (reason: string): Unavailable => ({ available: false, reason, provenance: notRecorded(reason) });

/* ------------------------------------------------------------------ canonical pipeline */
export const PHASE_DEFINITIONS = [
  { key: "client-brief", kind: "brief", label: "Client Brief" },
  { key: "planning", kind: "plan", label: "Planning (HQ)" },
  { key: "live-research", kind: "research", label: "Live Research" },
  { key: "departments", kind: "department", label: "Departments" },
  { key: "team-review", kind: "reconcile", label: "Team Review" },
  { key: "qa", kind: "qa", label: "QA" },
  { key: "final-plan", kind: "final", label: "Final Plan" },
] as const;
export type PhaseKey = typeof PHASE_DEFINITIONS[number]["key"];
export const CANONICAL_PHASE_ORDER: readonly PhaseKey[] = PHASE_DEFINITIONS.map(phase => phase.key);
const PHASE_BY_KIND = new Map<string, typeof PHASE_DEFINITIONS[number]>(PHASE_DEFINITIONS.map(phase => [phase.kind, phase]));

/* ------------------------------------------------------------------ entities */
export type StepStatus = JobStep["status"];
export type RelationKind = "ownership" | "phase-membership" | "department-membership" | "dependency" | "recorded-evidence";
/** `from` -> `to`. dependency: prerequisite -> dependent. ownership: mission -> phase | department | step. Only `ownership` and the two memberships are containment; dependency is NOT parent/child. */
export interface Relation { kind: RelationKind; from: string; to: string; /** The recorded id string a dependency was resolved from. */ reference?: string }

export interface RequestedChange { id: string; message: string; createdAt: string; effect: "queued" | "reran"; redoneSteps?: string[] }
export interface MissionExecution {
  /** What the record says. */
  recordedStatus: Job["status"];
  recordedActiveStepIds: string[];
  /** Whether an executor actually confirms this mission is running. Separate from the recorded status by design. */
  liveEvidence: LiveEvidence;
  liveConfirmed: boolean;
}
export interface UsageTotals {
  calls: number;
  /** Provider-reported tokens only; `complete` is false when any call omitted a count. */
  reportedTokens: { total: number; complete: boolean };
  /** Estimate from the static price table; null when any model is unpriced. NOT a billed cost. */
  estimatedCostUsd: number | null;
  estimateComplete: boolean;
}
export interface Mission {
  id: string; entityKind: "mission"; missionId: string;
  title: string; brief: string;
  status: Job["status"]; percent: number; verified: boolean;
  createdAt: string; updatedAt: string; finishedAt?: string; createdBy?: string; approvedAt?: string; approvedBy?: string; error?: string;
  finalOutputId?: string; media: { type: "image" | "video"; url: string; label?: string }[];
  lineage: { rerunOf?: string; replayMode?: string };
  requestedChanges: RequestedChange[];
  /** Recorded as bare strings: no timestamps, no author. */
  liveNotes: string[];
  execution: MissionExecution;
  usage?: UsageTotals;
  billedCost: Unavailable;
  history: { eventTimeline: Unavailable; revisionHistory: Unavailable };
  /** Recorded steps whose kind is not one of the seven canonical phases (legacy / unknown). */
  unphasedStepIds: string[];
  provenance: FieldProvenance;
}

export interface PipelinePhase {
  id: string; entityKind: "phase"; missionId: string;
  key: PhaseKey; label: string; /** 1-based position in the canonical order. */ order: number;
  stepIds: string[];
  /** More than one recorded step has this phase's kind (e.g. a rerun left two). */
  multiple: boolean;
  status: StepStatus | "mixed";
  statusCounts: Partial<Record<StepStatus, number>>;
  /** Only for a phase backed by exactly one step: that step's recorded percent. Never averaged. */
  recordedPercent?: number;
  startedAt?: string; finishedAt?: string;
  /** Phases whose steps this phase's steps record a resolved dependency on. */
  dependsOnPhaseIds: string[];
  /** Departments phase only: whether the recorded dependencies actually show parallel department work. */
  parallel?: { state: "parallel" | "single" | "not-parallel"; evidence: string };
  provenance: FieldProvenance;
}

export interface Department {
  id: string; entityKind: "department"; missionId: string;
  canonicalId: string; name: string; legacyRoute?: string;
  /** Why this department exists in this mission. */
  origin: { assignment: boolean; step: boolean };
  assignments: { task: string; activity?: string; stepRef?: string; runtimeRouteId?: string }[];
  /** A dispatch recommendation recorded at planning time. It is NOT proof that the specialist executed the work. */
  specialistRecommendation?: { name: string; category: string; band: string; confidence: number };
  stepIds: string[];
  provenance: FieldProvenance;
}

export type ExecutorEvidence = Unavailable;
export interface StepExecution { recordedStatus: StepStatus; recordedActive: boolean; executorEvidence: ExecutorEvidence }
export type DependencyIssueKind = Extract<DependencyFindingKind, "malformed" | "self-reference" | "unresolved" | "ambiguous">;
export interface DependencyIssue { kind: DependencyIssueKind; reference?: string; detail: string; /** For `ambiguous`: every step carrying the id. */ candidateStepIds?: string[] }
export interface ParsedFinding { index: number; question: string; answer: string; markers: number[]; sourcesNone: boolean }
export interface ResearchDetail {
  /** planSnapshot.researchQuestions; undefined when no plan snapshot exists. */
  questions?: string[];
  findings: ParsedFinding[];
  /** Inline [n] markers found in the markdown. [n] is the 1-based position in the recorded source list. */
  citationMarkers: number[];
  unresolvedMarkers: number[];
  sourceIds: string[];
  verified: boolean;
  /** No source was recorded for a research step that is no longer pending/active. */
  noSources: boolean;
  /** Structured claim -> source mapping does not exist; only the markers above do. */
  claimSourceMapping: Unavailable;
  provenance: FieldProvenance;
}
export interface ReviewSection { key: string; heading: string; recognized: boolean; text: string }
export interface ReviewDetail {
  /** Prompted sections parsed from the raw markdown. NOT typed findings. The raw output stays on the Output entity. */
  sections: ReviewSection[];
  /** QA only: parsed from the "**Verdict:**" line. */
  verdict?: "PASS" | "PASS WITH FIXES" | "NEEDS WORK";
  provenance: FieldProvenance;
}
export interface Step {
  id: string; entityKind: "step"; missionId: string;
  /** The recorded step id. NOT unique inside a mission when reruns reuse ids; `idUnique` says so and the entity id then carries the position. */
  recordedId: string; idUnique: boolean;
  /** 1-based position in job.steps. Legacy fallback / display aid only; never the identity. */
  ordinal: number;
  kind: JobStep["kind"];
  /** False when the recorded kind is not one of the seven canonical phase kinds. Such a step has no phase (never invented) but is still a full entity. */
  kindKnown: boolean;
  phaseId?: string; phaseKey?: PhaseKey; departmentId?: string;
  label: string; activity: string;
  status: StepStatus; percent: number; weight: number;
  startedAt?: string; finishedAt?: string;
  provider?: string; runtimeRouteId?: string;
  error?: string;
  outputId?: string; sourceIds: string[]; usageIds: string[];
  usageTotals?: UsageTotals;
  instruction?: { hash?: string; executions: { phase: string; provider: string; requestedModel: string; createdAt: string }[] };
  dependencies: { prerequisiteIds: string[]; dependentIds: string[]; issues: DependencyIssue[] };
  approvalIds: string[]; consultationIds: string[];
  execution: StepExecution;
  research?: ResearchDetail; review?: ReviewDetail;
  provenance: FieldProvenance;
}

export interface Output { id: string; entityKind: "output"; missionId: string; ownerId: string; ownerKind: "step" | "mission"; format: "markdown"; text: string; chars: number; provenance: FieldProvenance }
export interface Source { id: string; entityKind: "source"; missionId: string; /** 1-based position in the recorded list: the n in [n]. */ index: number; title: string; uri: string; origin: "dossier" | "research-step"; ownerStepId?: string; citedInFindings: number[]; provenance: FieldProvenance }
export interface Usage {
  id: string; entityKind: "usage"; missionId: string; stepId: string;
  provider: string; model: string; inputTokens: number | null; outputTokens: number | null; durationMs: number; timestamp: string;
  /** Static price-table estimate. `usd` is null when the model is unpriced or tokens are missing. NOT billed cost. */
  estimate: { usd: number | null; priced: boolean; basis: "static-price-table" };
  billedCost: Unavailable;
  provenance: FieldProvenance;
}
export interface Approval {
  id: string; entityKind: "approval"; missionId: string; approvalId: string;
  /** The recorded step id this request names; `stepId` is set only when it resolves to exactly one step. */
  stepRef: string; stepId?: string; stepLabel: string;
  toolName: string; args: Record<string, unknown>; status: PendingApproval["status"];
  createdAt: string; decidedAt?: string; decidedBy?: string;
  provenance: FieldProvenance;
}
export interface Consultation {
  id: string; entityKind: "consultation"; missionId: string; consultationId: string;
  stepRef: string; stepId?: string; stepLabel: string; departmentRef?: string;
  question: string; options?: string[]; status: PendingConsultation["status"]; answer?: string; redirectDirective?: string;
  createdAt: string; answeredAt?: string; answeredBy?: string;
  provenance: FieldProvenance;
}

export type WorktreeEntity = Mission | PipelinePhase | Department | Step | Output | Source | Usage | Approval | Consultation;

export interface MissionWorktree {
  missionId: string;
  mission: Mission;
  canonicalPhaseOrder: readonly PhaseKey[];
  /** Phases that exist in the record, in canonical order. */
  phases: PipelinePhase[];
  /** Canonical phases the record has no step for. NOT waiting, NOT complete, NOT 0%: simply not recorded. */
  missingPhaseKeys: PhaseKey[];
  departments: Department[];
  steps: Step[];
  outputs: Output[];
  sources: Source[];
  usage: Usage[];
  /** undefined = the list could not be read, so no claim is made (distinct from an empty list). */
  approvals?: Approval[];
  consultations?: Consultation[];
  relations: Relation[];
}

export interface WorktreeInput {
  /** The full raw Job record (/api/jobs/:id). Per-step usage records are on it; /api/jobs/:id/usage is a re-grouping of the same records. */
  job: Job;
  approvals?: PendingApproval[] | null;
  consultations?: PendingConsultation[] | null;
  /** Overview executor facts (executingNow); null/undefined when they could not be read. */
  executor?: { confirmable: boolean; missionIds: readonly string[] } | null;
}

/* ------------------------------------------------------------------ helpers */
const text = (value: unknown): string | undefined => (typeof value === "string" && value.length > 0 ? value : undefined);
const earliest = (values: (string | undefined)[]) => values.filter((v): v is string => !!v).sort()[0];
const latest = (values: (string | undefined)[]) => values.filter((v): v is string => !!v).sort().slice(-1)[0];

function usageTotals(records: readonly UsageRecord[]): UsageTotals | undefined {
  if (!records.length) return undefined;
  const estimates = records.map(estimateCost);
  const estimateComplete = estimates.every(estimate => estimate.usd !== null);
  return {
    calls: records.length,
    reportedTokens: { total: records.reduce((sum, r) => sum + (r.inputTokens ?? 0) + (r.outputTokens ?? 0), 0), complete: records.every(r => r.inputTokens !== null && r.outputTokens !== null) },
    estimatedCostUsd: estimateComplete ? estimates.reduce((sum, estimate) => sum + (estimate.usd ?? 0), 0) : null,
    estimateComplete,
  };
}

const FINDING_HEADING = /^### Finding (\d+):[ \t]*(.*)$/gm;
/** Parses the orchestrator's research markdown ("### Finding N: question / answer / Sources: [1] [2]"). Text parsing, labelled as such. */
export function parseResearchFindings(output: string): ParsedFinding[] {
  const heads = [...output.matchAll(FINDING_HEADING)];
  return heads.map((head, i) => {
    const start = (head.index ?? 0) + head[0].length;
    const end = i + 1 < heads.length ? heads[i + 1].index ?? output.length : output.length;
    let body = output.slice(start, end).trim();
    const sourcesLine = /(?:^|\n)Sources:[ \t]*([^\n]*)\s*$/.exec(body);
    let sourcesText = "";
    if (sourcesLine) { sourcesText = sourcesLine[1]; body = body.slice(0, sourcesLine.index).trim(); }
    const markers = [...new Set([...`${body}\n${sourcesText}`.matchAll(/\[(\d+)\]/g)].map(m => Number(m[1])))].sort((a, b) => a - b);
    return { index: Number(head[1]), question: head[2].trim(), answer: body, markers, sourcesNone: /none returned/i.test(sourcesText) };
  });
}

const REVIEW_SECTIONS: Record<string, { key: string; heading: string }[]> = {
  reconcile: [{ key: "conflicts", heading: "Conflicts" }, { key: "dependencies", heading: "Dependencies" }, { key: "gaps", heading: "Gaps" }, { key: "agreed-direction", heading: "Agreed direction" }],
  qa: [{ key: "unsupported-claims", heading: "Unsupported claims" }, { key: "contradictions", heading: "Contradictions" }, { key: "missing-essentials", heading: "Missing essentials" }, { key: "required-fixes", heading: "Required fixes" }],
};
/** Splits Team Review / QA markdown into its `###` sections. The result is a parsed VIEW; the raw markdown is the record. */
export function parseReviewOutput(kind: "reconcile" | "qa", output: string): { sections: ReviewSection[]; verdict?: ReviewDetail["verdict"] } {
  const heads = [...output.matchAll(/^###[ \t]+(.+?)[ \t]*$/gm)];
  const known = REVIEW_SECTIONS[kind];
  const sections = heads.map((head, i) => {
    const start = (head.index ?? 0) + head[0].length;
    const end = i + 1 < heads.length ? heads[i + 1].index ?? output.length : output.length;
    const heading = head[1].replace(/[*_:`]/g, "").trim();
    const match = known.find(section => heading.toLowerCase().startsWith(section.heading.toLowerCase()));
    return { key: match?.key ?? heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), heading: match?.heading ?? heading, recognized: !!match, text: output.slice(start, end).trim() };
  });
  let verdict: ReviewDetail["verdict"];
  if (kind === "qa") {
    const found = /\*\*Verdict:?\*\*:?[ \t]*(PASS WITH FIXES|NEEDS WORK|PASS)/i.exec(output);
    if (found) verdict = found[1].toUpperCase() as ReviewDetail["verdict"];
  }
  return { sections, verdict };
}

/* ------------------------------------------------------------------ builder */
export function buildMissionWorktree(input: WorktreeInput): MissionWorktree {
  const { job } = input;
  const jobId = job.id;
  const steps = job.steps ?? [];
  const idCounts = new Map<string, number>();
  for (const step of steps) idCounts.set(step.id, (idCounts.get(step.id) ?? 0) + 1);
  const stepEntityId = steps.map((step, index) => (idCounts.get(step.id) === 1 ? `step:${jobId}/${step.id}` : `step:${jobId}/${step.id}#${index + 1}`));
  const missionEntityId = `mission:${jobId}`;
  const phaseEntityId = (key: PhaseKey) => `phase:${jobId}/${key}`;
  const relations: Relation[] = [];

  /* dependencies: through the existing id resolver; anything not uniquely resolvable becomes an issue, never a guess */
  const graph = resolveStepDependencies(steps.map(step => step.id), steps.map(step => ({ id: step.id, dependsOn: step.dependsOn })));
  const prerequisites = steps.map(() => [] as string[]);
  const dependents = steps.map(() => [] as string[]);
  for (const edge of graph.edges) {
    prerequisites[edge.to - 1].push(stepEntityId[edge.from - 1]);
    dependents[edge.from - 1].push(stepEntityId[edge.to - 1]);
    relations.push({ kind: "dependency", from: stepEntityId[edge.from - 1], to: stepEntityId[edge.to - 1], reference: edge.reference });
  }
  const issues = steps.map(() => [] as DependencyIssue[]);
  for (const finding of graph.findings) {
    if (finding.ordinal < 1 || (finding.kind !== "malformed" && finding.kind !== "self-reference" && finding.kind !== "unresolved" && finding.kind !== "ambiguous")) continue;
    const candidates = finding.kind === "ambiguous" ? steps.flatMap((step, i) => (step.id === finding.reference ? [stepEntityId[i]] : [])) : undefined;
    issues[finding.ordinal - 1].push({ kind: finding.kind, ...(finding.reference !== undefined ? { reference: finding.reference } : {}), detail: finding.detail, ...(candidates ? { candidateStepIds: candidates } : {}) });
  }

  /* sources: ALL of them (dossier first, then the research step's own list, the same order coreState uses) */
  const researchIndex = steps.findIndex(step => step.kind === "research");
  const researchStep = researchIndex >= 0 ? steps[researchIndex] : undefined;
  const sourceOrigin: Source["origin"] | undefined = job.dossierSnapshot?.sources ? "dossier" : researchStep?.sources ? "research-step" : undefined;
  const rawSources = job.dossierSnapshot?.sources ?? researchStep?.sources ?? [];
  const researchOutput = text(researchStep?.output);
  const findings = researchOutput ? parseResearchFindings(researchOutput) : [];
  const sources: Source[] = rawSources.map((source, i) => ({
    id: `source:${jobId}/${i + 1}`, entityKind: "source", missionId: missionEntityId, index: i + 1, title: source.title, uri: source.uri, origin: sourceOrigin ?? "dossier",
    ...(researchIndex >= 0 ? { ownerStepId: stepEntityId[researchIndex] } : {}),
    citedInFindings: findings.filter(finding => finding.markers.includes(i + 1)).map(finding => finding.index),
    provenance: { title: secondary(), uri: secondary(), index: derived("1-based position in the recorded source list"), citedInFindings: parsed("from inline [n] markers in the research markdown") },
  }));

  /* approvals & consultations: only this mission's; a step is attributed only when its recorded id is unique */
  const resolveStep = (ref: string) => (idCounts.get(ref) === 1 ? stepEntityId[steps.findIndex(step => step.id === ref)] : undefined);
  const approvals = input.approvals == null ? undefined : input.approvals.filter(item => item.jobId === jobId).map((item): Approval => ({
    id: `approval:${jobId}/${item.id}`, entityKind: "approval", missionId: missionEntityId, approvalId: item.id, stepRef: item.stepId, ...(resolveStep(item.stepId) ? { stepId: resolveStep(item.stepId) } : {}), stepLabel: item.stepLabel,
    toolName: item.toolName, args: item.args, status: item.status, createdAt: item.createdAt, ...(item.decidedAt ? { decidedAt: item.decidedAt } : {}), ...(item.decidedBy ? { decidedBy: item.decidedBy } : {}),
    provenance: { status: recorded(), toolName: recorded(), args: recorded(), stepId: resolveStep(item.stepId) ? derived("recorded step id resolved to exactly one step") : notRecorded("the recorded step id is not unique in this mission") },
  }));
  const consultations = input.consultations == null ? undefined : input.consultations.filter(item => item.jobId === jobId).map((item): Consultation => ({
    id: `consultation:${jobId}/${item.id}`, entityKind: "consultation", missionId: missionEntityId, consultationId: item.id, stepRef: item.stepId, ...(resolveStep(item.stepId) ? { stepId: resolveStep(item.stepId) } : {}), stepLabel: item.stepLabel,
    ...(item.departmentId ? { departmentRef: item.departmentId } : {}), question: item.question, ...(item.options ? { options: item.options } : {}), status: item.status,
    ...(item.answer ? { answer: item.answer } : {}), ...(item.redirectDirective ? { redirectDirective: item.redirectDirective } : {}), createdAt: item.createdAt, ...(item.answeredAt ? { answeredAt: item.answeredAt } : {}), ...(item.answeredBy ? { answeredBy: item.answeredBy } : {}),
    provenance: { status: recorded(), question: recorded(), stepId: resolveStep(item.stepId) ? derived("recorded step id resolved to exactly one step") : notRecorded("the recorded step id is not unique in this mission") },
  }));

  /* steps, outputs, usage */
  const outputs: Output[] = [];
  const usage: Usage[] = [];
  const questions = job.planSnapshot?.researchQuestions;
  const departmentKey = (step: JobStep) => (step.departmentId ? (step.departmentId === "meta-ads" ? step.departmentId : canonicalDepartmentId(step.departmentId)) : undefined);
  const worktreeSteps: Step[] = steps.map((step, index): Step => {
    const id = stepEntityId[index];
    const phase = PHASE_BY_KIND.get(step.kind);
    const records = step.usage ?? [];
    const usageIds = records.map((record, n) => {
      const usageId = `usage:${id}/${n + 1}`;
      const estimate = estimateCost(record);
      usage.push({
        id: usageId, entityKind: "usage", missionId: missionEntityId, stepId: id, provider: record.provider, model: record.model, inputTokens: record.inputTokens, outputTokens: record.outputTokens, durationMs: record.durationMs, timestamp: record.timestamp,
        estimate: { usd: estimate.usd, priced: estimate.known, basis: "static-price-table" }, billedCost: unavailable("Billed cost is not recorded; only token counts and a static-table estimate exist."),
        provenance: { tokens: secondary("provider-reported; may be null"), model: secondary(), estimate: derived("static price table, not billed cost"), billedCost: notRecorded() },
      });
      return usageId;
    });
    const out = text(step.output);
    let outputId: string | undefined;
    if (out) {
      outputId = `output:${id}`;
      outputs.push({ id: outputId, entityKind: "output", missionId: missionEntityId, ownerId: id, ownerKind: "step", format: "markdown", text: out, chars: out.length, provenance: { text: recorded() } });
    }
    const sourceIds = step.kind === "research" && index === researchIndex ? sources.map(source => source.id) : [];
    let research: ResearchDetail | undefined;
    if (step.kind === "research" && index === researchIndex) {
      const markers = [...new Set(findings.flatMap(finding => finding.markers))].sort((a, b) => a - b);
      research = {
        ...(questions ? { questions } : {}), findings, citationMarkers: markers, unresolvedMarkers: markers.filter(n => n > sources.length), sourceIds,
        verified: job.dossierSnapshot?.verified ?? job.verified, noSources: sources.length === 0 && step.status !== "pending" && step.status !== "active",
        claimSourceMapping: unavailable("Only inline [n] markers exist in the markdown; no structured claim-to-source mapping is recorded."),
        provenance: { questions: questions ? secondary("planSnapshot.researchQuestions") : notRecorded("no plan snapshot"), findings: parsed("from the research markdown"), citationMarkers: parsed("inline [n] markers"), sources: secondary("dossier / research step"), verified: recorded() },
      };
    }
    let review: ReviewDetail | undefined;
    if ((step.kind === "reconcile" || step.kind === "qa") && out) {
      const result = parseReviewOutput(step.kind, out);
      review = { sections: result.sections, ...(result.verdict ? { verdict: result.verdict } : {}), provenance: { sections: parsed("prompted ### headings in the raw markdown; not typed findings"), ...(result.verdict ? { verdict: parsed("from the **Verdict:** line") } : {}) } };
    }
    const executions = (step.instructionExecutions ?? []).map(execution => ({ phase: execution.phase, provider: execution.provider, requestedModel: execution.requestedModel, createdAt: execution.createdAt }));
    // Department membership follows the RECORDED departmentId whatever the step's kind is.
    const departmentId = departmentKey(step) ? `department:${jobId}/${departmentKey(step)}` : undefined;
    const result: Step = {
      id, entityKind: "step", missionId: missionEntityId, recordedId: step.id, idUnique: idCounts.get(step.id) === 1, ordinal: index + 1, kind: step.kind, kindKnown: !!phase,
      ...(phase ? { phaseId: phaseEntityId(phase.key), phaseKey: phase.key } : {}), ...(departmentId ? { departmentId } : {}),
      label: step.label, activity: step.activity, status: step.status, percent: step.percent, weight: step.weight,
      ...(step.startedAt ? { startedAt: step.startedAt } : {}), ...(step.finishedAt ? { finishedAt: step.finishedAt } : {}), ...(step.provider ? { provider: step.provider } : {}), ...(step.runtimeRouteId ? { runtimeRouteId: step.runtimeRouteId } : {}),
      ...(step.error ? { error: step.error } : {}), ...(outputId ? { outputId } : {}), sourceIds, usageIds, ...(usageTotals(records) ? { usageTotals: usageTotals(records) } : {}),
      ...(step.instructionsHash || executions.length ? { instruction: { ...(step.instructionsHash ? { hash: step.instructionsHash } : {}), executions } } : {}),
      dependencies: { prerequisiteIds: prerequisites[index], dependentIds: dependents[index], issues: issues[index] },
      approvalIds: (approvals ?? []).filter(item => item.stepId === id).map(item => item.id), consultationIds: (consultations ?? []).filter(item => item.stepId === id).map(item => item.id),
      execution: { recordedStatus: step.status, recordedActive: step.status === "active", executorEvidence: { ...unavailable("Per-step executor evidence is not recorded; Mission-level executor evidence is not extended to steps.") } },
      ...(research ? { research } : {}), ...(review ? { review } : {}),
      provenance: {
        phase: phase ? derived("from the recorded step kind") : notRecorded("the recorded step kind is not a canonical phase kind; no phase is assumed"),
        status: recorded("recorded, not proof of live execution"), percent: recorded(), activity: recorded("latest value; not a history"),
        timestamps: step.startedAt || step.finishedAt ? recorded() : notRecorded("no start/finish recorded"),
        provider: step.provider ? recorded() : notRecorded(step.kind === "brief" || step.kind === "research" ? "this step records no provider" : undefined),
        usage: records.length ? secondary("per-call records on the job") : notRecorded("no usage records for this step"),
        output: out ? recorded() : notRecorded(), error: step.error ? recorded() : notRecorded(),
        dependencies: recorded("dependsOn resolved by step id; unresolved or ambiguous references are listed as issues"),
        executorEvidence: notRecorded("no per-step executor evidence exists"),
      },
    };
    return result;
  });

  /* phases (recorded ones only, canonical order) */
  const stepsOfPhase = (key: PhaseKey) => worktreeSteps.filter(step => step.phaseKey === key);
  const phases: PipelinePhase[] = [];
  PHASE_DEFINITIONS.forEach((definition, position) => {
    const members = stepsOfPhase(definition.key);
    if (!members.length) return;
    const statusCounts: Partial<Record<StepStatus, number>> = {};
    for (const step of members) statusCounts[step.status] = (statusCounts[step.status] ?? 0) + 1;
    const kinds = Object.keys(statusCounts) as StepStatus[];
    const status: PipelinePhase["status"] = statusCounts.error ? "error" : statusCounts.active ? "active" : kinds.length === 1 ? kinds[0] : "mixed";
    const memberIds = new Set(members.map(step => step.id));
    const dependsOnPhaseIds = [...new Set(members.flatMap(step => step.dependencies.prerequisiteIds).filter(id => !memberIds.has(id)).map(id => worktreeSteps.find(step => step.id === id)?.phaseId).filter((id): id is string => !!id))];
    let parallel: PipelinePhase["parallel"];
    if (definition.key === "departments") {
      const edgeBetween = relations.some(relation => relation.kind === "dependency" && memberIds.has(relation.from) && memberIds.has(relation.to));
      parallel = members.length === 1 ? { state: "single", evidence: "One department step is recorded." } : edgeBetween ? { state: "not-parallel", evidence: "A department step records a dependency on another department step." } : { state: "parallel", evidence: "No department step records a dependency on another department step." };
    }
    phases.push({
      id: phaseEntityId(definition.key), entityKind: "phase", missionId: missionEntityId, key: definition.key, label: definition.label, order: position + 1, stepIds: members.map(step => step.id), multiple: members.length > 1 && definition.key !== "departments",
      status, statusCounts, ...(members.length === 1 ? { recordedPercent: members[0].percent } : {}),
      ...(earliest(members.map(step => step.startedAt)) ? { startedAt: earliest(members.map(step => step.startedAt)) } : {}),
      ...(members.every(step => step.finishedAt) && latest(members.map(step => step.finishedAt)) ? { finishedAt: latest(members.map(step => step.finishedAt)) } : {}),
      dependsOnPhaseIds, ...(parallel ? { parallel } : {}),
      provenance: { membership: derived("from the recorded step kinds"), status: derived("aggregated from member step statuses"), recordedPercent: members.length === 1 ? recorded() : notRecorded("a phase has no recorded percent of its own"), dependsOnPhaseIds: derived("from resolved step dependencies"), ...(parallel ? { parallel: derived("from recorded dependencies between department steps") } : {}) },
    });
  });
  const missingPhaseKeys = CANONICAL_PHASE_ORDER.filter(key => !phases.some(phase => phase.key === key));

  /* departments: derived from assignments + department steps, scoped to this mission */
  const assignments = job.planSnapshot?.assignments ?? [];
  const keyOf = (id: string | undefined) => (id ? (id === "meta-ads" ? id : canonicalDepartmentId(id)) : undefined);
  const departmentOrder: string[] = [];
  const noteDepartment = (key: string | undefined) => { if (key && !departmentOrder.includes(key)) departmentOrder.push(key); };
  assignments.forEach(assignment => noteDepartment(keyOf(assignment.runtimeRouteId ?? assignment.departmentId)));
  steps.forEach(step => noteDepartment(departmentKey(step)));
  const departments: Department[] = departmentOrder.map((key): Department => {
    const mine = assignments.filter(assignment => keyOf(assignment.runtimeRouteId ?? assignment.departmentId) === key);
    const stepIds = worktreeSteps.filter(step => step.departmentId === `department:${jobId}/${key}`).map(step => step.id);
    const rec = mine.find(assignment => assignment.vaultRecommendation)?.vaultRecommendation;
    return {
      id: `department:${jobId}/${key}`, entityKind: "department", missionId: missionEntityId, canonicalId: key, name: departmentScopeLabel(key), ...(key === "meta-ads" ? { legacyRoute: "meta-ads" } : {}),
      origin: { assignment: mine.length > 0, step: stepIds.length > 0 },
      assignments: mine.map(assignment => ({ task: assignment.task, ...(assignment.activity ? { activity: assignment.activity } : {}), ...(assignment.stepId ? { stepRef: assignment.stepId } : {}), ...(assignment.runtimeRouteId ? { runtimeRouteId: assignment.runtimeRouteId } : {}) })),
      ...(rec ? { specialistRecommendation: { name: rec.selectedAgentName, category: rec.selectedAgentCategory, band: rec.band, confidence: rec.confidence } } : {}),
      stepIds,
      provenance: { identity: derived("from the department taxonomy; departments are not persisted mission entities"), assignments: mine.length ? secondary("planSnapshot.assignments") : notRecorded("no plan assignment for this department"), stepIds: derived("steps whose recorded departmentId resolves to this department, whatever their kind"), specialistRecommendation: rec ? secondary("a recommendation recorded at planning time, not proof the specialist ran") : notRecorded() },
    };
  });

  /* relations: containment kinds are kept apart from dependency */
  const mission: Mission = {
    id: missionEntityId, entityKind: "mission", missionId: missionEntityId, title: job.title, brief: job.brief, status: job.status, percent: job.percent, verified: job.verified,
    createdAt: job.createdAt, updatedAt: job.updatedAt, ...(job.finishedAt ? { finishedAt: job.finishedAt } : {}), ...(job.createdBy ? { createdBy: job.createdBy } : {}),
    ...(job.approvedAt ? { approvedAt: job.approvedAt } : {}), ...(job.approvedBy ? { approvedBy: job.approvedBy } : {}), ...(job.error ? { error: job.error } : {}),
    media: (job.media ?? []).map(item => ({ type: item.type, url: item.url, ...(item.label ? { label: item.label } : {}) })),
    lineage: { ...(job.rerunOf ? { rerunOf: job.rerunOf } : {}), ...(job.instructionReplayMode ? { replayMode: job.instructionReplayMode } : {}) },
    requestedChanges: (job.revisions ?? []).map(revision => ({ id: revision.id, message: revision.message, createdAt: revision.createdAt, effect: revision.effect, ...(revision.redoneSteps ? { redoneSteps: revision.redoneSteps } : {}) })),
    liveNotes: [...(job.liveNotes ?? [])],
    execution: ((): MissionExecution => {
      const liveEvidence = missionLiveEvidence(job.status === "running" ? "running" : "completed", jobId, input.executor ? { executingNow: { missionIds: [...input.executor.missionIds], agentIds: [], confirmable: input.executor.confirmable } } : null);
      return { recordedStatus: job.status, recordedActiveStepIds: worktreeSteps.filter(step => step.status === "active").map(step => step.id), liveEvidence, liveConfirmed: liveEvidence === "confirmed" };
    })(),
    ...(usageTotals(steps.flatMap(step => step.usage ?? [])) ? { usage: usageTotals(steps.flatMap(step => step.usage ?? [])) } : {}),
    billedCost: unavailable("Billed cost is not recorded."),
    history: { eventTimeline: unavailable("No durable event timeline is recorded; the job is mutated in place."), revisionHistory: unavailable("Revisions overwrite steps in place; earlier revision states are not recorded.") },
    unphasedStepIds: worktreeSteps.filter(step => !step.phaseKey).map(step => step.id),
    provenance: {
      status: recorded(), percent: recorded(), brief: recorded(), requestedChanges: recorded("job.revisions entries, not a state history"), liveNotes: recorded("bare strings; no timestamps"),
      liveExecution: derived("executor confirmation from the overview snapshot; independent of the recorded status"), usage: secondary("summed from per-step records; may be partial"), billedCost: notRecorded(), lineage: recorded(),
    },
  };
  const finalOutput = text(job.finalOutput);
  if (finalOutput) {
    const finalId = `output:${missionEntityId}/final`;
    outputs.push({ id: finalId, entityKind: "output", missionId: missionEntityId, ownerId: missionEntityId, ownerKind: "mission", format: "markdown", text: finalOutput, chars: finalOutput.length, provenance: { text: recorded() } });
    mission.finalOutputId = finalId;
  }
  phases.forEach(phase => relations.push({ kind: "ownership", from: missionEntityId, to: phase.id }));
  departments.forEach(department => relations.push({ kind: "ownership", from: missionEntityId, to: department.id }));
  worktreeSteps.forEach(step => {
    relations.push({ kind: "ownership", from: missionEntityId, to: step.id });
    if (step.phaseId) relations.push({ kind: "phase-membership", from: step.phaseId, to: step.id });
    if (step.departmentId) relations.push({ kind: "department-membership", from: step.departmentId, to: step.id });
    step.sourceIds.forEach(sourceId => relations.push({ kind: "recorded-evidence", from: step.id, to: sourceId }));
  });

  return { missionId: jobId, mission, canonicalPhaseOrder: CANONICAL_PHASE_ORDER, phases, missingPhaseKeys, departments, steps: worktreeSteps, outputs, sources, usage, ...(approvals ? { approvals } : {}), ...(consultations ? { consultations } : {}), relations };
}

/* ------------------------------------------------------------------ questions the UI must be able to ask without inference */
export function worktreeQueries(worktree: MissionWorktree) {
  const entities = new Map<string, WorktreeEntity>();
  [worktree.mission, ...worktree.phases, ...worktree.departments, ...worktree.steps, ...worktree.outputs, ...worktree.sources, ...worktree.usage, ...(worktree.approvals ?? []), ...(worktree.consultations ?? [])].forEach(entity => entities.set(entity.id, entity));
  const stepOf = (id: string) => worktree.steps.find(step => step.id === id);
  const phaseByKey = (key: PhaseKey) => worktree.phases.find(phase => phase.key === key);
  const uniqueStepIds = (ids: string[]) => [...new Set(ids)];
  return {
    entity: (id: string) => entities.get(id),
    /** Which Mission owns this entity. */
    ownerOf: (id: string) => entities.get(id)?.missionId,
    /** Which phase contains this step. */
    phaseOf: (stepId: string) => { const phaseId = stepOf(stepId)?.phaseId; return phaseId ? (entities.get(phaseId) as PipelinePhase | undefined) : undefined; },
    /** Which department owns this department step. */
    departmentOf: (stepId: string) => { const departmentId = stepOf(stepId)?.departmentId; return departmentId ? (entities.get(departmentId) as Department | undefined) : undefined; },
    /** What this step depends on / what depends on it (resolved edges only; see Step.dependencies.issues for the rest). */
    prerequisites: (stepId: string) => (stepOf(stepId)?.dependencies.prerequisiteIds ?? []).map(id => stepOf(id)!).filter(Boolean),
    dependents: (stepId: string) => (stepOf(stepId)?.dependencies.dependentIds ?? []).map(id => stepOf(id)!).filter(Boolean),
    /** What feeds a phase: the resolved prerequisites of its steps that live outside it (Team Review <- the department steps; QA <- Team Review; Final Plan <- QA). */
    feeds: (key: PhaseKey) => { const phase = phaseByKey(key); if (!phase) return []; const inside = new Set(phase.stepIds); return uniqueStepIds(phase.stepIds.flatMap(id => stepOf(id)?.dependencies.prerequisiteIds ?? []).filter(id => !inside.has(id))).map(id => stepOf(id)!).filter(Boolean); },
    /** What waits on a phase. */
    consumers: (key: PhaseKey) => { const phase = phaseByKey(key); if (!phase) return []; const inside = new Set(phase.stepIds); return uniqueStepIds(phase.stepIds.flatMap(id => stepOf(id)?.dependencies.dependentIds ?? []).filter(id => !inside.has(id))).map(id => stepOf(id)!).filter(Boolean); },
    relations: (kind?: RelationKind) => worktree.relations.filter(relation => !kind || relation.kind === kind),
  };
}
