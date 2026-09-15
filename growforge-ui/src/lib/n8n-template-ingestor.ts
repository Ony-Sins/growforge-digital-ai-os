/**
 * n8n Template Ingestor  (src/lib/n8n-template-ingestor.ts)
 *
 * Autonomously fetches community workflow templates from the n8n public API,
 * extracts node schemas / trigger definitions, and sanitises the JSON so that
 * every hardcoded credential, personal URL, and API-key literal is stripped
 * before the result is handed to Planning or AI-Automation agents.
 *
 * Architecture:
 *   1. Search n8n.io/workflows for a goal keyword via their public JSON feed.
 *   2. Fetch the full workflow JSON for matching templates.
 *   3. Run sanitiseWorkflow() which walks every node and strips:
 *        - credentials blocks
 *        - parameters that look like tokens/keys/passwords
 *        - hard-coded URLs that contain auth strings
 *   4. Return a TemplateResult[] for the orchestrator to pattern-match against.
 *
 * Usage (server-side only):
 *   import { ingestN8nTemplates } from "@/lib/n8n-template-ingestor";
 *   const templates = await ingestN8nTemplates("lead generation");
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TemplateSearchHit {
  /** Numeric template ID on n8n.io */
  id: number;
  name: string;
  description: string;
  /** How many times this template has been used (popularity signal) */
  totalViews: number;
  /** ISO date string */
  createdAt: string;
  /** Trigger nodes found in the template (e.g. "n8n-nodes-base.webhook") */
  triggerTypes: string[];
  /** App/service node types referenced (deduped) */
  appNodes: string[];
}

export interface SanitisedNode {
  /** n8n node type, e.g. "n8n-nodes-base.httpRequest" */
  type: string;
  /** Human-readable node name from the canvas */
  name: string;
  /** Node type version */
  typeVersion?: number;
  /** Sanitised parameter map — credentials and secrets are redacted */
  parameters: Record<string, unknown>;
  /** All credential type refs the node declared (names redacted, types kept) */
  credentialTypes: string[];
}

export interface SanitisedWorkflow {
  id: number;
  name: string;
  description: string;
  /** The workflow's top-level trigger node (first node with isTrigger=true) */
  triggerType: string | null;
  nodes: SanitisedNode[];
  /** Deduplicated service/app types referenced in the workflow */
  appNodes: string[];
  /** Raw connections map for reconstructing execution order */
  connections: Record<string, unknown>;
  /** Workflow-level settings, minus any auth fields */
  settings: Record<string, unknown>;
  /** How many total nodes exist (including system/passthrough nodes) */
  totalNodeCount: number;
}

export interface TemplateResult {
  hit: TemplateSearchHit;
  workflow: SanitisedWorkflow | null;
  /** Null unless fetching the full workflow failed */
  fetchError: string | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const N8N_API_BASE = "https://api.n8n.io/api/templates";
const USER_AGENT = "GrowForge-AI-OS/1.0 (template-ingestor)";

/** Regex patterns that identify credential/secret-like parameter names */
const SECRET_KEY_RE =
  /api[_-]?key|api[_-]?secret|access[_-]?token|bearer[_-]?token|auth[_-]?token|password|passwd|secret|private[_-]?key|client[_-]?secret|webhook[_-]?secret|oauth|credential/i;

/** Parameter values that look like real secrets (base64/hex blobs, JWT fragments) */
const SECRET_VALUE_RE =
  /^(Bearer\s+|sk-|pk-|ghp_|AIza|AKIA|ya29\.|ey[A-Za-z0-9-_]{10,}\.|[A-Za-z0-9+/]{40,}={0,2}).*$/;

/** Redact secrets from a single parameter value */
function redactValue(key: string, value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (SECRET_KEY_RE.test(key)) return "<REDACTED>";
  if (SECRET_VALUE_RE.test(value)) return "<REDACTED>";
  return value;
}

/** Walk a parameters object recursively and redact sensitive fields */
function sanitiseParameters(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      out[k] = sanitiseParameters(v as Record<string, unknown>);
    } else if (Array.isArray(v)) {
      out[k] = v.map((item) =>
        item !== null && typeof item === "object"
          ? sanitiseParameters(item as Record<string, unknown>)
          : redactValue(k, item),
      );
    } else {
      out[k] = redactValue(k, v);
    }
  }
  return out;
}

