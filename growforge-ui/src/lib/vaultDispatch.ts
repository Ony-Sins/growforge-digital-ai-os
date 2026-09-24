/**
 * src/lib/vaultDispatch.ts
 *
 * System-1 Decision Model Specialist Dispatcher for GrowForge Vault Agents.
 * Uses Laya (ModernBERT decision head via ONNX Runtime) to pick the best specialized
 * vault agent scoped to a specific assigned department.
 *
 * Step 1: Observability & Log-Only Instrumentation.
 * Does NOT alter active job pipeline or department execution.
 */

import { Laya } from "@receptron/laya";
import {
  matchVaultAgents,
  matchVaultAgentsWithScore,
  type VaultCapabilityRecord,
} from "./vaultMatcher";

export interface VaultDispatchRank {
  id: string;
  name: string;
  category: string;
  probability: number;
}

export interface VaultDispatchRecommendation {
  departmentId?: string;
  departmentName?: string;
  selectedAgentId: string;
  selectedAgentName: string;
  selectedAgentCategory: string;
  confidence: number;
  band: "direct" | "confirm" | "escalate";
  bandDescription: string;
  taskComplexity: number; // 0.0 to 3.0
  requiresReviewProbability: number; // 0.0 to 1.0
  topRankings: VaultDispatchRank[];
  candidateCount: number;
  latencyMs: number;
  usedFallback: boolean;
}

/**
 * Mapping between GrowForge's 8 core DEPARTMENTS and vaultCapabilities.json categories.
 * All 207 cataloged agents map into these departments.
 */
export const DEPARTMENT_VAULT_CATEGORIES: Record<
  string,
  { name: string; categories: string[] }
> = {
  "sales-bd": {
    name: "Strategy & Intelligence",
    categories: ["business", "research", "product"],
  },
  marketing: {
    name: "Marketing & Brand Strategy",
    categories: ["marketing"],
  },
  "meta-ads": {
    name: "Growth & Demand",
    categories: ["paid", "sales"],
  },
  "finance-ops": {
    name: "Finance & Operations",
    categories: ["finance", "accounts", "chief", "operations", "supply"],
  },
  "client-success": {
    name: "Client Success & Program Management",
    categories: ["project", "customer", "hr", "report", "support"],
  },
  "web-design": {
    name: "Product Architecture & UX",
    categories: ["design", "technical"],
  },
  "web-dev": {
    name: "Web Development & Engineering",
    categories: ["engineering", "security", "testing"],
  },
  "ai-automation": {
    name: "AI Systems & Intelligent Automation",
    categories: [
      "automation",
      "agentic",
      "agents",
      "data",
      "identity",
      "zk",
      "specialized",
    ],
  },
};

let layaInstance: Laya | null = null;
let layaLoadingPromise: Promise<Laya | null> | null = null;

/**
 * Lazily loads and caches the local Laya ONNX runtime instance.
 * Gracefully returns null if initialization fails.
 */
export async function getLayaInstance(): Promise<Laya | null> {
  if (layaInstance) return layaInstance;
  if (layaLoadingPromise) return layaLoadingPromise;

  layaLoadingPromise = (async () => {
    try {
      const instance = await Laya.load();
      layaInstance = instance;
      return instance;
    } catch (err) {
      console.warn(
        "[vaultDispatch] Failed to initialize Laya ONNX runtime, will use keyword fallback:",
        err
      );
      return null;
    } finally {
      layaLoadingPromise = null;
    }
  })();

  return layaLoadingPromise;
}

/**
 * Retrieves candidate Vault Agents filtered to those whose categories map to `departmentId`,
 * ranked by relevance to the client brief via `vaultMatcher.ts`.
 */
