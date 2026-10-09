/** Outside-click dismissal for the Mission controls surface. Containment is decided from the press START (while its target is still attached), never from the click target: Create mission /
 *  Back replace themselves when activated, so a detached click target must not be read as "outside". Keyboard activation (click detail 0) and drags never dismiss. */
export interface DismissPress { x: number; y: number; inside: boolean }
export function dismissesOnClick(press: DismissPress | null, click: { clientX: number; clientY: number; detail: number }): boolean {
  if (!press || press.inside || click.detail === 0) return false;
  return Math.hypot(click.clientX - press.x, click.clientY - press.y) <= 5;
}
