import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { CoreState, CoreJobView, CoreStepView } from '../src/lib/coreState';
import { recordedOverviewStages, overviewExecutionLine } from '../src/components/spatial/dive/overviewRuntimeModel';

const empty: CoreState = { generatedAt:'2026-10-03T00:00:00Z', jobs:[], job:null, systems:{probes:[],mcp:{count:0,servers:[]},models:{count:0,list:[]},routing:'local-first',pendingApprovals:0,pendingConsultations:0,vault:{reachable:false,noteCount:0,latestDaily:null}} };
const step = (id:string,kind:CoreStepView['kind'],status:CoreStepView['status']):CoreStepView => ({id,kind,status,label:id,percent:0,outputChars:0,preview:'',sourceCount:0,tokens:null,costUsd:null,costKnown:false});
const job: CoreJobView = {id:'canonical-job',title:'Recorded mission',brief:'Fixture only',status:'running',percent:20,verified:false,createdAt:empty.generatedAt,revisionCount:0,liveNoteCount:0,steps:[step('plan-id','plan','done'),step('dept-a','department','active'),step('dept-b','department','pending'),step('qa-id','qa','pending')],departments:[],research:{sourceCount:0,verified:false,sources:[]},finalPreview:'',finalChars:0,usage:null};
const live:CoreState={...empty,job,jobs:[{id:job.id,title:job.title,status:'running',percent:20,createdAt:job.createdAt,isTest:false}]};
assert.deepEqual(recordedOverviewStages(null),[]);
assert.deepEqual(recordedOverviewStages(empty),[]);
assert.equal(overviewExecutionLine(null,0),'Operational state unavailable');
assert.equal(overviewExecutionLine(empty,0),'No active execution');
assert.equal(overviewExecutionLine(live,2),'1 active mission · 2 agents working');
const stages=recordedOverviewStages(live);
assert.equal(stages.length,3);
assert.equal(stages[1].id,'canonical-job:stage:department');
assert.deepEqual(stages[1].steps.map(record=>record.id),['dept-a','dept-b']);
assert.equal(stages[1].status,'active');
for(const status of ['done','error'] as const){const history={...live,job:{...job,status},jobs:[{...live.jobs[0],status}]};assert.deepEqual(recordedOverviewStages(history),[]);assert.equal(overviewExecutionLine(history,0),'No active execution');}
assert.deepEqual(recordedOverviewStages({...live,jobs:[{...live.jobs[0],isTest:true}]}),[]);
assert.deepEqual(recordedOverviewStages({...live,jobs:[{...live.jobs[0],id:'different-job'}]}),[]);
assert.equal(recordedOverviewStages({...live,job:{...job,steps:[step('a','department','done'),step('b','department','pending')]}})[0].status,'pending');
assert.equal(recordedOverviewStages({...live,job:{...job,steps:[step('a','department','error'),step('b','department','active')]}})[0].status,'error');
assert.equal(recordedOverviewStages({...live,systems:{...live.systems,pendingApprovals:1}})[1].status,'active'); // global approval count never invents a stage hold
const ui=readFileSync('src/components/spatial/dive/OverviewRuntime.tsx','utf8');
assert.match(ui,/id: job.id/);assert.match(ui,/detail: null/);assert.match(ui,/selection\?\.version === dismissalVersion/);assert.match(ui,/data-nora-restore/);assert.match(ui,/Start a conversation/);
const canvas=readFileSync('src/components/spatial/dive/InnerCore.tsx','utf8');
assert.match(canvas,/prefers-reduced-motion/);assert.match(canvas,/document.hidden/);assert.match(canvas,/renderer.dispose/);assert.match(canvas,/IntersectionObserver/);
assert.doesNotMatch(ui,/data-ambient-core-field|styles\.depth/,'legacy CSS field is removed');
assert.match(ui,/aria-hidden="true" data-overview-optical-background/,'latest reference background stays optical, outside the recorded execution halo');
assert.match(ui,/stages.length > 0 && <div className=\{styles.pipeline\} data-execution-halo/);
assert.doesNotMatch(canvas,/const arcs =/); // ambient geometry cannot invent execution paths
console.log('PASS Inner Core recorded-stage projection, canonical identity, history/test isolation, unknown state, derived group status, approval truth, context dismissal and native renderer lifecycle; fixture-only, no stores or providers touched.');

const { innerCoreVisualConfig: optics, coreCalibrationEnabled } = await import('../src/components/spatial/dive/innerCoreVisualConfig');
assert.equal(coreCalibrationEnabled('?coreCalibration=1',true),false);
assert.equal(coreCalibrationEnabled('?coreCalibration=1',false),true);
assert.equal(coreCalibrationEnabled('',false),false);
assert.equal(optics.geometry.shells.length,3);
assert.equal(optics.orbits.count,0);
assert.equal(optics.base.radii.length,0);
assert.match(canvas,/phase=calibration \? "idle" : phaseRef.current/);
assert.doesNotMatch(canvas,/sheet.start|sheet.span/,'membranes are concentric complete spheres');
assert.match(canvas,/worldPoint.z<0/,'rear orbit occlusion is preserved');
console.log('PASS deterministic development-only calibration and concentric optical configuration');

assert.match(canvas,/calibration && calibratedFrameRendered/,'calibration renders one frozen frame per resize');
assert.match(canvas,/optics.material.foldNormal.toFixed/,'whole-number tunings remain valid GLSL floats');

assert.equal(optics.background.arcOpacity,0,'external optical background rings are suppressed');
