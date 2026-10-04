"use client";

import React, { useEffect } from "react";
import { useAppState } from "@/lib/appState";
import { BetaTesterSettings } from "./BetaTesterSettings";

export function BetaByokOverlay({ testerEmail }: { testerEmail: string }) {
  const { isSettingsOpen, closeSettings } = useAppState();

  // Close on Escape key press
  useEffect(() => {
    if (!isSettingsOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeSettings();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSettingsOpen, closeSettings]);

  if (!isSettingsOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-5 backdrop-blur-md animate-in fade-in duration-200"
      onClick={closeSettings}
      role="dialog"
      aria-modal="true"
      aria-label="Beta BYOK Settings"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-cyan-500/30 bg-[#060e1d] text-slate-200 shadow-2xl backdrop-blur-2xl animate-in zoom-in-95 duration-200"
      >
        <div className="flex-1 overflow-y-auto p-4 sm:p-8">
          <BetaTesterSettings testerEmail={testerEmail} onClose={closeSettings} isOverlay={true} />
        </div>
      </div>
    </div>
  );
}
