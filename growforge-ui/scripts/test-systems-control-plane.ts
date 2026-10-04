import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const surface=readFileSync('src/components/workspace/SystemsControlPlane.tsx','utf8');
const hud=readFileSync('src/components/spatial/SpatialHud.tsx','utf8');
const css=readFileSync('src/components/workspace/SystemsControlPlane.module.css','utf8');
const initialBody=surface.match(/function initial\(tab:string\):Area \{([\s\S]*?)\}/)![1];
const resolve=new Function('tab',initialBody);
assert.equal(resolve('connectors'),'Connections');assert.equal(resolve('ai-providers'),'Models & Routing');assert.equal(resolve('n8n'),'Runtime');assert.equal(resolve('preferences'),'Access & Secrets');
const nav=hud.slice(hud.indexOf('const selectSurface ='),hud.indexOf('useEffect(() =>',hud.indexOf('const selectSurface =')));
const navBody=nav.slice(nav.indexOf('=> {')+4,nav.lastIndexOf('};'));
for(const target of ['core','brain','dive','systems']){
 const events:string[]=[];new Function('id','openSettings','closeSettings','onDiveIn','onSelectTier',navBody)(target,()=>events.push('systems'),()=>events.push('close'),()=>events.push('dive'),(tier:string)=>events.push(tier));
 assert.deepEqual(events,target==='systems'?['systems']:target==='dive'?['close','dive']:['close',target==='brain'?'brain':'home']);
}
assert.match(hud,/isSettingsOpen \? item.id === "systems" : surface === item.id/);
assert.ok(!surface.includes('setRole(')&&!surface.includes('role === "owner"'));
assert.ok(surface.includes('Authentication not verified')&&surface.includes('Not checked'));
assert.ok(surface.includes('setSelected(null);setDiscovery(null)'));
assert.ok(surface.includes('McpInspectorModal')&&surface.includes('NewCustomConnectorModal')&&surface.includes('AiModelInspectorModal')&&surface.includes('<Integrations/>'));
assert.ok(surface.includes("filter(p=>!/preview/i.test(p.detail))"));
assert.ok(surface.includes("selected.record.latencyMs==null?'Not recorded'"));
assert.ok(!surface.includes('latencyMs ?? 0')&&!surface.includes("hasApiKey?'Authenticated'"));
assert.match(surface,/if\(signal\?\.aborted\)return/);
assert.ok(css.includes('overflow-y:auto')&&css.includes('--systems-bottom:220px'));
assert.ok(css.includes('body:has([data-systems-form])'));
assert.ok(surface.includes('probe.id===selection.record.id')&&surface.includes("currentProbe?{kind:'runtime',record:currentProbe}:null"));
assert.ok(!surface.includes('Routing policy saved.')&&surface.includes('Changes apply to this server process only'));
assert.ok(css.includes('One Systems material')&&css.includes('.formScope input,.formScope select,.formScope textarea')&&css.includes('.formScope :global(.animate-pulse){animation:none}'));
console.log('PASS Systems: legacy-entry mapping, actual header navigation, authoritative IDs, no client-role authority, truthful probes/configuration, reused configuration flows, canceled reads and responsive form/composer clearance. No writes or execution tests.');
