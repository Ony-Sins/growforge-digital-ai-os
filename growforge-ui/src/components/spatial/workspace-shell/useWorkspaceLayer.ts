"use client";

/**
 * The shell's side effects, kept out of the component so they are small and explicit:
 *  - a viewport hook (no lens imports),
 *  - the rollout flag,
 *  - the LAYER: while the workspace is open the lens underneath is made inert (it stays mounted, its geometry untouched), the companion stays live, focus is moved in and returned on close, and Tab cycles
 *    through ONE scope (the workspace, then the companion).
 */
import { useEffect, useLayoutEffect, useSyncExternalStore, type RefObject } from "react";
import { cycleFocus, FOCUSABLE, workspaceFlagFrom, WORKSPACE_FLAG_KEY } from "./workspaceShellModel";

const subscribeViewport = (cb: () => void) => { window.addEventListener("resize", cb); window.addEventListener("orientationchange", cb); return () => { window.removeEventListener("resize", cb); window.removeEventListener("orientationchange", cb); }; };
let lastViewport = { w: 1280, h: 800 };
const readViewport = () => { const w = window.innerWidth, h = window.innerHeight; if (w !== lastViewport.w || h !== lastViewport.h) lastViewport = { w, h }; return lastViewport; };
export const useWorkspaceViewport = () => useSyncExternalStore(subscribeViewport, readViewport, () => lastViewport);

const subscribeMotion = (cb: () => void) => { const q = window.matchMedia("(prefers-reduced-motion: reduce)"); q.addEventListener("change", cb); return () => q.removeEventListener("change", cb); };
export const useWorkspaceReducedMotion = () => useSyncExternalStore(subscribeMotion, () => window.matchMedia("(prefers-reduced-motion: reduce)").matches, () => false);

/** Rollout flag (default ON since S2.1B.2): off only with `?workspace=0` or localStorage `growforge.workspace=0`. Read on the client only; the server / first-paint snapshot is the default (on). */
export function useWorkspaceFlag(): boolean {
  return useSyncExternalStore(() => () => {}, () => { let stored: string | null = null; try { stored = window.localStorage.getItem(WORKSPACE_FLAG_KEY); } catch { /* storage may be unavailable */ } return workspaceFlagFrom(window.location.search, stored); }, () => true);
}

const visible = (el: HTMLElement) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) && getComputedStyle(el).visibility !== "hidden";
const focusablesIn = (root: Element) => Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => !el.closest("[inert]") && visible(el));

export interface LayerOptions {
  open: boolean;
  /** The workspace element (focus lands inside it, Escape is only honoured from inside it). */
  root: HTMLElement | null;
  /** The element focus enters first (the title). */
  initial: RefObject<HTMLElement | null>;
  /** The lens underneath: made inert, never unmounted or moved. */
  backgroundSelectors: readonly string[];
  /** Live peers kept inside the focus scope (the companion). */
  companionSelectors: readonly string[];
  /** Where focus goes back to when the workspace closes. */
  returnTo: () => HTMLElement | null;
  /** Lock page scroll (full-screen sheet). */
  lockScroll: boolean;
}

export function useWorkspaceLayer({ open, root, initial, backgroundSelectors, companionSelectors, returnTo, lockScroll }: LayerOptions) {
  const bg = backgroundSelectors.join("|"), peers = companionSelectors.join("|");
  // 1. inert background + the html marker (CSS may read `html[data-workspace-open]`); everything is restored exactly as it was
  useLayoutEffect(() => {
    if (!open) return;
    const marked: { el: HTMLElement; was: boolean }[] = [];
    const apply = () => {
      document.querySelectorAll<HTMLElement>(bg.split("|").join(",")).forEach(el => { if (root?.contains(el) || marked.some(m => m.el === el)) return; marked.push({ el, was: el.inert }); el.inert = true; });
    };
    apply();
    const observer = new MutationObserver(apply); // a background root that mounts later (a mission switch is blocked, but the lens may re-render its parts) is made inert too
    observer.observe(document.body, { childList: true, subtree: true });
    document.documentElement.setAttribute("data-workspace-open", "");
    return () => { observer.disconnect(); marked.forEach(({ el, was }) => { el.inert = was; }); document.documentElement.removeAttribute("data-workspace-open"); };
  }, [open, bg, root]);
  // 2. focus in on open, back out on close
  useEffect(() => {
    if (!open) return;
    // a button that was activated without taking focus (touch / some browsers / a script) leaves <body> active: that is not a trigger worth returning to
    const trigger = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    const raf = requestAnimationFrame(() => initial.current?.focus({ preventScroll: true }));
    return () => {
      cancelAnimationFrame(raf);
      const target = (trigger && trigger.isConnected && !trigger.closest("[inert]") ? trigger : null) ?? returnTo();
      requestAnimationFrame(() => target?.focus({ preventScroll: true }));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  // 3. one focus scope: the workspace, then the companion (Tab and Shift+Tab wrap through both)
  useEffect(() => {
    if (!open || !root) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const a = event.target as HTMLElement | null;
      const scope = [root, ...(peers ? Array.from(document.querySelectorAll<HTMLElement>(peers.split("|").join(","))) : [])];
      const inScope = !!a && scope.some(r => r.contains(a));
      if (!inScope && a && a !== document.body) return; // focus is somewhere the app owns (browser chrome etc.): leave it
      const order = scope.flatMap(r => focusablesIn(r));
      if (!order.length) return;
      const idx = a ? order.indexOf(a) : -1;
      const next = cycleFocus(order.length, idx, event.shiftKey);
      if (next < 0) return;
      event.preventDefault();
      order[next].focus();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, root, peers]);
  // 4. scroll lock for the full-screen sheet
  useEffect(() => {
    if (!open || !lockScroll) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open, lockScroll]);
}
