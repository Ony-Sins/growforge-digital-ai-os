"use client";

import React from "react";
import { ChatView } from "@/components/workspace/ChatView";

interface SpatialChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  initialPrompt?: string;
}

export function SpatialChatDrawer({ isOpen, onClose, initialPrompt }: SpatialChatDrawerProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed z-40 inset-x-3 top-24 bottom-20 sm:left-1/2 sm:right-auto sm:top-auto sm:bottom-7 sm:h-[min(64vh,680px)] sm:w-[min(760px,calc(100vw-2rem))] sm:-translate-x-1/2 pointer-events-none flex items-stretch animate-in fade-in slide-in-from-bottom-8 duration-300">
      <div
        className="pointer-events-auto relative flex flex-col w-full rounded-2xl bg-[#050b16]/90 border border-cyan-400/30 shadow-[0_0_1px_rgba(56,189,248,0.5),0_0_60px_rgba(56,189,248,0.18)] overflow-hidden backdrop-blur-2xl text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Holographic Instrument Corner Brackets */}
        <span className="pointer-events-none absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-cyan-300/90 z-20" />
        <span className="pointer-events-none absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-cyan-300/90 z-20" />
        <span className="pointer-events-none absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-cyan-300/90 z-20" />
        <span className="pointer-events-none absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-cyan-300/90 z-20" />

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Assistant"
          className="pointer-events-auto absolute top-3 right-3 z-30 grid h-7 w-7 place-items-center rounded-lg border border-white/10 bg-[#050b14]/80 text-slate-400 hover:border-cyan-400/30 hover:bg-white/10 hover:text-white transition"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex-1 min-h-0 flex flex-col bg-[#070b14]/70">
          <ChatView
            embedded={true}
            onClose={onClose}
            initialPrompt={initialPrompt}
            className="flex-1 flex flex-col min-h-0 overflow-hidden"
          />
        </div>
      </div>
    </div>
  );
}
