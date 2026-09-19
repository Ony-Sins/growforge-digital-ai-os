"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Brain, Network, User, X } from "lucide-react";
import { useAppState } from "@/lib/appState";
import { AIBrainCanvas } from "@/components/workspace/AIBrainCanvas";
import { ProfileDashboard } from "@/components/workspace/ProfileDashboard";

const NeuralBrainCanvas = dynamic(
  () => import("@/components/brain/NeuralBrainCanvas").then((m) => m.NeuralBrainCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[600px] w-full flex-col items-center justify-center rounded-2xl border border-border-metal bg-[#070b14] text-slate-400">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-electric border-t-transparent" />
        <p className="mt-3 font-mono text-xs text-sky-400">Initializing WebGL 3D Neural Canvas...</p>
      </div>
    ),
  }
);

interface UserProfileOverlayUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role: "owner" | "employee";
}

/**
 * User Profile overlay — AI Brain + Memory Profile.
 * Supports the Phase 5 3D Microscopic Neural Canvas (WebGL/Three.js)
 * alongside the 2D xyflow architecture map.
 */
export function UserProfileOverlay({ user }: { user: UserProfileOverlayUser | null }) {
  const { isUserProfileOpen, userProfileTab, openUserProfile, closeUserProfile } = useAppState();
  const [brainMode, setBrainMode] = useState<"3d" | "2d">("3d");

  if (!isUserProfileOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-app">
      <div className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border-metal bg-white/80 px-4 backdrop-blur-xl md:px-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-xl border border-border-metal bg-sunken p-1">
            <button
              type="button"
              onClick={() => openUserProfile("brain")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                userProfileTab === "brain"
                  ? "bg-white text-navy shadow-sm ring-1 ring-border-metal-strong"
                  : "text-secondary hover:text-navy"
              }`}
            >
              <Brain className="h-3.5 w-3.5 text-electric" /> AI Brain
            </button>
            <button
              type="button"
              onClick={() => openUserProfile("profile")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                userProfileTab === "profile"
                  ? "bg-white text-navy shadow-sm ring-1 ring-border-metal-strong"
                  : "text-secondary hover:text-navy"
              }`}
            >
              <User className="h-3.5 w-3.5 text-electric" /> Profile
            </button>
          </div>

          {userProfileTab === "brain" && (
            <div className="hidden sm:flex items-center gap-1 rounded-lg border border-border-metal bg-slate-100 p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setBrainMode("3d")}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors ${
                  brainMode === "3d"
                    ? "bg-navy text-white shadow-sm"
                    : "text-slate-600 hover:text-navy"
                }`}
              >
                <Brain className="h-3 w-3 text-sky-400" /> 3D Neural View
              </button>
              <button
                type="button"
                onClick={() => setBrainMode("2d")}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors ${
                  brainMode === "2d"
                    ? "bg-navy text-white shadow-sm"
                    : "text-slate-600 hover:text-navy"
                }`}
              >
                <Network className="h-3 w-3 text-emerald-400" /> 2D Flow Map
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={closeUserProfile}
            aria-label="Close User Profile"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border-metal bg-white text-secondary hover:text-navy"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-7xl">
          {userProfileTab === "brain" ? (
            brainMode === "3d" ? (
              <NeuralBrainCanvas className="h-[calc(100vh-8.5rem)] min-h-[620px]" />
            ) : (
              <AIBrainCanvas />
            )
          ) : (
            <ProfileDashboard user={user} />
          )}
        </div>
      </div>
    </div>
  );
}
