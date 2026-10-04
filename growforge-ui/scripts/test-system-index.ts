import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEPARTMENT_TAXONOMY, OVERSIGHT_TAXONOMY } from "../src/lib/departmentTaxonomy";
import { SYSTEM_INDEX, systemIndexRecords } from "../src/lib/spatial/systemIndex";
import type { GraphNode } from "../src/lib/spatial/obsidianReader";

const node = (id: string, source: string, extra: Partial<GraphNode> = {}): GraphNode => ({
  id, source, title: id, categoryLabel: source, color: "", path: "", excerpt: "", degree: 0, ...extra,
});
const departments = DEPARTMENT_TAXONOMY.map((taxon) => node(taxon.id, "agents", { departmentId: taxon.id, title: taxon.name, taxonomyKind: "department" }));
const oversight = OVERSIGHT_TAXONOMY.map((taxon) => node(taxon.id, "agents", { departmentId: taxon.id, title: taxon.name, taxonomyKind: "oversight" }));
const records = [...departments, ...oversight,
  node("branch", "agents", { taxonomyKind: "branch", departmentId: "brand_growth_marketing" }),
  node("model", "models"), node("connector", "mcp"), node("capability", "capabilities"),
  node("specialist", "specialists", { taxonomyKind: "specialist", departmentId: "executive_orchestration" }),
  node("source-document", "docs")].reverse();
assert.deepEqual(systemIndexRecords(records, "departments").map((record) => record.id), departments.map((record) => record.id));
assert.deepEqual(systemIndexRecords(records, "oversight").map((record) => record.id), oversight.map((record) => record.id));
assert.deepEqual(SYSTEM_INDEX.map((category) => systemIndexRecords(records, category.id).length), [8, 2, 1, 1, 2, 1]);
const ids = SYSTEM_INDEX.flatMap((category) => systemIndexRecords(records, category.id).map((record) => record.id));
assert.equal(new Set(ids).size, ids.length, "records cannot appear in multiple index groups");
assert.ok(!ids.includes("source-document"), "documents are not invented system entities");
assert.equal(systemIndexRecords([], "departments").length, 0, "empty graph must not manufacture eight departments");
assert.equal(systemIndexRecords(records.filter((record) => record.id !== departments[0].id), "departments").length, 7);
const hud = readFileSync("src/components/spatial/SpatialHud.tsx", "utf8");
const departure = hud.slice(hud.indexOf("if (surface !== prevSurface)"), hud.indexOf("const selectSurface"));
assert.ok(departure.includes("setSearchOpen(false)"), "departure closes the transient search overlay");
assert.ok(!departure.includes("setQuery("), "surface departure preserves the Explore query for return");
console.log("PASS canonical order, six real-count groups, oversight/branch/specialist isolation, document exclusion and missing/empty graph truthfulness; no stores or model calls.");
