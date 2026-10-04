/** Canonical identity taxonomy. Legacy runtime IDs, source filenames and saved grants
 * remain authoritative; classifying a tool does not grant permission to call it. */
export type CanonicalDepartmentId = "strategic_intelligence" | "brand_growth_marketing" | "revenue_partnerships" | "client_delivery_success" | "product_design_ux" | "web_platform_engineering" | "ai_systems_automation" | "operations_finance" | "executive_orchestration" | "quality_risk_governance";
export type LegacyRuntimeRouteId = "sales-bd" | "marketing" | "sales_bd" | "client-success" | "web-design" | "web-dev" | "ai-automation" | "finance-ops" | "hq" | "qa" | "meta-ads";
export interface TaxonomyBranch { name: string; children?: readonly string[] }
export interface DepartmentTaxon {
  id: CanonicalDepartmentId;
  runtimeRouteId: LegacyRuntimeRouteId;
  name: string;
  file: string;
  kind: "department" | "oversight";
  branches: readonly TaxonomyBranch[];
}
const branches = (...names: string[]): TaxonomyBranch[] => names.map((name) => ({ name }));

export const DEPARTMENT_TAXONOMY: readonly DepartmentTaxon[] = [
  { id: "strategic_intelligence", runtimeRouteId: "sales-bd", name: "Strategic Intelligence & Planning", file: "Strategy_Intelligence_Agent_System.md", kind: "department", branches: branches("Market Intelligence", "Competitive Intelligence", "Business Strategy", "Research & Evidence", "Strategic Planning") },
  { id: "brand_growth_marketing", runtimeRouteId: "marketing", name: "Brand & Growth Marketing", file: "Marketing_Agent_System.md", kind: "department", branches: [...branches("Brand Strategy", "Content & Organic Growth", "Demand Generation"), { name: "Paid Media & Performance", children: ["Meta Ads", "Google Ads"] }, ...branches("Conversion & Lifecycle")] },
  { id: "revenue_partnerships", runtimeRouteId: "sales_bd", name: "Revenue & Partnerships", file: "Sales_BD_Agent_System.md", kind: "department", branches: branches("Prospecting & Intelligence", "Outbound", "Sales Pipeline", "Partnerships") },
  { id: "client_delivery_success", runtimeRouteId: "client-success", name: "Client Delivery & Success", file: "Client_Success_PM_Agent_System.md", kind: "department", branches: branches("Client Success", "Project Delivery", "Client Communication") },
  { id: "product_design_ux", runtimeRouteId: "web-design", name: "Product Design & UX", file: "Web_Design_UX_Agent_System.md", kind: "department", branches: branches("Product & UX Strategy", "Interface Design", "Experience Polish") },
  { id: "web_platform_engineering", runtimeRouteId: "web-dev", name: "Web & Platform Engineering", file: "Web_Development_Agent_System.md", kind: "department", branches: branches("Frontend Engineering", "Backend & APIs", "Platform / Deployment") },
  { id: "ai_systems_automation", runtimeRouteId: "ai-automation", name: "AI Systems & Automation", file: "AI_Systems_Automation_Agent_System.md", kind: "department", branches: branches("Agent Architecture", "Automation Engineering", "Model & Provider Systems", "Knowledge & Memory Systems") },
  { id: "operations_finance", runtimeRouteId: "finance-ops", name: "Operations & Finance", file: "Finance_Operations_Agent_System.md", kind: "department", branches: branches("Financial Operations", "Business Operations", "Commercial Administration") },
];
export const OVERSIGHT_TAXONOMY: readonly DepartmentTaxon[] = [
  { id: "executive_orchestration", runtimeRouteId: "hq", name: "Executive Orchestration", file: "GrowForge_HQ_Agent_System.md", kind: "oversight", branches: branches("mission decomposition", "routing", "dependency planning", "model/tool selection", "approvals/escalation", "result reconciliation") },
  { id: "quality_risk_governance", runtimeRouteId: "qa", name: "Quality, Risk & Governance", file: "Quality_Assurance_Agent_System.md", kind: "oversight", branches: branches("factual verification", "evidence checking", "QA", "policy/constitution compliance", "contradiction detection", "regression checks", "risk escalation", "approval gate") },
];
const allTaxa = [...DEPARTMENT_TAXONOMY, ...OVERSIGHT_TAXONOMY];
export const departmentGraphId = (file: string) => `agent:${file.replace(/\.md$/, "").toLowerCase()}`;
/** Identity, compatibility routing and human aliases have separate resolvers. */
export const LEGACY_RUNTIME_ROUTES: Readonly<Record<string, CanonicalDepartmentId>> = Object.freeze(Object.fromEntries([
  ...allTaxa.map(taxon => [taxon.runtimeRouteId, taxon.id]),
  ["meta-ads", "brand_growth_marketing"],
]));
export function canonicalDepartmentId(value: string): string {
  return allTaxa.some(taxon => taxon.id === value) ? value : (Object.hasOwn(LEGACY_RUNTIME_ROUTES, value) ? LEGACY_RUNTIME_ROUTES[value] : value);
}
export function resolveLegacyRuntimeRoute(routeId: string): string | undefined {
  return Object.hasOwn(LEGACY_RUNTIME_ROUTES, routeId) ? LEGACY_RUNTIME_ROUTES[routeId] : undefined;
}
export function resolveRuntimeRoute(identityOrRoute: string): LegacyRuntimeRouteId | undefined {
  if (Object.hasOwn(LEGACY_RUNTIME_ROUTES, identityOrRoute)) return identityOrRoute as LegacyRuntimeRouteId;
  return allTaxa.find(taxon => taxon.id === identityOrRoute)?.runtimeRouteId;
}
export function departmentTaxon(id: string): DepartmentTaxon | undefined {
  return allTaxa.find(taxon => taxon.id === canonicalDepartmentId(id));
}
export function departmentDisplayName(id: string): string {
  return departmentTaxon(id)?.name ?? id;
}
export function departmentScopeLabel(id: string): string {
  return id === "meta-ads" ? `${departmentDisplayName(id)} / Demand Generation (legacy route)` : departmentDisplayName(id);
}
export interface SourceClassification {
  departmentId: string;
  title: string;
  kind: "department" | "oversight" | "branch";
  parentId?: string;
  taxonomyPath: string[];
  branches?: readonly TaxonomyBranch[];
}
export function classifyDepartmentSource(file: string): SourceClassification | undefined {
  const taxon = allTaxa.find((item) => item.file === file);
  if (taxon) return { departmentId: taxon.id, title: taxon.name, kind: taxon.kind, taxonomyPath: [taxon.name], branches: taxon.branches };
  const brand = departmentTaxon("marketing")!;
  const parentId = departmentGraphId(brand.file);
  if (file === "Growth_Demand_Agent_System.md") return { departmentId: brand.id, title: "Demand Generation", kind: "branch", parentId, taxonomyPath: [brand.name, "Demand Generation"] };
  if (file === "Meta_Ads_Agent_System.md") return { departmentId: brand.id, title: "Meta Ads", kind: "branch", parentId, taxonomyPath: [brand.name, "Paid Media & Performance", "Meta Ads"] };
  return undefined;
}
export interface SpecialistAssignment {
  departmentId: string;
  branch?: string;
  relatedBranches?: readonly string[];
  verifiesDepartmentId?: string;
}
export const SPECIALIST_ASSIGNMENTS: Readonly<Record<string, SpecialistAssignment>> = {
  "agents-orchestrator": { departmentId: "executive_orchestration" },
  "frontend-developer": { departmentId: "web_platform_engineering", branch: "Frontend Engineering" },
  "whimsy-injector": { departmentId: "product_design_ux", branch: "Experience Polish" },
  "ui-finish-gate-reviewer": { departmentId: "product_design_ux", verifiesDepartmentId: "quality_risk_governance" },
  "outbound-strategist": { departmentId: "revenue_partnerships", branch: "Outbound" },
  "offer-and-lead-gen-strategist": { departmentId: "revenue_partnerships", branch: "Prospecting & Pipeline", relatedBranches: ["Prospecting & Intelligence", "Sales Pipeline"] },
  "reality-checker": { departmentId: "quality_risk_governance" },
};
/** Approved shared use cases, not installed tools or access grants. */
export const SHARED_TOOL_DEPARTMENTS: Readonly<Record<string, readonly string[]>> = {
  hubspot: ["revenue_partnerships", "client_delivery_success", "operations_finance"], apollo: ["revenue_partnerships"],
  "meta-ads": ["brand_growth_marketing"], "google-ads": ["brand_growth_marketing"],
  figma: ["product_design_ux"], higgsfield: ["product_design_ux"], comfyui: ["product_design_ux"],
  github: ["web_platform_engineering"], vercel: ["web_platform_engineering"], cloudflare: ["web_platform_engineering"],
  n8n: ["ai_systems_automation"], mcp: ["ai_systems_automation"], omniroute: ["ai_systems_automation"],
  gemini: ["ai_systems_automation"], groq: ["ai_systems_automation"], openrouter: ["ai_systems_automation"], ollama: ["ai_systems_automation"], searxng: ["ai_systems_automation"],
  notion: DEPARTMENT_TAXONOMY.map((taxon) => taxon.id),
};
export const PERMISSION_DEPARTMENT_IDS = new Set([...allTaxa.map(taxon => taxon.runtimeRouteId), "meta-ads", ...allTaxa.map(taxon => taxon.id)]);
export function validateDepartmentPermissions(ids: readonly string[]): string[] {
  const unknown = ids.filter((id) => !PERMISSION_DEPARTMENT_IDS.has(id));
  if (unknown.length) throw new Error(`Unknown department permission IDs: ${unknown.join(", ")}`);
  return [...new Set(ids)];
}
export function departmentHasPermission(allowed: readonly string[], departmentId?: string): boolean {
  // No identity means only globally shared servers; never bypass a restriction.
  if (allowed.length === 0) return true;
  const route = departmentId === undefined ? undefined : resolveRuntimeRoute(departmentId);
  return route !== undefined && allowed.some(scope => resolveRuntimeRoute(scope) === route);
  // meta-ads remains its own authorization scope; parent ownership never aliases it.
}


