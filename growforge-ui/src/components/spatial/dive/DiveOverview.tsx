"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CoreState } from "@/lib/coreState";
import type { Agent } from "@/lib/agents";
import { GrowForgeGlyph, LENS_GLYPH } from "../GrowForgeGlyph";
import { DepartmentsLens } from './DepartmentsLens';
import { AgentsLens } from './AgentsLens';
import { WorkflowsLens } from './WorkflowsLens';
import { ContextLens } from './ContextLens';
import { ToolsLens } from './ToolsLens';
import { IntelligenceLens } from './IntelligenceLens';
import { FinanceLens } from './FinanceLens';
import { DiveScopeProvider, useDiveScopeAddress } from './diveScope';
import { DIVE_OPEN_EVENT, lensByLabel, lensById, type DiveLensId, type DiveOpenDetail } from '@/lib/diveLenses';
import { DiveInterior } from "./DiveInterior";
import { OverviewRuntime } from "./OverviewRuntime";
import { DiveInspector } from "./DiveInspector";
import { MissionLens } from "./MissionLens";
import { DIVE_TIMING, sharedDepth } from "./diveDepthModel";
import { useLensPresence } from "./useLensPresence";
import { activeMissions, missionObject } from "./missionModel";
import type { OverviewSnapshot } from "@/lib/overviewSnapshot";
import { MissionControls } from "./MissionControls";
import { DIVE_LENSES, overviewObjects, type DiveLens } from "./overviewModel";
import styles from "./DiveOverview.module.css";


