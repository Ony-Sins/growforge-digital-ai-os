/**
 * scripts/laya-poc.ts
 * 
 * Standalone proof-of-concept for Laya (System-1 Decision Model by Convai Innovations / Receptron)
 * Evaluating agent dispatch classification over real GrowForge Vault Agent records.
 * 
 * NOT wired into orchestrator.ts or live dispatch.
 */

import { Laya } from "@receptron/laya";
import * as fs from "node:fs";
import * as path from "node:path";

interface VaultRecord {
  id: string;
  name: string;
  category: string;
  summary: string;
  tools: string[];
  approvalTier: string;
}

interface TestBrief {
  id: string;
  title: string;
  brief: string;
  expectedAgentId: string;
  acceptableAgentIds: string[];
  rationale: string;
}

async function runLayaPoc() {
  console.log("==================================================================");
  console.log("🚀 GrowForge Vault Agent Dispatch: Laya System-1 Proof of Concept");
  console.log("==================================================================\n");

  // 1. Load real vault records
  const vaultPath = path.resolve(__dirname, "../src/data/vaultCapabilities.json");
  if (!fs.existsSync(vaultPath)) {
    throw new Error(`Vault catalog not found at ${vaultPath}`);
  }
  const allVault: VaultRecord[] = JSON.parse(fs.readFileSync(vaultPath, "utf8"));
  console.log(`Loaded ${allVault.length} total cataloged agents from vaultCapabilities.json.`);

  // 2. Select a representative candidate roster (16 agents: mix of relevant & distractor roles)
  const candidateIds = [
    // Strategy & Business
    "business-strategist",
    // Design & Brand
    "design-brand-guardian",
    // Growth & Ecommerce
    "marketing-growth-hacker",
    "marketing-cross-border-ecommerce",
    // Paid Media & Advertising
    "paid-media-ppc-strategist",
    "paid-media-paid-social-strategist",
    "paid-media-creative-strategist",
    // SEO & Content
    "marketing-seo-specialist",
    "marketing-content-creator",
    "marketing-email-strategist",
    // Sales & Lead Gen
    "sales-offer-lead-gen-strategist",
    // Finance & Accounting
    "finance-financial-analyst",
    "finance-bookkeeper-controller",
    "accounts-payable-agent",
    // Tech & Automation (Distractors)
    "automation-governance-architect",
    "engineering-ai-data-remediation-engineer"
  ];

  const candidateAgents = candidateIds.map(id => {
    const found = allVault.find(a => a.id === id);
    if (!found) {
      throw new Error(`Candidate agent not found in catalog: ${id}`);
    }
    return found;
  });

  console.log(`\nCandidate Roster (${candidateAgents.length} agents selected for choice question):`);
  candidateAgents.forEach((a, i) => {
    console.log(`  [${i + 1}] ${a.id.padEnd(42)} (${a.name})`);
  });

  // Build criteria map for Laya (keep descriptions crisp to fit head_max_len tokens)
  const criteria: Record<string, string> = {
    "business-strategist": "Market entry, business model, licensing, and strategic consulting",
    "design-brand-guardian": "Brand identity, logo design, visual guidelines, typography",
    "marketing-growth-hacker": "DTC ecommerce scaling, viral growth loops, conversion rate optimization",
    "marketing-cross-border-ecommerce": "International online store operations, global retail logistics",
    "paid-media-ppc-strategist": "Google search ads, PPC campaign bids, keyword targeting",
    "paid-media-paid-social-strategist": "Meta, Facebook, and Instagram paid advertising and ROAS",
    "paid-media-creative-strategist": "Ad visual creative concepts, hooks, video ad scripts",
    "marketing-seo-specialist": "Organic search engine rankings, keyword optimization, backlinks",
    "marketing-content-creator": "Blog posts, articles, organic content marketing",
    "marketing-email-strategist": "Email newsletter funnels, Klaviyo lifecycle automation",
    "sales-offer-lead-gen-strategist": "B2B lead generation, client outreach, offer positioning",
    "finance-financial-analyst": "Financial modeling, unit economics, forecasting, budgets",
    "finance-bookkeeper-controller": "Bookkeeping, general ledger, invoice reconciliation",
    "accounts-payable-agent": "Vendor payment execution, automated invoice payouts",
    "automation-governance-architect": "n8n and Zapier workflow automation architecture",
    "engineering-ai-data-remediation-engineer": "Data pipeline debugging, database schema cleaning"
  };

  // 3. Define Real & Realistic Test Briefs (8 total test cases testing nuanced distinctions)
  const testBriefs: TestBrief[] = [
    {
      id: "brief-1-pharma",
      title: "Drug Store Launch in Dhaka, Bangladesh (Real Job from jobs.json)",
      brief: "Starting a drug store business in Dhaka, Bangladesh. Stage: Idea phase. Missing business plan, legal requirements, initial funding details. Deliverables: Assistance in developing a business plan, identifying legal and licensing requirements, selecting a location, and setting up market entry strategies.",
      expectedAgentId: "business-strategist",
      acceptableAgentIds: ["business-strategist", "finance-financial-analyst"],
      rationale: "Requires high-level market entry strategy, business modeling, and licensing/regulatory planning."
    },
    {
      id: "brief-2-ecommerce",
      title: "Pet Accessory Ecommerce Growth Plan (Real Job from jobs.json)",
      brief: "Client wants to launch and scale a direct-to-consumer online store selling pet accessories. Needs a complete growth plan to acquire ecommerce customers, improve conversion rates, and build viral sales momentum.",
      expectedAgentId: "marketing-growth-hacker",
      acceptableAgentIds: ["marketing-growth-hacker", "marketing-cross-border-ecommerce", "paid-media-paid-social-strategist"],
      rationale: "DTC online store acquisition and conversion optimization fits growth hacking & ecommerce marketing."
    },
    {
      id: "brief-3-local-contractor",
      title: "P&E Flooring Solutions Lead Generation (Real Job from jobs.json)",
      brief: "Local commercial and residential flooring contractor needs a steady pipeline of inbound quote requests and commercial contractor leads. Deliverables: High-converting lead generation strategy, offer positioning, and client outreach.",
      expectedAgentId: "sales-offer-lead-gen-strategist",
      acceptableAgentIds: ["sales-offer-lead-gen-strategist", "marketing-seo-specialist", "paid-media-ppc-strategist"],
      rationale: "Local contractor pipeline building and client lead generation."
    },
    {
      id: "brief-4-ppc-cleaning",
      title: "Miami Cleaning Services PPC Campaign (Real Job from jobs.json)",
      brief: "Launching a residential and commercial cleaning service in Miami. Goal: Run paid Google Search advertising to capture high-intent local booking calls and immediate cleaning quote searches with target cost-per-click.",
      expectedAgentId: "paid-media-ppc-strategist",
      acceptableAgentIds: ["paid-media-ppc-strategist", "sales-offer-lead-gen-strategist"],
      rationale: "Paid Google search ads and PPC bidding to drive immediate booking calls."
    },
    {
      id: "brief-5-brand-identity",
      title: "Fintech Startup Visual Brand Identity Overhaul",
      brief: "A high-growth B2B fintech company requires a comprehensive brand identity redesign. Deliverables: New logo system, typography hierarchy, UI brand guidelines, color palette specifications, and design system governance.",
      expectedAgentId: "design-brand-guardian",
      acceptableAgentIds: ["design-brand-guardian"],
      rationale: "Visual identity, design systems, logo guidelines, and brand design."
    },
    {
      id: "brief-6-email-nurture",
      title: "Klaviyo Cart Abandonment & Welcome Flow Setup",
      brief: "An apparel brand needs automated 5-part email nurture flows set up in Klaviyo to recover abandoned carts, welcome new subscribers, and drive repeat purchases.",
      expectedAgentId: "marketing-email-strategist",
      acceptableAgentIds: ["marketing-email-strategist", "marketing-growth-hacker"],
      rationale: "Lifecycle email automation, cart recovery flows, and email marketing."
    },
    {
      id: "brief-7-financial-model",
      title: "Series-A SaaS Financial Forecast & Unit Economics Model",
      brief: "Founders need a 3-year financial model with detailed revenue forecasting, CAC/LTV calculations, burn rate estimates, and scenario sensitivity analysis for an upcoming funding round.",
      expectedAgentId: "finance-financial-analyst",
      acceptableAgentIds: ["finance-financial-analyst", "business-strategist"],
      rationale: "Financial modeling, unit economics, cash runway, and forecasting."
    },
    {
      id: "brief-8-n8n-webhook-pipeline",
      title: "Multi-System CRM to Billing Webhook Pipeline",
      brief: "Architect an automated webhook pipeline using n8n that syncs customer signups from HubSpot CRM into Stripe billing and updates an internal PostgreSQL database with error retries.",
      expectedAgentId: "automation-governance-architect",
      acceptableAgentIds: ["automation-governance-architect", "engineering-ai-data-remediation-engineer"],
      rationale: "n8n workflow automation, webhook routing, and integration architecture."
    }
  ];

  // 4. Initialize Laya
  console.log("\n📦 Initializing Laya ONNX runtime...");
  const startTime = Date.now();
  const laya = await Laya.load();
  const initLatency = Date.now() - startTime;
  console.log(`✅ Laya model loaded in ${initLatency}ms.\n`);

  // 5. Execute System-1 inference across all test briefs
  console.log("==================================================================");
  console.log("🧪 Running System-1 Decision Inferences");
  console.log("==================================================================\n");

  let correctCount = 0;
  let acceptableCount = 0;
  const latencies: number[] = [];
  const confidences: number[] = [];

  for (let i = 0; i < testBriefs.length; i++) {
    const t = testBriefs[i];
    console.log(`------------------------------------------------------------------`);
    console.log(`Test Case [${i + 1}/${testBriefs.length}]: ${t.title}`);
    console.log(`Brief: "${t.brief.substring(0, 140)}..."`);
    console.log(`Expected: ${t.expectedAgentId} (Acceptable: ${t.acceptableAgentIds.join(", ")})`);

    const inferStart = Date.now();
    const result = await laya.systemOne(
      {
        project_title: t.title,
        brief_summary: t.brief,
      },
      {
        assigned_specialist: {
          type: "choice",
          instructions: "Which specialist agent should be assigned as the primary lead for this client project?",
          criteria: criteria,
        },
        task_complexity: {
          type: "score",
          instructions: "How complex is this client request?",
          criteria: ["simple task", "moderate project", "complex multi-stage pipeline", "enterprise transformation"],
        },
        requires_financial_review: {
          type: "noul",
          instructions: "Does this project require financial modeling, licensing, or budget analysis?",
        }
      }
    );
    const inferLatency = Date.now() - inferStart;
    latencies.push(inferLatency);

    const pick = result.answers.assigned_specialist.choice;
    const probs = result.answers.assigned_specialist.probabilities;
    const pickProb = probs[pick] ?? 0;
    confidences.push(pickProb);

    const isExact = pick === t.expectedAgentId;
    const isAcceptable = t.acceptableAgentIds.includes(pick);

    if (isExact) correctCount++;
    if (isAcceptable) acceptableCount++;

    const statusBadge = isExact ? "🎯 EXACT MATCH" : (isAcceptable ? "✅ ACCEPTABLE MATCH" : "❌ MISMATCH");

    console.log(`\nLaya Decision: ${pick} (${(pickProb * 100).toFixed(1)}% confidence) -> ${statusBadge}`);
    console.log(`Complexity Score: ${result.answers.task_complexity.score.toFixed(2)}/3.00`);
    console.log(`Financial/Budget Probability: ${(result.answers.requires_financial_review.noul * 100).toFixed(1)}%`);
    console.log(`Inference Latency: ${inferLatency}ms`);

    // Display top 3 probability ranking
    const sortedProbs = Object.entries(probs).sort((a, b) => b[1] - a[1]).slice(0, 4);
    console.log(`Top Rankings:`);
    sortedProbs.forEach(([agentId, p], rank) => {
      console.log(`   ${rank + 1}. ${agentId.padEnd(42)}: ${(p * 100).toFixed(2)}%`);
    });
    console.log();
  }

  // 6. Report Summary & Statistics
  await laya.close();

  const avgLatency = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
  const avgConfidence = (confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100;
  const exactAccuracy = (correctCount / testBriefs.length) * 100;
  const acceptableAccuracy = (acceptableCount / testBriefs.length) * 100;

  console.log("==================================================================");
  console.log("📊 Laya Proof of Concept — Final Evaluation Summary");
  console.log("==================================================================");
  console.log(`Total Test Briefs:          ${testBriefs.length}`);
  console.log(`Exact Match Accuracy:       ${correctCount}/${testBriefs.length} (${exactAccuracy.toFixed(1)}%)`);
  console.log(`Acceptable Match Accuracy:  ${acceptableCount}/${testBriefs.length} (${acceptableAccuracy.toFixed(1)}%)`);
  console.log(`Average Top-1 Confidence:   ${avgConfidence.toFixed(1)}%`);
  console.log(`Average Inference Latency:  ${avgLatency}ms (local CPU ONNX)`);
  console.log(`Single-Pass Multimodal:     Yes (Choice + Score + Noul calibrated simultaneously)`);
  console.log("==================================================================\n");

  return {
    exactAccuracy,
    acceptableAccuracy,
    avgConfidence,
    avgLatency,
    correctCount,
    total: testBriefs.length
  };
}

// Run script directly
if (require.main === module || !process.env.TEST_IMPORT) {
  runLayaPoc().catch(err => {
    console.error("❌ Laya POC Failed with Error:", err);
    process.exit(1);
  });
}
