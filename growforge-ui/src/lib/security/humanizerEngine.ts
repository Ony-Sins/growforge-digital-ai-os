/**
 * Universal Anti-Slop / Humanizer Engine
 *
 * Post-processing safety net for agent-generated prose (drafts, client
 * updates, social copy, proposals) — complements the prompt-level
 * anti-AI-tell instructions already in /api/router/route.ts's system
 * prompt (see state.md §3 item 24) rather than replacing them. Prompting
 * reduces how often a model reaches for stock phrasing; this catches what
 * gets through anyway, deterministically, regardless of which provider
 * generated the text.
 *
 * Deliberately NOT applied to structured data (JSON tool results, code) —
 * see looksLikeStructuredData below. Running buzzword/punctuation cleanup
 * on a JSON payload would corrupt it, not humanize it.
 */

export interface HumanizerResult {
  cleanText: string;
  score: number; // 0-100 — higher reads more human, less templated
  flags: string[];
  placeholders: string[];
}

// Characters some LLM outputs carry that serve no visible purpose — zero-width
// spacing/joining marks, byte-order marks, bidi override controls, variation
// selectors. Invisible in a UI, but a real fingerprint and occasional source
// of copy-paste corruption downstream.
const INVISIBLE_CHAR_PATTERN = /[​‌‍⁠﻿‪-‮︀-️]/g;

// Curly/smart punctuation normalized to plain ASCII — keeps output consistent
// across providers that default to typographic quotes vs. ones that don't.
const PUNCTUATION_MAP: Record<string, string> = {
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  "–": "-",
  "…": "...",
};

// Common stock AI phrasing — replaced with plainer alternatives where a
// direct swap reads naturally, otherwise just flagged so a human reviewer
// notices without the text being silently rewritten around it.
const BANNED_PHRASE_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string | null; flag: string }> = [
  { pattern: /\bdelve into\b/gi, replacement: "look at", flag: "delve into" },
  { pattern: /\bdelve\b/gi, replacement: "look at", flag: "delve" },
  { pattern: /\bleverage(s|d|ing)?\b/gi, replacement: "use$1", flag: "leverage" },
  { pattern: /\bseamless(ly)?\b/gi, replacement: "smooth$1", flag: "seamless" },
  { pattern: /\btestament to\b/gi, replacement: "shows", flag: "testament to" },
  { pattern: /\bin today's fast-paced (world|market|environment|landscape)\b/gi, replacement: null, flag: "in today's fast-paced X" },
  { pattern: /\bin the ever-evolving (world|landscape|space) of\b/gi, replacement: null, flag: "ever-evolving X" },
  { pattern: /\bit's worth noting that\b/gi, replacement: null, flag: "it's worth noting that" },
  { pattern: /\bunlock(s|ed|ing)? (the )?(true )?potential\b/gi, replacement: null, flag: "unlock potential" },
  { pattern: /\bnot just [\w\s]+, but\b/gi, replacement: null, flag: "not just X but Y" },
  { pattern: /\bgame[- ]?chang(er|ing)\b/gi, replacement: null, flag: "game-changer" },
];

/** {{placeholder}} markers — surfaced for human review rather than silently
 *  dropped or fabricated, same convention as the linkedin-agent-skill
 *  reference this engine's spec was drawn from. */
const PLACEHOLDER_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g;

const EM_DASH_PATTERN = /\s*—\s*|\s+--\s+/g;

export function looksLikeStructuredData(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      JSON.parse(trimmed);
      return true;
    } catch {
      // starts like JSON but isn't valid — fall through, treat as prose
    }
  }
  // Fenced code blocks are content, not prose to humanize.
  if (/^```/.test(trimmed) && /```\s*$/.test(trimmed)) return true;
  return false;
}

function stripInvisibleCharacters(text: string): string {
  return text.replace(INVISIBLE_CHAR_PATTERN, "");
}

function normalizePunctuation(text: string): string {
  let out = text;
  for (const [from, to] of Object.entries(PUNCTUATION_MAP)) {
    out = out.split(from).join(to);
  }
  // Em dashes / spaced double-hyphens used as a sentence break read as a
  // structural AI tell at high frequency — normalize to a comma break,
  // which reads naturally in most of the sentence shapes this appears in.
  out = out.replace(EM_DASH_PATTERN, ", ");
  return out;
}

