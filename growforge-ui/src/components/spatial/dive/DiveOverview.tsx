"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CoreState } from "@/lib/coreState";
import type { Agent } from "@/lib/agents";
import { Scan, Target, UsersRound, Workflow, Brain, Wrench, Hexagon, Network } from "lucide-react";
import { DepartmentsLens } from './DepartmentsLens';
import { AgentsLens } from './AgentsLens';
import { WorkflowsLens } from './WorkflowsLens';
import { ContextLens } from './ContextLens';
import { ToolsLens } from './ToolsLens';
import { IntelligenceLens } from './IntelligenceLens';
import { departmentRecords } from './departmentModel';
import { DiveInterior } from "./DiveInterior";
import { OverviewRuntime } from "./OverviewRuntime";
import { DiveInspector } from "./DiveInspector";
import { MissionLens } from "./MissionLens";
import { activeMissions, missionObject } from "./missionModel";
import { MissionControls } from "./MissionControls";
import { DIVE_LENSES, overviewHealth, overviewObjects, type DiveLens } from "./overviewModel";
import styles from "./DiveOverview.module.css";

const LENS_ICONS = { Overview: Scan, Missions: Target, Departments: Network, Agents: UsersRound, Workflows: Workflow, Context: Brain, Tools: Wrench, Intelligence: Hexagon };

