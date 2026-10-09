"use client";

/**
 * The Workbench instrument SHELL (W5.2R): the selected entity's Peek unfolded into an inspection instrument of three connected strata, not a panel.
 *  FRAME   an L of smoked titanium: the identity header (the Peek's eyebrow / title / lead facts + Back to Peek) across the top and the section INDEX down the
 *          graph-facing edge. The header projects past the reading plane.
 *  READING a darker, quieter inset plane that unfolds from the frame (content arrives in W5.3+; a placeholder only).
 *  JOINT   a small socket on the graph-facing edge where the attachment from the entity arrives; it follows the entity.
 * The index is generated from the W5.1 capabilities (never a fixed tab list); the active entry is coupled to the reading plane by a short rule. One persistent
 * element: it is never remounted when the selection, section or layout changes, so there is no teardown / re-entry. No backdrop-filter, blur, filter or shadow:
 * the form is drawn with SVG fills, strokes and gradients.
 */
import { useEffect, useId, useLayoutEffect, useRef } from "react";
import type { PeekModel } from "./missionWorktreePeek";
import type { IntelHeader } from "./missionIntelHeader";
import type { WorkbenchCapabilitySet, WorkbenchSectionId } from "./missionWorkbench";
import { WORKBENCH, instrumentShape, workbenchVariant, type WorkbenchSide } from "./missionWorkbenchLayout";
import { WorkbenchReading } from "./WorkbenchReading";
import type { WorkbenchContent } from "./missionWorkbenchContent";
import type { FocusResume } from "./missionWorktreeSelection";
import styles from "./MissionWorkbenchPlane.module.css";

const NEXT: Record<string, 1 | -1> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };

