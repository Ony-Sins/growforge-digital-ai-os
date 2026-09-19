import catalogData from "../../data/public-apis.json";

export const API_CATALOG_CATEGORIES = [
  "business",
  "data-validation",
  "finance",
  "web-scraping",
] as const;

export type ApiCatalogCategory = (typeof API_CATALOG_CATEGORIES)[number];
export type ApiCatalogAuth = "none";

type JsonSchema = {
  type: "object";
  properties?: Record<string, Record<string, unknown>>;
  required?: string[];
  additionalProperties?: boolean;
};

export interface PublicApiToolDefinition {
  name: string;
  description: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  parameters: JsonSchema;
}

export interface PublicApiDefinition {
  id: string;
  name: string;
  category: ApiCatalogCategory;
  description: string;
  baseUrl: string;
  docsUrl: string;
  auth: ApiCatalogAuth;
  https: boolean;
  rateLimitNote: string;
  tools: PublicApiToolDefinition[];
}

export interface ApiCatalogQuery {
  category?: ApiCatalogCategory | ApiCatalogCategory[];
  auth?: ApiCatalogAuth;
  httpsOnly?: boolean;
  search?: string;
}

export interface AgentToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: JsonSchema;
  };
  metadata: {
    apiId: string;
    apiName: string;
    category: ApiCatalogCategory;
    method: PublicApiToolDefinition["method"];
    url: string;
    docsUrl: string;
  };
}

const PUBLIC_API_CATALOG = catalogData as PublicApiDefinition[];

function matchesCategory(
  entry: PublicApiDefinition,
  category: ApiCatalogQuery["category"],
): boolean {
  if (!category) return true;
  return Array.isArray(category) ? category.includes(entry.category) : entry.category === category;
}

function matchesSearch(entry: PublicApiDefinition, search?: string): boolean {
  if (!search?.trim()) return true;
  const needle = search.trim().toLowerCase();
  return [entry.id, entry.name, entry.description, entry.category].some((value) =>
    value.toLowerCase().includes(needle),
  );
}

export function queryApiCatalog(query: ApiCatalogQuery = {}): PublicApiDefinition[] {
  return PUBLIC_API_CATALOG.filter(
    (entry) =>
      matchesCategory(entry, query.category) &&
      (!query.auth || entry.auth === query.auth) &&
      (!query.httpsOnly || entry.https) &&
      matchesSearch(entry, query.search),
  );
}

export function getPublicApi(apiId: string): PublicApiDefinition | undefined {
  return PUBLIC_API_CATALOG.find((entry) => entry.id === apiId);
}

export function getAgentToolSchemas(query: ApiCatalogQuery = {}): AgentToolSchema[] {
  return queryApiCatalog(query).flatMap((api) =>
    api.tools.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
      metadata: {
        apiId: api.id,
        apiName: api.name,
        category: api.category,
        method: tool.method,
        url: `${api.baseUrl}${tool.path}`,
        docsUrl: api.docsUrl,
      },
    })),
  );
}

export function listApiCatalog(): PublicApiDefinition[] {
  return [...PUBLIC_API_CATALOG];
}

export interface ExecutableTool {
  name: string;
  description: string;
  usage: string;
  requiresApproval: boolean;
  execute(args: Record<string, unknown>): Promise<{ ok: boolean; output: string }>;
}

/**
 * Generates an array of executable Tool objects ready for the agent tool loop.
 */
export function getExecutablePublicApiTools(query: ApiCatalogQuery = {}): ExecutableTool[] {
  const apis = queryApiCatalog(query);
  const tools: ExecutableTool[] = [];

  for (const api of apis) {
    for (const tool of api.tools) {
      tools.push({
        name: tool.name,
        description: `[Public API: ${api.name}] ${tool.description}`,
        usage: JSON.stringify(tool.parameters.properties ?? {}),
        requiresApproval: false,
        async execute(args: Record<string, unknown>) {
          const { executePublicApiCall } = await import("./security/toolBroker");
          return executePublicApiCall({
            method: tool.method,
            baseUrl: api.baseUrl,
            path: tool.path,
            args,
          });
        },
      });
    }
  }

  return tools;
}

/**
 * Directly execute a public API tool by name.
 */
export async function invokePublicApiTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ ok: boolean; output: string } | null> {
  for (const api of PUBLIC_API_CATALOG) {
    const tool = api.tools.find((t) => t.name === toolName);
    if (tool) {
      const { executePublicApiCall } = await import("./security/toolBroker");
      return executePublicApiCall({
        method: tool.method,
        baseUrl: api.baseUrl,
        path: tool.path,
        args,
      });
    }
  }
  return null;
}