/** Determine if a node type is a trigger (webhook, schedule, event-based) */
function isTriggerNode(type: string): boolean {
  const lower = type.toLowerCase();
  return (
    lower.includes("trigger") ||
    lower.includes("webhook") ||
    lower.includes("schedule") ||
    lower.includes("cron") ||
    lower.includes("interval") ||
    lower.endsWith(".start")
  );
}

/** Strip non-core service names from a node type string for brevity */
function normaliseNodeType(type: string): string {
  // e.g. "n8n-nodes-base.httpRequest" -> "httpRequest"
  const parts = type.split(".");
  return parts[parts.length - 1] || type;
}

// ---------------------------------------------------------------------------
// Core sanitiser
// ---------------------------------------------------------------------------

/**
 * Takes a raw n8n workflow JSON object (as returned by the public API) and
 * returns a SanitisedWorkflow safe to pass to agents/LLMs.
 */
export function sanitiseWorkflow(
  raw: Record<string, unknown>,
  id: number,
  name: string,
  description: string,
): SanitisedWorkflow {
  const rawNodes = Array.isArray(raw.nodes) ? (raw.nodes as Record<string, unknown>[]) : [];

  let triggerType: string | null = null;
  const appNodeSet = new Set<string>();

  const PASSTHROUGH_NODES = new Set([
    "start", "noOp", "stickyNote", "set", "code", "function",
    "if", "switch", "merge", "splitInBatches", "itemLists",
  ]);

  const nodes: SanitisedNode[] = rawNodes.map((node) => {
    const type = typeof node.type === "string" ? node.type : "unknown";
    const nodeName = typeof node.name === "string" ? node.name : type;
    const typeVersion = typeof node.typeVersion === "number" ? node.typeVersion : undefined;

    // Collect trigger type (first trigger wins)
    if (!triggerType && isTriggerNode(type)) triggerType = type;

    // Collect app/service nodes (skip built-in passthrough nodes)
    const normed = normaliseNodeType(type);
    if (!PASSTHROUGH_NODES.has(normed)) {
      appNodeSet.add(type);
    }

    // Extract credential type names (strip actual keys/IDs)
    const rawCreds =
      node.credentials !== null && typeof node.credentials === "object"
        ? (node.credentials as Record<string, unknown>)
        : {};
    const credentialTypes = Object.keys(rawCreds);

    // Sanitise parameters
    const rawParams =
      node.parameters !== null && typeof node.parameters === "object"
        ? (node.parameters as Record<string, unknown>)
        : {};
    const parameters = sanitiseParameters(rawParams);

    return { type, name: nodeName, typeVersion, parameters, credentialTypes };
  });

  const connections =
    raw.connections !== null && typeof raw.connections === "object"
      ? (raw.connections as Record<string, unknown>)
      : {};

  const rawSettings =
    raw.settings !== null && typeof raw.settings === "object"
      ? (raw.settings as Record<string, unknown>)
      : {};
  // Sanitise settings in case someone embedded auth tokens there
  const settings = sanitiseParameters(rawSettings);

  return {
    id,
    name,
    description,
    triggerType,
    nodes,
    appNodes: [...appNodeSet],
    connections,
    settings,
    totalNodeCount: rawNodes.length,
  };
}

// ---------------------------------------------------------------------------
// n8n.io Public API helpers
// ---------------------------------------------------------------------------

/**
 * Search n8n.io public template library for a goal keyword.
 * Returns lightweight search hits (no full workflow JSON yet).
 *
 * @param keyword  Natural-language goal, e.g. "lead generation" or "Slack notify"
 * @param limit    Max results to return (default 10, max 50)
 */
