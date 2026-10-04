import assert from 'node:assert/strict';
import fs from 'node:fs';
import { noraSurfaceContext } from '../src/lib/noraSurfaceContext';

// Exercise the actual shared-shell JSX expressions: a payload-only test missed this integration bug.
const source=fs.readFileSync('src/components/spatial/CoreCommandCenter.tsx','utf8');
const labelExpression=source.match(/contextLabel=\{([^\n]+)\}/)?.[1];
const markerExpression=source.match(/data-nora-context=\{([^\n]+?)\} className/)?.[1];
assert.ok(labelExpression);assert.ok(markerExpression);
const names=['contextSurface','selectedRecord','missionContext','departmentContext','agentContext','workflowContext','contextRecord','toolRecord','intelligenceRecord'];
const label=new Function(...names,`return (${labelExpression});`);
const marker=new Function(...names,`return (${markerExpression});`);
const selection=(title:string)=>({id:title,title,kind:'fixture',context:'Bounded recorded data',departmentId:'marketing'});
const evidence=selection('Recorded execution');
assert.equal(label('Dive In',null,null,null,null,null,null,selection('Stale tool'),evidence),evidence.title);
assert.equal(marker('Dive In',null,null,null,null,null,null,null,evidence),'selected');
assert.equal(label('Systems',null,null,null,null,null,null,null,evidence),null);
assert.ok(noraSurfaceContext('Dive In',null,null,null,null,null,null,null,evidence).includes('"evidenceId":"Recorded execution"'));
for(const title of ['Selected model','Selected connector','Selected service']) {
  const tool=selection(title);
  const args=['Dive In',null,null,null,null,null,null,tool];
  assert.equal(label(...args),title);assert.equal(marker(...args),'selected');
  assert.ok(noraSurfaceContext('Dive In',null,null,null,null,null,null,tool).includes(`"toolRecordId":"${tool.id}"`));
  assert.equal(label('Dive In',null,null,null,null,null,selection('Other context'),tool),title,'Chip follows tool-first payload priority');
  for(const surface of ['CORE','Systems','Explore']) {
    assert.equal(label(surface,null,null,null,null,null,null,tool),null);
    assert.equal(marker(surface,null,null,null,null,null,null,tool),undefined);
  }
}
for(let index=2;index<=6;index++) {
  const args:unknown[]=['Dive In',null,null,null,null,null,null,null];
  args[index]=selection(`Existing ${index}`);
  assert.equal(label(...args),index===2?`Mission: Existing ${index}`:`Existing ${index}`);
  assert.equal(marker(...args),'selected');
}
assert.equal(label('Explore',selection('Explore record'),null,null,null,null,null,selection('Stale tool')),'Explore record');
assert.equal(label('Dive In',null,null,null,null,null,null,null),null);
assert.equal(marker('Dive In',null,null,null,null,null,null,null),undefined);
const tools=fs.readFileSync('src/components/spatial/dive/ToolsLens.tsx','utf8');
assert.match(tools,/growforge:tool-record[\s\S]*detail: null/);
assert.match(source,/growforge:tool-record/);
console.log('PASS actual NORA chip/marker expressions: model, connector, service, payload priority/ID, existing selection types, dismissal and cross-surface isolation.');
