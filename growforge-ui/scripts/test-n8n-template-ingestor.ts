#!/usr/bin/env npx tsx
/**
 * Test: n8n Template Ingestor
 * Run: npx tsx scripts/test-n8n-template-ingestor.ts
 *
 * Verifies:
 * 1. searchN8nTemplates() returns hits from n8n.io
 * 2. fetchAndSanitiseTemplate() strips credentials
 * 3. ingestN8nTemplates() combines both and produces clean TemplateResult[]
 * 4. sanitiseWorkflow() redacts known secret patterns
 */

import {
  searchN8nTemplates,
  ingestN8nTemplates,
  sanitiseWorkflow,
} from "../src/lib/n8n-template-ingestor";

// ANSI colours
const G = "\x1b[32m";
const R = "\x1b[31m";
const Y = "\x1b[33m";
const C = "\x1b[36m";
const B = "\x1b[1m";
const X = "\x1b[0m";

function pass(msg: string) { console.log(`${G}✔${X} ${msg}`); }
function fail(msg: string) { console.log(`${R}✘${X} ${msg}`); }
function info(msg: string) { console.log(`${C}ℹ${X} ${msg}`); }
function section(msg: string) { console.log(`\n${B}${Y}▶ ${msg}${X}`); }

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) { pass(label); passed++; }
  else { fail(label); failed++; }
}

async function main() {
  // -------------------------------------------------------------------------
  // Unit test: sanitiseWorkflow() redacts secrets
  // -------------------------------------------------------------------------
  section("Unit: sanitiseWorkflow() credential & secret redaction");

  const fakeworkflow = {
    nodes: [
      {
        type: "n8n-nodes-base.httpRequest",
        name: "Call API",
        typeVersion: 4,
        credentials: { httpHeaderAuth: { id: "abc123", name: "My API Key" } },
        parameters: {
          url: "https://api.example.com/leads",
          authentication: "genericCredentialType",
          genericAuthType: "httpHeaderAuth",
          options: { apiKey: "sk-realSecretValue1234567890abcdef", password: "hunter2" },
        },
      },
      {
        type: "n8n-nodes-base.webhook",
        name: "Inbound Webhook",
        typeVersion: 1,
        credentials: {},
        parameters: { path: "my-webhook-path", responseMode: "onLastNode" },
      },
    ],
    connections: {
      "Inbound Webhook": { main: [[{ node: "Call API", type: "main", index: 0 }]] },
    },
    settings: { executionOrder: "v1", secret: "top-secret-setting" },
  };

  const sanitised = sanitiseWorkflow(
    fakeworkflow as Record<string, unknown>,
    9999,
    "Test WF",
    "Test description",
  );

  assert(sanitised.nodes.length === 2, "Correct node count preserved (2)");
  assert(sanitised.triggerType === "n8n-nodes-base.webhook", "Webhook trigger correctly identified");
  assert(
    sanitised.nodes[0].credentialTypes.includes("httpHeaderAuth"),
    "Credential type name preserved",
  );
  const httpParams = sanitised.nodes[0].parameters.options as Record<string, unknown>;
  assert(httpParams.apiKey === "<REDACTED>", "API key parameter redacted");
  assert(httpParams.password === "<REDACTED>", "Password parameter redacted");
  assert((sanitised.settings as Record<string, unknown>).secret === "<REDACTED>", "Settings-level secret redacted");
  assert(sanitised.connections !== undefined, "Connections map preserved");
  assert(sanitised.appNodes.includes("n8n-nodes-base.httpRequest"), "httpRequest counted as app node");

  // -------------------------------------------------------------------------
  // Integration test: searchN8nTemplates()
  // -------------------------------------------------------------------------
  section("Integration: searchN8nTemplates('slack notification')");

  try {
    const hits = await searchN8nTemplates("slack notification", 5);
    assert(Array.isArray(hits), "Returns an array");
    assert(hits.length > 0, `Found ${hits.length} hit(s) — at least 1 expected`);
    assert(typeof hits[0].id === "number" && hits[0].id > 0, "First hit has a numeric ID");
    assert(typeof hits[0].name === "string" && hits[0].name.length > 0, "First hit has a name");
    info(`Top result: [${hits[0].id}] ${hits[0].name} (${hits[0].totalViews.toLocaleString()} views)`);
    info(`Trigger types: ${hits[0].triggerTypes.join(", ") || "(none)"}`);
    info(`App nodes: ${hits[0].appNodes.slice(0, 5).join(", ")}`);
  } catch (err) {
    fail(`searchN8nTemplates threw: ${err instanceof Error ? err.message : String(err)}`);
    failed++;
    info("Skipping full workflow fetch (search failed — check internet connection)");
  }

  // -------------------------------------------------------------------------
  // Integration test: ingestN8nTemplates()
  // -------------------------------------------------------------------------
  section("Integration: ingestN8nTemplates('lead generation', maxFetch=2)");

  try {
    const results = await ingestN8nTemplates("lead generation", { searchLimit: 5, maxFetch: 2 });

    assert(results.length >= 1, `ingestN8nTemplates returned ${results.length} result(s)`);

    for (const r of results) {
      info(`Template [${r.hit.id}]: ${r.hit.name}`);
      if (r.fetchError) {
        info(`  ⚠ Fetch error: ${r.fetchError}`);
      } else if (r.workflow) {
        const wf = r.workflow;
        assert(
          typeof wf.totalNodeCount === "number" && wf.totalNodeCount > 0,
          `  [${wf.id}] Has ${wf.totalNodeCount} nodes`,
        );
        assert(
          wf.nodes.every((n) => n.credentialTypes !== undefined),
          `  [${wf.id}] All nodes have credentialTypes array`,
        );
        const serialised = JSON.stringify(wf);
        const hasRealSecrets = /sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|AIza[A-Za-z0-9]{30,}/.test(serialised);
        assert(!hasRealSecrets, `  [${wf.id}] No raw API secrets in sanitised output`);
        info(`  Trigger: ${wf.triggerType ?? "(none)"}`);
        info(`  App nodes: ${wf.appNodes.slice(0, 5).join(", ")}`);
      }
    }
  } catch (err) {
    fail(`ingestN8nTemplates threw: ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  section("Results");
  console.log(`\n  ${G}${B}Passed: ${passed}${X}   ${failed > 0 ? R : G}${B}Failed: ${failed}${X}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
