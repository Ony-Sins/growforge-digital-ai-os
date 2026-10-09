import assert from "node:assert/strict";
import { dismissesOnClick } from "../src/components/spatial/dive/missionControlsDismiss";

/** W5.4C-R3: the Mission controls outside-click decision. Pure; no DOM. */
const click = (over: Partial<{ clientX: number; clientY: number; detail: number }> = {}) => ({ clientX: 100, clientY: 100, detail: 1, ...over });

// the bug: Create mission / Back are pressed INSIDE the surface and unmount themselves; the press origin, not the (detached) click target, decides
assert.equal(dismissesOnClick({ x: 100, y: 100, inside: true }, click()), false, "a press that started inside never dismisses (Create mission, Back, tabs, rows' own handlers)");
// genuinely outside
assert.equal(dismissesOnClick({ x: 100, y: 100, inside: false }, click()), true, "a press and release outside dismisses");
assert.equal(dismissesOnClick({ x: 100, y: 100, inside: false }, click({ clientX: 104, clientY: 103 })), true, "within the 5 px tolerance");
// drags and stray clicks
assert.equal(dismissesOnClick({ x: 100, y: 100, inside: false }, click({ clientX: 140 })), false, "a drag that ends elsewhere is not a click-outside");
assert.equal(dismissesOnClick(null, click()), false, "a click with no recorded press (e.g. the click that opened it) does nothing");
// keyboard activation (Enter / Space on a button) is click detail 0
assert.equal(dismissesOnClick({ x: 100, y: 100, inside: false }, click({ detail: 0 })), false, "keyboard activation never dismisses");
assert.equal(dismissesOnClick({ x: 100, y: 100, inside: true }, click({ detail: 0 })), false);

console.log("mission controls dismiss checks passed; pure, no DOM.");
