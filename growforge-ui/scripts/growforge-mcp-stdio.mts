/**
 * GrowForge MCP Gateway — Phase 1 stdio entry (LOCAL, READ-ONLY, OWNER DEV ONLY).
 *
 * Spawned by an MCP client (Claude Code, Codex) as a child process; it opens no
 * network port. stdout carries the MCP protocol exclusively, so every console
 * channel is redirected to stderr before anything else loads.
 *
 *   node node_modules/tsx/dist/cli.mjs scripts/growforge-mcp-stdio.mts
 */

import fs from "node:fs";
import path from "node:path";

const toStderr = (...args: unknown[]) => process.stderr.write(args.map(String).join(" ") + "\n");
console.log = toStderr;
console.info = toStderr;
console.debug = toStderr;

async function main() {
  // Stores snapshot process.cwd()/data at import time, so pin the root first.
  const root = process.env.GROWFORGE_MCP_ROOT
    ? path.resolve(process.env.GROWFORGE_MCP_ROOT)
    : path.resolve(path.dirname(process.argv[1] ?? "."), "..");
  process.chdir(root);

  // Same env source the app uses. Never overrides variables the client set explicitly.
  const envFile = path.join(root, ".env.local");
  if (fs.existsSync(envFile)) {
    try {
      process.loadEnvFile(envFile);
    } catch {
      toStderr("[growforge-mcp] could not parse .env.local; continuing with process environment only");
    }
  }

  const { assertLocalDevelopmentEnvironment, createLocalOwnerActor, resetRedactionCache } = await import("@/lib/mcp-server/safety");
  resetRedactionCache();

  const guard = assertLocalDevelopmentEnvironment();
  if (!guard.ok) {
    toStderr(`[growforge-mcp] refusing to start: ${guard.reason}. Phase 1 is local owner development only.`);
    process.exit(78);
  }

  const { createGrowForgeReadOnlyMcpServer } = await import("@/lib/mcp-server/server");
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");

  const server = createGrowForgeReadOnlyMcpServer(createLocalOwnerActor());
  await server.connect(new StdioServerTransport());
  toStderr("[growforge-mcp] ready (stdio, read-only, local owner)");
}

main().catch((err) => {
  // Message only — never a stack trace.
  toStderr(`[growforge-mcp] fatal: ${err instanceof Error ? err.message : "unknown error"}`);
  process.exit(1);
});
