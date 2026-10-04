import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DEPARTMENTS, ALL_RUNTIME_DEPARTMENTS, CANONICAL_DEPARTMENTS, getDepartment, loadInstructions, hashInstructions } from "../src/lib/departments";
import { DEPARTMENT_TAXONOMY, OVERSIGHT_TAXONOMY, canonicalDepartmentId, classifyDepartmentSource, departmentGraphId, departmentHasPermission, validateDepartmentPermissions, SPECIALIST_ASSIGNMENTS, LEGACY_DEPARTMENT_ALIASES, resolveDepartmentAlias, canonicalizeDepartmentText, departmentMatchesQuery, departmentStepLabel, blueprintPolicy, taxonomyPrompt, REFERENCE_AGENT_ASSIGNMENTS, skillPolicy } from "../src/lib/departmentTaxonomy";
import { agents, withAgentTaxonomy } from "../src/lib/agents";
import { detectHandoff } from "../src/lib/handoff";
import { loadSpatialGraph } from "../src/lib/spatial/obsidianReader";
import { jobView } from "../src/lib/coreState";
import { buildByoMcpTools } from "../src/lib/tools";
import type { McpServerDef } from "../src/lib/mcp/store";
import type { Job } from "../src/lib/jobStore";
import { resolveSwarmAgent, SWARM_ROSTER } from "../src/lib/swarm-orchestrator";
import { buildDemoGraph } from "../src/lib/beta/demoGraph";

