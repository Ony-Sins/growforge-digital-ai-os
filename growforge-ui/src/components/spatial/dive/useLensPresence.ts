"use client";

import { useEffect, useState } from "react";

/**
 * Keeps a lens layer mounted for `ms` after it stops being active, so its exit can be a fade instead of a cut.
 * `leaving` is true during that window (the layer must be inert and non-interactive). ms <= 0 means no lingering.
 */
export function useLensPresence(active: boolean, ms: number): { mounted: boolean; leaving: boolean } {
  const [state, setState] = useState({ active, leaving: false });
  if (state.active !== active) setState({ active, leaving: !active && ms > 0 });
  useEffect(() => {
    if (!state.leaving) return;
    const timer = setTimeout(() => setState(current => ({ ...current, leaving: false })), ms);
    return () => clearTimeout(timer);
  }, [state.leaving, ms]);
  const leaving = !active && state.leaving;
  return { mounted: active || leaving, leaving };
}
