import { financeModuleByPhrase } from "./financeFoundation";

/**
 * Canonical Dive In lens registry and semantic address model.
 *
 * Pure data and pure functions (no React, no server imports) so the same identity
 * is usable by the UI, NORA surface context and future voice routing. Commands
 * should address UI by these ids, never by DOM text or simulated clicks.
 *
 * Depth model:  LENS -> ENTITY -> DETAIL / EVIDENCE / ACTION
 *   Missions   -> Voice V2   -> STT Benchmark
 *   Context    -> Decision   -> Source Evidence
 *   Finance    -> API Cost   -> Provider / Project Breakdown
 */

export const DIVE_LENS_IDS = [
  "lens.overview", "lens.missions", "lens.context", "lens.finance", "lens.departments",
  "lens.agents", "lens.workflows", "lens.tools", "lens.intelligence",
] as const;
export type DiveLensId = (typeof DIVE_LENS_IDS)[number];

export interface DiveLensDef {
  id: DiveLensId;
  label: string;
  /** URL-safe slug, the id without its `lens.` prefix. */
  slug: string;
  purpose: string;
  /** NORA scope when nothing is selected inside the lens. */
  defaultScope: string;
  /** Prefix for a selected entity: "Mission / Voice V2". */
  entityNoun: string;
  /** Spoken or typed names for this lens. */
  aliases: readonly string[];
}

export const DIVE_LENS_REGISTRY: readonly DiveLensDef[] = [
  { id: "lens.overview", label: "Overview", slug: "overview", purpose: "Operational command center for the whole system.", defaultScope: "Overview", entityNoun: "Overview", aliases: ["overview", "command overview", "home"] },
  { id: "lens.missions", label: "Missions", slug: "missions", purpose: "Plan, execute and inspect work across GrowForge.", defaultScope: "All Missions", entityNoun: "Mission", aliases: ["missions", "mission", "projects"] },
  { id: "lens.context", label: "Context", slug: "context", purpose: "What NORA knows, what is loaded now, and why.", defaultScope: "Current Context", entityNoun: "Context", aliases: ["context", "memory"] },
  { id: "lens.finance", label: "Finance", slug: "finance", purpose: "Track spending, budgets, API usage, subscriptions and financial health.", defaultScope: "Finance / Overview", entityNoun: "Finance", aliases: ["finance", "money", "financials"] },
  { id: "lens.departments", label: "Departments", slug: "departments", purpose: "The operating departments and oversight that organize the work.", defaultScope: "All Departments", entityNoun: "Department", aliases: ["departments", "department", "teams"] },
  { id: "lens.agents", label: "Agents", slug: "agents", purpose: "Who can do the work: live runs, separate from specialist blueprints.", defaultScope: "All Agents", entityNoun: "Agent", aliases: ["agents", "agent"] },
  { id: "lens.workflows", label: "Workflows", slug: "workflows", purpose: "The procedures work moves through, from trigger to verification.", defaultScope: "All Workflows", entityNoun: "Workflow", aliases: ["workflows", "workflow", "pipelines", "automations"] },
  { id: "lens.tools", label: "Tools", slug: "tools", purpose: "Operational capabilities NORA and GrowForge can use. Providers and credentials live in Systems.", defaultScope: "All Tools", entityNoun: "Tool", aliases: ["tools", "tool", "capabilities"] },
  { id: "lens.intelligence", label: "Intelligence", slug: "intelligence", purpose: "Recorded evidence, signals and recommendations, never invented insight.", defaultScope: "All Evidence", entityNoun: "Evidence", aliases: ["intelligence", "insights", "evidence"] },
];

export function lensById(id: string): DiveLensDef | undefined {
  return DIVE_LENS_REGISTRY.find(lens => lens.id === id);
}
export function lensByLabel(label: string): DiveLensDef | undefined {
  return DIVE_LENS_REGISTRY.find(lens => lens.label === label);
}

