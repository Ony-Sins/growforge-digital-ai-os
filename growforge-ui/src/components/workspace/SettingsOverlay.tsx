"use client";
import { useAppState } from "@/lib/appState";
import { SystemsControlPlane } from "./SystemsControlPlane";
/** Legacy entry points all resolve to the same first-class Systems surface. */
export function SettingsOverlay() {
  const { isSettingsOpen, settingsTab, closeSettings } = useAppState();
  return isSettingsOpen ? <SystemsControlPlane initialArea={settingsTab} onClose={closeSettings}/> : null;
}
