"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, X, Plus, Plug, Server, ArrowLeft } from "lucide-react";
import { useAppState } from "@/lib/appState";
import type { ClientAiModel } from "@/lib/aiModelStore";
import type { CoreState, CoreProbe } from "@/lib/coreState";
import { CONNECTOR_BRAND_ICONS } from "@/lib/connectorIcons";
import { getAiBrandIcon } from "@/lib/aiBrandIcons";
import { MCP_CATALOG, type CatalogEntry } from "@/lib/mcp/catalog";
import { McpInspectorModal, CatalogInspectorModal, CustomConnectorInspectorModal, N8nInspectorModal, NewCustomConnectorModal, NewMcpServerModal, type McpServerRow, type ConnectorRow, type DepartmentOption, type N8nConfig } from "./IntegrationsHub";
import { AiModelInspectorModal, AiModelTokenPromptModal, CustomAiModelModal, PRESETS } from "./AiModelManager";
import { Integrations } from "./Integrations";
import styles from "./SystemsControlPlane.module.css";

type Area = 'Connections' | 'Models & Routing' | 'Runtime' | 'Access & Secrets';
const AREAS: Area[] = ['Connections', 'Models & Routing', 'Runtime', 'Access & Secrets'];
type Selection =
  | { kind: 'mcp'; record: McpServerRow }
  | { kind: 'rest'; record: ConnectorRow }
  | { kind: 'model'; record: ClientAiModel }
  | { kind: 'runtime'; record: CoreProbe }
  | { kind: 'routing' }
  | { kind: 'credentials' }
  | { kind: 'permissions' }
  | { kind: 'interface' }
  | { kind: 'role-preview' };
type Form =
  | { kind: 'mcp'; record: McpServerRow }
  | { kind: 'rest'; record: ConnectorRow }
  | { kind: 'model'; record: ClientAiModel }
  | { kind: 'catalog'; record: CatalogEntry }
  | { kind: 'new-mcp' }
  | { kind: 'new-rest' }
  | { kind: 'new-model' }
  | { kind: 'preset'; index: number }
  | { kind: 'n8n' }
  | { kind: 'byo' };
interface Inventory {
  servers: McpServerRow[];
  connectors: ConnectorRow[];
  departments: DepartmentOption[];
  models: ClientAiModel[];
  providers: { id: string; label: string; configured: boolean }[];
  strategy: string | null;
  chains: Record<string, string[]>;
  core: CoreState | null;
  n8n: N8nConfig | null;
  errors: string[];
}
const EMPTY: Inventory = {
  servers: [],
  connectors: [],
  departments: [],
  models: [],
  providers: [],
  strategy: null,
  chains: {},
  core: null,
  n8n: null,
  errors: [],
};

function initial(tab:string):Area {return /models|ai|providers/.test(tab)?'Models & Routing':/automation|n8n|runtime/.test(tab)?'Runtime':/preferences|access|developer/.test(tab)?'Access & Secrets':'Connections';}

function Brand({
  catalogId,
  model,
  probeId,
  providerType,
}: {
  catalogId?: string;
  model?: ClientAiModel;
  probeId?: string;
  providerType?: string;
}) {
  const mark = catalogId
    ? CONNECTOR_BRAND_ICONS[catalogId]
    : probeId === 'n8n'
    ? CONNECTOR_BRAND_ICONS.n8n
    : undefined;
  // Use recorded provider identity for all supported AI models; custom/private resources keep a neutral glyph.
  const ai = model
    ? getAiBrandIcon(model.providerType, model.modelName, model.baseUrl)
    : providerType
    ? getAiBrandIcon(providerType)
    : probeId === 'ollama'
    ? getAiBrandIcon('ollama', 'ollama')
    : null;
  const icon = mark || ai;
  return (
    <span className={styles.brand}>
      {icon ? (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.brandSvg}>
          <path fill="currentColor" d={icon.path} />
        </svg>
      ) : (
        <Server size={17} aria-hidden="true" />
      )}
    </span>
  );
}

