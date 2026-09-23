import { chatComplete, jobPrefersCloud } from "@/lib/llm";
import { DEPARTMENTS, HQ, QA, getDepartment, loadInstructions, hashInstructions } from "@/lib/departments";
import { isResearchAvailable, researchQuestion, type ResearchFinding, type Source } from "@/lib/research";
import { runToolLoop, getDefaultTools, type MediaItem } from "@/lib/tools";
import { createApproval, getApproval, markTimedOut } from "@/lib/approvalStore";
import { createConsultation, getConsultation, markConsultationTimedOut } from "@/lib/consultationStore";
import { formatUserMemoryPrompt, recordLearnedObservation, recordExplicitRejection } from "@/lib/userMemory";
import { selectVaultAgent, logVaultDispatchRecommendation, type VaultDispatchRecommendation } from "@/lib/vaultDispatch";
import { getVaultCapability } from "@/lib/vaultMatcher";
import {
  addLiveNote,
  addRevisionEntry,
  getJob,
  resetStepsForRedo,
  saveJob,
  updateJob,
  updateStep,
  type Job,
  type JobStep,
} from "@/lib/jobStore";
import { logJobStateChange, logStrategicDecision } from "@/lib/brainLogger";

/**
 * The multi-agent pipeline behind a confirmed brief:
 *
 *   brief → HQ plan → live research → departments (parallel)
 *         → HQ cross-department review → QA → HQ final plan
 *
 * Every stage reads its department's real *_Agent_System.md as its system
 * prompt (see departments.ts) and writes progress to jobStore as it
 * finishes, which is what the live canvas renders.
 *
 * Accuracy is enforced structurally, not by asking nicely: facts can only
 * come from the search-grounded research dossier, QA audits every draft for
 * unsupported figures, and the final Sources list and UNVERIFIED banner are
 * appended by this code — never written by a model — so a source URL in
 * the output is always one that search actually returned.
 */

const WEIGHTS = { plan: 10, research: 15, departments: 40, reconcile: 10, qa: 10, final: 15 };

const EVIDENCE_RULES = `EVIDENCE RULES & STRATEGIC CHALLENGER DIRECTIVE (non-negotiable):
1. The RESEARCH DOSSIER is your only source of facts about the market, prices, costs, ad benchmarks, competitors, platforms and regulations. When you use one, cite it inline as [n] using the dossier's source numbers.
2. Never invent statistics, prices, percentages, market sizes, or named companies. If the plan needs a number that is not in the dossier, either label it "(estimate — verify)" or list it as an open question.
3. STRATEGIC RED-TEAM & CHALLENGER PUSHBACK: If any client requirement, assumption, or user proposal carries realistic deliverability, low-ROI, poor conversion, or execution risks (e.g. unrealistic timelines, bloated/misallocated budgets, low-performing channels, missing tracking), you MUST challenge it constructively. Quote the risk, cite authentic benchmark evidence or research logic, and propose a high-ROI alternative aligned with GrowForge Digital's vision.
4. You PROPOSE; you never EXECUTE. Recommend budgets and actions — never imply money has been spent or commitments made.
5. Be specific to this exact client. Advice that would apply unchanged to any business is not acceptable.`;

interface Assignment {
  departmentId: string;
  task: string;
  activity: string;
  vaultRecommendation?: VaultDispatchRecommendation;
}

interface Plan {
  title: string;
  assignments: Assignment[];
  researchQuestions: string[];
}

/** Formats job-scoped specialist blueprint context to enrich department instructions. */
function formatBlueprintContext(rec: VaultDispatchRecommendation): string {
  const cap = getVaultCapability(rec.selectedAgentId);
  const summary = cap?.summary || rec.selectedAgentName;
  const tools = cap?.tools && cap.tools.length > 0 ? cap.tools.join(", ") : "Standard department toolset";
  return `\n\n---\n\nSPECIALIST BLUEPRINT CONTEXT (Job-Scoped):\nFor this specific job, draw on the following specialist expertise from the GrowForge Specialist Blueprint Library:\n- Specialist Blueprint: ${rec.selectedAgentName} (${rec.selectedAgentCategory})\n- Domain Expertise & Focus: ${summary}\n- Specialized Toolset: ${tools}\n\nGovernance Rule: Your core department instructions and GrowForge standards above remain primary and authoritative. Use this specialist blueprint's domain lens, technical depth, and specific methodology to enrich your department draft.`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retries on rate limits — a full job is ~15 model calls in a few minutes,
 *  which can briefly exceed free-tier requests-per-minute quotas. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // A used-up daily/plan quota won't recover in seconds — retrying only
      // burns time; only short-lived rate limits and overloads are retried.
      const quotaExhausted = /exceeded your current quota|billing/i.test(msg);
      const rateLimited = /429|rate.?limit|resource.?exhausted|overloaded/i.test(msg);
      if (quotaExhausted || !rateLimited || i >= attempts - 1) throw err;
      await sleep(8000 * (i + 1));
    }
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function ask(system: string, user: string, maxTokens: number): Promise<{ text: string; provider: string }> {
  return withRetry(() => chatComplete(system, [{ role: "user", content: user }], { maxTokens, preferCloud: jobPrefersCloud() }));
}