/** Human/source aliases, separate from persisted runtime IDs and access grants.
 * The runtime ID sales-bd is Strategy; the human Sales/BD alias is Revenue.
 * meta-ads is a retained Demand Generation execution route, not the Meta Ads source file. */
export const LEGACY_DEPARTMENT_ALIASES: Readonly<Record<string, string>> = {
  "Sales & BD": "revenue_partnerships",
  "Finance & Ops": "operations_finance",
  "Client Success / PM": "client_delivery_success",
  "Client Success / Project Management": "client_delivery_success",
  "Web Design / UX": "product_design_ux",
  "AI Systems / Automation": "ai_systems_automation",
  "Strategy Intelligence Department": "strategic_intelligence",
  "Strategy & Intelligence Department": "strategic_intelligence",
  "Strategy & Intelligence": "strategic_intelligence",
  "Strategy Intelligence": "strategic_intelligence",
  "Marketing Department": "brand_growth_marketing",
  "Marketing & Brand Strategy": "brand_growth_marketing",
  "Growth Demand Department": "brand_growth_marketing",
  "Growth & Demand Department": "brand_growth_marketing",
  "Growth & Demand": "brand_growth_marketing",
  "Growth Demand": "brand_growth_marketing",
  "Meta Ads Department": "brand_growth_marketing",
  "Sales BD Department": "revenue_partnerships",
  "Sales & Business Development": "revenue_partnerships",
  "Sales/BD": "revenue_partnerships",
  "Sales BD": "revenue_partnerships",
  "Client Success PM Department": "client_delivery_success",
  "Client Success & Program Management": "client_delivery_success",
  "Client Success/PM": "client_delivery_success",
  "Client Success PM": "client_delivery_success",
  "Web Design UX Department": "product_design_ux",
  "Product Architecture & UX": "product_design_ux",
  "Web Design/UX": "product_design_ux",
  "Web Design UX": "product_design_ux",
  "Web Development Department": "web_platform_engineering",
  "Web Development & Engineering": "web_platform_engineering",
  "AI Systems Automation Department": "ai_systems_automation",
  "AI Systems & Intelligent Automation": "ai_systems_automation",
  "AI Systems/Automation": "ai_systems_automation",
  "Finance Operations Department": "operations_finance",
  "Finance & Operations": "operations_finance",
  "Finance Operations": "operations_finance",
  "GrowForge HQ Department": "executive_orchestration",
  "GrowForge HQ": "executive_orchestration",
  "HQ Department": "executive_orchestration",
  "Quality Assurance Department": "quality_risk_governance",
  "Quality Assurance": "quality_risk_governance",
  "QA Department": "quality_risk_governance"
};
export function resolveHumanDepartmentAlias(value: string): string | undefined {
  const normalized = value.trim().toLowerCase();
  return allTaxa.find(taxon => taxon.name.toLowerCase() === normalized)?.id
    ?? Object.entries(LEGACY_DEPARTMENT_ALIASES).find(([alias]) => alias.toLowerCase() === normalized)?.[1];
}
/** Search/input compatibility helper; exact identity/route namespace wins first. */
export function resolveDepartmentAlias(value: string): string | undefined {
  if (allTaxa.some(taxon => taxon.id === value)) return value;
  return resolveLegacyRuntimeRoute(value) ?? resolveHumanDepartmentAlias(value);
}
const escapeAlias = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const visibleAliasPattern = new RegExp("\\b(?:" + Object.keys(LEGACY_DEPARTMENT_ALIASES).sort((a,b) => b.length-a.length).map(escapeAlias).join("|") + ")\\b", "gi");
/** Projection for current UI/prompt text. Never write it back to historical job records. */
export function canonicalizeDepartmentText(text: string): string {
  return text.replace(visibleAliasPattern, alias => departmentDisplayName(resolveDepartmentAlias(alias)!));
}
/** Search aliases are accepted without displaying them as current entity names. */
export function departmentMatchesQuery(id: string | undefined, query: string): boolean {
  return Boolean(id && resolveDepartmentAlias(query) === canonicalDepartmentId(id));
}
export function taxonomyPrompt(): string {
  return [...DEPARTMENT_TAXONOMY, ...OVERSIGHT_TAXONOMY].map(taxon =>
    `- id: ${taxon.id}; name: ${taxon.name}; kind: ${taxon.kind}; branches: ${taxon.branches.map(branch => branch.name).join(", ")}`
  ).join("\n") + "\nDemand Generation and Paid Media & Performance / Meta Ads are Brand & Growth Marketing branches, never peer departments. Names describe organizational scope, not installed or operational capabilities. Route by listed IDs; approval rules still apply.";
}

