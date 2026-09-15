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

export const agents: Agent[] = [
  {
    id: "agents-orchestrator",
    name: "Agents Orchestrator",
    division: "Specialized",
    status: "active",
    lastRun: "running now",
    icon: "Bot",
    hub: true,
    description:
      "Autonomous pipeline manager that orchestrates the entire development workflow, coordinating other agents from spec to ship.",
  },
  {
    id: "frontend-developer",
    name: "Frontend Developer",
    division: "Engineering",
    status: "active",
    lastRun: "running now",
    icon: "Code2",
    description:
      "Expert frontend developer for React/Vue/Angular UI implementation, components, styling, and performance optimization.",
  },
  {
    id: "whimsy-injector",
    name: "Whimsy Injector",
    division: "Design",
    status: "idle",
    lastRun: "2h ago",
    icon: "Sparkles",
    description:
      "Adds personality, delight, and playful micro-interactions to brand and product experiences.",
  },
  {
    id: "ui-finish-gate-reviewer",
    name: "UI Finish Gate Reviewer",
    division: "Design",
    status: "success",
    lastRun: "12m ago",
    icon: "ShieldCheck",
    description:
      "Reviews UI before it ships, catching generic/interchangeable design against a written design contract and finish gate.",
  },
  {
    id: "outbound-strategist",
    name: "Outbound Strategist",
    division: "Sales",
    status: "success",
    lastRun: "31m ago",
    icon: "Send",
    description:
      "Designs signal-based, multi-channel outbound prospecting sequences and ICP-driven personalization to build pipeline.",
  },
  {
    id: "offer-and-lead-gen-strategist",
    name: "Offer & Lead Gen Strategist",
    division: "Sales",
    status: "idle",
    lastRun: "1d ago",
    icon: "Target",
    description:
      "Designs offers and lead magnets, and plans multi-channel lead generation for top-of-funnel growth.",
  },
  {
    id: "reality-checker",
    name: "Reality Checker",
    division: "Testing",
    status: "error",
    lastRun: "4m ago",
    icon: "FlaskConical",
    description:
      "Final integration testing and evidence-based production-readiness certification — defaults to NEEDS WORK until proven.",
  },
];

export const navSections = [
  {
    label: "Assistant",
    items: [{ id: "chat", label: "AI Assistant", icon: "MessageSquare" }],
  },
  {
    label: "Overview",
    items: [
      { id: "dashboard", label: "Dashboard", icon: "LayoutDashboard" },
      { id: "activity", label: "Activity", icon: "Activity" },
    ],
  },
  {
    label: "Agents",
    items: [
      { id: "roster", label: "Agent Roster", icon: "Bot" },
      { id: "vault", label: "Vault Library", icon: "Library" },
      { id: "workflows", label: "Live Projects", icon: "Workflow" },
    ],
  },
  {
    label: "Operations",
    items: [
      { id: "terminal", label: "Terminal", icon: "Terminal" },
      { id: "logs", label: "Execution Logs", icon: "ScrollText" },
      { id: "settings", label: "Settings", icon: "Settings" },
    ],
  },
] as const;
