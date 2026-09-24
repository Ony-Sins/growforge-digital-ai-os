"use client";

import { User, X } from "lucide-react";
import { useAppState } from "@/lib/appState";
import { ProfileDashboard } from "@/components/workspace/ProfileDashboard";

interface UserProfileOverlayUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role: "owner" | "employee";
}

/**
 * User Profile overlay — AI Brain + Memory Profile.
 * Supports the Phase 5 3D Microscopic Neural Canvas (WebGL/Three.js) in a
 * dedicated full-screen spatial viewport alongside the 2D architecture flow map.
 */
export function UserProfileOverlay({ user }: { user: UserProfileOverlayUser | null }) {
  const { isUserProfileOpen, userProfileTab, openUserProfile, closeUserProfile } = useAppState();

  if (!isUserProfileOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0B1220] text-white">
      {/* Top Bar with brand-styled tabs */}
      <div className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-[#333333] bg-[#0B1220]/95 px-4 backdrop-blur-xl md:px-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-xl border border-[#333333] bg-[#0B1220]/90 p-1">
            <button
              type="button"
              onClick={() => openUserProfile("profile")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-all ${
                userProfileTab === "profile"
                  ? "bg-[#0078FF] text-white font-sora font-semibold shadow-lg shadow-[#0078FF]/20"
                  : "text-[#CCCCCC] hover:text-white hover:bg-[#1F2937]"
              }`}
            >
              <User className="h-3.5 w-3.5" /> Profile
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={closeUserProfile}
            aria-label="Close User Profile"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#333333] bg-[#0B1220]/90 text-[#CCCCCC] hover:border-[#0078FF] hover:text-white transition-all"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main View Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-7xl">
          <ProfileDashboard user={user} />
        </div>
      </div>
    </div>
  );
}