export interface WorkbenchBox { x: number; y: number; w: number; h: number }
export function MissionWorkbenchPlane({ id, model, caps, section, box, side, phone, reduced, content, onSection, onPick, onBack, canFocus, onFocus, resume, covered, above, identity, parent }: {
  /** C7F: the identity header's recorded facts (the same source the Intelligence panel's identity uses) and the parent context ("Mission › Departments"). */ identity?: IntelHeader; parent?: string;
  id?: string; /** Real reading content (W5.3A) or null: the placeholder stays for sections no task has built yet. */ content: WorkbenchContent | null; onPick: (entityId: string) => void; model: PeekModel; caps: WorkbenchCapabilitySet; section: WorkbenchSectionId; box: WorkbenchBox; side: WorkbenchSide | "slot"; phone: boolean; reduced: boolean;
  onSection: (id: WorkbenchSectionId) => void; onBack: () => void;
  /** W6.2: the section has long content worth full reading: show the one quiet way into Focus (it reports the reading panel's scroll position). */
  canFocus?: boolean; onFocus?: (scrollTop: number) => void;
  /** W6.2: the scroll record captured when Focus opened; restored once (per serial) when the Workbench is uncovered again. `covered` = Focus is open over this plane. */
  resume?: FocusResume | null; covered?: boolean;
  /** C1b.1: an optional action surface shown above the section's content (the plan decision in the mission's Approvals section). */ above?: React.ReactNode;
}) {
  const uid = useId().replace(/:/g, "");
  // C9: closing the Workbench is not a hard cut: as the plane unmounts, an inert, aria-hidden copy of it stays for ~0.3s and fades while the Graph glides back to its full size (the copy has no handlers, takes no pointer or focus).
  const self = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => () => {
    const el = self.current;
    if (!el?.parentElement || phone || reduced) return;
    const ghost = el.cloneNode(true) as HTMLElement;
    ghost.removeAttribute("id"); ghost.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
    ghost.setAttribute("data-wb-leaving", ""); ghost.setAttribute("aria-hidden", "true"); ghost.inert = true;
    el.parentElement.insertBefore(ghost, el);
    setTimeout(() => ghost.remove(), 340);
  }, [phone, reduced]);
  const tabs = useRef<Record<string, HTMLButtonElement | null>>({});
  const panel = useRef<HTMLDivElement>(null);
  const picked = useRef(false);
  // A new entity or section starts at the top of the reading plane; after a pick INSIDE the content (a step row, a dependency) focus lands on the plane, not on a vanished button.
  useEffect(() => {
    panel.current?.scrollTo?.({ top: 0 });
    if (picked.current) { picked.current = false; panel.current?.focus({ preventScroll: true }); }
  }, [model.entityId, section]);
  // Returning from Focus: put the reading panel back exactly where it was (once per opening). The plane normally stays mounted under Focus, so this is belt and braces for a remount (phone sheet).
  const restored = useRef(0);
  useEffect(() => {
    if (covered || !resume || resume.entityId !== model.entityId || resume.section !== section || restored.current === resume.serial) return;
    restored.current = resume.serial;
    panel.current?.scrollTo?.({ top: resume.scrollTop });
  }, [covered, resume, model.entityId, section]);
  const pick = (target: string) => { picked.current = true; onPick(target); };
  const active = caps.sections.find(s => s.id === section) ?? caps.sections[0];
  const variant = workbenchVariant(box.w, phone);
  const shape = instrumentShape(box.w, box.h, variant, phone);
  const lead = model.facts.slice(0, 2);
  const move = (event: React.KeyboardEvent, index: number) => {
    const list = caps.sections;
    let to = -1;
    if (event.key in NEXT) to = (index + NEXT[event.key] + list.length) % list.length;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = list.length - 1;
    if (to < 0) return;
    event.preventDefault(); event.stopPropagation();
    onSection(list[to].id);
    tabs.current[list[to].id]?.focus();
  };
  const meta = [active.provenance, active.count !== undefined ? `${active.count} recorded` : undefined, active.secondaryRead ? `from ${active.secondaryRead}` : undefined].filter(Boolean).join(" · ");
  const vars = { "--head": `${shape.H}px`, "--rail": `${WORKBENCH.rail}px`, "--strip": `${WORKBENCH.strip}px`, "--far": `${WORKBENCH.farInset}px`, "--bot": `${WORKBENCH.bottomInset}px` } as React.CSSProperties;
  return <aside ref={self} className={styles.plane} id={id} data-workbench data-side={side} data-variant={variant} data-phone={phone || undefined} data-reduced={reduced || undefined} data-for={model.entityId} data-section={active.id} data-kind={model.kind}
    role="region" aria-labelledby={`wb-title-${uid}`} inert={covered ? true : undefined} aria-hidden={covered ? true : undefined} data-covered={covered || undefined} style={{ ...vars, transform: `translate(${box.x}px,${box.y}px)`, width: box.w, height: box.h }}>
    <i className={styles.surface} aria-hidden="true" />
    <i className={styles.field} aria-hidden="true" />
    {!phone && <i className={styles.joint} aria-hidden="true" />}
    <header className={styles.head}>
      <div className={styles.id} key={model.entityId}>
        <p className={styles.eyebrow}>{model.typeLabel}<span aria-hidden="true"> · </span><span className={styles.depth}>Workbench</span></p>
        <h3 id={`wb-title-${uid}`} className={styles.title} title={model.title}>{model.title}</h3>
        {identity
          ? <>
            <p className={styles.ident}><span className={styles.pill} data-tone={identity.status.tone} title={identity.status.note}><i aria-hidden="true" />{identity.status.label}</span>{parent && <span className={styles.parent} title={parent}>{parent}</span>}</p>
            {identity.brief && <p className={styles.purpose} title={identity.brief}>{identity.brief}</p>}
          </>
          : <ul className={styles.lead} aria-label="Summary">{lead.map(f => <li key={f.label} data-tone={f.tone}><b>{f.label}</b> {f.value}</li>)}</ul>}
      </div>
      <div className={styles.actions}>
        {canFocus && onFocus && <button className={styles.focusBtn} onClick={() => onFocus(panel.current?.scrollTop ?? 0)} aria-label={`Open ${active.label} of ${model.title} in Focus for full reading`}><span>Focus</span><i aria-hidden="true">›</i></button>}
        <button className={styles.back} onClick={onBack} aria-label={`Back to details for ${model.title}`}><i aria-hidden="true">‹</i><span>Peek</span></button>
      </div>
    </header>
    <nav className={styles.index} role="tablist" aria-label={`Sections of ${model.title}`} aria-orientation={variant === "strip" ? "horizontal" : "vertical"}>
      {caps.sections.map((s, i) => <button key={s.id} ref={el => { tabs.current[s.id] = el; }} role="tab" id={`wb-tab-${uid}-${s.id}`} aria-selected={s.id === active.id} aria-controls={`wb-panel-${uid}`}
        tabIndex={s.id === active.id ? 0 : -1} title={s.label} data-section={s.id} data-state={s.state} className={styles.mark} onClick={() => onSection(s.id)} onKeyDown={event => move(event, i)}>
        <i aria-hidden="true" /><span>{s.label}</span>{s.id === active.id && <b className={styles.couple} aria-hidden="true" />}
      </button>)}
    </nav>
    <div className={styles.content} ref={panel} id={`wb-panel-${uid}`} role="tabpanel" aria-labelledby={`wb-tab-${uid}-${active.id}`} tabIndex={0}>
      <div className={styles.sheet} key={`${model.entityId}:${active.id}`}>
        <h4>{active.label}</h4>
        {content && above}
        {content
          ? <WorkbenchReading content={content} phone={phone} onSelect={pick} />
          : <>
            {meta && <p className={styles.meta}>{meta}</p>}
            {active.reason && <p className={styles.reason}>{active.reason}</p>}
            <p className={styles.placeholder}>{active.label} content arrives in W5.3</p>
          </>}
      </div>
    </div>
  </aside>;
}
