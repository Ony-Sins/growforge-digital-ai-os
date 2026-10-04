import type { GraphCategory, GraphLink, GraphNode, SpatialGraphData } from "@/lib/spatial/obsidianReader";

/**
 * 100% Synthetic Demo Graph for the private beta (BETA_MODE=true when demo is explicitly requested).
 *
 * Contains ONLY neutral, synthetic sample records (Sample Workspace, Demo Assistant, Demo Research Agent,
 * Demo Writer, Sample Notes) to showcase spatial graph physics, node selection, sidecards, and links.
 *
 * It NEVER imports or exposes GrowForge internal architecture, internal department divisions,
 * internal agent templates, blueprint catalogs, or local repository taxonomy.
 */

const DATASET_DATE = "2026-09-30T00:00:00.000Z";
const DEMO_NOTICE = "> **Demo workspace · Synthetic data** — generic sample nodes to demonstrate spatial graph navigation, node interaction, and connections.";

const PALETTE = {
  guides: { label: "Demo Guides", color: "#FBBF24" },
  agents: { label: "Demo Agents", color: "#F472B6" },
  notes: { label: "Sample Notes", color: "#38BDF8" },
} as const;
type DemoSource = keyof typeof PALETTE;

interface DemoRecord {
  id: string;
  title: string;
  source: DemoSource;
  excerpt: string;
  body: string; // markdown; [[Title]] links define the graph edges
}

const records: DemoRecord[] = [
  {
    id: "demo:workspace-hub",
    title: "Sample Workspace",
    source: "guides",
    excerpt: "Central sample workspace demonstrating connected knowledge and demo agents.",
    body: [
      "# Sample Workspace",
      "",
      "Welcome to the synthetic demo workspace. This sample graph illustrates how notes, guidelines, and agents connect visually.",
      "",
      "## Connected Demo Agents",
      "- [[Demo Assistant]]",
      "- [[Demo Research Agent]]",
      "- [[Demo Writer]]",
      "- [[Demo QA Reviewer]]",
      "",
      "## Demo Guides & Notes",
      "- [[Demo Project Guidelines]]",
      "- [[Demo Style Guide]]",
      "- [[Demo Workspace Overview]]",
    ].join("\n"),
  },
  {
    id: "demo:overview",
    title: "Demo Workspace Overview",
    source: "guides",
    excerpt: "An overview of how spatial nodes and relationship links function in Explore.",
    body: [
      "# Demo Workspace Overview",
      "",
      "Each node in Explore represents a record. The connecting lines represent relationships defined in the record content.",
      "",
      "Zoom in to reveal labels, hover to inspect connections, and click to view full details.",
      "",
      "Connected to [[Sample Workspace]] and [[Demo Project Guidelines]].",
    ].join("\n"),
  },
  {
    id: "demo:guidelines",
    title: "Demo Project Guidelines",
    source: "guides",
    excerpt: "Sample guidelines illustrating reference documentation in a workspace.",
    body: [
      "# Demo Project Guidelines",
      "",
      "1. Keep outputs clear, concise, and structured.",
      "2. Verify sample deliverables with [[Demo QA Reviewer]].",
      "3. Refer to [[Demo Style Guide]] for formatting standards.",
      "",
      "Coordinated through [[Sample Workspace]].",
    ].join("\n"),
  },

  // Synthetic Demo Agents
  {
    id: "demo:agent-assistant",
    title: "Demo Assistant",
    source: "agents",
    excerpt: "A generic assistant agent for sample multi-step tasks.",
    body: [
      "# Demo Assistant",
      "",
      "**Role:** General Task Coordination (Synthetic Demo)  ",
      "**Status:** Template / Demo  ",
      "",
      "A sample agent demonstrating task coordination and routing to [[Demo Writer]] and [[Demo Research Agent]].",
      "",
      "Reports to [[Sample Workspace]].",
    ].join("\n"),
  },
  {
    id: "demo:agent-researcher",
    title: "Demo Research Agent",
    source: "agents",
    excerpt: "A generic research agent for gathering sample context.",
    body: [
      "# Demo Research Agent",
      "",
      "**Role:** Information Gathering (Synthetic Demo)  ",
      "**Status:** Template / Demo  ",
      "",
      "A sample agent demonstrating research workflows. Shares findings with [[Demo Writer]] and coordinates with [[Demo Assistant]].",
    ].join("\n"),
  },
  {
    id: "demo:agent-writer",
    title: "Demo Writer",
    source: "agents",
    excerpt: "A generic drafting agent for preparing sample documentation.",
    body: [
      "# Demo Writer",
      "",
      "**Role:** Content Drafting (Synthetic Demo)  ",
      "**Status:** Template / Demo  ",
      "",
      "Drafts sample materials following the [[Demo Style Guide]]. Works with [[Demo Research Agent]] and submits work to [[Demo QA Reviewer]].",
    ].join("\n"),
  },
  {
    id: "demo:agent-qa",
    title: "Demo QA Reviewer",
    source: "agents",
    excerpt: "A generic quality reviewer agent for verifying sample deliverables.",
    body: [
      "# Demo QA Reviewer",
      "",
      "**Role:** Quality review (Synthetic Demo)  ",
      "**Status:** Template / Demo  ",
      "",
      "Reviews sample drafts against the [[Demo Project Guidelines]]. Reports findings back to [[Sample Workspace]].",
    ].join("\n"),
  },

  // Sample Knowledge Notes
  {
    id: "demo:note-style-guide",
    title: "Demo Style Guide",
    source: "notes",
    excerpt: "A generic style guide showing sample reference formatting.",
    body: [
      "# Demo Style Guide",
      "",
      "Clear formatting, consistent structure, and clean typography.",
      "",
      "Referenced by [[Demo Writer]] and [[Demo Project Guidelines]].",
    ].join("\n"),
  },
  {
    id: "demo:note-sample-checklist",
    title: "Sample Task Checklist",
    source: "notes",
    excerpt: "A generic verification checklist for sample project steps.",
    body: [
      "# Sample Task Checklist",
      "",
      "- Verify input requirements",
      "- Coordinate drafting with [[Demo Assistant]]",
      "- Check compliance with [[Demo Project Guidelines]]",
      "- Complete review with [[Demo QA Reviewer]]",
    ].join("\n"),
  },
  {
    id: "demo:note-sample-metrics",
    title: "Sample Project Metrics",
    source: "notes",
    excerpt: "Sample metric definitions for demonstration purposes.",
    body: [
      "# Sample Project Metrics",
      "",
      "Illustrates metric tracking nodes linked to the [[Sample Workspace]].",
      "",
      "Used by [[Demo Research Agent]] for sample analytics.",
    ].join("\n"),
  },
];

