import { chatComplete } from "@/lib/llm";
import { DEPARTMENTS, HQ, QA, getDepartment, loadInstructions } from "@/lib/departments";
import { isResearchAvailable, researchQuestion, type ResearchFinding, type Source } from "@/lib/research";
import { runToolLoop, getDefaultTools } from "@/lib/tools";
import { formatUserMemoryPrompt, recordLearnedObservation, recordExplicitRejection } from "@/lib/userMemory";
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

const EVIDENCE_RULES = `EVIDENCE RULES (non-negotiable):
1. The RESEARCH DOSSIER is your only source of facts about the market, prices, costs, ad benchmarks, competitors, platforms and regulations. When you use one, cite it inline as [n] using the dossier's source numbers.
2. Never invent statistics, prices, percentages, market sizes, or named companies. If the plan needs a number that is not in the dossier, either label it "(estimate — verify)" or list it as an open question.
3. You PROPOSE; you never EXECUTE. Recommend budgets and actions — never imply money has been spent or commitments made.
4. Be specific to this exact client. Advice that would apply unchanged to any business is not acceptable.`;

interface Assignment {
  departmentId: string;
  task: string;
  activity: string;
}

interface Plan {
  title: string;
  assignments: Assignment[];
  researchQuestions: string[];
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
  return withRetry(() => chatComplete(system, [{ role: "user", content: user }], { maxTokens, preferCloud: true }));
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

  void resumePipeline(job.id).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[orchestrator] job ${job.id} failed:`, err);
    const current = getJob(job.id);
    current?.steps.filter((s) => s.status === "active").forEach((s) => updateStep(job.id, s.id, { status: "error", error: message, finishedAt: now() }));
    updateJob(job.id, { status: "error", error: message, finishedAt: now() });
  });

  return job;
}

async function runPlan(job: Job): Promise<Plan> {
  updateStep(job.id, "plan", { status: "active", percent: 10, activity: "Reading the brief and assigning departments", startedAt: now() });

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
- Assign 3 to 6 departments — only those the brief genuinely needs.`;

  const { text, provider } = await ask(system, user, 2200);
  const parsed = extractJson(text) as Partial<Plan> | null;

  const seen = new Set<string>();
  let assignments = (Array.isArray(parsed?.assignments) ? parsed.assignments : [])
    .filter((a): a is Assignment => !!a && typeof a.departmentId === "string" && !!getDepartment(a.departmentId))
    .filter((a) => (seen.has(a.departmentId) ? false : (seen.add(a.departmentId), true)))
    .slice(0, 6);
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

