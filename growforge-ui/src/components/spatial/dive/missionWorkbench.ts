import type { Department, MissionWorktree, PipelinePhase, Provenance, Step } from "./missionWorktree";
import { ambiguityNodeId, isAmbiguityId, isKnownEntity, issuesOfNode, stepsOfNode } from "./missionWorktreeAncestry";

/**
 * Workbench depth + capability contract (W5.1). Logic only: no geometry, no rendering.
 *
 * Inspection depth is NOT entity selection. The canonical selection (missionWorktreeSelection) owns WHICH entity; `InspectionDepth` says how deeply it is being
 * inspected (`peek` -> `workbench`; `focus` belongs to W6). The Workbench always belongs to that one selection and addresses the entity by its W1 id.
 *
 * The registry answers "what can actually be inspected for this entity?" from the canonical W1 data. Every known capability has an explicit state, so a missing
 * record is never confused with an empty one and no count is invented:
 *   available       recorded and readable
 *   derived         computed from other recorded facts (labelled Derived)
 *   parsed          parsed from recorded text (labelled Parsed from text)
 *   recorded-empty  the record exists and says "none" (an empty list, a read that succeeded with no rows)
 *   unavailable     not recorded, or could not be read; `reason` says why
 * `visible` is what a surface may show: available / derived / parsed always; recorded-empty only when the emptiness is itself a fact worth telling (e.g. a
 * research step that recorded no sources); unavailable never (a surface must not draw empty sections for symmetry).
 */
/** `focus` (W6.1) is the third depth, the full-reading depth: Peek -> Workbench -> Focus. Same selected entity at every depth. */
export type InspectionDepth = "peek" | "workbench" | "focus";

export type WorkbenchSectionId =
  | "overview" | "execution" | "dependencies" | "questions" | "findings" | "sources" | "inputs" | "review" | "qa" | "output" | "evidence" | "usage"
  | "approvals" | "consultations" | "requestedChanges" | "lineage" | "history" | "assignment" | "steps" | "problem" | "references" | "candidates";

export type CapabilityState = "available" | "derived" | "parsed" | "recorded-empty" | "unavailable";
export interface WorkbenchCapability {
  id: WorkbenchSectionId;
  label: string;
  state: CapabilityState;
  visible: boolean;
  /** How many recorded items the section would hold, ONLY when the record gives a number (never a fabricated zero). */
  count?: number;
  /** Why the section is unavailable / empty, or a truth note the surface must carry (e.g. "planning recommendation, not execution proof"). */
  reason?: string;
  /** The W1 provenance label the section's content carries. */
  provenance?: Provenance["label"];
  /** The section's richer content comes from a W1 class-B read (plan snapshot, dossier, per-call usage). Already on the job; no new fetch is implied. */
  secondaryRead?: string;
}
export type WorkbenchProfile = "mission" | "research" | "department" | "step" | "review" | "qa" | "departments-phase" | "ambiguity";
export interface WorkbenchCapabilitySet {
  entityId: string;
  profile: WorkbenchProfile;
  /** Deterministic; never depends on viewport or layout. */
  defaultSection: WorkbenchSectionId;
  /** Every capability the registry knows for this kind of entity, including unavailable ones (with their reason). */
  capabilities: WorkbenchCapability[];
  /** The sections a surface may show, in order. Always contains `defaultSection`. */
  sections: WorkbenchCapability[];
}

const SECTION_LABEL: Record<WorkbenchSectionId, string> = {
  overview: "Overview", execution: "Execution", dependencies: "Dependencies", questions: "Questions", findings: "Findings", sources: "Sources", inputs: "Inputs", review: "Review",
  qa: "QA", output: "Output", evidence: "Evidence", usage: "Usage", approvals: "Approvals", consultations: "Consultations", requestedChanges: "Requested changes", lineage: "Lineage",
  history: "History", assignment: "Assignment", steps: "Steps", problem: "Problem", references: "References", candidates: "Candidate identities",
};
export const workbenchSectionLabel = (id: WorkbenchSectionId) => SECTION_LABEL[id];

