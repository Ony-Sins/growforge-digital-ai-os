import fs from "node:fs/promises";
import path from "node:path";
import { listMcpServers } from "@/lib/mcp/store";
import { resolveImageKeys } from "@/lib/imageGen";
import { isCapabilityActive } from "@/lib/capabilityStore";
import { listAiModels } from "@/lib/aiModelStore";

export interface GraphNode {
  id: string;
  title: string;
  source: string; // category id: e.g. "vault", "agents", "docs", "mcp", "capabilities", "models"
  categoryLabel: string;
  color: string;
  path: string;
  content?: string;
  excerpt: string;
  degree: number;
  lastModified?: string;
  isDaily?: boolean;
  x?: number;
  y?: number;
  z?: number;
  fx?: number;
  fy?: number;
  fz?: number;
}

export interface GraphLink {
  source: string;
  target: string;
  type: "wikilink" | "explicit" | "structural";
  weight?: number;
}

export interface GraphCategory {
  id: string;
  label: string;
  color: string;
  count: number;
}

export interface SpatialGraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  categories: GraphCategory[];
  summary: {
    totalNotes: number;
    totalConnections: number;
    totalSources: number;
  };
}

const CATEGORY_PALETTE: Record<string, { label: string; color: string }> = {
  vault: { label: "Obsidian Vault", color: "#38BDF8" }, // Sky / Cyan
  agents: { label: "Department Systems", color: "#F472B6" }, // Pink
  docs: { label: "Product & Architecture", color: "#FBBF24" }, // Amber / Gold
  mcp: { label: "MCP Connectors", color: "#06B6D4" }, // Cyan / Teal
  capabilities: { label: "Capability Keys", color: "#EC4899" }, // Rose / Magenta
  models: { label: "AI Models", color: "#8B5CF6" }, // Violet / Purple
};

const PROVIDER_COLORS: Record<string, string> = {
  openai: "#10a37f",
  "openai-compatible": "#10a37f",
  anthropic: "#d97706",
  gemini: "#3b82f6",
  groq: "#f97316",
  ollama: "#8b5cf6",
  openrouter: "#06b6d4",
  custom: "#ec4899",
};

export const DEFAULT_VAULT_DIR = "C:\\Users\\USERAS\\Documents\\Obsidian Vault";

/**
 * Extracts wikilinks [[Link Target]] or [[Link Target|Alias]] and standard markdown links [text](target.md)
 */
function extractLinks(markdown: string): string[] {
  const targets = new Set<string>();

  // [[Target]] or [[Target|Alias]]
  const wikiRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let match;
  while ((match = wikiRegex.exec(markdown)) !== null) {
    const raw = match[1].trim();
    if (raw) targets.add(raw);
  }

  // [text](target.md)
  const mdRegex = /\[([^\]]+)\]\(([^)]+\.md)\)/g;
  while ((match = mdRegex.exec(markdown)) !== null) {
    const targetFile = match[2].trim().replace(/^(\.\/|\.\.\/)+/, "");
    const base = path.basename(targetFile, ".md");
    if (base) targets.add(base);
  }

  return Array.from(targets);
}

