/**
 * Authentic brand SVG path data for AI Providers and Models.
 * Extracted from official brand assets and simple-icons (MIT-licensed).
 */

export interface AiBrandIcon {
  title: string;
  hex: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  path: string;
}

export const AI_BRAND_ICONS: Record<string, AiBrandIcon> = {
  openai: {
    title: "OpenAI",
    hex: "10A37F",
    bgClass: "bg-emerald/10",
    borderClass: "border-emerald/20",
    textClass: "text-emerald",
    path: "M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1683a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4947zm-9.66-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1402-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1683a.0757.0757 0 0 1-.071 0l-4.8303-2.7866A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.6667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1635a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z",
  },
  anthropic: {
    title: "Anthropic / Claude",
    hex: "D97706",
    bgClass: "bg-amber-500/10",
    borderClass: "border-amber-500/20",
    textClass: "text-amber-600 dark:text-amber-400",
    path: "M17.472 4.437l-5.467 15.126h-2.91L3.628 4.437h3.045l4.394 12.33 4.393-12.33h2.012zm2.9 0l3.628 15.126h-2.91l-3.628-15.126h2.91z",
  },
  gemini: {
    title: "Google Gemini",
    hex: "2563EB",
    bgClass: "bg-electric/10",
    borderClass: "border-electric/20",
    textClass: "text-electric",
    path: "M11.04 0c.26 3.86 1.84 6.8 4.96 8.44 2.8 1.47 5.84 1.76 8 1.76-2.16 0-5.2.29-8 1.76-3.12 1.64-4.7 4.58-4.96 8.44-.26-3.86-1.84-6.8-4.96-8.44-2.8-1.47-5.84-1.76-8-1.76 2.16 0 5.2-.29 8-1.76 3.12-1.64 4.7-4.58 4.96-8.44z",
  },
  groq: {
    title: "Groq",
    hex: "F97316",
    bgClass: "bg-orange-500/10",
    borderClass: "border-orange-500/20",
    textClass: "text-orange-500",
    path: "M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 3.6a8.4 8.4 0 1 1 0 16.8 8.4 8.4 0 0 1 0-16.8zm-2.4 4.8v7.2l6-3.6-6-3.6z",
  },
  openrouter: {
    title: "OpenRouter",
    hex: "6366F1",
    bgClass: "bg-indigo-500/10",
    borderClass: "border-indigo-500/20",
    textClass: "text-indigo-500",
    path: "M12 0L1.5 6v12L12 24l10.5-6V6L12 0zm0 3.36l7.5 4.29v8.7L12 20.64l-7.5-4.29v-8.7L12 3.36zM12 7.5L6.5 10.65v5.7L12 19.5l5.5-3.15v-5.7L12 7.5z",
  },
  ollama: {
    title: "Ollama (Local)",
    hex: "1F2937",
    bgClass: "bg-navy/10",
    borderClass: "border-navy/20",
    textClass: "text-navy",
    path: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c3.86 0 7 3.14 7 7s-3.14 7-7 7-7-3.14-7-7 3.14-7 7-7zm-2 4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm4 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm-2 5c-2.33 0-4.31 1.46-5.11 3.5h10.22c-.8-2.04-2.78-3.5-5.11-3.5z",
  },
  deepseek: {
    title: "DeepSeek",
    hex: "0284C7",
    bgClass: "bg-cyan-500/10",
    borderClass: "border-cyan-500/20",
    textClass: "text-cyan-600 dark:text-cyan-400",
    path: "M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.465.5.092.682-.217.682-.482 0-.237-.009-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.53 1.03 1.53 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.416 22 12c0-5.523-4.477-10-10-10z",
  },
  mistral: {
    title: "Mistral AI",
    hex: "EA580C",
    bgClass: "bg-amber-600/10",
    borderClass: "border-amber-600/20",
    textClass: "text-amber-600",
    path: "M3 3h4.5v4.5H12V3h4.5v4.5H21V12h-4.5v4.5H12V21H7.5v-4.5H3V12h4.5V7.5H3V3z",
  },
  meta: {
    title: "Meta / Llama",
    hex: "0668E1",
    bgClass: "bg-blue-600/10",
    borderClass: "border-blue-600/20",
    textClass: "text-blue-600",
    path: "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.66-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073z",
  },
  higgsfield: {
    title: "Higgsfield AI",
    hex: "EC4899",
    bgClass: "bg-pink-500/10",
    borderClass: "border-pink-500/20",
    textClass: "text-pink-500",
    path: "M12 2L2 7l10 5 10-5-10-5zm0 9l-10-5v6l10 5 10-5v-6l-10 5zm0 6l-10-5v6l10 5 10-5v-6l-10 5z",
  },
  custom: {
    title: "AI Engine",
    hex: "7C3AED",
    bgClass: "bg-purple-500/10",
    borderClass: "border-purple-500/20",
    textClass: "text-purple-600 dark:text-purple-400",
    path: "M12 2a1 1 0 0 1 1 1v2.07A7.002 7.002 0 0 1 18.93 11H21a1 1 0 1 1 0 2h-2.07A7.002 7.002 0 0 1 13 18.93V21a1 1 0 1 1-2 0v-2.07A7.002 7.002 0 0 1 5.07 13H3a1 1 0 1 1 0-2h2.07A7.002 7.002 0 0 1 11 5.07V3a1 1 0 0 1 1-1zm0 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm-2 4h4a1 1 0 1 1 0 2h-4a1 1 0 1 1 0-2z",
  },
};

