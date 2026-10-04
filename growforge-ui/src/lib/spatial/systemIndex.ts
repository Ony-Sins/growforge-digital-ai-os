import type { GraphNode } from "./obsidianReader";
import { DEPARTMENT_TAXONOMY, OVERSIGHT_TAXONOMY, canonicalDepartmentId } from "../departmentTaxonomy";

export const SYSTEM_INDEX = [
  { id: "departments", label: "Departments" },
  { id: "oversight", label: "Oversight" },
  { id: "models", label: "Models" },
  { id: "connectors", label: "Connectors" },
  { id: "capabilities", label: "Capabilities" },
  { id: "specialists", label: "Specialists" },
] as const;
export type SystemIndexCategory = typeof SYSTEM_INDEX[number]["id"];

/** Source records, never inferred installations or fabricated taxonomy nodes. */
export function systemIndexRecords(nodes: readonly GraphNode[], category: SystemIndexCategory): GraphNode[] {
  const records = nodes.filter((node) => {
    switch (category) {
      case "departments": return node.taxonomyKind === "department";
      case "oversight": return node.taxonomyKind === "oversight";
      case "models": return node.source === "models";
      case "connectors": return node.source === "mcp";
      case "capabilities": return node.source === "capabilities" || node.taxonomyKind === "branch";
      case "specialists": return node.source === "specialists" || node.taxonomyKind === "specialist";
    }
  });
  const taxonomy = category === "departments" ? DEPARTMENT_TAXONOMY : category === "oversight" ? OVERSIGHT_TAXONOMY : [];
  const order = new Map(taxonomy.map((taxon, index) => [taxon.id as string, index]));
  return records.sort((a, b) =>
    (order.get(canonicalDepartmentId(a.departmentId ?? "")) ?? Number.MAX_SAFE_INTEGER)
    - (order.get(canonicalDepartmentId(b.departmentId ?? "")) ?? Number.MAX_SAFE_INTEGER)
    || a.title.localeCompare(b.title));
}
