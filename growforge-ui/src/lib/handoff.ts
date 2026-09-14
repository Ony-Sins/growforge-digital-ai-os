import { agents, type Agent } from "@/lib/agents";

export interface HandoffSuggestion {
  sourceAgentId: string;
  targetAgentId: string;
  targetAgentName: string;
  userPrompt: string;
  reason: string;
}

const TASK_TEXT_KEYS = ["taskDescription", "description", "task", "note", "text", "prompt"];

/** Pulls a human-readable task description out of an arbitrary params
 *  object, checking the field names callers commonly use for one. */
export function extractTaskText(params: Record<string, unknown> | undefined): string | null {
  if (!params) return null;
  for (const key of TASK_TEXT_KEYS) {
    const value = params[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

const STOPWORDS = new Set([
  "this",
  "that",
  "with",
  "from",
  "have",
  "will",
  "your",
  "about",
  "into",
  "over",
  "before",
  "after",
]);

/** Bag-of-words overlap between the task text and an agent's declared
 *  division/description. A lightweight, deterministic stand-in for what
 *  would be real per-agent reasoning if agent execution weren't simulated —
 *  see agentStore.ts for the same caveat. */
function scoreAgentMatch(agent: Agent, taskWords: Set<string>): number {
  const haystack = `${agent.division} ${agent.description}`.toLowerCase();
  let score = 0;
  for (const word of taskWords) {
    if (haystack.includes(word)) score++;
  }
  return score;
}

/**
 * Returns a hand-off suggestion when another agent's department clearly
 * matches the task text better than the one it was actually dispatched to,
 * or null when the current agent is a fine match (or there's no task text
 * to judge from at all).
 */
export function detectHandoff(currentAgentId: string, params: Record<string, unknown> | undefined): HandoffSuggestion | null {
  const taskText = extractTaskText(params);
  if (!taskText) return null;

  const words = new Set(
    (taskText.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !STOPWORDS.has(w)),
  );
  if (words.size === 0) return null;

  const currentAgent = agents.find((a) => a.id === currentAgentId);
  const currentScore = currentAgent ? scoreAgentMatch(currentAgent, words) : 0;

  let best: { agent: Agent; score: number } | null = null;
  for (const agent of agents) {
    if (agent.id === currentAgentId || agent.hub) continue;
    const score = scoreAgentMatch(agent, words);
    if (score > 0 && (!best || score > best.score)) best = { agent, score };
  }

  if (!best || best.score <= currentScore) return null;

  return {
    sourceAgentId: currentAgentId,
    targetAgentId: best.agent.id,
    targetAgentName: best.agent.name,
    userPrompt: taskText,
    reason: `"${taskText}" matches ${best.agent.division} (${best.agent.name}) more closely than ${
      currentAgent?.division ?? currentAgentId
    }.`,
  };
}
