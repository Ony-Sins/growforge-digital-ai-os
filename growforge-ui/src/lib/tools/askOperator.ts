import type { Tool, ToolResult } from "@/lib/tools";

/**
 * Tool: ask_operator
 * Enables autonomous sub-agents and departments to pause execution and ask the
 * human operator for guidance, clarification, or option selection during planning.
 */

export interface ConsultationHandler {
  (question: string, options?: string[]): Promise<string | null>;
}

let activeConsultationHandler: ConsultationHandler | null = null;

export function setConsultationHandler(handler: ConsultationHandler | null): void {
  activeConsultationHandler = handler;
}

export const askOperatorTool: Tool = {
  name: "ask_operator",
  description:
    "Ask the human operator a strategic, creative, or operational question when a decision or clarification is needed. Pauses the sub-agent loop until answered.",
  usage: '{ "question": "string — a clear, specific question", "options": ["optional choice A", "optional choice B"] }',
  requiresApproval: false,
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const question = typeof args.question === "string" ? args.question.trim() : "";
    if (!question) {
      return { ok: false, output: "question is required." };
    }

    const options = Array.isArray(args.options)
      ? args.options.filter((o): o is string => typeof o === "string" && o.trim().length > 0)
      : undefined;

    if (!activeConsultationHandler) {
      return {
        ok: true,
        output:
          "Operator consultation is currently running in automated mode (no interactive operator online). Proceed with your best high-ROI strategic recommendation and state your assumptions clearly.",
      };
    }

    try {
      const answer = await activeConsultationHandler(question, options);
      if (answer && answer.trim()) {
        return {
          ok: true,
          output: `Operator Answer: "${answer.trim()}" — incorporate this direction directly into your plan.`,
        };
      }
      return {
        ok: true,
        output:
          "Operator did not respond within the time limit. Proceed with your best strategic judgment and highlight this open question in the final output.",
      };
    } catch (err) {
      return {
        ok: false,
        output: `Consultation error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
};
