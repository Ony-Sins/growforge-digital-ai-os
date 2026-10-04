import type { GraphNode, GraphLink } from './obsidianReader';
import { canonicalizeDepartmentText, departmentDisplayName } from '../departmentTaxonomy';

/** Assets already shipped with documented provenance in public/brands/sources.json. */
export function entityBrandAsset(title: string): string | null {
  const identities: [RegExp, string][] = [[/\bOllama\b/i,'ollama'],[/\bGemini\b/i,'gemini'],[/\bGroq\b/i,'groq'],[/\bOpenRouter\b/i,'openrouter'],[/\bGitHub\b/i,'github'],[/\bNotion\b/i,'notion'],[/\bVercel\b/i,'vercel'],[/\bHubSpot\b/i,'hubspot']];
  const name = identities.find(([pattern]) => pattern.test(title))?.[1];
  return name ? `/brands/${name}.svg` : null;
}

export function entityType(node: GraphNode): string {
  if (node.taxonomyKind === 'department') return 'Department';
  if (node.taxonomyKind === 'oversight') return 'Oversight';
  if (node.taxonomyKind === 'specialist' || node.source === 'specialists') return 'Specialist';
  if (node.taxonomyKind === 'branch' || node.source === 'capabilities') return 'Capability';
  return ({models:'AI Model',mcp:'Connector',docs:'Product & Architecture',vault:'Knowledge Record'} as Record<string,string>)[node.source] ?? 'System Record';
}

