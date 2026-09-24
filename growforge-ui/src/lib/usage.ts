/**
 * Token usage tracking and cost estimation for LLM calls.
 *
 * Every chatComplete() call returns a UsageRecord alongside the text. The
 * orchestrator attaches these to job steps, and the job detail UI renders
 * per-step and aggregate cost breakdowns. The price table below is the
 * single source of truth for cost calculations — unknown models get
 * "cost unknown" rather than a guess.
 *
 * All prices are in USD per 1 million tokens (input / output), sourced
 * from provider pricing pages as of 2026-09-24.
 */

export interface UsageRecord {
  /** Which provider handled the call (gemini, groq, openai, etc.) */
  provider: string;
  /** The exact model slug that ran (e.g. "gemini-3.6-flash", "gpt-4o-mini") */
  model: string;
  /** Prompt / input token count, as reported by the provider API.
   *  null if the provider didn't report it. */
  inputTokens: number | null;
  /** Completion / output token count, as reported by the provider API.
   *  null if the provider didn't report it. */
  outputTokens: number | null;
  /** Wall-clock milliseconds for this LLM call (measured client-side). */
  durationMs: number;
  /** ISO timestamp of when this call completed. */
  timestamp: string;
}

/** Prices per 1M tokens (USD). null = free or unknown. */
interface ModelPrice {
  input: number | null;
  output: number | null;
}

/**
 * Static price table — the ONLY source of cost estimates. Models not in
 * this table get "cost unknown" in the UI. Updated manually from provider
 * pricing pages; re-check quarterly.
 *
 * Prices per 1M tokens, USD.
 */
export const MODEL_PRICES: Record<string, ModelPrice> = {
  // ── Gemini ──
  "gemini-3.6-flash":       { input: 0.10,  output: 0.40 },
  "gemini-2.5-flash":       { input: 0.15,  output: 0.60 },
  "gemini-2.5-pro":         { input: 1.25,  output: 5.00 },
  "gemini-2.0-flash":       { input: 0.10,  output: 0.40 },
  "gemini-1.5-flash":       { input: 0.075, output: 0.30 },
  "gemini-1.5-pro":         { input: 1.25,  output: 5.00 },

  // ── Groq (hosted models — Groq's own pricing, not the upstream model's) ──
  "llama-3.3-70b-versatile": { input: 0.59,  output: 0.79 },
  "llama-3.1-8b-instant":    { input: 0.05,  output: 0.08 },
  "mixtral-8x7b-32768":      { input: 0.24,  output: 0.24 },
  "gemma2-9b-it":            { input: 0.20,  output: 0.20 },

  // ── OpenAI ──
  "gpt-4o":                  { input: 2.50,  output: 10.00 },
  "gpt-4o-mini":             { input: 0.15,  output: 0.60 },
  "gpt-4-turbo":             { input: 10.00, output: 30.00 },
  "gpt-3.5-turbo":           { input: 0.50,  output: 1.50 },
  "o4-mini":                 { input: 1.10,  output: 4.40 },

  // ── Anthropic ──
  "claude-sonnet-5":         { input: 3.00,  output: 15.00 },
  "claude-sonnet-4":         { input: 3.00,  output: 15.00 },
  "claude-haiku-3.5":        { input: 0.80,  output: 4.00 },
  "claude-opus-4":           { input: 15.00, output: 75.00 },
  "claude-3-opus":           { input: 15.00, output: 75.00 },
  "claude-3-haiku":          { input: 0.25,  output: 1.25 },

  // ── OpenRouter free-tier models ──
  "openrouter/free":                              { input: 0, output: 0 },
  "openrouter/auto":                              { input: 0, output: 0 },
  "meta-llama/llama-3.1-8b-instruct":             { input: 0, output: 0 },
  "meta-llama/llama-3.3-70b-instruct:free":       { input: 0, output: 0 },
  "google/gemma-4-31b-it:free":                   { input: 0, output: 0 },
  "deepseek/deepseek-r1:free":                    { input: 0, output: 0 },
  "qwen/qwen-2.5-coder-32b-instruct:free":        { input: 0, output: 0 },
  "cohere/north-mini-code:free":                  { input: 0, output: 0 },
  "nvidia/nemotron-3.5-lightning:free":            { input: 0, output: 0 },

  // ── Local / Ollama ──
  // Local models have zero monetary cost.
  "qwen2.5:7b-instruct":    { input: 0, output: 0 },
  "llava":                   { input: 0, output: 0 },
};

/** BDT/USD exchange rate — approximate, updated manually. */
const BDT_PER_USD = 121.0;

export interface CostEstimate {
  /** Total estimated cost in USD, or null if any usage data is missing. */
  usd: number | null;
  /** Total estimated cost in BDT, or null if USD is null. */
  bdt: number | null;
  /** True if the model was found in MODEL_PRICES. */
  known: boolean;
}

