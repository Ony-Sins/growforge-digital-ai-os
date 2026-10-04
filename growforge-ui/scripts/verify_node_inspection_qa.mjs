import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "ws";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = path.resolve("verification/inspection-review-20260930");
fs.mkdirSync(out, {recursive:true});
const profile = fs.mkdtempSync(path.join(os.tmpdir(),"gf-node-trial-"));
const chrome = spawn(process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  ["--headless=new","--remote-debugging-port=9329","--enable-unsafe-swiftshader",`--user-data-dir=${profile}`,"about:blank"],{stdio:"ignore"});
let socket;
try {
  let url;
  for(let i=0;i<40&&!url;i++) { await sleep(300);try {url=(await(await fetch("http://localhost:9329/json")).json()).find(t=>t.type==="page")?.webSocketDebuggerUrl;}catch{} }
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
    const nucleus=await core();const empty=[[420,840],[1000,840],[420,110],[1000,110]].find(([x,y])=>Math.hypot(x-nucleus.x,y-nucleus.y)>nucleus.r+80) || [420,840];
    const [ex,ey]=empty;
    await move(ex,ey);await down(ex,ey);await move(ex+25,ey-10,1);await sleep(250);
    const a=await state();await sleep(550);const b=await state();
    assert(a.paused && b.paused,stage+' hold flag');assert(drift(a,b)<.001,stage+' no autonomous drift');
    if(capture)await shot('mid-background-held');await up(ex+25,ey-10);const released=await state();await sleep(150);const short=await state();await sleep(500);const c=await state();
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
  await wheelTo(200);
  const label=async id=>run(`(()=>{const els=[...document.querySelectorAll('[data-brain-labels] [data-node-id]')];const el=${id?"els.find(e=>e.dataset.nodeId==="+JSON.stringify(id)+")":"els.find(e=>{const r=e.getBoundingClientRect();return getComputedStyle(e).visibility==='visible'&&r.x>370&&r.right<1090&&r.y>100&&r.bottom<800;})"};if(!el||getComputedStyle(el).visibility!=='visible')return null;const r=el.getBoundingClientRect();return{id:el.dataset.nodeId,x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  const p=await label();assert(p,'visible label');await move(p.x,p.y);await sleep(300);assert.equal((await state()).info.hovered,p.id,'name hover');
  await click(p.x,p.y);await sleep(300);assert.equal((await state()).info.selected,p.id,'name single click');
  const before=await state();const q=await label(p.id);assert(q);
  await down(q.x,q.y);await up(q.x,q.y);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:q.x,y:q.y,button:'left',buttons:1,clickCount:2});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:q.x,y:q.y,button:'left',clickCount:2});await sleep(1800);
  const focused=await state();assert.equal(focused.info.selected,p.id);assert(focused.distance<50,'name double click approaches');
  assert(Math.hypot(...focused.camera.map((v,i)=>v-before.camera[i]))>20,'camera moves');
  const projected=await run(`(()=>{const f=window.__BRAIN_FIELD,c=window.__THREE_CAMERA,p=f.getRecordWorld(f.debugInfo().selected).project(c);return {x:(p.x*.5+.5)*1600,y:(-p.y*.5+.5)*900};})()`);assert(projected.x>380&&projected.x<1090&&projected.y>90&&projected.y<810,'node framed outside panels');
  await shot('name-focused');
  const close=async()=>{const p=await run(`(()=>{const b=document.querySelector('button[title="Close reader (Esc)"]'),r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);await click(p.x,p.y);await sleep(1800);};
  await close();const returned=await state();assert(Math.hypot(...returned.camera.map((v,i)=>v-before.camera[i]))<2,'camera returns');assert.equal(returned.info.selected,null);
  // Body target away from CORE and panels; real pointer double click.
  const body=await run(`(()=>{const f=window.__BRAIN_FIELD,c=window.__THREE_CAMERA;return f.debugRecords().map(r=>{const p=f.getRecordWorld(r.id).project(c);return{id:r.id,x:(p.x*.5+.5)*1600,y:(-p.y*.5+.5)*900,z:p.z};}).find(p=>p.z<1&&p.x>390&&p.x<1070&&p.y>140&&p.y<770&&Math.hypot(p.x-800,p.y-450)>180);})()`);assert(body);
  await move(body.x,body.y);await sleep(150);await down(body.x,body.y);await up(body.x,body.y);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:body.x,y:body.y,button:'left',buttons:1,clickCount:2});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:body.x,y:body.y,button:'left',clickCount:2});await sleep(1700);
  const bf=await state();assert.equal(bf.info.selected,body.id);assert(bf.distance<50,'body doubleclick approaches');await shot('body-focused');
  const frozen=bf.records.find(r=>r.id===body.id).world;await sleep(350);assert(Math.hypot(...(await state()).records.find(r=>r.id===body.id).world.map((v,i)=>v-frozen[i]))<.001,'selected frozen');
  await dragBackground('inspection orbit');await close();
  // Compare actual projected wave plane/core size at two distances; pointer click starts each wave.
  const waves=[];
  for(const d of [1200,180]){await wheelTo(d);const c=await core();await click(c.x,c.y);await sleep(350);const sizes=await run(`(()=>{const e=window.__THREE_NEUTRON_ENGINE,c=window.__THREE_CAMERA;const project=r=>{const v=new c.position.constructor().setFromMatrixColumn(c.matrixWorld,0).multiplyScalar(r).project(c),o=new c.position.constructor().project(c);return Math.abs(v.x-o.x)*800;};return {core:project(e.stellarSphere.scale.x),wave:project(e.stellarHalo.scale.x*.5),shocks:e.shockStarts.length};})()`);assert(sizes.shocks>0);assert(Math.abs(sizes.wave/sizes.core-4)<.01);waves.push({d,...sizes});await shot('wave-'+d);}
  assert(waves[1].wave>waves[0].wave*1.5,'wave grows with zoom');
  await run(`(()=>{const b=[...document.querySelectorAll('aside button')].find(b=>b.textContent.trim().startsWith('GrowForge HQ Department'));b.scrollIntoView({block:'center'});})()`);
  const hub=await run(`(()=>{const b=[...document.querySelectorAll('aside button')].find(b=>b.textContent.trim().startsWith('GrowForge HQ Department')),r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await click(hub.x,hub.y);await send('Input.dispatchMouseEvent',{type:'mousePressed',x:hub.x,y:hub.y,button:'left',buttons:1,clickCount:2});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:hub.x,y:hub.y,button:'left',clickCount:2});await sleep(1800);
  assert((await state()).distance<50,'HQ name in list doubleclick');assert.equal((await state()).info.semantic.drawn,12);await shot('HQ-focused');
  const endpoint=await run(`(()=>{const f=window.__BRAIN_FIELD;let error=0;for(const edge of f.semantic.edges){if(!edge.mesh.visible)continue;const p=edge.geo.attributes.position.array,a=f.getRecordWorld(edge.ids[0]),b=f.getRecordWorld(edge.ids[1]);error=Math.max(error,Math.hypot(p[0]-a.x,p[1]-a.y,p[2]-a.z),Math.hypot(p[p.length-3]-b.x,p[p.length-2]-b.y,p[p.length-1]-b.z));}return{error,edges:f.semantic.edges.length,records:f.debugRecords().length};})()`);assert(endpoint.error<.001);assert.equal(endpoint.edges,12);assert.equal(endpoint.records,28);await close();
  // Interruption: start a fresh actual double-click approach and orbit before its tween finishes.
  await click(hub.x,hub.y);await send('Input.dispatchMouseEvent',{type:'mousePressed',x:hub.x,y:hub.y,button:'left',buttons:1,clickCount:2});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:hub.x,y:hub.y,button:'left',clickCount:2});
  const interruptionCore=await core();const emptyPoints=[[400,850],[1050,850],[400,90],[1050,90]].sort((a,b)=>Math.hypot(b[0]-interruptionCore.x,b[1]-interruptionCore.y)-Math.hypot(a[0]-interruptionCore.x,a[1]-interruptionCore.y));const [ix,iy]=emptyPoints[0];await move(ix,iy);await down(ix,iy);await move(ix+20,iy+5,1);assert((await state()).paused,'actual background hold during approach');await up(ix+20,iy+5);await sleep(200);const interrupted=await state();await sleep(950);assert(Math.abs((await state()).distance-interrupted.distance)<2,'orbit cancels camera tween without later pull');await close();
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await click(hub.x,hub.y);await send('Input.dispatchMouseEvent',{type:'mousePressed',x:hub.x,y:hub.y,button:'left',buttons:1,clickCount:2});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:hub.x,y:hub.y,button:'left',clickCount:2});await sleep(200);assert((await state()).distance<50,'reduced motion inspection settles promptly');await close();
  assert(browserErrors.length===0,JSON.stringify(browserErrors));fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({label:p.id,body:body.id,waves,browserErrors},null,2));console.log(JSON.stringify({passed:true,label:p.id,body:body.id,waves,browserErrors}));
} finally {
  socket?.close();chrome.kill();await sleep(300);
  if(path.resolve(profile).startsWith(path.resolve(os.tmpdir())+path.sep))try{fs.rmSync(profile,{recursive:true,force:true});}catch{}
}
