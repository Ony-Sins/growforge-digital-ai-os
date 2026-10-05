"use client";

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { SpatialGraphData } from '@/lib/spatial/obsidianReader';
import type { UserMemory } from '@/lib/userMemory';
import { departmentDisplayName } from '@/lib/departmentTaxonomy';
import { contextScope, filterContext, memoryRecords, sourceRecords, type ContextDomain, type ContextRecord } from './contextModel';
import { scopeText } from '@/lib/diveLenses';
import { FoundationAreas, type FoundationArea } from './FoundationAreas';
import { LensHeader } from './LensHeader';
import { useDiveScope } from './diveScope';
import styles from './ContextLens.module.css';

type ReadState<T>={value:T|null;status:'loading'|'ready'|'unavailable'};
export function ContextLens({departmentFilter,onClearFilter,dismissalVersion,closing,onInspect,onClose}:{departmentFilter:string|null;onClearFilter:()=>void;dismissalVersion:number;closing:boolean;onInspect:()=>void;onClose:()=>void}) {
  const [memory,setMemory]=useState<ReadState<UserMemory>>({value:null,status:'loading'});
  const [graph,setGraph]=useState<ReadState<SpatialGraphData>>({value:null,status:'loading'});
  const [domain,setDomain]=useState<ContextDomain|null>(null);
  const [selection,setSelection]=useState<{id:string;version:number}|null>(null);
  useEffect(()=>{
    const controller=new AbortController();
    void fetch('/api/profile/memory',{signal:controller.signal,cache:'no-store'}).then(async response=>{
      if(!response.ok)throw new Error();const data=await response.json();
      if(!data.memory?.profile || !data.memory?.preferences)throw new Error();
      if(!controller.signal.aborted)setMemory({value:data.memory,status:'ready'});
    }).catch(()=>{if(!controller.signal.aborted)setMemory({value:null,status:'unavailable'});});
    void fetch('/api/spatial/graph',{signal:controller.signal,cache:'no-store'}).then(async response=>{
      if(!response.ok)throw new Error();const data=await response.json();
      if(!data.ok || !Array.isArray(data.data?.nodes) || !Array.isArray(data.data?.links))throw new Error();
      if(!controller.signal.aborted)setGraph({value:data.data,status:'ready'});
    }).catch(()=>{if(!controller.signal.aborted)setGraph({value:null,status:'unavailable'});});
    return()=>controller.abort();
  },[]);
  const records=useMemo(()=>[...memoryRecords(memory.value),...sourceRecords(graph.value)],[memory.value,graph.value]);
  const filtered=filterContext(records,departmentFilter);
  const selected=selection?.version===dismissalVersion&&!closing?filtered.find(record=>record.id===selection.id):undefined;
  const status=(name:ContextDomain)=>name==='Memory'?memory.status:graph.status;
  const domains:ContextDomain[]=departmentFilter?['Sources']:['Memory','Sources'];
  const currentDomain=domain && domains.includes(domain)?domain:null;
  const countLabel=(name:ContextDomain)=>{
    const count=filtered.filter(record=>record.domain===name).length;
    return `${count} ${name==='Memory'?(count===1?'field':'fields'):(count===1?'record':'records')}`;
  };
  const address=useDiveScope();
  const memoryCount=records.filter(record=>record.domain==='Memory').length;
  const sourceCount=records.filter(record=>record.domain==='Sources').length;
  const areaState=(read:ReadState<unknown>,count:number):FoundationArea['state']=>read.status==='loading'?'loading':read.status==='unavailable'?'unavailable':count?'available':'empty';
  const areas:FoundationArea[]=[
    {id:'context.current',label:'Current context',state:'not-tracked',summary:`NORA scope: ${address?scopeText(address):'Current Context'}. What is loaded into a model is not recorded, and stored is not the same as loaded.`,action:{label:'Why is this loaded?',onClick:()=>{},disabled:true,title:'Loading provenance is not recorded yet.'}},
    {id:'context.memory',label:'Relevant memory',state:areaState(memory,memoryCount),summary:memory.status==='ready'?(memoryCount?'Populated profile fields. Relevance to the current task is not scored yet.':'No populated memory fields.'):memory.status==='loading'?'Reading profile memory.':'Profile memory is unavailable in this session.',count:memory.status==='ready'?memoryCount:null,action:memoryCount?{label:'Open memory',onClick:()=>setDomain('Memory')}:undefined},
    {id:'context.decisions',label:'Decisions',state:'not-tracked',summary:'Decisions are not recorded yet. None are inferred from notes.'},
    {id:'context.evidence',label:'Evidence / sources',state:areaState(graph,sourceCount),summary:graph.status==='ready'?(sourceCount?'Source documents. A source is not knowledge and not a decision.':'No source records exposed.'):graph.status==='loading'?'Reading source documents.':'Source documents are unavailable in this session.',count:graph.status==='ready'?sourceCount:null,action:sourceCount?{label:'Open sources',onClick:()=>setDomain('Sources')}:undefined},
    {id:'context.recent',label:'Recent context',state:'not-tracked',summary:'Recently loaded context is not recorded yet.'},
  ];
  return <>
    <LensHeader lensId="lens.context" metrics={memory.status==='ready'&&graph.status==='ready'?[{label:'memory fields',value:records.filter(record=>record.domain==='Memory').length},{label:'source records',value:records.filter(record=>record.domain==='Sources').length}]:undefined} note={memory.status==='loading'||graph.status==='loading'?'Loading context sources':memory.status==='unavailable'&&graph.status==='unavailable'?'Context sources unavailable':undefined}/>
    <div className={styles.field} data-context-lens data-dive-inspector>
      {departmentFilter && <div className={styles.filter}><span>{departmentDisplayName(departmentFilter)} · source scope</span><button aria-label="Clear context department filter" onClick={onClearFilter}>Clear <X size={11}/></button></div>}
      {!selected && !currentDomain && !departmentFilter && <FoundationAreas areas={areas} label="Context areas"/>}
      {!selected && (currentDomain || departmentFilter) && <section className={styles.rows} aria-label="Context domains">
        {currentDomain?<>
          <button className={styles.back} onClick={()=>setDomain(null)}><ArrowLeft size={12}/>Context domains</button>
          <h2>{currentDomain}{currentDomain==='Memory'?' · populated profile fields':''}</h2>
          {filtered.filter(record=>record.domain===currentDomain).map(record=><button key={record.id} data-context-record-id={record.id} onClick={()=>{onInspect();setSelection({id:record.id,version:dismissalVersion});}}><span>{record.title}</span><ChevronRight size={12}/></button>)}
          {status(currentDomain)==='ready'&&!filtered.some(record=>record.domain===currentDomain)&&<p className={styles.empty}>No {currentDomain==='Memory'?'populated memory fields':'source records'} exposed in this scope.</p>}
          {status(currentDomain)==='unavailable'&&<p className={styles.empty}>This context source is unavailable in the current session.</p>}
        </>:domains.map(name=><button key={name} onClick={()=>setDomain(name)}><span>{name}</span><small>{status(name)==='loading'?'Loading':status(name)==='unavailable'?'Unavailable':countLabel(name)}</small><ChevronRight size={12}/></button>)}
      </section>}
      {selected && <ContextInspection key={selected.id} record={selected} onClose={onClose}/>}
    </div>
  </>;
}