function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

const now = () => new Date().toISOString();

/** The brief text a stage should actually prompt with: the original brief
 *  plus any live notes added after launch (see jobStore.addLiveNote) that
 *  arrived before this stage started its model call, plus the operator's
 *  learned shadow memory profile. Read fresh at the start of every stage —
 *  never from a closure — so a change made mid-run reaches any stage that
 *  hasn't started yet, without touching whatever is already in flight. */
function currentBrief(jobId: string): string {
  const job = getJob(jobId)!;
  const notes = job.liveNotes ?? [];
  const memoryContext = formatUserMemoryPrompt(job.createdBy);
  const memoryBlock = memoryContext ? `\n\n${memoryContext}` : "";

  if (notes.length === 0) return `${job.brief}${memoryBlock}`;
  // Changes go FIRST and are marked as overriding: appended at the bottom,
  // models tend to follow the original figure they read first.
  return `### LATEST CLIENT CHANGES — these OVERRIDE anything in the original brief below\n${notes.map((n, i) => `${i + 1}. ${n}`).join("\n")}\n\n### Original brief\n${job.brief}${memoryBlock}`;
}

function step(partial: Omit<JobStep, "status" | "percent"> & Partial<JobStep>): JobStep {
  return { status: "pending", percent: 0, ...partial };
}

export function createAndStartJob(brief: string, createdBy?: string): Job {
  const firstLine = brief.split("\n").find((l) => l.trim())?.trim() ?? "New project";
  const job: Job = {
    id: `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    title: firstLine.length > 60 ? `${firstLine.slice(0, 57)}…` : firstLine,
    brief,
    status: "running",
    percent: 0,
    verified: false,
    createdAt: now(),
    updatedAt: now(),
    liveNotes: [],
    revisions: [],
    createdBy: createdBy?.toLowerCase(),
    steps: [
      step({ id: "brief", kind: "brief", label: "Client Brief", activity: "Confirmed with you in chat", weight: 0, dependsOn: [], status: "done", percent: 100, output: brief }),
      step({ id: "plan", kind: "plan", label: "GrowForge HQ", activity: "Queued", weight: WEIGHTS.plan, dependsOn: ["brief"] }),
      step({ id: "research", kind: "research", label: "Live Research", activity: "Waiting for HQ's research questions", weight: WEIGHTS.research, dependsOn: ["plan"] }),
      step({ id: "reconcile", kind: "reconcile", label: "Team Review", activity: "Waiting for department drafts", weight: WEIGHTS.reconcile, dependsOn: ["research"] }),
      step({ id: "qa", kind: "qa", label: "Quality Assurance", activity: "Waiting for team review", weight: WEIGHTS.qa, dependsOn: ["reconcile"] }),
      step({ id: "final", kind: "final", label: "Final Plan", activity: "Waiting for QA sign-off", weight: WEIGHTS.final, dependsOn: ["qa"] }),
    ],
  };
  saveJob(job);
  logJobStateChange(job);

  void resumePipeline(job.id).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[orchestrator] job ${job.id} failed:`, err);
    const current = getJob(job.id);
    current?.steps.filter((s) => s.status === "active").forEach((s) => updateStep(job.id, s.id, { status: "error", error: message, finishedAt: now() }));
    updateJob(job.id, { status: "error", error: message, finishedAt: now() });
    if (current) logJobStateChange(getJob(job.id)!);
  });

  return job;
}

