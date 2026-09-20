/**
 * Standalone Deterministic Vault Agent Matcher
 * 
 * Given a freeform text query (e.g. a job brief, task description, or user intent),
 * evaluates all 279 agents in `src/data/vaultCapabilities.json` and ranks them by
 * semantic and keyword relevance.
 *
 * Features:
 * - Pure function, 100% deterministic, zero side-effects.
 * - Zero external API calls, zero additional dependencies.
 * - Multi-field scoring with weighted token matching (name, category, summary, tools, ID).
 * - Multi-word phrase matching and query term coverage boosting.
 * - Stemming & alias normalization for common marketing, coding, design, and analysis terms.
 *
 * @example
 * ```ts
 * import { matchVaultAgents, matchVaultAgentsWithScore } from "@/lib/vaultMatcher";
 * 
 * // 1. Basic Top-15 Match for a Job Brief:
 * const brief = "Design a high-converting B2B SaaS pricing page and write copy in Figma";
 * const bestAgents = matchVaultAgents(brief, 15);
 * console.log(bestAgents.map(a => `${a.emoji} ${a.name} (${a.category})`));
 * 
 * // 2. Detailed Match with Relevance Scores & Matched Keywords:
 * const scored = matchVaultAgentsWithScore("Audit our PostgreSQL database and optimize slow queries", 5);
 * scored.forEach(res => {
 *   console.log(`${res.name}: Score ${res.score.toFixed(1)} [Matched: ${res.matchedTerms.join(", ")}]`);
 * });
 * ```
 */

import vaultDataRaw from "@/data/vaultCapabilities.json";

export interface VaultCapabilityRecord {
  id: string;
  filename: string;
  name: string;
  emoji: string;
  color: string;
  category: string;
  summary: string;
  tools: string[];
  approvalTier: "read-only" | "needs-approval-to-act";
}

export interface VaultMatchResult extends VaultCapabilityRecord {
  score: number;
  matchedTerms: string[];
}

const VAULT_CAPABILITIES: VaultCapabilityRecord[] = vaultDataRaw as VaultCapabilityRecord[];

/** Common English stop words filtered during tokenization to prevent low-signal bias. */
const STOP_WORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "am", "an", "and",
  "any", "are", "aren't", "as", "at", "be", "because", "been", "before", "being",
  "below", "between", "both", "but", "by", "can", "can't", "cannot", "could",
  "couldn't", "did", "didn't", "do", "does", "doesn't", "doing", "don't", "down",
  "during", "each", "few", "for", "from", "further", "had", "hadn't", "has",
  "hasn't", "have", "haven't", "having", "he", "he'd", "he'll", "he's", "her",
  "here", "here's", "hers", "herself", "him", "himself", "his", "how", "how's",
  "i", "i'd", "i'll", "i'm", "i've", "if", "in", "into", "is", "isn't", "it",
  "it's", "its", "itself", "let's", "me", "more", "most", "mustn't", "my",
  "myself", "no", "nor", "not", "of", "off", "on", "once", "only", "or", "other",
  "ought", "our", "ours", "ourselves", "out", "over", "own", "same", "shan't",
  "she", "she'd", "she'll", "she's", "should", "shouldn't", "so", "some", "such",
  "than", "that", "that's", "the", "their", "theirs", "them", "themselves",
  "then", "there", "there's", "these", "they", "they'd", "they'll", "they're",
  "they've", "this", "those", "through", "to", "too", "under", "until", "up",
  "very", "was", "wasn't", "we", "we'd", "we'll", "we're", "we've", "were",
  "weren't", "what", "what's", "when", "when's", "where", "where's", "which",
  "while", "who", "who's", "whom", "why", "why's", "with", "won't", "would",
  "wouldn't", "you", "you'd", "you'll", "you're", "you've", "your", "yours",
  "yourself", "yourselves", "brief", "need", "want", "help", "please", "task",
  "job", "agent", "work", "make", "create", "build", "project", "look", "looking",
]);