function cleanExcerpt(markdown: string): string {
  return markdown
    .replace(/^---[\s\S]*?---/, "") // strip yaml frontmatter
    .replace(/#+\s+/g, "") // strip headers
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1") // clean wikilinks
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // clean md links
    .replace(/[*_`]/g, "") // strip formatting
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

export async function loadSpatialGraph(workspaceRoot: string = process.cwd()): Promise<SpatialGraphData> {
  const nodes: GraphNode[] = [];
  const rawLinks: { from: string; to: string; type: "wikilink" | "explicit" | "structural" }[] = [];
  const nodeMap = new Map<string, GraphNode>();
  const titleToIdMap = new Map<string, string>();

  // 1. Scan Local Obsidian Vault
  try {
    const stat = await fs.stat(DEFAULT_VAULT_DIR);
    if (stat.isDirectory()) {
      const entries = await fs.readdir(DEFAULT_VAULT_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".md")) {
          const filePath = path.join(DEFAULT_VAULT_DIR, entry.name);
          const content = await fs.readFile(filePath, "utf-8");
          const fileStat = await fs.stat(filePath);
          const title = entry.name.replace(/\.md$/, "");
          const id = `vault:${title.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}`;

          const node: GraphNode = {
            id,
            title,
            source: "vault",
            categoryLabel: CATEGORY_PALETTE.vault.label,
            color: CATEGORY_PALETTE.vault.color,
            path: filePath,
            content,
            excerpt: cleanExcerpt(content) || "Obsidian vault note",
            degree: 0,
            lastModified: fileStat.mtime.toISOString(),
            isDaily: /^\d{4}-\d{2}-\d{2}/.test(title),
          };

          nodes.push(node);
          nodeMap.set(id, node);
          titleToIdMap.set(title.toLowerCase(), id);

          const links = extractLinks(content);
          for (const target of links) {
            rawLinks.push({ from: id, to: target.toLowerCase(), type: "wikilink" });
          }
        }
      }
    }
  } catch {
    // Obsidian directory may not be present in every environment
  }

  // 2. Scan Workspace Department Agent Instructions (*_Agent_System.md)
  try {
    const repoRoot = path.resolve(workspaceRoot, "..");
    const entries = await fs.readdir(repoRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith("_Agent_System.md")) {
        const filePath = path.join(repoRoot, entry.name);
        const content = await fs.readFile(filePath, "utf-8");
        const fileStat = await fs.stat(filePath);
        const title = entry.name.replace(/_Agent_System\.md$/, "").replace(/_/g, " ");
        const id = `agent:${entry.name.replace(/\.md$/, "").toLowerCase()}`;

        const node: GraphNode = {
          id,
          title: `${title} Department`,
          source: "agents",
          categoryLabel: CATEGORY_PALETTE.agents.label,
          color: CATEGORY_PALETTE.agents.color,
          path: filePath,
          content,
          excerpt: cleanExcerpt(content) || "Department operating instruction",
          degree: 0,
          lastModified: fileStat.mtime.toISOString(),
        };

        nodes.push(node);
        nodeMap.set(id, node);
        titleToIdMap.set(title.toLowerCase(), id);
        titleToIdMap.set(entry.name.toLowerCase().replace(/\.md$/, ""), id);

        const links = extractLinks(content);
        for (const target of links) {
          rawLinks.push({ from: id, to: target.toLowerCase(), type: "explicit" });
        }
      }
    }
  } catch {
    // ignore
  }

  // 3. Scan Key Core Product & Architectural Docs
  const coreDocs = [
    { name: "PRODUCT.md", label: "Product Constitution" },
    { name: "DESIGN.md", label: "Design System Tokens" },
    { name: "docs/ROADMAP.md", label: "Phased Execution Roadmap" },
    { name: "GrowForge Digital — Company Constitution.md", label: "Company Constitution" },
  ];

  for (const doc of coreDocs) {
    try {
      const docPath = path.resolve(workspaceRoot, "..", doc.name);
      const content = await fs.readFile(docPath, "utf-8");
      const fileStat = await fs.stat(docPath);
      const id = `doc:${path.basename(doc.name, ".md").toLowerCase().replace(/[^a-z0-9_-]/g, "-")}`;
      const title = doc.label;

      const node: GraphNode = {
        id,
        title,
        source: "docs",
        categoryLabel: CATEGORY_PALETTE.docs.label,
        color: CATEGORY_PALETTE.docs.color,
        path: docPath,
        content,
        excerpt: cleanExcerpt(content) || "Platform architecture document",
        degree: 0,
        lastModified: fileStat.mtime.toISOString(),
      };

      nodes.push(node);
      nodeMap.set(id, node);
      titleToIdMap.set(path.basename(doc.name, ".md").toLowerCase(), id);
      titleToIdMap.set(title.toLowerCase(), id);

      const links = extractLinks(content);
      for (const target of links) {
        rawLinks.push({ from: id, to: target.toLowerCase(), type: "explicit" });
      }
    } catch {
      // ignore
    }
  }

  // Identify HQ / Core Node for shallow 1-hop connections
  const coreNodeId =
    (nodeMap.has("agent:growforge_hq_agent_system") && "agent:growforge_hq_agent_system") ||
    (nodeMap.has("agent:executive_coordination_orchestration_agent_system") && "agent:executive_coordination_orchestration_agent_system") ||
    (nodeMap.has("doc:growforge-digital---company-constitution") && "doc:growforge-digital---company-constitution") ||
    (nodeMap.has("doc:product") && "doc:product") ||
    nodes[0]?.id;

  // 4. Merge Real Connected MCP Servers
  try {
    const mcpServers = listMcpServers().filter(
      (s) =>
        (s.status ?? "connected") === "connected" &&
        s.status !== "disconnected" &&
        s.status !== "archived"
    );

    for (const server of mcpServers) {
      const id = `mcp:${server.id}`;
      const toolCount = server.detectedTools?.length || 0;
      const toolsList = (server.detectedTools || [])
        .map((t) => `- \`${t.name}\`: ${t.description || "No description provided."}`)
        .join("\n");

      const content = [
        `# MCP Connector: ${server.name}`,
        "",
        `**Status:** Connected (${server.status || "active"})  `,
        `**Transport:** ${server.transport.toUpperCase()}  `,
        `**Origin:** ${server.origin || "catalog"}  `,
        server.url ? `**Endpoint:** \`${server.url}\`  ` : "",
        server.command ? `**Command:** \`${server.command} ${(server.args || []).join(" ")}\`  ` : "",
        `**Target Lobe:** \`${server.targetLobe || "neural_core"}\`  `,
        `**Allowed Departments:** ${server.allowedDepartments?.length ? server.allowedDepartments.join(", ") : "All Departments"}  `,
        "",
        "## Discovered Tools",
        toolCount > 0 ? toolsList : "_No tools detected yet on this server._",
      ]
        .filter(Boolean)
        .join("\n");

      const node: GraphNode = {
        id,
        title: server.name,
        source: "mcp",
        categoryLabel: CATEGORY_PALETTE.mcp.label,
        color: CATEGORY_PALETTE.mcp.color,
        path: server.transport === "http" ? server.url || "HTTP Endpoint" : server.command || "Local Stdio Command",
        content,
        excerpt: `${toolCount} discovered tool${toolCount === 1 ? "" : "s"} available. Transport: ${server.transport.toUpperCase()}.`,
        degree: 0,
        lastModified: server.createdAt || new Date().toISOString(),
      };

      nodes.push(node);
      nodeMap.set(id, node);
      titleToIdMap.set(server.name.toLowerCase(), id);
      titleToIdMap.set(server.id.toLowerCase(), id);

      if (coreNodeId) {
        rawLinks.push({ from: coreNodeId, to: id, type: "structural" });
      }
    }
  } catch (err) {
    console.error("[obsidianReader] failed to load MCP servers:", err);
  }

  // 5. Merge Real Configured Capability Keys
  try {
    const imageKeys = resolveImageKeys();
    if (imageKeys.higgsfieldKey && isCapabilityActive("higgsfield")) {
      const id = "cap:higgsfield";
      const content = [
        "# Capability Key: Higgsfield AI",
        "",
        "**Role:** Generative Video & Cinematic Campaign Creative Engine  ",
        `**Key Source:** ${imageKeys.source}  `,
        "**Status:** Active  ",
        "",
        "## Capabilities",
        "- `generate_higgsfield_image`: High-fidelity prompt-based creative assets",
        "- `generate_higgsfield_video`: Motion video synthesis for ad campaigns and creative reels",
      ].join("\n");

      const node: GraphNode = {
        id,
        title: "Higgsfield AI",
        source: "capabilities",
        categoryLabel: CATEGORY_PALETTE.capabilities.label,
        color: CATEGORY_PALETTE.capabilities.color,
        path: "Vault Secret / Environment",
        content,
        excerpt: `Direct API capability key for AI video and campaign creative generation (${imageKeys.source}).`,
        degree: 0,
        lastModified: new Date().toISOString(),
      };

      nodes.push(node);
      nodeMap.set(id, node);
      titleToIdMap.set("higgsfield", id);
      titleToIdMap.set("higgsfield ai", id);

      if (coreNodeId) {
        rawLinks.push({ from: coreNodeId, to: id, type: "structural" });
      }
    }

    if (imageKeys.openaiKey && isCapabilityActive("dalle")) {
      const id = "cap:dalle";
      const content = [
        "# Capability Key: OpenAI DALL-E 3",
        "",
        "**Role:** Generative Image Synthesis Engine  ",
        `**Key Source:** ${imageKeys.source}  `,
        "**Status:** Active  ",
        "",
        "## Capabilities",
        "- `generate_dalle_image`: DALL-E 3 visual asset generation for marketing and landing pages",
      ].join("\n");

      const node: GraphNode = {
        id,
        title: "OpenAI DALL-E 3",
        source: "capabilities",
        categoryLabel: CATEGORY_PALETTE.capabilities.label,
        color: CATEGORY_PALETTE.capabilities.color,
        path: "Vault Secret / OpenAI API Key",
        content,
        excerpt: `Direct API capability key for OpenAI DALL-E 3 image generation (${imageKeys.source}).`,
        degree: 0,
        lastModified: new Date().toISOString(),
      };

      nodes.push(node);
      nodeMap.set(id, node);
      titleToIdMap.set("dalle", id);
      titleToIdMap.set("dall-e", id);

      if (coreNodeId) {
        rawLinks.push({ from: coreNodeId, to: id, type: "structural" });
      }
    }
  } catch (err) {
    console.error("[obsidianReader] failed to load capability keys:", err);
  }

  // 6. Merge Real Configured AI Models
  try {
    const configuredModels = listAiModels().filter(
      (m) => m.isConfigured && m.status !== "archived" && m.status !== "disconnected"
    );

    for (const model of configuredModels) {
      const id = `model:${model.id}`;
      const color = PROVIDER_COLORS[model.providerType] || CATEGORY_PALETTE.models.color;
      const content = [
        `# AI Model: ${model.name}`,
        "",
        `**Provider Type:** \`${model.providerType}\`  `,
        `**Model ID:** \`${model.modelName}\`  `,
        `**Task Role:** \`${model.taskRole}\`  `,
        `**Primary Model:** ${model.isPrimary ? "Yes (Default Dispatch)" : "No"}  `,
        `**Source:** \`${model.source}\`  `,
        model.baseUrl ? `**Base URL:** \`${model.baseUrl}\`  ` : "",
        model.lastLatencyMs ? `**Measured Latency:** ${model.lastLatencyMs}ms  ` : "",
        `**Status:** ${model.status || "active"}  `,
      ]
        .filter(Boolean)
        .join("\n");

      const node: GraphNode = {
        id,
        title: model.name,
        source: "models",
        categoryLabel: CATEGORY_PALETTE.models.label,
        color,
        path: model.baseUrl || `Local Provider: ${model.providerType}`,
        content,
        excerpt: `Configured ${model.providerType} AI model (${model.modelName}, ${model.taskRole} role, ${model.source} key).`,
        degree: 0,
        lastModified: model.createdAt || new Date().toISOString(),
      };

      nodes.push(node);
      nodeMap.set(id, node);
      titleToIdMap.set(model.name.toLowerCase(), id);
      titleToIdMap.set(model.id.toLowerCase(), id);

      if (coreNodeId) {
        rawLinks.push({ from: coreNodeId, to: id, type: "structural" });
      }
    }
  } catch (err) {
    console.error("[obsidianReader] failed to load AI models:", err);
  }

  // 7. Resolve Links and Compute Degrees
  const resolvedLinks: GraphLink[] = [];
  const linkSet = new Set<string>();

  for (const raw of rawLinks) {
    let targetId = nodeMap.has(raw.to) ? raw.to : titleToIdMap.get(raw.to);
    if (!targetId) {
      // Partial match attempt
      for (const [key, val] of titleToIdMap.entries()) {
        if (key.includes(raw.to) || raw.to.includes(key)) {
          targetId = val;
          break;
        }
      }
    }

    if (targetId && targetId !== raw.from) {
      const key = `${raw.from}->${targetId}`;
      if (!linkSet.has(key)) {
        linkSet.add(key);
        resolvedLinks.push({
          source: raw.from,
          target: targetId,
          type: raw.type,
          weight: 1,
        });

        const fromNode = nodeMap.get(raw.from);
        const toNode = nodeMap.get(targetId);
        if (fromNode) fromNode.degree++;
        if (toNode) toNode.degree++;
      }
    }
  }

  // Count categories
  const categoryCounts = new Map<string, number>();
  for (const node of nodes) {
    categoryCounts.set(node.source, (categoryCounts.get(node.source) || 0) + 1);
  }

  const categories: GraphCategory[] = Object.entries(CATEGORY_PALETTE)
    .map(([id, meta]) => ({
      id,
      label: meta.label,
      color: meta.color,
      count: categoryCounts.get(id) || 0,
    }))
    .filter((c) => c.count > 0);

  return {
    nodes,
    links: resolvedLinks,
    categories,
    summary: {
      totalNotes: nodes.length,
      totalConnections: resolvedLinks.length,
      totalSources: categories.length,
    },
  };
}
