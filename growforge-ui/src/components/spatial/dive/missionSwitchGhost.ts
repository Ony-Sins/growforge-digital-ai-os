/**
 * C7E.6.1: the mission switch is a true content cross-fade without ever duplicating the chassis. Just before the next mission is chosen, `captureGhosts` clones ONLY the outgoing mission-dependent presentation layers
 * (child rows, gaps, conduits, the Core's and phase cards' content, the panel's and header's content, NORA's context chip) as inert, aria-hidden, non-interactive copies (`[data-mx-ghost]`, no React, no handlers).
 * `presentGhosts` lays them back over the same positions in the commit that shows the next record and starts the incoming fade (`html[data-mx="in"]`, see globals.css); they remove themselves after the crossover.
 * Shell-bearing elements (Core, phase cards, panel and its cards, thread) are cloned with their own surface hidden (`data-mx-shell`), so the persistent shell is never doubled. C7E.6.2: those clones are `data-mx-split`: their
 * structural layers fade softly and their typography / value layers hand off tightly (globals.css); static labels are hidden in the clone (`data-mx-static`) because the persistent original stays.
 */
const GHOST_MS = 220, IN_MS = 280, IN_DELAY_MS = 70; // keep in step with the data-mx animations in globals.css

export interface Ghost { el: HTMLElement; parent: Element; after?: Element }

const inertCopy = (src: Element, opts: { shell?: boolean; dropAttrs?: string[]; stripChildren?: string } = {}): HTMLElement => {
  const el = src.cloneNode(true) as HTMLElement;
  opts.dropAttrs?.forEach(attr => el.removeAttribute(attr));
  if (opts.stripChildren) el.querySelectorAll(opts.stripChildren).forEach(node => node.remove());
  el.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
  el.removeAttribute("id");
  el.setAttribute("data-mx-ghost", ""); el.setAttribute("aria-hidden", "true"); el.setAttribute("tabindex", "-1"); el.inert = true;
  if (opts.shell) { el.setAttribute("data-mx-shell", ""); el.setAttribute("data-mx-split", ""); }
  return el;
};

export function captureGhosts(): Ghost[] {
  const ghosts: Ghost[] = [];
  const stage = document.querySelector("[data-worktree] [data-stage]");
  if (stage) {
    for (const child of Array.from(stage.children)) {
      if (child.hasAttribute("data-mx-ghost")) continue;
      const kind = child instanceof HTMLButtonElement ? child.getAttribute("data-kind") : null;
      if (kind === "mission" || kind === "phase") {
        const copy = inertCopy(child, { shell: true, stripChildren: ":scope > i" });
        copy.querySelectorAll(":scope > span:not([aria-hidden]) > i, :scope > span:not([aria-hidden]) > b").forEach(node => { if (kind === "mission" ? node.tagName === "I" : node.tagName === "B") node.setAttribute("data-mx-static", ""); }); // the "Mission" eyebrow / the phase name never change
        ghosts.push({ el: copy, parent: stage });
      }
      else if (kind === "department" || kind === "step" || child.hasAttribute("data-gap") || child.hasAttribute("data-conduits")) ghosts.push({ el: inertCopy(child), parent: stage });
    }
  }
  const panel = document.querySelector("aside[data-intel-panel]");
  if (panel?.parentElement) {
    const copy = inertCopy(panel, { shell: true, dropAttrs: ["data-intel-panel", "role"] });
    copy.querySelectorAll(':scope > header, [data-slot="status"] > button, [data-slot="analysis"] > h3').forEach(node => node.setAttribute("data-mx-static", ""));
    copy.querySelectorAll('[data-slot="status"], [data-slot="headline"], [data-slot="kpis"] > section, [data-slot="analysis"] > div').forEach(node => node.setAttribute("data-mx-shell", "")); // the cards' own surfaces are persistent chassis
    ghosts.push({ el: copy, parent: panel.parentElement, after: panel });
  }
  const header = document.querySelector('header[data-mission-header="selected"]');
  if (header?.parentElement) {
    const copy = inertCopy(header, { dropAttrs: ["data-mission-header"] });
    copy.setAttribute("data-mx-split", "");
    copy.querySelectorAll("[data-mission-back],nav > span[aria-hidden]").forEach(node => node.setAttribute("data-mx-static", ""));
    copy.querySelectorAll("nav").forEach(node => node.setAttribute("data-mx-shell", ""));
    ghosts.push({ el: copy, parent: header.parentElement, after: header });
  }
  const chip = document.querySelector(".nora-context-chip");
  if (chip?.parentElement) { const copy = inertCopy(chip); copy.setAttribute("data-mx-text", ""); ghosts.push({ el: copy, parent: chip.parentElement, after: chip }); }
  return ghosts;
}

/** Lays the captured copies back down (before paint, in the commit that shows the next record) and starts the incoming fade. Returns the cleanup. */
export function presentGhosts(ghosts: Ghost[]): () => void {
  const root = document.documentElement;
  document.querySelectorAll("[data-mx-ghost]").forEach(node => node.remove());
  ghosts.forEach(({ el, parent, after }) => { if (after && after.parentElement === parent) parent.insertBefore(el, after.nextSibling); else parent.appendChild(el); });
  root.setAttribute("data-mx", "in");
  const clear = () => { ghosts.forEach(({ el }) => el.remove()); };
  const timers = [setTimeout(clear, GHOST_MS + 40), setTimeout(() => { if (root.getAttribute("data-mx") === "in") root.removeAttribute("data-mx"); }, IN_DELAY_MS + IN_MS + 40)];
  return () => { timers.forEach(clearTimeout); clear(); if (root.getAttribute("data-mx") === "in") root.removeAttribute("data-mx"); };
}
