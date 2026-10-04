/**
 * NORA responder for the private beta.
 *
 * Deliberately NOT a model call: no provider keys, no spend, no tools, no memory, no access to any
 * private context. It answers from a safe, clearly structured script about workspace state, so a
 * tester can explore the conversational flow safely. Nothing here can execute or dispatch anything.
 */

const DEMO_NOTICE = "(Demo workspace · Synthetic data — NORA is running on generic sample data; no real agents, spending or integrations.)";

interface Topic {
  match: RegExp;
  normalReply: string;
  demoReply: string;
}

const TOPICS: Topic[] = [
  {
    match: /\b(hi|hello|hey|salam|good (morning|afternoon|evening|night))\b/i,
    normalReply: "Hi, I'm NORA, the GrowForge operating assistant. In this private beta you have a clean personal workspace (0 missions, 0 systems, 0 approvals). Ask me how workspace state is structured or explore our optional synthetic demo mode (?demo=true).",
    demoReply: "Hi, I'm NORA, the GrowForge operating assistant. You are currently viewing the synthetic demo workspace. Ask me about sample agents, sample workflows, or graph navigation.",
  },
  {
    match: /\b(active\s+(departments?|agents?|teams?)|departments?\s+status|agents?\s+status|summarize\s+.*departments?|my\s+(departments?|agents?|teams?)|how\s+many\s+departments?)\b/i,
    normalReply: "You currently have 0 active departments and 0 deployed agents in your workspace. Your operational state is completely clean. If you would like to explore sample coordination flows, you can switch to synthetic demo mode (?demo=true).",
    demoReply: "You are currently viewing a synthetic demo workspace with sample agents (such as Demo Assistant and Demo Research Agent) illustrating multi-agent coordination.",
  },
  {
    match: /\b(agents?|departments?|teams?|specialists?)\b/i,
    normalReply: "In GrowForge, workspaces can organize work across custom teams and specialist agents. In your workspace, no departments or agents are currently deployed. You can view a sample layout in synthetic demo mode (?demo=true).",
    demoReply: "In this synthetic demo workspace, generic sample agents illustrate how multi-agent teams and specialist roles are organized.",
  },
  {
    match: /\b(missions?|tasks?|jobs?|runs?|execut\w+|builds?|launch\w*|active\s+work)\b/i,
    normalReply: "You currently have 0 active missions. In this private beta, mission execution and job dispatch are switched off, so nothing is run. You can explore sample project flows in synthetic demo mode (?demo=true).",
    demoReply: "In this synthetic demo, sample project guides demonstrate how multi-step routing operates. No real execution or spending occurs.",
  },
  {
    match: /\b(systems?|connectors?|integrations?|mcp|tools?|providers?|credentials?|api\s*keys?|slack|notion|hubspot)\b/i,
    normalReply: "You currently have 0 connected systems, tools, or integrations, and no API credentials configured. In the full product, you can connect external services and MCP tool servers.",
    demoReply: "In this synthetic demo, tools and integrations are represented with generic sample placeholders without live credentials or external network access.",
  },
  {
    match: /\b(approvals?|sign-?offs?|pending\s+approvals?|gates?)\b/i,
    normalReply: "You have 0 pending approvals waiting. In the full product, sensitive actions such as spend, outbound communications, and production publishing pause at an approval gate for explicit human sign-off.",
    demoReply: "In this synthetic demo, approval gates show how human-in-the-loop checkpoints operate before sensitive actions take place.",
  },
  {
    match: /\b(memory|profile|personal\s+knowledge|my\s+data|notes?)\b/i,
    normalReply: "Your personal memory and knowledge base are completely empty. Any notes you create will remain isolated to your account.",
    demoReply: "You are viewing synthetic demo notes (such as sample guidelines and checklists) to demonstrate knowledge graph exploration. Your personal memory is empty.",
  },
  {
    match: /\b(blueprints?|catalogs?|library|template\s*counts?)\b/i,
    normalReply: "In the full product, GrowForge includes a modular library of specialist agent blueprints. In your fresh beta workspace, your active catalog and configuration start completely clean.",
    demoReply: "In the full product, GrowForge includes a modular library of specialist agent blueprints. In this demo workspace, sample agents demonstrate how blueprint archetypes behave.",
  },
  {
    match: /\b(explore|brain|knowledge|graphs?|nodes?|records?)\b/i,
    normalReply: "Explore is GrowForge's spatial knowledge graph. In your fresh workspace it is empty (0 nodes, 0 connections) until you connect sources. You can view a sample graph by switching to synthetic demo mode (?demo=true).",
    demoReply: "Explore is displaying generic synthetic sample nodes (Sample Workspace, Demo Assistant, and reference notes) to demonstrate graph navigation, selection, and sidecards.",
  },
  {
    match: /\b(price|pricing|costs?|plans?|subscribe|pay)\b/i,
    normalReply: "Pricing isn't part of the private beta yet. If you'd like to share what you'd expect to pay, the feedback button is the best place — it goes straight to the team.",
    demoReply: "Pricing isn't part of the private beta yet. If you'd like to share what you'd expect to pay, the feedback button is the best place — it goes straight to the team.",
  },
  {
    match: /\b(data|privacy|secure|security|safe|isolat\w+)\b/i,
    normalReply: "Your beta account is strictly isolated: your workspace starts completely empty, your conversation with me is stored separately for your account, and no real integrations, keys or customer data are connected. The owner can delete your account and its data at your request.",
    demoReply: "Your beta account is strictly isolated: your workspace starts completely empty, your conversation with me is stored separately for your account, and no real integrations, keys or customer data are connected. The owner can delete your account and its data at your request.",
  },
];

export function demoNoraReply(message: string, isDemo: boolean = false): string {
  const text = message.trim();
  if (!text) {
    return isDemo
      ? `Ask me anything about the synthetic demo workspace. ${DEMO_NOTICE}`
      : "Hi, I'm NORA. Ask me anything about your workspace state or how GrowForge works.";
  }
  const hit = TOPICS.find((t) => t.match.test(text));
  if (isDemo) {
    const body =
      hit?.demoReply ??
      "That's a good question for the full product. In this synthetic demo mode, I answer from sample scripts about GrowForge, Explore, and demo workspace state — try asking about sample agents, missions, or Explore.";
    return `${body}\n\n${DEMO_NOTICE}`;
  }

  return (
    hit?.normalReply ??
    "That's a good question for the full product. In this private beta, your workspace starts clean (0 missions, 0 systems, 0 approvals). Try asking about your workspace state, Explore, or how to explore our optional synthetic demo mode."
  );
}

