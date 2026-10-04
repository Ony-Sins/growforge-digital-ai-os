import type { CoreState } from '@/lib/coreState';
import type { SpatialGraphData } from '@/lib/spatial/obsidianReader';
import { canonicalDepartmentId, departmentScopeLabel } from '@/lib/departmentTaxonomy';

export type ToolDomain = 'Models' | 'Connectors' | 'Capabilities' | 'Services' | 'MCP / Tool Definitions';

export type ToolStateSemantics = {
  defined: boolean;
  configured: boolean | null;
  permitted: boolean | null;
  authenticated: boolean; // True ONLY if real provider/API handshake or authenticated call succeeded
  reachable: 'reachable' | 'unreachable' | 'not checked'; // Never maps unprobed to offline
  used: boolean;
};

export type ToolRecord = {
  id: string;
  title: string;
  domain: ToolDomain;
  kind: string;
  purpose: string;
  provider?: string;
  state: ToolStateSemantics;
  configuration: { label: string; value: string }[];
  availabilityDetail?: string;
  authDetail?: string;
  usageDetail?: string;
  departmentIds?: string[];
  relationships: { id: string; targetId: string; title: string; type: string }[];
  provenance: string[];
};

export const TOOL_DOMAINS: ToolDomain[] = [
  'Models',
  'Connectors',
  'Capabilities',
  'Services',
  'MCP / Tool Definitions',
];

/**
 * Extracts and normalizes real operational tool records from CoreState, spatial graph, and service probes.
 * Never invents mock benchmarks, fake pricing, or non-existent telemetry.
 * Strictly enforces: Configured != Authenticated, and Unprobed != Offline.
 */
