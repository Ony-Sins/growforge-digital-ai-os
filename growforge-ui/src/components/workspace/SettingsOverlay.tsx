"use client";

import { useState } from "react";
import {
  Key,
  Plug,
  SlidersHorizontal,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAppState } from "@/lib/appState";
import { InterfaceAccessCard } from "@/components/workspace/InterfaceAccessCard";
import { IntegrationsHub } from "@/components/workspace/IntegrationsHub";
import { AiModelManager } from "@/components/workspace/AiModelManager";

interface SettingsCategory {
  id: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
  description: string;
}

const SETTINGS_CATEGORIES: SettingsCategory[] = [
  {
    id: "connectors",
    label: "Connectors & Plugins",
    icon: Plug,
    badge: "Unified",
    description: "Master hub for MCP tools, custom REST endpoints, and dynamic capabilities.",
  },
  {
    id: "ai-providers",
    label: "AI Models & Gateways",
    icon: Key,
    badge: "Active",
    description: "Local Ollama (Qwen 2.5), OpenRouter gateway, cloud LLMs, and custom BYO endpoints.",
  },
  {
    id: "preferences",
    label: "Preferences & Access",
    icon: SlidersHorizontal,
    description: "Workspace mode (Simple vs. Advanced) and developer PIN access controls.",
  },
];

function resolveCategoryId(tab?: string): string {
  if (!tab) return "connectors";
  const t = tab.toLowerCase();
  if (t === "ai-providers" || t === "ai" || t === "models") return "ai-providers";
  if (t === "preferences" || t === "developer" || t === "access") return "preferences";
  // n8n config lives inside the Connectors & Plugins grid (its own card +
  // modal), not a separate tab — see state.md for why the dedicated
  // "automation" tab (a near-duplicate of that same modal) was removed.
  if (t === "connectors" || t === "plugins" || t === "byo-mcp" || t === "mcp" || t === "automation" || t === "n8n") {
    return "connectors";
  }
  return "connectors";
}

export function SettingsOverlay() {
  const { isSettingsOpen, settingsTab, closeSettings } = useAppState();
  const [activeCategoryId, setActiveCategoryId] = useState<string>(() => resolveCategoryId(settingsTab));
  const [prevSettingsTab, setPrevSettingsTab] = useState(settingsTab);

  if (settingsTab !== prevSettingsTab) {
    setPrevSettingsTab(settingsTab);
    if (settingsTab) {
      setActiveCategoryId(resolveCategoryId(settingsTab));
    }
  }

  if (!isSettingsOpen) return null;

  const activeCategory =
    SETTINGS_CATEGORIES.find((c) => c.id === activeCategoryId) || SETTINGS_CATEGORIES[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-5 backdrop-blur-md animate-in fade-in duration-200"
      onClick={closeSettings}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[88vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-[#333333] bg-[#0B1220] text-white shadow-2xl backdrop-blur-2xl animate-in zoom-in-95 duration-200"
      >
        {/* Left Navigation Rail */}
        <div className="hidden w-64 shrink-0 flex-col border-r border-[#333333] bg-[#000000]/60 p-3.5 sm:flex overflow-y-auto">
          {/* Header */}
          <div className="flex items-center gap-2.5 px-2 pb-3.5 pt-1 border-b border-[#333333]">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-electric/15 text-electric border border-electric/30 shadow-sm">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="font-heading text-xs font-semibold text-white">Connections Hub</p>
              <p className="text-[10px] text-[#CCCCCC]">GrowForge AI OS</p>
            </div>
          </div>

          {/* Categories Navigation */}
          <div className="mt-4 space-y-1">
            <span className="px-2.5 text-[10px] font-bold uppercase tracking-wider text-[#CCCCCC] font-inter">
              Ecosystem &amp; Services
            </span>
            <ul className="mt-1 space-y-1">
              {SETTINGS_CATEGORIES.map((item) => {
                const Icon = item.icon;
                const active = activeCategoryId === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setActiveCategoryId(item.id)}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-medium font-inter transition-all ${
                        active
                          ? "bg-electric/20 text-white ring-1 ring-electric/40 font-semibold shadow-sm"
                          : "text-[#CCCCCC] hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon
                          className={`h-4 w-4 shrink-0 ${
                            active ? "text-electric" : "text-[#CCCCCC]"
                          }`}
                        />
                        <span className="truncate">{item.label}</span>
                      </div>
                      {item.badge && (
                        <span className="rounded-full bg-electric/15 text-sky-300 px-2 py-0.5 text-[9px] font-bold uppercase shrink-0 border border-electric/30">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* Right Content Pane */}
        <div className="flex flex-1 flex-col overflow-hidden bg-[#0B1220]">
          {/* Top Header Bar */}
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#333333] px-5 bg-[#111c34]/70 backdrop-blur-md">
            <div className="flex items-center gap-2.5">
              <activeCategory.icon className="h-4 w-4 text-electric" />
              <div>
                <h1 className="font-heading text-sm font-semibold text-white">{activeCategory.label}</h1>
                <p className="hidden md:block text-[11px] text-[#CCCCCC] truncate max-w-md font-inter">
                  {activeCategory.description}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={closeSettings}
              aria-label="Close Settings"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[#CCCCCC] hover:bg-white/10 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Active Category Content Panel */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-[#0B1220]">
            {/* 1. Unified Connectors & Plugins Directory */}
            {activeCategoryId === "connectors" && <IntegrationsHub />}

            {/* 2. AI Models & API Keys */}
            {activeCategoryId === "ai-providers" && <AiModelManager />}

            {/* 3. Interface & Access Preferences */}
            {activeCategoryId === "preferences" && (
              <div className="space-y-4 max-w-3xl">
                <InterfaceAccessCard />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
