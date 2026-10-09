"use client";

/**
 * The Mission selector (W7 target, Task 1): previous / next arrows around a precision gear ring, "Select Mission", "N of M".
 * The gear is the primary fast switch: the wheel or trackpad over it, or Up / Down while it has focus, steps through the recorded missions; a click opens a compact reel with search
 * for direct selection. Switching goes through the SAME `onSelect(id)` the Mission Field uses, so the canonical selected mission, the Worktree, NORA's context and the browser
 * navigation behave exactly as they do when a mission is picked from the Field (the selection is not in the URL: switching never adds a history entry).
 * Rapid stepping shows the target at once and commits once the gesture settles, so a fast wheel never fires a fetch per notch.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Settings } from "lucide-react";
import { cycleIndex, filterReel, indexOfMission, wheelSteps, type ReelItem } from "./missionSelectorModel";
import styles from "./MissionSelector.module.css";

const COMMIT_MS = 170;
// C7E.6.3 gear indexing: a VERTICAL ratchet, not a rotary knob. Only vertical travel counts (up = previous, down = next); the first ~18px are resisted pre-travel, a detent is crossed at 32px (37px when reversing: ~5px of
// hysteresis against hand jitter) and switches exactly one mission, the origin is rebased at the pointer at once, and the held drag keeps crossing a detent every 32px (no cooldown). The ring turns 30deg per mission,
// proportionally to the travel (so it lands exactly on the detent angle when the detent is crossed) and settles softly on release. The selector itself never moves.
const DRAG_STEP_PX = 32, DRAG_HYSTERESIS_PX = 5, DRAG_PRETRAVEL_PX = 18, DETENT_DEG = 30, DRAG_SLOP_PX = 4;
/** Gear angle (degrees) for a drag offset: slow through the pre-travel (resistance), then catching up so a full threshold is exactly one detent. */
export const gearAngle = (travel: number, threshold: number) => {
  const u = Math.min(1, Math.abs(travel) / threshold), pre = Math.min(0.9, DRAG_PRETRAVEL_PX / threshold);
  const f = u < pre ? 0.5 * u : 0.5 * pre + (u - pre) * (1 - 0.5 * pre) / (1 - pre);
  return Math.sign(travel) * DETENT_DEG * f;
};