export function toolRecords(core: CoreState | null, graph: SpatialGraphData | null): ToolRecord[] {
  const records: ToolRecord[] = [];

  // 1. MODELS DOMAIN
  const recordedUsageProviders = new Set<string>();
  if (core?.job?.usage?.providers) {
    for (const p of core.job.usage.providers) {
      recordedUsageProviders.add(p.provider.toLowerCase());
      recordedUsageProviders.add(p.model.toLowerCase());
    }
  }

  const defaultModelsList = [
    { id: 'model:omniroute-default', name: 'Omniroute', provider: 'Omniroute (local router)', modelName: 'auto', taskRole: 'General inference', isPrimary: false, local: true },
    { id: 'model:gemini-default', name: 'Google Gemini', provider: 'Google (Gemini API)', modelName: 'gemini-3.6-flash', taskRole: 'General synthesis & search', isPrimary: false, local: false },
    { id: 'model:groq-default', name: 'Groq', provider: 'Groq', modelName: 'llama-3.3-70b-versatile', taskRole: 'Fast utility & extraction', isPrimary: false, local: false },
    { id: 'model:openai-default', name: 'OpenAI', provider: 'OpenAI', modelName: 'gpt-4o-mini', taskRole: 'Planning & structured output', isPrimary: false, local: false },
    { id: 'model:anthropic-default', name: 'Anthropic', provider: 'Anthropic', modelName: 'claude-3-5-sonnet', taskRole: 'Complex planning & code verification', isPrimary: false, local: false },
  ];

  const graphModelNodes = graph?.nodes.filter((n) => n.source === 'models') ?? [];
  const modelEntries = graphModelNodes.length > 0
    ? graphModelNodes.map((n) => {
        // IDs remain authoritative; presentation names never select a model identity.
        const matchingDef = defaultModelsList.find((d) => d.id === n.id);
        return {
          id: n.id,
          name: n.title,
          provider: matchingDef?.provider ?? 'Configured AI Provider',
          modelName: matchingDef?.modelName ?? n.title,
          taskRole: matchingDef?.taskRole ?? 'Operational inference',
          isPrimary: matchingDef?.isPrimary ?? false,
          local: matchingDef?.local ?? false,
          node: n,
        };
      })
    : [];

  for (const m of modelEntries) {
    const isUsed = recordedUsageProviders.has(m.name.toLowerCase()) || recordedUsageProviders.has(m.modelName.toLowerCase());
    const routing = core?.systems?.routing ?? 'cloud-first';
    
    // Check if Ollama probe informs local model reachability; cloud models remain "not checked" until invoked
    let reachability: 'reachable' | 'unreachable' | 'not checked' = 'not checked';
    let availDetail = 'Live reachability not checked for cloud endpoint. Unprobed state is not assumed offline.';
    if (m.name.toLowerCase().includes('ollama')) {
      const ollamaProbe = core?.systems?.probes?.find((p) => p.id === 'ollama');
      if (ollamaProbe) {
        reachability = ollamaProbe.online ? 'reachable' : 'unreachable';
        availDetail = ollamaProbe.online
          ? `Local Ollama daemon reachable (${ollamaProbe.latencyMs ?? 0}ms latency). ${ollamaProbe.detail}.`
          : `Local Ollama daemon not reachable: ${ollamaProbe.detail}.`;
      }
    }

    const relationships: ToolRecord['relationships'] = [];
    if (graph) {
      const links = graph.links.filter((l) => l.source === m.id || l.target === m.id);
      for (const link of links) {
        const targetId = link.source === m.id ? link.target : link.source;
        const targetNode = graph.nodes.find((n) => n.id === targetId);
        if (targetNode) {
          relationships.push({
            id: `link:${m.id}:${targetId}`,
            targetId,
            title: targetNode.title,
            type: link.relation ?? link.type,
          });
        }
      }
    }

    // Configured != Authenticated: A credential existing in env/vault proves credential presence, not verified provider authentication handshake
    records.push({
      id: m.id,
      title: m.name,
      domain: 'Models',
      kind: m.local ? 'Local AI Model' : 'Cloud AI Model',
      purpose: 'Execution inference for agent planning, synthesis, code generation, and verification.',
      provider: m.provider,
      state: {
        defined: true,
        configured: true,
        permitted: true,
        authenticated: false, // Handshake not verified in this static view
        reachable: reachability,
        used: isUsed,
      },
      configuration: [
        { label: 'Canonical Model ID', value: m.modelName },
        { label: 'Role Profile', value: m.taskRole },
        { label: 'Selection Mode', value: 'Resolved at runtime' },
        { label: 'System Routing Priority', value: routing === 'local-first' ? 'Local-first routing' : 'Cloud-first routing' },
        { label: 'Dispatch Tier', value: m.isPrimary ? 'Primary default model' : 'Specialized task fallback' },
      ],
      availabilityDetail: availDetail,
      authDetail: 'Authentication not verified · Credential configured in environment / server vault (raw key not exposed).',
      usageDetail: isUsed
        ? 'Recorded invocation in active session job step.'
        : 'No recorded execution in active session job.',
      departmentIds: ['ai-automation', 'executive'],
      relationships,
      provenance: [
        `System model record: ${m.id}.`,
        'Model selection is resolved dynamically at runtime by the orchestrator router; not fixed permanently.',
        'Zero benchmark ratings or cost projections are fabricated. State reflects configured catalog presence and session telemetry.',
      ],
    });
  }

  // 2. CONNECTORS DOMAIN
  const connectorRecords = [
    {
      id: 'tool:call_connector',
      name: 'Custom REST Connectors',
      kind: 'Outbound REST Integration Gateway',
      purpose: 'Outbound HTTP integration engine for connecting external systems (HubSpot, Notion, Apollo, custom APIs) with SSRF guard and owner approval gate.',
      authMode: 'Configurable (Bearer / Header / None)',
      url: 'Configured per endpoint in Systems → Integrations',
      approvalRequired: true,
    },
  ];

  for (const c of connectorRecords) {
    records.push({
      id: c.id,
      title: c.name,
      domain: 'Connectors',
      kind: c.kind,
      purpose: c.purpose,
      provider: 'GrowForge Custom Integration Subsystem',
      state: {
        defined: true,
        configured: true,
        permitted: true,
        authenticated: false,
        reachable: 'not checked',
        used: false,
      },
      configuration: [
        { label: 'Auth Mode Support', value: c.authMode },
        { label: 'Endpoint Target', value: c.url },
        { label: 'Security Gate', value: 'Owner approval required before outbound request execution' },
        { label: 'Network Guard', value: 'SSRF protection active (private IPv4/IPv6 loopback & cloud metadata blocked)' },
      ],
      availabilityDetail: 'Not checked · Live reachability is evaluated per connector invocation. Unprobed state is not offline.',
      authDetail: 'Authentication not verified · Per-connector credentials reside encrypted in Systems vault.',
      usageDetail: 'No recorded connector invocation in active session.',
      departmentIds: [],
      relationships: [],
      provenance: [
        `Connector definition: ${c.id}.`,
        'Configured connectors do not imply active network connection until tested or invoked.',
        'Systems remains the configuration and credential management surface.',
      ],
    });
  }

  // 3. CAPABILITIES DOMAIN
  const graphCapNodes = graph?.nodes.filter((n) => n.source === 'capabilities') ?? [];
  const defaultCapabilities = [
    {
      id: 'cap:higgsfield',
      title: 'Higgsfield AI',
      purpose: 'Generative Video & Cinematic Campaign Creative Engine for synthesized video reels and ad campaign assets.',
      departmentId: 'web-design',
      tools: ['generate_higgsfield_image', 'generate_higgsfield_video'],
    },
    {
      id: 'cap:dalle',
      title: 'OpenAI DALL-E 3',
      purpose: 'Generative Image Synthesis Engine for marketing visuals, landing page assets, and branding graphics.',
      departmentId: 'web-design',
      tools: ['generate_dalle_image'],
    },
  ];

  const capEntries = graphCapNodes.length > 0
    ? graphCapNodes.map((n) => {
        const def = defaultCapabilities.find((d) => d.id === n.id);
        return {
          id: n.id,
          title: n.title,
          purpose: def?.purpose ?? n.excerpt,
          departmentId: def?.departmentId ?? 'web-design',
          tools: def?.tools ?? [],
          node: n,
        };
      })
    : [];

  for (const cap of capEntries) {
    const relationships: ToolRecord['relationships'] = [];
    if (graph) {
      const links = graph.links.filter((l) => l.source === cap.id || l.target === cap.id);
      for (const link of links) {
        const targetId = link.source === cap.id ? link.target : link.source;
        const targetNode = graph.nodes.find((n) => n.id === targetId);
        if (targetNode) {
          relationships.push({
            id: `link:${cap.id}:${targetId}`,
            targetId,
            title: targetNode.title,
            type: link.relation ?? link.type,
          });
        }
      }
    }

    records.push({
      id: cap.id,
      title: cap.title,
      domain: 'Capabilities',
      kind: 'System Capability Key',
      purpose: cap.purpose,
      provider: cap.title,
      state: {
        defined: true,
        configured: true,
        permitted: true,
        authenticated: false,
        reachable: 'not checked',
        used: false,
      },
      configuration: [
        { label: 'Lifecycle Status', value: 'Active record in capability registry' },
        { label: 'Backing Capability Tools', value: cap.tools.join(', ') || 'Direct API inference' },
        { label: 'Assigned Department', value: departmentScopeLabel(cap.departmentId) },
        { label: 'Credential Status', value: 'Credential configured (managed in server vault / env)' },
      ],
      availabilityDetail: 'Not checked · Live endpoint reachability is evaluated on demand during generative task execution. Active lifecycle status does not imply live operational readiness.',
      authDetail: 'Authentication not verified · Credential configured in server vault / environment.',
      usageDetail: 'No generative capability calls in current session job.',
      departmentIds: [cap.departmentId],
      relationships,
      provenance: [
        `Capability record: ${cap.id}.`,
        'A capability describes what the OS can conceptually execute; distinct from an agent or standalone connector.',
        'Lifecycle status represents registry inclusion, not live backing resource operational state.',
      ],
    });
  }

  // 4. SERVICES DOMAIN
  const probeMetadata: Record<string, { purpose: string; endpoint: string; auth: string }> = {
    ollama: {
      purpose: 'Local LLM inference server for offline, private model execution without third-party API costs.',
      endpoint: 'http://localhost:11434 (default)',
      auth: 'Local daemon (no credential required)',
    },
    searxng: {
      purpose: 'Self-hosted privacy-preserving metasearch engine for live fact-checking, research, and source verification.',
      endpoint: 'http://localhost:8088 (default)',
      auth: 'Local service instance',
    },
    n8n: {
      purpose: 'Multi-system automation engine for building, hosting, and executing multi-step business workflows.',
      endpoint: 'http://127.0.0.1:5678 (default)',
      auth: 'API key configured in server vault',
    },
    comfyui: {
      purpose: 'Local node-based GPU image and media generation pipeline for high-fidelity visual asset workflows.',
      endpoint: 'http://127.0.0.1:8188 (default)',
      auth: 'Local GPU server',
    },
  };

  const probes = core?.systems?.probes.filter(p => !/preview/i.test(p.detail)) ?? [];

  for (const p of probes) {
    const meta = probeMetadata[p.id] ?? {
      purpose: 'Local runtime service.',
      endpoint: 'Configured local port',
      auth: 'Local instance',
    };

    const isReachable = p.online;
    const availText = isReachable
      ? `Reachable · ${p.latencyMs ?? 0}ms latency. Probed state: ${p.detail}.`
      : `Not reachable · ${p.detail}.`;

    records.push({
      id: `service:${p.id}`,
      title: p.label,
      domain: 'Services',
      kind: 'Local / Runtime Service',
      purpose: meta.purpose,
      provider: 'Local Runtime Subsystem',
      state: {
        defined: true,
        configured: true,
        permitted: true,
        authenticated: false,
        reachable: isReachable ? 'reachable' : 'unreachable',
        used: false,
      },
      configuration: [
        { label: 'Configured Host Endpoint', value: meta.endpoint },
        { label: 'Health Probe Path', value: p.id === 'ollama' ? '/api/tags' : p.id === 'comfyui' ? '/system_stats' : '/healthz' },
        { label: 'Authentication Mode', value: meta.auth },
      ],
      availabilityDetail: availText,
      authDetail: p.id === 'n8n' ? 'Authentication not verified · API key configured in server vault.' : meta.auth,
      usageDetail: 'Live service probes execute on core state refresh interval.',
      departmentIds: ['ai-automation', 'web-design', 'content-creator'],
      relationships: [],
      provenance: [
        `Service probe ID: service:${p.id}.`,
        'Reachability is measured via live HTTP health checks with a 2500ms timeout.',
        'Configured does not mean reachable; offline/unreachable state is strictly probe-backed.',
      ],
    });
  }

  // 5. MCP / TOOL DEFINITIONS DOMAIN
  const builtInTools = [
    {
      id: 'tool:web_search',
      title: 'web_search',
      kind: 'Built-in Tool Definition',
      purpose: 'Live web research and fact retrieval via Google search / SearXNG. Read-only, executes immediately without approval.',
      approval: 'Read-only · no approval required',
      usage: '{ query: string }',
      deptIds: ['ai-automation', 'content-creator', 'marketing-strategy'],
    },
    {
      id: 'tool:piper',
      title: 'piper (Voice Synthesis)',
      kind: 'Built-in Tool Definition',
      purpose: 'Local neural text-to-speech engine for generating audio and voiceover tracks.',
      approval: 'Propose-only · requires owner approval',
      usage: '{ text: string, voice?: string }',
      deptIds: ['content-creator', 'media-production'],
    },
    {
      id: 'tool:whisper',
      title: 'whisper (Audio Transcription)',
      kind: 'Built-in Tool Definition',
      purpose: 'Local neural speech-to-text audio transcription.',
      approval: 'Read-only · no approval required',
      usage: '{ audioPath: string }',
      deptIds: ['content-creator', 'executive'],
    },
    {
      id: 'tool:comfyui_tool',
      title: 'comfyui (Workflow Dispatch)',
      kind: 'Built-in Tool Definition',
      purpose: 'Executes parameterized ComfyUI image/video workflows on local GPU.',
      approval: 'Propose-only · requires owner approval',
      usage: '{ prompt: string, workflowId?: string }',
      deptIds: ['web-design', 'content-creator'],
    },
    {
      id: 'tool:ask_operator',
      title: 'ask_operator (Consultation)',
      kind: 'Built-in Tool Definition',
      purpose: 'Interactive consultation tool allowing agents to prompt the human operator for clarification or decisions.',
      approval: 'Interactive consultation',
      usage: '{ question: string, options?: string[] }',
      deptIds: [],
    },
    {
      id: 'tool:manage_n8n_workflow',
      title: 'manage_n8n_workflow',
      kind: 'Built-in Tool Definition',
      purpose: 'Management and execution of n8n automation workflows. Read operations are unrestricted; mutations require owner approval.',
      approval: 'Per-action gate (mutations require approval)',
      usage: '{ action: "list" | "get" | "create" | "activate" | "execute", ... }',
      deptIds: ['ai-automation'],
    },
    {
      id: 'tool:ingest_n8n_template',
      title: 'ingest_n8n_template',
      kind: 'Built-in Tool Definition',
      purpose: 'Parses and validates n8n workflow templates into executable blueprint structures.',
      approval: 'Read-only · no approval required',
      usage: '{ templateJson: string }',
      deptIds: ['ai-automation'],
    },
  ];

  for (const t of builtInTools) {
    records.push({
      id: t.id,
      title: t.title,
      domain: 'MCP / Tool Definitions',
      kind: t.kind,
      purpose: t.purpose,
      provider: 'GrowForge Agent Tool Framework',
      state: {
        defined: true,
        configured: true,
        permitted: true,
        authenticated: false, // In-process handler; external auth not checked
        reachable: 'reachable', // In-process JS handler is executable
        used: false,
      },
      configuration: [
        { label: 'Invocation Schema', value: t.usage },
        { label: 'Approval Policy', value: t.approval },
        { label: 'Execution Model', value: 'JSON-decision tool loop (provider-agnostic)' },
      ],
      availabilityDetail: 'Available in runtime agent tool registry.',
      authDetail: 'In-process tool handler.',
      usageDetail: 'Tool availability evaluated per agent turn.',
      departmentIds: t.deptIds,
      relationships: [],
      provenance: [
        `Tool definition: ${t.id}.`,
        'Enforced by the generic agent tool-calling loop (src/lib/tools.ts).',
        'PROPOSE vs EXECUTE policy guarantees approval-gated tools never fire without explicit operator sign-off.',
      ],
    });
  }

  // Include configured MCP servers from graph or coreState
  const graphMcpNodes = graph?.nodes.filter((n) => n.source === 'mcp') ?? [];
  for (const mcpNode of graphMcpNodes) {
    const relationships: ToolRecord['relationships'] = [];
    if (graph) {
      const links = graph.links.filter((l) => l.source === mcpNode.id || l.target === mcpNode.id);
      for (const link of links) {
        const targetId = link.source === mcpNode.id ? link.target : link.source;
        const targetNode = graph.nodes.find((n) => n.id === targetId);
        if (targetNode) {
          relationships.push({
            id: `link:${mcpNode.id}:${targetId}`,
            targetId,
            title: targetNode.title,
            type: link.relation ?? link.type,
          });
        }
      }
    }

    records.push({
      id: mcpNode.id,
      title: mcpNode.title,
      domain: 'MCP / Tool Definitions',
      kind: 'MCP Server Definition',
      purpose: mcpNode.excerpt || 'External tool discovery and structured protocol execution.',
      provider: mcpNode.title,
      state: {
        defined: true,
        configured: true,
        permitted: true,
        authenticated: false,
        reachable: 'not checked',
        used: false,
      },
      configuration: [
        { label: 'Transport Endpoint / Command', value: mcpNode.path },
        { label: 'Category', value: mcpNode.categoryLabel },
        { label: 'Approval Policy', value: 'Propose-only · requires owner approval before call execution' },
      ],
      availabilityDetail: 'Not checked · Availability requires live connect-discover probe on server execution. Unprobed state is not offline.',
      authDetail: 'Authentication not verified · Credentials reside in server vault under mcp:<id>.',
      usageDetail: 'Discovered tools populate dynamically on agent department permission match.',
      departmentIds: mcpNode.departmentId ? [mcpNode.departmentId] : [],
      relationships,
      provenance: [
        `MCP Server Record: ${mcpNode.id}.`,
        'Speaks the Model Context Protocol over stdio or streamable HTTP transport.',
        'Zero tools are cached statically; runtime dispatch triggers fresh discovery probe.',
      ],
    });
  }

  // These read paths expose records and probes, not authenticated sessions or
  // effective grants. Never turn catalog inclusion into execution authority.
  for (const record of records) {
    record.state.permitted = null;
    record.state.configured = null;
    record.authDetail = 'Authentication not verified. Credential presence is not established by this view.';
    record.usageDetail = 'No resource-attributed execution receipt is available in this view.';
    record.state.used = false;

    if (record.domain === 'Models') {
      const node = graphModelNodes.find(n => n.id === record.id);
      const field = (label: string) => node?.content?.split('\n').find(line => line.startsWith(`**${label}:**`))?.split('**').slice(2).join('**').trim().replace(/^`|`\s*$/g, '');
      const provider = field('Provider Type');
      const modelId = field('Model ID');
      record.provider = provider;
      record.kind = provider === 'ollama' || provider === 'omniroute' ? 'Local model definition' : 'Model definition';
      record.configuration = [
        { label: 'Record ID', value: record.id },
        ...(modelId ? [{ label: 'Recorded Model ID', value: modelId }] : []),
        ...(field('Task Role') ? [{ label: 'Recorded Task Role', value: field('Task Role')! }] : []),
      ];
      // Owner graph models are emitted only after isConfigured is checked.
      // Require its explicit metadata, rather than inferring from the title.
      record.state.configured = provider && modelId ? true : null;
      record.departmentIds = node?.departmentId ? [canonicalDepartmentId(node.departmentId)] : [];
      record.state.used = Boolean(provider && modelId && core?.job?.usage?.providers.some(receipt => receipt.provider === provider && receipt.model === modelId));
      if (record.state.used) record.usageDetail = `Recorded use in job ${core!.job!.id}. Historical use does not establish current availability.`;
      record.state.reachable = 'not checked';
      record.availabilityDetail = 'Model availability not checked. A service probe does not establish availability of a particular model.';
      record.provenance = [`Model graph record: ${record.id}.`, 'Configuration metadata is projected from the recorded model definition; current authentication and effective permissions are not recorded.'];
    } else if (record.domain === 'Capabilities') {
      const node = graphCapNodes.find(n => n.id === record.id);
      record.departmentIds = node?.departmentId ? [canonicalDepartmentId(node.departmentId)] : [];
      record.state.configured = node?.content?.includes('**Key Source:**') ? true : null;
      record.configuration = [
        { label: 'Record ID', value: record.id },
        { label: 'Lifecycle', value: 'Catalogued capability record; operational readiness not established' },
      ];
      record.provenance = [`Capability graph record: ${record.id}.`, 'Catalog inclusion does not establish availability or execution permission.'];
    } else if (record.domain === 'Services') {
      record.departmentIds = [];
      const probe = probes.find(p => `service:${p.id}` === record.id)!;
      record.configuration = [{ label: 'Probe ID', value: probe.id }];
      record.availabilityDetail = `${probe.online ? 'Reachable' : 'Not reachable'} · ${probe.detail}${probe.latencyMs === null ? '. Latency not recorded.' : ` (${probe.latencyMs}ms latency).`}`;
      record.provenance = [`Service probe ID: ${record.id}.`, 'Point-in-time reachability observation; configuration, authentication and permissions are not inferred.'];
    } else {
      record.state.reachable = 'not checked';
      record.availabilityDetail = 'Definition recorded. Dependencies and endpoint availability have not been checked.';
      record.configuration = record.configuration.filter(item => !['Endpoint Target', 'Transport Endpoint / Command'].includes(item.label));
      record.provenance = [`Tool definition: ${record.id}.`, 'Definition and approval policy do not establish effective permission or current availability.'];
    }
  }
  return records;
}