/** Domain synonyms and stem expansions */
const STEM_ALIASES: Record<string, string[]> = {
  marketing: ["market", "marketer", "growth", "campaign", "ad", "ads", "promo"],
  advertisement: ["ad", "ads", "advertising", "advertiser", "ppc", "paid"],
  developer: ["dev", "develop", "development", "engineer", "engineering", "code", "coding", "programmer"],
  designer: ["design", "designing", "ui", "ux", "visual", "creative", "graphics", "figma"],
  analytics: ["analyze", "analysis", "analyst", "metrics", "data", "reporting", "dashboard"],
  copywriter: ["copy", "copywriting", "content", "writer", "writing", "blog", "articles", "editorial"],
  security: ["sec", "audit", "cyber", "vulnerability", "pentest", "auth", "owasp"],
  social: ["media", "tiktok", "instagram", "twitter", "linkedin", "facebook", "youtube", "reels"],
  research: ["researcher", "investigate", "academic", "study", "analysis"],
  finance: ["financial", "accounting", "accountant", "valuation", "tax", "audit", "revenue"],
  video: ["footage", "animation", "motion", "editor", "editing", "film", "audio", "sound"],
  seo: ["search", "sem", "ranking", "backlink", "keywords", "serp"],
  backend: ["server", "api", "database", "sql", "postgres", "node", "python", "go"],
  frontend: ["ui", "client", "react", "nextjs", "css", "html", "tailwind", "web"],
};

