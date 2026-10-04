import type { Agent } from "@/lib/agents";
import type { CoreState } from "@/lib/coreState";
import { departmentDisplayName } from "@/lib/departmentTaxonomy";

export const DIVE_LENSES = ["Overview", "Missions", "Departments", "Agents", "Workflows", "Context", "Tools", "Intelligence"] as const;
export type DiveLens = typeof DIVE_LENSES[number];
export interface DiveObject {
  id: string;
  name: string;
  kind: "system" | "mission" | "agent";
  status: string;
  context: string;
  evidence: string;
}

/** Only recorded running work enters the overview. Catalog presence is never activity. */
export function overviewObjects(core: CoreState | null, agents: Agent[]): DiveObject[] {
  return [
    { id: "executive_orchestration", name: departmentDisplayName("executive_orchestration"), kind: "system", status: core ? "Configured" : "Awaiting state", context: "The planning and reconciliation scope of the department pipeline. This structural anchor does not indicate an executing agent.", evidence: core ? `Operational snapshot recorded ${core.generatedAt}.` : "Operational snapshot not available." },
    ...(core?.jobs ?? []).filter(job => job.status === "running" && !job.isTest).map(job => ({ id: job.id, name: job.title, kind: "mission" as const, status: "Running", context: `${job.percent}% recorded progress.`, evidence: "Source: authenticated Core job snapshot." })),
    ...agents.filter(agent => agent.status === "active").map(agent => ({ id: agent.id, name: agent.name, kind: "agent" as const, status: "Active", context: agent.description, evidence: `Source: agent execution store. Last run: ${agent.lastRun}.` })),
  ];
}

export function overviewHealth(core: CoreState | null): string {
  if (!core) return "State unavailable";
  const probes = core.systems.probes.filter(probe => !/preview/i.test(probe.detail));
  if (!probes.length) return "Health unmeasured";
  const online = probes.filter(probe => probe.online).length;
  return online === probes.length ? "Services reachable" : `${online}/${probes.length} services reachable`;
}