  // A model occasionally omits this field despite instructions (seen with
  // Gemini truncating/reordering JSON keys). Research is core to the
  // "authentic, verified data" requirement, so it must never be silently
  // skipped just because one field came back empty — fall back to a fixed
  // set of generically useful questions, grounded by the brief text
  // researchQuestion() passes alongside each one.
  if (researchQuestions.length === 0) {
    researchQuestions = [
      "What is current local demand, seasonality and market size for this business and industry, in this specific location?",
      "Who are the main competitors for this business in this location, and how do they position and price themselves?",
      "What do customers typically pay for this product or service in this location, and what is the typical price range?",
      "What are current digital advertising cost benchmarks (cost per click / cost per lead) for this industry, on Google Ads and Meta Ads, in this location?",
      "Where do customers in this location typically search for or discover this kind of business, and are there licensing or regulatory requirements to be aware of?",
    ];
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

  return plan;
}

interface Dossier {
  text: string;
  sources: Source[];
  verified: boolean;
}

async function runResearch(job: Job, plan: Plan): Promise<Dossier> {
  if (!isResearchAvailable() || plan.researchQuestions.length === 0) {
    const reason = !isResearchAvailable()
      ? "No Gemini API key is configured, so live Google research could not run."
      : "HQ produced no research questions.";
    updateStep(job.id, "research", {
      status: "skipped",
      activity: "Skipped — output will be marked UNVERIFIED",
      output: `${reason}\n\nAdd a Gemini key in **Settings → Integrations** to enable search-grounded research with real source links.`,
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
async function gatherWithTools(jobId: string, stepId: string, dept: { name: string; file: string }, task: string): Promise<string> {
  const result = await runToolLoop({
    systemPrompt: `${loadInstructions(dept.file)}\n\n---\n\nYou are the ${dept.name} department agent of GrowForge Digital, about to write your section of a client plan.`,
    task: `${task}\n\nOnly call a tool if the research dossier above is genuinely missing something you need to give specific, accurate advice — otherwise finish immediately with action "final" and text "no additional research needed".`,
    tools: getDefaultTools(),
    maxSteps: 3,
    maxTokens: 500,
    onActivity: (text) => updateStep(jobId, stepId, { activity: text }),
  });

  if (result.calls.length === 0) return "";
  return result.calls.map((c) => `- Called ${c.tool}(${JSON.stringify(c.args)}) → ${c.result}`).join("\n");
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
    try {
      extraFindings = await gatherWithTools(jobId, stepId, dept, gatherTask);
    } catch (err) {
      console.error(`[orchestrator] tool-gathering failed for ${stepId}, drafting without it:`, err);
    }

    updateStep(jobId, stepId, { percent: 40, activity: "Drafting department section" });
    const system = `${loadInstructions(dept.file)}\n\n---\n\nYou are the ${dept.name} department agent of GrowForge Digital, contributing your department's section to a client plan coordinated by GrowForge HQ. Stay inside your department's scope, and state what you need from other departments as "Needs from <Department>: ...".\n\n${EVIDENCE_RULES}`;
    const user = `${gatherTask}${extraFindings ? `\n\nADDITIONAL RESEARCH YOU GATHERED:\n${extraFindings}` : ""}\n\nWrite your section in Markdown: a short summary paragraph, then concrete recommendations with numbers, timeframes and priorities, then "Dependencies" and "Open questions". Maximum ~700 words.`;

    try {
      const { text, provider } = await ask(system, user, 2200);
      updateStep(jobId, stepId, { status: "done", percent: 100, activity: "Draft complete", output: text, provider, finishedAt: now() });
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
  updateStep(jobId, "reconcile", { status: "done", percent: 100, activity: "Conflicts resolved", output: text, provider, finishedAt: now() });
  return text;
}

async function runQa(jobId: string, drafts: Draft[], review: string, dossier: Dossier): Promise<string> {
  updateStep(jobId, "qa", { status: "active", percent: 20, activity: "Checking every claim against sources", startedAt: now() });

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
  updateStep(jobId, "qa", { status: "done", percent: 100, activity: verdict, output: text, provider, finishedAt: now() });
  return text;
}

async function runFinal(jobId: string, drafts: Draft[], review: string, qa: string, dossier: Dossier): Promise<string> {
  updateStep(jobId, "final", { status: "active", percent: 15, activity: "Writing the consolidated plan", startedAt: now() });

  const system = `${loadInstructions(HQ.file)}\n\n---\n\nYou are GrowForge HQ consolidating departmental work into one client-ready plan.\n\n${EVIDENCE_RULES}`;
  const user = `CLIENT BRIEF:\n${currentBrief(jobId)}\n\nRESEARCH DOSSIER:\n${dossier.text}\n\nDEPARTMENT DRAFTS:\n${draftsBlock(drafts)}\n\nTEAM REVIEW DECISIONS:\n${review}\n\nQA REVIEW (apply every required fix):\n${qa}

Write the complete final plan in Markdown. Follow the team review's agreed direction and apply every QA fix. Keep inline [n] citations exactly as numbered in the dossier. Do NOT write a sources list — it is appended automatically.
Choose sections that fit this brief. For a business launch or growth brief, cover at minimum: Executive summary · Market snapshot · Ideal customers · Offer & pricing · Lead generation plan · Digital presence · Paid advertising plan with monthly budget · Budget summary table · 90-day action plan · KPIs & targets · Risks · Open questions for the client.`;

  const { text, provider } = await ask(system, user, 6000);

  const banner = dossier.verified
    ? `> **Status:** PROPOSAL — pending CEO approval · Research: ${dossier.sources.length} live sources`
    : `> **UNVERIFIED** — no live research ran for this plan. Every figure below is an estimate and must be checked before it is used. Add a Gemini key in Settings → Integrations and re-run for a sourced version.\n>\n> **Status:** PROPOSAL — pending CEO approval`;
  const sourceList = dossier.sources.length
    ? `\n\n---\n\n## Sources\n${dossier.sources.map((s, i) => `${i + 1}. [${s.title}](${s.uri})`).join("\n")}`
    : "";
  const finalOutput = `${banner}\n\n${text.trim()}${sourceList}`;

  updateStep(jobId, "final", { status: "done", percent: 100, activity: "Plan ready", output: finalOutput, provider, finishedAt: now() });
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

  updateJob(jobId, { status: "done", finalOutput, finishedAt: now() });
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
- Budget changes usually affect Finance & Ops and the paid-advertising departments only.
- Ad-channel or targeting changes usually affect Meta Ads and Marketing only.
- Web Design, Web Development and AI Automation rarely change for budget, channel or messaging changes.
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