export async function searchN8nTemplates(keyword: string, limit = 10): Promise<TemplateSearchHit[]> {
  if (!keyword.trim()) return [];

  const safeLimit = Math.min(Math.max(1, limit), 50);
  const url = `${N8N_API_BASE}/search?text=${encodeURIComponent(keyword.trim())}&limit=${safeLimit}`;

  let data: Record<string, unknown>;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      throw new Error(`n8n template search failed: HTTP ${res.status} ${res.statusText}`);
    }
    data = (await res.json()) as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      `n8n template search network error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const items = Array.isArray(data.workflows)
    ? (data.workflows as Record<string, unknown>[])
    : Array.isArray(data)
      ? (data as Record<string, unknown>[])
      : [];

  return items.slice(0, safeLimit).map((item): TemplateSearchHit => {
    const rawNodes = Array.isArray(item.nodes)
      ? (item.nodes as Record<string, unknown>[])
      : Array.isArray((item.workflow as Record<string, unknown> | undefined)?.nodes)
        ? ((item.workflow as Record<string, unknown>).nodes as Record<string, unknown>[])
        : [];

    const triggerTypes = rawNodes
      .filter((n) => typeof n.type === "string" && isTriggerNode(n.type))
      .map((n) => n.type as string);

    const appNodeSet = new Set<string>();
    rawNodes.forEach((n) => {
      if (typeof n.type === "string") appNodeSet.add(n.type);
    });

    return {
      id: typeof item.id === "number" ? item.id : Number(item.id) || 0,
      name: typeof item.name === "string" ? item.name : "Untitled",
      description: typeof item.description === "string" ? item.description : "",
      totalViews: typeof item.totalViews === "number" ? item.totalViews : 0,
      createdAt: typeof item.createdAt === "string" ? item.createdAt : "",
      triggerTypes,
      appNodes: [...appNodeSet],
    };
  });
}

/**
 * Fetch a single template by ID from n8n.io and return a sanitised workflow.
 */
export async function fetchAndSanitiseTemplate(templateId: number): Promise<SanitisedWorkflow> {
  const url = `${N8N_API_BASE}/workflows/${templateId}`;

  let data: Record<string, unknown>;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      throw new Error(`n8n template fetch failed: HTTP ${res.status} ${res.statusText}`);
    }
    data = (await res.json()) as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      `n8n template fetch network error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // n8n API shape: { id, name, description, workflow: { nodes, connections, settings } }
  const workflowRaw =
    data.workflow !== null && typeof data.workflow === "object"
      ? (data.workflow as Record<string, unknown>)
      : data;

  const id = typeof data.id === "number" ? data.id : Number(data.id) || templateId;
  const name = typeof data.name === "string" ? data.name : "Untitled";
  const description = typeof data.description === "string" ? data.description : "";

  return sanitiseWorkflow(workflowRaw, id, name, description);
}

/**
 * Combined convenience helper: search for a keyword, fetch + sanitise up to
 * `maxFetch` of the top results, and return them as TemplateResult[].
 *
 * This is what agents call via the n8nTemplateTool.
 */
export async function ingestN8nTemplates(
  keyword: string,
  opts: {
    /** Max search hits to return (default 5) */
    searchLimit?: number;
    /** Max full workflows to fetch and sanitise (default 3, to avoid slow responses) */
    maxFetch?: number;
  } = {},
): Promise<TemplateResult[]> {
  const searchLimit = opts.searchLimit ?? 5;
  const maxFetch = opts.maxFetch ?? 3;

  const hits = await searchN8nTemplates(keyword, searchLimit);
  const results: TemplateResult[] = [];

  const toFetch = hits.slice(0, maxFetch);

  // Fetch in parallel (limited to maxFetch, already small)
  const settled = await Promise.allSettled(
    toFetch.map((hit) => fetchAndSanitiseTemplate(hit.id)),
  );

  for (let i = 0; i < toFetch.length; i++) {
    const hit = toFetch[i];
    const result = settled[i];
    if (result.status === "fulfilled") {
      results.push({ hit, workflow: result.value, fetchError: null });
    } else {
      results.push({
        hit,
        workflow: null,
        fetchError: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  }

  // Append any hits we did not fetch full workflows for (metadata-only)
  for (let i = maxFetch; i < hits.length; i++) {
    results.push({ hit: hits[i], workflow: null, fetchError: null });
  }

  return results;
}
