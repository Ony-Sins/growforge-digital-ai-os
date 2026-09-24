import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

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
  name: string;
  file: string;
  summary: string;
}

export const DEPARTMENTS: Department[] = [
  {
    id: "sales-bd",
    name: "Strategy & Intelligence",
    file: "Sales_BD_Agent_System.md",
    summary: "ICP definition, prospecting, lead sources, outreach sequences, qualification, proposals, closing.",
  },
  {
    id: "marketing",
    name: "Marketing & Brand Strategy",
    file: "Marketing_Agent_System.md",
    summary: "Positioning, target audience, messaging, channel strategy, SEO/content, brand, demand generation.",
  },
  {
    id: "meta-ads",
    name: "Growth & Demand",
    file: "Meta_Ads_Agent_System.md",
    summary: "Paid advertising strategy: campaign structure, audiences, creative briefs, budgets, bidding, measurement.",
  },
  {
    id: "finance-ops",
    name: "Finance & Operations",
    file: "Finance_Operations_Agent_System.md",
    summary: "Pricing, budgets, unit economics, revenue projections, costs, cash flow, operating processes.",
  },
  {
    id: "client-success",
    name: "Client Success & Program Management",
    file: "Client_Success_PM_Agent_System.md",
    summary: "Requirements, project sequencing, milestones, timelines, risk tracking, delivery coordination.",
  },
  {
    id: "web-design",
    name: "Product Architecture & UX",
    file: "Web_Design_UX_Agent_System.md",
    summary: "Website/landing page structure, UX, conversion optimization, visual direction.",
  },
  {
    id: "web-dev",
    name: "Web Development & Engineering",
    file: "Web_Development_Agent_System.md",
    summary: "Website build, technical SEO, tracking/analytics setup, integrations, hosting.",
  },
  {
    id: "ai-automation",
    name: "AI Systems & Intelligent Automation",
    file: "AI_Systems_Automation_Agent_System.md",
    summary: "Automations, CRM workflows, AI tools, lead follow-up systems, integrations.",
  },
];

export const HQ = { id: "hq", name: "GrowForge HQ", file: "GrowForge_HQ_Agent_System.md" };
export const QA = { id: "qa", name: "Quality Assurance", file: "Quality_Assurance_Agent_System.md" };
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
  return DEPARTMENTS.find((d) => d.id === id);
}

/** Constitution + the department's own operating instructions, read fresh
 *  on every job so edits to the .md files apply to the next run. */
export function loadInstructions(file: string): string {
  const constitution = readKnowledgeFile(CONSTITUTION_FILE);
  const own = readKnowledgeFile(file);
  return [
    constitution && `# COMPANY CONSTITUTION\n\n${constitution}`,
    own && `# YOUR DEPARTMENT OPERATING INSTRUCTIONS\n\n${own}`,
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");
}

/**
 * Short hash of exactly what loadInstructions(file) returned — the
 * constitution and the department file combined. Recorded per job step so
 * a plan can always answer "which version of the rules produced this,"
 * without anyone needing to know to check git log. Deliberately one
 * combined hash rather than separate constitution/department hashes: it
 * answers "did anything change since" (compare two jobs' hashes) even
 * though it can't say which of the two files changed on its own — that's
 * a reasonable v1 scope call, split later if it's ever actually needed.
 */
export function hashInstructions(file: string): string {
  return crypto.createHash("sha256").update(loadInstructions(file)).digest("hex").slice(0, 12);
}
