import type { Tool, ToolResult } from "@/lib/tools";

/**
 * Tool: complete_directive
 * Enables the final handling agent in the Kimi-Style Swarm Architecture to cleanly
 * declare the directive finished, synthesize multi-agent findings, and deliver the final payload.
 */

export interface DirectiveCompletionPayload {
  summary: string;
  deliverable: string;
  metadata?: Record<string, unknown>;
}

export type CompleteDirectiveHandler = (payload: DirectiveCompletionPayload) => Promise<{ ok: boolean; message: string }>;

let activeCompletionHandler: CompleteDirectiveHandler | null = null;

export function setCompleteDirectiveHandler(handler: CompleteDirectiveHandler | null): void {
  activeCompletionHandler = handler;
}

export const completeDirectiveTool: Tool = {
  name: "complete_directive",
  description:
    "Declare the master directive complete. Consolidates all swarm findings into a high-impact final deliverable for the user and wraps up the swarm execution.",
  usage:
    '{ "summary": "string — high-level summary of all accomplished work", "deliverable": "string — complete consolidated final report/plan/artifact", "metadata": { "key": "value" } }',
  requiresApproval: false,
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const summary = typeof args.summary === "string" ? args.summary.trim() : "";
    const deliverable = typeof args.deliverable === "string" ? args.deliverable.trim() : "";
    const metadata = args.metadata && typeof args.metadata === "object" ? (args.metadata as Record<string, unknown>) : undefined;

    if (!summary) {
      return { ok: false, output: "summary is required for complete_directive." };
    }
    if (!deliverable) {
      return { ok: false, output: "deliverable is required for complete_directive." };
    }

    if (!activeCompletionHandler) {
      return {
        ok: true,
        output: `Directive completed in standalone mode. Summary: ${summary}. Deliverable length: ${deliverable.length} chars.`,
      };
    }

    try {
      const result = await activeCompletionHandler({ summary, deliverable, metadata });
      return {
        ok: result.ok,
        output: result.message,
      };
    } catch (err) {
      return {
        ok: false,
        output: `Failed to complete directive: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
};