function ContextInspection({record,onClose}:{record:ContextRecord;onClose:()=>void}) {
  const [category,setCategory]=useState('Content');
  useEffect(()=>{window.dispatchEvent(new CustomEvent('growforge:context-record',{detail:contextScope(record)}));return()=>{window.dispatchEvent(new CustomEvent('growforge:context-record',{detail:null}));};},[record]);
  const categories=['Content','Scope',...(record.relationships.length?['Relationships']:[]),...(record.modified?['Modified']:[])];
  return <aside className={`${styles.inspector} surface-glass`} aria-label="Context inspection" data-dive-inspector data-nora-side-inspector>
    <button className={styles.close} aria-label="Dismiss context inspection" onClick={onClose}><X size={14}/></button>
    <h2>{record.title}</h2><p className={styles.kind}>{record.kind}</p>
    <div className={styles.categories} aria-label="Context inspection categories">{categories.map(name=><button key={name} aria-pressed={category===name} onClick={()=>setCategory(name)}>{name}</button>)}</div>
    <div className={styles.content}>
      {category==='Content'&&(record.domain==='Sources'?<div className={styles.document}><ReactMarkdown skipHtml components={{img:()=>null,a:({children})=><span>{children}</span>}}>{record.content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/,'')}</ReactMarkdown></div>:<p className={styles.recordText}>{record.content}</p>)}
      {category==='Scope'&&<><p>{record.departmentId?departmentDisplayName(record.departmentId):record.scope}</p><p>{record.domain==='Memory'?'User-scoped profile field. Organization values do not establish a separate workspace/client record.':'Source document scope. This is not extracted knowledge or a durable decision.'}</p><p>Stored does not mean currently loaded into a model.</p></>}
      {category==='Relationships'&&record.relationships.map(link=><p key={link.id}>{link.title}<small>{link.type} · structural link</small></p>)}
      {category==='Modified'&&record.modified&&<><time dateTime={record.modified}>{new Date(record.modified).toLocaleString()}</time><p>Source file modification time; no freshness or approval is inferred.</p></>}
    </div>
    <details className={styles.provenance}><summary>Provenance <ChevronRight size={11}/></summary>{record.provenance.map(text=><p key={text}>{text}</p>)}</details>
  </aside>;
}