function replaceBannedPhrases(text: string): { text: string; flags: string[] } {
  let out = text;
  const flags: string[] = [];
  for (const { pattern, replacement, flag } of BANNED_PHRASE_REPLACEMENTS) {
    if (pattern.test(out)) {
      flags.push(flag);
      pattern.lastIndex = 0;
      if (replacement !== null) {
        out = out.replace(pattern, replacement);
      }
    }
    pattern.lastIndex = 0;
  }
  return { text: out, flags };
}

function extractPlaceholders(text: string): string[] {
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  PLACEHOLDER_PATTERN.lastIndex = 0;
  while ((match = PLACEHOLDER_PATTERN.exec(text))) {
    found.add(match[1].trim());
  }
  return Array.from(found);
}

/** Sentence-length variance relative to the mean, 0-1 normalized. Real
 *  writing varies sentence length; templated AI output tends toward
 *  uniform medium-length sentences. */
function burstiness(sentences: string[]): number {
  if (sentences.length < 2) return 0.5;
  const lengths = sentences.map((s) => s.trim().split(/\s+/).filter(Boolean).length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  if (mean === 0) return 0;
  const variance = lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / lengths.length;
  const stdev = Math.sqrt(variance);
  return Math.min(1, stdev / mean);
}

/** Density of concrete numbers/proper-noun-like capitalized tokens — a
 *  rough proxy for "says something specific" vs. generic filler. */
function specificity(words: string[]): number {
  if (words.length === 0) return 0;
  const concreteHits = words.filter((w) => /\d/.test(w) || /^[A-Z][a-z]+/.test(w)).length;
  return Math.min(1, concreteHits / words.length / 0.15);
}

function slopDensity(flagCount: number, wordCount: number): number {
  if (wordCount === 0) return 0;
  return Math.min(1, (flagCount * 8) / wordCount);
}

function fingerprint(originalText: string): number {
  const invisibleHits = (originalText.match(INVISIBLE_CHAR_PATTERN) || []).length;
  const emDashHits = (originalText.match(EM_DASH_PATTERN) || []).length;
  return Math.min(1, invisibleHits * 0.5 + emDashHits * 0.1);
}

/** Contraction density — a real, if crude, signal of natural voice vs.
 *  formal/templated phrasing. */
function voice(text: string, wordCount: number): number {
  if (wordCount === 0) return 0;
  const contractions = (text.match(/\b\w+'(t|s|re|ve|ll|d|m)\b/gi) || []).length;
  return Math.min(1, contractions / wordCount / 0.03);
}

/** 0-100 composite score: burstiness, specificity, and voice raise it;
 *  slop density and fingerprint artifacts lower it. Not a detector for
 *  "AI-written" — a heuristic for "reads templated," which is the actual
 *  thing worth catching before content reaches a client. */
export function evaluateDraftQuality(text: string): { score: number; flags: string[]; placeholders: string[] } {
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  const words = text.split(/\s+/).filter(Boolean);
  const { flags } = replaceBannedPhrases(text);

  const b = burstiness(sentences);
  const s = specificity(words);
  const sd = slopDensity(flags.length, words.length);
  const fp = fingerprint(text);
  const v = voice(text, words.length);

  const raw = 0.3 * b + 0.25 * s + 0.2 * v - 0.15 * sd - 0.1 * fp;
  const score = Math.round(Math.max(0, Math.min(1, (raw + 1) / 2)) * 100);

  return { score, flags, placeholders: extractPlaceholders(text) };
}

/** Main entry point — strips invisible characters, normalizes punctuation,
 *  swaps or flags stock AI phrasing, and scores the result. Call sites
 *  decide whether to act on a low score (regenerate, flag for review) —
 *  this function only cleans and reports, never rejects. */
export function sanitizeOutput(text: string): HumanizerResult {
  if (!text || typeof text !== "string") {
    return { cleanText: "", score: 0, flags: [], placeholders: [] };
  }

  const stripped = stripInvisibleCharacters(text);
  const normalized = normalizePunctuation(stripped);
  const { text: cleaned, flags } = replaceBannedPhrases(normalized);
  const { score } = evaluateDraftQuality(text);
  const placeholders = extractPlaceholders(cleaned);

  return { cleanText: cleaned, score, flags, placeholders };
}
