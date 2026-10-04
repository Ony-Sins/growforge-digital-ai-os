import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {advanceDive,diveDistance,diveLandingOpacity,diveContentOpacity,diveMembraneLight,DIVE_JOURNEY_MS} from '../src/components/spatial/dive/diveJourney';
assert.equal(DIVE_JOURNEY_MS,1600);
assert.equal(advanceDive(0,1,1600),1);
assert.equal(advanceDive(.5,1,800),1);
assert.equal(advanceDive(.8,1,320),1);
assert.equal(advanceDive(.5,0,800),0);
assert.equal(advanceDive(.5,0,80),.45);
assert.equal(advanceDive(.45,1,80),.5);
assert.equal(advanceDive(.45,1,0),.45);
assert.equal(advanceDive(.45,0,0),.45);
assert.equal(advanceDive(.45,0,0,true),0);
for(const start of [136,272,880]){
  const radius=20;
  assert.equal(diveDistance(0,start,radius),start);
  assert.equal(diveDistance(1,start,radius),8);
  let prior=start;
  for(let i=0;i<=1000;i++){
    const d=diveDistance(i/1000,start,radius);
    assert.ok(Number.isFinite(d)&&d<=prior+1e-8&&d>=8);
    assert.equal(d,diveDistance(i/1000,start,radius)); // direction-independent camera geometry
    prior=d;
  }
  assert.ok(diveDistance(.55,start,radius)<radius/Math.sin(19*Math.PI/180)); // fills viewport
  assert.ok(diveDistance(.8,start,radius)<radius); // crossed actual surface
}
assert.equal(diveLandingOpacity(0),0);assert.equal(diveLandingOpacity(1),1);
assert.ok(diveLandingOpacity(.8)>0); // destination begins resolving through crossing
assert.equal(diveContentOpacity(.8),0); // no operational controls printed on plasma
assert.equal(diveContentOpacity(1),1);
assert.ok(diveLandingOpacity(.84)>.9); // interior takes over before exterior disappears
assert.ok(diveMembraneLight(.78)>diveMembraneLight(1));
assert.ok(Math.abs(diveMembraneLight(1)-.025)<1e-10);
const canvas=readFileSync('src/components/spatial/SpatialCanvas.tsx','utf8');
assert.match(canvas,/if \(!isReducedMotion\) \{\s+starField\.rotation\.y \+= deltaMs \* 0\.00008;\s+transitField\.rotation\.y \+= deltaMs \* 0\.00004;/, 'ambient star/dust rotation respects reduced motion');
// Exercise the actual wheel handler with both directions and the old entry prompt active.
const wheelBody=canvas.slice(canvas.indexOf('const handleWheel = (ev: WheelEvent) => {'),canvas.indexOf('const journeySurface ='));
assert.ok(!wheelBody.includes('startDiveInRef.current()'));
let wheelEntries=0, wheelPrevented=0;
const interaction={current:0};
const makeWheel=new Function('Element','diveInRef','inspectRef','travelTransitionRef','diveRef','lastInteractionRef','divePromptRef','startDiveInRef','diveLayerRef',wheelBody.replace('(ev: WheelEvent)','(ev)')+'; return handleWheel;');
const ordinaryWheel=makeWheel(class {},{current:null},{current:null},{current:null},{current:null},interaction,{current:true},{current:()=>wheelEntries++},{current:false});
for(const deltaY of [-120,-1,0,1,120]) ordinaryWheel({target:null,deltaY,preventDefault:()=>wheelPrevented++,stopImmediatePropagation:()=>wheelPrevented++});
assert.equal(wheelEntries,0);assert.equal(wheelPrevented,0);assert.ok(interaction.current>0);
const activeJourney={progress:1,target:1,last:0};
const insideDiveWheel=makeWheel(class {},{current:activeJourney},{current:null},{current:null},{current:null},interaction,{current:false},{current:()=>wheelEntries++},{current:true});
for(const deltaY of [-120,120])insideDiveWheel({target:null,deltaY,preventDefault:()=>wheelPrevented++,stopImmediatePropagation:()=>wheelPrevented++});
assert.equal(activeJourney.target,1,'scroll must never reverse Dive toward Explore');
assert.equal(wheelPrevented,0,'Dive content retains native page scrolling');
assert.ok(canvas.includes('onDiveIn={() => startDiveInRef.current()}')); // explicit entry remains wired
assert.ok(!canvas.includes('WarpStreaks')&&!canvas.includes('streaks.update'));
assert.ok(canvas.includes('diveInspectionRef.current=inspectRef.current'));
assert.ok(canvas.includes('inspectRef.current=diveInspectionRef.current'));
assert.ok(canvas.includes('capture: true'));
const core=readFileSync('src/components/spatial/neutronCore/NeutronCoreEngine.ts','utf8');
assert.ok(!core.includes('THREE.DoubleSide')); // exterior shader never draws rear white limbs
assert.ok(core.includes('material.depthTest=on;material.depthWrite=on'));
assert.match(canvas,/renderer\.toneMappingExposure=1\.05;\s+setFlash\(0\);/);
console.log('PASS 1.6s full/partial timing, immediate reversal, identical geometry, near/far approach, surface crossing, continuous landing, no warp instantiation, inspection preservation and wheel ownership; no stores modified.');

// Explicit Explore navigation must honor its destination after reversing a CORE-origin dive.
const exitBranch=canvas.slice(canvas.indexOf('if ((diveLayerRef.current || diveInRef.current) && tier === "brain")'),canvas.indexOf('if (diveLayerRef.current || diveInRef.current) exitDiveLayerNowRef.current()'));
for (const returnVisual of ['core','brain','missions']) {
  let reversals=0; const destinations:string[]=[]; const pending:{current:null|(()=>void)}={current:null};
  new Function('tier','diveLayerRef','diveInRef','pendingDiveExitRef','startDiveOutRef','selectTierRef',exitBranch)('brain',{current:true},{current:{returnVisual}},pending,{current:()=>reversals++},{current:(tier:string)=>destinations.push(tier)});
  assert.equal(reversals,1); pending.current?.();
  assert.deepEqual(destinations,returnVisual==='brain'?[]:['brain']);
}
assert.match(canvas,/const requestedExit = pendingDiveExitRef.current;\s+pendingDiveExitRef.current = null;\s+requestedExit\?\.\(\);/);
console.log('PASS explicit Explore destination after CORE-origin Dive; Explore-origin camera restoration preserved.');
