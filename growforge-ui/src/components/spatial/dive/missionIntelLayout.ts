/**
 * Geometry of the permanent Mission Intelligence panel (pure). The panel is about one third of the viewport, starts under the header and runs almost to the bottom edge with the
 * same small outer margin on the right and the bottom. The graph yields exactly `intelPanelInset(vw)` px on the right, so it never runs underneath the panel, and the NORA chatbar
 * and the lens rail re-centre in the space left of the panel (`--intel-inset`, set while the panel is mounted) instead of the panel stopping above them.
 */
export const INTEL_MARGIN = 16;
export const INTEL_GAP = 16;
export const INTEL_TOP = 128;
const WORKTREE_SIDE = 12;
/** Panel width (px): one third of the viewport, clamped so a very small or very large window stays usable. */
export const intelPanelWidth = (vw: number): number => Math.max(360, Math.min(700, Math.round(vw / 3)));
/** Horizontal space the panel takes from the right edge of the viewport: its width plus the outer margin. This is what the chatbar and the lens rail centre around. */
export const intelOccupied = (vw: number): number => intelPanelWidth(vw) + INTEL_MARGIN;
/** `right` offset of the graph root: it ends INTEL_GAP before the panel (the root already keeps its own 12px side margin, so that is subtracted). */
export const intelPanelInset = (vw: number): number => intelOccupied(vw) + INTEL_GAP - WORKTREE_SIDE;