const root = path.resolve(process.cwd(), "..");
const digest = (file: string) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sourceFiles = fs.readdirSync(root).filter((file) => file.endsWith("_Agent_System.md"));
const protectedFiles = [...sourceFiles.map((file) => path.join(root, file)), ...fs.readdirSync("data").filter((file) => file.endsWith(".json")).map((file) => path.resolve("data", file))];
const before = new Map(protectedFiles.map((file) => [file, digest(file)]));
const legacy: Record<string, string> = {
  "sales-bd": "Strategy_Intelligence_Agent_System.md", marketing: "Marketing_Agent_System.md",
  "meta-ads": "Growth_Demand_Agent_System.md", "finance-ops": "Finance_Operations_Agent_System.md",
  "client-success": "Client_Success_PM_Agent_System.md", "web-design": "Web_Design_UX_Agent_System.md",
  "web-dev": "Web_Development_Agent_System.md", "ai-automation": "AI_Systems_Automation_Agent_System.md",
};
let checks = 0;
function check(name: string, run: () => void) { run(); checks++; console.log(`PASS ${name}`); }
check("eight canonical departments; two independent oversight roles", () => {
  assert.equal(CANONICAL_DEPARTMENTS.length, 8); assert.equal(OVERSIGHT_TAXONOMY.length, 2);
  assert.equal(new Set(CANONICAL_DEPARTMENTS.map((dept) => dept.name)).size, 8);
  assert.ok(!CANONICAL_DEPARTMENTS.some((dept) => ["hq", "qa", "meta-ads"].includes(dept.id)));
  assert.equal(DEPARTMENTS.length, 8);
  assert.equal(ALL_RUNTIME_DEPARTMENTS.length, 9); // eight departments plus legacy Growth adapter
});
check("all old routes preserve exact instruction filenames; Revenue is additive", () => {
  for (const [id, file] of Object.entries(legacy)) assert.equal(getDepartment(id)?.file, file);
  assert.equal(getDepartment("sales_bd")?.file, "Sales_BD_Agent_System.md");
  assert.equal(getDepartment("unknown"), undefined);
  assert.equal(resolveSwarmAgent("sales-bd").id, "lead-gen");
  assert.equal(resolveSwarmAgent("meta-ads").id, "social-media");
  assert.equal(SWARM_ROSTER.length, 7);
});
check("twelve existing source IDs retained; Meta is a Marketing branch", () => {
  assert.equal(sourceFiles.length, 12);
  sourceFiles.forEach((file) => assert.ok(classifyDepartmentSource(file)));
  const meta = classifyDepartmentSource("Meta_Ads_Agent_System.md")!;
  assert.deepEqual(meta.taxonomyPath, ["Brand & Growth Marketing", "Paid Media & Performance", "Meta Ads"]);
  assert.equal(meta.parentId, "agent:marketing_agent_system");
  assert.equal(classifyDepartmentSource("Sales_BD_Agent_System.md")?.title, "Revenue & Partnerships");
});
check("seven real specialist assignments; persisted status/history preserved", () => {
  assert.equal(agents.length, 7);
  assert.equal(agents.find((agent) => agent.id === "ui-finish-gate-reviewer")?.assignment?.verifiesDepartmentId, "quality_risk_governance");
  const old = { ...agents[1], division: "Engineering", status: "success" as const, lastRun: "historical timestamp" };
  const projected = withAgentTaxonomy(old);
  assert.equal(projected.division, "Web & Platform Engineering");
  assert.equal(projected.status, old.status); assert.equal(projected.lastRun, old.lastRun); assert.equal(old.division, "Engineering");
  assert.equal(Object.keys(SPECIALIST_ASSIGNMENTS).length, 7);
});
check("specialist intent routing still selects real existing IDs", () => {
  assert.equal(detectHandoff("outbound-strategist", { task: "React frontend components styling performance" })?.targetAgentId, "frontend-developer");
  assert.equal(detectHandoff("frontend-developer", { task: "outbound prospecting sequences ICP personalization pipeline" })?.targetAgentId, "outbound-strategist");
});
check("permission projection never aliases grants or drops unknown restrictions", () => {
  assert.ok(departmentHasPermission([], "sales_bd"));
  assert.ok(departmentHasPermission(["meta-ads"], "meta-ads"));
  assert.ok(!departmentHasPermission(["meta-ads"], "marketing"));
  assert.ok(!departmentHasPermission(["sales-bd"], "sales_bd"));
  assert.ok(!departmentHasPermission(["marketing"]));
  assert.throws(() => validateDepartmentPermissions(["unknown"]), /Unknown/);
  assert.deepEqual(validateDepartmentPermissions(["meta-ads", "meta-ads", "sales_bd"]), ["meta-ads", "sales_bd"]);
});
check("BYO shared access is scoped, unique and keeps existing non-colliding names", () => {
  const server: McpServerDef = { id: "test-shared", name: "Fixture", origin: "byo-mcp", transport: "http", allowedDepartments: ["marketing", "sales_bd"], createdAt: "2026-01-01", status: "connected", detectedTools: [{ name: "lookup", description: "fixture" }, { name: "lookup", description: "duplicate" }] };
  assert.equal(buildByoMcpTools([server], "marketing").length, 1);
  assert.equal(buildByoMcpTools([server], "sales_bd")[0].name, "lookup");
  assert.equal(buildByoMcpTools([server], "web-dev").length, 0);
  assert.equal(buildByoMcpTools([server]).length, 0);
  const shared = { ...server, id: "second", allowedDepartments: [] };
  assert.equal(buildByoMcpTools([shared]).length, 1);
  const names = buildByoMcpTools([server, shared], "marketing").map((tool) => tool.name);
  assert.equal(new Set(names).size, 2);
  assert.equal(buildByoMcpTools([{ ...shared, status: "disconnected" }]).length, 0);
});
check("all persisted historical jobs and every department assignment resolve unchanged", () => {
  const jobs = JSON.parse(fs.readFileSync("data/jobs.json", "utf8")) as Job[];
  for (const job of jobs) {
    const snapshot = JSON.stringify(job);
    for (const step of job.steps) if (step.departmentId) assert.ok(getDepartment(step.departmentId), `unresolved step ${step.departmentId}`);
    for (const assignment of job.planSnapshot?.assignments ?? []) assert.ok(getDepartment(assignment.departmentId));
    const projected = jobView(job);
    assert.equal(projected.departments.filter((dept) => dept.kind !== "branch").length, 8);
    for (const step of job.steps.filter((step) => step.departmentId)) assert.ok(projected.departments.some((dept) => dept.id === (step.departmentId === "meta-ads" ? step.departmentId : canonicalDepartmentId(step.departmentId!))));
    assert.equal(JSON.stringify(job), snapshot);
  }
  console.log(`  Read-only compatibility check: ${jobs.length} existing jobs`);
});
check("Marketing parent includes real branch instructions; instruction hashes match prompts", () => {
  const prompt = loadInstructions("Marketing_Agent_System.md");
  assert.ok(prompt.includes("BRANCH SOURCE: Meta_Ads_Agent_System.md"));
  assert.ok(prompt.includes("BRANCH SOURCE: Growth_Demand_Agent_System.md"));
  assert.equal(hashInstructions("Marketing_Agent_System.md"), crypto.createHash("sha256").update(prompt).digest("hex").slice(0, 12));
});

