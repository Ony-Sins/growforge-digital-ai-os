"use client";

/**
 * The Focus instrument (W6.2): the Workbench expanded outward into a dedicated reading field. It is the SAME selected entity and the SAME section as the Workbench it grows from; it adds no
 * selection, no section switcher and no content of its own. One affordance leaves it ("Back to Workbench"); Esc does the same.
 *
 * Form: the Workbench's material (smoked obsidian slab, partial titanium edges, restrained catches, a joint on the graph-facing edge that follows the entity) at a much larger scale; the reading
 * field is an inset plane with a comfortable measure. Drawn with SVG fills / strokes / gradients only: no backdrop-filter, blur, filter or shadow. It GROWS from the Workbench's footprint by a
 * paint-only clip-path animation (reduced motion: it simply is), so nothing is re-laid-out during the transition.
 * Desktop: a side instrument over the graph's strip (the graph is receded and inert behind it). Phones: a dedicated full-width reader over the stage.
 */
import { useEffect, useId, useRef } from "react";
import type { PeekModel } from "./missionWorktreePeek";
import type { IntelHeader } from "./missionIntelHeader";
import { FOCUS, focusShape } from "./missionWorkbenchLayout";
import type { WorkbenchSide } from "./missionWorkbenchLayout";
import type { WorkbenchContent } from "./missionWorkbenchContent";
import { WorkbenchReading } from "./WorkbenchReading";
import styles from "./MissionFocusPlane.module.css";

export interface FocusBox { x: number; y: number; w: number; h: number }
export function MissionFocusPlane({ model, sectionLabel, content, box, side, phone, reduced, from, onBack, onNavigate, identity, parent }: {
  /** C7G: the same identity header as the Workbench (recorded status, parent context, one recorded purpose line). */ identity?: IntelHeader; parent?: string;
  model: PeekModel; sectionLabel: string; content: WorkbenchContent; box: FocusBox; side: WorkbenchSide | "slot"; phone: boolean; reduced: boolean;
  /** Inset (px) of the Workbench footprint inside this box, per side: the growth starts from it. Absent on phones. */
  from?: { top: number; right: number; bottom: number; left: number }; onBack: () => void;
  /** A link inside the content: explicit Focus navigation (the only way another entity follows while Focus is open). */ onNavigate: (entityId: string) => void;
}) {
  const uid = useId().replace(/:/g, "");
  const panel = useRef<HTMLDivElement>(null);
  const shape = focusShape(box.w, box.h, phone); // only its header height / near rim are used: the surfaces are CSS
  // Focus opens at the top of the section (reading starts from the beginning); keyboard focus lands on the reading field so arrows / Page keys scroll it at once.
  useEffect(() => { panel.current?.focus({ preventScroll: true }); }, []);
  // Navigating inside Focus to another entity / section starts that reading at its top.
  useEffect(() => { panel.current?.scrollTo?.({ top: 0 }); panel.current?.focus({ preventScroll: true }); }, [model.entityId, sectionLabel]);
  const vars = { "--head": `${shape.H}px`, "--near": `${shape.near}px`, "--far": `${phone ? 0 : 10}px`, "--bot": `${phone ? 0 : 8}px`, "--measure": `${FOCUS.readingMax}px`,
    ...(from && !reduced ? { "--from-t": `${from.top}px`, "--from-r": `${from.right}px`, "--from-b": `${from.bottom}px`, "--from-l": `${from.left}px` } : {}) } as React.CSSProperties;
  return <section className={styles.focus} data-focus-plane data-side={side} data-phone={phone || undefined} data-grow={from && !reduced ? "" : undefined} role="region" aria-labelledby={`focus-title-${uid}`}
    style={{ ...vars, transform: `translate(${box.x}px,${box.y}px)`, width: box.w, height: box.h }}>
    <i className={styles.surface} aria-hidden="true" />
    <i className={styles.field} aria-hidden="true" />
    {!phone && <i className={styles.joint} aria-hidden="true" />}
    <header className={styles.head}>
      <div className={styles.id}>
        <p className={styles.eyebrow}><span className={styles.depth}>Focus</span><span aria-hidden="true"> · </span>{sectionLabel}<span aria-hidden="true"> · </span>{model.typeLabel}</p>
        <h3 id={`focus-title-${uid}`} className={styles.title} title={model.title}>{model.title}</h3>
        {identity && <>
          <p className={styles.ident}><span className={styles.pill} data-tone={identity.status.tone} title={identity.status.note}><i aria-hidden="true" />{identity.status.label}</span>{parent && <span className={styles.parent} title={parent}>{parent}</span>}</p>
          {identity.brief && <p className={styles.purpose} title={identity.brief}>{identity.brief}</p>}
        </>}
      </div>
      <button className={styles.back} onClick={onBack} aria-label={`Back to Workbench: ${model.title}, ${sectionLabel}`}><i aria-hidden="true">‹</i><span>Back to Workbench</span></button>
    </header>
    <div className={styles.content} ref={panel} tabIndex={0} role="document" aria-label={`${sectionLabel} of ${model.title}, full reading`}>
      <div className={styles.measure}><WorkbenchReading content={content} phone={phone} scale="focus" onSelect={onNavigate} /></div>
    </div>
  </section>;
}