/** `initialLensId` is read once at mount: the URL (reload) or a Back/Forward step chose the lens before Dive In opened. */
export function DiveOverview({ initialLensId }: { initialLensId?: DiveLensId } = {}) {
  useEffect(() => () => { document.querySelector<HTMLElement>('[data-spatial-viewport]')?.scrollTo({top:0}); }, []);
  const [core, setCore] = useState<CoreState | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [available, setAvailable] = useState(false);
  const [snapshot, setSnapshot] = useState<OverviewSnapshot | null>(null);
  const [lens, setLens] = useState<DiveLens>(() => (initialLensId && (lensById(initialLensId)?.label as DiveLens | undefined)) || "Overview");
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
    dismissTimer.current = setTimeout(() => { setSelectedId(null); setClosing(false); }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 240);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    async function load() {
      if (busy) return;
      busy = true;
      try {
        const [stateResponse, agentResponse, snapshotResponse] = await Promise.all([fetch("/api/core/state", { signal: controller.signal, cache: "no-store" }), fetch("/api/agents", { signal: controller.signal, cache: "no-store" }), fetch("/api/overview", { signal: controller.signal, cache: "no-store" }).catch(() => null)]);
        if (!stateResponse.ok || !agentResponse.ok) throw new Error("Snapshot unavailable");
        const state: CoreState = await stateResponse.json();
        const roster: { agents: Agent[] } = await agentResponse.json();
        // The snapshot refines what Overview claims (executing vs merely recorded). If it is unavailable the recorded view stands.
        const grounded: OverviewSnapshot | null = snapshotResponse?.ok ? await snapshotResponse.json().catch(() => null) : null;
        if (!controller.signal.aborted) { setCore(state); setAgents(roster.agents ?? []); setSnapshot(grounded); setAvailable(true); }
      } catch { if (!controller.signal.aborted) { setAvailable(false); setCore(null); setAgents([]); setSnapshot(null); } }
      finally { busy = false; }
    }
    void load();
    const refresh = () => void load();
    window.addEventListener("growforge:missions-refresh", refresh);
    const timer = setInterval(() => void load(), 10000);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener("growforge:missions-refresh", refresh); };
  }, []);
  // Missions keeps its selected mission until the explicit back control is used; every other lens still dismisses on background/Esc.
  const lensRef = useRef(lens);
  useEffect(() => { lensRef.current = lens; });
  useEffect(() => {
    let pressedAt: { x: number; y: number } | null = null;
    const press = (event: PointerEvent) => { pressedAt = { x: event.clientX, y: event.clientY }; };
    const dismiss = (event: KeyboardEvent) => { if (event.key === "Escape" && lensRef.current !== "Missions") dismissInspection(); };
    const background = (event: MouseEvent) => {
      if (lensRef.current === "Missions") return;
      if (!pressedAt || Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y) > 5) return;
      const target = event.target;
      if (target instanceof Element && !target.closest("button, input, textarea, [data-dive-inspector]")) dismissInspection();
    };
    window.addEventListener("keydown", dismiss); window.addEventListener("pointerdown", press); window.addEventListener("click", background);
    return () => { window.removeEventListener("keydown", dismiss); window.removeEventListener("pointerdown", press); window.removeEventListener("click", background); if (dismissTimer.current) clearTimeout(dismissTimer.current); };
  }, [dismissInspection]);
  const objects = useMemo(() => overviewObjects(core, agents, snapshot ? new Set(snapshot.executingNow.agentIds) : undefined), [core, agents, snapshot]);
  const selected = objects.find(object => object.id === selectedId);
  const missions = activeMissions(core);
  const selectedSummary = core?.jobs.find(job => job.id === selectedId && !job.isTest);
  const selectedRecord = selectedSummary ? missionObject(selectedSummary) : null;
  const working = objects.filter(object => object.kind === "agent");
  const visible = objects.filter(object => (lens === "Overview" || lens === "Missions") && object.kind === "mission" || lens === "Overview" && object.kind === "agent");
  const lensResponse = !available ? "Operational state unavailable. Activity is not inferred." : lens === "Intelligence" ? "Available when sufficient operational history exists." : lens === "Workflows" ? "No execution-linked workflow records available." : lens === "Context" ? "No execution-linked context record available." : lens === "Agents" && !working.length ? "No active agent execution recorded." : null;
  const lensTrail = useRef<DiveLens[]>([]);
  const previousLens = useRef<DiveLens>('Overview');
  const goingBack = useRef(false);
  useEffect(() => { if (previousLens.current !== lens) { if (!goingBack.current) lensTrail.current.push(previousLens.current); goingBack.current = false; previousLens.current = lens; } }, [lens]);
  const navigate = (name: DiveLens) => { if(name==='Tools' && lens!=='Tools')setToolsDepartmentFilter(lens==='Departments'?selectedDepartment:null);if(name!=='Tools')setToolsDepartmentFilter(null);if(name==='Context' && lens!=='Context')setContextDepartmentFilter(lens==='Departments'?selectedDepartment:null);if(name!=='Context')setContextDepartmentFilter(null);if(name==='Workflows' && lens!=='Workflows')setWorkflowDepartmentFilter(lens==='Departments'?selectedDepartment:null);if(name!=='Workflows')setWorkflowDepartmentFilter(null);if(name==='Agents' && lens!=='Agents')setDepartmentFilter(lens==='Departments'?selectedDepartment:null);if(name!=='Agents')setDepartmentFilter(null);setLens(name); if(name==='Finance' || name==='Departments' || name==='Agents' || name==='Workflows' || name==='Context' || name==='Tools' || name==='Intelligence'){setSelectedId(null);setClosing(false);} setRequestedLens(name === "Overview" || name === "Missions" || name==='Finance' || name==='Departments' || name==='Agents' || name==='Workflows' || name==='Context' || name==='Tools' || name==='Intelligence' ? null : name); };
  const navigateRef = useRef(navigate);
  useEffect(() => { navigateRef.current = navigate; });
  /** Semantic addressing: commands name a lens id (see lib/diveLenses), never DOM text or a simulated click. */
  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<DiveOpenDetail | null>).detail;
      if (!detail) return;
      if ('back' in detail) { const previous = lensTrail.current.pop(); if (previous) { goingBack.current = true; navigateRef.current(previous); } return; }
      const target = lensById(detail.lensId);
      if (target) navigateRef.current(target.label as DiveLens);
    };
    window.addEventListener(DIVE_OPEN_EVENT, open);
    return () => window.removeEventListener(DIVE_OPEN_EVENT, open);
  }, []);
  // One persistent environment: Overview and Missions share the atmosphere and NORA (see diveDepthModel). Only the depth changes between them, and the
  // Missions layer lingers (inert, fading) while the Overview layer returns, so neither direction is a cut.
  const depth = sharedDepth(lens, Boolean(selectedId));
  const reducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // On a phone the lens rail scrolls horizontally: keep the active lens in view (no-op where the rail fits).
  const railRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const rail = railRef.current, active = rail?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (rail && active && rail.scrollWidth > rail.clientWidth) rail.scrollLeft = Math.max(0, active.offsetLeft - (rail.clientWidth - active.offsetWidth) / 2);
  }, [lens]);
  const missionLayer = useLensPresence(lens === "Missions", reducedMotion ? DIVE_TIMING.reducedLeave : DIVE_TIMING.leave);
  const scopeAddress = useDiveScopeAddress((lensByLabel(lens) ?? lensByLabel('Overview')!).id);
  return <DiveScopeProvider address={scopeAddress}><section className={styles.shell} aria-label="Dive Command Overview" data-dive-overview data-lens={lens} data-lens-id={scopeAddress.lensId}>
    <DiveInterior />
    {depth !== null && <OverviewRuntime depth={depth} core={core} snapshot={snapshot} agentsWorking={working.length} dismissalVersion={dismissalVersion} onLens={setLens} onMission={id => { setLens('Missions'); setSelectedId(id); setClosing(false); }} />}
    {lens !== 'Overview' && lens !== 'Missions' && <div className={styles.map} aria-label="Execution map">
      {lens !== 'Departments' && lens !== 'Agents' && lens !== 'Workflows' && lens !== 'Context' && lens !== 'Tools' && lens !== 'Intelligence' && (missions.length > 0 || working.length > 0) && <p className={styles.eyebrow}>EXECUTION MAP</p>}
      <div className={styles.systemField}>
        {visible.slice(0, 5).map((object, index) => <div key={object.id} className={index === 0 ? styles.anchor : styles.workObject} style={index ? { left: `${20 + (index - 1) * 20}%`, top: "78%" } : undefined}>
          <button className={styles.node} aria-pressed={!closing && selectedId === object.id} aria-label={`Inspect ${object.name}`} onClick={() => { if (dismissTimer.current) clearTimeout(dismissTimer.current); setClosing(false); setSelectedId(object.id); }}><span className={styles.nodeMark} aria-hidden /><span>{object.name}</span><small>{object.kind === "system" ? "Structural scope" : object.status}</small></button>
          {selected?.id === object.id && <DiveInspector key={object.id} object={selected} closing={closing} onClose={dismissInspection} />}
        </div>)}
      </div>
      {visible.length > 5 && <p className={styles.mapNote}>{visible.length - 5} additional running objects · overview condensed</p>}
    </div>}
    {missionLayer.mounted && <div className={styles.missionLayer} data-mission-layer data-leaving={missionLayer.leaving || undefined} inert={missionLayer.leaving ? true : undefined}>
      <MissionLens scopeActive={!missionLayer.leaving} jobs={core?.jobs ?? []} available={available} missions={missions} selectedRecord={selectedRecord} selectedId={selectedId} closing={closing} snapshot={snapshot} onSelect={id => { if (dismissTimer.current) clearTimeout(dismissTimer.current); setClosing(false); setSelectedId(id); }} onClose={dismissInspection} />
    </div>}
    {lens === 'Finance' && <FinanceLens dismissalVersion={dismissalVersion} closing={closing} onClose={dismissInspection} onInspect={()=>{if(dismissTimer.current)clearTimeout(dismissTimer.current);setClosing(false);}} onOpenIntelligence={()=>navigate('Intelligence')} />}
    {lens === 'Departments' && <DepartmentsLens dismissalVersion={dismissalVersion} closing={closing} onClose={dismissInspection} onInspect={()=>{if(dismissTimer.current)clearTimeout(dismissTimer.current);setClosing(false);}}/>}
    {lens === 'Agents' && <AgentsLens departmentFilter={departmentFilter} onClearFilter={()=>setDepartmentFilter(null)} dismissalVersion={dismissalVersion} closing={closing} onClose={dismissInspection} onInspect={()=>{if(dismissTimer.current)clearTimeout(dismissTimer.current);setClosing(false);}}/>}
    {lens === 'Workflows' && <WorkflowsLens departmentFilter={workflowDepartmentFilter} onClearFilter={()=>setWorkflowDepartmentFilter(null)} dismissalVersion={dismissalVersion} closing={closing} onClose={dismissInspection} onInspect={()=>{if(dismissTimer.current)clearTimeout(dismissTimer.current);setClosing(false);}}/>}
    {lens === 'Context' && <ContextLens departmentFilter={contextDepartmentFilter} onClearFilter={()=>setContextDepartmentFilter(null)} dismissalVersion={dismissalVersion} closing={closing} onClose={dismissInspection} onInspect={()=>{if(dismissTimer.current)clearTimeout(dismissTimer.current);setClosing(false);}}/>}
    {lens === 'Tools' && <ToolsLens departmentFilter={toolsDepartmentFilter} onClearFilter={()=>setToolsDepartmentFilter(null)} dismissalVersion={dismissalVersion} closing={closing} onClose={dismissInspection} onInspect={()=>{if(dismissTimer.current)clearTimeout(dismissTimer.current);setClosing(false);}}/>}
    {lens === 'Intelligence' && <IntelligenceLens core={core} available={available} dismissalVersion={dismissalVersion} closing={closing} onClose={dismissInspection} onInspect={()=>{if(dismissTimer.current)clearTimeout(dismissTimer.current);setClosing(false);}}/>}
    {lens !== 'Intelligence' && requestedLens === lens && lensResponse && <aside key={lens} className={styles.lensResponse} aria-label={`${lens} lens response`} data-dive-inspector><button className={styles.close} aria-label="Dismiss lens response" onClick={() => setRequestedLens(null)}>×</button><h2>{lens}</h2><p>{lensResponse}</p></aside>}
    <nav className={styles.lenses} ref={railRef} aria-label="Dive lenses">{DIVE_LENSES.map(name => <button key={name} aria-pressed={lens === name} data-semantic-id={lensByLabel(name)?.id} onClick={() => navigate(name)}><GrowForgeGlyph name={LENS_GLYPH[name]} size={15} strokeWidth={1.4} />{name}</button>)}</nav>
    {/* Not on the Mission Field (it repeats the composer there); shown with a selected mission, and when there is no recorded mission so one can still be created. */}
    {lens === "Missions" && available && (Boolean(selectedId) || !(core?.jobs ?? []).some(job => !job.isTest)) && <MissionControls jobs={core?.jobs ?? []} onSelect={id => { if (dismissTimer.current) clearTimeout(dismissTimer.current); setClosing(false); setSelectedId(id); window.dispatchEvent(new Event("growforge:missions-refresh")); }} />}
  </section></DiveScopeProvider>;
}
