"use client";

/**
 * WorkspaceShell (C8 / S1): the lens-agnostic, viewport-centred detail workspace. It knows nothing about missions, agents or departments: a lens passes an identity (eyebrow, complete title, optional
 * context line and status strip), a section rail, the active section's content and a few selectors (what to make inert underneath, which live peers belong to the focus scope).
 *
 * Layering: the lens underneath stays MOUNTED with its geometry unchanged (it is only made inert); a restrained backdrop dims it. The companion (NORA) stays interactive and sits inside the focus scope.
 *
 * Accessibility semantics (deliberate): `role="dialog"`, labelled by the title, and NOT `aria-modal`. aria-modal promises that nothing outside the dialog is operable; the companion is, by design, an operable
 * peer. Isolation is provided by `inert` on the lens underneath (those parts really are removed from the tab order and the accessibility tree), and Tab cycles through one scope: the workspace, then the companion.
 *
 * Closing: Close button, Escape (from inside the workspace; layered: confirmation, then reading mode, then the workspace) or a click that BEGINS and ENDS on the backdrop. When the lens reports consequential work in
 * progress (`guard` returns a sentence) the shell asks before discarding it.
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { closeDecision, escapeStep, railTarget, workspaceGeometry, type CloseReason, type WorkspaceMode } from "./workspaceShellModel";
import { HYPOTHETICAL_LABEL } from "./workspaceTokens";
import { useWorkspaceLayer, useWorkspaceReducedMotion, useWorkspaceViewport } from "./useWorkspaceLayer";
import { MORPH_MS, useWorkspaceMorph } from "./useWorkspaceMorph";
import styles from "./WorkspaceShell.module.css";

export interface WorkspaceRailItem { id: string; label: string }
export interface WorkspaceShellProps {
  open: boolean; onClose: () => void;
  eyebrow: string; /** Always shown in full: it wraps, it is never cut with an ellipsis. */ title: string; context?: string;
  /** The lens's status strip (execution / review / approval / verification stay separate there). */ status?: ReactNode;
  rail: readonly WorkspaceRailItem[]; section: string; onSection: (id: string) => void;
  mode: WorkspaceMode; onMode: (mode: WorkspaceMode) => void;
  /** Returns a sentence when consequential work (an unsaved edit, an approval in progress) would be lost by closing; null when closing is safe. */ guard?: () => string | null;
  /** Where focus returns when the workspace closes if the original trigger is gone. */ returnTo: () => HTMLElement | null;
  backgroundSelectors: readonly string[]; companionSelectors: readonly string[];
  /** S2.2A: the element the workspace visibly EXPANDS out of on open and CONTRACTS back into on close (the lens's own summary surface). Omitted / absent / hidden: the plain entrance. */ origin?: () => HTMLElement | null;
  /** Reserved for what-if / scenario analysis: rendered in a visibly distinct "hypothetical" region, never mixed into recorded content. */ scenario?: ReactNode;
  children: ReactNode;
}

/** The exit lasts as long as the contraction (the surface needs the layer mounted until it lands). */
const EXIT_MS = MORPH_MS + 20;