process.env.PUBLIC_PREVIEW_MODE = "false";
process.env.BETA_MODE = "false";
const graph = await loadSpatialGraph();
check("owner graph has eight canonical roots, separate oversight, twelve original sources", () => {
  assert.equal(graph.nodes.filter((node) => node.taxonomyKind === "department").length, 8);
  assert.equal(graph.nodes.filter((node) => node.taxonomyKind === "oversight").length, 2);
  assert.equal(graph.nodes.filter((node) => node.source === "agents").length, 12);
  for (const file of sourceFiles) assert.ok(graph.nodes.some((node) => node.id === departmentGraphId(file)));
  assert.equal(graph.nodes.filter((node) => node.taxonomyKind === "specialist").length, 7);
  const meta = graph.nodes.find((node) => node.id === "agent:meta_ads_agent_system")!;
  assert.equal(meta.parentId, "agent:marketing_agent_system");
  assert.ok(graph.links.some((link) => link.source === meta.parentId && link.target === meta.id && link.relation === "taxonomy"));
  assert.ok(graph.links.some((link) => link.source === "specialist:ui-finish-gate-reviewer" && link.target === "agent:quality_assurance_agent_system" && link.relation === "verification"));
});
check("real connectors appear once with shared, deduplicated permission edges", () => {
  assert.equal(new Set(graph.nodes.map((node) => node.id)).size, graph.nodes.length);
  assert.equal(new Set(graph.links.map((link) => `${link.source}->${link.target}`)).size, graph.links.length);
  const servers = JSON.parse(fs.readFileSync("data/mcp-servers.json", "utf8")) as McpServerDef[];
  for (const server of servers.filter((server) => (server.status ?? "connected") === "connected")) {
    assert.equal(graph.nodes.filter((node) => node.id === `mcp:${server.id}`).length, 1);
    if (!server.allowedDepartments.length) assert.equal(graph.links.filter((link) => link.target === `mcp:${server.id}` && link.relation === "permission").length, 10);
  }
  const ids = new Set(graph.nodes.map((node) => node.id));
  graph.links.forEach((link) => { assert.ok(ids.has(link.source)); assert.ok(ids.has(link.target)); });
  graph.nodes.forEach((node) => assert.equal(node.degree, graph.links.filter((link) => link.source === node.id || link.target === node.id).length));
});
process.env.PUBLIC_PREVIEW_MODE = "true";
assert.equal((await loadSpatialGraph()).nodes.length, 0);
check("public preview stays empty and beta demo stays neutral", () => {
  const demo = buildDemoGraph();
  const serialized = JSON.stringify(demo);
  for (const taxon of [...DEPARTMENT_TAXONOMY, ...OVERSIGHT_TAXONOMY]) assert.ok(!serialized.includes(taxon.name));
  assert.ok(!demo.nodes.some((node) => node.taxonomyKind));
});
check("tests preserve instruction files and local data stores byte-for-byte", () => {
  for (const [file, hash] of before) assert.equal(digest(file), hash, `modified protected file ${path.basename(file)}`);
});
console.log(`\n${checks} taxonomy / routing / history / permission / graph checks PASS. No external tool calls.`);