export function getDepartmentScopedCandidates(
  brief: string,
  departmentId?: string,
  limit: number = 16
): VaultCapabilityRecord[] {
  const cleanLimit = Math.max(1, Math.min(16, limit));

  if (!departmentId || !DEPARTMENT_VAULT_CATEGORIES[departmentId]) {
    return matchVaultAgents(brief, cleanLimit);
  }

  const deptConfig = DEPARTMENT_VAULT_CATEGORIES[departmentId];
  const allScored = matchVaultAgentsWithScore(brief, 207);
  const scoped = allScored.filter((c) =>
    deptConfig.categories.includes(c.category)
  );

  if (scoped.length > 0) {
    return scoped.slice(0, cleanLimit).map((item) => ({
      id: item.id,
      filename: item.filename,
      name: item.name,
      emoji: item.emoji,
      color: item.color,
      category: item.category,
      summary: item.summary,
      tools: item.tools,
      approvalTier: item.approvalTier,
    }));
  }

  return matchVaultAgents(brief, cleanLimit);
}

/**
 * Selects the best Vault Agent for a given job brief and department using Laya System-1 inference.
 *
 * @param brief The confirmed client brief text
 * @param departmentId Optional department ID (e.g. "marketing", "sales-bd", "finance-ops")
 * @param customCandidates Optional override candidate pool
 * @returns Structured recommendation with selected specialist, confidence, and action band
 */
