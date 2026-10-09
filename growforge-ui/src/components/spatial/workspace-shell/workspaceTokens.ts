/**
 * Shared design tokens of the workspace shell (structure only; the premium glow / lighting / animation pass refines VALUES later, never the NAMES). Every lens that adapts to the shell inherits these.
 * The CSS custom properties are declared on `.root` in WorkspaceShell.module.css; this list is the contract (a test keeps the two in step).
 *
 * Material depth (smoked-petrol family): Intelligence panel = illuminated glass instrument; Workbench-class workspace = darker operational glass (`--ws-surface-*`); reading mode / artifact = darkest (`--ws-canvas`).
 */
export const WORKSPACE_TOKENS = [
  "--ws-surface-a", "--ws-surface-b", "--ws-glass-mid", "--ws-canvas", "--ws-plane-primary", "--ws-plane-support", "--ws-plane-detail",
  "--ws-rule", "--ws-edge", "--ws-rim", "--ws-rim-soft", "--ws-rim-bright", "--ws-rim-inner", "--ws-rim-fall", "--ws-seam", "--ws-active",
  "--ws-text", "--ws-text-quiet", "--ws-gap", "--ws-radius", "--ws-radius-inner",
  "--ws-scrim", "--ws-hypo-accent", "--ws-hypo-tint",
] as const;

/**
 * Reserved extension point: what-if / scenario analysis. Anything a lens renders through the shell's `scenario` slot is HYPOTHETICAL: the shell draws it in a visibly different region (dashed edge, hatched tint,
 * the `--ws-hypo-*` accent and a permanent "Hypothetical · not recorded" label) so a calculated outcome can never be mistaken for a recorded fact. The slot is empty in S1.
 */
export const HYPOTHETICAL_LABEL = "Hypothetical · not recorded";