check("all registered aliases resolve, including namespace-sensitive Sales/BD", () => {
 for (const [alias, id] of Object.entries(LEGACY_DEPARTMENT_ALIASES)) {
  assert.equal(resolveDepartmentAlias(alias), id);
  assert.equal(resolveDepartmentAlias(alias.toLowerCase()), id);
  assert.equal(canonicalizeDepartmentText(alias), DEPARTMENT_TAXONOMY.concat(OVERSIGHT_TAXONOMY).find(t => t.id === id)!.name);
 }
 assert.equal(resolveDepartmentAlias("sales-bd"), "strategic_intelligence");
 assert.equal(resolveDepartmentAlias("Sales/BD"), "revenue_partnerships");
 assert.equal(resolveDepartmentAlias("not-a-department"), undefined);
 assert.equal(departmentMatchesQuery("marketing", "Meta Ads Department"), true);
 assert.equal(departmentMatchesQuery("sales-bd", "Sales BD Department"), false);
});
check("current output projections suppress all registered former department labels", () => {
 const legacyText = Object.keys(LEGACY_DEPARTMENT_ALIASES).join("; ");
 const visible = canonicalizeDepartmentText(legacyText);
 assert.equal(canonicalizeDepartmentText(visible), visible);
 for (const alias of Object.keys(LEGACY_DEPARTMENT_ALIASES)) assert.ok(!visible.toLowerCase().includes(alias.toLowerCase()), alias);
 assert.equal(departmentStepLabel({kind:"plan", label:"GrowForge HQ"}), "Executive Orchestration");
 assert.equal(departmentStepLabel({kind:"qa", label:"Quality Assurance"}), "Quality, Risk & Governance");
 assert.equal(departmentStepLabel({departmentId:"meta-ads", label:"Growth Demand Department"}), "Brand & Growth Marketing / Demand Generation (legacy route)");
 assert.ok(taxonomyPrompt().includes("id: revenue_partnerships; name: Revenue & Partnerships"));
});
check("owned system documents have canonical identity and branch parent metadata", () => {
 for (const file of sourceFiles) {
  const content=fs.readFileSync(path.join(root,file),"utf8");const classification=classifyDepartmentSource(file)!;
  assert.ok(content.includes("CANONICAL ID: "+classification.departmentId), file);
  assert.ok(content.includes("CANONICAL NAME: "+DEPARTMENT_TAXONOMY.concat(OVERSIGHT_TAXONOMY).find(t=>t.id===classification.departmentId)!.name), file);
  assert.ok(content.includes("DRAFT"), file);
  assert.equal(canonicalizeDepartmentText(content), content, file);
  if(classification.kind==="branch")assert.ok(content.includes("PARENT ID: brand_growth_marketing"),file);
 }
});
check("vendor blueprint policy uses IDs and never claims installation", () => {
 const records=JSON.parse(fs.readFileSync("src/data/vaultCapabilities.json","utf8"));
 const unknown=new Set<string>();
 for(const record of records){const policy=blueprintPolicy(record.category);assert.equal(policy.capabilityState,"catalog-only");if(policy.mappingState==="unmapped")unknown.add(record.category);for(const id of policy.departmentIds)assert.ok([...DEPARTMENT_TAXONOMY,...OVERSIGHT_TAXONOMY].some(t=>t.id===id));}
 assert.deepEqual([...unknown], [], "unmapped vendor category IDs require explicit review");
 assert.deepEqual(blueprintPolicy("nonexistent").departmentIds, []);
});
console.log(checks+" total semantic taxonomy checks PASS.");

check("Explore/Core/Systems/project/NORA sources contain no former department-label literals", () => {
 const files=["src/components/spatial/SpatialHud.tsx","src/components/spatial/NoteReaderModal.tsx","src/components/spatial/CoreZoomTier.tsx","src/components/spatial/CoreCommandCenter.tsx","src/components/workspace/AIBrainCanvas.tsx","src/components/workspace/ProjectCanvas.tsx","src/components/workspace/MasterFindingsView.tsx","src/app/api/router/route.ts"];
 for(const file of files){const content=fs.readFileSync(file,"utf8");for(const alias of Object.keys(LEGACY_DEPARTMENT_ALIASES))assert.ok(!content.includes(alias),file+": "+alias);}
});
check("historical output projection leaves saved jobs intact", () => {
 const raw=JSON.parse(fs.readFileSync("data/jobs.json","utf8"));const jobs: Job[]=Array.isArray(raw)?raw:raw.jobs;
 const clone=structuredClone(jobs[0]);const source=Object.keys(LEGACY_DEPARTMENT_ALIASES).join("; ");clone.finalOutput=source;for(const step of clone.steps){step.output=source;step.label=step.kind==="qa"?"Quality Assurance":step.label;}
 const before=JSON.stringify(clone);const view=jobView(clone);
 assert.equal(JSON.stringify(clone),before);
 assert.equal(view.finalPreview,canonicalizeDepartmentText(source.slice(0,900)));
 for(const step of view.steps)assert.equal(step.preview,canonicalizeDepartmentText(source.slice(0,700)));
});
check("all existing helper templates and manifest references remain truthful", () => {
 for(const [id,assignment] of Object.entries(REFERENCE_AGENT_ASSIGNMENTS)){assert.ok(fs.existsSync(path.join(root,".claude/agents",id+".md")));assert.ok(DEPARTMENT_TAXONOMY.some(t=>t.id===assignment.departmentId));assert.ok(!agents.some(a=>a.id===id));}
 const manifest=JSON.parse(fs.readFileSync(path.join(root,"skills-lock.json"),"utf8"));for(const id of Object.keys(manifest.skills)){const policy=skillPolicy(id);assert.equal(policy.capabilityState,"reference-only");assert.equal(policy.mappingState,"unmapped");assert.deepEqual(policy.departmentIds,[]);}
 const branch=fs.readFileSync(path.join(root,"Growth_Demand_Agent_System.md"),"utf8");assert.ok(!branch.includes("not assigned to any branch"));assert.ok(branch.includes("Revenue & Partnerships [canonical ID: revenue_partnerships]"));
});
console.log(checks+" final semantic taxonomy checks PASS.");

