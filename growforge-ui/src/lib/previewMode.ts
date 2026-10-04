/**
 * Dependency-free preview/beta isolation flag. Kept separate from session.ts (which imports the auth
 * runtime and the beta store) so modules that are also bundled for the browser - e.g. security.ts via
 * appState.tsx - can check it without pulling server-only code into the client graph.
 */
export function isPublicPreviewMode(): boolean {
  // The private beta reuses this isolation for all data: testers (and the owner, on the beta deployment)
  // get the fresh isolated experience; owner-private stores and gates stay closed.
  return process.env.PUBLIC_PREVIEW_MODE === "true" || process.env.NEXT_PUBLIC_PREVIEW_MODE === "true" || process.env.BETA_MODE === "true";
}