export async function selectVaultAgent(
  brief: string,
  departmentId?: string,
  customCandidates?: VaultCapabilityRecord[]
): Promise<VaultDispatchRecommendation> {
  const startTime = Date.now();
  const cleanBrief = (brief || "").trim();
  const deptConfig = departmentId ? DEPARTMENT_VAULT_CATEGORIES[departmentId] : undefined;
  const deptName = deptConfig?.name || "General";

  // 1. Pre-filter candidates scoped to department
  const candidates: VaultCapabilityRecord[] =
    customCandidates && customCandidates.length > 0
      ? customCandidates.slice(0, 16)
      : getDepartmentScopedCandidates(cleanBrief, departmentId, 16);

  if (candidates.length === 0) {
    return {
      departmentId,
      departmentName: deptName,
      selectedAgentId: "business-strategist",
      selectedAgentName: "Business Strategist",
      selectedAgentCategory: "business",
      confidence: 0,
      band: "escalate",
      bandDescription: "would escalate to LLM (no candidates in category)",
      taskComplexity: 1.0,
      requiresReviewProbability: 0.5,
      topRankings: [],
      candidateCount: 0,
      latencyMs: Date.now() - startTime,
      usedFallback: true,
    };
  }

  // 2. Build criteria map for Laya (concise descriptions within token budget)
  const criteria: Record<string, string> = {};
  for (const c of candidates) {
    const summaryExcerpt = c.summary
      ? c.summary.split(/[.;\n]/)[0].slice(0, 100).trim()
      : c.name;
    criteria[c.id] = summaryExcerpt || c.name;
  }

  const laya = await getLayaInstance();

  // 3. Fallback path if Laya runtime is unavailable
  if (!laya) {
    const topCandidate = candidates[0];
    const latency = Date.now() - startTime;
    return {
      departmentId,
      departmentName: deptName,
      selectedAgentId: topCandidate.id,
      selectedAgentName: topCandidate.name,
      selectedAgentCategory: topCandidate.category,
      confidence: 0.7,
      band: "confirm",
      bandDescription: "would confirm/HITL (keyword matcher fallback)",
      taskComplexity: 1.5,
      requiresReviewProbability: 0.5,
      topRankings: candidates.slice(0, 4).map((c, i) => ({
        id: c.id,
        name: c.name,
        category: c.category,
        probability: i === 0 ? 0.7 : 0.1,
      })),
      candidateCount: candidates.length,
      latencyMs: latency,
      usedFallback: true,
    };
  }

  // 4. Run Laya System-1 forward pass
  try {
    const questionInstructions = departmentId
      ? `Which specialist from the ${deptName} department should execute this project deliverable?`
      : "Which specialized agent is best suited to lead or execute this client project?";

    const result = await laya.systemOne(
      {
        department: deptName,
        client_brief: cleanBrief.slice(0, 800),
      },
      {
        assigned_specialist: {
          type: "choice",
          instructions: questionInstructions,
          criteria,
        },
        task_complexity: {
          type: "score",
          instructions: "What is the estimated execution complexity of this department task?",
          criteria: [
            "simple task",
            "moderate project",
            "complex multi-stage pipeline",
            "enterprise transformation",
          ],
        },
        requires_human_approval: {
          type: "noul",
          instructions:
            "Does this department deliverable involve financial planning, paid ad spend, or sensitive decisions?",
        },
      }
    );

    const latencyMs = Date.now() - startTime;
    const selectedId = result.answers.assigned_specialist.choice;
    const probs = result.answers.assigned_specialist.probabilities;
    const confidence = probs[selectedId] ?? 0;

    const matchedRecord =
      candidates.find((c) => c.id === selectedId) || candidates[0];

    // 5. Categorize into Confidence Bands
    let band: "direct" | "confirm" | "escalate";
    let bandDescription: string;

    if (confidence >= 0.85) {
      band = "direct";
      bandDescription = "would dispatch directly (confidence >= 0.85)";
    } else if (confidence >= 0.5) {
      band = "confirm";
      bandDescription = "would confirm/HITL (0.50 <= confidence < 0.85)";
    } else {
      band = "escalate";
      bandDescription = "would escalate to LLM (confidence < 0.50)";
    }

    const topRankings: VaultDispatchRank[] = Object.entries(probs)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, p]) => {
        const rec = candidates.find((c) => c.id === id);
        return {
          id,
          name: rec ? rec.name : id,
          category: rec ? rec.category : "unknown",
          probability: Math.round(p * 10000) / 10000,
        };
      });

    return {
      departmentId,
      departmentName: deptName,
      selectedAgentId: matchedRecord.id,
      selectedAgentName: matchedRecord.name,
      selectedAgentCategory: matchedRecord.category,
      confidence: Math.round(confidence * 10000) / 10000,
      band,
      bandDescription,
      taskComplexity:
        Math.round(result.answers.task_complexity.score * 100) / 100,
      requiresReviewProbability:
        Math.round(result.answers.requires_human_approval.noul * 10000) / 10000,
      topRankings,
      candidateCount: candidates.length,
      latencyMs,
      usedFallback: false,
    };
  } catch (err) {
    console.warn(
      `[vaultDispatch] Laya inference error for department ${departmentId || "general"}, falling back to keyword matcher:`,
      err
    );
    const topCandidate = candidates[0];
    return {
      departmentId,
      departmentName: deptName,
      selectedAgentId: topCandidate.id,
      selectedAgentName: topCandidate.name,
      selectedAgentCategory: topCandidate.category,
      confidence: 0.6,
      band: "confirm",
      bandDescription: "would confirm/HITL (inference exception fallback)",
      taskComplexity: 1.5,
      requiresReviewProbability: 0.5,
      topRankings: [
        {
          id: topCandidate.id,
          name: topCandidate.name,
          category: topCandidate.category,
          probability: 0.6,
        },
      ],
      candidateCount: candidates.length,
      latencyMs: Date.now() - startTime,
      usedFallback: true,
    };
  }
}

/**
 * Instrumentation helper to log Laya's dispatch recommendation for a department without altering state.
 */
export function logVaultDispatchRecommendation(
  jobId: string,
  recommendation: VaultDispatchRecommendation,
  departmentId?: string
): void {
  const deptLabel = departmentId
    ? `[dept:${departmentId}]`
    : "[global]";
  console.log(
    `[vaultDispatch][job:${jobId}]${deptLabel} Specialist: "${recommendation.selectedAgentName}" (${recommendation.selectedAgentId} | category:${recommendation.selectedAgentCategory}) | Confidence: ${(recommendation.confidence * 100).toFixed(1)}% | Band: [${recommendation.band.toUpperCase()}] -> ${recommendation.bandDescription} | Candidates: ${recommendation.candidateCount} | Latency: ${recommendation.latencyMs}ms`
  );
}
