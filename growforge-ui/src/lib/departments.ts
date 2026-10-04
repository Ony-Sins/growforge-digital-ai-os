import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { departmentDisplayName, DEPARTMENT_TAXONOMY, taxonomyPrompt, resolveRuntimeRoute } from "@/lib/departmentTaxonomy";

/**
 * GrowForge's real departments, backed by the *_Agent_System.md operating
 * instructions at the repo root. Each file becomes that department agent's
 * system prompt during an orchestration job, so editing a department's .md
 * changes how it behaves — no code change needed.
 *
 * `summary` is what HQ sees when deciding which departments a brief needs;
 * keep it short and about scope, not tone.
 */

export interface Department {
  id: string;
  runtimeRouteId?: string;
  name: string;
  file: string;
  summary: string;
}

const RUNTIME_DEPARTMENTS: Department[] = [
  {
    id: "sales-bd",
    name: departmentDisplayName("sales-bd"),
    file: "Strategy_Intelligence_Agent_System.md",
    summary: "Market research, competitive analysis, keyword research, trend forecasting, ICP research.",
  },
  {
    id: "marketing",
    name: departmentDisplayName("marketing"),
    file: "Marketing_Agent_System.md",
    summary: "Positioning, target audience, messaging, channel strategy, SEO/content, brand, demand generation.",
  },
  {
    id: "meta-ads",
    name: departmentDisplayName("meta-ads"),
    file: "Growth_Demand_Agent_System.md",
    summary: "Lead generation, social media marketing, demand generation, campaign strategy, paid media, CPA/CPL optimization.",
  },
  {
    id: "finance-ops",
    name: departmentDisplayName("finance-ops"),
    file: "Finance_Operations_Agent_System.md",
    summary: "Pricing, budgets, unit economics, revenue projections, costs, cash flow, operating processes.",
  },
  {
    id: "client-success",
    name: departmentDisplayName("client-success"),
    file: "Client_Success_PM_Agent_System.md",
    summary: "Requirements, project sequencing, milestones, timelines, risk tracking, delivery coordination.",
  },
  {
    id: "web-design",
    name: departmentDisplayName("web-design"),
    file: "Web_Design_UX_Agent_System.md",
    summary: "Website/landing page structure, UX, conversion optimization, visual direction.",
  },
  {
    id: "web-dev",
    name: departmentDisplayName("web-dev"),
    file: "Web_Development_Agent_System.md",
    summary: "Website build, technical SEO, tracking/analytics setup, integrations, hosting.",
  },
  {
    id: "ai-automation",
    name: departmentDisplayName("ai-automation"),
    file: "AI_Systems_Automation_Agent_System.md",
    summary: "Automations, CRM workflows, AI tools, lead follow-up systems, integrations.",
  },
];

// Compatibility registry: all old IDs retain their exact instruction file.
// Revenue is an additive route for an already-existing source, not a renamed ID.
export const ALL_RUNTIME_DEPARTMENTS: Department[] = [...RUNTIME_DEPARTMENTS, {
  id: "sales_bd", name: departmentDisplayName("sales_bd"), file: "Sales_BD_Agent_System.md",
  summary: "Prospecting, qualification, outbound, sales pipeline, proposals, commercial partnerships and won-client handoffs.",
}].map((dept) => ({ ...dept, name: departmentDisplayName(dept.id) }));
export const DEPARTMENTS: Department[] = DEPARTMENT_TAXONOMY.map((taxon) => ({ ...ALL_RUNTIME_DEPARTMENTS.find((dept) => dept.id === taxon.runtimeRouteId)!, id: taxon.id, runtimeRouteId: taxon.runtimeRouteId }));
export const CANONICAL_DEPARTMENTS = DEPARTMENTS;
export const HQ = { id: "executive_orchestration", runtimeRouteId: "hq", name: departmentDisplayName("hq"), file: "GrowForge_HQ_Agent_System.md" };
export const QA = { id: "quality_risk_governance", runtimeRouteId: "qa", name: departmentDisplayName("qa"), file: "Quality_Assurance_Agent_System.md" };
const CONSTITUTION_FILE = "GrowForge Digital — Company Constitution.md";

function knowledgeDir(): string {
  return process.env.GROWFORGE_KNOWLEDGE_DIR || path.join(process.cwd(), "..");
}

function readKnowledgeFile(file: string): string {
  try {
    const fullPath = path.join(knowledgeDir(), file);
    return fs.readFileSync(fullPath, "utf8");
  } catch (err) {
    console.warn(`[departments] Knowledge file not found or unreadable: ${file}`, err instanceof Error ? err.message : err);
    return "";
  }
}

export function getDepartment(id: string): Department | undefined {
  const route = resolveRuntimeRoute(id);
  const legacy = ALL_RUNTIME_DEPARTMENTS.find(d => d.id === route);
  return legacy ? { ...legacy, id, runtimeRouteId: route } : undefined;
}

/** Constitution + the department's own operating instructions, read fresh
 *  on every job so edits to the .md files apply to the next run. */
export function loadInstructions(file: string): string {
  const constitution = readKnowledgeFile(CONSTITUTION_FILE);
  const own = readKnowledgeFile(file);
  const currentTaxonomy = taxonomyPrompt();
  const branchInstructions = file === "Marketing_Agent_System.md"
    ? ["Growth_Demand_Agent_System.md", "Meta_Ads_Agent_System.md"].map((source) => `# BRANCH SOURCE: ${source}\n\n${readKnowledgeFile(source)}`).join("\n\n")
    : "";
  return [
    constitution && `# COMPANY CONSTITUTION\n\n${constitution}`,
    `# CURRENT APPROVED SEMANTIC TAXONOMY\n\n${currentTaxonomy}\nSource draft status and approval/financial boundaries remain unchanged. Classification does not grant execution permission.`,
    own && `# YOUR DEPARTMENT OPERATING INSTRUCTIONS\n\n${own}`,
    branchInstructions,
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");
}

/**
 * Legacy/source comparison hash of exactly what loadInstructions(file) returned — the
 * constitution and the department file combined. Retained for legacy compatibility; new execution hashes include the final payload so
 * a source comparison can identify changes,
 * without anyone needing to know to check git log. Deliberately one
 * combined hash rather than separate constitution/department hashes: it
 * answers "did anything change since" (compare two jobs' hashes) even
 * though it can't say which of the two files changed on its own — that's
 * a reasonable v1 scope call, split later if it's ever actually needed.
 */
export function hashInstructions(file: string): string {
  return crypto.createHash("sha256").update(loadInstructions(file)).digest("hex").slice(0, 12);
}
