import { getSecretForServerUse } from "@/lib/serverVault";

/**
 * n8n Webhook & REST API Client (src/lib/n8n-client.ts)
 *
 * Provides a type-safe client interface for:
 * 1. Triggering live & test n8n webhooks over HTTP.
 * 2. Querying active workflows and workflow executions.
 * 3. Autonomous dispatch and self-healing workflow execution.
 */

export interface N8nConfig {
  baseUrl: string;
  apiKey: string;
}

export interface N8nWorkflowSummary {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  tags?: Array<{ id: string; name: string }>;
}

export interface N8nWebhookResponse<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  latencyMs: number;
}

export function getN8nConfig(): N8nConfig {
  let vaultKey: string | null = null;
  let vaultHost: string | null = null;
  try {
    vaultKey =
      getSecretForServerUse("integrations:n8n", "apikey") ||
      getSecretForServerUse("integrations", "n8n") ||
      getSecretForServerUse("integrations", "N8N_API_KEY");
    vaultHost = getSecretForServerUse("integrations:n8n", "host");
  } catch {
    // Vault master key uninitialized or unavailable
  }

  const apiKey = vaultKey || process.env.N8N_API_KEY || "";
  const baseUrl = (
    vaultHost ||
    process.env.N8N_HOST ||
    process.env.N8N_BASE_URL ||
    "http://localhost:5678"
  ).replace(/\/$/, "");

  return { baseUrl, apiKey };
}

/**
 * Trigger an n8n Webhook endpoint.
 * Supports standard production webhooks (`/webhook/...`) and test webhooks (`/webhook-test/...`).
 */
export async function triggerWebhook<T = unknown>(
  webhookPath: string,
  payload: Record<string, unknown> = {},
  options: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    testMode?: boolean;
    customHeaders?: Record<string, string>;
    timeoutMs?: number;
  } = {}
): Promise<N8nWebhookResponse<T>> {
  const { baseUrl } = getN8nConfig();
  const method = options.method || "POST";
  const prefix = options.testMode ? "/webhook-test/" : "/webhook/";
  const cleanPath = webhookPath.replace(/^\/(webhook|webhook-test)\//, "").replace(/^\//, "");
  const targetUrl = `${baseUrl}${prefix}${cleanPath}`;

  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || 15000);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "GrowForge-AI-OS/1.0",
      ...options.customHeaders,
    };

    const res = await fetch(targetUrl, {
      method,
      headers: method === "GET" ? options.customHeaders : headers,
      body: method === "GET" ? undefined : JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    let responseData: T | undefined;
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      responseData = (await res.json()) as T;
    } else {
      responseData = (await res.text()) as unknown as T;
    }

    return {
      ok: res.ok,
      status: res.status,
      data: responseData,
      error: res.ok ? undefined : `HTTP ${res.status}: ${res.statusText}`,
      latencyMs,
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;
    const isTimeout = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      status: 0,
      error: isTimeout ? `Webhook timed out after ${options.timeoutMs || 15000}ms` : err instanceof Error ? err.message : String(err),
      latencyMs,
    };
  }
}

/**
 * Fetch all active workflows from n8n REST API.
 */
export async function listActiveWorkflows(): Promise<{
  ok: boolean;
  workflows: N8nWorkflowSummary[];
  error?: string;
}> {
  const { baseUrl, apiKey } = getN8nConfig();
  if (!apiKey) {
    return { ok: false, workflows: [], error: "N8N_API_KEY is not configured." };
  }

  try {
    const res = await fetch(`${baseUrl}/api/v1/workflows?active=true`, {
      headers: {
        "X-N8N-API-KEY": apiKey,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      return { ok: false, workflows: [], error: `n8n API responded with HTTP ${res.status}: ${res.statusText}` };
    }

    const data = await res.json();
    const list: N8nWorkflowSummary[] = (data.data || data || []).map((w: Record<string, unknown>) => ({
      id: String(w.id),
      name: String(w.name || "Untitled"),
      active: Boolean(w.active),
      createdAt: String(w.createdAt || ""),
      updatedAt: String(w.updatedAt || ""),
      tags: Array.isArray(w.tags) ? (w.tags as Array<{ id: string; name: string }>) : [],
    }));

    return { ok: true, workflows: list };
  } catch (err: unknown) {
    return { ok: false, workflows: [], error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Execute a workflow directly via n8n REST API.
 */
export async function executeWorkflow(
  workflowId: string,
  data: Record<string, unknown> = {}
): Promise<{ ok: boolean; executionId?: string; result?: unknown; error?: string }> {
  const { baseUrl, apiKey } = getN8nConfig();
  if (!apiKey) {
    return { ok: false, error: "N8N_API_KEY is not configured." };
  }

  try {
    const res = await fetch(`${baseUrl}/api/v1/workflows/${workflowId}/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-N8N-API-KEY": apiKey,
      },
      body: JSON.stringify({ data }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      return { ok: false, error: `Execution failed (HTTP ${res.status}): ${errBody}` };
    }

    const response = await res.json();
    return {
      ok: true,
      executionId: response.data?.executionId || response.executionId,
      result: response.data?.resultData || response,
    };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Fast Health Probe for the n8n instance.
 */
export async function checkN8nHealth(): Promise<{
  ok: boolean;
  status: number;
  latencyMs: number;
  error?: string;
}> {
  const { baseUrl } = getN8nConfig();
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${baseUrl}/healthz`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    return {
      ok: res.ok,
      status: res.status,
      latencyMs: Date.now() - startTime,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      status: 0,
      latencyMs: Date.now() - startTime,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
