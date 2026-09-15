import type { Tool, ToolResult } from "@/lib/tools";
import { getSecretForServerUse } from "@/lib/serverVault";

/**
 * n8n Autonomous Workflow Tool (src/lib/tools/n8n.ts)
 *
 * Allows sub-agents (especially AI Systems / Automation and Web Dev) to construct,
 * test, execute, and activate n8n workflows autonomously over HTTP.
 *
 * Implements a self-healing loop: if an execution or schema error occurs, detailed
 * node/connection error diagnostics are returned back to the model transcript so
 * the agent can patch the workflow JSON and retry.
 */

function getN8nConfig(): { baseUrl: string; apiKey: string } {
  let vaultKey: string | null = null;
  try {
    vaultKey = getSecretForServerUse("integrations", "n8n") || getSecretForServerUse("integrations", "N8N_API_KEY");
  } catch {
    // Vault master key not configured in environment or missing
  }
  const apiKey = vaultKey || process.env.N8N_API_KEY || "";
  const baseUrl = (process.env.N8N_HOST || process.env.N8N_BASE_URL || "http://localhost:5678").replace(/\/$/, "");
  return { baseUrl, apiKey };
}

export const n8nTool: Tool = {
  name: "manage_n8n_workflow",
  description:
    "Construct, test, execute, activate, or patch n8n automation workflows over the n8n REST API. " +
    "Supports self-healing: if an execution fails or node schemas mismatch, error diagnostics are returned for iterative correction.",
  usage:
    '{ "action": "create" | "get" | "patch" | "activate" | "execute" | "list", ' +
    '"workflowId": "string (optional for create/list)", ' +
    '"workflow": { "name": "string", "nodes": [...], "connections": {...}, "settings": {...} } (for create/patch), ' +
    '"inputData": object (payload for execute) }',
  requiresApproval: false,
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const { baseUrl, apiKey } = getN8nConfig();
    const action = typeof args.action === "string" ? args.action.toLowerCase().trim() : "list";
    const workflowId = typeof args.workflowId === "string" ? args.workflowId.trim() : "";
    const workflow = args.workflow && typeof args.workflow === "object" ? args.workflow : undefined;
    const inputData = args.inputData && typeof args.inputData === "object" ? args.inputData : {};

    const validActions = ["list", "get", "create", "patch", "activate", "execute"];
    if (!validActions.includes(action)) {
      return {
        ok: false,
        output: `Unknown n8n action '${action}'. Valid actions: ${validActions.join(", ")}.`,
      };
    }

    if (action === "create" && !workflow) {
      return { ok: false, output: "workflow object with 'name', 'nodes', and 'connections' is required for 'create'." };
    }
    if (action === "patch" && !workflowId) {
      return { ok: false, output: "workflowId is required for 'patch' action." };
    }
    if (action === "patch" && !workflow) {
      return { ok: false, output: "workflow update object is required for 'patch' action." };
    }
    if (action === "get" && !workflowId) {
      return { ok: false, output: "workflowId is required for 'get' action." };
    }
    if (action === "activate" && !workflowId) {
      return { ok: false, output: "workflowId is required for 'activate' action." };
    }
    if (action === "execute" && !workflowId) {
      return { ok: false, output: "workflowId is required for 'execute' action." };
    }

    if (!apiKey && (action === "create" || action === "patch" || action === "activate" || action === "execute")) {
      return {
        ok: false,
        output:
          `N8N_API_KEY is required for action '${action}' but is not yet configured.\n` +
          `Setup instructions:\n` +
          `1. Open your n8n instance at ${baseUrl}\n` +
          `2. Go to Settings → n8n API and click 'Create API Key'\n` +
          `3. Store the API key in GrowForge via Settings → Integrations, or set N8N_API_KEY in .env.local.`,
      };
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (apiKey) {
      headers["X-N8N-API-KEY"] = apiKey;
    }

    try {
      if (action === "list") {
        const res = await fetch(`${baseUrl}/api/v1/workflows`, { headers });
        if (!res.ok) {
          const errText = await res.text();
          return {
            ok: false,
            output: `Failed to list n8n workflows (HTTP ${res.status}): ${errText.slice(0, 300)}`,
          };
        }
        const data = await res.json();
        const workflows = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
        const summary = workflows.map((w: Record<string, unknown>) => `- ID: ${w.id} | Name: ${w.name} | Active: ${w.active}`).join("\n");
        return { ok: true, output: `n8n Workflows (${workflows.length}):\n${summary || "(no workflows found)"}` };
      }

      if (action === "get") {
        if (!workflowId) return { ok: false, output: "workflowId is required for 'get' action." };
        const res = await fetch(`${baseUrl}/api/v1/workflows/${encodeURIComponent(workflowId)}`, { headers });
        if (!res.ok) {
          const err = await res.text();
          return { ok: false, output: `n8n Workflow ${workflowId} not found (HTTP ${res.status}): ${err}` };
        }
        const data = await res.json();
        return { ok: true, output: `n8n Workflow Data:\n${JSON.stringify(data, null, 2)}` };
      }

      if (action === "create") {
        if (!workflow) {
          return { ok: false, output: "workflow object with 'name', 'nodes', and 'connections' is required for 'create'." };
        }
        const res = await fetch(`${baseUrl}/api/v1/workflows`, {
          method: "POST",
          headers,
          body: JSON.stringify(workflow),
        });
        const respText = await res.text();
        let respJson: Record<string, unknown> | null = null;
        try {
          respJson = JSON.parse(respText);
        } catch {
          // non-json response
        }

        if (!res.ok) {
          return {
            ok: false,
            output: `n8n Workflow Creation Failed (HTTP ${res.status}): ${respText}. Self-Healing Note: Verify node types, parameters, and connection syntax, then retry.`,
          };
        }
        const createdId = (respJson?.id as string) || (respJson?.data as Record<string, unknown>)?.id || "unknown";
        return {
          ok: true,
          output: `Successfully created n8n workflow. ID: ${createdId}\nDetails: ${JSON.stringify(respJson, null, 2)}`,
        };
      }

      if (action === "patch") {
        if (!workflowId) return { ok: false, output: "workflowId is required for 'patch' action." };
        if (!workflow) return { ok: false, output: "workflow update object is required for 'patch' action." };

        const res = await fetch(`${baseUrl}/api/v1/workflows/${encodeURIComponent(workflowId)}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(workflow),
        });
        const respText = await res.text();
        if (!res.ok) {
          return {
            ok: false,
            output: `n8n Workflow Patch Failed (HTTP ${res.status}): ${respText}. Self-Healing Note: Review error details and adjust the node configuration payload.`,
          };
        }
        return { ok: true, output: `Workflow ${workflowId} successfully updated:\n${respText}` };
      }

      if (action === "activate") {
        if (!workflowId) return { ok: false, output: "workflowId is required for 'activate' action." };
        const res = await fetch(`${baseUrl}/api/v1/workflows/${encodeURIComponent(workflowId)}/activate`, {
          method: "POST",
          headers,
        });
        if (!res.ok) {
          const err = await res.text();
          return { ok: false, output: `Failed to activate n8n workflow ${workflowId} (HTTP ${res.status}): ${err}` };
        }
        return { ok: true, output: `n8n Workflow ${workflowId} is now ACTIVE.` };
      }

      if (action === "execute") {
        if (!workflowId) return { ok: false, output: "workflowId is required for 'execute' action." };
        // Trigger manual execution via n8n API
        const res = await fetch(`${baseUrl}/api/v1/workflows/${encodeURIComponent(workflowId)}/run`, {
          method: "POST",
          headers,
          body: JSON.stringify({ data: inputData }),
        });
        const respText = await res.text();
        let resultJson: Record<string, unknown> | null = null;
        try {
          resultJson = JSON.parse(respText);
        } catch {
          // raw text
        }

        if (!res.ok) {
          return {
            ok: false,
            output: `n8n Execution Failed (HTTP ${res.status}): ${respText}. Self-Healing Diagnostic: The execution encountered an error. You can inspect the error, patch the workflow using action 'patch', and retry.`,
          };
        }

        return {
          ok: true,
          output: `n8n Workflow ${workflowId} Execution Succeeded:\n${JSON.stringify(resultJson ?? respText, null, 2)}`,
        };
      }

      return {
        ok: false,
        output: `Unknown n8n action '${action}'. Valid actions: create, get, patch, activate, execute, list.`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        output: `n8n Network Connection Error (${baseUrl}): ${msg}. Verify that n8n is running and accessible at N8N_HOST.`,
      };
    }
  },
};
