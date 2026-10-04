import assert from 'node:assert/strict';
import { toolRecords, filterTools, toolScope, TOOL_DOMAINS } from '../src/components/spatial/dive/toolModel';
import type { CoreState } from '../src/lib/coreState';
import type { SpatialGraphData } from '../src/lib/spatial/obsidianReader';

console.log('=== TEST DIVE LAYER 7 — TOOLS ===\n');

// 1. Mock CoreState & SpatialGraphData
const mockCoreState: CoreState = {
  generatedAt: new Date().toISOString(),
  jobs: [],
  job: {
    id: 'job-sample',
    title: 'Brand Launch Campaign',
    brief: 'Execute launch campaign',
    status: 'running',
    percent: 60,
    verified: true,
    createdAt: new Date().toISOString(),
    revisionCount: 0,
    liveNoteCount: 0,
    steps: [
      {
        id: 'step-1',
        kind: 'department',
        label: 'Creative Strategy',
        status: 'done',
        percent: 100,
        provider: 'Google (Gemini API)',
        outputChars: 450,
        preview: 'Strategy complete',
        sourceCount: 2,
        tokens: 350,
        costUsd: 0.001,
        costKnown: true,
      },
    ],
    departments: [],
    research: { sourceCount: 0, verified: false, sources: [] },
    finalPreview: '',
    finalChars: 0,
    usage: {
      calls: 1,
      totalTokens: 350,
      durationMs: 1200,
      costUsd: 0.001,
      allCostsKnown: true,
      providers: [
        { provider: 'Google (Gemini API)', model: 'gemini-3.6-flash', calls: 1, tokens: 350 },
      ],
    },
  },
  systems: {
    probes: [
      { id: 'ollama', label: 'Local LLM (Ollama)', online: true, detail: '2 models pulled', latencyMs: 14 },
      { id: 'searxng', label: 'Live research (SearXNG)', online: false, detail: 'not running', latencyMs: null },
      { id: 'n8n', label: 'Automation (n8n)', online: true, detail: 'workflow engine', latencyMs: 8 },
      { id: 'comfyui', label: 'Image generation (ComfyUI)', online: false, detail: 'not running', latencyMs: null },
    ],
    mcp: { count: 1, servers: [{ name: 'filesystem-mcp', toolCount: 2 }] },
    models: {
      count: 5,
      list: [
        { name: 'Omniroute', provider: 'omniroute', isPrimary: false },
        { name: 'Google Gemini', provider: 'gemini', isPrimary: false },
        { name: 'Groq', provider: 'groq', isPrimary: false },
        { name: 'OpenAI', provider: 'openai-compatible', isPrimary: false },
        { name: 'Anthropic', provider: 'anthropic', isPrimary: false },
      ],
    },
    routing: 'cloud-first',
    pendingApprovals: 0,
    pendingConsultations: 0,
    vault: { reachable: true, noteCount: 12, latestDaily: '2026-10-02' },
  },
};

const mockGraph: SpatialGraphData = {
  nodes: [
    {
      id: 'model:gemini-default',
      title: 'Google Gemini',
      source: 'models',
      categoryLabel: 'AI Models',
      color: '#3b82f6',
      path: 'https://generativelanguage.googleapis.com/v1beta',
      excerpt: 'Configured Gemini AI model',
      degree: 1,
    },
    {
      id: 'cap:higgsfield',
      title: 'Higgsfield AI',
      source: 'capabilities',
      categoryLabel: 'Capability Keys',
      color: '#ec4899',
      path: 'Vault Secret / Environment',
      excerpt: 'Direct API capability key for AI video',
      degree: 1,
      departmentId: 'web-design',
    },
    {
      id: 'mcp:filesystem',
      title: 'Filesystem MCP',
      source: 'mcp',
      categoryLabel: 'MCP Connectors',
      color: '#06b6d4',
      path: 'npx @modelcontextprotocol/server-filesystem',
      excerpt: 'Local filesystem access tools',
      degree: 1,
      departmentId: 'ai-automation',
    },
  ],
  links: [
    { source: 'agent:growforge_hq', target: 'model:gemini-default', type: 'structural', relation: 'assignment' },
    { source: 'agent:web_design', target: 'cap:higgsfield', type: 'structural', relation: 'assignment' },
    { source: 'agent:ai_automation', target: 'mcp:filesystem', type: 'structural', relation: 'permission', permissionScopes: ['ai-automation'] },
  ],
  categories: [],
  summary: { totalNotes: 3, totalConnections: 3, totalSources: 3 },
};

// Test 1: Extract records
const records = toolRecords(mockCoreState, mockGraph);
console.log(`[PASS] Extracted ${records.length} tool records across domains.`);

// Test 2: Check all 5 domains are represented
const domainsPresent = new Set(records.map((r) => r.domain));
for (const d of TOOL_DOMAINS) {
  assert.ok(domainsPresent.has(d), `Domain ${d} must be present`);
  console.log(`[PASS] Domain "${d}" populated with ${records.filter((r) => r.domain === d).length} records.`);
}