async function runPlan(job: Job): Promise<Plan> {
  updateStep(job.id, "plan", { status: "active", percent: 10, activity: "Reading the brief and assigning departments", startedAt: now() });
  logJobStateChange(getJob(job.id)!);

  const catalog = DEPARTMENTS.map((d) => `- ${d.id}: ${d.name} — ${d.summary}`).join("\n");
  const system = `${loadInstructions(HQ.file)}\n\n---\n\nYou are GrowForge HQ planning a client engagement. Respond with ONLY a JSON object, no prose.`;
  const user = `CONFIRMED CLIENT BRIEF:\n${currentBrief(job.id)}\n\nAVAILABLE DEPARTMENTS:\n${catalog}\n\nReturn JSON exactly in this shape — researchQuestions FIRST, it is required and must never be empty:
{
  "researchQuestions": ["specific, Google-searchable question including the client's exact location, industry and current year"],
  "title": "short project title, max 60 characters",
  "assignments": [
    { "departmentId": "<id from the list>", "task": "the specific deliverable this department owns for THIS client", "activity": "5-8 word present-tense status, e.g. 'Mapping local lead sources'" }
  ]
}
Rules:
- researchQuestions is REQUIRED: write exactly 5 specific, Google-searchable questions, each naming the client's location and industry, covering: local demand/seasonality, the competitor landscape, typical customer pricing, advertising cost benchmarks (cost per lead/click) for this industry and location, and where customers search or licensing/regulatory requirements. Never return an empty array.
- Assign only the departments this brief genuinely needs — judge it case by case, it could be as few as 2 or as many as all 8. Do not default to a habitual subset or leave a department out just because it's less commonly needed; if the brief has a real automation, workflow, or systems-integration need, assign AI Systems & Intelligent Automation; if it has real delivery/timeline/coordination complexity, assign Client Success & Program Management. Never pad with a department the brief doesn't need just to hit a number.`;

  const { text, provider } = await ask(system, user, 2200);
  const parsed = extractJson(text) as Partial<Plan> | null;

  const seen = new Set<string>();
  let assignments = (Array.isArray(parsed?.assignments) ? parsed.assignments : [])
    .filter((a): a is Assignment => !!a && typeof a.departmentId === "string" && !!getDepartment(a.departmentId))
    .filter((a) => (seen.has(a.departmentId) ? false : (seen.add(a.departmentId), true)))
    .slice(0, DEPARTMENTS.length);
  if (assignments.length === 0) {
    assignments = ["marketing", "sales-bd", "meta-ads", "finance-ops"].map((id) => ({
      departmentId: id,
      task: `Contribute the ${getDepartment(id)!.name} section of the plan for this brief.`,
      activity: "Drafting department section",
    }));
  }

  let researchQuestions = (Array.isArray(parsed?.researchQuestions) ? parsed.researchQuestions : [])
    .filter((q): q is string => typeof q === "string" && q.trim().length > 10)
    .slice(0, 6);

  if (researchQuestions.length === 0) {
    researchQuestions = [
      "What is current local demand, seasonality and market size for this business and industry, in this specific location?",
      "Who are the main competitors for this business in this location, and how do they position and price themselves?",
      "What do customers typically pay for this product or service in this location, and what is the typical price range?",
      "What are current digital advertising cost benchmarks (cost per click / cost per lead) for this industry, on Google Ads and Meta Ads, in this location?",
      "Where do customers in this location typically search for or discover this kind of business, and are there licensing or regulatory requirements to be aware of?",
    ];
  }

  // Step 1: System-1 Specialist Blueprint Dispatch & Scoped Attachment (per-department)
  try {
    const briefText = currentBrief(job.id);
    for (const a of assignments) {
      const vaultRecommendation = await selectVaultAgent(briefText, a.departmentId);
      logVaultDispatchRecommendation(job.id, vaultRecommendation, a.departmentId);
      a.vaultRecommendation = vaultRecommendation;
    }
  } catch (err) {
    console.warn(`[orchestrator] vaultDispatch observation skipped for job ${job.id}:`, err);
  }

  const plan: Plan = {
    title: typeof parsed?.title === "string" && parsed.title.trim() ? parsed.title.trim().slice(0, 60) : job.title,
    assignments,
    researchQuestions,
  };

  const deptSteps = assignments.map((a) =>
    step({
      id: `dept:${a.departmentId}`,
      kind: "department",
      label: getDepartment(a.departmentId)!.name,
      departmentId: a.departmentId,
      activity: "Waiting for research",
      weight: WEIGHTS.departments / assignments.length,
      dependsOn: ["research"],
      output: undefined,
    }),
  );

  const current = getJob(job.id)!;
  const steps = current.steps.flatMap((s) =>
    s.id === "reconcile" ? [...deptSteps, { ...s, dependsOn: deptSteps.map((d) => d.id) }] : [s],
  );
  updateJob(job.id, {
    title: plan.title,
    steps,
    planSnapshot: { title: plan.title, assignments: plan.assignments },
  });

  updateStep(job.id, "plan", {
    status: "done",
    percent: 100,
    provider,
    instructionsHash: hashInstructions(HQ.file),
    activity: `Assigned ${assignments.length} departments`,
    finishedAt: now(),
    output: [
      "### Departments assigned",
      ...assignments.map((a) => `- **${getDepartment(a.departmentId)!.name}** — ${a.task}`),
      "",
      "### Research questions",
      ...(researchQuestions.length ? researchQuestions.map((q) => `- ${q}`) : ["- _(none produced)_"]),
    ].join("\n"),
  });

  logStrategicDecision({
    title: `HQ Assigned ${assignments.length} Departments for "${plan.title}"`,
    context: `Job ${job.id}`,
    decision: assignments.map((a) => `- **${getDepartment(a.departmentId)?.name}**: ${a.task}`).join("\n"),
    department: "GrowForge HQ",
  });
  logJobStateChange(getJob(job.id)!);

  return plan;
}

interface Dossier {
  text: string;
  sources: Source[];
  verified: boolean;
}

