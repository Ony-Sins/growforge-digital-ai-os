/** Injected transport test: proves context delivery and actual delta timing, not model quality. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { executeNoraTurn } from "../src/lib/noraTurnEngine";
import { voiceSessionContext } from "../src/lib/voiceSessionContext";

async function main() {
  const originalCwd = process.cwd(), originalFetch = globalThis.fetch;
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "nora-context-test-"));
  process.chdir(temporary);
  let latest: { messages: {role:string;content:string}[] } | undefined;
  globalThis.fetch = async (_input, init) => {
    latest = JSON.parse(String(init?.body));
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(encoder.encode(JSON.stringify({message:{content:"Alpha is the first choice. "}})+"\n"));
      setTimeout(()=>{controller.enqueue(encoder.encode(JSON.stringify({message:{content:"Beta is the other choice."},done:true,eval_count:12})+"\n"));controller.close();},30);
    }}),{headers:{"Content-Type":"application/x-ndjson"}});
  };
  try {
    const context = voiceSessionContext("user-a@local.invalid", "conversation_123");
    context.history.push({role:"user",content:"Compare Alpha and Beta."},{role:"assistant",content:"Alpha is first. Beta is second."});
    context.surface = '{"surface":"Dive","selection":{"missionId":"synthetic-mission"}}';
    for (const message of ["What about the first one?", "What about the other one?"]) {
      let completed = false, earlyDelta = false;
      const result = await executeNoraTurn({message,conversationId:"conversation_123",history:context.history,
        attachmentContext:context.surface,approvedUserMemory:'{"approvedVoiceMemory":["Synthetic approved note"]}',
        onTextDelta:()=>{assert.equal(completed,false);earlyDelta=true;}});
      completed = true;
      assert.equal(result.dispatchType,"LLM");
      assert.ok(earlyDelta);
      assert.ok(latest?.messages.some(m=>m.content.includes("Compare Alpha and Beta")));
      assert.ok(latest?.messages.some(m=>m.content.includes("synthetic-mission")));
      assert.ok(latest?.messages.some(m=>m.content.includes("Synthetic approved note")));
      context.history.push({role:"user",content:message},{role:"assistant",content:result.reply});
    }
    assert.equal(voiceSessionContext("user-a@local.invalid","conversation_123"),context);
    assert.equal(voiceSessionContext("user-b@local.invalid","conversation_123").history.length,0);
    assert.equal(context.history.length,6);
    console.log("PASS INJECTED: Turn 2/3 context and approved notes delivered; ordinal references reach reasoning; owner scoping; real deltas before completion. No real model/voice quality claim.");
  } finally {
    globalThis.fetch=originalFetch;process.chdir(originalCwd);
    assert.ok(temporary.startsWith(path.join(os.tmpdir(),"nora-context-test-")));
    fs.rmSync(temporary,{recursive:true,force:true});
  }
}
void main();