// Test 3: Truthful State Semantics (Configured != Authenticated, Unprobed != Offline)
const gemini = records.find((r) => r.id === 'model:gemini-default' || r.title === 'Google Gemini');
assert.ok(gemini, 'Google Gemini model record must exist');
assert.equal(gemini.state.defined, true);
assert.equal(gemini.state.configured, null, 'Title/catalog presence alone cannot prove configuration');
assert.equal(gemini.state.permitted, null, 'Approval policy is not an effective grant');
assert.equal(gemini.state.authenticated, false, 'Credential in env does NOT imply verified provider authentication');
assert.ok(gemini.authDetail?.includes('Authentication not verified'), 'Auth detail must state unverified authentication');
assert.equal(gemini.state.reachable, 'not checked', 'Cloud model reachability must be "not checked" if unprobed; never assumed offline');
assert.equal(gemini.state.used, false, 'Display names cannot attribute usage to a canonical model record');

assert.equal(gemini.configuration.find(c => c.label === 'Record ID')?.value, gemini.id);
console.log('[PASS] Model semantics, Configured != Authenticated, and dynamic runtime selection verified.');

// Test 4: Local Service Probes (Reachable vs Not Reachable vs Not Checked)
const ollama = records.find((r) => r.id === 'service:ollama');
assert.ok(ollama, 'Ollama service record must exist');
assert.equal(ollama.state.reachable, 'reachable', 'Ollama is online in probes');
assert.ok(ollama.availabilityDetail?.includes('14ms'), 'Ollama latency must be reported from live probe');

const searxng = records.find((r) => r.id === 'service:searxng');
assert.ok(searxng, 'SearXNG service record must exist');
assert.equal(searxng.state.reachable, 'unreachable', 'SearXNG is offline in probes');
assert.ok(searxng.availabilityDetail?.includes('not running'), 'Offline detail must be truthful');
console.log('[PASS] Local service reachability probe semantics verified.');

// Test 5: Capability Lifecycle Semantics
const higgsfield = records.find((r) => r.id === 'cap:higgsfield');
assert.ok(higgsfield, 'Higgsfield capability record must exist');
assert.equal(higgsfield.domain, 'Capabilities');
assert.equal(higgsfield.kind, 'System Capability Key');
assert.equal(higgsfield.state.reachable, 'not checked', 'Capability backing reachability is not checked, not inferred from active lifecycle status');
const lifecycleConfig = higgsfield.configuration.find((c) => c.label === 'Lifecycle');
assert.ok(lifecycleConfig?.value.includes('Catalogued'), 'Catalog inclusion must not imply availability');
console.log('[PASS] Capability lifecycle vs runtime operational state distinction verified.');

// Test 6: Zero Secret Leakage
for (const r of records) {
  const serialized = JSON.stringify(r);
  assert.ok(!serialized.includes('sk-'), 'No raw OpenAI/Anthropic/Gemini keys');
  assert.ok(!serialized.includes('Bearer secret'), 'No raw bearer tokens');
  assert.ok(!serialized.includes('password'), 'No raw passwords');
}
console.log('[PASS] Zero secret leakage across all tool records verified.');

// Test 7: Contextual Department Filtering
const webDesignTools = filterTools(records, 'web-design');
const hasHiggsfieldInWebDesign = webDesignTools.some((r) => r.id === 'cap:higgsfield');
assert.ok(hasHiggsfieldInWebDesign, 'Higgsfield capability must be present in Web Design tools filter');

const aiAutomationTools = filterTools(records, 'ai-automation');
const hasN8nInAiAutomation = aiAutomationTools.some((r) => r.id === 'service:n8n' || r.id === 'tool:manage_n8n_workflow');
assert.ok(hasN8nInAiAutomation, 'n8n tools must be present in AI Automation tools filter');
console.log('[PASS] Contextual department filtering verified.');

// Test 8: NORA Scope Bounded Serialization
const scope = toolScope(gemini);
assert.equal(scope.id, gemini.id);
assert.equal(scope.title, gemini.title);
assert.ok(scope.context.length <= 2000, `NORA context length (${scope.context.length}) must be <= 2000 chars`);
assert.ok(scope.context.includes('"permitted":null'), 'NORA preserves unknown permission state');

const missing = toolRecords(null, null);
assert.ok(!missing.some(r => ['Models', 'Capabilities', 'Services'].includes(r.domain)), 'Missing reads must not create default configured models/capabilities or offline services');
assert.ok(missing.every(r => r.state.permitted === null && r.state.configured === null && r.state.reachable === 'not checked'));
const preview = toolRecords({...mockCoreState, systems:{...mockCoreState.systems, probes:mockCoreState.systems.probes.map(p=>({...p,detail:'offline in public preview'}))}}, null);
assert.ok(!preview.some(r=>r.domain==='Services'), 'Preview placeholders are not live probes');
const noLatency = toolRecords({...mockCoreState, systems:{...mockCoreState.systems, probes:[{...mockCoreState.systems.probes[0],latencyMs:null}]}}, null);
assert.match(noLatency.find(r=>r.id==='service:ollama')!.availabilityDetail!, /Latency not recorded/);
const metadata = toolRecords(mockCoreState,{...mockGraph,nodes:[{...mockGraph.nodes[0],title:'Renamed provider',content:'**Provider Type:** `ollama`\n**Model ID:** `actual-model`\n**Task Role:** `general`'}]});
assert.equal(metadata.find(r=>r.id==='model:gemini-default')!.provider,'ollama');
assert.equal(metadata.find(r=>r.id==='model:gemini-default')!.configuration.find(c=>c.label==='Recorded Model ID')?.value,'actual-model');
assert.equal(new Set(records.map(r=>r.id)).size,records.length,'Projected record IDs must be unique');
console.log('[PASS] NORA scope serialization verified.');

console.log('\nALL LAYER 7 TOOLS TESTS PASSED SUCCESSFULLY.');
