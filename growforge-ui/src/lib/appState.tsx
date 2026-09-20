"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { canAccessAgentWith, type Role } from "@/lib/security";

export type ActiveView =
  | "chat"
  | "dashboard"
  | "activity"
  | "roster"
  | "vault"
  | "workflows"
  | "brain"
  | "profile"
  | "terminal"
  | "logs"
  | "settings";

/** What the PIN modal is currently prompting for. */
export type PinPromptTarget = { kind: "agent"; agentId: string } | { kind: "owner" } | null;

const ROLE_STORAGE_KEY = "growforge.role";
const UNLOCKED_STORAGE_KEY = "growforge.unlockedAgentIds";
const UI_MODE_STORAGE_KEY = "growforge.uiMode";

export type UiMode = "simple" | "advanced";

/** Views that are real activeView states (as opposed to "terminal"/"logs"/
 *  "brain"/"profile", which setActiveView intercepts and turns into an
 *  overlay open instead — see setActiveView below). Used to validate the
 *  `view` URL param on load. */
const PERSISTABLE_VIEWS: ActiveView[] = ["chat", "dashboard", "activity", "vault", "workflows"];

/** Replaces the current URL's query string without a navigation/history
 *  entry — keeps refresh (and only refresh) restoring where the user was,
 *  without polluting browser back/forward with every nav click. */
function writeLocationParams(params: Record<string, string | undefined>) {
  try {
    const url = new URL(window.location.href);
    url.search = "";
    for (const [key, value] of Object.entries(params)) {
      if (value) url.searchParams.set(key, value);
    }
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // URL API unavailable — refresh just won't restore position this time
  }
}

interface AppStateValue {
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  /** Bumped every time setActiveView is called (even with the same view) so
   *  listeners can re-trigger a scroll/flash even on a repeat click. */
  activeViewToken: number;
  selectedAgentId: string | null;
  openAgentPanel: (agentId: string) => void;
  closeAgentPanel: () => void;

  role: Role;
  setRole: (role: Role) => void;
  unlockedAgentIds: string[];
  canAccessAgent: (agentId: string) => boolean;

  /** The project job shown on the live canvas. */
  activeJobId: string | null;
  openJob: (jobId: string) => void;

  /** Admin Drawer for developer tools, terminal, and execution logs */
  isAdminDrawerOpen: boolean;
  adminDrawerTab: "terminal" | "logs" | "diagnostics";
  openAdminDrawer: (tab?: "terminal" | "logs" | "diagnostics") => void;
  closeAdminDrawer: () => void;

  /** User Profile overlay — AI Brain + Memory Profile, off the main scroll
   *  as of Phase 3 (they used to be inline dashboard sections). */
  isUserProfileOpen: boolean;
  userProfileTab: "brain" | "profile";
  openUserProfile: (tab?: "brain" | "profile") => void;
  closeUserProfile: () => void;

  /** Settings overlay — Interface & Access + Integrations/Connectors, off
   *  the main scroll as of the Phase 3.5 dashboard IA reorg (previously an
   *  inline scroll-anchor section, which is exactly why Connectors kept
   *  reading as dashboard clutter instead of configuration). */
  isSettingsOpen: boolean;
  settingsTab: string;
  openSettings: (tab?: string) => void;
  closeSettings: () => void;

  /** Agent Roster overlay — the full live roster, off the main scroll as of
   *  the Phase 3.5 dashboard IA reorg (the dashboard keeps only a compact
   *  "view all" strip). Same overlay pattern as Settings/Admin Drawer/User
   *  Profile, not a new interaction model. */
  isAgentRosterOpen: boolean;
  openAgentRoster: () => void;
  closeAgentRoster: () => void;

  pinPromptTarget: PinPromptTarget;
  requestAgentUnlock: (agentId: string) => void;
  requestOwnerUnlock: () => void;
  dismissPinPrompt: () => void;
  unlockAgent: (agentId: string) => void;

