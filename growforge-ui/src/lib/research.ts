import { getProviderKey, getProviderModel } from "@/lib/llm";

/**
 * Live web research via Gemini's Google Search grounding. This is the only
 * path in the system that touches the live internet: the plain chat
 * providers in llm.ts answer from training data alone, which is how
 * agents end up inventing plausible-looking statistics. Anything a job
 * presents as fact must trace back to a source returned here.
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

export function isResearchAvailable(): boolean {
  return Boolean(getProviderKey("gemini"));
}

export async function researchQuestion(question: string, context: string): Promise<ResearchFinding> {
  const apiKey = getProviderKey("gemini");
  if (!apiKey) throw new Error("Live research needs a Gemini API key (Settings → Integrations).");

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

  return { question, answer: answer || "No reliable data found.", sources };
}
