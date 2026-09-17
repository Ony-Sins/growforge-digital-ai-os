/**
 * Curated known-service catalog for the MCP "connectors" picker — the
 * ChatGPT/Claude-style grid of logos instead of a blank command/URL form.
 *
 * Every "token" entry below is a verified real integration path (checked
 * against each vendor's own docs/npm page, not guessed):
 *   - Linear:  official remote MCP server, accepts a plain API key as a
 *              Bearer token — no OAuth required.
 *   - Asana:   official remote MCP server, same — accepts a personal
 *              access token as a Bearer token.
 *   - Notion:  official self-hosted server (@notionhq/notion-mcp-server),
 *              run locally via npx, reads NOTION_TOKEN.
 *   - HubSpot: official self-hosted server (@hubspot/mcp-server), run
 *              locally via npx, reads PRIVATE_APP_ACCESS_TOKEN.
 *   - GitHub:  official remote MCP server (api.githubcopilot.com/mcp),
 *              accepts a personal access token as a Bearer token.
 *   - Apollo:  official remote MCP server (mcp.apollo.io/mcp), accepts a
 *              master API key via the `X-Api-Key` header (not Bearer —
 *              see McpServerDef.authHeader in store.ts).
 *
 * Entries marked "oauth" (Google Drive, Slack, etc.) have no token-based
 * path in their official MCP offering as of this writing — their hosted
 * MCP servers are OAuth-only. Rather than fake a one-click "connect" for
 * those, the picker marks them "Requires OAuth — coming soon": that's a
 * distinct, larger feature (per-provider app registration, token refresh),
 * not something to fake a green checkmark for.
 */

export type CatalogAuthKind = "token" | "oauth";

export interface CatalogEntry {
  id: string;
  name: string;
  description: string;
  /** lucide-react icon name, resolved in the UI's icon map. */
  icon: string;
  /** Brand-ish accent color for the card, as a Tailwind bg class. */
  tint: string;
  authKind: CatalogAuthKind;
  /** Shown as the input label when authKind is "token". */
  tokenLabel?: string;
  /** Where to get the token — shown as help text. */
  tokenHelpUrl?: string;
  /** The real MCP recipe this token plugs into — only present for "token" entries. */
  recipe?:
    | { transport: "http"; url: string; authHeader?: string }
    | { transport: "stdio"; command: string; args: string[]; envVar: string };
}

export const MCP_CATALOG: CatalogEntry[] = [
  {
    id: "linear",
    name: "Linear",
    description: "Manage issues, projects & team workflows in Linear",
    icon: "CircleDot",
    tint: "bg-[#5E6AD2]",
    authKind: "token",
    tokenLabel: "Linear API Key",
    tokenHelpUrl: "https://linear.app/settings/account/security",
    recipe: { transport: "http", url: "https://mcp.linear.app/mcp" },
  },
  {
    id: "asana",
    name: "Asana",
    description: "Connect to Asana to coordinate tasks, projects and goals",
    icon: "CheckCircle2",
    tint: "bg-[#F06A6A]",
    authKind: "token",
    tokenLabel: "Asana Personal Access Token",
    tokenHelpUrl: "https://app.asana.com/0/my-apps",
    recipe: { transport: "http", url: "https://mcp.asana.com/v2/mcp" },
  },
  {
    id: "notion",
    name: "Notion",
    description: "Search, update, and power workflows across your Notion workspace",
    icon: "FileText",
    tint: "bg-navy",
    authKind: "token",
    tokenLabel: "Notion Integration Token",
    tokenHelpUrl: "https://www.notion.so/my-integrations",
    recipe: { transport: "stdio", command: "npx", args: ["-y", "@notionhq/notion-mcp-server"], envVar: "NOTION_TOKEN" },
  },
  {
    id: "hubspot",
    name: "HubSpot",
    description: "CRM context for every answer, insight, and action",
    icon: "Users",
    tint: "bg-[#FF7A59]",
    authKind: "token",
    tokenLabel: "HubSpot Private App Access Token",
    tokenHelpUrl: "https://developers.hubspot.com/docs/apps/developer-platform/build-apps/private-apps",
    recipe: { transport: "stdio", command: "npx", args: ["-y", "@hubspot/mcp-server"], envVar: "PRIVATE_APP_ACCESS_TOKEN" },
  },
  {
    id: "github",
    name: "GitHub",
    description: "Repos, issues, PRs, and Actions — real read/write access",
    icon: "GitBranch",
    tint: "bg-[#181717]",
    authKind: "token",
    tokenLabel: "GitHub Personal Access Token",
    tokenHelpUrl: "https://github.com/settings/tokens",
    recipe: { transport: "http", url: "https://api.githubcopilot.com/mcp/" },
  },
  {
    id: "apollo",
    name: "Apollo.io",
    description: "Prospect search, enrichment, and outbound sequences",
    icon: "Target",
    tint: "bg-[#5B21FF]",
    authKind: "token",
    tokenLabel: "Apollo Master API Key",
    tokenHelpUrl: "https://docs.apollo.io/reference/authentication",
    recipe: { transport: "http", url: "https://mcp.apollo.io/mcp", authHeader: "X-Api-Key" },
  },
  {
    id: "vercel",
    name: "Vercel",
    description: "Deployments, logs, and project management",
    icon: "Triangle",
    tint: "bg-black",
    authKind: "oauth",
  },
  {
    id: "google-drive",
    name: "Google Drive",
    description: "Search, read, and upload files instantly",
    icon: "HardDrive",
    tint: "bg-[#4285F4]",
    authKind: "oauth",
  },
  {
    id: "gmail",
    name: "Gmail",
    description: "Draft replies, summarize threads, and search your inbox",
    icon: "Mail",
    tint: "bg-[#EA4335]",
    authKind: "oauth",
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    description: "Manage your schedule and coordinate meetings",
    icon: "Calendar",
    tint: "bg-[#4285F4]",
    authKind: "oauth",
  },
  {
    id: "slack",
    name: "Slack",
    description: "Send messages, create canvases, and fetch Slack data",
    icon: "MessagesSquare",
    tint: "bg-[#4A154B]",
    authKind: "oauth",
  },
  {
    id: "microsoft-365",
    name: "Microsoft 365",
    description: "Access SharePoint, OneDrive, Outlook, and Teams",
    icon: "Grid2x2",
    tint: "bg-[#00A4EF]",
    authKind: "oauth",
  },
  {
    id: "figma",
    name: "Figma",
    description: "Generate diagrams and better code from Figma context",
    icon: "Frame",
    tint: "bg-[#1E1E1E]",
    authKind: "oauth",
  },
];