export function buildDemoGraph(): SpatialGraphData {
  const byTitle = new Map(records.map((r) => [r.title.toLowerCase(), r.id]));
  const nodes: GraphNode[] = records.map((r) => ({
    id: r.id,
    title: r.title,
    source: r.source,
    categoryLabel: PALETTE[r.source].label,
    color: PALETTE[r.source].color,
    path: `demo://${r.id.replace(":", "/")}`,
    content: `${DEMO_NOTICE}\n\n${r.body}`,
    excerpt: r.excerpt,
    degree: 0,
    lastModified: DATASET_DATE,
  }));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const links: GraphLink[] = [];
  const seen = new Set<string>();
  for (const r of records) {
    for (const m of r.body.matchAll(/\[\[([^\]|]+)\]\]/g)) {
      const target = byTitle.get(m[1].trim().toLowerCase());
      if (!target) throw new Error(`demo graph: unresolved link [[${m[1]}]] in ${r.id}`);
      const key = [r.id, target].sort().join("<>");
      if (target === r.id || seen.has(key)) continue;
      seen.add(key);
      links.push({ source: r.id, target, type: r.source === "notes" ? "wikilink" : "explicit", weight: 1 });
      nodeById.get(r.id)!.degree++;
      nodeById.get(target)!.degree++;
    }
  }

  const categories: GraphCategory[] = (Object.keys(PALETTE) as DemoSource[]).map((id) => ({
    id,
    label: PALETTE[id].label,
    color: PALETTE[id].color,
    count: nodes.filter((n) => n.source === id).length,
  }));

  return {
    nodes,
    links,
    categories,
    summary: { totalNotes: nodes.length, totalConnections: links.length, totalSources: categories.length },
  };
}
