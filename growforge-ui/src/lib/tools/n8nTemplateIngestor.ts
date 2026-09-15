import type { Tool, ToolResult } from "@/lib/tools";
import { ingestN8nTemplates, type TemplateResult } from "@/lib/n8n-template-ingestor";

/**
 * Agent Tool: n8n_template_ingestor  (src/lib/tools/n8nTemplateIngestor.ts)
 *
 * Exposes the n8n public template library to Planning and AI-Automation agents.
 * Given a goal keyword the tool:
 *   1. Searches n8n.io for matching community workflows.
 *   2. Fetches the full JSON for the top N results.
 *   3. Sanitises every node (strips credentials / API keys).
 *   4. Returns a structured summary agents can pattern-match against when
 *      generating or adapting n8n workflows from scratch.
 *
 * Agents should use this BEFORE generating a new workflow, to discover whether
 * a community template already covers their automation goal.
 */
export const n8nTemplateTool: Tool = {
  name: "n8n_template_ingestor",
  description:
    "Search the n8n.io community template library for existing automation workflows matching a goal keyword (e.g. 'lead generation', 'HubSpot CRM sync', 'Slack alert'). " +
    "Returns sanitised node schemas, trigger types, and connection maps so you can adapt a proven pattern instead of building from scratch. " +
    "Always call this before generating a new n8n workflow.",
  usage:
    '{ "keyword": "string — goal/use-case to search (e.g. \'lead gen\')", ' +
    '"searchLimit": number (optional, 1-10, default 5 — max search hits), ' +
    '"maxFetch": number (optional, 1-5, default 3 — how many full workflows to fetch and sanitise) }',
  requiresApproval: false,

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const keyword = typeof args.keyword === "string" ? args.keyword.trim() : "";
    if (!keyword) {
      return { ok: false, output: "keyword is required — provide a goal or use-case string." };
    }

    const searchLimit = typeof args.searchLimit === "number"
      ? Math.min(Math.max(1, Math.floor(args.searchLimit)), 10)
      : 5;

    const maxFetch = typeof args.maxFetch === "number"
      ? Math.min(Math.max(1, Math.floor(args.maxFetch)), 5)
      : 3;

    let results: TemplateResult[];
    try {
      results = await ingestN8nTemplates(keyword, { searchLimit, maxFetch });
    } catch (err) {
      return {
        ok: false,
        output:
          `n8n template search failed: ${err instanceof Error ? err.message : String(err)}\n` +
          `Note: This requires an internet connection to api.n8n.io. Proceed by generating a workflow from scratch if offline.`,
      };
    }

    if (results.length === 0) {
      return {
        ok: true,
        output: `No n8n templates found for "${keyword}". Generate a workflow from scratch using the manage_n8n_workflow tool.`,
      };
    }

    // Build a structured text summary for the agent's context window
    const lines: string[] = [
      `Found ${results.length} n8n template(s) for "${keyword}":`,
      "",
    ];

    for (const r of results) {
      lines.push(`### Template ${r.hit.id}: ${r.hit.name}`);
      lines.push(`Description: ${r.hit.description || "(none)"}`);
      lines.push(`Views: ${r.hit.totalViews.toLocaleString()}`);

      if (r.hit.triggerTypes.length > 0) {
        lines.push(`Trigger: ${r.hit.triggerTypes.join(", ")}`);
      }
      if (r.hit.appNodes.length > 0) {
        lines.push(`Apps/Services: ${r.hit.appNodes.slice(0, 8).join(", ")}${r.hit.appNodes.length > 8 ? ` (+${r.hit.appNodes.length - 8} more)` : ""}`);
      }

      if (r.fetchError) {
        lines.push(`Full Workflow: FETCH ERROR — ${r.fetchError}`);
      } else if (r.workflow) {
        const wf = r.workflow;
        lines.push(`Trigger Type: ${wf.triggerType ?? "(none)"}`);
        lines.push(`Total Nodes: ${wf.totalNodeCount}`);
        lines.push(`Unique App Nodes: ${wf.appNodes.join(", ") || "(none)"}`);
        lines.push(`Node Summary:`);
        for (const node of wf.nodes) {
          const credInfo = node.credentialTypes.length > 0
            ? ` [credentials: ${node.credentialTypes.join(", ")}]`
            : "";
          lines.push(
            `  - ${node.name} (${node.type}${node.typeVersion ? ` v${node.typeVersion}` : ""})${credInfo}`,
          );
          // Show non-empty parameters (truncated for context-window efficiency)
          const paramKeys = Object.keys(node.parameters);
          if (paramKeys.length > 0) {
            const preview = JSON.stringify(node.parameters).slice(0, 200);
            lines.push(`    params: ${preview}${JSON.stringify(node.parameters).length > 200 ? "…" : ""}`);
          }
        }
        lines.push(`Connections: ${JSON.stringify(wf.connections).slice(0, 300)}${JSON.stringify(wf.connections).length > 300 ? "…" : ""}`);
      } else {
        lines.push(`Full Workflow: (metadata-only — searchLimit exceeded maxFetch)`);
      }

      lines.push("");
    }

    lines.push(
      "USAGE GUIDANCE: Adapt the node types and connection patterns above when calling manage_n8n_workflow with action='create'. " +
      "You MUST add your own credentials references (do not use <REDACTED> placeholders — those are scrubbed from originals). " +
      "Adjust parameters to match the current client context.",
    );

    return { ok: true, output: lines.join("\n") };
  },
};