export function SystemsControlPlane({ initialArea, onClose }: { initialArea: string; onClose: () => void }) {
  const { uiMode, setUiMode } = useAppState();
  const [area, setArea] = useState<Area>(() => initial(initialArea));
  const [data, setData] = useState<Inventory>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [selection, setSelected] = useState<Selection | null>(null);
  const currentProbe=selection?.kind==='runtime'?data.core?.systems.probes.find(probe=>probe.id===selection.record.id):null;
  const selected=useMemo<Selection|null>(()=>selection?.kind==='runtime'?(currentProbe?{kind:'runtime',record:currentProbe}:null):selection,[selection,currentProbe]);
  const [discovery, setDiscovery] = useState<'connections' | 'models' | null>(null);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<Form | null>(null);
  const [routeEditing, setRouteEditing] = useState(false);
  const [routeBusy, setRouteBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const loadSeq = useRef(0);

  const load = useCallback(async (signal?: AbortSignal) => {
    const seq = ++loadSeq.current;
    const paths = ['/api/mcp', '/api/connectors', '/api/vault/system', '/api/core/state', '/api/vault/system/n8n'];
    const reads = await Promise.all(
      paths.map(async (path) => {
        try {
          const response = await fetch(path, { signal, cache: 'no-store' });
          if (!response.ok) {
            return {
              error:
                response.status === 401 || response.status === 403
                  ? 'Access to this configuration is restricted.'
                  : 'Configuration could not be loaded.',
            };
          }
          return { value: await response.json() };
        } catch {
          return { error: 'Configuration could not be loaded.' };
        }
      })
    );
    if(signal?.aborted)return;
    if (seq !== loadSeq.current) return;
    const [mcp, rest, vault, core, n8n] = reads.map((r) => r.value);
    setData({
      servers: mcp?.servers ?? [],
      departments: mcp?.departments ?? [],
      connectors: rest?.connectors ?? [],
      models: vault?.models ?? [],
      providers: vault?.providers ?? [],
      strategy: vault?.strategy ?? null,
      chains: vault?.routingChains ?? {},
      core: core ?? null,
      n8n: n8n ?? null,
      errors: [...new Set(reads.flatMap((r) => (r.error ? [r.error] : [])))],
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || form) return;
      if (discovery) {
        setDiscovery(null);
        setQuery('');
      } else if (selected) {
        setSelected(null);
        setRouteEditing(false);
      } else return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener('keydown', dismiss, true);
    return () => window.removeEventListener('keydown', dismiss, true);
  }, [selected, discovery, form]);

  const chooseArea = (next: Area) => {
    setArea(next);
    setSelected(null);setDiscovery(null);
    setQuery('');
    setRouteEditing(false);
    setFeedback('');
  };

  const done = () => {
    setForm(null);
    setSelected(null);
    void load();
  };

  const row = (
    key: string,
    name: string,
    detail: string,
    action: () => void,
    brand?: React.ReactNode,
    badge?: string,
    active?: boolean
  ) => (
    <button
      key={key}
      className={`${styles.row} ${active ? styles.rowActive : ''}`}
      onClick={action}
      type="button"
    >
      {brand ?? (
        <span className={styles.brand}>
          <Server size={17} aria-hidden="true" />
        </span>
      )}
      <span className={styles.rowText}>
        <span className={styles.rowHeader}>
          <strong>{name}</strong>
          {badge ? <span className={styles.typeBadge}>{badge}</span> : null}
        </span>
        <span className={styles.rowDetail}>{detail}</span>
      </span>
      <ChevronRight size={15} className={styles.rowChevron} aria-hidden="true" />
    </button>
  );

  const probes = data.core?.systems.probes.filter(p=>!/preview/i.test(p.detail)) ?? [];

  const title =
    selected?.kind === 'mcp' || selected?.kind === 'rest' || selected?.kind === 'model'
      ? selected.record.name
      : selected?.kind === 'runtime'
      ? selected.record.label
      : selected?.kind === 'routing'
      ? 'Routing policy'
      : selected?.kind === 'credentials'
      ? 'Credential inventory'
      : selected?.kind === 'permissions'
      ? 'Workspace permissions'
      : selected?.kind === 'role-preview'
      ? 'Role preview'
      : 'Interface preferences';

  const fields: { label: string; value: string }[] = [];
  if (selected?.kind === 'mcp') {
    fields.push(
      { label: 'Connection type', value: 'MCP' },
      { label: 'Credential', value: selected.record.hasCredential ? 'Configured' : 'Not configured' },
      { label: 'Authentication', value: 'Not verified' },
      { label: 'Availability', value: 'Not checked' },
      {
        label: 'Recorded department access',
        value: selected.record.allowedDepartments.length
          ? selected.record.allowedDepartments.map((id) => data.departments.find((d) => d.id === id)?.name ?? id).join(' · ')
          : 'No department grants recorded',
      }
    );
  }
  if (selected?.kind === 'rest') {
    fields.push(
      { label: 'Connection type', value: 'Custom REST' },
      { label: 'Credential', value: selected.record.hasSecret ? 'Configured' : 'Not configured' },
      { label: 'Authentication', value: selected.record.authMode === 'none' ? 'No credential required by configuration' : 'Not verified' },
      { label: 'Availability', value: 'Not checked' }
    );
  }
  if (selected?.kind === 'model') {
    fields.push(
      { label: 'Provider', value: selected.record.providerType.toUpperCase() },
      { label: 'Model', value: selected.record.modelName },
      { label: 'Configuration', value: selected.record.isConfigured ? 'Configured' : 'Not configured' },
      { label: 'Credential', value: selected.record.hasApiKey ? 'Configured' : 'Not recorded' },
      { label: 'Authentication', value: 'Not verified' },
      { label: 'Availability', value: 'Not checked' },
      { label: 'Recorded task role', value: selected.record.taskRole }
    );
  }
  if (selected?.kind === 'runtime') {
    fields.push(
      { label: 'Last probe', value: selected.record.online ? 'Reachable' : 'Not reachable' },
      { label: 'Latency', value: selected.record.latencyMs==null?'Not recorded':`${selected.record.latencyMs} ms` },
      { label: 'Snapshot', value: data.core?.generatedAt ? new Date(data.core.generatedAt).toLocaleString() : 'Not recorded' }
    );
  }

  async function updateStrategy(strategy: string) {
    setRouteBusy(true);
    setFeedback('');
    try {
      const result = await fetch('/api/router', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy }),
      });
      setFeedback(
        result.ok
          ? 'Routing strategy updated for this server process.'
          : 'Routing policy could not be saved. Existing authorization still applies.'
      );
      if (result.ok) await load();
    } catch {
      setFeedback('Routing policy could not be saved.');
    } finally {
      setRouteBusy(false);
    }
  }

  const configuredCount = data.servers.length + data.connectors.length;

  return (
    <section
      className={styles.surface}
      aria-label="Systems control plane"
      data-systems-surface
      onClick={(e) => {
        if (e.target === e.currentTarget) setSelected(null);
      }}
    >
      <div className={styles.workspace}>
        <header className={styles.heading}>
          <div className={styles.headingTitleGroup}>
            <span className={styles.eyebrow}>CONTROL PLANE · SYSTEM INFRASTRUCTURE</span>
            <h1>SYSTEMS</h1>
          </div>
          <button
            onClick={onClose}
            aria-label="Return to previous surface"
            title="Return to previous surface"
            className={styles.closeSurfaceBtn}
          >
            <ArrowLeft size={16} />
            <span>Return</span>
          </button>
        </header>

        <nav className={styles.navigation} aria-label="Systems areas">
          {AREAS.map((item) => (
            <button key={item} aria-pressed={area === item} onClick={() => chooseArea(item)}>
              {item}
            </button>
          ))}
        </nav>

        <div className={styles.layout}>
          <section className={styles.inventory} aria-label={area}>
            <div className={styles.sectionHeading}>
              <div className={styles.sectionTitleGroup}>
                <h2>{area === 'Connections' ? 'Your stack' : area === 'Models & Routing' ? 'Models & Routing' : area}</h2>
                <span className={styles.countBadge}>
                  {area === 'Connections'
                    ? `${configuredCount} active`
                    : area === 'Models & Routing'
                    ? `${data.models.length} configured`
                    : area === 'Runtime'
                    ? `${probes.length} probed`
                    : 'Administration'}
                </span>
              </div>
              {area === 'Connections' || area === 'Models & Routing' ? (
                <button
                  className={styles.addBtn}
                  onClick={() => {
                    setDiscovery(area === 'Connections' ? 'connections' : 'models');
                    setSelected(null);
                  }}
                >
                  <Plus size={14} /> {area === 'Connections' ? 'Add connection' : 'Add model'}
                </button>
              ) : null}
            </div>

            {loading ? <p role="status" className={styles.loadingStatus}>Loading configuration…</p> : null}

            {data.errors.map((error) => (
              <p key={error} className={styles.notice}>
                {error} <button onClick={() => void load()}>Retry</button>
              </p>
            ))}

            {!loading && area === 'Connections' && (
              <>
                {data.servers.map((server) =>
                  row(
                    `mcp:${server.id}`,
                    server.name,
                    `MCP · ${server.hasCredential ? 'Credential configured' : 'Credential not configured'} · Authentication not verified`,
                    () => setSelected({ kind: 'mcp', record: server }),
                    <Brand catalogId={server.catalogId} />,
                    'MCP',
                    selected?.kind === 'mcp' && selected.record.id === server.id
                  )
                )}
                {data.connectors.map((connector) =>
                  row(
                    `rest:${connector.id}`,
                    connector.name,
                    `REST · ${connector.hasSecret ? 'Credential configured' : 'Credential not configured'} · Not checked`,
                    () => setSelected({ kind: 'rest', record: connector }),
                    undefined,
                    'REST',
                    selected?.kind === 'rest' && selected.record.id === connector.id
                  )
                )}
                {!data.servers.length && !data.connectors.length && !data.errors.length ? (
                  <div className={styles.emptyState}>
                    <Plug size={22} className={styles.emptyIcon} />
                    <p>No connections recorded.</p>
                    <span className={styles.emptySubtext}>Use &ldquo;+ Add connection&rdquo; to discover MCP endpoints or configure custom REST integrations.</span>
                  </div>
                ) : null}
              </>
            )}

            {!loading && area === 'Models & Routing' && (
              <>
                <div className={styles.routingSummaryCard} onClick={() => setSelected({ kind: 'routing' })}>
                  <div className={styles.routingSummaryHeader}>
                    <span className={styles.routingSummaryLabel}>ROUTING POLICY</span>
                    <span className={styles.routingSummaryBadge}>
                      {data.strategy ? data.strategy.toUpperCase() : 'AUTO'}
                    </span>
                  </div>
                  <p className={styles.routingSummaryDetail}>
                    {data.strategy ? `${data.strategy.toUpperCase()} · Recorded configuration` : 'Policy not recorded'}
                  </p>
                  <span className={styles.routingSummaryHint}>Click to inspect strategy and task chains</span>
                </div>

                <h3 className={styles.groupTitle}>Recorded model definitions ({data.models.length})</h3>
                {data.models.map((model) =>
                  row(
                    model.id,
                    model.name,
                    `${model.modelName} · ${model.isConfigured ? 'Configured' : 'Not configured'} · Authentication not verified`,
                    () => setSelected({ kind: 'model', record: model }),
                    <Brand model={model} />,
                    model.providerType.toUpperCase(),
                    selected?.kind === 'model' && selected.record.id === model.id
                  )
                )}
                {!data.models.length ? (
                  <div className={styles.emptyState}>
                    <Server size={22} className={styles.emptyIcon} />
                    <p>No model definitions recorded.</p>
                    <span className={styles.emptySubtext}>Use &ldquo;+ Add model&rdquo; to configure custom model endpoints or provider presets.</span>
                  </div>
                ) : null}
              </>
            )}

            {!loading && area === 'Runtime' && (
              <>
                {probes.map((probe) =>
                  row(
                    probe.id,
                    probe.label,
                    `${probe.online ? 'Reachable' : 'Not reachable'}${probe.latencyMs == null ? '' : ` · ${probe.latencyMs} ms`}`,
                    () => setSelected({ kind: 'runtime', record: probe }),
                    <Brand probeId={probe.id} />,
                    probe.online ? 'REACHABLE' : 'UNREACHABLE',
                    selected?.kind === 'runtime' && selected.record.id === probe.id
                  )
                )}
                {!probes.length ? (
                  <div className={styles.emptyState}>
                    <Server size={22} className={styles.emptyIcon} />
                    <p>No measured runtime probes available.</p>
                    <span className={styles.emptySubtext}>Probes measure active local daemon reachability and latency.</span>
                  </div>
                ) : null}
              </>
            )}

            {!loading && area === 'Access & Secrets' && (
              <>
                {row(
                  'credentials',
                  'Credentials',
                  'Recorded provider and connector credential state',
                  () => setSelected({ kind: 'credentials' }),
                  undefined,
                  'SECRETS',
                  selected?.kind === 'credentials'
                )}
                {row(
                  'permissions',
                  'Workspace permissions',
                  'Role-based access & department policies',
                  () => setSelected({ kind: 'permissions' }),
                  undefined,
                  'PERMISSIONS',
                  selected?.kind === 'permissions'
                )}
                {row(
                  'interface',
                  'Interface preferences',
                  uiMode === 'advanced' ? 'Advanced presentation' : 'Simple presentation',
                  () => setSelected({ kind: 'interface' }),
                  undefined,
                  'UI CONTROLS',
                  selected?.kind === 'interface'
                )}
                {row(
                  'role-preview',
                  'Role preview',
                  'Client-side presentation preview only',
                  () => setSelected({ kind: 'role-preview' }),
                  undefined,
                  'PREVIEW',
                  selected?.kind === 'role-preview'
                )}
                <p className={styles.notice}>
                  Department access is inspected with each connection. Configuration actions remain subject to server authorization.
                </p>
              </>
            )}
          </section>

          {selected && (
            <aside className={styles.inspector} aria-label="Systems inspection">
              <header className={styles.inspectorHeader}>
                <div className={styles.inspectorTitleGroup}>
                  <span className={styles.inspectorEyebrow}>RESOURCE INSPECTOR</span>
                  <h2>{title}</h2>
                </div>
                <button
                  aria-label="Dismiss Systems inspection"
                  className={styles.inspectorCloseBtn}
                  onClick={() => {
                    setSelected(null);
                    setRouteEditing(false);
                  }}
                >
                  <X size={15} />
                </button>
              </header>

              {fields.length ? (
                <dl className={styles.fieldList}>
                  {fields.map((field) => (
                    <div key={field.label} className={styles.fieldItem}>
                      <dt>{field.label}</dt>
                      <dd>{field.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}

              {(selected.kind === 'mcp' || selected.kind === 'rest' || selected.kind === 'model') && (
                <button className={styles.action} onClick={() => setForm(selected)}>
                  Configure & test
                </button>
              )}

              {selected.kind === 'runtime' && (
                <>
                  <div className={styles.actionButtonGroup}>
                    <button className={styles.action} onClick={() => void load()}>
                      Refresh probes
                    </button>
                    {selected.record.id === 'n8n' && (
                      <button className={styles.actionSecondary} onClick={() => setForm({ kind: 'n8n' })}>
                        Configure n8n
                      </button>
                    )}
                  </div>
                  <p className={styles.notice}>
                    Probe reachability is a recorded check, not a guarantee of authentication or model availability.
                  </p>
                </>
              )}

              {selected.kind === 'credentials' && (
                <div className={styles.credentialsView}>
                  <p className={styles.groupSubtitle}>Provider Credentials</p>
                  <dl className={styles.fieldList}>
                    {data.providers.map((provider) => (
                      <div key={provider.id} className={styles.fieldItem}>
                        <dt>{provider.label}</dt>
                        <dd>{provider.configured ? 'Credential configured' : 'Not configured'}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className={styles.groupSubtitle}>MCP Connections</p>
                  <dl className={styles.fieldList}>
                    {data.servers.map((server) => (
                      <div key={server.id} className={styles.fieldItem}>
                        <dt>{server.name}</dt>
                        <dd>{server.hasCredential ? 'Credential configured' : 'Not configured'}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className={styles.groupSubtitle}>REST Connectors</p>
                  <dl className={styles.fieldList}>
                    {data.connectors.map((connector) => (
                      <div key={connector.id} className={styles.fieldItem}>
                        <dt>{connector.name}</dt>
                        <dd>{connector.hasSecret ? 'Credential configured' : 'Not configured'}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className={styles.notice}>
                    Credentials are stored server-side in encrypted vaults. Raw secret values are never exposed on client surfaces.
                  </p>
                </div>
              )}

              {selected.kind === 'permissions' && (
                <div className={styles.permissionsView}>
                  <p className={styles.notice}>
                    Department access policies govern which agents and tools may be executed within specific organizational bounds.
                  </p>
                  <dl className={styles.fieldList}>
                    <div className={styles.fieldItem}>
                      <dt>Enforcement Layer</dt>
                      <dd>Server-side RBAC & session validation</dd>
                    </div>
                    <div className={styles.fieldItem}>
                      <dt>Active Departments</dt>
                      <dd>{data.departments.length ? data.departments.map((d) => d.name).join(' · ') : 'Default policy active'}</dd>
                    </div>
                  </dl>
                  <p className={styles.notice}>
                    All administrative and mutation actions strictly require verified owner sessions.
                  </p>
                </div>
              )}

              {selected.kind === 'interface' && (
                <>
                  <p className={styles.notice}>Presentation preferences do not grant permissions.</p>
                  <div className={styles.navigation}>
                    {(['simple', 'advanced'] as const).map((mode) => (
                      <button key={mode} aria-pressed={uiMode === mode} onClick={() => setUiMode(mode)}>
                        {mode === 'simple' ? 'Simple' : 'Advanced'}
                      </button>
                    ))}
                  </div>
                  <p className={styles.notice}>
                    Role preview is omitted: the current presentation state does not establish authoritative owner identity.
                  </p>
                </>
              )}

              {selected.kind === 'role-preview' && (
                <div className={styles.rolePreviewView}>
                  <div className={styles.roleNoticeCard}>
                    <strong>Administrative Notice</strong>
                    <p>
                      Client-side role preview is omitted: the current presentation state does not establish authoritative owner identity.
                    </p>
                  </div>
                  <p className={styles.notice}>
                    Owner authority requires cryptographic server-side session authentication. UI controls do not grant API privileges.
                  </p>
                </div>
              )}

              {selected.kind === 'routing' && (
                <>
                  <dl className={styles.fieldList}>
                    <div className={styles.fieldItem}>
                      <dt>Recorded strategy</dt>
                      <dd>{data.strategy ?? 'Not recorded'}</dd>
                    </div>
                  </dl>
                  <button className={styles.action} onClick={() => setRouteEditing(!routeEditing)}>
                    Edit routing
                  </button>
                  <p className={styles.notice}>
                    Changes apply to this server process only and are not persisted across restarts.
                  </p>
                  {routeEditing && (
                    <label className={styles.routeEdit}>
                      Routing strategy
                      <select
                        value={data.strategy ?? ''}
                        disabled={routeBusy}
                        onChange={(e) => void updateStrategy(e.target.value)}
                      >
                        <option value="auto">Auto</option>
                        <option value="local">Local first</option>
                        <option value="cloud">Cloud first</option>
                      </select>
                    </label>
                  )}
                  <details className={styles.routingDetails}>
                    <summary className={styles.routingSummary}>Inspect routing</summary>
                    <div className={styles.routingChainsContainer}>
                      {Object.entries(data.chains).length ? (
                        Object.entries(data.chains).map(([task, ids]) => (
                          <div className={styles.chain} key={task}>
                            <span className={styles.chainTaskName}>{task}</span>
                            <div className={styles.chainSteps}>
                              {ids.map((id, index) => (
                                <span key={`${id}:${index}`} className={styles.chainStepChip}>
                                  <span className={styles.chainStepIndex}>{index + 1}</span>
                                  <span className={styles.chainStepName}>
                                    {data.models.find((m) => m.id === id)?.name ?? id}
                                  </span>
                                  {index < ids.length - 1 ? <span className={styles.chainStepArrow}>→</span> : null}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className={styles.emptySubtext}>No explicit route chains recorded.</p>
                      )}
                    </div>
                    <p className={styles.notice}>
                      Static configuration. Strategy changes affect the current server process and are not persisted across restarts. Routing reasons and execution paths are not persisted.
                    </p>
                  </details>
                  {feedback && <p role="status" className={styles.feedbackMsg}>{feedback}</p>}
                </>
              )}

              <details className={styles.provenanceDetails}>
                <summary>Provenance</summary>
                <p className={styles.notice}>
                  {selected.kind === 'model' || selected.kind === 'routing' || selected.kind === 'credentials'
                    ? 'Protected system-vault read'
                    : selected.kind === 'runtime'
                    ? 'Protected CORE service-probe snapshot'
                    : selected.kind === 'mcp'
                    ? 'Protected MCP configuration read'
                    : selected.kind === 'rest'
                    ? 'Protected connector configuration read'
                    : 'Device-local interface preference'}
                </p>
                {'record' in selected && <p className={styles.id}>Record ID: {selected.record.id}</p>}
              </details>
            </aside>
          )}
        </div>
      </div>

      {discovery && (
        <aside className={styles.discovery} aria-label={discovery === 'connections' ? 'Add connection' : 'Add model'}>
          <header className={styles.discoveryHeader}>
            <div>
              <span className={styles.discoveryEyebrow}>DISCOVERY & CONFIGURATION</span>
              <h2>{discovery === 'connections' ? 'Add connection' : 'Add model'}</h2>
            </div>
            <button aria-label="Close discovery" className={styles.discoveryCloseBtn} onClick={() => setDiscovery(null)}>
              <X size={16} />
            </button>
          </header>
          <div className={styles.discoverySearchWrapper}>
            <input
              aria-label="Search integrations"
              placeholder="Search integrations…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={styles.discoverySearchInput}
            />
          </div>
          <p className={styles.notice}>Catalog definitions · installation and availability are not implied.</p>
          <div className={styles.discoveryList}>
            {discovery === 'connections' ? (
              <>
                {row('byo', 'Discover an MCP endpoint', 'Use existing endpoint discovery', () => setForm({ kind: 'byo' }), undefined, 'BYO')}
                {row('new-mcp', 'MCP server', 'Configure a custom server', () => setForm({ kind: 'new-mcp' }), undefined, 'CUSTOM')}
                {row('new-rest', 'Custom REST API', 'Configure an existing endpoint', () => setForm({ kind: 'new-rest' }), undefined, 'CUSTOM')}
                {row('automation', 'Automation runtime', 'Manage n8n configuration', () => setForm({ kind: 'n8n' }), <Brand probeId="n8n" />, 'ENGINE')}
                {MCP_CATALOG.filter((entry) => !query || entry.name.toLowerCase().includes(query.toLowerCase())).map((entry) =>
                  row(entry.id, entry.name, 'Catalog definition', () => setForm({ kind: 'catalog', record: entry }), <Brand catalogId={entry.id} />, 'CATALOG')
                )}
              </>
            ) : (
              <>
                {row('custom-model', 'Custom model', 'Configure your model endpoint', () => setForm({ kind: 'new-model' }), undefined, 'CUSTOM')}
                {PRESETS.map((preset, index) => ({ preset, index }))
                  .filter(({ preset }) => !query || preset.name.toLowerCase().includes(query.toLowerCase()))
                  .map(({ preset, index }) =>
                    row(preset.id, preset.name, 'Provider preset · not installed', () => setForm({ kind: 'preset', index }), <Brand providerType={preset.providerType} />, 'PRESET')
                  )}
              </>
            )}
          </div>
        </aside>
      )}

      {form && (
        <div className={styles.formScope} data-systems-form>
          {form.kind === 'byo' && (
            <div className={styles.byo}>
              <button aria-label="Close MCP discovery" onClick={() => { setForm(null); void load(); }}>
                <X size={16} />
              </button>
              <Integrations/>
            </div>
          )}
          {form.kind === 'mcp' && <McpInspectorModal server={form.record} departments={data.departments} uiMode={uiMode} onClose={() => setForm(null)} onChanged={done} />}
          {form.kind === 'rest' && <CustomConnectorInspectorModal connector={form.record} onClose={() => setForm(null)} onChanged={done} />}
          {form.kind === 'model' && <AiModelInspectorModal model={form.record} onClose={() => setForm(null)} onSaved={done} onDeleted={done} />}
          {form.kind === 'catalog' && <CatalogInspectorModal entry={form.record} connectedServer={data.servers.find((s) => s.catalogId === form.record.id)} departments={data.departments} uiMode={uiMode} onClose={() => setForm(null)} onChanged={done} />}
          {form.kind === 'new-mcp' && <NewMcpServerModal onClose={() => setForm(null)} onCreated={done} />}
          {form.kind === 'new-rest' && <NewCustomConnectorModal onClose={() => setForm(null)} onCreated={done} />}
          {form.kind === 'n8n' && (
            <N8nInspectorModal
              config={data.n8n}
              health={{
                status: probes.find((p) => p.id === 'n8n') ? (probes.find((p) => p.id === 'n8n')!.online ? 'connected' : 'offline') : 'unconfigured',
                latencyMs: probes.find((p) => p.id === 'n8n')?.latencyMs ?? undefined,
              }}
              onClose={() => setForm(null)}
              onChanged={done}
            />
          )}
          {form.kind === 'new-model' && <CustomAiModelModal onClose={() => setForm(null)} onCreated={done} />}
          {form.kind === 'preset' && <AiModelTokenPromptModal preset={PRESETS[form.index]} onClose={() => setForm(null)} onConnected={done} />}
        </div>
      )}
    </section>
  );
}