/** Vendor category IDs mapped to owned department policy; no vendor source edits. */
export const BLUEPRINT_CATEGORY_DEPARTMENTS: Readonly<Record<string, readonly string[]>> = {
 business: ["strategic_intelligence"], research: ["strategic_intelligence"], product: ["strategic_intelligence"],
 marketing: ["brand_growth_marketing"], paid: ["brand_growth_marketing"], sales: ["revenue_partnerships"],
 finance: ["operations_finance"], accounts: ["operations_finance"], chief: ["operations_finance"], operations: ["operations_finance"], supply: ["operations_finance"],
 project: ["client_delivery_success"], customer: ["client_delivery_success"], hr: ["client_delivery_success"], report: ["client_delivery_success"], support: ["client_delivery_success"],
 design: ["product_design_ux"], technical: ["product_design_ux"], engineering: ["web_platform_engineering"], security: ["web_platform_engineering", "quality_risk_governance"], testing: ["web_platform_engineering", "quality_risk_governance"],
 automation: ["ai_systems_automation"], agentic: ["ai_systems_automation"], agents: ["ai_systems_automation"], data: ["ai_systems_automation"], identity: ["ai_systems_automation"], zk: ["ai_systems_automation"], specialized: ["ai_systems_automation"]
};
export function blueprintPolicy(categoryId: string) {
 return { departmentIds: BLUEPRINT_CATEGORY_DEPARTMENTS[categoryId] ?? [], capabilityState: "catalog-only" as const, mappingState: BLUEPRINT_CATEGORY_DEPARTMENTS[categoryId] ? "mapped" as const : "unmapped" as const };
}
/** Generic role labels are presentation only; these keys preserve historical steps. */
export function departmentStepLabel(step: { kind?: string; departmentId?: string; runtimeRouteId?: string; label: string }): string {
 if (step.runtimeRouteId === "meta-ads") return departmentScopeLabel("meta-ads");
 if (step.departmentId) return departmentScopeLabel(step.departmentId);
 if (step.kind === "plan" || step.kind === "reconcile" || step.kind === "final") return departmentDisplayName("hq");
 if (step.kind === "qa") return departmentDisplayName("qa");
 return canonicalizeDepartmentText(step.label);
}

