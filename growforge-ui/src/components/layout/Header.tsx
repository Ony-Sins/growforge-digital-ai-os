"use client";

import Image from "next/image";
import { Bell, ChevronRight, CircuitBoard, Search } from "lucide-react";
import { StatusDot } from "@/components/ui/StatusDot";

export function Header() {
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border-metal bg-white/70 px-4 backdrop-blur-xl md:px-6">
      {/* Mobile brand mark (sidebar hidden below md) */}
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-navy md:hidden">
        <Image src="/logo.png" alt="GrowForge Digital" fill className="scale-[1.85] object-cover" sizes="36px" />
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

      <div className="ml-auto flex items-center gap-4">
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

        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-electric to-gold text-xs font-semibold text-white shadow-sm">
          GD
        </div>
      </div>
    </header>
  );
}