const SHOWN: readonly CapabilityState[] = ["available", "derived", "parsed"];
function cap(id: WorkbenchSectionId, state: CapabilityState, extra: Partial<Pick<WorkbenchCapability, "count" | "reason" | "provenance" | "secondaryRead">> & { showEmpty?: boolean } = {}): WorkbenchCapability {
  const { showEmpty, ...rest } = extra;
  return { id, label: SECTION_LABEL[id], state, visible: SHOWN.includes(state) || (state === "recorded-empty" && !!showEmpty), ...rest };
}
const OVERVIEW = () => cap("overview", "available", { provenance: "Recorded" });
/** C7F: the Overview is a summary; timing, state and executor facts live in Execution, for every work item. */
const EXECUTION_STEP = () => cap("execution", "available", { provenance: "Recorded", reason: "Recorded status and timing; per-step executor evidence is not recorded." });
const secondaryOf = (p?: Provenance) => (p?.class === "B" ? p.note ?? "recorded on the job" : undefined);
const present = (n: number, id: WorkbenchSectionId, extra: Parameters<typeof cap>[2] = {}) => cap(id, n > 0 ? "available" : "recorded-empty", { count: n, ...extra });

function usageCap(steps: Step[], secondary?: Provenance): WorkbenchCapability {
  const totals = steps.map(s => s.usageTotals).filter((t): t is NonNullable<Step["usageTotals"]> => !!t);
  return totals.length
    ? cap("usage", "available", { count: totals.reduce((n, t) => n + t.calls, 0), provenance: "Recorded", secondaryRead: secondaryOf(secondary) ?? "per-call records on the job" })
    : cap("usage", "unavailable", { reason: "No usage records for this work." });
}
function dependenciesCap(steps: Step[]): WorkbenchCapability {
  const inside = new Set(steps.map(s => s.id));
  const refs = steps.flatMap(s => [...s.dependencies.prerequisiteIds, ...s.dependencies.dependentIds]).filter(id => !inside.has(id));
  const issues = steps.flatMap(s => s.dependencies.issues);
  if (!steps.length) return cap("dependencies", "unavailable", { reason: "No recorded step carries dependencies." });
  return refs.length || issues.length
    ? cap("dependencies", "available", { count: new Set(refs).size, provenance: "Recorded", ...(issues.length ? { reason: `${issues.length} reference${issues.length === 1 ? "" : "s"} could not be resolved uniquely or at all` } : {}) })
    : cap("dependencies", "recorded-empty", { reason: "The record lists no dependencies." });
}
function outputCap(steps: Step[]): WorkbenchCapability {
  const n = steps.filter(s => !!s.outputId).length;
  return n ? cap("output", "available", { count: n, provenance: "Recorded" }) : cap("output", "unavailable", { reason: "No output is recorded for this work." });
}
function approvalsCap(worktree: MissionWorktree, steps: Step[] | null): WorkbenchCapability {
  // Mission level (C1b.1): the final plan's approval state is the job's own record, independent of the tool-approvals read. While a final plan or a plan approval is recorded the section
  // exists even with zero tool approvals or an unreadable approvals list, so the plan decision is never unreachable; the tool part says what it could not read.
  if (!steps && (worktree.mission.approvedAt || worktree.mission.finalOutputId)) {
    const tools = worktree.approvals?.length ?? 0;
    return cap("approvals", "available", { provenance: "Recorded", ...(tools ? { count: tools } : {}), ...(worktree.approvals ? {} : { reason: "Tool approvals could not be read." }) });
  }
  if (!worktree.approvals) return cap("approvals", "unavailable", { reason: "Approvals could not be read." });
  const n = steps ? steps.reduce((c, s) => c + s.approvalIds.length, 0) : worktree.approvals.length;
  return present(n, "approvals", { provenance: "Recorded" });
}
function consultationsCap(worktree: MissionWorktree, steps: Step[] | null): WorkbenchCapability {
  if (!worktree.consultations) return cap("consultations", "unavailable", { reason: "Consultations could not be read." });
  const n = steps ? steps.reduce((c, s) => c + s.consultationIds.length, 0) : worktree.consultations.length;
  return present(n, "consultations", { provenance: "Recorded" });
}

