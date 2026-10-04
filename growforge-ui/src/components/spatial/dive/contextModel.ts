import type { SpatialGraphData } from '@/lib/spatial/obsidianReader';
import type { UserMemory } from '@/lib/userMemory';
import { canonicalizeDepartmentText, departmentDisplayName } from '@/lib/departmentTaxonomy';

export type ContextDomain = 'Memory' | 'Sources';
export type ContextRecord = {
  id: string; title: string; domain: ContextDomain; kind: string; content: string;
  scope: string; departmentId: string | null; sourceId: string; provenance: string[];
  modified?: string; relationships: { id:string; targetId:string; title:string; type:string }[];
};
const validDate = (value?: string) => value && Number.isFinite(Date.parse(value)) ? value : undefined;

/** Field projections are stable within the current authenticated user, not invented database entries. */
export function memoryRecords(memory: UserMemory | null): ContextRecord[] {
  if (!memory) return [];
  const result: ContextRecord[] = [];
  const add = (field: string, title: string, content: string, kind = 'Profile memory field') => {
    if (!content.trim()) return;
    result.push({id:`memory:current-user:${field}`,title,domain:'Memory',kind,content,
      scope:'Current user · expertise context structure',departmentId:null,sourceId:`/api/profile/memory#${field}`,
      relationships:[],provenance:[
        `Current user's memory response · ${field}. Read-only in this lens; the existing profile supports editing.`,
        'Field projection, not an independently identified fact. Stored values may include seeded defaults; entry origin and approval are not recorded.',
        'Revision-derived observations/rejections are supported by the memory engine, but individual entries have no provenance, status or timestamps.',
        'This view does not establish that the field is currently loaded into a model. Profile-level dates are not per-field modification dates.',
      ]});
  };
  const p=memory.profile;
  if(p) add('profile','Identity & organization',[p.fullName,p.designation,p.companyName,p.about].filter(v=>typeof v==='string'&&v.trim()).join('\n'));
  add('writingStyle','Writing style',memory.writingStyle ?? '');
  add('brandRules','Brand rules',(memory.brandRules ?? []).join('\n\n'));
  add('preferences','Preferences',Object.entries(memory.preferences ?? {}).filter(([,v])=>v.trim()).map(([key,value])=>`${key.replace(/_/g,' ')}: ${value}`).join('\n\n'));
  add('pastOverrides','Past overrides',(memory.pastOverrides ?? []).join('\n\n'));
  add('explicitRejections','Recorded constraints',(memory.explicitRejections ?? []).join('\n\n'));
  add('learnedObservations','Recorded observations',(memory.learnedObservations ?? []).join('\n\n'));
  return result;
}

/** Deliberately excludes developer handoff/design/roadmap, catalogs, tools and model records. */
export function sourceRecords(graph: SpatialGraphData | null): ContextRecord[] {
  if(!graph) return [];
  const nodes=graph.nodes.filter(node=>
    (node.source==='agents' && !!node.departmentId && ['department','oversight','branch'].includes(node.taxonomyKind ?? '')) ||
    (node.source==='docs' && node.id==='doc:growforge-digital---company-constitution'));
  return nodes.map(node=>({id:node.id,title:node.taxonomyKind==='branch' ? `${departmentDisplayName(node.departmentId!)} / ${canonicalizeDepartmentText(node.title)}` : canonicalizeDepartmentText(node.title),domain:'Sources',
    kind:node.source==='agents'?(node.taxonomyKind==='branch'?'Branch instruction source':'Department instruction source'):'Organization source document',
    content:canonicalizeDepartmentText(node.content ?? node.excerpt),
    scope:node.departmentId?'Recorded department / oversight scope':'Organization document · not a separate workspace record',
    departmentId:node.departmentId ?? null,sourceId:node.id,modified:validDate(node.lastModified),
    provenance:[`Protected graph record: ${node.id}.`,
      node.path.split(/[\\/]/).pop() ?? node.title,
      'Source material · approval status not represented. Not extracted knowledge or an approved Decision record; source existence does not establish approval.',
      'Modified is the source file timestamp, not a freshness or verification rating. Stored does not mean currently loaded.'],
    relationships:graph.links.filter(link=>link.source===node.id||link.target===node.id).flatMap(link=>{
      const targetId=link.source===node.id?link.target:link.source;
      const target=nodes.find(item=>item.id===targetId);
      return target?[{id:`context-link:${link.source}:${link.type}:${link.relation ?? ''}:${link.target}`,targetId,title:canonicalizeDepartmentText(target.title),type:link.relation ?? link.type}]:[];
    })}));
}
export function filterContext(records:ContextRecord[],departmentId:string|null) {
  return departmentId?records.filter(record=>record.departmentId===departmentId):records;
}
export function contextScope(record:ContextRecord) {
  return {id:record.id,title:record.title,kind:record.kind,context:JSON.stringify({
    recordId:record.id,type:record.domain,scope:record.scope,sourceId:record.sourceId,
    content:record.content.slice(0,1200),relationships:record.relationships.slice(0,4).map(link=>({targetId:link.targetId,type:link.type})),
    interpretation:'Selected record only. Source is not knowledge; stored is not currently loaded; origin and approval are not inferred.',
  }).slice(0,2000)};
}