export type DiveEntityRef = { type: string; id: string; label: string };
/** Noun shown for a selected entity type, independent of which lens it was opened from. */
export const ENTITY_NOUNS: Record<string, string> = {
  mission: "Mission", department: "Department", agent: "Agent", workflow: "Workflow", tool: "Tool",
  evidence: "Evidence", context_record: "Context", module: "Finance", step: "Step",
};
export interface DiveAddress { lensId: DiveLensId; entity?: DiveEntityRef; detail?: DiveEntityRef }
export type DiveDepth = "lens" | "entity" | "detail";

export function diveDepth(address: DiveAddress): DiveDepth {
  return address.detail && address.entity ? "detail" : address.entity ? "entity" : "lens";
}

const clip = (text: string, max = 56) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** Stable machine address: `lens.missions/mission:JOB_ID/step:STEP_ID`. */
export function semanticAddress(address: DiveAddress): string {
  const parts: string[] = [address.lensId];
  if (address.entity) parts.push(`${address.entity.type}:${address.entity.id}`);
  if (address.entity && address.detail) parts.push(`${address.detail.type}:${address.detail.id}`);
  return parts.join("/");
}

/** Human NORA scope text, e.g. "Mission / Voice V2", "All Missions", "Finance / API Cost". */
export function scopeText(address: DiveAddress): string {
  const lens = lensById(address.lensId);
  if (!lens) return "Unknown scope";
  if (!address.entity) return lens.defaultScope;
  const base = `${ENTITY_NOUNS[address.entity.type] ?? lens.entityNoun} / ${clip(address.entity.label)}`;
  return address.detail ? `${base} / ${clip(address.detail.label)}` : base;
}

export type DiveIntent =
  | { kind: "open-lens"; lensId: DiveLensId }
  | { kind: "open-entity"; lensId: DiveLensId; entity: { type: string; id: string } }
  | { kind: "find-entity"; query: string; lensId?: DiveLensId }
  | { kind: "back" };

const normalize = (text: string) => text.toLowerCase().replace(/^\s*(?:hey\s+)?nora[,\s]+/, "").replace(/[.!?]+$/g, "").replace(/\s+/g, " ").trim();

/**
 * Resolves a spoken or typed phrase to a semantic UI intent. This describes WHAT
 * to address; it never executes anything and is deliberately not wired to voice.
 * Dynamic entities ("Voice V2") need a live lookup, so they return find-entity.
 */
export function resolveDiveIntent(text: string): DiveIntent | null {
  const phrase = normalize(text);
  if (!phrase) return null;
  if (/^(go )?back$/.test(phrase)) return { kind: "back" };
  const verb = phrase.match(/^(?:open|show|go to|take me to)\s+(?:me\s+)?(?:the\s+)?(.+)$/);
  if (!verb) return null;
  const target = verb[1].trim();
  const finance = financeModuleByPhrase(target);
  if (finance) return { kind: "open-entity", lensId: "lens.finance", entity: { type: "module", id: finance.id } };
  const lens = DIVE_LENS_REGISTRY.find(item => item.aliases.includes(target) || item.label.toLowerCase() === target);
  if (lens) return { kind: "open-lens", lensId: lens.id };
  return { kind: "find-entity", query: target };
}

/** Window event used to address Dive semantically instead of via DOM clicks. */
export const DIVE_OPEN_EVENT = "growforge:dive-open";
export type DiveOpenDetail = { lensId: DiveLensId } | { back: true };
/** Window event publishing the current scope (consumed by NORA surface context). */
export const DIVE_SCOPE_EVENT = "growforge:dive-scope";
export type DiveScopeDetail = { lensId: DiveLensId; lens: string; scope: string; address: string; entity?: DiveEntityRef; detail?: DiveEntityRef } | null;

/**
 * Window event publishing the entity selected INSIDE the selected entity (e.g. the department or step of a mission, or a deep-inspection category).
 * It becomes the `detail` of the NORA scope address. null clears it. Owned by whichever lens owns the entity; it never depends on a panel being open.
 */
export const DIVE_DETAIL_EVENT = "growforge:dive-detail";
export type DiveDetailDetail = DiveEntityRef | null;
