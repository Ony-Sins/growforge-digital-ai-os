import {
  createConsultation,
  getConsultation,
  listPendingConsultations,
  answerConsultation,
  markConsultationTimedOut,
} from "../src/lib/consultationStore";
import { askOperatorTool, setConsultationHandler } from "../src/lib/tools/askOperator";
import { getDefaultTools } from "../src/lib/tools";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

async function runTests() {
  console.log("=== Suite 1: Consultation Store Lifecycle ===");
  const consultation = createConsultation({
    jobId: "test-job-1",
    jobTitle: "Alpha Launch",
    stepId: "dept:marketing",
    stepLabel: "Marketing",
    question: "Should we prioritize LinkedIn Ads or Google Search Ads for B2B ICP?",
    options: ["LinkedIn Ads", "Google Search Ads", "Split 50/50"],
  });

  assert(consultation.status === "pending", "Consultation initializes with 'pending' status");
  assert(consultation.options?.length === 3, "Consultation stores options correctly");

  const pendingList = listPendingConsultations();
  assert(pendingList.some((c) => c.id === consultation.id), "Pending consultation appears in listPendingConsultations()");

  const answered = answerConsultation(consultation.id, "LinkedIn Ads", "operator@growforge.ai");
  assert(answered === true, "answerConsultation returns true on pending consultation");

  const updated = getConsultation(consultation.id);
  assert(updated?.status === "answered", "Status is updated to 'answered'");
  assert(updated?.answer === "LinkedIn Ads", "Answer is stored accurately");
  assert(updated?.answeredBy === "operator@growforge.ai", "answeredBy is recorded accurately");

  const doubleAnswer = answerConsultation(consultation.id, "Second answer", "other@growforge.ai");
  assert(doubleAnswer === false, "Double answer on non-pending consultation returns false");

  console.log("\n=== Suite 2: Timeout Handling ===");
  const timeoutConsultation = createConsultation({
    jobId: "test-job-2",
    jobTitle: "Beta Build",
    stepId: "dept:web-dev",
    stepLabel: "Web Development",
    question: "Should we deploy to Vercel or AWS ECS?",
  });
  markConsultationTimedOut(timeoutConsultation.id);
  const timedOut = getConsultation(timeoutConsultation.id);
  assert(timedOut?.status === "timed_out", "markConsultationTimedOut updates status to 'timed_out'");

  console.log("\n=== Suite 3: ask_operator Tool Execution ===");
  // Test without active handler (fallback mode)
  setConsultationHandler(null);
  const fallbackRes = await askOperatorTool.execute({
    question: "What is the primary target demographic?",
  });
  assert(fallbackRes.ok === true, "Tool returns ok:true in fallback mode");
  assert(fallbackRes.output.includes("Operator consultation is currently running in automated mode"), "Fallback notice included");

  // Test with active consultation handler
  setConsultationHandler(async (q) => {
    assert(q.includes("pricing"), "Handler receives the question");
    return "$4,500/month retainer";
  });
  const activeRes = await askOperatorTool.execute({
    question: "What pricing tier should we recommend?",
    options: ["$2,500", "$4,500"],
  });
  assert(activeRes.ok === true, "Tool returns ok:true when answered by handler");
  assert(activeRes.output.includes("$4,500/month retainer"), "Operator answer is returned in output");
  setConsultationHandler(null);

  console.log("\n=== Suite 4: Tool Catalog Registration ===");
  const defaultTools = await getDefaultTools();
  assert(defaultTools.some((t) => t.name === "ask_operator"), "ask_operator tool is registered in getDefaultTools()");
  assert(defaultTools.some((t) => t.name === "manage_n8n_workflow"), "manage_n8n_workflow tool is registered in getDefaultTools()");

  console.log(`\n========================================`);
  console.log(`Consultation Flow Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Test run error:", err);
  process.exit(1);
});