async function runResearch(job: Job, plan: Plan): Promise<Dossier> {
  // isResearchAvailable() is now always true — DuckDuckGo needs no key at
  // all, so it runs as a fallback even with zero providers configured; the
  // only real reason to skip entirely is HQ producing no questions to ask.
  if (!isResearchAvailable() || plan.researchQuestions.length === 0) {
    const reason = "HQ produced no research questions.";
    updateStep(job.id, "research", {
      status: "skipped",
      activity: "Skipped — output will be marked UNVERIFIED",
      output: reason,
      finishedAt: now(),
    });
    const dossier: Dossier = {
      verified: false,
      sources: [],
      text: `NO LIVE RESEARCH WAS AVAILABLE FOR THIS JOB. ${reason} You have no verified facts: every market figure, price, cost or benchmark you mention MUST be labeled "(estimate — verify)".`,
    };
    updateJob(job.id, { dossierSnapshot: dossier });
    return dossier;
  }

  const questions = plan.researchQuestions;
  updateStep(job.id, "research", { status: "active", percent: 0, activity: `Searching Google (0/${questions.length})`, startedAt: now() });

  const briefText = currentBrief(job.id);
  let completed = 0;
  let quotaError: string | null = null;
  const findings = await mapLimit(questions, 2, async (q) => {
    try {
      // Once one lookup hits a used-up quota, the rest will too — stop
      // spending requests on them.
      if (quotaError) throw new Error(quotaError);
      return await withRetry(() => researchQuestion(q, briefText));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/exceeded your current quota|billing/i.test(msg)) quotaError = msg;
      return { question: q, answer: `Research failed: ${msg}`, sources: [] } as ResearchFinding;
    } finally {
      completed++;
      updateStep(job.id, "research", {
        percent: Math.round((completed / questions.length) * 100),
        activity: `Searching Google (${completed}/${questions.length})`,
      });
    }
  });

  const sources: Source[] = [];
  const indexOf = (src: Source) => {
    const existing = sources.findIndex((s) => s.uri === src.uri);
    if (existing !== -1) return existing + 1;
    sources.push(src);
    return sources.length;
  };

  const sections = findings.map((f, i) => {
    const refs = f.sources.map((s) => `[${indexOf(s)}]`).join(" ");
    return `### Finding ${i + 1}: ${f.question}\n${f.answer}\n${refs ? `Sources: ${refs}` : "Sources: none returned — treat as unverified"}`;
  });
  const sourceIndex = sources.map((s, i) => `[${i + 1}] ${s.title} — ${s.uri}`).join("\n");
  const verified = sources.length > 0;

  updateStep(job.id, "research", {
    status: verified ? "done" : "error",
    percent: 100,
    activity: verified ? `${sources.length} sources gathered` : "Search returned no sources",
    sources,
    output: sections.join("\n\n"),
    error: verified ? undefined : "No search-grounded sources were returned.",
    finishedAt: now(),
  });
  const dossier: Dossier = {
    verified,
    sources,
    text: `${sections.join("\n\n")}\n\n### Source index\n${sourceIndex || "(none)"}`,
  };
  updateJob(job.id, { verified, dossierSnapshot: dossier });

  return dossier;
}

type Draft = { departmentId: string; name: string; output: string };

/**
 * Before drafting, a department gets up to 3 tool-loop steps to fill gaps
 * HQ's own research didn't cover (see runToolLoop in tools.ts) — a targeted
 * follow-up search, or a real connector call. Deliberately kept separate
 * from the actual draft-writing call below rather than making the draft
 * itself the tool loop's "final" answer: the loop's final text has to
 * survive being embedded inside a JSON string, which is a fine constraint
 * for a short status line but a real reliability risk for a 700-word
 * markdown essay full of quotes, numbers and line breaks — smaller local
 * models in particular tend to mangle that escaping. So the loop only ever
 * gathers; a normal unconstrained text completion writes the draft.
 *
 * requestApproval is intentionally omitted: there is no human in the loop
 * during an automated pipeline run, so call_connector — the one tool
 * requiring approval — safely no-ops (logged as "not approved") rather than
 * silently firing a real external request unattended. Wiring a real
 * approval queue for mid-run connector calls is a deliberate next step, not
 * done here.
 */
const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;
const APPROVAL_POLL_INTERVAL_MS = 3_000;

const CONSULTATION_TIMEOUT_MS = 10 * 60 * 1000;
const CONSULTATION_POLL_INTERVAL_MS = 3_000;

/** Blocks (via polling, since there's no live connection to a specific
 *  browser tab to push to) until an owner decides via the Approvals UI, or
 *  APPROVAL_TIMEOUT_MS passes — a job left unattended for 10 minutes auto-
 *  denies rather than hanging forever, consistent with the tool loop's own
 *  "no decision means don't" default. */
async function waitForApproval(approvalId: string): Promise<boolean> {
  const deadline = Date.now() + APPROVAL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const approval = getApproval(approvalId);
    if (!approval || approval.status !== "pending") return approval?.status === "approved";
    await sleep(APPROVAL_POLL_INTERVAL_MS);
  }
  markTimedOut(approvalId);
  return false;
}

/** Blocks until an operator answers a consultation question in the UI,
 *  or CONSULTATION_TIMEOUT_MS expires. */
async function waitForConsultation(consultationId: string): Promise<string | null> {
  const deadline = Date.now() + CONSULTATION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const consultation = getConsultation(consultationId);
    if (!consultation || consultation.status !== "pending") {
      return consultation?.status === "answered" ? (consultation.answer ?? null) : null;
    }
    await sleep(CONSULTATION_POLL_INTERVAL_MS);
  }
  markConsultationTimedOut(consultationId);
  return null;
}

