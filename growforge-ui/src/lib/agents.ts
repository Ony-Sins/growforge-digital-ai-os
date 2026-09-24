export type AgentStatus = "active" | "success" | "error" | "idle";

export interface Agent {
  id: string;
  name: string;
  division: string;
  status: AgentStatus;
  lastRun: string;
  icon: string;
  hub?: boolean;
  /** One-line role summary, sourced from .claude/agents/*.md frontmatter — used as
   *  routing context for the AI intent router as well as UI copy. */
  description: string;
}

// Every agent below starts "idle" / "Never run" — none of these has done
// real work yet. Real status and lastRun only get set once /api/agents/[id]/run
// actually dispatches it (see agentStore.ts's runAgent), so what's shown is
// always genuine, not a fabricated activity history seeded at boot.
export const agents: Agent[] = [
  {
    id: "agents-orchestrator",
    name: "Agents Orchestrator",
    division: "Specialized",
    status: "idle",
    lastRun: "Never run",
    icon: "Bot",
    hub: true,
    description:
      "General-purpose planning and analysis agent for quick, one-off questions and write-ups — text only, no ability to actually dispatch or coordinate other agents or take real action. For anything that needs real work done, use the AI Assistant to launch a full project instead.",
  },
  {
    id: "frontend-developer",
    name: "Frontend Developer",
    division: "Engineering",
    status: "idle",
    lastRun: "Never run",
    icon: "Code2",
    description:
      "Expert frontend developer for React/Vue/Angular UI implementation, components, styling, and performance optimization.",
  },
  {
    id: "whimsy-injector",
    name: "Whimsy Injector",
    division: "Design",
    status: "idle",
    lastRun: "Never run",
    icon: "Sparkles",
    description:
      "Adds personality, delight, and playful micro-interactions to brand and product experiences.",
  },
  {
    id: "ui-finish-gate-reviewer",
    name: "UI Finish Gate Reviewer",
    division: "Design",
    status: "idle",
    lastRun: "Never run",
    icon: "ShieldCheck",
    description:
      "Reviews UI before it ships, catching generic/interchangeable design against a written design contract and finish gate.",
  },
  {
    id: "outbound-strategist",
    name: "Outbound Strategist",
    division: "Sales",
    status: "idle",
    lastRun: "Never run",
    icon: "Send",
    description:
      "Designs signal-based, multi-channel outbound prospecting sequences and ICP-driven personalization to build pipeline.",
  },
  {
    id: "offer-and-lead-gen-strategist",
    name: "Offer & Lead Gen Strategist",
    division: "Sales",
    status: "idle",
    lastRun: "Never run",
    icon: "Target",
    description:
      "Designs offers and lead magnets, and plans multi-channel lead generation for top-of-funnel growth.",
  },
  {
    id: "reality-checker",
    name: "Reality Checker",
    division: "Testing",
    status: "idle",
    lastRun: "Never run",
    icon: "FlaskConical",
    description:
      "Final integration testing and evidence-based production-readiness certification — defaults to NEEDS WORK until proven.",
  },
];

// Order below intentionally matches the dashboard's actual top-to-bottom
// scroll order (see Workspace.tsx / sectionIdFor) — nav position N should
// always correspond to the Nth section on the page. If you add or reorder a
// section in Workspace.tsx, update this list (and sectionIdFor) to match.
export const navSections = [
  {
    // "AI Assistant" deliberately removed as a sidebar nav item — chat is
    // always visible (docked right panel or maximized), never a scrollable
    // dashboard section, so clicking it did nothing but re-select the
    // already-active default view. The logo/header "back to dashboard"
    // buttons remain the way home; the chat panel itself is the way to chat.
    // "AI Brain" and "Profile" deliberately removed as separate nav items —
    // both open the exact same User Profile overlay the header's avatar
    // button already opens (with its own in-overlay Brain/Profile tabs), so
    // keeping three entry points into one overlay was pure duplication.
    label: "Agents",
    items: [{ id: "workflows", label: "Live Projects", icon: "Workflow" }],
  },
  {
    label: "Overview",
    items: [
      { id: "vault", label: "Vault Library", icon: "Library" },
      { id: "activity", label: "Real-time Activity", icon: "Activity" },
      { id: "roster", label: "Agent Roster", icon: "Bot" },
    ],
  },
  {
    // Terminal and Execution Logs deliberately removed from the sidebar —
    // they're developer surfaces that made the product read as complex, and
    // a business user never needs a terminal. Both still exist inside the
    // Admin Drawer (header → Admin Drawer) for debugging; they're just not
    // presented as everyday navigation any more.
    label: "Operations",
    items: [{ id: "settings", label: "Settings", icon: "Settings" }],
  },
] as const;
