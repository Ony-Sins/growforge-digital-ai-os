/**
 * Step -> step dependencies, from the RECORDED `dependsOn` lists only.
 *
 * `dependsOn` is a list of step ids on the raw job record (it is not on the Core step view). Recorded step ids are NOT unique inside a
 * mission (reruns reuse ids such as `dept:sales-bd`), so a reference is resolved only when it names exactly ONE recorded step. Anything
 * else is omitted and reported as a finding. Nothing is guessed: no "nearest earlier step", no inference from kinds or departments.
 *
 * Direction: an edge runs from the PREREQUISITE (the step that is depended on) to the DEPENDENT (the step that records the dependsOn).
 */
export interface RawStepDependencies { id: unknown; dependsOn: unknown }

export type DependencyFindingKind = "unavailable" | "record-mismatch" | "malformed" | "self-reference" | "unresolved" | "ambiguous";

export interface DependencyFinding {
  kind: DependencyFindingKind;
  /** 1-based position (in job.steps order) of the step that records the dependency; 0 when the finding is about the whole record. */
  ordinal: number;
  reference?: string;
  detail: string;
}

export interface StepDependency {
  /** Ordinal of the prerequisite (the step that is depended on). */
  from: number;
  /** Ordinal of the dependent (the step whose dependsOn names the prerequisite). */
  to: number;
  /** The recorded id string that was resolved. */
  reference: string;
}

export interface DependencyGraph { edges: StepDependency[]; findings: DependencyFinding[] }

/**
 * `coreIds` are the Core view's step ids in order; `raw` is the raw record's steps (id + dependsOn) in order, or null when the raw record
 * could not be read. The two lists must align one-to-one by position and id, otherwise no dependency is trusted.
 */
export function resolveStepDependencies(coreIds: readonly string[], raw: readonly RawStepDependencies[] | null): DependencyGraph {
  if (!raw) return { edges: [], findings: [{ kind: "unavailable", ordinal: 0, detail: "The raw job record could not be read, so no dependency is shown." }] };
  if (raw.length !== coreIds.length || raw.some((step, index) => step?.id !== coreIds[index])) {
    return { edges: [], findings: [{ kind: "record-mismatch", ordinal: 0, detail: `The raw record has ${raw.length} steps and the Core view ${coreIds.length}, or their ids differ by position; dependencies cannot be aligned safely.` }] };
  }
  const indicesById = new Map<string, number[]>();
  coreIds.forEach((id, index) => indicesById.set(id, [...(indicesById.get(id) ?? []), index]));
  const edges: StepDependency[] = [];
  const findings: DependencyFinding[] = [];
  raw.forEach((step, index) => {
    const ordinal = index + 1;
    if (!Array.isArray(step.dependsOn)) { findings.push({ kind: "malformed", ordinal, detail: `dependsOn is ${step.dependsOn === undefined ? "missing" : typeof step.dependsOn}, not a list.` }); return; }
    const seen = new Set<string>();
    for (const reference of step.dependsOn as unknown[]) {
      if (typeof reference !== "string" || !reference.trim()) { findings.push({ kind: "malformed", ordinal, detail: "dependsOn contains an entry that is not a step id string." }); continue; }
      if (seen.has(reference)) continue;
      seen.add(reference);
      if (reference === coreIds[index]) { findings.push({ kind: "self-reference", ordinal, reference, detail: "The step records a dependency on its own id." }); continue; }
      const targets = indicesById.get(reference) ?? [];
      if (targets.length === 0) findings.push({ kind: "unresolved", ordinal, reference, detail: `No recorded step has the id "${reference}".` });
      else if (targets.length > 1) findings.push({ kind: "ambiguous", ordinal, reference, detail: `${targets.length} recorded steps share the id "${reference}" (reruns reuse ids), so which one is meant cannot be told.` });
      else edges.push({ from: targets[0] + 1, to: ordinal, reference });
    }
  });
  return { edges, findings };
}
