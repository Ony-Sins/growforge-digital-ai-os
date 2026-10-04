/** Device-local presentation preferences, never application/object state. */
export type ShellVisibility = { nora: boolean; index: boolean; focus: boolean };
export const DEFAULT_SHELL_VISIBILITY: ShellVisibility = { nora: true, index: true, focus: false };
export const SHELL_VISIBILITY_KEY = 'growforge.shell.visibility';

export function readShellVisibility(value: string | null): ShellVisibility {
  try {
    const saved = JSON.parse(value ?? '{}');
    return { nora: typeof saved?.nora === 'boolean' ? saved.nora : true, index: typeof saved?.index === 'boolean' ? saved.index : true, focus: false };
  } catch { return DEFAULT_SHELL_VISIBILITY; }
}

export function changeShellVisibility(state: ShellVisibility, panel: 'nora' | 'index', visible: boolean): ShellVisibility {
  return { ...state, [panel]: visible, focus: false };
}

export function shellPanels(state: ShellVisibility) {
  return { nora: state.nora && !state.focus, index: state.index && !state.focus };
}