/** Normalize and clean a string into alphanumeric tokens */
function tokenize(text: string): string[] {
  return (text || "")
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .replace(/[-_]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

/** Extract consecutive 2-word and 3-word n-grams from query for phrase boosting */
function extractPhrases(text: string): string[] {
  const words = (text || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);

  const phrases: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    phrases.push(`${words[i]} ${words[i + 1]}`);
    if (i < words.length - 2) {
      phrases.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
    }
  }
  return phrases;
}

/**
 * Computes a relevance score between a query and a vault agent record.
 */
function scoreAgent(
  record: VaultCapabilityRecord,
  queryTokens: string[],
  queryPhrases: string[],
  rawQueryLower: string
): { score: number; matchedTerms: string[] } {
  let score = 0;
  const matchedTermsSet = new Set<string>();

  const nameLower = record.name.toLowerCase();
  const summaryLower = record.summary.toLowerCase();
  const categoryLower = record.category.toLowerCase();
  const idLower = record.id.toLowerCase();
  const toolsLower = record.tools.map((t) => t.toLowerCase());

  // 1. Direct Multi-word Phrase Matches (Strongest Signal)
  for (const phrase of queryPhrases) {
    if (nameLower.includes(phrase)) {
      score += 24.0;
      matchedTermsSet.add(`name:"${phrase}"`);
    } else if (categoryLower.includes(phrase)) {
      score += 16.0;
      matchedTermsSet.add(`category:"${phrase}"`);
    } else if (summaryLower.includes(phrase)) {
      score += 10.0;
      matchedTermsSet.add(`summary:"${phrase}"`);
    }
  }

  // 2. Full Query In-String Check
  if (rawQueryLower.length > 4) {
    if (nameLower.includes(rawQueryLower)) {
      score += 30.0;
      matchedTermsSet.add(`exact_name_match`);
    } else if (summaryLower.includes(rawQueryLower)) {
      score += 15.0;
      matchedTermsSet.add(`exact_summary_match`);
    }
  }

  // 3. Individual Token Scoring with Field Weights
  let matchedDistinctTokens = 0;

  for (const token of queryTokens) {
    let tokenMatched = false;

    // A. Match against Agent Name (Weight: 10.0 exact, 5.0 prefix)
    if (nameLower === token) {
      score += 12.0;
      tokenMatched = true;
      matchedTermsSet.add(token);
    } else if (nameLower.includes(token)) {
      score += 7.0;
      tokenMatched = true;
      matchedTermsSet.add(token);
    }

    // B. Match against Category (Weight: 6.0)
    if (categoryLower === token || categoryLower.includes(token)) {
      score += 6.0;
      tokenMatched = true;
      matchedTermsSet.add(token);
    }

    // C. Match against Tools (Weight: 7.0 exact tool name, e.g. "figma", "github", "stripe")
    for (const tool of toolsLower) {
      if (tool === token || tool.includes(token)) {
        score += 7.0;
        tokenMatched = true;
        matchedTermsSet.add(`tool:${tool}`);
        break;
      }
    }

    // D. Match against Summary / Role Description (Weight: 3.5 per token occurrence)
    if (summaryLower.includes(token)) {
      // Frequency boost up to 3 occurrences
      const regex = new RegExp(`\\b${token}`, "gi");
      const matchCount = (summaryLower.match(regex) || []).length;
      score += 3.5 + Math.min(matchCount, 3) * 1.0;
      tokenMatched = true;
      matchedTermsSet.add(token);
    }

    // E. Match against Agent Slug / ID (Weight: 3.0)
    if (idLower.includes(token)) {
      score += 3.0;
      tokenMatched = true;
      matchedTermsSet.add(token);
    }

    // F. Stem / Synonym Expansion Matching
    for (const [stemKey, aliases] of Object.entries(STEM_ALIASES)) {
      const isQueryInCluster = token === stemKey || aliases.includes(token);
      if (isQueryInCluster) {
        // Check if agent name or summary contains the cluster root or any alias
        const targetContainsCluster =
          nameLower.includes(stemKey) ||
          categoryLower.includes(stemKey) ||
          aliases.some((a) => nameLower.includes(a) || summaryLower.includes(a));

        if (targetContainsCluster && !tokenMatched) {
          score += 4.0;
          tokenMatched = true;
          matchedTermsSet.add(`synonym:${token}->${stemKey}`);
          break;
        }
      }
    }

    if (tokenMatched) {
      matchedDistinctTokens++;
    }
  }

  // 4. Token Coverage Boost: heavily rewards agents matching multiple distinct words from the brief
  if (queryTokens.length > 1 && matchedDistinctTokens > 1) {
    const coverageRatio = matchedDistinctTokens / queryTokens.length;
    score *= 1.0 + coverageRatio * 0.8; // Up to +80% bonus for full query term coverage
  }

  return {
    score: Math.round(score * 10) / 10,
    matchedTerms: Array.from(matchedTermsSet),
  };
}

/**
 * Matches and ranks vault agents by relevance to the given text query.
 * Returns an array of `VaultMatchResult` containing capability records and match scores.
 *
 * @param query Freeform text query or job brief
 * @param limit Maximum number of top records to return (defaults to 15)
 * @returns Ranked array of matching `VaultMatchResult` objects
 */
export function matchVaultAgentsWithScore(
  query: string,
  limit: number = 15
): VaultMatchResult[] {
  const cleanLimit = Math.max(1, limit);
  const trimmed = (query || "").trim();

  if (!trimmed) {
    return VAULT_CAPABILITIES.slice(0, cleanLimit).map((rec) => ({
      ...rec,
      score: 0,
      matchedTerms: [],
    }));
  }

  const rawQueryLower = trimmed.toLowerCase();
  const queryTokens = tokenize(trimmed);
  const queryPhrases = extractPhrases(trimmed);

  const scored: VaultMatchResult[] = [];

  for (const record of VAULT_CAPABILITIES) {
    const { score, matchedTerms } = scoreAgent(
      record,
      queryTokens,
      queryPhrases,
      rawQueryLower
    );

    if (score > 0) {
      scored.push({
        ...record,
        score,
        matchedTerms,
      });
    }
  }

  // Sort by score descending; break ties by name alphabetically
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.name.localeCompare(b.name);
  });

  // If matches found, return top N; otherwise return top generalist fallback agents
  if (scored.length > 0) {
    return scored.slice(0, cleanLimit);
  }

  return VAULT_CAPABILITIES.slice(0, cleanLimit).map((rec) => ({
    ...rec,
    score: 0,
    matchedTerms: [],
  }));
}

/**
 * Standalone vault agent matcher: given a text query (a job brief),
 * scores all 279 entries in `src/data/vaultCapabilities.json` by keyword/semantic
 * relevance, and returns the top N (default 15) most relevant records, ranked.
 *
 * Pure function, zero side effects, zero external API calls.
 *
 * @param query Freeform job brief or task requirements
 * @param limit Maximum number of records to return (defaults to 15)
 * @returns Ranked array of top matching `VaultCapabilityRecord` objects
 */
export function matchVaultAgents(
  query: string,
  limit: number = 15
): VaultCapabilityRecord[] {
  const scored = matchVaultAgentsWithScore(query, limit);
  return scored.map((item) => ({
    id: item.id,
    filename: item.filename,
    name: item.name,
    emoji: item.emoji,
    color: item.color,
    category: item.category,
    summary: item.summary,
    tools: item.tools,
    approvalTier: item.approvalTier,
  }));
}
