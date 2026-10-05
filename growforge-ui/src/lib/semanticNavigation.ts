/**
 * Canonical Semantic Navigation Registry for GrowForge Digital AI OS.
 * Maps high-level assistant semantic actions to exact application routes.
 */

export type SemanticNavActionType =
  | "SHOW_DASHBOARD"
  | "SHOW_CORE"
  | "SHOW_BRAIN"
  | "SHOW_MISSIONS"
  | "SHOW_MISSION"
  | "SHOW_EXPLORE"
  | "SHOW_SYSTEMS"
  | "SHOW_SETTINGS"
  | "SHOW_PROFILE"
  | "SHOW_DIVE_LENS";

export interface SemanticNavAction {
  type: SemanticNavActionType;
  params?: {
    lensId?: string;
    missionId?: string;
    departmentId?: string;
    tab?: string;
    query?: string;
  };
}

export interface ResolvedRoute {
  action: SemanticNavActionType;
  path: string;
  label: string;
  tier?: string;
  panel?: string;
  tab?: string;
}

import { lensById } from "./diveLenses";

export const CANONICAL_ROUTES: Record<SemanticNavActionType, (params?: SemanticNavAction["params"]) => ResolvedRoute> = {
  SHOW_DASHBOARD: () => ({
    action: "SHOW_DASHBOARD",
    path: "/?tier=home",
    label: "Dashboard",
    tier: "home",
  }),
  SHOW_CORE: () => ({
    action: "SHOW_CORE",
    path: "/?tier=core",
    label: "CORE Execution",
    tier: "core",
  }),
  SHOW_BRAIN: () => ({
    action: "SHOW_BRAIN",
    path: "/?tier=brain",
    label: "AI Brain Canvas",
    tier: "brain",
  }),
  SHOW_MISSIONS: () => ({
    action: "SHOW_MISSIONS",
    path: "/?tier=home&lens=missions",
    label: "Live Missions",
    tier: "home",
  }),
  SHOW_MISSION: (params) => {
    const jobId = params?.missionId;
    const qs = jobId ? `&job=${encodeURIComponent(jobId)}` : "";
    return {
      action: "SHOW_MISSION",
      path: `/?tier=home&lens=missions${qs}`,
      label: jobId ? `Mission ${jobId}` : "Mission Detail",
      tier: "home",
    };
  },
  SHOW_EXPLORE: () => ({
    action: "SHOW_EXPLORE",
    path: "/?tier=home&lens=explore",
    label: "Explore System Index",
    tier: "home",
  }),
  SHOW_SYSTEMS: () => ({
    action: "SHOW_SYSTEMS",
    path: "/?panel=settings&tab=systems",
    label: "Systems Control Plane",
    panel: "settings",
    tab: "systems",
  }),
  SHOW_SETTINGS: (params) => ({
    action: "SHOW_SETTINGS",
    path: params?.tab ? `/?panel=settings&tab=${encodeURIComponent(params.tab)}` : "/?panel=settings",
    label: "Settings",
    panel: "settings",
    tab: params?.tab,
  }),
  /** Semantic address for a Dive lens (see diveLenses.ts). The id is validated, never trusted. */
  SHOW_DIVE_LENS: (params) => {
    const lens = params?.lensId ? lensById(params.lensId) : undefined;
    return lens
      ? { action: "SHOW_DIVE_LENS", path: `/?tier=home&lens=${lens.slug}`, label: lens.label, tier: "home" }
      : CANONICAL_ROUTES.SHOW_DASHBOARD();
  },
  SHOW_PROFILE: () => ({
    action: "SHOW_PROFILE",
    path: "/?panel=profile",
    label: "User Profile & Memory",
    panel: "profile",
  }),
};

/**
 * Resolves a semantic navigation action to its exact URL path and metadata.
 */
export function resolveSemanticRoute(action: SemanticNavAction): ResolvedRoute {
  const resolver = CANONICAL_ROUTES[action.type];
  if (!resolver) {
    return CANONICAL_ROUTES.SHOW_DASHBOARD();
  }
  return resolver(action.params);
}

/**
 * Parses user speech/text intent into a semantic action if matching keywords exist.
 */
export function detectNavigationIntent(text: string): SemanticNavAction | null {
  const normalized = text.toLowerCase().trim();

  if (/\b(dashboard|overview|home|front\s*page)\b/i.test(normalized)) {
    return { type: "SHOW_DASHBOARD" };
  }
  if (/\b(first\s*one|show\s*(me\s*)?the\s*first\s*mission|first\s*mission)\b/i.test(normalized)) {
    return { type: "SHOW_MISSION", params: { missionId: "active_first" } };
  }
  if (/\b(mission|missions|active\s*jobs|projects|live\s*projects)\b/i.test(normalized) && !/\bwhat\s*are\b/i.test(normalized)) {
    return { type: "SHOW_MISSIONS" };
  }
  if (/\b(core|execution\s*core|command\s*center)\b/i.test(normalized)) {
    return { type: "SHOW_CORE" };
  }
  if (/\b(brain|ai\s*brain|neural\s*network|memory\s*graph)\b/i.test(normalized)) {
    return { type: "SHOW_BRAIN" };
  }
  if (/\b(systems?|control\s*plane|integrations?|connectors?|models?\s*(and|&)\s*gateways?)\b/i.test(normalized)) {
    return { type: "SHOW_SYSTEMS" };
  }
  if (/\b(settings|preferences|configuration)\b/i.test(normalized)) {
    return { type: "SHOW_SETTINGS" };
  }
  if (/\b(profile|my\s*profile|account)\b/i.test(normalized)) {
    return { type: "SHOW_PROFILE" };
  }

  return null;
}