export function MissionSelector({ reel, currentId, onSelect, hidden, embedded }: { reel: ReelItem[]; currentId: string; onSelect: (id: string) => void; /** Out of the way while a deeper reading plane holds this part of the stage. */ hidden?: boolean; /** Mounted by the Worktree directly beneath the Mission Core (it positions it); otherwise it floats top-left. */ embedded?: boolean }) {
  const uid = useId().replace(/:/g, "");
  const current = indexOfMission(reel, currentId);
  // A pending target is only valid for the mission it started from: once the selection moves, the displayed index is simply the selected mission again.
  const [pending, setPending] = useState<{ from: string; index: number } | null>(null);
  const shown = pending && pending.from === currentId ? pending.index : current;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const gear = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const carry = useRef(0);
  const latest = useRef({ reel, current, shown, currentId, onSelect });
  useEffect(() => { latest.current = { reel, current, shown, currentId, onSelect }; });
  useEffect(() => () => clearTimeout(timer.current), []);

  // The mission the gesture is AIMING at (so several detents in one tick compound correctly); it is cleared once the selection has caught up.
  const aim = useRef<number | null>(null);
  useEffect(() => { if (aim.current !== null && aim.current === current) aim.current = null; });
  const step = (delta: number, immediate = false) => {
    const { reel: list, shown: base, currentId: from, onSelect: choose } = latest.current;
    if (list.length < 2 || base < 0) return;
    const next = cycleIndex(list.length, aim.current ?? base, delta);
    aim.current = next;
    setPending({ from, index: next });
    clearTimeout(timer.current);
    const commit = () => { if (next !== latest.current.current && list[next]) choose(list[next].id); };
    // A held drag commits every detent at once (each one is a cross-fade; a newer detent supersedes an unfinished one, so the UI always converges on the latest); buttons, keys and wheel coalesce.
    if (immediate) commit(); else timer.current = setTimeout(commit, COMMIT_MS);
  };
  const stepRef = useRef(step);
  useEffect(() => { stepRef.current = step; });
  // The gear's rotation (a CSS variable on the button, no React state per pointer move): the committed detent angle plus the live, resisted drag offset.
  const detent = useRef(0);
  const turn = (extra = 0) => gear.current?.style.setProperty("--g-rot", `${detent.current + extra}deg`);
  const tick = () => { const el = gear.current; if (!el) return; el.removeAttribute("data-tick"); void el.offsetWidth; el.setAttribute("data-tick", ""); }; // one restrained ring pulse
  const indexBy = (delta: number, immediate = false) => { detent.current += delta * DETENT_DEG; stepRef.current(delta, immediate); turn(0); tick(); }; // wheel, keys and buttons turn the ring too (the drag then overrides it with the live offset)
  const indexByRef = useRef(indexBy);
  useEffect(() => { indexByRef.current = indexBy; });
  const drag = useRef<{ id: number; x: number; y: number; origin: number; dir: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const onGearDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if ((event.pointerType === "mouse" && event.button !== 0) || latest.current.reel.length < 2) return;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, origin: event.clientY, dir: 0, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onGearMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    if (!d.moved) { if (Math.hypot(event.clientX - d.x, event.clientY - d.y) < DRAG_SLOP_PX) return; d.moved = true; gear.current?.setAttribute("data-drag", ""); }
    // Only the vertical coordinate indexes. Several detents can be crossed by one fast move; each rebases the origin at the detent line it crossed.
    for (let guard = 0; guard < 24; guard++) {
      const travel = event.clientY - d.origin, dir = Math.sign(travel);
      const need = dir !== 0 && d.dir !== 0 && dir !== d.dir ? DRAG_STEP_PX + DRAG_HYSTERESIS_PX : DRAG_STEP_PX; // reversing needs a little more travel than continuing
      if (!dir || Math.abs(travel) < need) { turn(dir ? gearAngle(travel, need) : 0); return; }
      d.origin = d.origin + dir * need; d.dir = dir;
      indexBy(dir, true);
    }
    d.origin = event.clientY; turn(0);
  };
  const onGearUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    gear.current?.removeAttribute("data-drag");
    if (d.moved) { suppressClick.current = true; setTimeout(() => { suppressClick.current = false; }, 0); }
    turn(0); // settles softly onto the indexed angle
  };

  // Wheel / trackpad over the gear: a native, non-passive listener so the page does not scroll under it.
  useEffect(() => {
    const el = gear.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
      const { steps, carry: rest } = wheelSteps(carry.current, event.deltaY * unit);
      carry.current = rest;
      for (let i = 0; i < Math.abs(steps); i++) indexByRef.current(steps > 0 ? 1 : -1); // accumulated delta, one detent per threshold
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const results = useMemo(() => filterReel(reel, query), [reel, query]);
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => { if (!(event.target instanceof Node) || !root.current?.contains(event.target)) setOpen(false); };
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  }, [open]);
  const openPicker = () => {
    setQuery(""); setActive(Math.max(0, current)); setOpen(true);
    requestAnimationFrame(() => search.current?.focus());
  };
  const close = (refocus = true) => { setOpen(false); if (refocus) gear.current?.focus(); };
  const choose = (id: string) => { setOpen(false); if (id !== currentId) onSelect(id); gear.current?.focus(); };

  if (!reel.length || current < 0) return null;
  const item = reel[shown];
  const total = reel.length;
  const moving = pending !== null && pending.from === currentId && pending.index !== current;
  return <div ref={root} className={styles.root} data-mission-selector data-embedded={embedded || undefined} data-hidden={hidden || undefined} data-open={open || undefined} inert={hidden ? true : undefined} role="group" aria-label="Mission selector">
    <div className={styles.row}>
      <button className={styles.arrow} data-dir="prev" onClick={() => indexBy(-1)} disabled={total < 2} aria-label="Previous mission" title="Previous mission"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" /></svg></button>
      <button ref={gear} className={styles.gear} aria-haspopup="listbox" aria-expanded={open} aria-controls={`msel-${uid}`} aria-label={`Mission selector, mission ${shown + 1} of ${total}: ${item.title}. Drag, scroll or press Up and Down to switch, Enter to search.`}
        title="Drag, scroll or ↑ ↓ to switch · click to search" onClick={() => { if (suppressClick.current) return; if (open) close(); else openPicker(); }}
        onPointerDown={onGearDown} onPointerMove={onGearMove} onPointerUp={onGearUp} onPointerCancel={onGearUp}
        onKeyDown={event => {
          if (event.key === "ArrowUp") { event.preventDefault(); indexBy(-1); }
          else if (event.key === "ArrowDown") { event.preventDefault(); indexBy(1); }
        }}>
        <svg className={styles.ring} viewBox="0 0 64 64" aria-hidden="true">
          <circle className={styles.plate} cx="32" cy="32" r="30" />
          <circle className={styles.ticks} cx="32" cy="32" r="25" />
          <circle className={styles.arcs} cx="32" cy="32" r="30" pathLength="100" />
          <circle className={styles.inner} cx="32" cy="32" r="19.5" />
        </svg>
        <Settings className={styles.glyph} size={19} strokeWidth={1.5} aria-hidden="true" />
      </button>
      <button className={styles.arrow} data-dir="next" onClick={() => indexBy(1)} disabled={total < 2} aria-label="Next mission" title="Next mission"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg></button>
    </div>
    <p className={styles.label}>Select Mission</p>
    <p className={styles.count} data-moving={moving || undefined}><b>{shown + 1}</b> of {total}</p>
    <p className={styles.preview} data-moving={moving || undefined} aria-hidden="true" title={item.title}>{item.title}</p>
    <p className={styles.srOnly} role="status" aria-live="polite">{`Mission ${shown + 1} of ${total}: ${item.title}`}</p>
    {open && <div className={styles.picker} id={`msel-${uid}`} role="dialog" aria-label="Choose a mission"
      onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
        else if (event.key === "ArrowDown") { event.preventDefault(); setActive(i => Math.min(results.length - 1, i + 1)); }
        else if (event.key === "ArrowUp") { event.preventDefault(); setActive(i => Math.max(0, i - 1)); }
        else if (event.key === "Enter" && results[active]) { event.preventDefault(); choose(results[active].id); }
      }}>
      <input ref={search} className={styles.search} type="search" value={query} onChange={event => { setQuery(event.target.value); setActive(0); }} placeholder="Find a mission" aria-label="Find a mission" autoComplete="off" spellCheck={false} />
      <ul className={styles.reel} role="listbox" aria-label="Recorded missions">
        {results.map((mission, i) => <li key={mission.id} role="option" aria-selected={mission.id === currentId} data-active={i === active || undefined} data-current={mission.id === currentId || undefined} data-state={mission.state}
          onMouseEnter={() => setActive(i)} onClick={() => choose(mission.id)}>
          <span className={styles.name}>{mission.title}</span>
          <span className={styles.meta}>{mission.stateLabel}<i aria-hidden="true"> · </i>{mission.percent}%</span>
        </li>)}
        {!results.length && <li className={styles.none}>No recorded mission matches.</li>}
      </ul>
    </div>}
  </div>;
}