function profileOf(worktree: MissionWorktree, id: string): WorkbenchProfile | null {
  if (isAmbiguityId(id)) return "ambiguity";
  if (id === worktree.mission.id) return "mission";
  const phase = worktree.phases.find(p => p.id === id);
  if (phase) return phase.key === "live-research" ? "research" : phase.key === "team-review" ? "review" : phase.key === "qa" ? "qa" : phase.key === "departments" ? "departments-phase" : "step";
  if (worktree.departments.some(d => d.id === id)) return "department";
  return worktree.steps.some(s => s.id === id) ? "step" : null;
}

function missionCaps(worktree: MissionWorktree): WorkbenchCapability[] {
  const m = worktree.mission;
  const outputs = (m.finalOutputId ? 1 : 0) + m.media.length;
  return [
    OVERVIEW(),
    cap("execution", "available", { provenance: "Recorded", reason: "Recorded status; executor confirmation is separate." }),
    outputs ? cap("output", "available", { count: outputs, provenance: "Recorded" }) : cap("output", "unavailable", { reason: "No final output or media is recorded." }),
    m.usage ? cap("usage", "available", { count: m.usage.calls, provenance: "Recorded", secondaryRead: "summed from per-step records; may be partial" }) : cap("usage", "unavailable", { reason: "No usage records for this mission." }),
    approvalsCap(worktree, null),
    consultationsCap(worktree, null),
    // C1b.2: the mission-level Requested changes section is the home of "Request a change", so it stays reachable with zero recorded changes (it then says none is recorded; the state stays recorded-empty).
    present(m.requestedChanges.length, "requestedChanges", { provenance: "Recorded", showEmpty: true }),
    m.lineage.rerunOf || m.lineage.replayMode ? cap("lineage", "available", { provenance: "Recorded" }) : cap("lineage", "recorded-empty", { reason: "Not a rerun or replay." }),
    cap("history", "unavailable", { reason: m.history.eventTimeline.reason }),
  ];
}

function researchCaps(worktree: MissionWorktree, phase: PipelinePhase): WorkbenchCapability[] {
  const steps = stepsOfNode(worktree, phase.id);
  const details = steps.map(s => s.research).filter((r): r is NonNullable<Step["research"]> => !!r);
  const questions = details.find(r => r.questions)?.questions;
  const findings = details.reduce((n, r) => n + r.findings.length, 0);
  const sources = details.reduce((n, r) => n + r.sourceIds.length, 0);
  const noSources = details.some(r => r.noSources);
  const prov = details[0]?.provenance;
  return [
    OVERVIEW(),
    questions ? cap("questions", "available", { count: questions.length, provenance: "Recorded", secondaryRead: secondaryOf(prov?.questions) }) : cap("questions", "unavailable", { reason: prov?.questions?.note ?? "No plan snapshot, so research questions are not recorded." }),
    findings ? cap("findings", "parsed", { count: findings, provenance: "Parsed from text" }) : cap("findings", "unavailable", { reason: "No findings could be parsed from the recorded research output." }),
    sources ? cap("sources", "available", { count: sources, provenance: "Recorded", secondaryRead: secondaryOf(prov?.sources) })
      : noSources ? cap("sources", "recorded-empty", { reason: "No source was recorded for this research step.", showEmpty: true }) : cap("sources", "unavailable", { reason: "Research has not recorded sources yet." }),
    EXECUTION_STEP(),
    outputCap(steps),
    usageCap(steps, steps[0]?.provenance.usage),
    dependenciesCap(steps),
  ];
}

