"use client";

import { useState } from "react";
import { Bot, Cable, Plug, SlidersHorizontal, Sparkles, Workflow, X, type LucideIcon } from "lucide-react";
import { useAppState } from "@/lib/appState";
import { InterfaceAccessCard } from "@/components/workspace/InterfaceAccessCard";
import { IntegrationsHub } from "@/components/workspace/IntegrationsHub";

interface Category {
  id: string;
  label: string;
  icon: LucideIcon;
}

const CATEGORIES: Category[] = [
  { id: "settings-access", label: "Interface & Access", icon: SlidersHorizontal },
  { id: "settings-connectors", label: "Connectors (MCP)", icon: Plug },
  { id: "settings-n8n", label: "n8n Automation", icon: Workflow },
  { id: "settings-custom", label: "Custom Connectors", icon: Cable },
  { id: "settings-ai-providers", label: "AI Providers", icon: Sparkles },
];

/**
 * Settings overlay — a centered modal box (Claude/ChatGPT desktop settings
 * pattern: a left category rail, a scrollable content pane), not the
 * previous full-screen page. Content itself is unchanged (InterfaceAccessCard
 * + IntegrationsHub) — this only changes the container and adds a category
 * rail that scrolls the pane to each section's existing id, the same
 * scrollIntoView pattern the dashboard's own nav already uses.
 */
export function SettingsOverlay() {
  const { isSettingsOpen, closeSettings, uiMode } = useAppState();
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0].id);

  if (!isSettingsOpen) return null;

  // n8n/Custom Connectors/AI Providers only render in Advanced mode
  // (IntegrationsHub's own gate) — the rail should only list categories
  // that actually exist in the pane, or a click would scroll to nothing.
  const visibleCategories =
    uiMode === "advanced" ? CATEGORIES : CATEGORIES.filter((c) => c.id === "settings-access" || c.id === "settings-connectors");

  function goTo(id: string) {
    setActiveCategory(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4 backdrop-blur-sm" onClick={closeSettings}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[85vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-border-metal bg-white shadow-2xl"
      >
        {/* Category rail */}
        <div className="hidden w-56 shrink-0 flex-col border-r border-border-metal bg-sunken/40 p-3 sm:flex">
          <p className="px-2 pb-2 pt-1 font-heading text-sm font-semibold text-navy">Settings</p>
          <ul className="space-y-0.5">
            {visibleCategories.map((cat) => {
              const Icon = cat.icon;
              const active = activeCategory === cat.id;
              return (
                <li key={cat.id}>
                  <button
                    type="button"
                    onClick={() => goTo(cat.id)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                      active ? "bg-white text-navy shadow-sm ring-1 ring-border-metal-strong" : "text-secondary hover:bg-white/60 hover:text-navy"
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${active ? "text-electric" : "text-muted"}`} />
                    <span className="truncate">{cat.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Content pane */}
        <div className="flex flex-1 flex-col">
          <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border-metal px-4">
            <Bot className="h-4 w-4 text-electric sm:hidden" />
            <h1 className="font-heading text-sm font-semibold text-navy sm:hidden">Settings</h1>
            <button
              type="button"
              onClick={closeSettings}
              aria-label="Close Settings"
              className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-secondary hover:bg-sunken hover:text-navy"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto p-4 md:p-6">
            <InterfaceAccessCard />
            <IntegrationsHub />
          </div>
        </div>
      </div>
    </div>
  );
}
