import { DEPARTMENT_TAXONOMY, OVERSIGHT_TAXONOMY, type DepartmentTaxon } from '@/lib/departmentTaxonomy';
import type { SpatialGraphData } from '@/lib/spatial/obsidianReader';
import { presentEntity, safeEntitySource } from '@/lib/spatial/entityPresentation';
export function departmentRecords(graph:SpatialGraphData|null) {
  return [...DEPARTMENT_TAXONOMY,...OVERSIGHT_TAXONOMY].map((taxon:DepartmentTaxon)=>{
    const node=graph?.nodes.find(n=>n.departmentId===taxon.id && n.taxonomyKind===taxon.kind);
    const presentation=node && graph ? presentEntity(node,graph.nodes,graph.links):null;
    const categories:Record<string,string[]>={};
    if(presentation) {
      categories.Purpose=[presentation.summary];
      categories.Source=[`${node!.title} · source document`,safeEntitySource(node!.path)];
      const related=presentation.related;
      const agents=related.filter(r=>r.node.taxonomyKind==='specialist').map(r=>r.node.title);
      const tools=related.filter(r=>r.relation==='permission').map(r=>`${r.node.title} · permitted relationship`);
      const knowledge=related.filter(r=>['docs','vault'].includes(r.node.source)).map(r=>r.node.title);
      const dependencies=related.filter(r=>r.relation!=='permission' && r.node.taxonomyKind!=='specialist').map(r=>`${r.node.title} · ${r.relation==='taxonomy'?'organizational relationship':r.relation==='verification'?'review relationship':'structural relationship'}`);
      if(agents.length)categories.Agents=agents;
      if(tools.length)categories.Tools=tools;
      if(knowledge.length)categories.Knowledge=knowledge;
      if(dependencies.length)categories.Relationships=dependencies;
    }
    return {taxon,node,categories};
  });
}
export type DepartmentRecord=ReturnType<typeof departmentRecords>[number];
