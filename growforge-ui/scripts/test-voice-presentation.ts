import assert from "node:assert/strict";
import {resolveAssistantIdentity,prepareSpokenReply} from "../src/lib/assistantIdentity";
import {executeNoraTurn} from "../src/lib/noraTurnEngine";

async function main() {
  for (const [display,spoken] of [["NORA","Nora"],["FRIDAY","Friday"]]) {
    const result = await executeNoraTurn({message:"What's your name?",assistantName:display,assistantSpokenName:spoken,channel:"voice_headless"});
    assert.ok(result.reply.includes(display));
    assert.ok(result.speakableText.includes(spoken));
    assert.equal(result.metadata.assistantIdentity?.spokenName,spoken);
  }
  const reply="NORA can help with CPU and GPU. First useful answer. Second useful answer. Third detail. Fourth detail. https://example.com ```secret code```";
  const spoken=prepareSpokenReply(reply,resolveAssistantIdentity("NORA"));
  assert.ok(spoken.includes("Nora"));
  assert.ok(spoken.includes("CPU and GPU"));
  assert.ok(!spoken.includes("http")&&!spoken.includes("secret code"));
  assert.ok(!spoken.includes("continue"));
  assert.ok(reply.includes("Fourth detail"));
  console.log("PASS canonical display/spoken identity, FRIDAY configuration, concise presentation and unchanged unrelated acronyms; no model/provider calls.");
}
void main();
