"use client";

import { Cpu, Sparkles } from "lucide-react";

interface WebLlmIndicatorProps {
  progressText?: string | null;
  progressPercent?: number | null;
  isGenerating?: boolean;
}

export function WebLlmIndicator({ progressText, progressPercent, isGenerating }: WebLlmIndicatorProps) {
  if (!progressText && !isGenerating && (progressPercent === null || progressPercent === undefined)) {
    return null;
  }

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-electric/30 bg-[#0B1220]/90 px-3.5 py-2 text-xs backdrop-blur-md shadow-lg animate-in fade-in duration-200">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-electric/20 text-electric">
        {isGenerating ? (
          <Sparkles className="h-3.5 w-3.5 animate-pulse" />
        ) : (
          <Cpu className="h-3.5 w-3.5 animate-spin" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[11px] font-semibold text-white">
            {isGenerating ? "In-Browser WebLLM (Llama 3.2 1B)" : "Loading In-Browser Model (WebGPU)"}
          </span>
          {typeof progressPercent === "number" && progressPercent > 0 && progressPercent < 100 && (
            <span className="font-mono text-[10px] text-electric font-bold">{progressPercent}%</span>
          )}
        </div>
        {progressText && (
          <p className="mt-0.5 truncate font-mono text-[10px] text-[#CCCCCC]">{progressText}</p>
        )}
      </div>
    </div>
  );
}
