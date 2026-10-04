import { NextResponse } from "next/server";
import { listAgents } from "@/lib/agentStore";
import { agents as templateAgents } from "@/lib/agents";
import { isBetaMode } from "@/lib/beta/access";
import { isPublicPreviewMode } from "@/lib/previewMode";

const SYNTHETIC_DEMO_AGENTS = [
  { id: "demo-assistant", name: "Demo Assistant", role: "Assistant", division: "Demo", description: "A generic assistant agent for sample workflows.", status: "idle", lastRun: "Never" },
  { id: "demo-researcher", name: "Demo Research Agent", role: "Researcher", division: "Demo", description: "A generic research agent for sample searches.", status: "idle", lastRun: "Never" },
  { id: "demo-writer", name: "Demo Writer", role: "Copywriter", division: "Demo", description: "A generic writer agent for drafting sample content.", status: "idle", lastRun: "Never" },
  { id: "demo-qa", name: "Demo QA Reviewer", role: "Reviewer", division: "Demo", description: "A generic review agent for checking sample deliverables.", status: "idle", lastRun: "Never" },
];

export async function GET(req: Request) {
  // Private beta: fresh testers start with 0 agents. Synthetic demo agents are served only if ?demo=true.
  if (isBetaMode()) {
    const url = new URL(req.url);
    const isDemo = url.searchParams.get("demo") === "true" || url.searchParams.get("demo") === "1";
    return NextResponse.json({ agents: isDemo ? SYNTHETIC_DEMO_AGENTS : [] });
  }

  // Public preview mode: serve built-in templates.
  if (isPublicPreviewMode()) {
    return NextResponse.json({ agents: templateAgents.map((a) => ({ ...a })) });
  }
  return NextResponse.json({ agents: listAgents() });
}
