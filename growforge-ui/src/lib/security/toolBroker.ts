/**
 * Scoped Credential & Tool Broker
 *
 * Enforces execution isolation and data boundary safety:
 * 1. Sandboxes tool arguments and sanitizes outputs.
 * 2. Scrub credentials, keys, and tokens from all tool outputs and logs.
 * 3. Enforces domain and network safety (SSRF protection, cloud metadata blocking).
 * 4. Provides safe dispatch for zero-auth public API catalog tools.
 */

export interface ToolBrokerResult {
  ok: boolean;
  output: string;
}

// Common patterns for sensitive keys and tokens
const SECRET_PATTERNS = [
  // OpenAI
  /sk-[A-Za-z0-9_-]{20,}/g,
  // Anthropic
  /sk-ant-[A-Za-z0-9_-]{20,}/g,
  // Google API Key
  /AIza[0-9A-Za-z-_]{35}/g,
  // GitHub Personal Access Token
  /gh[pousr]_[A-Za-z0-9_]{36,}/g,
  // Slack Tokens
  /xox[baprs]-[0-9A-Za-z-]{10,}/g,
  // Bearer Token in headers/text
  /Bearer\s+([a-zA-Z0-9_\-\.]{15,})/gi,
  // Generic key/secret assignment patterns
  /(?:api[_-]?key|auth[_-]?token|secret|password|private[_-]?key)\s*[:=]\s*["']?([a-zA-Z0-9_\-\.]{12,})["']?/gi,
];

// Blocked private / cloud metadata hostnames
const BLOCKED_HOSTS = [
  "169.254.169.254", // AWS/GCP/Azure Instance Metadata Service
  "metadata.google.internal",
  "metadata.internal",
  "100.100.100.200", // Alibaba Cloud metadata
  "0.0.0.0",
  "::1",
];

/**
 * Scrub sensitive credentials, keys, and tokens from any text or output.
 */
export function scrubSecrets(input: string): string {
  if (!input || typeof input !== "string") return "";

  let cleaned = input;

  for (const pattern of SECRET_PATTERNS) {
    cleaned = cleaned.replace(pattern, (match, captured) => {
      if (captured && match.includes(captured)) {
        return match.replace(captured, "[REDACTED_SECRET]");
      }
      return "[REDACTED_SECRET]";
    });
  }

  // Also check against any active environment secrets if present
  const sensitiveEnvVars = [
    process.env.OPENAI_API_KEY,
    process.env.ANTHROPIC_API_KEY,
    process.env.GEMINI_API_KEY,
    process.env.GROQ_API_KEY,
    process.env.OPENROUTER_API_KEY,
    process.env.N8N_API_KEY,
    process.env.AUTH_SECRET,
    process.env.NEXTAUTH_SECRET,
  ];

  for (const secret of sensitiveEnvVars) {
    if (secret && secret.length >= 8) {
      cleaned = cleaned.split(secret).join("[REDACTED_SECRET]");
    }
  }

  return cleaned;
}

/**
 * Validates a target URL against SSRF and cloud metadata risks.
 */
export function isSafeOutboundUrl(targetUrl: string, allowLocalhost = false): { safe: boolean; reason?: string } {
  try {
    const parsed = new URL(targetUrl);

    // Protocol check
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { safe: false, reason: `Disallowed protocol: ${parsed.protocol}` };
    }

    const hostname = parsed.hostname.toLowerCase();

    // Check blocked cloud metadata hosts
    if (BLOCKED_HOSTS.includes(hostname)) {
      return { safe: false, reason: `Blocked metadata service target: ${hostname}` };
    }

    // Check private loopback if not explicitly permitted
    const isLoopback = hostname === "localhost" || hostname === "127.0.0.1" || hostname.startsWith("127.");
    if (isLoopback && !allowLocalhost) {
      return { safe: false, reason: `Direct loopback requests are restricted for this tool: ${hostname}` };
    }

    return { safe: true };
  } catch (err) {
    return { safe: false, reason: `Invalid URL format: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Sanitize and validate tool arguments to prevent prototype pollution or control injection.
 */
export function sanitizeToolArgs(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return {};
  }

  const safeRecord: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args)) {
    // Avoid prototype pollution keys
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      continue;
    }

    if (typeof value === "string") {
      safeRecord[key] = value.trim();
    } else if (typeof value === "number" || typeof value === "boolean" || value === null) {
      safeRecord[key] = value;
    } else if (typeof value === "object" && value !== null) {
      safeRecord[key] = sanitizeToolArgs(value);
    }
  }

  return safeRecord;
}

export interface PublicApiExecutionOptions {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  baseUrl: string;
  path: string;
  args: Record<string, unknown>;
  timeoutMs?: number;
}

/**
 * Safely execute a zero-auth public API request with sanitization & credential protection.
 */
export async function executePublicApiCall(opts: PublicApiExecutionOptions): Promise<ToolBrokerResult> {
  const sanitizedArgs = sanitizeToolArgs(opts.args);
  const timeoutMs = opts.timeoutMs ?? 10000;

  try {
    let resolvedPath = opts.path;
    const queryParams: Record<string, string> = {};

    // Process path variables e.g. /country/{country}/indicator/{indicator}
    for (const [key, val] of Object.entries(sanitizedArgs)) {
      const placeholder = `{${key}}`;
      if (resolvedPath.includes(placeholder)) {
        resolvedPath = resolvedPath.replace(placeholder, encodeURIComponent(String(val)));
      } else if (opts.method === "GET") {
        if (val !== undefined && val !== null) {
          queryParams[key] = String(val);
        }
      }
    }

    // Build final target URL
    const cleanBaseUrl = opts.baseUrl.replace(/\/+$/, "");
    const cleanPath = resolvedPath.startsWith("/") ? resolvedPath : `/${resolvedPath}`;
    const urlObj = new URL(`${cleanBaseUrl}${cleanPath}`);

    for (const [qKey, qVal] of Object.entries(queryParams)) {
      urlObj.searchParams.set(qKey, qVal);
    }

    const fullUrl = urlObj.toString();

    // Verify outbound safety
    const safetyCheck = isSafeOutboundUrl(fullUrl);
    if (!safetyCheck.safe) {
      return {
        ok: false,
        output: `Security violation: ${safetyCheck.reason}`,
      };
    }

    // Execute HTTP call with timeout
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const fetchOptions: RequestInit = {
      method: opts.method,
      signal: controller.signal,
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent": "GrowForge-AI-OS/1.0",
      },
    };

    if (opts.method !== "GET" && opts.method !== "DELETE") {
      fetchOptions.headers = {
        ...fetchOptions.headers,
        "Content-Type": "application/json",
      };
      fetchOptions.body = JSON.stringify(sanitizedArgs);
    }

    const res = await fetch(fullUrl, fetchOptions).finally(() => clearTimeout(timer));

    const rawText = await res.text().catch(() => "");
    const scrubbed = scrubSecrets(rawText);

    if (!res.ok) {
      return {
        ok: false,
        output: `HTTP ${res.status} (${res.statusText}): ${scrubbed.slice(0, 500)}`,
      };
    }

    // Trim response output to reasonable context window limit (max 16KB)
    const MAX_OUTPUT_CHARS = 16000;
    const truncatedOutput =
      scrubbed.length > MAX_OUTPUT_CHARS
        ? `${scrubbed.slice(0, MAX_OUTPUT_CHARS)}\n... [Truncated ${scrubbed.length - MAX_OUTPUT_CHARS} characters]`
        : scrubbed;

    return {
      ok: true,
      output: truncatedOutput,
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return {
        ok: false,
        output: `Tool request timed out after ${timeoutMs}ms.`,
      };
    }
    return {
      ok: false,
      output: scrubSecrets(`Public API invocation failed: ${err instanceof Error ? err.message : String(err)}`),
    };
  }
}

export interface SafeExecutableTool {
  name: string;
  execute(args: Record<string, unknown>): Promise<{ ok: boolean; output: string }>;
}

/**
 * Safely dispatch a tool execution through argument sanitization, isolation, and secret scrubbing boundaries.
 */
export async function dispatchSafeTool(
  tool: SafeExecutableTool,
  rawArgs: unknown
): Promise<ToolBrokerResult> {
  try {
    const sanitizedArgs = sanitizeToolArgs(rawArgs);
    const res = await tool.execute(sanitizedArgs);
    const scrubbed = scrubSecrets(res.output ?? "");
    return {
      ok: Boolean(res.ok),
      output: scrubbed,
    };
  } catch (err) {
    return {
      ok: false,
      output: scrubSecrets(`Execution error in tool "${tool.name}": ${err instanceof Error ? err.message : String(err)}`),
    };
  }
}

