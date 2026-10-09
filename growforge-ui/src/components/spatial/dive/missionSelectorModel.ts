import type { MissionRowState } from "./missionStates";

/**
 * Mission selector model (pure). The selector walks the RECORDED missions in the order the Missions lens already holds them; nothing here reads or invents mission data.
 * Switching is the same `onSelect(id)` the Mission Field uses: the selection is not part of the URL, so switching adds no history entry and the browser Back / Forward
 * behaviour is exactly what it was.
 */
export interface ReelItem { id: string; title: string; state: MissionRowState; stateLabel: string; percent: number }

/** Index of the current mission in the reel, or -1 when it is not a recorded mission (the selector then stays hidden). */
export const indexOfMission = (reel: readonly ReelItem[], id: string): number => reel.findIndex(item => item.id === id);

/** Step through the reel by `delta` (wraps: the reel is a ring, so the wheel never dead-ends). */
export function cycleIndex(length: number, index: number, delta: number): number {
  if (length <= 0) return -1;
  return (((index + delta) % length) + length) % length;
}

/** The picker's filtered list: case-insensitive match on the recorded title and the recorded state label. An empty query shows everything, in reel order. */
export function filterReel(reel: readonly ReelItem[], query: string): ReelItem[] {
  const q = query.trim().toLowerCase();
  return q ? reel.filter(item => item.title.toLowerCase().includes(q) || item.stateLabel.toLowerCase().includes(q)) : [...reel];
}

/**
 * Wheel / trackpad accumulator: one mission per `threshold` of scroll distance, so a high-resolution trackpad does not skip dozens of missions per gesture and a notched wheel
 * moves one mission per notch. Returns how many steps (signed: positive = next) to take and the remainder to carry over.
 */
export function wheelSteps(carry: number, deltaY: number, threshold = 48): { steps: number; carry: number } {
  // One wheel EVENT moves at most ONE mission. A mouse notch reports ~100 (Windows 120), which is well past the threshold: counting it as 100/48 steps made every notch skip a mission. Slow trackpad deltas still accumulate to a step.
  const total = carry + deltaY;
  const steps = Math.max(-1, Math.min(1, Math.trunc(total / threshold)));
  return { steps, carry: steps === 0 ? total : 0 };
}
