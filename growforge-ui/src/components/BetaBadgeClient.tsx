"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageSquarePlus } from "lucide-react";
import { BetaFeedbackModal } from "./BetaFeedbackModal";

export function BetaBadgeClient({ role }: { role: "tester" | "owner" }) {
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

  return (
    <>
      <div className="pointer-events-auto fixed bottom-4 right-4 z-[80] flex items-center gap-2 rounded-full border border-cyan-400/25 bg-[#0b1220]/90 px-3 py-1.5 text-[11px] text-slate-300 backdrop-blur shadow-lg">
        <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" aria-hidden />
        <span>Private Beta</span>
        <button
          type="button"
          onClick={() => setIsFeedbackOpen(true)}
          className="flex items-center gap-1 ml-1 text-cyan-300 hover:text-white transition font-medium border-l border-slate-700 pl-2"
        >
          <MessageSquarePlus className="h-3 w-3" />
          <span>Feedback</span>
        </button>
        {role === "owner" && (
          <Link
            href="/beta/admin"
            className="ml-1 text-slate-400 hover:text-cyan-300 transition border-l border-slate-700 pl-2"
          >
            Admin
          </Link>
        )}
      </div>

      <BetaFeedbackModal
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
      />
    </>
  );
}
