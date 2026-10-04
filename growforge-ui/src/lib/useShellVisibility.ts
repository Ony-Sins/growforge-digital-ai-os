"use client";

import { useSyncExternalStore } from 'react';
import { DEFAULT_SHELL_VISIBILITY, SHELL_VISIBILITY_KEY, changeShellVisibility, readShellVisibility, shellPanels, type ShellVisibility } from './shellVisibility';

let snapshot = DEFAULT_SHELL_VISIBILITY;
let initialized = false;
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!initialized) {
    initialized = true;
    try { snapshot = readShellVisibility(localStorage.getItem(SHELL_VISIBILITY_KEY)); } catch { /* Storage unavailable: session-local preferences still work. */ }
  }
  return () => { listeners.delete(listener); };
}
function update(next: ShellVisibility) {
  snapshot = next;
  try { localStorage.setItem(SHELL_VISIBILITY_KEY, JSON.stringify({ nora: next.nora, index: next.index })); } catch { /* No backend fallback for display preferences. */ }
  for (const listener of listeners) listener();
}
const setPanel = (panel: 'nora' | 'index', visible: boolean) => update(changeShellVisibility(snapshot, panel, visible));
const toggleFocus = () => update({ ...snapshot, focus: !snapshot.focus });

export function useShellVisibility() {
  const state = useSyncExternalStore(subscribe, () => snapshot, () => DEFAULT_SHELL_VISIBILITY);
  return {
    state, panels: shellPanels(state),
    setPanel, toggleFocus,
  };
}
