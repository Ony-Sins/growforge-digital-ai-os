import type { CoreJobView, CoreState } from '@/lib/coreState';
import type { UsageRecord } from '@/lib/usage';
import { departmentStepLabel } from '@/lib/departmentTaxonomy';

export type EvidenceState = 'MEASURED' | 'DERIVED' | 'ASSUMED';
export type EvidenceField = { label: string; value: string; state: EvidenceState | null; formula?: string };
export type EvidenceRecord = { id: string; title: string; domain: 'Execution' | 'Usage' | 'Services'; jobId?: string; timestamp: string; fields: EvidenceField[]; source: string };
const measured = (label: string, value: string): EvidenceField => ({ label, value, state: 'MEASURED' });

/** Snapshot scope only. Never read a detail ID that wasn't returned by the protected index. */
export function intelligenceRecords(core: CoreState | null): EvidenceRecord[] {
  if (!core) return [];
  const jobs = core.jobs.filter(job => !job.isTest);
  return [
    ...jobs.flatMap(job => (['Execution', 'Usage'] as const).map(domain => ({
      id: `${domain.toLowerCase()}:${job.id}`, title: job.title, domain, jobId: job.id,
      timestamp: core.generatedAt, fields: [measured('Runtime status', job.status), measured('Created', job.createdAt)],
      source: '/api/core/state → authorized job index',
    }))),
    // A real local queue snapshot, never attributed to a particular job.
    ...(core.systems.probes.some(probe => !/preview/i.test(probe.detail)) ? [{
      id: 'queue:pending-approvals', title: 'Pending tool approvals', domain: 'Execution' as const,
      timestamp: core.generatedAt, source: '/api/core/state → pending approval queue count; no job attribution',
      fields: [{ label: 'Pending records', value: String(core.systems.pendingApprovals), state: 'DERIVED' as const,
        formula: 'Count of pending records returned by the current approval queue snapshot. Not a mission hold state.' }],
    }] : []),
    // Beta/preview entries explicitly report placeholders, not actual probes.
    ...core.systems.probes.filter(probe => !/preview/i.test(probe.detail)).map(probe => ({
      id: `probe:${probe.id}`, title: probe.label, domain: 'Services' as const, timestamp: core.generatedAt,
      fields: [measured('Probe result', probe.online ? 'Reachable at snapshot' : 'Not reachable at snapshot'),
        ...(probe.latencyMs !== null ? [measured('Probe latency', `${probe.latencyMs} ms`)] : [])],
      source: '/api/core/state → service probe; reachability does not establish authorization or future availability',
    })),
  ];
}

export function executionFields(job: CoreJobView): EvidenceField[] {
  return job.steps.flatMap(step => {
    const fields = [measured(`${step.label} · status`, step.status)];
    if (step.error) fields.push(measured(`${step.label} · failure`, 'Error recorded; inspect the mission for its full context.'));
    if (step.startedAt) fields.push(measured(`${step.label} · started`, step.startedAt));
    if (step.finishedAt) fields.push(measured(`${step.label} · finished`, step.finishedAt));
    const start = Date.parse(step.startedAt ?? ''), finish = Date.parse(step.finishedAt ?? '');
    if (Number.isFinite(start) && Number.isFinite(finish) && finish >= start) fields.push({
      label: `${step.label} · elapsed`, value: `${finish - start} ms`, state: 'DERIVED',
      formula: `finishedAt (${step.finishedAt}) − startedAt (${step.startedAt}); wall time, not summed call duration`,
    });
    return fields;
  });
}

export type StepUsage = { stepId: string; stepLabel: string; records: UsageRecord[] };
export function usageFields(steps: StepUsage[]): EvidenceField[] {
  const records = steps.flatMap(step => step.records);
  const complete = records.length > 0 && records.every(record => record.inputTokens !== null && record.outputTokens !== null);
  return [
    { label: 'Recorded calls', value: String(records.length), state: 'DERIVED', formula: 'Count of stored usage entries; failed attempts without receipts are excluded.' },
    complete ? { label: 'Reported tokens', value: String(records.reduce((sum, record) => sum + record.inputTokens! + record.outputTokens!, 0)), state: 'DERIVED', formula: 'Σ (inputTokens + outputTokens) across every stored call; shown only with complete token reporting.' }
      : { label: 'Reported tokens', value: 'Unavailable · no complete token report for every stored call', state: null },
    ...steps.flatMap(step => step.records.flatMap((record, index) => [
      measured(`${departmentStepLabel({ kind: step.stepId, departmentId: step.stepId.startsWith('dept:') ? step.stepId.slice(5) : undefined, label: step.stepLabel })} · call ${index + 1}`, `${record.provider} / ${record.model}`),
      measured('Completed', record.timestamp), measured('Call duration', `${record.durationMs} ms`),
      record.inputTokens !== null ? measured('Input tokens', String(record.inputTokens)) : { label: 'Input tokens', value: 'Not recorded', state: null },
      record.outputTokens !== null ? measured('Output tokens', String(record.outputTokens)) : { label: 'Output tokens', value: 'Not recorded', state: null },
    ])),
  ];
}

export function evidenceScope(record: EvidenceRecord, fields: EvidenceField[]) {
  return { id: record.id, title: record.title, kind: `${record.domain} evidence`, context: JSON.stringify({
    source: record.source, snapshotAt: record.timestamp, jobId: record.jobId,
    fields, apiCost: null, costReason: 'No recorded billing receipts. Existing static price estimates excluded.',
    routing: 'No per-call routing-decision receipt in this source.',
  }).slice(0, 2000) };
}
