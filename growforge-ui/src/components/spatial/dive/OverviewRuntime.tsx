"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { GrowForgeGlyph } from '../GrowForgeGlyph';
import type { CoreState } from '@/lib/coreState';
import type { OverviewSnapshot } from '@/lib/overviewSnapshot';
import { NoraStageField } from './NoraStageField';
import { OverviewAtmosphere } from './OverviewAtmosphere';
import { noraStageLevel } from './noraStageModel';
import { recordedOverviewStages, overviewExecutionLine } from './overviewRuntimeModel';
import { innerCorePhase, newlyCompleted } from './overviewCommandModel';
import { IDLE_NORA_SIGNAL, NORA_VISUAL_EVENT, NORA_VISUAL_REQUEST, type NoraVisualSignal } from '@/lib/noraVisualSignal';
import type { DiveLens } from './overviewModel';
import type { SharedDepth } from './diveDepthModel';
import { activityGraph, attentionRows, briefState, healthRows, liveStatusText, nowView, operationalStrip, recentRows, recentState, snapshotCounts, stageStatusLabel, type AttentionRow, type RecentRow } from './overviewBriefingModel';
import { AttentionPanel, BriefPanel, HealthDisclosure, OperationalStrip, RecentPanel, SnapshotPanel } from './OverviewBriefing';
import styles from './OverviewRuntime.module.css';

const CORE_STATUS = { attentive:'Ready',listening:'Listening',thinking:'Thinking',responding:'Responding',speaking:'Speaking',executing:'Executing',awaiting:'Waiting for approval',success:'Completed',degraded:'Response unavailable' };

/**
 * Overview V2-B. Heading + operational snapshot on top; Now (left), the NORA briefing stage (center) and Needs
 * attention / Recent (right) below. Every value comes from the Overview Snapshot via overviewBriefingModel; the
 * only recorded-vs-live wording lives there. The center is reserved for NORA: today the temporary Inner Core, later
 * the NORA Morph Field plus a projection layer where contextual surfaces can appear and disappear.
 */
