/** Shared presentation metadata; only the assistant name is rewritten for speech. */
export interface AssistantIdentity {
  assistantType: "nora";
  displayName: string;
  spokenName: string;
  wakeName: string;
}
export function resolveAssistantIdentity(displayName = "NORA", spokenName?: string): AssistantIdentity {
  const configured = displayName.trim().slice(0, 60) || "NORA";
  const display = configured.toUpperCase() === "NORA" ? "NORA" : configured;
  const spoken = spokenName?.trim().slice(0, 60) || (/^[A-Z]{2,20}$/.test(display) ? display[0]+display.slice(1).toLowerCase() : display);
  return { assistantType: "nora", displayName: display, spokenName: spoken, wakeName: spoken };
}
export function prepareSpokenReply(reply: string, identity: AssistantIdentity, detailed = false): string {
  const escaped = identity.displayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let text = reply.replace(/```[\s\S]*?```/g, "").replace(/https?:\/\/\S+/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/^[\s]*(?:[|#>]|[*-]\s|\d+[.)]\s).*$/gm, "")
    .replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();
  text = text.replace(/\bI am\b/g, "I'm").replace(/\bI will\b/g, "I'll").replace(/\bYou are\b/g, "You're");
  text = text.replace(new RegExp(`(?<![\\w])${escaped}(?![\\w])`, "g"), identity.spokenName);
  const sentences = text.match(/[^.!?।]+(?:[.!?।]+|$)/g) || [];
  const limit = detailed ? 8 : 2;
  const selected: string[] = [];
  for (const sentence of sentences.slice(0, limit)) {
    if ((selected.join(" ")+sentence).length > (detailed ? 1200 : 450)) break;
    selected.push(sentence.trim());
  }
  const spoken = selected.join(" ") || "The full answer is on screen.";
  return spoken;
}