  /** The operator's uploaded profile picture (UserMemory.profile.avatarUrl),
   *  shared here so Header and ProfileDashboard never drift out of sync —
   *  ProfileDashboard calls setAvatarUrl right after a successful upload/
   *  removal instead of each surface polling its own copy. */
  avatarUrl: string | null;
  setAvatarUrl: (url: string | null) => void;

  /** AI Assistant's two view modes — "docked" is a persistent right-side
   *  panel (like the sidebar, always visible alongside the rest of the
   *  dashboard); "maximized" is a full-screen, distraction-free chat view.
   *  Lifted to app state (not local ChatView state) so Workspace.tsx can
   *  reserve layout space for the docked panel without prop-drilling. */
  chatViewMode: "docked" | "maximized";
  setChatViewMode: (mode: "docked" | "maximized") => void;

  /** The operator's display/full name from memory profile (UserMemory.profile.fullName),
   *  shared here so Workspace greeting stays in sync without page reload. */
  profileName: string | null;
  setProfileName: (name: string | null) => void;

  /** Simple/Advanced UI mode — default is Simple (everyday-user-friendly,
   *  no dev/technical surfaces). Advanced reveals the Admin Drawer button,
   *  raw connector/MCP config, and per-department access toggles — real
   *  functionality that just isn't something most users need to see by
   *  default. Persisted in localStorage (a durable display preference, not
   *  security-sensitive like role/unlock state, which stay sessionStorage-only). */
  uiMode: UiMode;
  setUiMode: (mode: UiMode) => void;
}

const AppStateContext = createContext<AppStateValue | null>(null);

/** What view/overlay to land on, known from the server's own copy of the
 *  request URL — passed down from page.tsx (a server component, which sees
 *  `?view=`/`?panel=`/`?tab=` before any client JS runs) so the very first
 *  paint already matches, instead of rendering defaults and correcting a
 *  beat later in a client effect. That correction-after-paint was exactly
 *  the "homepage flashes, then the real page loads" bug. */
export interface InitialLocation {
  view?: string;
  panel?: string;
  tab?: string;
}

function resolveInitialView(initial?: InitialLocation): ActiveView {
  const v = initial?.view;
  return v && (PERSISTABLE_VIEWS as string[]).includes(v) ? (v as ActiveView) : "chat";
}