export function OverviewRuntime({ core, snapshot, agentsWorking, dismissalVersion, onMission, onLens, depth = 'front' }: { core: CoreState | null; snapshot: OverviewSnapshot | null; agentsWorking: number; dismissalVersion: number; onMission: (id: string) => void; onLens:(lens:DiveLens)=>void; depth?: SharedDepth }) {
  // `front` = Overview. Any other depth = the same environment seen from a deeper lens: the cards, heading and brief dissolve (inert), NORA stays mounted and alive.
  const front = depth === 'front';
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
  const phase=innerCorePhase(core,nora,responseVisible,completedNow,snapshot?snapshot.executingNow.missionIds.length>0:undefined);
  const stages = useMemo(() => recordedOverviewStages(core), [core]);
  const [selection, setSelection] = useState<{ id: string; version: number } | null>(null);
  const selected = front && selection?.version === dismissalVersion ? stages.find(stage => stage.id === selection.id) : undefined;
  const job = selected ? core?.job : null;
  const now = useMemo(() => nowView(snapshot, core), [snapshot, core]);
  const strip = useMemo(() => operationalStrip(snapshot), [snapshot]);
  const [attentionExpanded, setAttentionExpanded] = useState(false);
  const attention = useMemo(() => attentionRows(snapshot, attentionExpanded), [snapshot, attentionExpanded]);
  const recent = useMemo(() => recentRows(snapshot), [snapshot]);
  const recentStatus = useMemo(() => recentState(snapshot), [snapshot]);
  const counts = useMemo(() => snapshotCounts(snapshot), [snapshot]);
  const health = useMemo(() => healthRows(snapshot), [snapshot]);
  const graph = useMemo(() => activityGraph(snapshot), [snapshot]);
  const stageLevel = noraStageLevel(snapshot);
  const evidence = now.mission?.evidence ?? 'recorded_unconfirmed';
  useEffect(() => {
    if (!job || !selected) return;
    window.dispatchEvent(new CustomEvent('growforge:mission-context', { detail: { id: job.id, title: job.title, context: JSON.stringify({ source: 'Overview recorded execution', jobId: job.id, stageId: selected.id, stepIds: selected.steps.map(step => step.id), steps: selected.steps }) } }));
    return () => { window.dispatchEvent(new CustomEvent('growforge:mission-context', { detail: null })); };
  }, [job, selected]);
  const wake = () => { document.querySelector<HTMLButtonElement>('[data-nora-restore]')?.click(); requestAnimationFrame(() => document.querySelector<HTMLInputElement>('[aria-label="Start a conversation"]')?.focus()); };
  const inspectAttention = (row: AttentionRow) => {
    if (row.entity.type === 'approval') window.dispatchEvent(new CustomEvent('growforge:mission-approvals', { detail: null }));
    else if (row.missionId) onMission(row.missionId);
    else onLens(row.lens);
  };
  const openRecent = (row: RecentRow) => { if (row.missionId) onMission(row.missionId); else onLens('Missions'); };
  return <>
    {/* Environment: light only (falloff, haze, reflected light, sparse particles). No floor, grid or scenery. Decorative only: it encodes no data. */}
    <OverviewAtmosphere depth={depth} />
    <div className={styles.layout} data-overview-layout data-depth={depth}>
      <header className={styles.head} inert={front ? undefined : true}>
        <h1 className={styles.heading}>Overview</h1>
        <OperationalStrip cells={strip} onLens={onLens} />
      </header>
      <div className={styles.stageGrid}>
        <div className={styles.left} data-overview-side="left" inert={front ? undefined : true}>
          <SnapshotPanel counts={counts} graph={graph} now={now} selectedStageId={selected?.id ?? null} onStage={id => setSelection({ id, version: dismissalVersion })} onMission={onMission} onLens={onLens} />
          <HealthDisclosure rows={health} onOpen={() => onLens('Tools')} />
        </div>
        {/* CENTER: the NORA briefing stage. The luminous object is a TEMPORARY placeholder, not the CORE and not coupled
            to CORE runtime: it sits in one replaceable slot so the NORA Morph Field can take its place without re-layout. */}
        <div className={styles.center} data-nora-briefing-stage>
          <div className={styles.noraObject} data-nora-stage-object>
            <div className={styles.volume} data-nora-stage-field-host inert={front ? undefined : true}><NoraStageField level={stageLevel} phase={phase} onWake={wake} quiet={!front} /></div>
          </div>
          <div className={styles.projectionLayer} data-briefing-projection-layer aria-hidden="true" />
          <div className={styles.briefDock} inert={front ? undefined : true}><BriefPanel state={briefState(snapshot)} /></div>
        </div>
        <div className={styles.right} data-overview-side="right" inert={front ? undefined : true}>
          <AttentionPanel rows={attention.rows} hidden={attention.hidden} expanded={attentionExpanded} onReveal={() => setAttentionExpanded(value => !value)} onInspect={inspectAttention} />
          <RecentPanel rows={recent.rows} state={recentStatus} onOpen={openRecent} />
        </div>
      </div>
    </div>
    <div className={styles.srOnly} aria-live="polite">{phase==='idle'?`${overviewExecutionLine(core, agentsWorking, snapshot)}. ${liveStatusText(snapshot)}`:CORE_STATUS[phase]}</div>
    {front&&responseVisible&&!nora.conversationOpen&&nora.response&&nora.response.length<=220&&<button className={styles.subtitle} onClick={wake} aria-label="Open NORA response">{nora.response}</button>}
    {selected && job && <aside className={styles.inspector} data-dive-inspector aria-label="Recorded stage inspection"><header><div><small>RECORDED EXECUTION</small><h2>{selected.label}</h2></div><button aria-label="Dismiss stage inspector" onClick={() => setSelection(null)}><GrowForgeGlyph name="dismiss" size={16} /></button></header><p>{job.title}</p>{selected.steps.map(step => <section key={step.id}><h3>{step.label}</h3><span>{stageStatusLabel(step.status, evidence)}</span>{step.provider && <p>Provider · {step.provider}</p>}{step.startedAt && <p>Started · {new Date(step.startedAt).toLocaleString()}</p>}{step.finishedAt && <p>Finished · {new Date(step.finishedAt).toLocaleString()}</p>}{step.error && <p>{step.error}</p>}<details><summary>Provenance</summary><p>Job · {job.id}</p><p>Step · {step.id}</p>{step.startedAt && <p>{step.startedAt}</p>}</details></section>)}<button className={styles.openMission} onClick={() => onMission(job.id)}>Inspect mission <GrowForgeGlyph name="reach" size={14} /></button></aside>}
  </>;
}
