"use client";

import { SlidersHorizontal } from "lucide-react";
import { useAppState } from "@/lib/appState";

/** Interface mode (Simple/Advanced) and role (Employee/Owner) — moved here
 *  from the sidebar footer. Both are configuration decisions made rarely,
 *  not everyday actions, so they live in Settings rather than taking up
 *  permanent chrome. The app always starts in Simple mode / Employee role
 *  for a new session; changing either here is what reveals the rest of the
 *  Advanced-only surfaces elsewhere in the app. */
export function InterfaceAccessCard() {
  const { uiMode, setUiMode, role, setRole, requestOwnerUnlock } = useAppState();

  return (
    <div id="settings-access" className="glass-card rounded-xl p-5">
      <div className="mb-4 flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-electric" />
        <h2 className="font-heading text-sm font-semibold text-navy">Interface & Access</h2>
      </div>
      <p className="mb-4 text-xs text-secondary">
        Every new session starts in Simple mode as Employee — the clean, everyday view. Switch to Advanced here to
        reveal developer-facing surfaces (the Admin Drawer, raw connector/automation config, per-department access
        controls) anywhere in the app; switch to Owner to unlock owner-only actions.
      </p>

      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-lg border border-border-metal bg-sunken px-3 py-2">
          <div>
            <p className="text-sm font-medium text-navy">Mode</p>
            <p className="text-[11px] text-muted">Advanced shows dev/technical surfaces app-wide.</p>
          </div>
          <div className="flex overflow-hidden rounded-md border border-border-metal-strong">
            <button
              type="button"
              onClick={() => setUiMode("simple")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                uiMode === "simple" ? "bg-white text-navy" : "bg-transparent text-muted hover:text-navy"
              }`}
            >
              Simple
            </button>
            <button
              type="button"
              onClick={() => setUiMode("advanced")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                uiMode === "advanced" ? "bg-navy text-gold" : "bg-transparent text-muted hover:text-navy"
              }`}
            >
              Advanced
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border-metal bg-sunken px-3 py-2">
          <div>
            <p className="text-sm font-medium text-navy">Viewing as</p>
            <p className="text-[11px] text-muted">Owner requires the owner PIN, and resets each new session.</p>
          </div>
          <div className="flex overflow-hidden rounded-md border border-border-metal-strong">
            <button
              type="button"
              onClick={() => setRole("employee")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                role === "employee" ? "bg-white text-navy" : "bg-transparent text-muted hover:text-navy"
              }`}
            >
              Employee
            </button>
            <button
              type="button"
              onClick={() => (role === "owner" ? undefined : requestOwnerUnlock())}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                role === "owner" ? "bg-navy text-gold" : "bg-transparent text-muted hover:text-navy"
              }`}
            >
              Owner
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