async function gatherWithTools(
  jobId: string,
  stepId: string,
  stepLabel: string,
  dept: { id: string; name: string; file: string },
  task: string
): Promise<{ text: string; media: MediaItem[] }> {
  const result = await runToolLoop({
    systemPrompt: `${loadInstructions(dept.file)}\n\n---\n\nYou are the ${dept.name} department agent of GrowForge Digital, about to write your section of a client plan.`,
    task: `${task}\n\nIf this assignment explicitly asks you to actually create, activate, run, or otherwise operate a real system (an n8n/Zapier workflow, a connector) — call that exact tool now, with real arguments. Do not write a proposal or description instead of calling it. If the research dossier above is missing something you need, call a research tool instead. Otherwise finish immediately with action "final" and text "no additional research needed".`,
    tools: await getDefaultTools(dept.id),
    maxSteps: 4,
    maxTokens: 900,
    onActivity: (text) => updateStep(jobId, stepId, { activity: text }),
    requestApproval: async (toolName, args) => {
      const approval = createApproval({
        jobId,
        jobTitle: getJob(jobId)?.title ?? jobId,
        stepId,
        stepLabel,
        toolName,
        args,
      });
      updateStep(jobId, stepId, { activity: `Waiting for owner approval: ${toolName}` });
      return waitForApproval(approval.id);
    },
    requestConsultation: async (question, options) => {
      const consultation = createConsultation({
        jobId,
        jobTitle: getJob(jobId)?.title ?? jobId,
        stepId,
        stepLabel,
        departmentId: dept.name,
        question,
        options,
      });
      updateStep(jobId, stepId, { activity: `Waiting for operator input: ${question.slice(0, 45)}…` });
      return waitForConsultation(consultation.id);
    },
  });

  const media = result.calls.flatMap((c) => c.media ?? []);
  if (result.calls.length === 0) return { text: "", media: [] };
  const text = result.calls.map((c) => `- Called ${c.tool}(${JSON.stringify(c.args)}) → ${c.result}`).join("\n");
  return { text, media };
}

/** Runs (or re-runs) exactly the given assignments — a resume/revise only
 *  passes the subset that needs redoing; everything else keeps its
 *  existing draft untouched (see resumePipeline). */
async function runDepartments(jobId: string, assignments: Assignment[]): Promise<Draft[]> {
  const results = await mapLimit(assignments, 3, async (a) => {
    const dept = getDepartment(a.departmentId)!;
    const stepId = `dept:${a.departmentId}`;
    updateStep(jobId, stepId, { status: "active", percent: 10, activity: a.activity || "Drafting department section", startedAt: now() });

    const dossierText = getJob(jobId)!.dossierSnapshot?.text ?? "(no research dossier available)";
    const gatherTask = `CLIENT BRIEF:\n${currentBrief(jobId)}\n\nYOUR ASSIGNMENT FROM HQ:\n${a.task}\n\nRESEARCH DOSSIER:\n${dossierText}`;

    let extraFindings = "";
    let deptMedia: MediaItem[] = [];
    try {
      const gathered = await gatherWithTools(jobId, stepId, dept.name, dept, gatherTask);
      extraFindings = gathered.text;
      deptMedia = gathered.media;
    } catch (err) {
      console.error(`[orchestrator] tool-gathering failed for ${stepId}, drafting without it:`, err);
    }

    // Step 2: System-1 Specialist Blueprint Integration (Job-Scoped Context)
    let blueprintContext = "";
    const rec = a.vaultRecommendation ?? await selectVaultAgent(currentBrief(jobId), a.departmentId).catch(() => null);
    if (rec) {
      if (rec.band === "direct") {
        blueprintContext = formatBlueprintContext(rec);
      } else if (rec.band === "confirm") {
        try {
          const approval = createApproval({
            jobId,
            jobTitle: getJob(jobId)?.title ?? jobId,
            stepId,
            stepLabel: `${dept.name} Specialist Blueprint`,
            toolName: "apply_specialist_blueprint",
            args: {
              specialistId: rec.selectedAgentId,
              specialistName: rec.selectedAgentName,
              category: rec.selectedAgentCategory,
              confidence: rec.confidence,
              reason: `Laya confidence ${Math.round(rec.confidence * 100)}% fell in confirmation band (0.50-0.85). Requesting approval to apply specialist blueprint context.`,
            },
          });
          updateStep(jobId, stepId, { activity: `Awaiting blueprint approval: ${rec.selectedAgentName}` });
          const isApproved = await waitForApproval(approval.id);
          if (isApproved) {
            blueprintContext = formatBlueprintContext(rec);
          }
        } catch (err) {
          console.warn(`[orchestrator] Blueprint approval check failed for ${stepId}, continuing with generic department:`, err);
        }
      }
      // If band === "escalate" -> blueprintContext stays empty (generic department behavior)
    }

    updateStep(jobId, stepId, { percent: 40, activity: "Drafting department section" });
    const system = `${loadInstructions(dept.file)}${blueprintContext}\n\n---\n\nYou are the ${dept.name} department agent of GrowForge Digital, contributing your department's section to a client plan coordinated by GrowForge HQ. Stay inside your department's scope, and state what you need from other departments as "Needs from <Department>: ...".\n\n${EVIDENCE_RULES}`;
    const user = `${gatherTask}${extraFindings ? `\n\nADDITIONAL RESEARCH YOU GATHERED:\n${extraFindings}` : ""}\n\nWrite your section in Markdown: a short summary paragraph, then concrete recommendations with numbers, timeframes and priorities, then "Dependencies" and "Open questions". Maximum ~700 words.`;

    try {
      const { text, provider } = await ask(system, user, 2200);
      updateStep(jobId, stepId, {
        status: "done",
        percent: 100,
        activity: "Draft complete",
        output: text,
        media: deptMedia.length > 0 ? deptMedia : undefined,
        provider,
        instructionsHash: hashInstructions(dept.file),
        finishedAt: now(),
      });
      return { departmentId: a.departmentId, name: dept.name, output: text };
    } catch (err) {
      updateStep(jobId, stepId, { status: "error", activity: "Failed", error: err instanceof Error ? err.message : String(err), finishedAt: now() });
      return null;
    }
  });

  return results.filter((r): r is Draft => r !== null);
}

