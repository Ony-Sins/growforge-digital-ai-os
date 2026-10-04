import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "ws";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = path.resolve("verification/interaction-review-20260930");
fs.mkdirSync(out, {recursive:true});
const profile = fs.mkdtempSync(path.join(os.tmpdir(),"gf-node-trial-"));
const chrome = spawn(process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  ["--headless=new","--remote-debugging-port=9317","--enable-unsafe-swiftshader",`--user-data-dir=${profile}`,"about:blank"],{stdio:"ignore"});
let socket;
try {
  let url;
  for(let i=0;i<40&&!url;i++) { await sleep(300);try {url=(await(await fetch("http://localhost:9317/json")).json()).find(t=>t.type==="page")?.webSocketDebuggerUrl;}catch{} }
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
  await run("[...document.querySelectorAll('nav[aria-label=\"Primary navigation\"] button')].find(b=>b.textContent.trim().startsWith('Explore')).click()");
  await sleep(9500);
  for(let i=0;i<80 && await run("window.__THREE_CAMERA.position.distanceTo(window.__THREE_CONTROLS.target)")>202;i++) {
    await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:1520,y:820,deltaX:0,deltaY:-35});await sleep(100);
  }
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:1520,y:850});
  const reports=[];
  const snapshot=async name=>{
    await sleep(1700);
    const state=await run(`(() => {
      const f=window.__BRAIN_FIELD, info=f.debugInfo();
      const labels=[...document.querySelectorAll('[data-brain-labels]>div')].filter(e=>e.style.visibility!=='hidden' && +e.style.opacity>.02).map(e=>{const r=e.getBoundingClientRect();return {text:e.textContent,left:r.left,right:r.right,top:r.top,bottom:r.bottom};});
      const bodies=[...f.trialKnots.values()].reduce((n,k)=>n+k.group.children.filter(c=>c.isLineSegments).length,0);
      const warm=window.__THREE_NEUTRON_ENGINE.scene.children.filter(c=>c.isPoints && c.material?.color?.getHex()===0xffc432).length;
      return {name:${JSON.stringify(name)},info,labels,perNodeCords:bodies,warmLayers:warm};
    })()`);
    assert.equal(state.info.realRecords,28);
    assert.equal(state.info.semantic.canonical,12);
    assert.equal(state.info.links.relation,0);assert.equal(state.info.links.local,0);
    assert.equal(state.perNodeCords,0);assert.equal(state.warmLayers,0);
    const keys=state.info.semantic.edges.map(e=>JSON.stringify([...e.ids].sort()));
    assert.equal(new Set(keys).size,keys.length,'one visual per canonical edge');
    for(let i=0;i<state.labels.length;i++)for(let j=i+1;j<state.labels.length;j++){
      const a=state.labels[i],b=state.labels[j];
      assert(!(a.left<b.right && a.right>b.left && a.top<b.bottom && a.bottom>b.top),'visible labels do not collide');
    }
    const shot=await send('Page.captureScreenshot',{format:'png'});
    fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(shot.result.data,'base64'));
    reports.push(state);return state;
  };
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:1500,y:820,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:1470,y:800,button:'left',buttons:1});await sleep(300);
  const heldBefore=await run('window.__BRAIN_FIELD.debugRecords()');await sleep(700);
  const heldAfter=await run('window.__BRAIN_FIELD.debugRecords()');
  assert(heldAfter.every((r,i)=>Math.hypot(...r.world.map((v,k)=>v-heldBefore[i].world[k]))<.001),'background drag pauses all node world positions');
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:1470,y:800,button:'left',clickCount:1});await sleep(700);
  const resumed=await run('window.__BRAIN_FIELD.debugRecords()');
  assert(resumed.some((r,i)=>Math.hypot(...r.world.map((v,k)=>v-heldAfter[i].world[k]))>.01),'release resumes paths');
  const overview=await snapshot('mid-explore');
  assert.equal(await run("[...window.__BRAIN_FIELD.trialKnots.values()].filter(k=>k.group.children.some(c=>c.name==='EMBEDDED_RECORD_ICON' && c.material.uniforms.uIcon.value.image.width===256)).length"),28,'all real nodes have an embedded icon texture');
  assert(overview.labels.length>=5,'idle names are discoverable without hover');
  const midDistance=await run("window.__THREE_CAMERA.position.distanceTo(window.__THREE_CONTROLS.target)");
  for(let i=0;i<45;i++){await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:1520,y:820,deltaX:0,deltaY:65});await sleep(50);}
  const far=await snapshot('far-explore');
  assert.equal(far.info.semantic.drawn,0,'far overview has no permanently exposed semantic edges');
  assert.equal(far.labels.length,0,'no privileged overview hub label');
  const pathsBefore=await run('window.__BRAIN_FIELD.debugRecords()');
  await sleep(1400);
  const pathsAfter=await run('window.__BRAIN_FIELD.debugRecords()');
  const velocities=pathsAfter.map((r,i)=>r.world.map((v,k)=>v-pathsBefore[i].world[k]));
  assert(velocities.every(v=>Math.hypot(...v)>.01),'all named records move');
  assert(new Set(velocities.map(v=>v.map(n=>n.toFixed(2)).join(','))).size>20,'paths are individually varied');
  for(let i=0;i<100 && await run("window.__THREE_CAMERA.position.distanceTo(window.__THREE_CONTROLS.target)")>midDistance;i++) {
    await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:1520,y:820,deltaX:0,deltaY:-35});await sleep(70);
  }
  assert.equal(overview.info.selected,null);
  const expose=async id=>{
    for(let attempt=0;attempt<36;attempt++) {
      const p=await run(`(() => {const camera=window.__THREE_CAMERA;
        const w=window.__BRAIN_FIELD.slots.get(${JSON.stringify(id)}).world.clone().project(camera);
        return {x:(w.x*.5+.5)*1600,y:(-w.y*.5+.5)*900,z:w.z};})()`);
      if(p.z<1 && p.x>430 && p.x<1000 && p.y>150 && p.y<750 && Math.hypot(p.x-800,p.y-450)>210)return;
      // Review framing only, through the existing orbit camera. No record positions change.
      await run(`(() => {const camera=window.__THREE_CAMERA, controls=window.__THREE_CONTROLS;
        const offset=camera.position.clone().sub(controls.target);
        offset.applyAxisAngle(offset.clone().set(0,1,0),.24);
        camera.position.copy(controls.target).add(offset);camera.lookAt(controls.target);controls.update();})()`);
      await sleep(150);
    }
    throw new Error('could not frame selected record using orbit camera');
  };
  const select=async kind=>{
    const id=await run(`(() => {const slot=[...window.__BRAIN_FIELD.slots.values()].find(s=>${kind==='zero' ? "s.def.degree===0 && s.def.node.title==='Web Design UX Department'" : 's.def.isHub'});return slot?.def.node.id;})()`);
    assert(id);if(kind==='hub')await expose(id);
    const selected=await run(`(() => {
      const f=window.__BRAIN_FIELD;
      const slot=[...f.slots.values()].find(s=>${kind==='zero' ? "s.def.degree===0 && s.def.node.title==='Web Design UX Department'" : 's.def.isHub'});
      if(!slot)return null;
      const button=[...document.querySelectorAll('aside button')].find(b=>b.textContent.trim().startsWith(slot.def.node.title));
      if(!button)return null;button.click();return {id:slot.def.node.id,title:slot.def.node.title};
    })()`);
    assert(selected);await sleep(500);
    assert(await run("!!document.querySelector('button[title=\"Close reader (Esc)\"]')"));return selected;
  };
  const zero=await select('zero');
  const zeroState=await snapshot('zero-link');assert.equal(zeroState.info.semantic.incident,0);assert.equal(zeroState.info.semantic.drawn,0);
  assert(!zeroState.info.semantic.edges.some(e=>e.ids.includes(zero.id)));
  const before=await run(`window.__BRAIN_FIELD.slots.get(${JSON.stringify(zero.id)}).world.toArray()`);
  await sleep(700);
  const held=await run(`window.__BRAIN_FIELD.slots.get(${JSON.stringify(zero.id)}).world.toArray()`);
  assert(Math.hypot(...held.map((v,i)=>v-before[i]))<.01,'zero-link record freezes');
  await run("document.querySelector('button[title=\"Close reader (Esc)\"]').click()");await sleep(2500);
  const released=await run(`window.__BRAIN_FIELD.slots.get(${JSON.stringify(zero.id)}).world.toArray()`);
  assert(Math.hypot(...released.map((v,i)=>v-held[i]))>.1,'released record resumes');
  const hub=await select('hub');const hubState=await snapshot('multi-node');
  assert.equal(hubState.info.semantic.incident,12);assert.equal(hubState.info.semantic.drawn,12);
  assert(hubState.labels.some(l=>l.text.startsWith(hub.title)),'framed selected hub label visible');
  const endpointError=await run(`(() => {
    const f=window.__BRAIN_FIELD;let worst=0;
    for(const e of f.semantic.edges){if(!e.mesh.visible)continue;
      const a=f.slots.get(e.ids[0]).world,b=f.slots.get(e.ids[1]).world,p=e.geo.attributes.position.array;
      worst=Math.max(worst,Math.hypot(p[0]-a.x,p[1]-a.y,p[2]-a.z),Math.hypot(p[p.length-3]-b.x,p[p.length-2]-b.y,p[p.length-1]-b.z));
    }return worst;
  })()`);
  await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:1000,y:820,deltaX:0,deltaY:-160});await sleep(1600);
  await snapshot('close-selected');
  await run('window.__THREE_NEUTRON_ENGINE.dragCore(120,25,16)');await sleep(150);
  const charge=await run('window.__THREE_NEUTRON_ENGINE.stellarUniforms.uSpinCharge.value');
  assert(charge>.1,'fast real spin produces charge');await snapshot('spin-electricity');await sleep(4000);
  assert(await run('window.__THREE_NEUTRON_ENGINE.stellarUniforms.uSpinCharge.value')<.02,'electricity fades with inertia');
  assert(endpointError<.001,'all canonical bundles stay attached during selection');
  assert(!browserErrors.some(e=>/shader|WebGL|THREE|ReferenceError|TypeError/i.test(e)),JSON.stringify(browserErrors));
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({reports,zero,hub,endpointError,browserErrors},null,2));
  console.log(JSON.stringify({views:reports.map(s=>({view:s.name,canonical:s.info.semantic.canonical,drawn:s.info.semantic.drawn,labels:s.labels.length})),endpointError,freezeRelease:true,noDuplicateVisuals:true,warmLayers:0,browserErrors}));
} finally {
  socket?.close();chrome.kill();await sleep(300);
  if(path.resolve(profile).startsWith(path.resolve(os.tmpdir())+path.sep))try{fs.rmSync(profile,{recursive:true,force:true});}catch{}
}
