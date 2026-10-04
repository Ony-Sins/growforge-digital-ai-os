import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "ws";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = path.resolve("verification/journey-qa-20260930");
fs.mkdirSync(out, {recursive:true});
const profile = fs.mkdtempSync(path.join(os.tmpdir(),"gf-node-trial-"));
const chrome = spawn(process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  ["--headless=new","--remote-debugging-port=9321","--enable-unsafe-swiftshader",`--user-data-dir=${profile}`,"about:blank"],{stdio:"ignore"});
let socket;
try {
  let url;
  for(let i=0;i<40&&!url;i++) { await sleep(300);try {url=(await(await fetch("http://localhost:9321/json")).json()).find(t=>t.type==="page")?.webSocketDebuggerUrl;}catch{} }
  assert(url);socket=new WebSocket(url);await new Promise(r=>socket.once("open",r));
  let seq=0;const pending=new Map();
  const browserErrors=[];
  socket.on("message",raw=>{const m=JSON.parse(raw);
    if(m.method==='Runtime.exceptionThrown')browserErrors.push(m.params.exceptionDetails.text);
    if(m.method==='Log.entryAdded' && m.params.entry.level==='error')browserErrors.push(m.params.entry.text);
    pending.get(m.id)?.(m);pending.delete(m.id);});
  const send=(method,params={})=>new Promise(r=>{const id=++seq;pending.set(id,r);socket.send(JSON.stringify({id,method,params}));});
  const run=async expression=>{const m=await send("Runtime.evaluate",{expression,returnByValue:true});assert(!m.result.exceptionDetails);return m.result.result.value;};
  await send("Page.enable");await send("Runtime.enable");await send("Log.enable");
  await send("Emulation.setDeviceMetricsOverride",{width:1600,height:900,deviceScaleFactor:1,mobile:false});
  await send("Page.navigate",{url:"http://localhost:3000"});
  let ready=false;
  for(let i=0;i<100&&!ready;i++){ready=await run("window.__BRAIN_FIELD?.debugInfo().trialRecords?.length === 28");if(!ready)await sleep(500);}
  assert(ready,"all actual record junctions loaded");

  const reports=[];
  const checkpoint=()=>fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify(reports,null,2));
  const state=()=>run(`(()=>{const e=window.__THREE_NEUTRON_ENGINE,f=window.__BRAIN_FIELD,c=window.__THREE_CAMERA,o=window.__THREE_CONTROLS;
    return {distance:c.position.distanceTo(o.target),camera:c.position.toArray(),q:e.stellarSphere.quaternion.toArray(),hover:e.stellarUniforms.uHover.value,charge:e.stellarUniforms.uSpinCharge.value,spin:Math.hypot(e.spinVel.x,e.spinVel.y),shocks:e.shockStarts.length,paused:f.motionPaused,nodeFlow:f.nodeFlow,engineFlow:e.getMotionState().flowTotal,records:f.debugRecords(),info:f.debugInfo()};})()`);
  const move=(x,y,buttons=0)=>send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y,buttons});
  const down=(x,y)=>send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});
  const up=(x,y)=>send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});
  const click=async(x,y)=>{await move(x,y);await down(x,y);await up(x,y);};
  const shot=async name=>{const m=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(m.result.data,'base64'));};
  const core=()=>run(`(()=>{const c=window.__THREE_CAMERA,r=window.__THREE_NEUTRON_ENGINE.getNucleusRadius();const p=new c.position.constructor().project(c),edge=new c.position.constructor().setFromMatrixColumn(c.matrixWorld,0).multiplyScalar(r).project(c);return {x:(p.x*.5+.5)*1600,y:(-p.y*.5+.5)*900,r:Math.abs(edge.x-p.x)*800};})()`);
  const drift=(a,b)=>Math.max(...b.records.map((r,i)=>Math.hypot(...r.world.map((v,k)=>v-a.records[i].world[k]))));
  const dragBackground=async(stage,capture=false)=>{
    await move(1510,815);await down(1510,815);await move(1470,795,1);await sleep(250);
    const a=await state();await sleep(550);const b=await state();
    assert(a.paused && b.paused,stage+' hold flag');assert(drift(a,b)<.001,stage+' no autonomous drift');
    if(capture)await shot('mid-background-held');await up(1470,795);const released=await state();await sleep(150);const short=await state();await sleep(500);const c=await state();
    assert(!c.paused,stage+' release');assert(drift(b,c)>.01,stage+' resumes');assert(Math.abs((short.engineFlow-short.nodeFlow)-(released.engineFlow-released.nodeFlow))<.001,stage+' path clock does not catch up');
    if(capture)await shot('mid-background-resumed');reports.push({stage,holdDrift:drift(a,b),resumeDrift:drift(b,c)});checkpoint();
  };
  const wheelTo=async(target)=>{
    for(let i=0;i<240;i++){
      const a=await state();if(Math.abs(a.distance-target)<2 || target===139 && a.distance<140)break;
      const delta=a.distance>target ? -Math.min(35,Math.max(.2,Math.log(a.distance/target)*100)) : Math.min(35,Math.max(2,Math.log(target/a.distance)*180));
      await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:1510,y:815,deltaX:0,deltaY:delta});await sleep(80);
    }await sleep(500);const a=await state();assert(Math.abs(a.distance-target)<4,`arrived ${target}: ${a.distance}`);return a;
  };
  const coreCheck=async(distance)=>{
    const p=await core();await move(1510,815);await sleep(400);const cold=await state();await move(p.x,p.y);await sleep(500);const hover=await state();assert(hover.hover>cold.hover+.05,'core hover');
    const pre=await state();await click(p.x,p.y);await sleep(100);assert((await state()).shocks>pre.shocks,'actual click shockwave');
    const speeds=[];
    for(const [name,step,delay] of [['slow',2,70],['medium',5,25],['fast',12,8]]){
      await sleep(2200);const before=await state();await down(p.x,p.y);let x=p.x;
      for(let i=0;i<7;i++){x+=step;await move(x,p.y+i,1);await sleep(delay);}
      await up(x,p.y+6);await sleep(110);const after=await state();
      assert.equal(after.info.selected,before.info.selected,'core drag never selects a scene record');
      assert(Math.hypot(...after.camera.map((v,i)=>v-before.camera[i]))<.01,'core drag does not orbit camera');
      assert(Math.hypot(...after.q.map((v,i)=>v-before.q[i]))>.005,'core turns');speeds.push({name,spin:after.spin,charge:after.charge});
      if(name==='fast' && distance===272){await shot('fast-core-peak');await sleep(900);await shot('electricity-decay');}
    }
    assert(speeds[2].spin>speeds[1].spin && speeds[1].spin>speeds[0].spin,'speed order');assert(speeds[2].charge>speeds[0].charge,'charge follows pointer velocity');await sleep(3500);assert((await state()).charge<.02,'charge decays');reports.push({coreDistance:distance,radius:p.r,speeds});checkpoint();
  };
  await wheelTo(1200);await coreCheck(1200);await dragBackground('CORE');
  const journey=[];
  for(const d of [600,400,272,200,150,139]){const a=await wheelTo(d);journey.push({direction:'in',distance:a.distance,records:a.info.realRecords});if(d===400)await dragBackground('early Explore');if(d===272)await coreCheck(272);if(d===200)await dragBackground('mid Explore',true);if(d===150)await dragBackground('deep Explore');}
  await shot('pre-dive-endpoint');assert((await state()).distance>=135,'still pre dive');
  for(const d of [150,200,272,400,600,1200]){const a=await wheelTo(d);journey.push({direction:'out',distance:a.distance});}
  for(const d of [400,272,200,150,139]){await wheelTo(d);await dragBackground('rotated '+d);}
  await wheelTo(180);
  const hoverNodes=await run(`(()=>{const f=window.__BRAIN_FIELD,c=window.__THREE_CAMERA;return f.debugRecords().map(r=>{const p=f.slots.get(r.id).world.clone().project(c);return {id:r.id,x:(p.x*.5+.5)*1600,y:(-p.y*.5+.5)*900,z:p.z};}).filter(p=>p.z<1&&p.x>400&&p.x<1090&&p.y>120&&p.y<760&&Math.hypot(p.x-800,p.y-450)>180).slice(0,3);})()`);
  for(const n of hoverNodes){await move(n.x,n.y);await sleep(250);reports.push({pointerNode:n.id,hovered:(await state()).info.hovered});}
  const button=async text=>run(`(()=>{const b=[...document.querySelectorAll('aside button')].find(b=>b.textContent.trim().startsWith(${JSON.stringify(text)}));if(!b)return null;const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  // Scroll the actual sidebar to bring each real record into view before clicking.
  const select=async title=>{
    await run(`(()=>{const b=[...document.querySelectorAll('aside button')].find(b=>b.textContent.trim().startsWith(${JSON.stringify(title)}));b?.scrollIntoView({block:'center'});})()`);
    const p=await button(title);assert(p);await click(p.x,p.y);await sleep(700);assert((await state()).info.selected,'real pointer selection');
  };
  const close=async()=>{const p=await run(`(()=>{const b=document.querySelector('button[title="Close reader (Esc)"]'),r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);await click(p.x,p.y);await sleep(1800);};
  await select('Web Design UX Department');assert((await state()).info.semantic.drawn===0,'zero-link selection');const held=await state();await sleep(500);assert(drift(held,await state())>0,'other nodes still move');const id=held.info.selected;
  const position=held.records.find(r=>r.id===id).world;assert(Math.hypot(...(await state()).records.find(r=>r.id===id).world.map((v,i)=>v-position[i]))<.001,'selected node frozen');await close();
  await select('GrowForge HQ Department');await shot('deep-selected-hub');assert((await state()).info.semantic.drawn===12,'all real incident edges');
  const endpoint=await run(`(()=>{const f=window.__BRAIN_FIELD;let error=0;for(const e of f.semantic.edges){const p=e.geo.attributes.position.array,a=f.slots.get(e.ids[0]).world,b=f.slots.get(e.ids[1]).world;error=Math.max(error,Math.hypot(p[0]-a.x,p[1]-a.y,p[2]-a.z),Math.hypot(p[p.length-3]-b.x,p[p.length-2]-b.y,p[p.length-1]-b.z));}return error;})()`);assert(endpoint<.001);await close();
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await sleep(700);const p=await core();await down(p.x,p.y);await move(p.x+70,p.y+15,1);await up(p.x+70,p.y+15);await sleep(500);assert((await state()).charge<.02,'reduced motion suppresses charge');
  assert(browserErrors.length===0,JSON.stringify(browserErrors));
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({reports,journey,endpoint,browserErrors},null,2));console.log(JSON.stringify({passed:true,reports,endpoint,browserErrors}));
} finally {
  socket?.close();chrome.kill();await sleep(300);
  if(path.resolve(profile).startsWith(path.resolve(os.tmpdir())+path.sep))try{fs.rmSync(profile,{recursive:true,force:true});}catch{}
}