/** Public source view must never echo credentials embedded in metadata or URLs. */
export function safeEntitySource(value: string): string {
  return value.replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi,'$1[redacted]@')
    .replace(/([?&][^\s=&#`]+=)[^\s&#`]+/g,'$1[redacted]')
    .replace(/^.*(?:api[_ -]?key|access[_ -]?token|authorization|password|client[_ -]?secret)[*\s]*[=:].*$/gim,'[Credential value hidden]')
    .replace(/(--(?:token|password|api-key)\s+)\S+/gi,'$1[redacted]')
    .replace(/\bBearer\s+\S+/gi,'Bearer [redacted]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,})\b/g,'[redacted]');
}

function plain(value: string): string {
  return canonicalizeDepartmentText(safeEntitySource(value)).replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[*`#]/g,'').replace(/[\p{Extended_Pictographic}\uFE0F]/gu,'').replace(/\s+/g,' ').trim();
}

function field(text: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const match = text.match(new RegExp(`^\\*\\*${escaped}:\\*\\*\\s*(.+)$`,'mi'));
  return match ? plain(match[1]) : null;
}

function mandate(node: GraphNode): string {
  const text = (node.content ?? node.excerpt).replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*/,'');
  if (entityType(node) === 'Specialist') return plain(node.excerpt);
  const section = text.split(/^#{1,6}\s+/m).find(s => /^(?:ROLE & PURPOSE|PURPOSE|OVERVIEW)\s*\r?\n/i.test(s));
  const paragraph = section?.replace(/^[^\n]+\n/,'').split(/\r?\n\s*\r?\n/)[0];
  let result = plain(paragraph || node.excerpt);
  // Remove document framing and shorten the recorded mandate, without generating new claims.
  result = result.replace(new RegExp(`^${node.title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s+(?:owns|is responsible for)\\s+`,'i'),'Responsible for ');
  result = result.replace(/\s*\(.*?\)\s*/g,' ').replace(/\s+—\s+per Constitution.*$/i,'').trim();
  if (entityType(node)==='Department' && result.startsWith('Responsible for ')) {
    result=result.split(':')[0].replace(/GrowForge Digital's\s*/i,'').replace(/[.;]$/,'')+'.';
  }
  if (entityType(node)==='Oversight') result=result.replace(new RegExp(`^${node.title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s+is\\s+`,'i'),'Provides ');
  if (entityType(node)==='Capability' && node.taxonomyKind==='branch' && result.includes(':')) {
    result='Enables '+result.slice(result.indexOf(':')+1).trim();
  }
  result=result.replace(/GrowForge(?: Digital)?(?:'s|’s)/gi,'the workspace’s').replace(/\bGrowForge(?: Digital)?\b/gi,'the workspace').replace(/\s+([.,;])/g,'$1');
  const sentences = result.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim();
  return (sentences || result).length > 360 ? (sentences || result).slice(0,357).replace(/\s+\S*$/,'')+'…' : sentences || result;
}

export type EntityFact = {label:string; value:string};
/** Optional presentation inputs only: these never modify canonical facts or permissions.
 * Language/tone/depth are reserved for a supported formatter, not guessed translations. */
export type EntityPresentationContext = {
  workspaceDisplayName?: string; userDisplayName?: string; language?: string;
  explanationDepth?: 'concise'|'detailed'; preferredTone?: string;
  executionPreference?: 'free-local-first'|'balanced'|'performance-first';
  recommendationsEnabled?: boolean;
};
export function presentEntity(node: GraphNode, nodes: GraphNode[], links: GraphLink[], context:EntityPresentationContext = {}) {
  const type = entityType(node), text = safeEntitySource(node.content ?? node.excerpt);
  const facts: EntityFact[] = [], current: EntityFact[] = [];
  let summary = mandate(node);
  if (type === 'Connector') {
    summary = `${node.title} is a saved tool connection for ${context.workspaceDisplayName?.trim() || 'this workspace'}.`;
    const status = field(text,'Status');
    if (status) current.push({label:'Saved configuration',value:status.replace(/;.*$/,'').replace(/\s*\(connected\)/i,'')+' · live connection not checked'});
    const transport = field(text,'Transport');
    if (transport) facts.push({label:'Connection',value:transport === 'STDIO' ? 'Local process' : transport});
    const departments = field(text,'Allowed Departments');
    if (departments) facts.push({label:'Permitted scope',value:departments});
  } else if (type === 'AI Model') {
    const role = field(text,'Task Role'), provider = field(text,'Provider Type'), model = field(text,'Model ID');
    summary = `${node.title} is a saved ${provider ?? ''} model configuration${role ? ` for ${role.replace(/[_-]/g,' ')} tasks` : ''}.`.replace(/\s+/g,' ');
    current.push({label:'Configuration',value:'Configured · availability not checked here'});
    if (model) facts.push({label:'Model',value:model});
    if (provider) facts.push({label:'Provider',value:provider});
    const primary = field(text,'Primary Model');
    if (primary) facts.push({label:'Routing',value:primary.startsWith('Yes') ? 'Saved default dispatch' : 'Additional routing configuration'});
  } else if (type === 'Capability' && node.source === 'capabilities') {
    const role = field(text,'Role');
    if (role) summary = `${role}.`;
    const status = field(text,'Status');
    if (status) current.push({label:'Saved enablement',value:status+' · not a live availability check'});
  }
  if (node.departmentId && type !== 'Department' && type !== 'Oversight') facts.push({label:'Department',value:departmentDisplayName(node.departmentId)});
  if (node.sharedUseDepartments?.length) facts.push({label:'Related departments',value:node.sharedUseDepartments.map(departmentDisplayName).join(' / ')});
  const priority=(target:GraphNode,relation:string|null)=>target.id===node.parentId?100 : target.taxonomyKind==='department'||target.taxonomyKind==='oversight'?60 : relation==='taxonomy'?50 : relation==='assignment'||relation==='verification'?40 : relation==='permission'?20 : 0;
  const related = links.flatMap(link => {
    const id = link.source === node.id ? link.target : link.target === node.id ? link.source : null;
    const target = id ? nodes.find(n=>n.id === id) : null;
    return target ? [{node:target, relation:link.relation ?? null, scopes:link.permissionScopes ?? []}] : [];
  }).filter((item,index,array)=>array.findIndex(other=>other.node.id===item.node.id)===index)
    .sort((a,b)=>priority(b.node,b.relation)-priority(a.node,a.relation) || a.node.title.localeCompare(b.node.title));
  const permissions=related.filter(item=>item.relation==='permission');
  const assignments=related.filter(item=>item.relation==='assignment');
  const role = type==='Connector' && permissions.length
    ? `Access is permitted for ${permissions.length} related ${permissions.length===1?'entity':'entities'}. These permissions do not establish actual usage.`
    : type==='Specialist' && assignments.length
      ? `Has ${assignments.length} recorded ${assignments.length===1?'assignment':'assignments'} in the system topology. This describes a relationship, not execution authority or an active task.`
      : node.departmentId && type==='Capability'
        ? `Belongs to ${departmentDisplayName(node.departmentId)} as a recorded capability. This describes its purpose, not executable permission or implementation readiness.`
        : null;
  // No recommendation: the graph lacks executable, permission-checked action contracts.
  // An optional recommendation module must not be inferred from structural connections.
  return {type,summary,facts,current,related,role,source:text};
}
