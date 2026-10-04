import styles from './CapabilitySignal.module.css';

export type CapabilitySignalState = 'verified' | 'failed' | 'untested' | 'unconfigured' | 'unknown' | 'unreachable';

/** A presentation of recorded checks; configuration must be supplied by its authoritative caller. */

export function CapabilitySignal({state,latencyMs,checkedAt}:{state:CapabilitySignalState;latencyMs?:number|null;checkedAt?:string}) {

  const labels={verified:'Reachable',failed:'Check failed',untested:'Not tested',unconfigured:'Not configured',unknown:'Not checked',unreachable:'Unreachable'};

  const latency=typeof latencyMs==='number'&&Number.isFinite(latencyMs)&&latencyMs>=0?latencyMs:null;

  return <span className={styles.signal} data-state={state} title={checkedAt?`Check snapshot · ${checkedAt}`:undefined}><i aria-hidden="true"/><span>{labels[state]}</span>{latency!==null&&<small>{Math.round(latency)} ms</small>}</span>;

}