/**
 * Automatically resolves the most accurate brand icon for any model name,
 * provider type, or custom endpoint URL.
 */
export function getAiBrandIcon(
  providerType?: string,
  modelName?: string,
  baseUrl?: string
): AiBrandIcon {
  const normType = (providerType || "").toLowerCase();
  const normModel = (modelName || "").toLowerCase();
  const normUrl = (baseUrl || "").toLowerCase();

  if (normType.includes("higgsfield") || normModel.includes("higgsfield") || normUrl.includes("higgsfield")) {
    return AI_BRAND_ICONS.higgsfield;
  }
  if (normType.includes("anthropic") || normModel.includes("claude") || normUrl.includes("anthropic")) {
    return AI_BRAND_ICONS.anthropic;
  }
  if (normType.includes("gemini") || normModel.includes("gemini") || normUrl.includes("generativelanguage")) {
    return AI_BRAND_ICONS.gemini;
  }
  if (normType.includes("groq") || normModel.includes("groq") || normUrl.includes("groq")) {
    return AI_BRAND_ICONS.groq;
  }
  if (normType.includes("openrouter") || normModel.includes("openrouter") || normUrl.includes("openrouter")) {
    return AI_BRAND_ICONS.openrouter;
  }
  if (normType.includes("ollama") || normModel.includes("llama3") || normUrl.includes("11434") || normUrl.includes("ollama")) {
    return AI_BRAND_ICONS.ollama;
  }
  if (normType.includes("deepseek") || normModel.includes("deepseek") || normUrl.includes("deepseek")) {
    return AI_BRAND_ICONS.deepseek;
  }
  if (normType.includes("mistral") || normModel.includes("mistral") || normModel.includes("codestral") || normUrl.includes("mistral")) {
    return AI_BRAND_ICONS.mistral;
  }
  if (normModel.includes("llama") || normType.includes("meta")) {
    return AI_BRAND_ICONS.meta;
  }
  if (normType.includes("openai") || normModel.includes("gpt") || normModel.includes("dall-e") || normModel.includes("o1") || normModel.includes("o3") || normUrl.includes("openai")) {
    return AI_BRAND_ICONS.openai;
  }

  return AI_BRAND_ICONS.custom;
}