function draftsBlock(drafts: Draft[]): string {
  return drafts.map((d) => `===== ${d.name.toUpperCase()} DRAFT =====\n${d.output}`).join("\n\n");
}

async function runReconcile(jobId: string, drafts: Draft[], dossier: Dossier): Promise<string> {
  updateStep(jobId, "reconcile", { status: "active", percent: 20, activity: "Comparing drafts for conflicts and gaps", startedAt: now() });

  const system = `${loadInstructions(HQ.file)}\n\n---\n\nYou are GrowForge HQ chairing the cross-department review of a client plan.\n\n${EVIDENCE_RULES}`;
  const user = `CLIENT BRIEF:\n${currentBrief(jobId)}\n\nDEPARTMENT DRAFTS:\n${draftsBlock(drafts)}\n\nRESEARCH SOURCE INDEX:\n${dossier.sources.map((s, i) => `[${i + 1}] ${s.title}`).join("\n") || "(no verified sources)"}

Run the review as a record of the team discussion, in Markdown:
### Conflicts
For each place two departments disagree (budgets, pricing, timelines, channel priority, targeting): "**Dept A ↔ Dept B:** what each proposed → **Decision:** the resolution and why."
### Dependencies
Who needs what from whom, in what order.
### Gaps
What the brief needs that no department covered, and who should own it.
### Agreed direction
5-8 bullet decisions the final plan must follow.`;

  const { text, provider } = await ask(system, user, 1800);
  updateStep(jobId, "reconcile", { status: "done", percent: 100, activity: "Conflicts resolved", output: text, provider, instructionsHash: hashInstructions(HQ.file), finishedAt: now() });
  logStrategicDecision({
    title: `HQ Reconciled Team Direction for Job ${jobId}`,
    context: "Cross-Department Review",
    decision: text.slice(0, 800),
    department: "GrowForge HQ",
  });
  logJobStateChange(getJob(jobId)!);
  return text;
}

async function runQa(jobId: string, drafts: Draft[], review: string, dossier: Dossier): Promise<string> {
  updateStep(jobId, "qa", { status: "active", percent: 20, activity: "Checking every claim against sources", startedAt: now() });
  logJobStateChange(getJob(jobId)!);

  const system = `${loadInstructions(QA.file)}\n\n---\n\nYou are GrowForge's independent QA reviewer. You do not rewrite the plan; you find what is wrong with it.\n\n${EVIDENCE_RULES}`;
  const user = `CLIENT BRIEF:\n${currentBrief(jobId)}\n\nRESEARCH DOSSIER:\n${dossier.text}\n\nDEPARTMENT DRAFTS:\n${draftsBlock(drafts)}\n\nHQ TEAM REVIEW:\n${review}

Produce, in Markdown:
**Verdict:** PASS, PASS WITH FIXES, or NEEDS WORK
### Unsupported claims
Every figure or factual claim that has no [n] citation and is not labeled "(estimate — verify)". Quote it.
### Contradictions
### Missing essentials
Anything the client brief asked for that the plan does not answer.
### Required fixes
Numbered, specific instructions for the final plan.`;

  const { text, provider } = await ask(system, user, 1500);
  const verdict = /NEEDS WORK/i.test(text) ? "Needs work — fixes required" : /WITH FIXES/i.test(text) ? "Pass with fixes" : "Passed";
  updateStep(jobId, "qa", { status: "done", percent: 100, activity: verdict, output: text, provider, instructionsHash: hashInstructions(QA.file), finishedAt: now() });
  logStrategicDecision({
    title: `QA Audit Verdict: ${verdict} for Job ${jobId}`,
    context: "Quality Assurance",
    decision: text.slice(0, 800),
    department: "Quality Assurance",
  });
  logJobStateChange(getJob(jobId)!);
  return text;
}

