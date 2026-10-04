import type { SpatialGraphData } from '@/lib/spatial/obsidianReader';
import { DEPARTMENT_TAXONOMY, departmentDisplayName } from '@/lib/departmentTaxonomy';

export type ProcedureStep = { id:string; name:string; purpose:string; dependsOn:string[]; sourceId:string; dynamic?:boolean };
export type ProcedureRelationship = { id:string; sourceId:string; targetId:string; type:'conditional-department-use'|'oversight'|'dependency'; evidence:'structure'; stepId?:string };
export type WorkflowRecord = { id:string; name:string; type:'internal-pipeline'; sourceId:string; purpose:string; inputs:string[]; outputs:string[]; steps:ProcedureStep[]; relationships:ProcedureRelationship[]; categories:Record<string,string[]>; provenance:string[] };
export const PIPELINE_ID='procedure:orchestrator:resumePipeline';

/** Frontend projection of the existing runner, not a new runtime workflow registry.
 * Source contract is checked by test-dive-workflows. Never derive definitions from jobs.
 * Empty/isolated graph reads have no owner-record fallback. */
export function workflowRecords(graph:SpatialGraphData|null):WorkflowRecord[] {
  if(!graph?.nodes.some(node=>node.source==='agents' && node.departmentId))return [];
  const sourceId='src/lib/orchestrator.ts#resumePipeline';
  const raw = [
    ['brief','Brief','A confirmed client brief supplies the input.',[]],
    ['plan','Plan','Executive Orchestration decomposes the brief and chooses relevant departments.',['brief']],
    ['research','Research','Research questions produce a recorded dossier.',['plan']],
    ['departments','Department execution','The plan creates independent department steps after research; their number and department assignments are resolved per mission.',['research']],
    ['reconcile','Reconcile','Team review consumes every assigned department draft.',['departments']],
    ['qa','QA','Quality, Risk & Governance reviews the drafts, research and reconciliation.',['reconcile']],
    ['final','Final delivery','Executive Orchestration synthesizes the final plan and collects recorded media.',['qa']],
  ] as const;
  const steps:ProcedureStep[]=raw.map(([id,name,purpose,dependencies])=>({id:`${PIPELINE_ID}:${id}`,name,purpose,dependsOn:dependencies.map(dependency=>`${PIPELINE_ID}:${dependency}`),sourceId,dynamic:id==='departments'}));
  const relationships:ProcedureRelationship[]=[
    ...DEPARTMENT_TAXONOMY.map(department=>({id:`${PIPELINE_ID}:uses:${department.id}`,sourceId:PIPELINE_ID,targetId:department.id,type:'conditional-department-use' as const,evidence:'structure' as const,stepId:`${PIPELINE_ID}:departments`})),
    ...['executive_orchestration','quality_risk_governance'].map(id=>({id:`${PIPELINE_ID}:oversight:${id}`,sourceId:PIPELINE_ID,targetId:id,type:'oversight' as const,evidence:'structure' as const})),
    ...steps.flatMap(step=>step.dependsOn.map(dependency=>({id:`${dependency}->${step.id}`,sourceId:dependency,targetId:step.id,type:'dependency' as const,evidence:'structure' as const,stepId:step.id}))),
  ];
  const purpose='Turn a confirmed brief into researched department drafts, a reconciled review, QA and a final deliverable.';
  return [{id:PIPELINE_ID,name:'Brief to delivery',type:'internal-pipeline',sourceId,purpose,inputs:['Confirmed client brief'],outputs:['Final plan','Recorded media when produced'],steps,relationships,
    categories:{Purpose:[purpose,'Reusable internal pipeline · not a running mission.'],Inputs:['Confirmed client brief'],Outputs:['Final plan','Recorded media when produced'],Departments:[...DEPARTMENT_TAXONOMY.map(t=>`${departmentDisplayName(t.id)} · conditional use, chosen by the plan`),`${departmentDisplayName('executive_orchestration')} · planning and synthesis`,`${departmentDisplayName('quality_risk_governance')} · QA review`],Models:['Model resolved at runtime by the existing routing policy.'],Gates:['Consequential tool actions require owner approval.','Blueprint context in the confirmation band requires approval.','QA is a review stage, not a separate manual approval action.','Final plan approval is recorded after delivery; it does not pause this pipeline.'],Relationships:['Research precedes independently assigned department steps.','Reconciliation waits for every assigned draft.','QA precedes final delivery.']},
    provenance:['Code-backed frontend procedure projection; no separate persisted workflow-definition record.',sourceId,'src/lib/orchestrator.ts#createAndStartJob','src/lib/orchestrator.ts#runPlanStage','src/app/api/jobs/[id]/approve/route.ts','src/lib/durableJobEngine.ts#dispatchDurableJob','Department execution is a variable parallel group, not one persisted job step. Mission runs, timestamps, outputs and usage remain in Missions.']}];
}
export function filteredWorkflows(records:WorkflowRecord[],departmentId:string|null) {
  return departmentId?records.filter(record=>record.relationships.some(link=>link.targetId===departmentId && link.type!=='dependency')):records;
}
export function workflowScope(record:WorkflowRecord,step:ProcedureStep|null) {
  return {id:record.id,title:record.name,kind:record.type,context:JSON.stringify({purpose:record.purpose,inputs:record.inputs,outputs:record.outputs,relationships:record.relationships.filter(link=>link.type!=='dependency').map(({targetId,type})=>({targetId,type})),selectedStep:step?{id:step.id,purpose:step.purpose,dependsOn:step.dependsOn}:null})};
}
