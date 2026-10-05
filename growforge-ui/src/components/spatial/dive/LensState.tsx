"use client";

import type { ReactNode } from "react";
import styles from "./LensState.module.css";

/**
 * One presentation for every non-data state a lens can be in. Never render a zero
 * or a blank where the real state is loading, unknown, not configured or failed.
 */
export type LensStateKind = "loading" | "empty" | "unavailable" | "degraded" | "error";

const LABELS: Record<LensStateKind, string> = {
  loading: "LOADING", empty: "EMPTY", unavailable: "UNAVAILABLE", degraded: "DEGRADED", error: "ERROR",
};

export function LensState({ kind, message, detail, label, action, compact }: {
  kind: LensStateKind; message: string; detail?: string; label?: string; action?: ReactNode; compact?: boolean;
}) {
  return <div className={`${styles.state} ${compact ? styles.compact : ""}`} data-lens-state={kind} role={kind === "error" ? "alert" : "status"} aria-busy={kind === "loading" ? true : undefined}>
    <span className={styles.badge}><i aria-hidden="true" />{label ?? LABELS[kind]}</span>
    <p>{message}</p>
    {detail && <small>{detail}</small>}
    {action && <div className={styles.action}>{action}</div>}
  </div>;
}
