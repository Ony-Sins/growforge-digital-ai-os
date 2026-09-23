"use client";

import React from "react";
import { Sparkles, Bot, X } from "lucide-react";
import { ChatView } from "@/components/workspace/ChatView";

interface SpatialChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  initialPrompt?: string;
}

export function SpatialChatDrawer({ isOpen, onClose, initialPrompt }: SpatialChatDrawerProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed z-40 top-16 bottom-20 right-4 sm:right-6 w-full max-w-lg pointer-events-none flex items-stretch animate-in fade-in slide-in-from-right-8 duration-300">
      <div
        className="pointer-events-auto relative flex flex-col w-full rounded-2xl bg-[#050b16]/90 border border-cyan-400/30 shadow-[0_0_1px_rgba(56,189,248,0.5),0_0_60px_rgba(56,189,248,0.18)] overflow-hidden backdrop-blur-2xl text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Holographic Instrument Corner Brackets */}
        <span className="pointer-events-none absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-cyan-300/90 z-20" />
        <span className="pointer-events-none absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-cyan-300/90 z-20" />
        <span className="pointer-events-none absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-cyan-300/90 z-20" />
        <span className="pointer-events-none absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-cyan-300/90 z-20" />

        {/* Top edge animated neon scan line */}
        <div className="pointer-events-none absolute top-0 inset-x-6 h-px bg-gradient-to-r from-transparent via-cyan-300 to-transparent animate-pulse z-20" />

        {/* Top holographic header banner */}
        <div className="relative px-4 pt-3 pb-2.5 border-b border-cyan-400/20 bg-cyan-400/[0.04] flex items-center justify-between z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-cyan-400">
                <span>AI Core Comm</span>
                <span className="text-slate-600">{"//"}</span>
                <span className="text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  Live
                </span>
              </div>
              <h2 className="text-xs font-bold text-white font-heading tracking-wide">
                GrowForge AI Assistant
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 border border-cyan-500/20 text-cyan-300">
              <Sparkles className="w-3 h-3 text-cyan-400" />
              Unified Memory
            </span>
            <button
              onClick={onClose}
              className="p-1 rounded-lg border border-cyan-400/20 text-cyan-300/70 hover:text-white hover:border-cyan-300/60 hover:bg-cyan-400/10 transition-colors"
              title="Close Assistant"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Ruler Tick Marks */}
        <div className="flex gap-[3px] px-4 opacity-50 bg-[#050b16]/60">
          {Array.from({ length: 44 }).map((_, i) => (
            <span key={i} className={`h-1 w-px ${i % 4 === 0 ? "bg-cyan-300/70 h-1.5" : "bg-cyan-300/25"}`} />
          ))}
        </div>

        {/* Embedded Real ChatView Body */}
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