/** Inputs are the RESOLVED prerequisites. With none resolved the section stays inspectable only when recorded references could not be resolved (it then explains that, and offers the ambiguity explanation). */
function inputsCap(steps: Step[], deps: string[], reason: string): WorkbenchCapability {
  if (deps.length) return cap("inputs", "derived", { count: new Set(deps).size, provenance: "Derived", reason });
  const unresolved = steps.reduce((n, s) => n + s.dependencies.issues.length, 0);
  return unresolved ? cap("inputs", "derived", { provenance: "Derived", reason: `No resolved input; ${unresolved} recorded reference${unresolved === 1 ? "" : "s"} could not be resolved uniquely.` }) : cap("inputs", "unavailable", { reason: "No recorded dependencies, so no inputs are known." });
}

function reviewCaps(worktree: MissionWorktree, phase: PipelinePhase): WorkbenchCapability[] {
  const steps = stepsOfNode(worktree, phase.id);
  const sections = steps.reduce((n, s) => n + (s.review?.sections.length ?? 0), 0);
  const deps = steps.flatMap(s => s.dependencies.prerequisiteIds);
  return [
    OVERVIEW(),
    inputsCap(steps, deps, "The steps this review depends on."),
    EXECUTION_STEP(),
    sections ? cap("review", "parsed", { count: sections, provenance: "Parsed from text", reason: "Prompted sections parsed from the review markdown; not typed findings." }) : cap("review", "unavailable", { reason: "No review sections could be parsed from the recorded output." }),
    outputCap(steps),
    usageCap(steps, steps[0]?.provenance.usage),
  ];
}

function qaCaps(worktree: MissionWorktree, phase: PipelinePhase): WorkbenchCapability[] {
  const steps = stepsOfNode(worktree, phase.id);
  const verdict = steps.some(s => !!s.review?.verdict);
  const deps = steps.flatMap(s => s.dependencies.prerequisiteIds);
  return [
    OVERVIEW(),
    inputsCap(steps, deps, "The steps QA depends on."),
    EXECUTION_STEP(),
    verdict ? cap("qa", "parsed", { provenance: "Parsed from text", reason: "Verdict parsed from the explicit Verdict line." }) : cap("qa", "unavailable", { reason: "The recorded output has no explicit Verdict line." }),
    outputCap(steps),
    usageCap(steps, steps[0]?.provenance.usage),
  ];
}

function stepCaps(worktree: MissionWorktree, steps: Step[]): WorkbenchCapability[] {
  return [
    OVERVIEW(),
    cap("execution", "available", { provenance: "Recorded", reason: "Recorded status; per-step executor evidence is not recorded." }),
    dependenciesCap(steps),
    outputCap(steps),
    usageCap(steps, steps[0]?.provenance.usage),
    approvalsCap(worktree, steps),
    consultationsCap(worktree, steps),
  ];
}

function departmentCaps(worktree: MissionWorktree, department: Department): WorkbenchCapability[] {
  const steps = stepsOfNode(worktree, department.id);
  return [
    OVERVIEW(),
    department.assignments.length
      ? cap("assignment", "available", { count: department.assignments.length, provenance: "Recorded", secondaryRead: secondaryOf(department.provenance.assignments), ...(department.specialistRecommendation ? { reason: "The specialist is a planning recommendation, not proof of execution." } : {}) })
      : cap("assignment", "unavailable", { reason: "No plan assignment is recorded for this department." }),
    steps.length ? cap("steps", "available", { count: steps.length, provenance: "Recorded" }) : cap("steps", "unavailable", { reason: "No recorded step belongs to this department." }),
    cap("execution", "derived", { provenance: "Derived", reason: "Derived from the department's recorded steps." }),
    (() => { const d = dependenciesCap(steps); return d.state === "available" ? { ...d, state: "derived" as const, provenance: "Derived" as const, reason: "Dependencies of the department's steps." } : d; })(),
    outputCap(steps),
    usageCap(steps, steps[0]?.provenance.usage),
  ];
}

