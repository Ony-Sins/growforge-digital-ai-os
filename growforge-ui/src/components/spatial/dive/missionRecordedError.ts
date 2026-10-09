import { canonicalizeDepartmentText } from "@/lib/departmentTaxonomy";

export const MAX_ERROR_CHARS = 170;

/** Recorded error text made safe to show: control characters and runs of whitespace collapsed, credential-looking tokens removed, truncated. */
export function sanitizeRecordedError(raw: string | null | undefined, max = MAX_ERROR_CHARS): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = canonicalizeDepartmentText(raw)
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [removed]")
    .replace(/\b(?:sk|pk|rk|ghp|gho|xox[abp])[-_][A-Za-z0-9_-]{12,}/g, "[removed]")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  return cleaned.length > max ? `${cleaned.slice(0, max).trimEnd()}…` : cleaned;
}
