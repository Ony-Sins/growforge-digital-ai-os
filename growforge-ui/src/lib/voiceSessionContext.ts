/** Ephemeral conversation state. Keys include the authenticated owner, never a caller email. */
export type VoiceHistory = { role: "user" | "assistant"; content: string }[];
type VoiceContext = { history: VoiceHistory; surface: string; identity: string; updatedAt: number; generation: number };
const runtime = globalThis as typeof globalThis & { __noraVoiceContexts?: Map<string, VoiceContext> };
const sessions = runtime.__noraVoiceContexts ??= new Map();
const TTL = 30 * 60 * 1000;
export function voiceSessionContext(owner: string, conversationId: string): VoiceContext {
  if (!owner || !/^[a-zA-Z0-9_-]{8,100}$/.test(conversationId)) throw new Error("Invalid voice session identity");
  for (const [key, value] of sessions) if (Date.now() - value.updatedAt > TTL) sessions.delete(key);
  const key = `${owner.toLowerCase()}\0${conversationId}`;
  let context = sessions.get(key);
  if (!context) {
    if (sessions.size >= 32) sessions.delete(sessions.keys().next().value!);
    context = { history: [], surface: "", identity: "NORA", updatedAt: Date.now(), generation: 0 };
    sessions.set(key, context);
  }
  context.updatedAt = Date.now();
  return context;
}