function departmentsPhaseCaps(worktree: MissionWorktree, phase: PipelinePhase): WorkbenchCapability[] {
  return [
    OVERVIEW(),
    cap("execution", "derived", { provenance: "Derived", reason: phase.parallel?.evidence ?? "Aggregated from the member steps' recorded statuses." }),
    ...(() => { const u = usageCap(stepsOfNode(worktree, phase.id), undefined); return [u]; })(),
    phase.dependsOnPhaseIds.length ? cap("dependencies", "derived", { count: phase.dependsOnPhaseIds.length, provenance: "Derived" }) : cap("dependencies", "recorded-empty", { reason: "No resolved dependency on another phase." }),
  ];
}

function ambiguityCaps(worktree: MissionWorktree, id: string): WorkbenchCapability[] {
  const issues = issuesOfNode(worktree, ambiguityNodeId(id));
  const candidates = new Set(issues.flatMap(i => i.candidateStepIds ?? []));
  // Explanation context only: it has a problem, references and candidate identities, and nothing else (no Overview / Execution / Output).
  return [
    cap("problem", "derived", { provenance: "Derived", reason: "Why the dependency could not be resolved." }),
    issues.length ? cap("references", "available", { count: issues.length, provenance: "Recorded" }) : cap("references", "unavailable", { reason: "No unresolved reference is recorded." }),
    candidates.size ? cap("candidates", "derived", { count: candidates.size, provenance: "Derived", reason: "Every step carrying the id. None is chosen." }) : cap("candidates", "unavailable", { reason: "No candidate identities apply to this problem." }),
  ];
}

/** What can be inspected for this entity. null when the id is not an inspectable Worktree entity (nothing is guessed). */
export function workbenchCapabilities(worktree: MissionWorktree, entityId: string | null): WorkbenchCapabilitySet | null {
  if (!entityId || !isKnownEntity(worktree, entityId)) return null;
  const profile = profileOf(worktree, entityId);
  if (!profile) return null;
  const phase = worktree.phases.find(p => p.id === entityId);
  const capabilities =
    profile === "mission" ? missionCaps(worktree)
    : profile === "research" && phase ? researchCaps(worktree, phase)
    : profile === "review" && phase ? reviewCaps(worktree, phase)
    : profile === "qa" && phase ? qaCaps(worktree, phase)
    : profile === "departments-phase" && phase ? departmentsPhaseCaps(worktree, phase)
    : profile === "department" ? departmentCaps(worktree, worktree.departments.find(d => d.id === entityId)!)
    : profile === "ambiguity" ? ambiguityCaps(worktree, entityId)
    : stepCaps(worktree, stepsOfNode(worktree, entityId));
  const sections = capabilities.filter(c => c.visible);
  const defaultSection: WorkbenchSectionId = profile === "ambiguity" ? "problem" : "overview";
  return { entityId, profile, defaultSection, capabilities, sections };
}

export const hasSection = (set: WorkbenchCapabilitySet | null, id: WorkbenchSectionId | null | undefined) => !!set && !!id && set.sections.some(s => s.id === id);

/**
 * Which section is active after the entity (or its data) changed. Order: the section the user last chose for THIS entity (per-entity memory); else the section that
 * was active, if the new entity has it; else the entity's default. Never shows a section the entity does not have.
 */
export function settleSection(set: WorkbenchCapabilitySet | null, memory: Readonly<Record<string, WorkbenchSectionId>>, carried: WorkbenchSectionId | null): WorkbenchSectionId {
  if (!set) return "overview";
  const remembered = memory[set.entityId];
  if (hasSection(set, remembered)) return remembered;
  if (hasSection(set, carried)) return carried as WorkbenchSectionId;
  return set.defaultSection;
}