export function DiveOverview() {
  useEffect(() => () => { document.querySelector<HTMLElement>('[data-spatial-viewport]')?.scrollTo({top:0}); }, []);
  const [core, setCore] = useState<CoreState | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [available, setAvailable] = useState(false);
  const [lens, setLens] = useState<DiveLens>("Overview");
  useEffect(() => { document.querySelector<HTMLElement>('[data-spatial-viewport]')?.scrollTo({top:0}); }, [lens]);
  const [requestedLens, setRequestedLens] = useState<DiveLens | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [dismissalVersion,setDismissalVersion]=useState(0);
  const [selectedDepartment,setSelectedDepartment]=useState<string|null>(null);
  const [departmentFilter,setDepartmentFilter]=useState<string|null>(null);
  const [workflowDepartmentFilter,setWorkflowDepartmentFilter]=useState<string|null>(null);
  const [contextDepartmentFilter,setContextDepartmentFilter]=useState<string|null>(null);
  const [toolsDepartmentFilter,setToolsDepartmentFilter]=useState<string|null>(null);
  useEffect(()=>{const select=(event:Event)=>setSelectedDepartment((event as CustomEvent<{departmentId:string}|null>).detail?.departmentId??null);window.addEventListener('growforge:department-context',select);return()=>window.removeEventListener('growforge:department-context',select);},[]);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissInspection = useCallback(() => {
    setRequestedLens(null);
    setDismissalVersion(version=>version+1);
    setClosing(true);
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(() => { setSelectedId(null); setClosing(false); }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    async function load() {
      if (busy) return;
      busy = true;
      try {
        const [stateResponse, agentResponse] = await Promise.all([fetch("/api/core/state", { signal: controller.signal, cache: "no-store" }), fetch("/api/agents", { signal: controller.signal, cache: "no-store" })]);
        if (!stateResponse.ok || !agentResponse.ok) throw new Error("Snapshot unavailable");
        const state: CoreState = await stateResponse.json();
        const roster: { agents: Agent[] } = await agentResponse.json();
        if (!controller.signal.aborted) { setCore(state); setAgents(roster.agents ?? []); setAvailable(true); }
      } catch { if (!controller.signal.aborted) { setAvailable(false); setCore(null); setAgents([]); } }
      finally { busy = false; }
    }
    void load();
    const refresh = () => void load();
    window.addEventListener("growforge:missions-refresh", refresh);
    const timer = setInterval(() => void load(), 10000);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener("growforge:missions-refresh", refresh); };
  }, []);
  useEffect(() => {
    let pressedAt: { x: number; y: number } | null = null;
    const press = (event: PointerEvent) => { pressedAt = { x: event.clientX, y: event.clientY }; };
    const dismiss = (event: KeyboardEvent) => { if (event.key === "Escape") dismissInspection(); };
    const background = (event: MouseEvent) => {
      if (!pressedAt || Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y) > 5) return;
      const target = event.target;
      if (target instanceof Element && !target.closest("button, input, textarea, [data-dive-inspector]")) dismissInspection();
    };
    window.addEventListener("keydown", dismiss); window.addEventListener("pointerdown", press); window.addEventListener("click", background);
    return () => { window.removeEventListener("keydown", dismiss); window.removeEventListener("pointerdown", press); window.removeEventListener("click", background); if (dismissTimer.current) clearTimeout(dismissTimer.current); };
  }, [dismissInspection]);
  const objects = useMemo(() => overviewObjects(core, agents), [core, agents]);
  const selected = objects.find(object => object.id === selectedId);
  const missions = activeMissions(core);
  const selectedSummary = core?.jobs.find(job => job.id === selectedId && !job.isTest);
  const selectedRecord = selectedSummary ? missionObject(selectedSummary) : null;
  const working = objects.filter(object => object.kind === "agent");
  const measuredProbes = core?.systems.probes.filter(probe => !/preview/i.test(probe.detail)) ?? [];
  const serviceState = measuredProbes.length ? `${measuredProbes.filter(probe => probe.online).length}/${measuredProbes.length}` : overviewHealth(core);
  const visible = objects.filter(object => (lens === "Overview" || lens === "Missions") && object.kind === "mission" || lens === "Overview" && object.kind === "agent");
  const lensResponse = !available ? "Operational state unavailable. Activity is not inferred." : lens === "Intelligence" ? "Available when sufficient operational history exists." : lens === "Workflows" ? "No execution-linked workflow records available." : lens === "Context" ? "No execution-linked context record available." : lens === "Agents" && !working.length ? "No active agent execution recorded." : null;
  return <section className={styles.shell} aria-label="Dive Command Overview" data-dive-overview data-lens={lens}>
    <DiveInterior />
    {lens !== 'Agents' && lens !== 'Workflows' && lens !== 'Context' && lens !== 'Tools' && lens !== 'Intelligence' && <div className={styles.title}>{lens === 'Departments' ? <><h1>DEPARTMENTS</h1><p>{departmentRecords(null).filter(record=>record.taxon.kind==='department').length} operating departments · {departmentRecords(null).filter(record=>record.taxon.kind==='oversight').length} oversight</p></> : <><p className={styles.eyebrow}>{lens === "Missions" ? "MISSION / EXECUTION" : "COMMAND OVERVIEW"}</p><h1>{lens.toUpperCase()}</h1>{lens === "Missions" && <p>Operational Intelligence</p>}
      <div className={`${styles.status} ${lens === "Overview" ? styles.stateSpine : ""}`} aria-live="polite">{lens === "Overview" ? <>
        <button onClick={() => setLens("Missions")} data-state-present={available && missions.length > 0}><small>ACTIVE MISSIONS</small><strong>{available ? missions.length : "\u2014"}</strong></button>
        <button onClick={() => setLens("Agents")} data-state-present={available && working.length > 0}><small>AGENTS WORKING</small><strong>{available ? working.length : "\u2014"}</strong></button>
        <button onClick={() => window.dispatchEvent(new CustomEvent("growforge:mission-approvals", { detail: null }))} data-state-present={available && (core?.systems.pendingApprovals ?? 0) > 0}><small>APPROVALS</small><strong>{available ? core?.systems.pendingApprovals : "\u2014"}</strong></button>
        <button onClick={() => setLens("Tools")} className={styles.health}><small>SERVICES</small><strong>{serviceState}</strong></button>
      </> : <><span><strong>{available ? missions.length : "\u2014"}</strong> active missions</span><span><strong>{available ? working.length : "\u2014"}</strong> agents working</span><span><strong>{available ? core?.systems.pendingApprovals : "\u2014"}</strong> approvals</span><span className={styles.health}>{overviewHealth(core)}</span></>}</div>
    </>}</div>}
    {lens === 'Overview' && <OverviewRuntime core={core} agentsWorking={working.length} dismissalVersion={dismissalVersion} onLens={setLens} onMission={id => { setLens('Missions'); setSelectedId(id); setClosing(false); }} />}
    {lens !== 'Overview' && <div className={styles.map} aria-label="Execution map">
      {lens !== 'Departments' && lens !== 'Agents' && lens !== 'Workflows' && lens !== 'Context' && lens !== 'Tools' && lens !== 'Intelligence' && (missions.length > 0 || working.length > 0) && <p className={styles.eyebrow}>EXECUTION MAP</p>}
      <div className={styles.systemField}>
        {lens === "Missions" && (missions.length > 0 || selectedRecord) ? <MissionLens missions={missions} selectedRecord={selectedRecord} selectedId={selectedId} closing={closing} onSelect={id => { if (dismissTimer.current) clearTimeout(dismissTimer.current); setClosing(false); setSelectedId(id); }} onClose={dismissInspection} /> : visible.slice(0, 5).map((object, index) => <div key={object.id} className={index === 0 ? styles.anchor : styles.workObject} style={index ? { left: `${20 + (index - 1) * 20}%`, top: "78%" } : undefined}>
          <button className={styles.node} aria-pressed={!closing && selectedId === object.id} aria-label={`Inspect ${object.name}`} onClick={() => { if (dismissTimer.current) clearTimeout(dismissTimer.current); setClosing(false); setSelectedId(object.id); }}><span className={styles.nodeMark} aria-hidden /><span>{object.name}</span><small>{object.kind === "system" ? "Structural scope" : object.status}</small></button>
          {selected?.id === object.id && <DiveInspector key={object.id} object={selected} closing={closing} onClose={dismissInspection} />}
        </div>)}
      </div>
      {lens !== "Missions" && visible.length > 5 && <p className={styles.mapNote}>{visible.length - 5} additional running objects · overview condensed</p>}
    </div>}
    {lens === 'Departments' && <DepartmentsLens dismissalVersion={dismissalVersion} closing={closing} onClose={dismissInspection} onInspect={()=>{if(dismissTimer.current)clearTimeout(dismissTimer.current);setClosing(false);}}/>}
    {lens === 'Agents' && <AgentsLens departmentFilter={departmentFilter} onClearFilter={()=>setDepartmentFilter(null)} dismissalVersion={dismissalVersion} closing={closing} onClose={dismissInspection} onInspect={()=>{if(dismissTimer.current)clearTimeout(dismissTimer.current);setClosing(false);}}/>}
    {lens === 'Workflows' && <WorkflowsLens departmentFilter={workflowDepartmentFilter} onClearFilter={()=>setWorkflowDepartmentFilter(null)} dismissalVersion={dismissalVersion} closing={closing} onClose={dismissInspection} onInspect={()=>{if(dismissTimer.current)clearTimeout(dismissTimer.current);setClosing(false);}}/>}
    {lens === 'Context' && <ContextLens departmentFilter={contextDepartmentFilter} onClearFilter={()=>setContextDepartmentFilter(null)} dismissalVersion={dismissalVersion} closing={closing} onClose={dismissInspection} onInspect={()=>{if(dismissTimer.current)clearTimeout(dismissTimer.current);setClosing(false);}}/>}
    {lens === 'Tools' && <ToolsLens departmentFilter={toolsDepartmentFilter} onClearFilter={()=>setToolsDepartmentFilter(null)} dismissalVersion={dismissalVersion} closing={closing} onClose={dismissInspection} onInspect={()=>{if(dismissTimer.current)clearTimeout(dismissTimer.current);setClosing(false);}}/>}
    {lens === 'Intelligence' && <IntelligenceLens core={core} available={available} dismissalVersion={dismissalVersion} closing={closing} onClose={dismissInspection} onInspect={()=>{if(dismissTimer.current)clearTimeout(dismissTimer.current);setClosing(false);}}/>}
    {lens !== 'Intelligence' && requestedLens === lens && lensResponse && <aside key={lens} className={styles.lensResponse} aria-label={`${lens} lens response`} data-dive-inspector><button className={styles.close} aria-label="Dismiss lens response" onClick={() => setRequestedLens(null)}>×</button><h2>{lens}</h2><p>{lensResponse}</p></aside>}
    <nav className={styles.lenses} aria-label="Dive lenses">{DIVE_LENSES.map(name => { const Icon = LENS_ICONS[name]; return <button key={name} aria-pressed={lens === name} onClick={() => { if(name==='Tools' && lens!=='Tools')setToolsDepartmentFilter(lens==='Departments'?selectedDepartment:null);if(name!=='Tools')setToolsDepartmentFilter(null);if(name==='Context' && lens!=='Context')setContextDepartmentFilter(lens==='Departments'?selectedDepartment:null);if(name!=='Context')setContextDepartmentFilter(null);if(name==='Workflows' && lens!=='Workflows')setWorkflowDepartmentFilter(lens==='Departments'?selectedDepartment:null);if(name!=='Workflows')setWorkflowDepartmentFilter(null);if(name==='Agents' && lens!=='Agents')setDepartmentFilter(lens==='Departments'?selectedDepartment:null);if(name!=='Agents')setDepartmentFilter(null);setLens(name); if(name==='Departments' || name==='Agents' || name==='Workflows' || name==='Context' || name==='Tools' || name==='Intelligence'){setSelectedId(null);setClosing(false);} setRequestedLens(name === "Overview" || name === "Missions" || name==='Departments' || name==='Agents' || name==='Workflows' || name==='Context' || name==='Tools' || name==='Intelligence' ? null : name); }}><Icon size={13} strokeWidth={1.5} aria-hidden="true" />{name}</button>; })}</nav>
    {lens === "Missions" && available && <MissionControls jobs={core?.jobs ?? []} onSelect={id => { if (dismissTimer.current) clearTimeout(dismissTimer.current); setClosing(false); setSelectedId(id); window.dispatchEvent(new Event("growforge:missions-refresh")); }} />}
  </section>;
}
