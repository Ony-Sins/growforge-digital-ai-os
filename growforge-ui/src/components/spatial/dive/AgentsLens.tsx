"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, X } from 'lucide-react';
import type { Agent } from '@/lib/agents';
import type { SpatialGraphData } from '@/lib/spatial/obsidianReader';
import { departmentDisplayName } from '@/lib/departmentTaxonomy';
import { agentRecords, filteredAgents, type AgentRecord } from './agentModel';
import { FoundationAreas } from './FoundationAreas';
import { LensHeader } from './LensHeader';
import { LensState } from './LensState';
import { useLensContentStart } from './useLensContentStart';
import styles from './AgentsLens.module.css';

export function AgentsLens({departmentFilter,onClearFilter,dismissalVersion,onInspect,onClose,closing}:{departmentFilter:string|null;onClearFilter:()=>void;dismissalVersion:number;onInspect:()=>void;onClose:()=>void;closing:boolean}) {
  const fieldRef=useRef<HTMLDivElement>(null);
  useLensContentStart(fieldRef);
  const [roster,setRoster]=useState<Agent[]|null>(null);
  const [graph,setGraph]=useState<SpatialGraphData|null>(null);
  const [failed,setFailed]=useState(false);
  const [selection,setSelection]=useState<{id:string;version:number;runtime:boolean}|null>(null);
  useEffect(()=>{
    const controller=new AbortController();let busy=false;
    const load=async()=>{if(busy)return;busy=true;try{const response=await fetch('/api/agents',{signal:controller.signal,cache:'no-store'});if(!response.ok)throw new Error();const result=await response.json();if(!Array.isArray(result.agents))throw new Error();if(!controller.signal.aborted){setRoster(result.agents);setFailed(false);}}catch{if(!controller.signal.aborted){setRoster(null);setFailed(true);}}finally{busy=false;}};
    void load();const timer=setInterval(()=>void load(),10000);
    void fetch('/api/spatial/graph',{signal:controller.signal,cache:'no-store'}).then(async response=>{if(!response.ok)return;const result=await response.json();if(result.ok && !controller.signal.aborted)setGraph(result.data);}).catch(()=>{});
    return()=>{controller.abort();clearInterval(timer);};
  },[]);
  const records=useMemo(()=>agentRecords(roster??[],graph),[roster,graph]);
  const visible=filteredAgents(records,departmentFilter);
  const selected=selection?.version===dismissalVersion?visible.find(record=>record.id===selection.id):undefined;
  const select=(record:AgentRecord,runtime=false)=>{onInspect();setSelection({id:record.id,version:dismissalVersion,runtime});};
  return <>
    <LensHeader lensId="lens.agents" metrics={roster?[{label:'running now',value:records.filter(record=>record.running).length,tone:records.some(record=>record.running)?'live':undefined},{label:'specialist blueprints',value:records.filter(record=>record.kind==='specialist').length},{label:'orchestration',value:records.filter(record=>record.kind==='orchestration').length}]:undefined} note={!roster?(failed?'Agent roster unavailable':'Loading agent roster'):undefined}/>
    <div ref={fieldRef} className={styles.field} data-agents-lens>
      {departmentFilter && <div className={styles.filter} data-dive-inspector><span>{departmentDisplayName(departmentFilter)}</span><button onClick={onClearFilter} aria-label="Clear department filter">Clear <X size={11}/></button></div>}
      <div className={styles.rows} data-dive-inspector>
        {roster && !visible.some(record=>record.running) && <section aria-label="Runtime agents" data-runtime-agents><h2>Runtime · running now</h2><LensState compact kind="empty" message="No agent is running." detail="The blueprints below are definitions, not live agents."/></section>}
        {visible.some(record=>record.running) && <section aria-label="Recorded running agents"><h2>Runtime · running now</h2>{visible.filter(record=>record.running).map(record=><button key={record.id} onClick={()=>select(record,true)} data-runtime-agent-id={record.id}><span>{record.name}</span><small>Running</small><ChevronRight size={12}/></button>)}</section>}
        {visible.some(record=>record.kind==='specialist') && <section aria-label="Specialist definitions"><h2>Specialist blueprints</h2>{visible.filter(record=>record.kind==='specialist').map(record=><button key={record.id} onClick={()=>select(record)} aria-pressed={selected?.id===record.id && !selection?.runtime} data-agent-id={record.id}><span>{record.name}</span><ChevronRight size={12} aria-hidden="true"/></button>)}</section>}
        {visible.some(record=>record.kind==='orchestration') && <section className={styles.control} aria-label="Orchestration definitions"><h2>Orchestration</h2>{visible.filter(record=>record.kind==='orchestration').map(record=><button key={record.id} onClick={()=>select(record)} aria-pressed={selected?.id===record.id} data-agent-id={record.id}><span>{record.name}</span><ChevronRight size={12} aria-hidden="true"/></button>)}</section>}
        {roster && !visible.length && <p className={styles.empty}>{departmentFilter?'No recorded specialist associations for this department.':'No registered agent definitions or runs recorded.'}</p>}
      </div>
      {selected && !closing && <AgentInspection key={`${selected.id}:${selection?.runtime}`} record={selected} runtime={Boolean(selection?.runtime)} onClose={onClose}/>}
    </div>
  </>;
}

