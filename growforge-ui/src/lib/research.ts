import { getProviderKey, getProviderModel } from "@/lib/llm";

/**
 * Live web research: Gemini's Google Search grounding when a working key is
 * configured, self-hosted SearXNG search as an automatic fallback when it
 * isn't (or when the key runs out of quota mid-job). This is the only path
 * in the system that touches the live internet: the plain chat providers in
 * llm.ts answer from training data alone, which is how agents end up
 * inventing plausible-looking statistics. Anything a job presents as fact
 * must trace back to a source returned here.
 */

export interface Source {
  title: string;
  uri: string;
}

export interface ResearchFinding {
  question: string;
  answer: string;
  sources: Source[];
}

interface GroundedResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] };
  }[];
  error?: { message?: string };
}

/** DuckDuckGo needs no key at all, so research can always at least attempt
 *  via that path — Gemini (when a key is configured and has quota left) is
 *  tried first for a higher-quality AI-synthesized answer with grounding. */
export function isResearchAvailable(): boolean {
  return true;
}

async function researchViaGemini(question: string, context: string, apiKey: string): Promise<ResearchFinding> {
  const model = getProviderModel("gemini");
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: {
        parts: [
          {
            text:
              "You are a research analyst. Use Google Search to answer with current, specific, verifiable facts " +
              "(figures, price ranges, benchmarks, named platforms, regulations). State the location and year a " +
              "figure applies to. If sources disagree, give the range and say so. If you cannot find reliable data, " +
              "say exactly that — never estimate or fill gaps from memory. Be concise: bullet points, no preamble.",
          },
        ],
      },
      contents: [{ role: "user", parts: [{ text: `Context: ${context}\n\nResearch question: ${question}` }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1200 },
    }),
  });

  const data = (await res.json()) as GroundedResponse;
  if (!res.ok) throw new Error(data.error?.message ?? `Gemini research request failed (${res.status}).`);

  const candidate = data.candidates?.[0];
  const answer = candidate?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";

  const seen = new Set<string>();
  const sources: Source[] = [];
  for (const chunk of candidate?.groundingMetadata?.groundingChunks ?? []) {
    const uri = chunk.web?.uri;
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    sources.push({ uri, title: chunk.web?.title || new URL(uri).hostname });
  }

  if (sources.length === 0) throw new Error("Gemini returned no grounded sources.");
  return { question, answer: answer || "No reliable data found.", sources };
}

/**
 * Historical DuckDuckGo scraping fallback (deprecated):
 * Scraped html.duckduckgo.com without API keys. Permanently disabled as DuckDuckGo
 * now serves bot-detection CAPTCHA challenges to automated scrapers.
 * Replaced by self-hosted SearXNG (researchViaSearXNG below).
 */
/*
async function researchViaDuckDuckGo(question: string): Promise<ResearchFinding> {
  const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(question)}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
    },
  });
  if (!res.ok) throw new Error(`DuckDuckGo search failed (${res.status}).`);
  const html = await res.text();

  const titleMatches = [...html.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  const snippetMatches = [...html.matchAll(/<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)];

  const sources: Source[] = [];
  const snippets: string[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < titleMatches.length && sources.length < 5; i++) {
    const uri = unwrapDdgUrl(titleMatches[i][1]);
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    const title = stripTags(titleMatches[i][2]) || new URL(uri).hostname;
    sources.push({ uri, title });
    const snippet = snippetMatches[i] ? stripTags(snippetMatches[i][1]) : "";
    if (snippet) snippets.push(`- [${sources.length}] ${title}: ${snippet}`);
  }

  if (sources.length === 0) throw new Error("DuckDuckGo returned no results.");

  const answer =
    "Raw search result snippets (not AI-synthesized — read them directly and cite by number):\n" + snippets.join("\n");
  return { question, answer, sources };
}
*/

interface SearXNGResult {
  url: string;
  title: string;
  content?: string;
  engine?: string;
}

interface SearXNGResponse {
  query: string;
  number_of_results?: number;
  results?: SearXNGResult[];
}

/**
 * Self-hosted SearXNG search fallback: queries the local SearXNG JSON endpoint
 * (configured via SEARXNG_BASE_URL, default: http://localhost:8088).
 * Extracts authentic result URLs, titles, and snippets without AI synthesis or bot CAPTCHAs.
 */
async function researchViaSearXNG(question: string): Promise<ResearchFinding> {
  const baseUrl = process.env.SEARXNG_BASE_URL?.replace(/\/+$/, "") || "http://localhost:8088";
  const url = `${baseUrl}/search?q=${encodeURIComponent(question)}&format=json`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "GrowForge-Digital-AI-OS/1.0",
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`SearXNG search request failed (${res.status} ${res.statusText}).`);

  const data = (await res.json()) as SearXNGResponse;
  const rawResults = data.results ?? [];

  const sources: Source[] = [];
  const snippets: string[] = [];
  const seen = new Set<string>();

  for (const item of rawResults) {
    if (!item.url || seen.has(item.url)) continue;
    seen.add(item.url);
    const title = item.title?.trim() || new URL(item.url).hostname;
    sources.push({ uri: item.url, title });
    const snippet = item.content?.trim() || "";
    if (snippet) snippets.push(`- [${sources.length}] ${title}: ${snippet}`);
    if (sources.length >= 5) break;
  }

  if (sources.length === 0) throw new Error("SearXNG returned no results.");

  const answer =
    "Raw search result snippets (not AI-synthesized — read them directly and cite by number):\n" + snippets.join("\n");
  return { question, answer, sources };
}

export async function researchQuestion(question: string, context: string): Promise<ResearchFinding> {
  const apiKey = getProviderKey("gemini");
  if (apiKey) {
    try {
      return await researchViaGemini(question, context, apiKey);
    } catch (err) {
      console.warn(
        `[research] Gemini grounding unavailable (${err instanceof Error ? err.message : String(err)}) — falling back to SearXNG`,
      );
    }
  }

  try {
    return await researchViaSearXNG(question);
  } catch (err) {
    return {
      question,
      answer: `No reliable data found — both Gemini grounding and SearXNG search were unavailable (${err instanceof Error ? err.message : String(err)}).`,
      sources: [],
    };
  }
}
