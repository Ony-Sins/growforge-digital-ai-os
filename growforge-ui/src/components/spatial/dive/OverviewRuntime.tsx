"use client";
import { innerCoreVisualConfig as optics } from "./innerCoreVisualConfig";

import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Search, Network, Layers, ShieldCheck, Package, X, ChevronRight } from 'lucide-react';
import { CapabilitySignal } from './CapabilitySignal';
import type { CoreState } from '@/lib/coreState';
import { InnerCore } from './InnerCore';
import { recordedOverviewStages, overviewExecutionLine } from './overviewRuntimeModel';
import { innerCorePhase, overviewCommandSummary, newlyCompleted } from './overviewCommandModel';
import { IDLE_NORA_SIGNAL, NORA_VISUAL_EVENT, NORA_VISUAL_REQUEST, type NoraVisualSignal } from '@/lib/noraVisualSignal';
import type { DiveLens } from './overviewModel';
import styles from './OverviewRuntime.module.css';

const ICONS = { brief: FileText, plan: FileText, research: Search, department: Network, reconcile: Layers, qa: ShieldCheck, final: Package };
const STATUS = { pending: 'Pending', active: 'In progress', done: 'Completed', error: 'Error', skipped: 'Skipped' };
const CORE_STATUS = { attentive:'Ready',listening:'Listening',thinking:'Thinking',responding:'Responding',speaking:'Speaking',executing:'Executing',awaiting:'Waiting for approval',success:'Completed',degraded:'Response unavailable' };
const SERVICE_LABELS = { ollama:'Ollama',searxng:'SearXNG',n8n:'n8n',comfyui:'ComfyUI' };
const activityLabel = (title:string) => title.split('\n')[0].replace(/^\s*#+\s*/, '').replace(/^CLIENT\s*&\s*BUSINESS:\s*/i,'').trim();
export function OverviewRuntime({ core, agentsWorking, dismissalVersion, onMission, onLens }: { core: CoreState | null; agentsWorking: number; dismissalVersion: number; onMission: (id: string) => void; onLens:(lens:DiveLens)=>void }) {
  const [nora,setNora]=useState<NoraVisualSignal>(IDLE_NORA_SIGNAL);
  const [responseVisible,setResponseVisible]=useState(false);
  const seenResponse=useRef<string|null>(null);
  const previousCore=useRef<CoreState|null>(null);
  const [completedNow,setCompletedNow]=useState(false);
  const completionTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  useEffect(()=>()=>clearTimeout(completionTimer.current),[]);
  useEffect(()=>{
    const finished=newlyCompleted(previousCore.current,core);previousCore.current=core;
    if(!finished)return;
    clearTimeout(completionTimer.current);
    completionTimer.current=setTimeout(()=>{setCompletedNow(true);completionTimer.current=setTimeout(()=>setCompletedNow(false),1400);},0);
  },[core]);
  useEffect(()=>{
    let timer:ReturnType<typeof setTimeout>|undefined;
    const update=(event:Event)=>{const signal=(event as CustomEvent<NoraVisualSignal>).detail;setNora(signal);
      if(!signal.responseId || signal.processing || signal.error){clearTimeout(timer);setResponseVisible(false);}
      if(signal.responseId && seenResponse.current!==signal.responseId){seenResponse.current=signal.responseId;const age=signal.responseAt?Date.now()-Date.parse(signal.responseAt):Infinity;if(age>=0&&age<8000){setResponseVisible(true);clearTimeout(timer);timer=setTimeout(()=>setResponseVisible(false),8000-age);}}
    };
    window.addEventListener(NORA_VISUAL_EVENT,update);window.dispatchEvent(new Event(NORA_VISUAL_REQUEST));
    return()=>{clearTimeout(timer);window.removeEventListener(NORA_VISUAL_EVENT,update);};
  },[]);
  const summary=useMemo(()=>overviewCommandSummary(core),[core]);
  const phase=innerCorePhase(core,nora,responseVisible,completedNow);
  const stages = useMemo(() => recordedOverviewStages(core), [core]);
  const [selection, setSelection] = useState<{ id: string; version: number } | null>(null);
  const selected = selection?.version === dismissalVersion ? stages.find(stage => stage.id === selection.id) : undefined;
  const job = selected ? core?.job : null;
  const split = Math.ceil(stages.length / 2);
  const position = (index: number) => { const left = index < split, rank = left ? index : index - split, count = left ? split : stages.length - split; return { left, y: count === 1 ? 50 : 12 + rank * 72 / (count - 1) }; };
  useEffect(() => {
    if (!job || !selected) return;
    window.dispatchEvent(new CustomEvent('growforge:mission-context', { detail: { id: job.id, title: job.title, context: JSON.stringify({ source: 'Overview recorded execution', jobId: job.id, stageId: selected.id, stepIds: selected.steps.map(step => step.id), steps: selected.steps }) } }));
    return () => { window.dispatchEvent(new CustomEvent('growforge:mission-context', { detail: null })); };
  }, [job, selected]);
  const wake = () => { document.querySelector<HTMLButtonElement>('[data-nora-restore]')?.click(); requestAnimationFrame(() => document.querySelector<HTMLInputElement>('[aria-label="Start a conversation"]')?.focus()); };
  return <>
    <svg className={styles.referenceField} viewBox="0 0 1920 1080" preserveAspectRatio="none" aria-hidden="true" data-overview-optical-background>
      <g fill="none" stroke="#136783" strokeWidth=".7" opacity={optics.background.arcOpacity}>
        <ellipse cx={optics.background.centerX} cy={optics.background.centerY} rx={optics.background.scaleX} ry={optics.background.scaleY} opacity=".18" />
        <ellipse cx="960" cy="585" rx="315" ry="235" opacity=".28" />
        <ellipse cx="960" cy="585" rx="285" ry="214" opacity=".13" />
        <path d="M0 340 Q960 620 1920 340 M0 810 Q960 1080 1920 810" opacity=".18" />
        <path d="M0 180 C340 290 340 730 0 920 M1920 180 C1580 290 1580 730 1920 920" opacity=".13" />
      </g>
    </svg>
    <div className={styles.volume} data-inner-core-overview>
      <InnerCore onWake={wake} phase={phase} />
      {stages.length > 0 && <div className={styles.pipeline} data-execution-halo aria-label="Recorded mission stages">
        <svg className={styles.paths} viewBox="0 0 1000 500" preserveAspectRatio="none" aria-hidden="true">{stages.map((stage, index) => { const { left, y: percent } = position(index), y = percent * 5; return <path key={stage.id} d={`M500 250 Q${left ? 250 : 750} ${y} ${left ? 160 : 840} ${y}`} data-active={stage.status === 'active'} />; })}</svg>
        {stages.map((stage, index) => { const Icon = ICONS[stage.kind]; return <button key={stage.id} className={styles.stage} style={{ left: position(index).left ? '9%' : '77%', top: `${position(index).y}%` }} data-status={stage.status} aria-pressed={selected?.id === stage.id} onClick={() => setSelection({ id: stage.id, version: dismissalVersion })} title={`${stage.label} · ${STATUS[stage.status]}`}><Icon size={20} strokeWidth={1.4} /><span>{stage.label}<small>{STATUS[stage.status]}{stage.steps.length > 1 ? ` · ${stage.steps.length} recorded steps` : ''}</small></span></button>; })}
      </div>}
    </div>
    <div className={styles.commandSurfaces} data-nora-open={nora.conversationOpen} aria-label="Workspace overview">
      <div className={styles.leftSurfaces}>
        <section className={styles.commandSurface} aria-label="Mission Status"><header><div><h2>Mission Status</h2><p>Recorded work in your workspace</p></div><button aria-label="Open Missions" onClick={()=>onLens('Missions')}>Open</button></header>
          <div className={styles.missionSummary}><div><strong>{summary?.running??'—'}</strong><span>Running</span></div><div><strong>{summary?.completed??'—'}</strong><span>Completed</span></div><div><strong>{summary?.errors??'—'}</strong><span>Errors</span></div></div><p className={styles.surfaceNote}>{summary?'Recorded history · test runs excluded':'Operational snapshot unavailable'}</p>
        </section>
        <section className={styles.commandSurface} aria-label="Service Reachability"><header><div><h2>System Health</h2><p>Measured service reachability</p></div><button aria-label="Inspect service evidence" onClick={()=>onLens('Tools')}>Open</button></header>
          {summary?.probes.length?<ul className={styles.serviceList}>{summary.probes.map(probe=><li key={probe.id}><span>{SERVICE_LABELS[probe.id]??probe.label}</span><CapabilitySignal state={probe.online?'verified':'unreachable'} latencyMs={probe.latencyMs} checkedAt={core?.generatedAt} /></li>)}</ul>:<p className={styles.empty}>Reachability has not been measured.</p>}
        </section>
      </div>
      <div className={styles.rightSurfaces}>
        <section className={styles.commandSurface} aria-label="Recent Activity"><header><div><h2>Recent Activity</h2><p>Latest recorded missions</p></div><button aria-label="Inspect recorded activity" onClick={()=>onLens('Intelligence')}>Open</button></header>
          {summary?.activity.length?<ul className={styles.activityList}>{summary.activity.map(job=><li key={job.id} data-status={job.status}><time dateTime={job.createdAt} title={`Created ${new Date(job.createdAt).toLocaleString()}`}>{new Date(job.createdAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</time><button onClick={()=>onMission(job.id)} title={job.title}><span>{activityLabel(job.title)}</span><small>{job.status==='done'?'Completed':job.status==='error'?'Error':'Running'} · recorded mission</small></button></li>)}</ul>:<p className={styles.empty}>{summary?'No recorded mission activity.':'Activity snapshot unavailable.'}</p>}
        </section>
        <section className={styles.commandSurface} aria-label="Quick Actions"><header><div><h2>Quick Actions</h2><p>Open your operational workspace</p></div></header><div className={styles.quickActions}><button onClick={()=>onLens('Missions')}>Open Missions</button><button onClick={()=>onLens('Agents')}>Inspect Agents</button><button onClick={()=>onLens('Intelligence')}>View Evidence</button><button onClick={()=>onLens('Tools')}>Inspect Services</button></div></section>
      </div>
    </div>
    {responseVisible&&!nora.conversationOpen&&nora.response&&nora.response.length<=220&&<button className={styles.subtitle} onClick={wake} aria-label="Open NORA response">{nora.response}</button>}
    <div className={styles.runtimeLine} aria-live="polite"><span>{phase==='idle'?overviewExecutionLine(core, agentsWorking):CORE_STATUS[phase]}</span>{!!core?.systems.pendingApprovals && <button onClick={() => window.dispatchEvent(new CustomEvent('growforge:mission-approvals', { detail: null }))}>{core.systems.pendingApprovals} approval{core.systems.pendingApprovals === 1 ? '' : 's'} awaiting review <ChevronRight size={12} /></button>}</div>
    {selected && job && <aside className={styles.inspector} data-dive-inspector aria-label="Recorded stage inspection"><header><div><small>RECORDED EXECUTION</small><h2>{selected.label}</h2></div><button aria-label="Dismiss stage inspector" onClick={() => setSelection(null)}><X size={16} /></button></header><p>{job.title}</p>{selected.steps.map(step => <section key={step.id}><h3>{step.label}</h3><span>{STATUS[step.status]}</span>{step.provider && <p>Provider · {step.provider}</p>}{step.startedAt && <p>Started · {new Date(step.startedAt).toLocaleString()}</p>}{step.finishedAt && <p>Finished · {new Date(step.finishedAt).toLocaleString()}</p>}{step.error && <p>{step.error}</p>}<details><summary>Provenance</summary><p>Job · {job.id}</p><p>Step · {step.id}</p>{step.startedAt && <p>{step.startedAt}</p>}</details></section>)}<button className={styles.openMission} onClick={() => onMission(job.id)}>Inspect mission <ChevronRight size={14} /></button></aside>}
  </>;
}