function AgentInspection({record,runtime,onClose}:{record:AgentRecord;runtime:boolean;onClose:()=>void}) {
  const [category,setCategory]=useState(runtime?'Recorded run':'Purpose');
  const categories=Object.keys(record.categories);
  const activeCategory=categories.includes(category)?category:categories.includes('Last recorded result')?'Last recorded result':'Purpose';
  useEffect(()=>{
    window.dispatchEvent(new CustomEvent('growforge:agent-context',{detail:{id:record.id,title:record.name,kind:runtime?'recorded-run':record.kind,departmentId:record.departmentId??null,context:JSON.stringify({purpose:record.categories.Purpose,recordedRun:record.categories['Recorded run']??null,relationships:record.relationships}).slice(0,2000)}}));
    return()=>{window.dispatchEvent(new CustomEvent('growforge:agent-context',{detail:null}));};
  },[record,runtime]);
  return <aside className={`${styles.inspector} surface-glass`} data-dive-inspector data-nora-side-inspector aria-label="Agent inspection">
    <button className={styles.close} aria-label="Dismiss agent inspection" onClick={onClose}><X size={14}/></button>
    <h2>{record.name}</h2><p className={styles.kind}>{runtime?'Recorded run':record.kind==='orchestration'?'Control definition':'Specialist definition'}</p>
    <FoundationAreas variant="list" label="Agent anatomy" areas={[
      {id:'agent.state',label:'State',state:record.running||record.categories['Last recorded result']?'available':'empty',summary:record.running?'Running now (recorded agent-store status).':record.categories['Last recorded result']?`Last run: ${record.categories['Last recorded result'][0]}.`:'Idle. No run recorded.'},
      {id:'agent.assignment',label:'Assignment',state:record.departmentId?'available':'empty',summary:record.departmentId?`${departmentDisplayName(record.departmentId)}${record.categories.Department?.[1]?` · ${record.categories.Department[1]}`:''} (recorded association, not a mission assignment).`:'No recorded department association.'},
      {id:'agent.model',label:'Model',state:'not-tracked',summary:'Not recorded per agent. Models are routed at run time.'},
      {id:'agent.tools',label:'Tools',state:record.categories.Tools?.length?'available':'empty',summary:record.categories.Tools?.length?`${record.categories.Tools.length} declared tool relationship${record.categories.Tools.length===1?'':'s'}.`:'No declared tool relationships.'},
      {id:'agent.activity',label:'Current activity',state:record.running?'available':'empty',summary:record.running?'Running a text-model task. No mission assignment is implied.':'Nothing running.'},
    ]}/>
    <div className={styles.categories} aria-label="Agent inspection categories">{categories.map(name=><button key={name} aria-pressed={activeCategory===name} onClick={()=>setCategory(name)}>{name}</button>)}</div>
    <div className={styles.content}>{record.categories[activeCategory]?.map(text=><p key={text}>{text}</p>)}</div>
    <details className={styles.provenance}><summary>Provenance <ChevronRight size={11}/></summary>{record.provenance.map(text=><p key={text}>{text}</p>)}</details>
  </aside>;
}