async function runFinal(jobId: string, drafts: Draft[], review: string, qa: string, dossier: Dossier): Promise<string> {
  updateStep(jobId, "final", { status: "active", percent: 15, activity: "Writing the consolidated plan", startedAt: now() });
  logJobStateChange(getJob(jobId)!);

  const system = `${loadInstructions(HQ.file)}\n\n---\n\nYou are GrowForge HQ consolidating departmental work into one client-ready plan.\n\n${EVIDENCE_RULES}`;
  const user = `CLIENT BRIEF:\n${currentBrief(jobId)}\n\nRESEARCH DOSSIER:\n${dossier.text}\n\nDEPARTMENT DRAFTS:\n${draftsBlock(drafts)}\n\nTEAM REVIEW DECISIONS:\n${review}\n\nQA REVIEW (apply every required fix):\n${qa}

Write the complete final plan in Markdown. Follow the team review's agreed direction and apply every QA fix. Keep inline [n] citations exactly as numbered in the dossier. Do NOT write a sources list — it is appended automatically.
Choose sections that fit this brief. For a business launch or growth brief, cover at minimum: Executive summary · Market snapshot · Ideal customers · Offer & pricing · Lead generation plan · Digital presence · Paid advertising plan with monthly budget · Budget summary table · 90-day action plan · KPIs & targets · Risks · Open questions for the client.`;

  const { text, provider } = await ask(system, user, 6000);

  const banner = dossier.verified
    ? `> **Research:** ${dossier.sources.length} live sources`
    : `> **UNVERIFIED** — no live research ran for this plan. Every figure below is an estimate and must be checked before it is used. Add a research-capable API key (Gemini, OpenAI, Anthropic, OpenRouter, etc.) in Settings → Integrations, or wait if DuckDuckGo's no-key fallback is temporarily blocked, and re-run for a sourced version.`;
  const sourceList = dossier.sources.length
    ? `\n\n---\n\n## Sources\n${dossier.sources.map((s, i) => `${i + 1}. [${s.title}](${s.uri})`).join("\n")}`
    : "";
  const finalOutput = `${banner}\n\n${text.trim()}${sourceList}`;

  const currentJob = getJob(jobId);
  const allJobMedia = (currentJob?.steps ?? []).flatMap((s) => s.media ?? []);
  const uniqueMedia = Array.from(new Map(allJobMedia.map((m) => [m.url, m])).values());

  updateStep(jobId, "final", {
    status: "done",
    percent: 100,
    activity: "Plan ready",
    output: finalOutput,
    media: uniqueMedia.length > 0 ? uniqueMedia : undefined,
    provider,
    instructionsHash: hashInstructions(HQ.file),
    finishedAt: now(),
  });
  logJobStateChange(getJob(jobId)!);
  return finalOutput;
}

/**
 * Resumable pipeline runner — used both for a brand-new job (everything is
 * "pending") and for a revise-triggered redo (only the steps reviseJob()
 * reset to "pending" actually re-run; everything else reuses its existing,
 * already-approved output). A step's status is the single source of truth
 * for "does this need to run" — there is no separate resume/fresh code path.
 */
async function resumePipeline(jobId: string): Promise<void> {
  const stepStatus = (id: string) => getJob(jobId)!.steps.find((s) => s.id === id)?.status;

  const plan: Plan =
    stepStatus("plan") === "done"
      ? { ...getJob(jobId)!.planSnapshot!, researchQuestions: [] }
      : await runPlan(getJob(jobId)!);

  const dossier: Dossier =
    stepStatus("research") === "pending" ? await runResearch(getJob(jobId)!, plan) : getJob(jobId)!.dossierSnapshot!;

  const pendingAssignments = plan.assignments.filter((a) => stepStatus(`dept:${a.departmentId}`) === "pending");
  updateStep(jobId, "reconcile", { activity: `Waiting for ${plan.assignments.length} department drafts` });
  logJobStateChange(getJob(jobId)!);
  const freshDrafts = pendingAssignments.length > 0 ? await runDepartments(jobId, pendingAssignments) : [];

  const reusedDrafts: Draft[] = getJob(jobId)!
    .steps.filter((s): s is JobStep & { departmentId: string } => s.kind === "department" && s.status === "done" && !!s.output)
    .map((s) => ({ departmentId: s.departmentId, name: getDepartment(s.departmentId)!.name, output: s.output! }));
  const drafts = [...reusedDrafts, ...freshDrafts];
  if (drafts.length === 0) throw new Error("Every department failed to produce a draft.");

  const review = stepStatus("reconcile") === "pending" ? await runReconcile(jobId, drafts, dossier) : getJob(jobId)!.steps.find((s) => s.id === "reconcile")!.output!;
  const qa = stepStatus("qa") === "pending" ? await runQa(jobId, drafts, review, dossier) : getJob(jobId)!.steps.find((s) => s.id === "qa")!.output!;
  const finalOutput =
    stepStatus("final") === "pending" ? await runFinal(jobId, drafts, review, qa, dossier) : getJob(jobId)!.finalOutput!;

  const currentJob = getJob(jobId);
  const allJobMedia = (currentJob?.steps ?? []).flatMap((s) => s.media ?? []);
  const uniqueMedia = Array.from(new Map(allJobMedia.map((m) => [m.url, m])).values());

  updateJob(jobId, {
    status: "done",
    finalOutput,
    media: uniqueMedia.length > 0 ? uniqueMedia : undefined,
    finishedAt: now(),
  });
  logJobStateChange(getJob(jobId)!);
}

