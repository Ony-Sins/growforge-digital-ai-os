import type { CoreState, CoreStepView } from "@/lib/coreState";
import type { OverviewSnapshot } from "@/lib/overviewSnapshot";

export interface ExecutionStage { id: string; label: string; kind: CoreStepView['kind']; steps: CoreStepView[]; status: CoreStepView['status'] }

/** Group only recorded steps; grouping is structure, not a fabricated workflow definition. */
export function recordedOverviewStages(core: CoreState | null): ExecutionStage[] {
  const job = core?.job;
  if (!job || job.status !== 'running' || !core?.jobs.some(record => record.id === job.id && record.status === 'running' && !record.isTest)) return [];
  const stages: ExecutionStage[] = [];
  for (const step of job.steps) {
    let stage = stages.find(record => record.kind === step.kind);
    if (!stage) { stage = { id: `${job.id}:stage:${step.kind}`, kind: step.kind, label: step.kind === 'department' ? 'Department execution' : step.label, steps: [], status: 'pending' }; stages.push(stage); }
    stage.steps.push(step);
  }
  for (const stage of stages) stage.status = stage.steps.some(step => step.status === 'error') ? 'error' : stage.steps.some(step => step.status === 'active') ? 'active' : stage.steps.every(step => step.status === 'done' || step.status === 'skipped') ? (stage.steps.every(step => step.status === 'skipped') ? 'skipped' : 'done') : 'pending';
  return stages;
}

export function overviewExecutionLine(core: CoreState | null, agentsWorking: number, snapshot?: OverviewSnapshot | null): string {
  if (!core) return 'Operational state unavailable';
  const active = core.jobs.filter(job => job.status === 'running' && !job.isTest).length;
  if (!active && !agentsWorking) return 'No active execution';
  const missions = `${active} active mission${active === 1 ? '' : 's'}`;
  // Recorded work is shown, but never described as executing unless an executor is confirmed for it.
  const evidence = !snapshot ? '' : snapshot.executingNow.confirmable ? ` · ${snapshot.executingNow.missionIds.length} executing` : ' · execution not confirmed';
  return `${missions}${evidence} · ${agentsWorking} agent${agentsWorking === 1 ? '' : 's'} working`;
}
