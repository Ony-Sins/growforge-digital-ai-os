"use client";
import { useEffect, useRef, useState } from "react";

const categories = [
  ["normal_english", "Normal English", "Hi Nora. What should I work on first today?"],
  ["casual_english", "Fast / casual English", "Hey Nora, what's going on with that project we were talking about?"],
  ["terminology", "GrowForge terminology", "Nora, open GrowForge CORE, then BRAIN, missions and Systems."],
  ["bangla", "Bangla", "নোরা, আমার বর্তমান কাজগুলোর অবস্থা কী? আগে কোন কাজটা করব?"],
  ["mixed", "English + Bangla", "Nora, আমার GrowForge project-এর first mission খুলে দেখাও।"],
  ["interruption", "Short interruptions", "Stop. Wait. থামো। দাঁড়াও।"],
] as const;
type Clip = { category:string; reference:string; wav:ArrayBuffer };

export function VoiceSTTEvaluation({voiceEnabled}:{voiceEnabled:boolean}) {
  const [expected, setExpected] = useState<string>(categories[0][2]);
  const [step, setStep] = useState(0);
  const [clips, setClips] = useState<Clip[]>([]);
  const clipsRef = useRef<Clip[]>([]);
  const [state, setState] = useState("idle");
  const [result, setResult] = useState("");
  const captureGeneration = useRef(0);
  const comparison = useRef<AbortController | null>(null);
  const capture = useRef<{context:AudioContext; stream:MediaStream; processor:ScriptProcessorNode; chunks:Float32Array[]; timer:ReturnType<typeof setTimeout>} | null>(null);
  function discard() {
    captureGeneration.current++;
    const current = capture.current;
    if (current) {
      clearTimeout(current.timer);
      current.processor.disconnect();
      current.stream.getTracks().forEach(track=>track.stop());
      void current.context.close();
      current.chunks.length = 0;
      capture.current = null;
    }
  }
  useEffect(()=>()=>{discard();comparison.current?.abort();clipsRef.current.length=0;},[]);
  useEffect(()=>{ if(voiceEnabled) { discard();comparison.current?.abort();clipsRef.current=[];
    const timer=setTimeout(()=>{setClips([]);setStep(0);setExpected(categories[0][2]);setState("idle");},0);
    return ()=>clearTimeout(timer);
  } },[voiceEnabled]);
  async function start() {
    const generation=++captureGeneration.current;
    setResult("");
    setState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1}});
      if(generation!==captureGeneration.current) {stream.getTracks().forEach(track=>track.stop());return;}
      const context = new AudioContext();
      await context.resume();
      const processor = context.createScriptProcessor(4096,1,1);
      const chunks:Float32Array[] = [];
      processor.onaudioprocess = event=>chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      context.createMediaStreamSource(stream).connect(processor);
      // No microphone audio is played back; output channel stays zero.
      processor.connect(context.destination);
      capture.current = {context,stream,processor,chunks,timer:setTimeout(()=>{discard();setState("idle");setResult("30-second limit reached. Audio discarded; try a shorter set.");},30000)};
      setState("recording");
    } catch(error) { discard();setState("idle");setResult(String(error)); }
  }
  async function compare() {
    const current = capture.current;
    if (!current) return;
    const count = current.chunks.reduce((total,chunk)=>total+chunk.length,0);
    const wav = new ArrayBuffer(44+count*2);
    const view = new DataView(wav);
    const text = (offset:number,value:string)=>[...value].forEach((char,i)=>view.setUint8(offset+i,char.charCodeAt(0)));
    text(0,"RIFF");view.setUint32(4,36+count*2,true);text(8,"WAVE");text(12,"fmt ");view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,current.context.sampleRate,true);view.setUint32(28,current.context.sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,"data");view.setUint32(40,count*2,true);
    let offset = 44;
    for (const chunk of current.chunks) for (const sample of chunk) {view.setInt16(offset,Math.round(Math.max(-1,Math.min(1,sample))*32767),true);offset+=2;}
    discard();setState("idle");
    const next = [...clipsRef.current,{category:categories[step][0],reference:expected,wav}];
    clipsRef.current=next;setClips(next);
    const nextStep = Math.min(step+1,categories.length-1);
    setStep(nextStep);setExpected(categories[nextStep][2]);
  }
  async function benchmark() {
    setState("comparing");setResult("");
    const reports:unknown[]=[];
    const controller=new AbortController();comparison.current=controller;
    try {
      for (const clip of clipsRef.current) {
        const response = await fetch("/api/nora/voice-evaluate",{method:"POST",headers:{"Content-Type":"audio/wav","X-Expected-Transcript":encodeURIComponent(clip.reference),"X-Calibration-Category":clip.category},body:clip.wav,signal:controller.signal});
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Calibration failed");
        reports.push(data);setResult(JSON.stringify(reports,null,2));
      }
    } catch(error) {setResult(String(error));}
    finally {setState("idle");}
  }
  return <details onToggle={event=>{if(!event.currentTarget.open) {discard();comparison.current?.abort();clipsRef.current=[];setClips([]);setStep(0);setExpected(categories[0][2]);setState("idle");}}} className="mt-3 border-t border-cyan-500/20 pt-3 text-xs text-slate-300">
    <summary>Calibrate my English and Bangla speech</summary>
    <p className="my-2">Turn voice mode off. Record six short clips in your natural voice. Edit each reference to match exactly what you will say. Recordings stay only in browser memory until you discard them, close this panel, or leave the page. Comparison sends audio only to the local server; no audio files are saved.</p>
    <p>{clips.length}/6 recorded · {categories[step][1]}</p>
    <textarea aria-label="Expected spoken phrases" disabled={state !== "idle" || clips.length===6} value={expected} onChange={event=>setExpected(event.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded p-2" rows={3}/>
    <div className="flex gap-2 my-2">
      {state === "idle" && clips.length<6 && <button type="button" disabled={voiceEnabled || !expected.trim()} onClick={()=>void start()} className="border border-cyan-500/50 rounded p-2 disabled:opacity-40">Record {categories[step][1]}</button>}
      {state === "recording" && <><button type="button" onClick={()=>void compare()} className="border border-cyan-500/50 rounded p-2">Stop and keep temporarily</button><button type="button" onClick={()=>{discard();setState("idle");}} className="rounded p-2">Discard current clip</button></>}
      {state === "idle" && clips.length===6 && <button type="button" disabled={voiceEnabled} onClick={()=>void benchmark()} className="border border-cyan-500/50 rounded p-2">Compare the same six clips</button>}
      {state !== "comparing" && clips.length>0 && <button type="button" onClick={()=>{discard();clipsRef.current=[];setClips([]);setStep(0);setExpected(categories[0][2]);setResult("");setState("idle");}} className="rounded p-2">Discard calibration set</button>}
      <span role="status">{state}</span>
    </div>
    {clips.map((clip,index)=><label key={clip.category} className="block my-2">{categories[index][1]} ground truth
      <textarea aria-label={`${categories[index][1]} ground truth`} disabled={state!=="idle"} value={clip.reference} rows={2} className="w-full bg-slate-950 border border-slate-700 rounded p-2" onChange={event=>{const next=clipsRef.current.map((item,i)=>i===index?{...item,reference:event.target.value}:item);clipsRef.current=next;setClips(next);}}/>
    </label>)}
    {result && <><button type="button" onClick={()=>{const url=URL.createObjectURL(new Blob([result],{type:"application/json"}));const link=document.createElement("a");link.href=url;link.download="nora-calibration-results.json";link.click();URL.revokeObjectURL(url);}} className="border rounded p-2">Save results only</button><pre className="whitespace-pre-wrap break-words max-h-72 overflow-auto">{result}</pre></>}
  </details>;
}
