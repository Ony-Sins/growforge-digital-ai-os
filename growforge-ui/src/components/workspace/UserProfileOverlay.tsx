"use client";

import { Brain, User, X } from "lucide-react";
import { useAppState } from "@/lib/appState";
import { AIBrainCanvas } from "@/components/workspace/AIBrainCanvas";
import { ProfileDashboard } from "@/components/workspace/ProfileDashboard";

interface UserProfileOverlayUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role: "owner" | "employee";
}

/**
 * User Profile overlay — AI Brain + Memory Profile, together, off the main
 * dashboard scroll (Phase 3 item; both used to be inline sections there).
 * A full-screen takeover rather than a narrow side drawer: AI Brain's graph
 * and Memory Profile's forms both need real room. This is the deliberately
 * plain container Phase 5 replaces with the full 3D holographic build —
 * getting the surface right now, not the spectacle.
 */
export function UserProfileOverlay({ user }: { user: UserProfileOverlayUser | null }) {
  const { isUserProfileOpen, userProfileTab, openUserProfile, closeUserProfile } = useAppState();

  if (!isUserProfileOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-app">
      <div className="flex h-16 shrink-0 items-center gap-4 border-b border-border-metal bg-white/80 px-4 backdrop-blur-xl md:px-6">
        <div className="flex items-center gap-1 rounded-xl border border-border-metal bg-sunken p-1">
          <button
            type="button"
            onClick={() => openUserProfile("brain")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              userProfileTab === "brain" ? "bg-white text-navy shadow-sm ring-1 ring-border-metal-strong" : "text-secondary hover:text-navy"
            }`}
          >
            <Brain className="h-3.5 w-3.5 text-electric" /> AI Brain
          </button>
          <button
            type="button"
            onClick={() => openUserProfile("profile")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              userProfileTab === "profile" ? "bg-white text-navy shadow-sm ring-1 ring-border-metal-strong" : "text-secondary hover:text-navy"
            }`}
          >
            <User className="h-3.5 w-3.5 text-electric" /> Profile
          </button>
        </div>
        <div className="ml-auto">
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
        <div className="mx-auto max-w-6xl">
          {userProfileTab === "brain" ? (
            <AIBrainCanvas />
          ) : (
            <ProfileDashboard user={user} />
          )}
        </div>
      </div>
    </div>
  );
}
