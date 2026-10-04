import assert from 'node:assert/strict';
import fs from 'node:fs';
import { memoryRecords, sourceRecords, filterContext, contextScope } from '../src/components/spatial/dive/contextModel';
import { noraSurfaceContext } from '../src/lib/noraSurfaceContext';
import type { UserMemory } from '../src/lib/userMemory';
import type { GraphNode, SpatialGraphData } from '../src/lib/spatial/obsidianReader';

const memory:UserMemory={email:'fixture@example.test',profile:{fullName:'Fixture',designation:'',companyName:'',about:'',socials:{}},writingStyle:'Concise',brandRules:['Recorded rule'],preferences:{format:'Plain'},pastOverrides:[],explicitRejections:[],learnedObservations:['Recorded value'],createdAt:'2025-01-01T00:00:00Z',updatedAt:'2025-02-01T00:00:00Z'};
const records=memoryRecords(memory);
assert.equal(records.length,5);assert.equal(new Set(records.map(r=>r.id)).size,5);
assert.equal(memoryRecords(null).length,0);
assert.equal(records.some(r=>r.modified),false,'Profile timestamp is not per-field timestamp');
assert.ok(records.every(r=>r.scope.startsWith('Current user')&&r.relationships.length===0));
assert.ok(records.every(r=>r.provenance.join(' ').includes('seeded defaults')));
assert.ok(!JSON.stringify(records).includes(memory.email));
assert.equal(memoryRecords({...memory,writingStyle:'Different'}).find(r=>r.title==='Writing style')?.id,records.find(r=>r.title==='Writing style')?.id);
function node(id:string,source:string,extra:Partial<GraphNode>={}):GraphNode{return {id,source,title:id,categoryLabel:'Fixture',color:'#fff',path:'fixture.md',excerpt:'Fixture source',content:'Recorded source text',degree:0,...extra};}
const graph:SpatialGraphData={nodes:[
  node('agent:marketing_agent_system','agents',{taxonomyKind:'department',departmentId:'marketing',lastModified:'2025-01-01T00:00:00Z'}),
  node('doc:growforge-digital---company-constitution','docs'),
  node('doc:product','docs'),node('doc:design','docs'),node('doc:roadmap','docs'),node('doc:state','docs'),node('catalog:example','vault'),node('model:example','models'),
],links:[{source:'agent:marketing_agent_system',target:'doc:growforge-digital---company-constitution',type:'structural'},{source:'agent:marketing_agent_system',target:'doc:state',type:'explicit'}],categories:[],summary:{totalNotes:8,totalConnections:2,totalSources:3}};
const sources=sourceRecords(graph);assert.equal(sources.length,2);
assert.deepEqual(sourceRecords(null),[]);assert.deepEqual(sourceRecords({...graph,nodes:[],links:[]}),[]);
assert.equal(sources[0].relationships.length,1,'Developer artifacts stay excluded from relationships');
assert.equal(filterContext([...records,...sources],'marketing').length,1);
assert.equal(filterContext([...records,...sources],'unknown').length,0);
assert.equal(filterContext([...records,...sources],null).length,7);
assert.equal(sources[0].modified,'2025-01-01T00:00:00Z');
assert.equal(sourceRecords({...graph,nodes:[{...graph.nodes[0],lastModified:'invalid'}]})[0].modified,undefined);
const scope=contextScope({...sources[0],content:'x'.repeat(9000)});assert.ok(scope.context.length<=2000);
assert.match(noraSurfaceContext('Dive In',null,null,null,null,null,scope),/contextRecordId/);
for(const surface of ['CORE','Explore','Systems'] as const)assert.match(noraSurfaceContext(surface,null,null,null,null,null,scope),/"selection":null/);
assert.match(noraSurfaceContext('Dive In',null,null,null,null,null,null),/"selection":null/);
const ui=fs.readFileSync('src/components/spatial/dive/ContextLens.tsx','utf8');
assert.match(ui,/detail:null/);assert.match(ui,/onClick=\{onClearFilter\}/);
assert.ok(!ui.includes('method:'));assert.ok(!ui.includes('demo=true'));
console.log('PASS current-user field identity, no per-field dates/origin claims, source versus knowledge, developer exclusion, actual links/filter, bounded NORA selection and cleanup.');