export function WorkspaceShell({ open, onClose, eyebrow, title, context, status, rail, section, onSection, mode, onMode, guard, returnTo, backgroundSelectors, companionSelectors, origin, scenario, children }: WorkspaceShellProps) {
  const uid = useId().replace(/:/g, "");
  const reduced = useWorkspaceReducedMotion();
  const viewport = useWorkspaceViewport();
  const geometry = useMemo(() => workspaceGeometry(viewport, mode), [viewport, mode]);
  // presence: mounted while open and for the short exit; the exit only exists with motion
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  useEffect(() => {
    if (open || !mounted) return;
    const timer = setTimeout(() => setMounted(false), reduced ? 0 : EXIT_MS);
    return () => clearTimeout(timer);
  }, [open, mounted, reduced]);
  const closing = mounted && !open;

  const [root, setRoot] = useState<HTMLElement | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const tabs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [confirm, setConfirm] = useState<string | null>(null);
  useWorkspaceMorph({ open, closing, mounted, reduced, kind: geometry.kind, target: { left: geometry.left, top: geometry.top, width: geometry.width, height: geometry.height }, origin, rootRef, surfaceRef });
  useWorkspaceLayer({ open, root, initial: titleRef, backgroundSelectors, companionSelectors, returnTo, lockScroll: geometry.kind === "full" });
  useEffect(() => { if (confirm) keepRef.current?.focus(); }, [confirm]);

  const requestClose = (reason: CloseReason) => {
    const decision = closeDecision(reason, guard ? guard() : null);
    if (decision.action === "confirm") setConfirm(decision.message); else { setConfirm(null); onClose(); }
  };
  const downOnBackdrop = useRef(false);
  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.preventDefault(); event.stopPropagation();
    const step = escapeStep({ mode, confirming: confirm !== null });
    if (step === "dismiss-confirm") setConfirm(null); else if (step === "exit-reading") onMode("workspace"); else requestClose("escape");
  };
  const move = (event: ReactKeyboardEvent, index: number) => {
    const to = railTarget(rail.length, index, event.key);
    if (to < 0) return;
    event.preventDefault(); event.stopPropagation();
    onSection(rail[to].id); tabs.current[rail[to].id]?.focus();
  };

  if (!mounted) return null;
  const reading = mode === "reading";
  const active = rail.find(r => r.id === section) ?? rail[0];
  return <>
    {/* S2.2A: the morph surface sits OUTSIDE the backdrop so the backdrop's own fade never dims it; only its own animation controls it */}
    <div ref={surfaceRef} className={styles.morph} hidden aria-hidden="true" />
    <div className={styles.backdrop} data-workspace-backdrop data-closing={closing || undefined} data-reduced={reduced || undefined}
    onPointerDown={event => { downOnBackdrop.current = event.target === event.currentTarget; }}
    onClick={event => { if (downOnBackdrop.current && event.target === event.currentTarget) requestClose("backdrop"); downOnBackdrop.current = false; }}>
    <section ref={el => { rootRef.current = el; setRoot(el); }} className={styles.root} role="dialog" aria-labelledby={`ws-title-${uid}`} data-workspace data-geometry={geometry.kind} data-mode={mode} data-closing={closing || undefined} inert={closing ? true : undefined}
      style={{ left: geometry.left, top: geometry.top, width: geometry.width, height: geometry.height, ["--ws-pad-bottom" as string]: `${geometry.padBottom}px` }} onKeyDown={onKeyDown}>
      <header className={styles.head}>
        <div className={styles.id}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h2 id={`ws-title-${uid}`} ref={titleRef} tabIndex={-1} className={styles.title}>{title}</h2>
          {context && <p className={styles.context}>{context}</p>}
          {status && <div className={styles.status}>{status}</div>}
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.action} aria-pressed={reading} onClick={() => onMode(reading ? "workspace" : "reading")}>{reading ? "Exit reading mode" : "Reading mode"}</button>
          <button type="button" className={styles.action} data-close onClick={() => requestClose("button")} aria-label={`Close ${title}`}>Close<span aria-hidden="true"> ✕</span></button>
        </div>
      </header>
      <div className={styles.body}>
        {!reading && <nav className={styles.rail} role="tablist" aria-orientation="vertical" aria-label={`Sections of ${title}`}>
          {rail.map((item, i) => <button key={item.id} ref={el => { tabs.current[item.id] = el; }} type="button" role="tab" id={`ws-tab-${uid}-${item.id}`} aria-selected={item.id === active?.id} aria-controls={`ws-panel-${uid}`}
            tabIndex={item.id === active?.id ? 0 : -1} data-section={item.id} className={styles.tab} onClick={() => onSection(item.id)} onKeyDown={event => move(event, i)}><i aria-hidden="true" /><span>{item.label}</span></button>)}
        </nav>}
        <div className={styles.content} id={`ws-panel-${uid}`} role="tabpanel" aria-labelledby={active ? `ws-tab-${uid}-${active.id}` : undefined} tabIndex={0}>
          {children}
          {scenario && <section className={styles.hypothetical} data-hypothetical aria-label={HYPOTHETICAL_LABEL}><p className={styles.hypoLabel}>{HYPOTHETICAL_LABEL}</p>{scenario}</section>}
        </div>
      </div>
      {confirm && <div className={styles.confirm} role="alertdialog" aria-labelledby={`ws-confirm-${uid}`}>
        <p id={`ws-confirm-${uid}`}>{confirm}</p>
        <button type="button" ref={keepRef} className={styles.action} data-keep onClick={() => setConfirm(null)}>Keep working</button>
        <button type="button" className={styles.action} data-discard onClick={() => { setConfirm(null); onClose(); }}>Discard and close</button>
      </div>}
    </section>
  </div>
  </>;
}