/** Manifest entries are references, not evidence of installed or operational skills.
 * Only the physically present repository skill has an owned scope mapping. */
export function skillPolicy(skillId: string) {
 return { departmentIds: skillId === "impeccable" ? ["product_design_ux", "web_platform_engineering"] : [], mappingState: skillId === "impeccable" ? "mapped" : "unmapped", capabilityState: "reference-only" };
}

/** Branch aliases preserve source meaning independently of legacy runtime route IDs. */
export const LEGACY_BRANCH_ALIASES: Readonly<Record<string, { departmentId: string; branchId: string }>> = {
 "Growth Demand Department": { departmentId: "brand_growth_marketing", branchId: "brand_growth_marketing/demand-generation" },
 "Growth & Demand": { departmentId: "brand_growth_marketing", branchId: "brand_growth_marketing/demand-generation" },
 "Meta Ads Department": { departmentId: "brand_growth_marketing", branchId: "brand_growth_marketing/paid-media/meta-ads" }
};
/** Existing source-only helpers are classified but are not added to the operational roster. */
export const REFERENCE_AGENT_ASSIGNMENTS: Readonly<Record<string, SpecialistAssignment>> = {
 "impeccable-asset-producer": { departmentId: "product_design_ux" },
 "impeccable-documenter": { departmentId: "product_design_ux" },
 "impeccable-finish-reviewer": { departmentId: "product_design_ux", verifiesDepartmentId: "quality_risk_governance" },
 "impeccable-manual-edit-applier": { departmentId: "web_platform_engineering" }
};
