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
  | "terminal"
  | "logs"
  | "settings";

/** What the PIN modal is currently prompting for. */
export type PinPromptTarget = { kind: "agent"; agentId: string } | { kind: "owner" } | null;

const ROLE_STORAGE_KEY = "growforge.role";
const UNLOCKED_STORAGE_KEY = "growforge.unlockedAgentIds";

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

  pinPromptTarget: PinPromptTarget;
  requestAgentUnlock: (agentId: string) => void;
  requestOwnerUnlock: () => void;
  dismissPinPrompt: () => void;
  unlockAgent: (agentId: string) => void;
}

const AppStateContext = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [activeView, setActiveViewState] = useState<ActiveView>("chat");
  const [activeViewToken, setActiveViewToken] = useState(0);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  // Defaults match what SSR renders; real values are loaded from
  // sessionStorage in an effect below (client-only, after hydration) so the
  // server-rendered and hydrated markup never disagree.
  const [role, setRoleState] = useState<Role>("employee");
  const [unlockedAgentIds, setUnlockedAgentIds] = useState<string[]>([]);
  const [pinPromptTarget, setPinPromptTarget] = useState<PinPromptTarget>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [isAdminDrawerOpen, setIsAdminDrawerOpen] = useState(false);
  const [adminDrawerTab, setAdminDrawerTab] = useState<"terminal" | "logs" | "diagnostics">("terminal");

  useEffect(() => {
    try {
      const storedRole = window.sessionStorage.getItem(ROLE_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time load from sessionStorage on mount, not derived render state
      if (storedRole === "owner" || storedRole === "employee") setRoleState(storedRole);

      const storedUnlocked = window.sessionStorage.getItem(UNLOCKED_STORAGE_KEY);
      if (storedUnlocked) {
        const parsed = JSON.parse(storedUnlocked);
        if (Array.isArray(parsed)) setUnlockedAgentIds(parsed.filter((id) => typeof id === "string"));
      }
    } catch {
      // sessionStorage unavailable (private mode, etc.) — defaults stand
    }
  }, []);

  const openAdminDrawer = useCallback((tab: "terminal" | "logs" | "diagnostics" = "terminal") => {
    setAdminDrawerTab(tab);
    setIsAdminDrawerOpen(true);
  }, []);

  const closeAdminDrawer = useCallback(() => {
    setIsAdminDrawerOpen(false);
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
      setActiveViewState(view);
      setActiveViewToken((t) => t + 1);
    },
    [openAdminDrawer],
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
      pinPromptTarget,
      requestAgentUnlock,
      requestOwnerUnlock,
      dismissPinPrompt,
      unlockAgent,
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
      pinPromptTarget,
      requestAgentUnlock,
      requestOwnerUnlock,
      dismissPinPrompt,
      unlockAgent,
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