export function AppStateProvider({ children, initialLocation }: { children: ReactNode; initialLocation?: InitialLocation }) {
  const [activeView, setActiveViewState] = useState<ActiveView>(() => resolveInitialView(initialLocation));
  const [activeViewToken, setActiveViewToken] = useState(0);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  // Role/unlock/mode defaults match what SSR renders; those real values are
  // loaded from session/localStorage in an effect below (client-only, after
  // hydration, since the server can't see them) so the server-rendered and
  // hydrated markup never disagree. View/panel state, unlike those, IS known
  // to the server (it's just the request URL) — seeded above, not here.
  const [role, setRoleState] = useState<Role>("employee");
  const [unlockedAgentIds, setUnlockedAgentIds] = useState<string[]>([]);
  const [pinPromptTarget, setPinPromptTarget] = useState<PinPromptTarget>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [isAdminDrawerOpen, setIsAdminDrawerOpen] = useState(() => initialLocation?.panel === "admin");
  const [adminDrawerTab, setAdminDrawerTab] = useState<"terminal" | "logs" | "diagnostics">(() => {
    const t = initialLocation?.tab;
    return initialLocation?.panel === "admin" && (t === "logs" || t === "diagnostics") ? t : "terminal";
  });
  const [isUserProfileOpen, setIsUserProfileOpen] = useState(() => initialLocation?.panel === "profile");
  const [userProfileTab, setUserProfileTab] = useState<"brain" | "profile">(() =>
    initialLocation?.panel === "profile" && initialLocation?.tab === "profile" ? "profile" : "brain",
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(() => initialLocation?.panel === "settings");
  const [settingsTab, setSettingsTab] = useState<string>(() =>
    initialLocation?.panel === "settings" && initialLocation?.tab ? initialLocation.tab : "account",
  );
  const [isAgentRosterOpen, setIsAgentRosterOpen] = useState(() => initialLocation?.panel === "roster");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [chatViewMode, setChatViewMode] = useState<"docked" | "maximized">("docked");
  const [uiMode, setUiModeState] = useState<UiMode>("simple");

  useEffect(() => {
    fetch("/api/profile/memory")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const url = data?.memory?.profile?.avatarUrl;
        if (typeof url === "string" && url) setAvatarUrl(url);
        const name = data?.memory?.profile?.fullName;
        if (typeof name === "string" && name) setProfileName(name);
      })
      .catch(() => {
        // no avatar or memory yet, or not reachable — Header/Workspace fall back to defaults
      });
  }, []);

  useEffect(() => {
    try {
      const storedMode = window.localStorage.getItem(UI_MODE_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time load from localStorage on mount, not derived render state
      if (storedMode === "simple" || storedMode === "advanced") setUiModeState(storedMode);
    } catch {
      // localStorage unavailable — default (simple) stands
    }

    try {
      const storedRole = window.sessionStorage.getItem(ROLE_STORAGE_KEY);
      if (storedRole === "owner" || storedRole === "employee") setRoleState(storedRole);

      const storedUnlocked = window.sessionStorage.getItem(UNLOCKED_STORAGE_KEY);
      if (storedUnlocked) {
        const parsed = JSON.parse(storedUnlocked);
        if (Array.isArray(parsed)) setUnlockedAgentIds(parsed.filter((id) => typeof id === "string"));
      }
    } catch {
      // sessionStorage unavailable (private mode, etc.) — defaults stand
    }
    // View/panel restore-on-refresh no longer happens here — it's seeded
    // directly into useState above from the server-known initialLocation,
    // so it's correct on the very first paint instead of one effect later.
  }, []);

  const openAdminDrawer = useCallback((tab: "terminal" | "logs" | "diagnostics" = "terminal") => {
    setAdminDrawerTab(tab);
    setIsAdminDrawerOpen(true);
    writeLocationParams({ panel: "admin", tab });
  }, []);

  const closeAdminDrawer = useCallback(() => {
    setIsAdminDrawerOpen(false);
    setActiveViewState((current) => {
      writeLocationParams({ view: current === "chat" ? undefined : current });
      return current;
    });
  }, []);

  const openUserProfile = useCallback((tab: "brain" | "profile" = "brain") => {
    setUserProfileTab(tab);
    setIsUserProfileOpen(true);
    writeLocationParams({ panel: "profile", tab });
  }, []);

  const closeUserProfile = useCallback(() => {
    setIsUserProfileOpen(false);
    setActiveViewState((current) => {
      writeLocationParams({ view: current === "chat" ? undefined : current });
      return current;
    });
  }, []);

  const openSettings = useCallback((tab?: string) => {
    if (tab) setSettingsTab(tab);
    setIsSettingsOpen(true);
    writeLocationParams({ panel: "settings", tab });
  }, []);

  const closeSettings = useCallback(() => {
    setIsSettingsOpen(false);
    setActiveViewState((current) => {
      writeLocationParams({ view: current === "chat" ? undefined : current });
      return current;
    });
  }, []);

  const openAgentRoster = useCallback(() => {
    setIsAgentRosterOpen(true);
    writeLocationParams({ panel: "roster" });
  }, []);

  const closeAgentRoster = useCallback(() => {
    setIsAgentRosterOpen(false);
    setActiveViewState((current) => {
      writeLocationParams({ view: current === "chat" ? undefined : current });
      return current;
    });
  }, []);

  const setActiveView = useCallback(
    (view: ActiveView) => {
      if (view === "terminal") {
        openAdminDrawer("terminal");
        return;
      }
      if (view === "logs") {
        openAdminDrawer("logs");
        return;
      }
      if (view === "brain" || view === "profile") {
        openUserProfile(view);
        return;
      }
      if (view === "settings") {
        openSettings();
        return;
      }
      if (view === "roster") {
        openAgentRoster();
        return;
      }
      setActiveViewState(view);
      setActiveViewToken((t) => t + 1);
      writeLocationParams({ view: view === "chat" ? undefined : view });
    },
    [openAdminDrawer, openUserProfile, openSettings, openAgentRoster],
  );

  const openJob = useCallback(
    (jobId: string) => {
      setActiveJobId(jobId);
      setActiveView("workflows");
    },
    [setActiveView],
  );

  const openAgentPanel = useCallback((agentId: string) => setSelectedAgentId(agentId), []);
  const closeAgentPanel = useCallback(() => setSelectedAgentId(null), []);

  const setRole = useCallback((next: Role) => {
    setRoleState(next);
    try {
      window.sessionStorage.setItem(ROLE_STORAGE_KEY, next);
    } catch {
      // best-effort persistence only
    }
  }, []);

  const unlockAgent = useCallback((agentId: string) => {
    setUnlockedAgentIds((prev) => {
      if (prev.includes(agentId)) return prev;
      const next = [...prev, agentId];
      try {
        window.sessionStorage.setItem(UNLOCKED_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // best-effort persistence only
      }
      return next;
    });
  }, []);

  const canAccessAgent = useCallback(
    (agentId: string) => canAccessAgentWith(agentId, role, unlockedAgentIds),
    [role, unlockedAgentIds],
  );

  const setUiMode = useCallback((mode: UiMode) => {
    setUiModeState(mode);
    try {
      window.localStorage.setItem(UI_MODE_STORAGE_KEY, mode);
    } catch {
      // best-effort persistence only
    }
  }, []);

  const requestAgentUnlock = useCallback((agentId: string) => setPinPromptTarget({ kind: "agent", agentId }), []);
  const requestOwnerUnlock = useCallback(() => setPinPromptTarget({ kind: "owner" }), []);
  const dismissPinPrompt = useCallback(() => setPinPromptTarget(null), []);

  const value = useMemo(
    () => ({
      activeView,
      setActiveView,
      activeViewToken,
      selectedAgentId,
      openAgentPanel,
      closeAgentPanel,
      role,
      setRole,
      unlockedAgentIds,
      canAccessAgent,
      activeJobId,
      openJob,
      isAdminDrawerOpen,
      adminDrawerTab,
      openAdminDrawer,
      closeAdminDrawer,
      isUserProfileOpen,
      userProfileTab,
      openUserProfile,
      closeUserProfile,
      isSettingsOpen,
      settingsTab,
      openSettings,
      closeSettings,
      isAgentRosterOpen,
      openAgentRoster,
      closeAgentRoster,
      pinPromptTarget,
      requestAgentUnlock,
      requestOwnerUnlock,
      dismissPinPrompt,
      unlockAgent,
      avatarUrl,
      setAvatarUrl,
      profileName,
      setProfileName,
      chatViewMode,
      setChatViewMode,
      uiMode,
      setUiMode,
    }),
    [
      activeView,
      setActiveView,
      activeViewToken,
      selectedAgentId,
      openAgentPanel,
      closeAgentPanel,
      role,
      setRole,
      unlockedAgentIds,
      canAccessAgent,
      activeJobId,
      openJob,
      isAdminDrawerOpen,
      adminDrawerTab,
      openAdminDrawer,
      closeAdminDrawer,
      isUserProfileOpen,
      userProfileTab,
      openUserProfile,
      closeUserProfile,
      isSettingsOpen,
      settingsTab,
      openSettings,
      closeSettings,
      isAgentRosterOpen,
      openAgentRoster,
      closeAgentRoster,
      pinPromptTarget,
      requestAgentUnlock,
      requestOwnerUnlock,
      dismissPinPrompt,
      unlockAgent,
      avatarUrl,
      setAvatarUrl,
      profileName,
      setProfileName,
      chatViewMode,
      setChatViewMode,
      uiMode,
      setUiMode,
    ],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) {
    throw new Error("useAppState must be used within an AppStateProvider");
  }
  return ctx;
}
