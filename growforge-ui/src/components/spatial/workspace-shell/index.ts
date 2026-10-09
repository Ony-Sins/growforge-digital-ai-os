/** Public surface of the lens-agnostic workspace shell. Lenses import from here only. (This folder imports nothing from any lens: see the import-boundary test.) */
export { WorkspaceShell, type WorkspaceShellProps, type WorkspaceRailItem } from "./WorkspaceShell";
export { useWorkspaceFlag, useWorkspaceViewport, useWorkspaceReducedMotion } from "./useWorkspaceLayer";
export { workspaceGeometry, closeDecision, escapeStep, cycleFocus, railTarget, workspaceFlagFrom, WORKSPACE_FLAG_KEY, WORKSPACE_BREAKPOINTS, WORKSPACE_RESERVE, WORKSPACE_MAX, type WorkspaceMode, type CloseReason, type WorkspaceGeometry } from "./workspaceShellModel";
export { WORKSPACE_TOKENS, HYPOTHETICAL_LABEL } from "./workspaceTokens";
