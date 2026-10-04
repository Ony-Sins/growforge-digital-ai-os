"use client";

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, X } from 'lucide-react';
import type { CoreState } from '@/lib/coreState';
import type { SpatialGraphData } from '@/lib/spatial/obsidianReader';
import { departmentDisplayName } from '@/lib/departmentTaxonomy';
import {
  filterTools,
  toolRecords,
  toolScope,
  TOOL_DOMAINS,
  type ToolDomain,
  type ToolRecord,
} from './toolModel';
import styles from './ToolsLens.module.css';

type ReadState<T> = { value: T | null; status: 'loading' | 'ready' | 'unavailable' };

export function ToolsLens({
  departmentFilter,
  onClearFilter,
  dismissalVersion,
  closing,
  onInspect,
  onClose,
}: {
  departmentFilter: string | null;
  onClearFilter: () => void;
  dismissalVersion: number;
  closing: boolean;
  onInspect: () => void;
  onClose: () => void;
}) {
  const [core, setCore] = useState<ReadState<CoreState>>({ value: null, status: 'loading' });
  const [graph, setGraph] = useState<ReadState<SpatialGraphData>>({ value: null, status: 'loading' });
  const [domain, setDomain] = useState<ToolDomain | null>(null);
  const [selection, setSelection] = useState<{ id: string; version: number } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/core/state', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!controller.signal.aborted) setCore({ value: data, status: 'ready' });
      })
      .catch(() => {
        if (!controller.signal.aborted) setCore({ value: null, status: 'unavailable' });
      });

    void fetch('/api/spatial/graph', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!data.ok || !Array.isArray(data.data?.nodes)) throw new Error();
        if (!controller.signal.aborted) setGraph({ value: data.data, status: 'ready' });
      })
      .catch(() => {
        if (!controller.signal.aborted) setGraph({ value: null, status: 'unavailable' });
      });

    return () => controller.abort();
  }, []);

  const records = useMemo(() => toolRecords(core.value, graph.value), [core.value, graph.value]);
  const filtered = useMemo(() => filterTools(records, departmentFilter), [records, departmentFilter]);
  const selected = selection?.version === dismissalVersion && !closing
    ? filtered.find((record) => record.id === selection.id)
    : undefined;

  const currentDomain = domain && TOOL_DOMAINS.includes(domain) ? domain : null;
  const isLoaded = core.status !== 'loading' && graph.status !== 'loading';

  return (
    <>
      <div className={styles.title}>
        <h1>TOOLS</h1>
        <p>Operational resource inventory & reachability lens</p>
      </div>

      <div className={styles.field} data-tools-lens data-dive-inspector>
        {departmentFilter && (
          <div className={styles.filter}>
            <span>{departmentDisplayName(departmentFilter)} · recorded relationships</span>
            <button aria-label="Clear tools department filter" onClick={onClearFilter}>
              Clear <X size={11} />
            </button>
          </div>
        )}

        {!selected && (
          <section className={styles.rows} aria-label="Tool domains">
            {currentDomain ? (
              <>
                <button className={styles.back} onClick={() => setDomain(null)}>
                  <ArrowLeft size={12} /> Tool domains
                </button>
                <h2>{currentDomain}</h2>
                {filtered
                  .filter((record) => record.domain === currentDomain)
                  .map((record) => (
                    <button
                      key={record.id}
                      data-tool-record-id={record.id}
                      onClick={() => {
                        onInspect();
                        setSelection({ id: record.id, version: dismissalVersion });
                      }}
                    >
                      <span>{record.title}</span>
                      <small>
                        {record.state.reachable === 'reachable'
                          ? 'Reachable'
                          : record.state.reachable === 'unreachable'
                          ? 'Not reachable'
                          : record.state.configured
                          ? 'Configured'
                          : 'Defined'}
                      </small>
                      <ChevronRight size={12} />
                    </button>
                  ))}
                {isLoaded && !filtered.some((record) => record.domain === currentDomain) && (
                  <p className={styles.empty}>No {currentDomain.toLowerCase()} recorded in this scope.</p>
                )}
              </>
            ) : (
              TOOL_DOMAINS.map((name) => {
                const count = filtered.filter((record) => record.domain === name).length;
                return (
                  <button key={name} onClick={() => setDomain(name)}>
                    <span>{name}</span>
                    <small>
                      {!isLoaded ? 'Loading…' : `${count} resource${count === 1 ? '' : 's'}`}
                    </small>
                    <ChevronRight size={12} />
                  </button>
                );
              })
            )}
          </section>
        )}

        {selected && <ToolInspection key={selected.id} record={selected} onClose={onClose} />}
      </div>
    </>
  );
}

