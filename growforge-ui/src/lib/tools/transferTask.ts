import type { Tool, ToolResult } from "@/lib/tools";

/**
 * Tool: transfer_task
 * Enables autonomous peer-to-peer agent delegation in the Kimi-Style Swarm Architecture.
 * Allows any active agent in the roster to delegate subtasks, variables, and context
 * directly to any other agent without routing back through a rigid central bottleneck.
 */

export interface TaskTransferPayload {
  targetAgent: string;
  task: string;
  variables?: Record<string, unknown>;
  reason?: string;
}

export type TransferTaskHandler = (payload: TaskTransferPayload) => Promise<{ ok: boolean; message: string }>;

let activeTransferHandler: TransferTaskHandler | null = null;

export function setTransferTaskHandler(handler: TransferTaskHandler | null): void {
  activeTransferHandler = handler;
}

export const transferTaskTool: Tool = {
  name: "transfer_task",
  description:
    "Delegate task execution, updated shared variables, and context directly to another specialized agent in the swarm roster (e.g., 'planning', 'lead-gen', 'webmaster', 'copywriter', 'social-media', 'ai-automation', 'qa').",
  usage:
    '{ "targetAgent": "string — target agent ID or name", "task": "string — specific directive/context for target agent", "variables": { "key": "value" }, "reason": "string — rationale for delegation" }',
  requiresApproval: false,
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const targetAgent = typeof args.targetAgent === "string" ? args.targetAgent.trim() : "";
    const task = typeof args.task === "string" ? args.task.trim() : "";
    const reason = typeof args.reason === "string" ? args.reason.trim() : "Peer handoff requested";
    const variables = args.variables && typeof args.variables === "object" ? (args.variables as Record<string, unknown>) : undefined;

    if (!targetAgent) {
      return { ok: false, output: "targetAgent is required for transfer_task." };
    }
    if (!task) {
      return { ok: false, output: "task directive is required for transfer_task." };
    }

    if (!activeTransferHandler) {
      return {
        ok: true,
        output: `Task transfer to agent "${targetAgent}" queued in standalone mode. Task: ${task} (Reason: ${reason})`,
      };
    }

    try {
      const result = await activeTransferHandler({ targetAgent, task, variables, reason });
      return {
        ok: result.ok,
        output: result.message,
      };
    } catch (err) {
      return {
        ok: false,
        output: `Failed to transfer task: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
};
