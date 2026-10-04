"use client";
import React, { useState } from 'react';
import Image from 'next/image';
import { X, ArrowRight, ChevronDown } from 'lucide-react';
import type { GraphNode, GraphLink } from '@/lib/spatial/obsidianReader';
import { Markdown } from '@/components/ui/Markdown';
import { presentEntity, entityBrandAsset, safeEntitySource, entityType, type EntityPresentationContext } from '@/lib/spatial/entityPresentation';

interface NoteReaderModalProps { node:GraphNode|null; allNodes:GraphNode[]; allLinks:GraphLink[]; onClose:()=>void; onSelectNode:(node:GraphNode)=>void; presentationContext?:EntityPresentationContext }
export function NoteReaderModal(props:NoteReaderModalProps) {
  return props.node ? <EntityPanel key={props.node.id} {...props} node={props.node}/> : null;
}
function EntityPanel({node,allNodes,allLinks,onClose,onSelectNode,presentationContext}:NoteReaderModalProps & {node:GraphNode}) {
  const [expanded,setExpanded]=useState(false);
  const entity=presentEntity(node,allNodes,allLinks,presentationContext), brand=entityBrandAsset(node.title);
  const connections=expanded ? entity.related : entity.related.slice(0,4);
  const specialists=entity.related.filter(item=>entityType(item.node)==='Specialist');
  const branches=node.branches?.flatMap(branch=>[branch.name,...(branch.children??[])]) ?? [];
  const validDate=node.lastModified && Number.isFinite(Date.parse(node.lastModified));
  const document=['agents','specialists','docs','vault'].includes(node.source);
  return <div data-nora-side-inspector className="entity-panel-position fixed z-30 top-24 bottom-24 right-5 w-[min(400px,calc(100vw-1.5rem))] pointer-events-none flex items-stretch">
    <section aria-label={`${node.title} selected entity`} className="entity-panel surface-glass pointer-events-auto flex w-full flex-col overflow-hidden rounded-2xl text-slate-200" onClick={event=>event.stopPropagation()}>
      <header className="shrink-0 border-b border-white/10 px-5 py-5">
        <div className="flex items-start gap-3">
          {brand && <Image src={brand} alt="" width={30} height={30} className="mt-1 h-8 w-8 shrink-0 object-contain" unoptimized/>}
          <div className="min-w-0 flex-1"><h2 className="text-[19px] font-medium leading-7 tracking-wide text-slate-100">{node.title}</h2><p className="mt-1 text-[11px] text-cyan-200/65">{entity.type}</p></div>
          <button onClick={onClose} title="Close reader (Esc)" aria-label="Close selected entity" className="entity-close rounded-md p-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"><X size={16}/></button>
        </div>
      </header>
      <div className="entity-panel-body min-h-0 flex-1 overflow-y-auto px-5 py-5 space-y-6">
        <p className="text-[13px] leading-[1.8] text-slate-300">{entity.summary}</p>
        {entity.current.length>0 && <section aria-label="Current recorded state"><h3 className="entity-section-label">Current</h3><dl className="space-y-2">{entity.current.map(fact=><div key={fact.label}><dt className="text-[10px] text-slate-500">{fact.label}</dt><dd className="mt-1 text-xs leading-5 text-slate-300">{fact.value}</dd></div>)}</dl></section>}
        {entity.role && <section><h3 className="entity-section-label">Role in your system</h3><p className="text-xs leading-6 text-slate-300">{entity.role}</p></section>}
        {entity.related.length>0 && <figure aria-label="Recorded relationship map" className="entity-relationship-map">
          <div className="entity-map-root">{node.title}</div>
          <div className="entity-map-branches">{entity.related.slice(0,3).map(item=><button key={item.node.id} onClick={()=>onSelectNode(item.node)} className="entity-map-target"><span>{item.node.title}</span><small>{item.relation==='permission'?'Permitted access':item.relation==='assignment'?'Recorded assignment':item.relation==='taxonomy'?'Organizational link':item.relation==='verification'?'Review relationship':'Structural link'}</small></button>)}</div>
          <figcaption>Recorded relationships · no live traffic implied</figcaption>
        </figure>}
        {entity.facts.length>0 && <section aria-label="Recorded operational context"><h3 className="entity-section-label">{entity.type==='Connector'?'Access & Scope':entity.type==='AI Model'?'Routing':entity.type==='Specialist'?'Assignment':'Context'}</h3><dl className="space-y-3">{entity.facts.map(fact=><div key={fact.label}><dt className="text-[10px] text-slate-500">{fact.label}</dt><dd className="mt-1 text-xs leading-5 text-slate-300">{fact.value}</dd></div>)}</dl></section>}
        {branches.length>0 && <details className="entity-disclosure"><summary>Capabilities <span className="text-slate-500">{branches.length}</span><ChevronDown size={12}/></summary><ul className="mt-3 space-y-2 text-xs text-slate-300">{branches.map(branch=><li key={branch}>{branch}</li>)}</ul><p className="mt-3 text-[11px] leading-5 text-slate-500">Defined areas of responsibility; installed tools or agents are represented separately.</p></details>}
        {specialists.length>0 && <details className="entity-disclosure"><summary>Specialists <span className="text-slate-500">{specialists.length}</span><ChevronDown size={12}/></summary><div className="mt-2">{specialists.map(item=><button key={item.node.id} onClick={()=>onSelectNode(item.node)} className="entity-connection"><span>{item.node.title}</span><ArrowRight size={13}/></button>)}</div></details>}
        {entity.related.length>0 && <section aria-label="Connected entities"><h3 className="entity-section-label">Connections</h3>{connections.map(item=><button key={item.node.id} onClick={()=>onSelectNode(item.node)} className="entity-connection"><span className="min-w-0"><span className="block truncate">{item.node.title}</span><span className="mt-1 block text-[10px] text-slate-500">{item.relation ? ({permission:'Permitted access',assignment:'Recorded assignment',verification:'Review relationship',taxonomy:'Organizational relationship'}[item.relation]) : entityType(item.node)}</span></span><ArrowRight size={13} className="shrink-0"/></button>)}{entity.related.length>4 && <button onClick={()=>setExpanded(!expanded)} className="mt-2 text-[11px] text-slate-400 hover:text-cyan-200">{expanded?'Show fewer':`View all ${entity.related.length} connections`}</button>}</section>}
        <details className="entity-disclosure" aria-label="Source and provenance"><summary><span>Source</span><span className="ml-auto text-[10px] text-slate-500">1 source record</span><ChevronDown size={12}/></summary>
          <div className="mt-4 space-y-4 text-xs leading-5 text-slate-400">
            <p>{document?'Source document':'Saved configuration'} · {node.title}</p>
            <p className="break-all text-[11px]">{safeEntitySource(node.path)}</p>
            {validDate && node.source!=='capabilities' && <p>{document?'File modified':'Record created'} · {new Date(node.lastModified!).toLocaleDateString(undefined,{dateStyle:'medium'})}</p>}
            <p className="text-[11px] text-slate-500">Source-backed information describes the saved record. It does not establish live availability, execution or approval.</p>
            <details className="entity-disclosure"><summary>Original source<ChevronDown size={12}/></summary><p className="my-3 text-[11px] text-slate-500">Historical or vendor terminology is preserved here. It does not define the current organization.</p><Markdown content={entity.source} size="base"/></details>
          </div>
        </details>
      </div>
    </section>
  </div>;
}
