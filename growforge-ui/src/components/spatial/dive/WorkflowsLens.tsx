"use client";

import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, X } from 'lucide-react';
import type { SpatialGraphData } from '@/lib/spatial/obsidianReader';
import { departmentDisplayName } from '@/lib/departmentTaxonomy';
import { filteredWorkflows, workflowRecords, workflowScope, type WorkflowRecord, type ProcedureStep } from './workflowModel';
import styles from './WorkflowsLens.module.css';

export function WorkflowsLens({departmentFilter,onClearFilter,dismissalVersion,onInspect,onClose,closing}:{departmentFilter:string|null;onClearFilter:()=>void;dismissalVersion:number;onInspect:()=>void;onClose:()=>void;closing:boolean}) {
  const [graph,setGraph]=useState<SpatialGraphData|null>(null);
  const [loaded,setLoaded]=useState(false);
  const [failed,setFailed]=useState(false);
  const [selection,setSelection]=useState<{id:string;version:number}|null>(null);
  useEffect(()=>{const controller=new AbortController();void fetch('/api/spatial/graph',{signal:controller.signal,cache:'no-store'}).then(async response=>{if(!response.ok)throw new Error();const result=await response.json();if(!result.ok || !Array.isArray(result.data?.nodes))throw new Error();if(!controller.signal.aborted){setGraph(result.data);setLoaded(true);}}).catch(()=>{if(!controller.signal.aborted){setFailed(true);setLoaded(true);}});return()=>controller.abort();},[]);
  const records=useMemo(()=>workflowRecords(graph),[graph]);
  const visible=filteredWorkflows(records,departmentFilter);
  const selected=selection?.version===dismissalVersion && !closing?visible.find(record=>record.id===selection.id):undefined;
  return <>
    <div className={styles.title}><h1>WORKFLOWS</h1><p>{!loaded?'Loading recorded procedures':failed?'Procedure sources unavailable':`${records.length} internal pipeline${records.length===1?'':'s'}`}</p></div>
    <div className={styles.field} data-workflows-lens data-dive-inspector>
      {departmentFilter && <div className={styles.filter}><span>{departmentDisplayName(departmentFilter)} · conditional procedure use</span><button aria-label="Clear workflow department filter" onClick={onClearFilter}>Clear <X size={11}/></button></div>}
      {!selected && visible.length>0 && <section className={styles.rows} aria-label="Internal pipeline definitions"><h2>Internal pipelines</h2>{visible.map(record=><button key={record.id} data-workflow-id={record.id} onClick={()=>{onInspect();setSelection({id:record.id,version:dismissalVersion});}}><span>{record.name}</span><small>Code-backed procedure</small><ChevronRight size={12}/></button>)}</section>}
      {loaded && !failed && !visible.length && <p className={styles.empty}>{departmentFilter?'No recorded procedures associated with this department.':'No procedure definitions exposed by the current records.'}</p>}
      {selected && <WorkflowInspection key={selected.id} record={selected} onClose={onClose}/>}
    </div>
  </>;
}

function Procedure({record,selectedStep,onSelect}:{record:WorkflowRecord;selectedStep:ProcedureStep|null;onSelect:(step:ProcedureStep)=>void}) {
  return <section className={styles.procedure} aria-label="Structural procedure"><p className={styles.structure}>Procedure structure</p><ol>{record.steps.map((step,index)=><li key={step.id}><button data-workflow-step-id={step.id} aria-pressed={selectedStep?.id===step.id} onClick={()=>onSelect(step)}><span>{index+1}</span>{step.name}{step.dynamic && <small>Parallel · plan-assigned</small>}</button>{index<record.steps.length-1 && <ChevronRight size={12} aria-hidden/>}</li>)}</ol></section>;
}

function WorkflowInspection({record,onClose}:{record:WorkflowRecord;onClose:()=>void}) {
  const [category,setCategory]=useState('Purpose');
  const [stepId,setStepId]=useState<string|null>(null);
  const selectedStep=record.steps.find(step=>step.id===stepId)??null;
  const selectStep=(step:ProcedureStep)=>{setStepId(step.id);setCategory('Steps');};
  useEffect(()=>{window.dispatchEvent(new CustomEvent('growforge:workflow-context',{detail:workflowScope(record,selectedStep)}));return()=>{window.dispatchEvent(new CustomEvent('growforge:workflow-context',{detail:null}));};},[record,selectedStep]);
  return <>
    <div className={styles.desktopProcedure}><h2>{record.name}</h2><Procedure record={record} selectedStep={selectedStep} onSelect={selectStep}/></div>
    <aside className={`${styles.inspector} surface-glass`} data-dive-inspector data-nora-side-inspector aria-label="Workflow inspection">
      <button className={styles.close} aria-label="Dismiss workflow inspection" onClick={onClose}><X size={14}/></button>
      <h2>{record.name}</h2><p className={styles.kind}>Internal pipeline · definition</p>
      <div className={styles.categories} aria-label="Workflow inspection categories">{['Purpose','Steps',...Object.keys(record.categories).filter(name=>name!=='Purpose')].map(name=><button key={name} aria-pressed={category===name} onClick={()=>setCategory(name)}>{name}</button>)}</div>
      {category==='Steps'?<div className={styles.content}><div className={styles.mobileProcedure}><Procedure record={record} selectedStep={selectedStep} onSelect={selectStep}/></div>{selectedStep?<><h3>{selectedStep.name}</h3><p>{selectedStep.purpose}</p><p>{selectedStep.dependsOn.length?`Requires: ${selectedStep.dependsOn.map(id=>record.steps.find(step=>step.id===id)?.name??id).join(', ')}`:'Input boundary · no preceding step'}</p></>:<p>Select a procedure step to inspect its recorded responsibility and dependencies.</p>}</div>:<div className={styles.content}>{record.categories[category]?.map(text=><p key={text}>{text}</p>)}</div>}
      <details className={styles.provenance}><summary>Provenance <ChevronRight size={11}/></summary>{record.provenance.map(text=><p key={text}>{text}</p>)}</details>
    </aside>
  </>;
}
