/**
 * Finance lens foundation (structure only).
 *
 * No financial backend exists yet. Every module therefore declares its source as
 * not connected, and the UI must show that state instead of a number. Nothing here
 * may hold, estimate or imply a monetary value. API token usage IS recorded
 * elsewhere (Intelligence lens); billing cost is not, and legacy static price
 * estimates are not billing receipts.
 */

export const FINANCE_MODES = ["Business", "Personal", "Combined"] as const;
export type FinanceMode = (typeof FINANCE_MODES)[number];

export const FINANCE_MODE_NOTES: Record<FinanceMode, string> = {
  Business: "Business spending, budgets and API costs for GrowForge operations.",
  Personal: "Personal finance is a separate privacy scope. Nothing is connected, and it is never mixed into Business views implicitly.",
  Combined: "A deliberate cross-scope view. Requires both scopes to be connected and explicitly allowed. Neither is connected yet.",
};

export type FinanceModuleId =
  | "finance.total_spend"
  | "finance.api_cost"
  | "finance.subscriptions"
  | "finance.budget"
  | "finance.cash_flow"
  | "finance.expense_activity";

export interface FinanceModule {
  id: FinanceModuleId;
  label: string;
  /** What this module will answer once a source exists. */
  purpose: string;
  /** Plain-language reason there is no value. Never a number. */
  unavailable: string;
  /** Detail depth (lens > module > breakdown) planned for this module. */
  breakdown: string;
  /** Spoken or typed names that should resolve to this module. */
  aliases: readonly string[];
  /** Business-only until a separate personal source and privacy scope exist. */
  scopes: readonly FinanceMode[];
}

export const FINANCE_MODULES: readonly FinanceModule[] = [
  {
    id: "finance.total_spend", label: "Total Spend",
    purpose: "All recorded outflow across the selected scope.",
    unavailable: "No financial data connected.",
    breakdown: "By category, vendor and period",
    aliases: ["total spend", "spend", "spending"],
    scopes: ["Business", "Personal", "Combined"],
  },
  {
    id: "finance.api_cost", label: "API Cost",
    purpose: "Model and provider spend attributable to GrowForge usage.",
    unavailable: "Not tracked yet. Token usage is recorded in Intelligence; billing cost is not, and static price estimates are not receipts.",
    breakdown: "By provider and project",
    aliases: ["api cost", "api costs", "model cost", "model costs", "ai cost", "ai costs"],
    scopes: ["Business"],
  },
  {
    id: "finance.subscriptions", label: "Subscriptions",
    purpose: "Recurring tool and service commitments.",
    unavailable: "Not tracked yet.",
    breakdown: "By service, renewal date and owner",
    aliases: ["subscriptions", "subscription", "recurring"],
    scopes: ["Business", "Personal", "Combined"],
  },
  {
    id: "finance.budget", label: "Budget",
    purpose: "Planned limits compared with recorded spend.",
    unavailable: "No budget defined.",
    breakdown: "By department, project and period",
    aliases: ["budget", "budgets"],
    scopes: ["Business", "Personal", "Combined"],
  },
  {
    id: "finance.cash_flow", label: "Cash Flow",
    purpose: "Money in against money out over time.",
    unavailable: "No financial data connected.",
    breakdown: "By account and period",
    aliases: ["cash flow", "cashflow"],
    scopes: ["Business", "Personal", "Combined"],
  },
  {
    id: "finance.expense_activity", label: "Expense Activity",
    purpose: "Individual recorded expenses, newest first.",
    unavailable: "No financial data connected.",
    breakdown: "Per transaction, with its source evidence",
    aliases: ["expense activity", "expenses", "transactions"],
    scopes: ["Business", "Personal", "Combined"],
  },
];

export function financeModule(id: string): FinanceModule | undefined {
  return FINANCE_MODULES.find(module => module.id === id);
}

export function financeModuleByPhrase(text: string): FinanceModule | undefined {
  const normalized = text.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  return FINANCE_MODULES.find(module => module.aliases.some(alias => normalized === alias || normalized.endsWith(` ${alias}`) || normalized.startsWith(`${alias} `)));
}

/** Modules a mode may show. A module outside the mode is hidden, not zeroed. */
export function financeModulesFor(mode: FinanceMode): FinanceModule[] {
  return FINANCE_MODULES.filter(module => module.scopes.includes(mode));
}

/** Foundation reality: no module has a connected source. */
export function financeTrackedCount(): number {
  return 0;
}
