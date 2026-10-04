import type { Agent } from '@/lib/agents';
import type { SpatialGraphData } from '@/lib/spatial/obsidianReader';
import { departmentTaxon, departmentDisplayName, SPECIALIST_ASSIGNMENTS } from '@/lib/departmentTaxonomy';
import { safeEntitySource } from '@/lib/spatial/entityPresentation';

export type AgentRelationship = { sourceId: string; targetId: string; type: string; evidence: 'structural'; label: string };
export type AgentRecord = {
  id: string; name: string; kind: 'specialist' | 'orchestration'; departmentId?: string;
  running: boolean; categories: Record<string, string[]>; provenance: string[]; relationships: AgentRelationship[];
};

/** Registered definitions and their recorded run status. No blueprint becomes an instance. */
export function agentRecords(roster: Agent[], graph: SpatialGraphData | null): AgentRecord[] {
  return roster.filter(agent=>Boolean(agent.id)).map(agent=>{
    const assignment = SPECIALIST_ASSIGNMENTS[agent.id] ?? agent.assignment;
    const departmentId = assignment && departmentTaxon(assignment.departmentId)?.id;
    const node = graph?.nodes.find(node=>node.id===`specialist:${agent.id}`);
    const relationships: AgentRelationship[] = [];
    if(departmentId) relationships.push({sourceId:agent.id,targetId:departmentId,type:'department-association',evidence:'structural',label:`${departmentDisplayName(departmentId)} · recorded association`});
    if(assignment?.verifiesDepartmentId && departmentTaxon(assignment.verifiesDepartmentId)) relationships.push({sourceId:agent.id,targetId:assignment.verifiesDepartmentId,type:'verification',evidence:'structural',label:`${departmentDisplayName(assignment.verifiesDepartmentId)} · review relationship`});
    for(const link of graph?.links ?? []) {
      if(!node || link.source!==node.id && link.target!==node.id)continue;
      const targetId=link.source===node.id?link.target:link.source;
      const target=graph?.nodes.find(node=>node.id===targetId);
      if(!target || target.departmentId===departmentId)continue;
      relationships.push({sourceId:agent.id,targetId:target.departmentId??target.id,type:link.relation??link.type,evidence:'structural',label:`${target.title} · ${link.relation??link.type} relationship`});
    }
    const categories:Record<string,string[]>={Purpose:[agent.description]};
    if(departmentId)categories.Department=[departmentDisplayName(departmentId),...(assignment?.branch?[assignment.branch]:[])];
    const declaredTools=relationships.filter(link=>link.type==='permission').map(link=>link.label);
    if(declaredTools.length)categories.Tools=declaredTools;
    if(relationships.length)categories.Relationships=relationships.map(link=>link.label);
    if(agent.status==='active')categories['Recorded run']=['Running · recorded agent-store status.','The individual dispatch performs a text-model task; this record does not establish a mission assignment or external action authority.'];
    if(agent.status==='success' || agent.status==='error')categories['Last recorded result']=[agent.status==='success'?'Completed':'Error',`Last-run label: ${agent.lastRun}`];
    return {id:agent.id,name:agent.name,kind:agent.id==='agents-orchestrator'?'orchestration':'specialist',departmentId,running:agent.status==='active',categories,relationships,provenance:['Registered agent definition and agent-store snapshot.',...(node?[safeEntitySource(node.path)]:[])]};
  });
}

export function filteredAgents(records: AgentRecord[], departmentId: string | null) {
  return departmentId ? records.filter(record=>record.relationships.some(link=>link.targetId===departmentId && ['department-association','verification'].includes(link.type))) : records;
}
