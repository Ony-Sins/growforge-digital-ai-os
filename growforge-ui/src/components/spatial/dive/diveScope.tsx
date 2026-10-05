"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DIVE_SCOPE_EVENT, scopeText, semanticAddress, type DiveAddress, type DiveEntityRef, type DiveLensId, type DiveScopeDetail, lensById } from "@/lib/diveLenses";

/**
 * Selection sources that already exist. Each lens inspector already announces what it
 * has selected (and clears it on unmount) for NORA; the scope is derived from those
 * same events, so there is no second competing state system.
 */
export const FINANCE_CONTEXT_EVENT = "growforge:finance-context";
const SOURCES: { event: string; type: string; read: (detail: Record<string, unknown>) => { id: unknown; title: unknown } }[] = [
  { event: "growforge:mission-context", type: "mission", read: d => ({ id: d.id, title: d.title }) },
  { event: "growforge:department-context", type: "department", read: d => ({ id: d.departmentId, title: d.title }) },
  { event: "growforge:agent-context", type: "agent", read: d => ({ id: d.id, title: d.title }) },
  { event: "growforge:workflow-context", type: "workflow", read: d => ({ id: d.id, title: d.title }) },
  { event: "growforge:tool-record", type: "tool", read: d => ({ id: d.id, title: d.title }) },
  { event: "growforge:intelligence-record", type: "evidence", read: d => ({ id: d.id, title: d.title }) },
  { event: "growforge:context-record", type: "context_record", read: d => ({ id: d.id, title: d.title }) },
  { event: FINANCE_CONTEXT_EVENT, type: "module", read: d => ({ id: d.id, title: d.title }) },
];

type Selection = { event: string; entity: DiveEntityRef };

/** Owns the scope for the open lens and publishes it for NORA. Mount once, in DiveOverview. */
export function useDiveScopeAddress(lensId: DiveLensId): DiveAddress {
  // A selection belongs to the lens it was made in. State is reset by deriving it during render.
  const [state, setState] = useState<{ lensId: DiveLensId; selection: Selection | null }>({ lensId, selection: null });
  if (state.lensId !== lensId) setState({ lensId, selection: null });
  const selection = state.lensId === lensId ? state.selection : null;
  useEffect(() => {
    const listeners = SOURCES.map(source => {
      const handler = (event: Event) => {
        const detail = (event as CustomEvent<Record<string, unknown> | null>).detail;
        const { id, title } = detail ? source.read(detail) : { id: null, title: null };
        if (typeof id === "string" && id && typeof title === "string" && title) setState(current => ({ ...current, selection: { event: source.event, entity: { type: source.type, id, label: title } } }));
        else setState(current => (current.selection?.event === source.event ? { ...current, selection: null } : current));
      };
      window.addEventListener(source.event, handler);
      return () => window.removeEventListener(source.event, handler);
    });
    return () => listeners.forEach(remove => remove());
  }, []);
  const address = useMemo<DiveAddress>(() => (selection ? { lensId, entity: selection.entity } : { lensId }), [lensId, selection]);
  useEffect(() => {
    const lens = lensById(address.lensId);
    const detail: DiveScopeDetail = lens ? { lensId: address.lensId, lens: lens.label, scope: scopeText(address), address: semanticAddress(address), entity: address.entity, detail: address.detail } : null;
    window.dispatchEvent(new CustomEvent(DIVE_SCOPE_EVENT, { detail }));
  }, [address]);
  useEffect(() => () => { window.dispatchEvent(new CustomEvent(DIVE_SCOPE_EVENT, { detail: null })); }, []);
  return address;
}

const DiveScopeContext = createContext<DiveAddress | null>(null);
export function DiveScopeProvider({ address, children }: { address: DiveAddress; children: ReactNode }) {
  return <DiveScopeContext.Provider value={address}>{children}</DiveScopeContext.Provider>;
}
export function useDiveScope(): DiveAddress | null {
  return useContext(DiveScopeContext);
}
