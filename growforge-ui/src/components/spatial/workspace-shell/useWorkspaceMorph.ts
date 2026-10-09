"use client";

/**
 * Shared-surface expansion (C8 / S2.2A). When a lens names an `origin` element (for Missions: the Intelligence Panel), opening the workspace reads as that surface EXPANDING into it and closing as the workspace
 * CONTRACTING back. The lens is not touched and the workspace's own state is not duplicated: a lightweight, empty glass surface (`.morph`) animates between the two MEASURED rectangles with the Web Animations API,
 * the real origin element is hidden underneath (so no second panel is ever visible) and restored when the surface arrives, and the workspace's content only fades in / out over it (opacity, never a scale, so text is
 * never stretched). Nothing the lens renders moves; the origin keeps its layout box throughout.
 *
 * No origin (phones have no panel), a too-small origin, the full-screen sheet or reduced motion: no morph. Reduced motion still hides / restores the origin at once so two panels never coexist.
 */
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

interface Box { left: number; top: number; width: number; height: number }
export const MORPH_MS = 340;
const EASE = "cubic-bezier(.32,.72,0,1)";
const MIN = 60;
const boxOf = (r: DOMRect): Box => ({ left: r.left, top: r.top, width: r.width, height: r.height });
const px = (b: Box) => ({ left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px` });
const radiusOf = (el: HTMLElement | null) => { const r = parseFloat(el ? getComputedStyle(el).borderTopLeftRadius : "16"); return Number.isFinite(r) ? r : 16; };

function play(surface: HTMLElement, from: Box, to: Box, rFrom: number, rTo: number, mode: "in" | "out") {
  surface.hidden = false;
  Object.assign(surface.style, px(from), { borderRadius: `${rFrom}px` });
  const move = surface.animate([{ ...px(from), borderRadius: `${rFrom}px` }, { ...px(to), borderRadius: `${rTo}px` }], { duration: MORPH_MS, easing: EASE, fill: "forwards" });
  // the surface is the glass until the workspace's own glass is up (in) / until the origin is back (out)
  const fade = surface.animate(mode === "in" ? [{ opacity: 1, offset: 0 }, { opacity: 1, offset: .62 }, { opacity: 0, offset: 1 }] : [{ opacity: 0, offset: 0 }, { opacity: 1, offset: .22 }, { opacity: 1, offset: .6 }, { opacity: 0, offset: 1 }], { duration: MORPH_MS, easing: "linear", fill: "forwards" });
  Promise.allSettled([move.finished, fade.finished]).then(() => { move.cancel(); fade.cancel(); surface.hidden = true; });
}

export function useWorkspaceMorph({ open, closing, mounted, reduced, kind, target, origin, rootRef, surfaceRef }: {
  open: boolean; closing: boolean; mounted: boolean; reduced: boolean; kind: string; target: Box;
  /** The element the workspace grows out of (and returns to), or null. */ origin?: () => HTMLElement | null;
  rootRef: RefObject<HTMLElement | null>; surfaceRef: RefObject<HTMLElement | null>;
}) {
  const held = useRef<{ el: HTMLElement; opacity: string; transition: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const restore = (instant: boolean) => {
    const h = held.current; if (!h) return;
    held.current = null; clearTimeout(timer.current);
    h.el.style.transition = instant ? "none" : "opacity .2s ease-out"; h.el.style.opacity = h.opacity;
    setTimeout(() => { h.el.style.transition = h.transition; }, 260);
  };
  // OPEN: measure the origin, hide it, expand the surface (the workspace root fades in over it)
  useLayoutEffect(() => {
    if (!open) return;
    const el = origin?.() ?? null, surface = surfaceRef.current, root = rootRef.current;
    if (!el || kind === "full") return;
    const r = el.getBoundingClientRect();
    if (r.width < MIN || r.height < MIN) return;
    held.current = { el, opacity: el.style.opacity, transition: el.style.transition };
    el.style.transition = reduced ? "none" : "opacity .12s ease-out"; el.style.opacity = "0";
    if (reduced || !surface || !root) return;
    root.dataset.morph = "in";
    play(surface, boxOf(r), target, radiusOf(el), radiusOf(root), "in");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  // CLOSE: contract the surface back onto the origin and bring the origin back as it lands
  useLayoutEffect(() => {
    if (!closing) return;
    const h = held.current, surface = surfaceRef.current, root = rootRef.current;
    if (!h) return;
    if (reduced || !surface || !root) { restore(true); return; }
    root.dataset.morph = "out";
    play(surface, target, boxOf(h.el.getBoundingClientRect()), radiusOf(root), radiusOf(h.el), "out");
    timer.current = setTimeout(() => restore(false), MORPH_MS * .62);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing]);
  // safety: the origin is never left hidden (unmount, or the layer is gone)
  useEffect(() => { if (!mounted) restore(true); });
  useEffect(() => () => restore(true), []);
}