/**
 * Filter tools by department if an explicit filter is passed.
 */
export function filterTools(records: ToolRecord[], departmentId: string | null): ToolRecord[] {
  if (!departmentId) return records;
  const canonical = canonicalDepartmentId(departmentId);
  return records.filter((r) => {
    // If no department restrictions are recorded, it is shared/global
    if (!r.departmentIds || r.departmentIds.length === 0) return true;
    return r.departmentIds.some((id) => canonicalDepartmentId(id) === canonical);
  });
}

/**
 * Produces bounded NORA metadata for a selected tool record (<= 2000 chars).
 * Strictly excludes any secret values.
 */
export function toolScope(record: ToolRecord) {
  return {
    id: record.id,
    title: record.title,
    kind: record.kind,
    context: JSON.stringify({
      recordId: record.id,
      domain: record.domain,
      provider: record.provider ?? 'Not recorded',
      purpose: record.purpose,
      configuration: record.configuration,
      state: {
        defined: record.state.defined,
        configured: record.state.configured,
        permitted: record.state.permitted,
        authenticated: record.state.authenticated,
        reachable: record.state.reachable,
        used: record.state.used,
      },
      availabilityDetail: record.availabilityDetail ?? null,
      authDetail: record.authDetail ?? null,
      usageDetail: record.usageDetail ?? null,
      relationships: record.relationships.slice(0, 5).map((link) => ({ targetId: link.targetId, type: link.type })),
      interpretation: 'Selected record only. Null configuration/permission is unverified. used=false means no exactly attributed receipt in this view, not proof of no historical use. Catalogued != available; configured != authenticated; approval policy != effective grant; unprobed != offline. No credentials are exposed.',
    }).slice(0, 2000),
  };
}