function ToolInspection({ record, onClose }: { record: ToolRecord; onClose: () => void }) {
  const [category, setCategory] = useState('Purpose');

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('growforge:tool-record', { detail: toolScope(record) }));
    return () => {
      window.dispatchEvent(new CustomEvent('growforge:tool-record', { detail: null }));
    };
  }, [record]);

  const categories = [
    'Purpose',
    ...(record.provider ? ['Provider'] : []),
    ...(record.configuration.length ? ['Configuration'] : []),
    'Availability',
    'Authentication',
    'Usage',
    ...(record.relationships.length ? ['Relationships'] : []),
  ];

  return (
    <aside
      className={`${styles.inspector} surface-glass`}
      aria-label="Tool inspection"
      data-dive-inspector
      data-nora-side-inspector
    >
      <button className={styles.close} aria-label="Dismiss tool inspection" onClick={onClose}>
        <X size={14} />
      </button>

      <h2>{record.title}</h2>
      <p className={styles.kind}>{record.kind}</p>

      <div className={styles.statusBadges}>
        <span className={styles.badge}>Defined</span>
        <span className={`${styles.badge} ${record.state.configured ? styles.badgeActive : ''}`}>
          {record.state.configured === null ? 'Configuration not verified' : record.state.configured ? 'Configured' : 'Not configured'}
        </span>
        <span className={`${styles.badge} ${record.state.permitted ? styles.badgeActive : ''}`}>
          {record.state.permitted === null ? 'Permission not verified' : record.state.permitted ? 'Permitted' : 'Scope restricted'}
        </span>
        <span className={`${styles.badge} ${record.state.authenticated ? styles.badgeActive : styles.badgeWarn}`}>
          {record.state.authenticated ? 'Authenticated' : 'Authentication not verified'}
        </span>
        <span
          className={`${styles.badge} ${
            record.state.reachable === 'reachable'
              ? styles.badgeActive
              : record.state.reachable === 'unreachable'
              ? styles.badgeWarn
              : ''
          }`}
        >
          {record.state.reachable === 'reachable'
            ? 'Reachable'
            : record.state.reachable === 'unreachable'
            ? 'Not reachable'
            : 'Not checked'}
        </span>
      </div>

      <div className={styles.categories} aria-label="Tool inspection categories">
        {categories.map((name) => (
          <button key={name} aria-pressed={category === name} onClick={() => setCategory(name)}>
            {name}
          </button>
        ))}
      </div>

      <div className={styles.content}>
        {category === 'Purpose' && <p>{record.purpose}</p>}

        {category === 'Provider' && (
          <>
            <p><strong>Provider:</strong> {record.provider}</p>
            <p>Vendor & infrastructure relationship is managed in Systems.</p>
          </>
        )}

        {category === 'Configuration' && (
          <div className={styles.configList}>
            {record.configuration.map((item) => (
              <div key={item.label} className={styles.configItem}>
                <span className={styles.configLabel}>{item.label}</span>
                <span className={styles.configValue}>{item.value}</span>
              </div>
            ))}
          </div>
        )}

        {category === 'Availability' && (
          <>
            <p><strong>Status:</strong> {record.state.reachable === 'reachable' ? 'Reachable' : record.state.reachable === 'unreachable' ? 'Not reachable' : 'Not checked'}</p>
            <p>{record.availabilityDetail ?? 'Live availability is evaluated only when a real health check or invocation is performed.'}</p>
            <p><small>An unprobed resource is not offline; state is reported as Not checked until measured.</small></p>
          </>
        )}

        {category === 'Authentication' && (
          <>
            <p><strong>Status:</strong> {record.state.authenticated ? 'Authenticated' : 'Authentication not verified'}</p>
            <p>{record.authDetail ?? 'Authentication state not checked.'}</p>
            <p><small>A credential existing in env/vault proves credential presence, not successful provider authentication. Raw keys/tokens are strictly protected.</small></p>
          </>
        )}

        {category === 'Usage' && (
          <>
            <p><strong>Invocation History:</strong> {record.state.used ? 'Recorded invocation' : 'Resource-attributed usage unavailable'}</p>
            <p>{record.usageDetail ?? 'No execution receipts recorded for this resource in the active session.'}</p>
            <p><small>Zero utilization metrics or token counts are fabricated.</small></p>
          </>
        )}

        {category === 'Relationships' && (
          <>
            {record.relationships.map((link) => (
              <p key={link.id}>
                {link.title}
                <small>{link.type} · structural graph link</small>
              </p>
            ))}
            {record.departmentIds && record.departmentIds.length > 0 && (
              <p>
                <strong>Assigned Departments:</strong> {record.departmentIds.map(departmentDisplayName).join(', ')}
              </p>
            )}
          </>
        )}
      </div>

      <details className={styles.provenance}>
        <summary>
          Provenance <ChevronRight size={11} />
        </summary>
        {record.provenance.map((text) => (
          <p key={text}>{text}</p>
        ))}
      </details>
    </aside>
  );
}