/** Compute estimated cost for a single UsageRecord. */
export function estimateCost(usage: UsageRecord): CostEstimate {
  const price = lookupPrice(usage.model);
  if (!price) {
    return { usd: null, bdt: null, known: false };
  }
  if (usage.inputTokens === null || usage.outputTokens === null) {
    return { usd: null, bdt: null, known: true };
  }
  const inputCost = price.input !== null ? (usage.inputTokens / 1_000_000) * price.input : 0;
  const outputCost = price.output !== null ? (usage.outputTokens / 1_000_000) * price.output : 0;
  const usd = inputCost + outputCost;
  return { usd, bdt: usd * BDT_PER_USD, known: true };
}

/** Look up a model's price entry, trying exact match first, then prefix match. */
function lookupPrice(model: string): ModelPrice | null {
  if (MODEL_PRICES[model]) return MODEL_PRICES[model];
  // Try prefix match for versioned model names (e.g. "gpt-4o-mini-2024-07-18" → "gpt-4o-mini")
  for (const key of Object.keys(MODEL_PRICES)) {
    if (model.startsWith(key)) return MODEL_PRICES[key];
  }
  return null;
}

/** Aggregate multiple UsageRecords into per-provider totals. */
export interface ProviderUsageSummary {
  provider: string;
  model: string;
  calls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalDurationMs: number;
  estimatedCostUsd: number | null;
  estimatedCostBdt: number | null;
  /** True if cost is known for all calls from this provider. */
  costKnown: boolean;
}

export interface JobUsageSummary {
  /** Per-provider breakdown. */
  providers: ProviderUsageSummary[];
  /** Grand totals. */
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalDurationMs: number;
  totalCostUsd: number | null;
  totalCostBdt: number | null;
  /** False if any call had unknown cost. */
  allCostsKnown: boolean;
}

/** Build a full usage summary from an array of UsageRecords. */
export function summarizeUsage(records: UsageRecord[]): JobUsageSummary {
  // Group by "provider::model"
  const groups = new Map<string, { provider: string; model: string; records: UsageRecord[] }>();
  for (const r of records) {
    const key = `${r.provider}::${r.model}`;
    if (!groups.has(key)) groups.set(key, { provider: r.provider, model: r.model, records: [] });
    groups.get(key)!.records.push(r);
  }

  const providers: ProviderUsageSummary[] = [];
  let allCostsKnown = true;

  for (const { provider, model, records: recs } of groups.values()) {
    let totalIn = 0, totalOut = 0, totalMs = 0;
    let costUsd = 0;
    let costKnown = true;
    for (const r of recs) {
      totalIn += r.inputTokens ?? 0;
      totalOut += r.outputTokens ?? 0;
      totalMs += r.durationMs;
      const c = estimateCost(r);
      if (c.usd !== null) {
        costUsd += c.usd;
      } else {
        costKnown = false;
      }
    }
    if (!costKnown) allCostsKnown = false;
    providers.push({
      provider,
      model,
      calls: recs.length,
      totalInputTokens: totalIn,
      totalOutputTokens: totalOut,
      totalDurationMs: totalMs,
      estimatedCostUsd: costKnown ? costUsd : null,
      estimatedCostBdt: costKnown ? costUsd * BDT_PER_USD : null,
      costKnown,
    });
  }

  const totalCalls = records.length;
  const totalInputTokens = providers.reduce((s, p) => s + p.totalInputTokens, 0);
  const totalOutputTokens = providers.reduce((s, p) => s + p.totalOutputTokens, 0);
  const totalDurationMs = providers.reduce((s, p) => s + p.totalDurationMs, 0);
  const totalCostUsd = allCostsKnown ? providers.reduce((s, p) => s + (p.estimatedCostUsd ?? 0), 0) : null;
  const totalCostBdt = totalCostUsd !== null ? totalCostUsd * BDT_PER_USD : null;

  return { providers, totalCalls, totalInputTokens, totalOutputTokens, totalDurationMs, totalCostUsd, totalCostBdt, allCostsKnown };
}

/** Format a token count for human display (e.g. 1234 → "1.2K"). */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

/** Format USD cost for display. */
export function formatUsd(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.001) return `$${n.toFixed(6)}`;
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(4)}`;
}

/** Format BDT cost for display. */
export function formatBdt(n: number): string {
  if (n === 0) return "৳0.00";
  if (n < 0.1) return `৳${n.toFixed(4)}`;
  return `৳${n.toFixed(2)}`;
}

/** Format milliseconds as human-readable duration. */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const min = Math.floor(sec / 60);
  const remainSec = Math.round(sec % 60);
  return `${min}m ${remainSec}s`;
}
