"use client";

import { useState } from "react";
import Image from "next/image";
import { Bell, ChevronRight, CircuitBoard, LogOut, Search } from "lucide-react";
import { signOut } from "next-auth/react";
import { StatusDot } from "@/components/ui/StatusDot";
import { useAppState } from "@/lib/appState";
import { usePendingSummary } from "@/lib/usePendingSummary";

interface HeaderUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role: "owner" | "employee";
}

function initialsFor(user: HeaderUser | null): string {
  const source = user?.name || user?.email || "GD";
  const parts = source.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function Header({ user }: { user: HeaderUser | null }) {
  const { setActiveView, avatarUrl } = useAppState();
  const pending = usePendingSummary();
  const pendingCount = pending.approvals + pending.consultations + pending.unapprovedPlans;
  const [notifOpen, setNotifOpen] = useState(false);

  return (
    <header className="relative z-40 flex h-16 shrink-0 items-center gap-4 border-b border-[#333333] bg-[#0B1220]/90 px-4 text-white backdrop-blur-xl md:px-6">
      {/* Mobile brand mark (sidebar hidden below md) — clicking any brand
          element returns you to the dashboard home view. */}
      <button
        type="button"
        onClick={() => setActiveView("dashboard")}
        aria-label="Back to dashboard home"
        className="relative flex h-10 w-10 shrink-0 items-center justify-center bg-[#111827] shadow-sm border border-[#333333] rounded-xl p-1.5 transition-transform hover:scale-105 md:hidden"
      >
        <Image src="/logo-mark.png" alt="GrowForge Digital" fill className="object-contain p-1" sizes="40px" />
      </button>

      {/* Breadcrumb — the brand/console crumb is a real way home */}
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <button
          type="button"
          onClick={() => setActiveView("dashboard")}
          title="Back to dashboard home"
          className="flex shrink-0 items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-[#111827]"
        >
          <CircuitBoard className="h-4 w-4 shrink-0 text-electric" />
          <span className="text-[#CCCCCC] hover:text-white">Console</span>
        </button>
        <ChevronRight className="h-3.5 w-3.5 text-muted" />
        <span className="truncate font-heading font-semibold text-white">Agent Dashboard</span>
      </div>

      {/* Search */}
      <div className="ml-2 hidden flex-1 max-w-md items-center gap-2 rounded-xl border border-[#333333] bg-[#111827] px-3.5 py-1.5 sm:flex">
        <Search className="h-3.5 w-3.5 text-muted" />
        <input
          type="text"
          name="global-search"
          placeholder="Search agents, pipelines, logs…"
          className="w-full bg-transparent font-mono text-xs text-white placeholder:text-muted focus:outline-none"
        />
        <kbd className="rounded border border-[#333333] bg-[#0B1220] px-1.5 py-0.5 font-mono text-[10px] text-muted">
          ⌘K
        </kbd>
      </div>

      <div className="ml-auto flex items-center gap-3">
        {/* System status */}
        <div className="hidden items-center gap-2 rounded-full border border-[#333333] bg-gradient-to-r from-electric/10 to-gold/10 px-3 py-1.5 sm:flex">
          <StatusDot status="active" pulse />
          <span className="font-mono text-xs text-[#CCCCCC]">System Nominal</span>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setNotifOpen((v) => !v)}
            aria-label={pendingCount > 0 ? `${pendingCount} pending — approvals, consultations, or plans waiting on you` : "No pending items"}
            title={pendingCount > 0 ? `${pendingCount} pending — approvals, consultations, or plans waiting on you` : "No pending items"}
            className="relative rounded-lg p-2 text-[#CCCCCC] transition-colors hover:bg-[#111827] hover:text-white"
          >
            <Bell className="h-[18px] w-[18px]" />
            {pendingCount > 0 && (
              <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-crimson px-1 text-[9px] font-bold leading-none text-white glow-crimson">
                {pendingCount > 9 ? "9+" : pendingCount}
              </span>
            )}
          </button>
          {notifOpen && (
            <>
              <button type="button" aria-label="Close notifications" className="fixed inset-0 z-40 cursor-default" onClick={() => setNotifOpen(false)} />
              <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-[#333333] bg-[#0B1220] p-2 shadow-2xl">
                {pendingCount === 0 ? (
                  <p className="px-2 py-3 text-center text-xs text-secondary">Nothing pending — you&apos;re all caught up.</p>
                ) : (
                  <ul className="space-y-1">
                    {pending.approvals > 0 && (
                      <li className="rounded-lg px-2 py-2 text-xs text-secondary">
                        <span className="font-semibold text-white">{pending.approvals}</span> real-action approval{pending.approvals === 1 ? "" : "s"} waiting — see the gold banner at the top of the screen.
                      </li>
                    )}
                    {pending.consultations > 0 && (
                      <li className="rounded-lg px-2 py-2 text-xs text-secondary">
                        <span className="font-semibold text-white">{pending.consultations}</span> operator question{pending.consultations === 1 ? "" : "s"} waiting — check the HITL drawer.
                      </li>
                    )}
                    {pending.unapprovedPlans > 0 && (
                      <li>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveView("workflows");
                            setNotifOpen(false);
                          }}
                          className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-xs text-secondary hover:bg-[#111827] hover:text-white"
                        >
                          <span>
                            <span className="font-semibold text-white">{pending.unapprovedPlans}</span> plan{pending.unapprovedPlans === 1 ? "" : "s"} finished, not yet approved
                          </span>
                          <span className="text-electric">View →</span>
                        </button>
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setActiveView("profile")}
          title="View & Edit Profile"
          className="flex items-center gap-2 rounded-lg p-1 transition-colors hover:bg-[#111827]"
        >
          {avatarUrl || user?.image ? (
            <Image
              src={avatarUrl || user!.image!}
              alt={user?.name ?? user?.email ?? "Account"}
              width={32}
              height={32}
              className="h-8 w-8 rounded-full object-cover shadow-sm ring-1 ring-[#333333]"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-electric to-gold text-xs font-semibold text-white shadow-sm">
              {initialsFor(user)}
            </div>
          )}
          <div className="hidden flex-col leading-tight lg:flex">
            <span className="truncate text-xs font-semibold text-white">Profile</span>
            <span className="text-[10px] uppercase tracking-wide text-muted">{user?.role ?? "employee"} • Memory</span>
          </div>
        </button>
        <button
          type="button"
          aria-label="Sign out"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="rounded-lg p-2 text-secondary transition-colors hover:bg-[#111827] hover:text-crimson"
        >
          <LogOut className="h-[18px] w-[18px]" />
        </button>
      </div>
    </header>
  );
}
