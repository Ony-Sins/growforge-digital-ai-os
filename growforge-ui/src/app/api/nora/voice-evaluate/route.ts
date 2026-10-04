import { localVoiceAllowed, localBridgeKey } from "@/lib/localVoiceServer";
export const runtime = "nodejs";
export async function POST(req: Request) {
  if (!await localVoiceAllowed(req)) return Response.json({error:"LOCAL_ONLY"},{status:403});
  if (Number(req.headers.get("content-length")) > 4_000_000) return Response.json({error:"RECORDING_TOO_LARGE"},{status:413});
  const bytes = await req.arrayBuffer();
  if (bytes.byteLength > 4_000_000) return Response.json({error:"RECORDING_TOO_LARGE"},{status:413});
  const expected = req.headers.get("x-expected-transcript") || "";
  if (!expected || expected.length > 2000) return Response.json({error:"REFERENCE_REQUIRED"},{status:400});
  // Evaluation uses the existing bridge; starting a voice session here can reintroduce stale microphone ownership.
  // Do not acquire a mic or prewarm unrelated reasoning/TTS during STT comparison.
  try {
    const upstream = await fetch("http://127.0.0.1:7890/voice/evaluate", {method:"POST",body:bytes,
      headers:{"X-GrowForge-Bridge-Key":localBridgeKey(),"X-Expected-Transcript":expected,"X-Calibration-Category":req.headers.get("X-Calibration-Category") || "normal_english","Content-Type":"audio/wav"},
      signal:AbortSignal.timeout(600000),cache:"no-store"});
    return new Response(await upstream.text(),{status:upstream.status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
  } catch { return Response.json({error:"LOCAL_STT_EVALUATION_FAILED"},{status:503}); }
}
