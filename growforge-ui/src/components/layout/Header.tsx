"use client";

import Image from "next/image";
import { Bell, ChevronRight, CircuitBoard, LogOut, Search, Shield, Terminal } from "lucide-react";
import { signOut } from "next-auth/react";
import { StatusDot } from "@/components/ui/StatusDot";
import { useAppState } from "@/lib/appState";

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
  const { openAdminDrawer } = useAppState();

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border-metal bg-white/70 px-4 backdrop-blur-xl md:px-6">
      {/* Mobile brand mark (sidebar hidden below md) - Encapsulated in solid-white container */}
      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center bg-white shadow-sm border border-slate-100 rounded-xl p-1.5 md:hidden">
        <Image src="/logo-mark.png" alt="GrowForge Digital" fill className="object-contain p-1" sizes="40px" />
      </span>

      {/* Breadcrumb */}
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <CircuitBoard className="h-4 w-4 shrink-0 text-electric" />
        <span className="text-secondary">Console</span>
        <ChevronRight className="h-3.5 w-3.5 text-muted" />
        <span className="truncate font-heading font-semibold text-navy">Agent Dashboard</span>
      </div>

      {/* Search */}
      <div className="ml-2 hidden flex-1 max-w-md items-center gap-2 rounded-lg border border-border-metal bg-sunken px-3 py-1.5 sm:flex">
        <Search className="h-3.5 w-3.5 text-muted" />
        <input
          type="text"
          name="global-search"
          placeholder="Search agents, workflows, logs…"
          className="w-full bg-transparent font-mono text-xs text-secondary placeholder:text-muted focus:outline-none"
        />
        <kbd className="rounded border border-border-metal bg-white px-1.5 py-0.5 font-mono text-[10px] text-muted">
          ⌘K
        </kbd>
      </div>

      <div className="ml-auto flex items-center gap-3">
        {/* Admin Drawer Toggle Button */}
        <button
          type="button"
          onClick={() => openAdminDrawer()}
          title="Open Admin & Developer Console"
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-navy shadow-sm transition-all hover:border-electric/50 hover:bg-slate-50 active:scale-95"
        >
          <Shield className="h-3.5 w-3.5 text-electric" />
          <span className="hidden sm:inline">Admin Drawer</span>
        </button>

        {/* System status */}
        <div className="hidden items-center gap-2 rounded-full border border-border-metal bg-gradient-to-r from-electric/10 to-gold/10 px-3 py-1.5 sm:flex">
          <StatusDot status="active" pulse />
          <span className="font-mono text-xs text-secondary">System Nominal</span>
        </div>

        <button
          aria-label="Notifications"
          className="relative rounded-lg p-2 text-secondary transition-colors hover:bg-sunken hover:text-navy"
        >
          <Bell className="h-[18px] w-[18px]" />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-crimson glow-crimson" />
        </button>

        <a
          href="/profile"
          title="View & Edit Memory Profile"
          className="flex items-center gap-2 rounded-lg p-1 transition-colors hover:bg-slate-100"
        >
          {user?.image ? (
            <Image
              src={user.image}
              alt={user.name ?? user.email ?? "Account"}
              width={32}
              height={32}
              className="h-8 w-8 rounded-full object-cover shadow-sm"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-electric to-gold text-xs font-semibold text-white shadow-sm">
              {initialsFor(user)}
            </div>
          )}
          <div className="hidden flex-col leading-tight lg:flex">
            <span className="truncate text-xs font-semibold text-navy">{user?.name ?? user?.email ?? "Signed in"}</span>
            <span className="text-[10px] uppercase tracking-wide text-muted">{user?.role ?? "employee"} • Memory</span>
          </div>
        </a>
        <button
          type="button"
          aria-label="Sign out"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="rounded-lg p-2 text-secondary transition-colors hover:bg-sunken hover:text-crimson"
        >
          <LogOut className="h-[18px] w-[18px]" />
        </button>
      </div>
    </header>
  );
}
