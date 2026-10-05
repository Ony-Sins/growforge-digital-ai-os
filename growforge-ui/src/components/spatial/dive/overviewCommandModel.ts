import type { CoreState } from '@/lib/coreState';
import type { NoraVisualSignal } from '@/lib/noraVisualSignal';
export type InnerCorePhase = 'idle'|'attentive'|'listening'|'thinking'|'responding'|'speaking'|'executing'|'awaiting'|'success'|'degraded';
/** `executingNow`, when known (Overview Snapshot), replaces the persisted-status guess: a recorded `running` job is not proof of execution. */
export function innerCorePhase(core:CoreState|null,nora:NoraVisualSignal,responseVisible=false,completedNow=false,executingNow?:boolean):InnerCorePhase {
  if(nora.error)return 'degraded';
  if(completedNow)return 'success';
  if(nora.listening)return 'listening';
  if(nora.speaking)return 'speaking';
  if(nora.processing)return 'thinking';
  if(nora.streaming||responseVisible)return 'responding';
  if(core && core.systems.pendingApprovals>0)return 'awaiting';
  if(executingNow ?? core?.jobs.some(job=>job.status==='running'&&!job.isTest))return 'executing';
  if(nora.focused)return 'attentive';
  return 'idle';
}
export function overviewCommandSummary(core:CoreState|null){
  if(!core)return null;
  const jobs=core.jobs.filter(job=>!job.isTest);
  return {running:jobs.filter(job=>job.status==='running').length,completed:jobs.filter(job=>job.status==='done').length,errors:jobs.filter(job=>job.status==='error').length,
    probes:core.systems.probes.filter(probe=>!/preview/i.test(probe.detail)),
    activity:jobs.slice().sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)).slice(0,3)};
}
export function newlyCompleted(previous:CoreState|null,current:CoreState|null):boolean {
  return !!previous && !!current && current.jobs.some(job=>!job.isTest&&job.status==='done'&&previous.jobs.some(old=>old.id===job.id&&!old.isTest&&old.status==='running'));
}