/**
 * Handles a user's "change this" request against a job that's already
 * launched:
 *
 * - RUNNING: the change can't safely interrupt an in-flight model call, so
 *   it's appended as a live note (see currentBrief) — every stage that
 *   hasn't started its own model call yet will read it. Recorded as
 *   "queued", not silently dropped.
 * - DONE / ERROR: HQ is asked which already-finished stages the change
 *   actually invalidates; only those (and whatever synthesizes from them)
 *   get reset and redone — untouched department drafts are reused as-is.
 */
export async function reviseJob(jobId: string, message: string): Promise<Job> {
  const job = getJob(jobId);
  if (!job) throw new Error("Job not found.");

  if (job.createdBy) {
    recordLearnedObservation(job.createdBy, `Revision nuance: "${message.slice(0, 120)}"`);
    recordExplicitRejection(job.createdBy, message);
  }

  if (job.status === "running") {
    addLiveNote(jobId, message);
    addRevisionEntry(jobId, { message, effect: "queued" });
    return getJob(jobId)!;
  }

  const deptSteps = job.steps.filter((s) => s.kind === "department");
  const catalog = deptSteps.map((s) => `- ${s.id}: ${s.label}${s.output ? ` — current draft:\n${s.output.slice(0, 600)}` : ""}`).join("\n\n");
  const system = `${loadInstructions(HQ.file)}\n\n---\n\nYou are GrowForge HQ deciding the blast radius of a client-requested change to an already-completed plan. Respond with ONLY a JSON object, no prose.`;
  const user = `ORIGINAL BRIEF:\n${job.brief}\n\nCLIENT'S REQUESTED CHANGE:\n${message}\n\nEXISTING DEPARTMENT WORK:\n${catalog}\n\nDecide which existing department drafts this change actually invalidates versus which stay valid as-is. Keep the blast radius as SMALL as possible — every redo costs time and money:
- Redo a department only if its concrete recommendations would materially change. Read its current draft to judge.
- Budget changes usually affect Finance & Operations and the paid-advertising departments only.
- Ad-channel or targeting changes usually affect Paid Media & Performance Advertising and Marketing & Brand Strategy only.
- Digital Design & User Experience, Web Development & Engineering, and AI Systems & Intelligent Automation rarely change for budget, channel or messaging changes.
- The team review, QA and final plan are always regenerated automatically — do not list them.
Redo research only if the change shifts location, industry, or target market — never for budget, tone or channel tweaks.
Return JSON exactly in this shape:
{
  "redoResearch": boolean,
  "redoDepartmentIds": ["<step id from the list above, e.g. dept:marketing>"],
  "briefAddendum": "one paragraph merging the change into the brief for future reference"
}`;

  const { text } = await ask(system, user, 1200);
  const parsed = extractJson(text) as { redoResearch?: boolean; redoDepartmentIds?: string[]; briefAddendum?: string } | null;

  const redoResearch = Boolean(parsed?.redoResearch);
  const validDeptIds = new Set(deptSteps.map((s) => s.id));
  const redoDeptIds = (Array.isArray(parsed?.redoDepartmentIds) ? parsed.redoDepartmentIds : []).filter((id): id is string => validDeptIds.has(id));

  // A change to research invalidates every department (they all read the
  // dossier); a change to specific departments only invalidates those.
  const idsToReset = new Set<string>(["reconcile", "qa", "final"]);
  if (redoResearch) {
    idsToReset.add("research");
    deptSteps.forEach((s) => idsToReset.add(s.id));
  } else if (redoDeptIds.length > 0) {
    redoDeptIds.forEach((id) => idsToReset.add(id));
  } else {
    // HQ found nothing to regenerate — still worth a fresh final pass so
    // the change is reflected in the document even if no draft changes.
  }

  const addendum = typeof parsed?.briefAddendum === "string" && parsed.briefAddendum.trim() ? parsed.briefAddendum.trim() : message;
  const reset = resetStepsForRedo(jobId, [...idsToReset]);
  addLiveNote(jobId, addendum);
  addRevisionEntry(jobId, { message, effect: "reran", redoneSteps: reset });

  void resumePipeline(jobId).catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[orchestrator] revise on job ${jobId} failed:`, err);
    getJob(jobId)?.steps.filter((s) => s.status === "active").forEach((s) => updateStep(jobId, s.id, { status: "error", error: msg, finishedAt: now() }));
    updateJob(jobId, { status: "error", error: msg, finishedAt: now() });
  });

  return getJob(jobId)!;
}
