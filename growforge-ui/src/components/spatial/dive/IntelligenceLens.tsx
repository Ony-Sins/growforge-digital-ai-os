'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, X } from 'lucide-react';
import type { CoreJobView, CoreState } from '@/lib/coreState';
import { evidenceScope, executionFields, intelligenceRecords, usageFields, type EvidenceField, type EvidenceRecord, type StepUsage } from './intelligenceModel';
import styles from './IntelligenceLens.module.css';

function formatTimestampDisplay(val: string): { display: string; raw?: string } {
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val)) {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      try {
        const formatted = new Intl.DateTimeFormat('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: 'UTC',
        }).format(d).replace(',', ' ·');
        return { display: `${formatted} UTC`, raw: val };
      } catch {
        return { display: val };
      }
    }
  }
  return { display: val };
}

export function IntelligenceLens({ core, available, dismissalVersion, closing, onInspect, onClose }: {
  core: CoreState | null; available: boolean; dismissalVersion: number; closing: boolean;
  onInspect: () => void; onClose: () => void;
}) {
  const [domain, setDomain] = useState<EvidenceRecord['domain'] | null>(null);
  const [selection, setSelection] = useState<{ id: string; version: number } | null>(null);
  const records = useMemo(() => intelligenceRecords(available ? core : null), [core, available]);
  const selected = !closing && selection?.version === dismissalVersion ? records.find(record => record.id === selection.id) : undefined;
  return <>
    <div className={styles.title}><h1>INTELLIGENCE</h1><p>Recorded operational evidence</p></div>
    <div className={styles.field} data-intelligence-lens data-dive-inspector>
      {!selected && <section className={styles.rows} aria-label="Intelligence evidence">
        {domain ? <>
          <button className={styles.back} onClick={() => setDomain(null)}><ArrowLeft size={12} /> Evidence groups</button>
          <h2>{domain}</h2>
          {records.filter(record => record.domain === domain).map(record => <button key={record.id} data-evidence-id={record.id} onClick={() => { onInspect(); setSelection({ id: record.id, version: dismissalVersion }); }}>
            <span>{record.title}</span><small>{record.jobId ? 'Recorded job' : 'Snapshot'}</small><ChevronRight size={12} />
          </button>)}
          {!records.some(record => record.domain === domain) && <p className={styles.empty}>{available ? 'No evidence recorded in this scope.' : 'Evidence unavailable. Activity is not inferred.'}</p>}
        </> : (['Execution', 'Usage', 'Services'] as const).map(name => <button key={name} onClick={() => setDomain(name)}>
          <span>{name}</span><small>{available ? `${records.filter(record => record.domain === name).length} records` : 'Unavailable'}</small><ChevronRight size={12} />
        </button>)}
      </section>}
      {selected && <EvidenceInspection key={selected.id} record={selected} onClose={onClose} />}
    </div>
  </>;
}

function EvidenceInspection({ record, onClose }: { record: EvidenceRecord; onClose: () => void }) {
  const [read, setRead] = useState<{ fields: EvidenceField[]; status: 'loading' | 'ready' | 'unavailable'; snapshot?: string }>({ fields: [], status: record.jobId ? 'loading' : 'ready' });
  const [category, setCategory] = useState('Evidence');
  useEffect(() => {
    if (!record.jobId) return;
    const controller = new AbortController();
    const url = record.domain === 'Usage' ? `/api/jobs/${encodeURIComponent(record.jobId)}/usage` : `/api/core/state?jobId=${encodeURIComponent(record.jobId)}`;
    void fetch(url, { signal: controller.signal, cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error();
      const body = await response.json();
      let fields: EvidenceField[];
      if (record.domain === 'Usage') {
        if (body.jobId !== record.jobId || !Array.isArray(body.stepUsage)) throw new Error();
        fields = usageFields(body.stepUsage as StepUsage[]);
      } else {
        if (body.job?.id !== record.jobId) throw new Error(); // Core endpoint can fall back to another job.
        fields = executionFields(body.job as CoreJobView);
      }
      if (!controller.signal.aborted) setRead({ fields, status: 'ready', snapshot: record.timestamp });
    }).catch(() => { if (!controller.signal.aborted) setRead({ fields: [], status: 'unavailable' }); });
    return () => controller.abort();
  }, [record.jobId, record.domain, record.timestamp]);
  const detailFields = read.snapshot === record.timestamp ? read.fields : [];
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('growforge:intelligence-record', { detail: evidenceScope(record, [...record.fields, ...(read.snapshot === record.timestamp ? read.fields : [])]) }));
    return () => { window.dispatchEvent(new CustomEvent('growforge:intelligence-record', { detail: null })); };
  }, [record, read.fields, read.snapshot]);
  return <aside className={`${styles.inspector} surface-glass`} aria-label="Intelligence inspection" data-dive-inspector data-nora-side-inspector>
    <button className={styles.close} aria-label="Dismiss evidence inspection" onClick={onClose}><X size={14} /></button>
    <h2>{record.title}</h2><p className={styles.kind}>{record.domain} evidence</p>
    <div className={styles.categories}>{['Evidence', ...(record.domain === 'Usage' ? ['API cost'] : [])].map(name => <button key={name} aria-pressed={category === name} onClick={() => setCategory(name)}>{name}</button>)}</div>
    <div className={styles.content}>
      {category === 'API cost' ? <><p>API cost · Not recorded</p><p>No billing receipt is stored with these calls. Static price estimates are excluded. API cost would not represent total economic cost.</p></> : <>
        <div className={styles.evidenceList}>
          {[...record.fields, ...detailFields].map((field, index) => {
            const formatted = formatTimestampDisplay(field.value);
            return (
              <div className={styles.evidenceItem} key={`${field.label}:${index}`}>
                <div className={styles.evidenceHeader}>
                  <span className={styles.evidenceLabel}>{field.label}</span>
                  {field.state ? (
                    <span className={`${styles.badge} ${field.state === 'MEASURED' ? styles.badgeMeasured : styles.badgeDerived}`}>
                      {field.state}
                    </span>
                  ) : (
                    <span className={`${styles.badge} ${styles.badgeNeutral}`}>availability</span>
                  )}
                </div>
                <p className={styles.evidenceValue} title={formatted.raw ? `Recorded ISO: ${formatted.raw}` : undefined}>
                  {formatted.display}
                </p>
                {field.formula && (
                  <details className={styles.calcDetails}>
                    <summary>Calculation</summary>
                    <p>{field.formula}</p>
                  </details>
                )}
              </div>
            );
          })}
        </div>
        {(read.status === 'loading' || (record.jobId && read.status === 'ready' && read.snapshot !== record.timestamp)) && <p>Reading evidence…</p>}
        {read.status === 'unavailable' && <p>Detailed evidence unavailable. No substitute record is shown.</p>}
      </>}
    </div>
    <details className={styles.provenance}>
      <summary>Provenance <ChevronRight size={10} /></summary>
      <p>{record.source}</p>
      <p>Snapshot: {formatTimestampDisplay(record.timestamp).display}</p>
      <p>Record: {record.id}</p>
      <p>This is recorded history or a point-in-time observation, not present execution authority.</p>
    </details>
  </aside>;
}
