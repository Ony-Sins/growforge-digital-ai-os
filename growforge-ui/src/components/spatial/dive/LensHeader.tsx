"use client";

import type { ReactNode } from "react";
import { diveDepth, lensById, scopeText, semanticAddress, type DiveLensId } from "@/lib/diveLenses";
import { useDiveScope } from "./diveScope";
import { compactScopeText } from "./missionFlowModel";
import styles from "./LensHeader.module.css";

export type LensMetric = {
  label: string;
  /** null means unknown. It renders as an em dash, never as a zero. */
  value: number | string | null;
  tone?: "live" | "warn" | "ok";
};

/** Shows what NORA is currently focused on. Reads the scope owned by DiveOverview. */
export function NoraScope({ className }: { className?: string }) {
  const address = useDiveScope();
  if (!address) return null;
  const text = scopeText(address);
  return <p className={`${styles.scope} ${className ?? ""}`} data-nora-scope data-semantic-id={semanticAddress(address)} data-scope-depth={diveDepth(address)} data-entity-type={address.entity?.type} data-entity-id={address.entity?.id} title={`NORA scope: ${text}`}>
    <span>NORA SCOPE</span><strong data-scope-full>{text}</strong><strong data-scope-compact aria-hidden="true">{compactScopeText(text)}</strong>
  </p>;
}

/** One header shape for every lens: identity, purpose, truthful live state, NORA scope, actions. */
export function LensHeader({ lensId, title, purpose, metrics, note, actions, entrance, quiet }: {
  /** The page heading is secondary to the workspace beneath it (Missions): smaller, dimmer, higher. */ quiet?: boolean;
  /** Resolves last when a lens materialises into the shared environment (Phase 11). */ entrance?: boolean;
  lensId: DiveLensId; title?: string; purpose?: string; metrics?: LensMetric[]; note?: string; actions?: ReactNode;
}) {
  const lens = lensById(lensId);
  if (!lens) return null;
  return <header className={styles.header} data-lens-header data-lens-id={lensId} data-entrance={entrance || undefined} data-quiet={quiet || undefined}>
    <p className={styles.eyebrow}>DIVE IN / {lens.label.toUpperCase()}</p>
    <h1>{title ?? lens.label.toUpperCase()}</h1>
    <p className={styles.purpose}>{purpose ?? lens.purpose}</p>
    <div className={styles.meta}>
      {metrics && metrics.length > 0 && <ul className={styles.metrics} aria-label={`${lens.label} live state`}>
        {metrics.map(metric => <li key={metric.label} data-tone={metric.tone} data-unknown={metric.value === null}><strong>{metric.value ?? "—"}</strong> {metric.label}</li>)}
      </ul>}
      {note && <span className={styles.note} role="status">{note}</span>}
      <NoraScope />
    </div>
    {actions && <div className={styles.actions}>{actions}</div>}
  </header>;
}
