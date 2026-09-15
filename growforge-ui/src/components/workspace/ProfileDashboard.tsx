"use client";

import { useEffect, useState } from "react";
import {
  Brain,
  CheckCircle2,
  Download,
  Flame,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Shield,
  Sparkles,
  Target,
  Trash2,
  UserCheck,
  XCircle,
  Zap,
} from "lucide-react";
import type { UserMemory } from "@/lib/userMemory";

interface ProfileDashboardProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role: "owner" | "employee";
  } | null;
}

const STYLE_PRESETS = [
  {
    name: "Executive & Data-Driven",
    text: "High-conviction, data-driven, executive tone. Concrete numbers, clear timelines, zero fluff, and no generic marketing buzzwords.",
  },
  {
    name: "Growth & High-Velocity",
    text: "Energetic, direct, ROI-focused. Prioritize rapid customer acquisition, aggressive testing milestones, and modern growth marketing tactics.",
  },
  {
    name: "Technical & Rigorous",
    text: "Analytical, granular, and architectural. Focus on technical feasibility, exact metrics, platform trade-offs, and compliance.",
  },
];

export function ProfileDashboard({ user }: ProfileDashboardProps) {
  const [memory, setMemory] = useState<UserMemory | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [writingStyle, setWritingStyle] = useState("");
  const [newRule, setNewRule] = useState("");
  const [newRejection, setNewRejection] = useState("");
  const [newObservation, setNewObservation] = useState("");
  const [newPrefKey, setNewPrefKey] = useState("");
  const [newPrefVal, setNewPrefVal] = useState("");

  async function loadMemory() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/memory");
      if (!res.ok) {
        throw new Error("Failed to load user memory profile.");
      }
      const data = await res.json();
      if (data.memory) {
        setMemory(data.memory);
        setWritingStyle(data.memory.writingStyle || "");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load memory.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMemory();
  }, []);

  async function saveMemoryPatch(patch: Partial<UserMemory>) {
    setSaving(true);
    setSaveSuccess(false);
    setError(null);
    try {
      const res = await fetch("/api/profile/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Failed to save memory changes.");
      const data = await res.json();
      if (data.memory) {
        setMemory(data.memory);
        setWritingStyle(data.memory.writingStyle || "");
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!window.confirm("Are you sure you want to reset your learned memory profile back to clean defaults?")) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/memory", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to reset memory.");
      const data = await res.json();
      if (data.memory) {
        setMemory(data.memory);
        setWritingStyle(data.memory.writingStyle || "");
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset.");
    } finally {
      setSaving(false);
    }
  }

  function handleAddRule(e: React.FormEvent) {
    e.preventDefault();
    if (!newRule.trim() || !memory) return;
    const nextRules = [...memory.brandRules, newRule.trim()];
    setNewRule("");
    saveMemoryPatch({ brandRules: nextRules });
  }

  function handleDeleteRule(index: number) {
    if (!memory) return;
    const nextRules = memory.brandRules.filter((_, i) => i !== index);
    saveMemoryPatch({ brandRules: nextRules });
  }

  function handleAddRejection(e: React.FormEvent) {
    e.preventDefault();
    if (!newRejection.trim() || !memory) return;
    const nextRejections = [...memory.explicitRejections, newRejection.trim()];
    setNewRejection("");
    saveMemoryPatch({ explicitRejections: nextRejections });
  }

  function handleDeleteRejection(index: number) {
    if (!memory) return;
    const next = memory.explicitRejections.filter((_, i) => i !== index);
    saveMemoryPatch({ explicitRejections: next });
  }

  function handleAddObservation(e: React.FormEvent) {
    e.preventDefault();
    if (!newObservation.trim() || !memory) return;
    const next = [newObservation.trim(), ...memory.learnedObservations];
    setNewObservation("");
    saveMemoryPatch({ learnedObservations: next });
  }

  function handleDeleteObservation(index: number) {
    if (!memory) return;
    const next = memory.learnedObservations.filter((_, i) => i !== index);
    saveMemoryPatch({ learnedObservations: next });
  }

  function handleAddPref(e: React.FormEvent) {
    e.preventDefault();
    if (!newPrefKey.trim() || !newPrefVal.trim() || !memory) return;
    const nextPrefs = {
      ...memory.preferences,
      [newPrefKey.trim().toLowerCase()]: newPrefVal.trim(),
    };
    setNewPrefKey("");
    setNewPrefVal("");
    saveMemoryPatch({ preferences: nextPrefs });
  }

  function handleDeletePref(key: string) {
    if (!memory) return;
    const nextPrefs = { ...memory.preferences };
    delete nextPrefs[key];
    saveMemoryPatch({ preferences: nextPrefs });
  }

  function handleExport() {
    if (!memory) return;
    const blob = new Blob([JSON.stringify(memory, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `growforge-memory-${user?.email?.replace(/[^a-z0-9]/gi, "_") || "user"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-electric" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Profile Overview Card */}
      <div className="bg-white shadow-sm border border-slate-100 rounded-xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-electric to-gold text-lg font-bold text-white shadow-sm">
              {user?.email?.slice(0, 2).toUpperCase() || "GF"}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-heading text-lg font-bold text-navy">
                  {user?.name || user?.email || "Operator Profile"}
                </h1>
                <span className="rounded-full bg-navy/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-navy">
                  {user?.role || "Employee"}
                </span>
                <span className="flex items-center gap-1 rounded-full bg-emerald/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald">
                  <CheckCircle2 className="h-3 w-3" /> Memory Active
                </span>
              </div>
              <p className="mt-0.5 font-mono text-xs text-muted">{user?.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExport}
              className="flex items-center gap-1.5 rounded-lg border border-border-metal bg-sunken px-3 py-2 text-xs font-medium text-secondary transition-colors hover:bg-white hover:text-navy"
            >
              <Download className="h-3.5 w-3.5" />
              Export JSON
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg border border-crimson/20 bg-crimson/5 px-3 py-2 text-xs font-medium text-crimson transition-colors hover:bg-crimson/10 disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Defaults
            </button>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg bg-sunken p-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Brand Rules</p>
            <p className="mt-1 font-heading text-xl font-bold text-navy">{memory?.brandRules.length || 0}</p>
          </div>
          <div className="rounded-lg bg-sunken p-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Strategic Prefs</p>
            <p className="mt-1 font-heading text-xl font-bold text-navy">
              {Object.keys(memory?.preferences || {}).length}
            </p>
          </div>
          <div className="rounded-lg bg-sunken p-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Learned Nuances</p>
            <p className="mt-1 font-heading text-xl font-bold text-electric">
              {memory?.learnedObservations.length || 0}
            </p>
          </div>
          <div className="rounded-lg bg-sunken p-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Hard Rejections</p>
            <p className="mt-1 font-heading text-xl font-bold text-crimson">
              {memory?.explicitRejections.length || 0}
            </p>
          </div>
        </div>

        {saveSuccess && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald/10 px-3 py-2 text-xs font-medium text-emerald">
            <CheckCircle2 className="h-4 w-4" />
            Memory profile saved. Active in all future pipeline executions!
          </div>
        )}
        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-crimson/10 px-3 py-2 text-xs font-medium text-crimson">
            <XCircle className="h-4 w-4" />
            {error}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Writing Style & Tone Card */}
        <div className="bg-white shadow-sm border border-slate-100 rounded-xl p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-electric" />
            <h2 className="font-heading text-sm font-semibold text-navy">Writing Style &amp; Tone</h2>
          </div>
          <p className="mt-1 text-xs text-secondary">
            Dictates how the HQ Orchestrator and department agents phrase recommendations, deliverables, and briefs.
          </p>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {STYLE_PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => setWritingStyle(preset.text)}
                className="rounded-lg border border-border-metal bg-sunken px-2.5 py-1 text-[11px] font-medium text-secondary transition-colors hover:border-electric/40 hover:text-navy"
              >
                {preset.name}
              </button>
            ))}
          </div>

          <textarea
            value={writingStyle}
            onChange={(e) => setWritingStyle(e.target.value)}
            rows={4}
            className="mt-3 w-full rounded-lg border border-border-metal bg-sunken/60 p-3 text-xs text-navy outline-none focus:border-electric/50 focus:bg-white"
            placeholder="Define writing tone, formatting rules, and stylistic nuances..."
          />

          <button
            type="button"
            onClick={() => saveMemoryPatch({ writingStyle })}
            disabled={saving || writingStyle === memory?.writingStyle}
            className="mt-3 flex items-center gap-1.5 rounded-lg bg-navy px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-navy/90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save Style Profile
          </button>
        </div>

        {/* Brand Rules Card */}
        <div className="bg-white shadow-sm border border-slate-100 rounded-xl p-5">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-gold" />
            <h2 className="font-heading text-sm font-semibold text-navy">Core Brand Tenets &amp; Rules</h2>
          </div>
          <p className="mt-1 text-xs text-secondary">
            Mandatory guidelines that must be applied across every client proposal and strategy document.
          </p>

          <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
            {memory?.brandRules.map((rule, idx) => (
              <li
                key={idx}
                className="flex items-start justify-between gap-2 rounded-lg border border-border-metal bg-sunken/40 p-2.5 text-xs text-navy"
              >
                <span className="flex-1 leading-relaxed">• {rule}</span>
                <button
                  type="button"
                  onClick={() => handleDeleteRule(idx)}
                  className="rounded p-1 text-muted hover:bg-crimson/10 hover:text-crimson"
                  title="Remove rule"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>

          <form onSubmit={handleAddRule} className="mt-3 flex gap-2">
            <input
              type="text"
              value={newRule}
              onChange={(e) => setNewRule(e.target.value)}
              placeholder="Add new brand tenet (e.g. Always include 90-day ROI projections)..."
              className="flex-1 rounded-lg border border-border-metal bg-sunken/60 px-3 py-1.5 text-xs text-navy outline-none focus:border-electric/50 focus:bg-white"
            />
            <button
              type="submit"
              disabled={!newRule.trim() || saving}
              className="flex items-center gap-1 rounded-lg bg-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy/90 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </form>
        </div>

        {/* Learned Observations (Shadow Memory) */}
        <div className="bg-white shadow-sm border border-slate-100 rounded-xl p-5">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-electric" />
            <h2 className="font-heading text-sm font-semibold text-navy">
              Learned Nuances (&quot;Akinator&quot; Shadow Memory)
            </h2>
          </div>
          <p className="mt-1 text-xs text-secondary">
            Patterns, operator habits, and revision nuances learned over time from your project feedback.
          </p>

          <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
            {memory?.learnedObservations.map((obs, idx) => (
              <li
                key={idx}
                className="flex items-start justify-between gap-2 rounded-lg border border-border-metal bg-sunken/40 p-2.5 text-xs text-navy"
              >
                <span className="flex-1 leading-relaxed">
                  <span className="font-semibold text-electric">⚡ </span>
                  {obs}
                </span>
                <button
                  type="button"
                  onClick={() => handleDeleteObservation(idx)}
                  className="rounded p-1 text-muted hover:bg-crimson/10 hover:text-crimson"
                  title="Remove observation"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>

          <form onSubmit={handleAddObservation} className="mt-3 flex gap-2">
            <input
              type="text"
              value={newObservation}
              onChange={(e) => setNewObservation(e.target.value)}
              placeholder="Record observation (e.g. Prefers Meta Ads over LinkedIn for local pitches)..."
              className="flex-1 rounded-lg border border-border-metal bg-sunken/60 px-3 py-1.5 text-xs text-navy outline-none focus:border-electric/50 focus:bg-white"
            />
            <button
              type="submit"
              disabled={!newObservation.trim() || saving}
              className="flex items-center gap-1 rounded-lg bg-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy/90 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </form>
        </div>

        {/* Explicit Rejections Card */}
        <div className="bg-white shadow-sm border border-slate-100 rounded-xl p-5">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-crimson" />
            <h2 className="font-heading text-sm font-semibold text-navy">Explicit Constraints &amp; Rejections</h2>
          </div>
          <p className="mt-1 text-xs text-secondary">
            Hard constraints and forbidden suggestions that agents must NEVER include in project plans.
          </p>

          <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
            {memory?.explicitRejections.map((rej, idx) => (
              <li
                key={idx}
                className="flex items-start justify-between gap-2 rounded-lg border border-crimson/20 bg-crimson/5 p-2.5 text-xs text-navy"
              >
                <span className="flex-1 leading-relaxed text-crimson font-medium">⛔ {rej}</span>
                <button
                  type="button"
                  onClick={() => handleDeleteRejection(idx)}
                  className="rounded p-1 text-muted hover:bg-crimson/10 hover:text-crimson"
                  title="Remove rejection"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>

          <form onSubmit={handleAddRejection} className="mt-3 flex gap-2">
            <input
              type="text"
              value={newRejection}
              onChange={(e) => setNewRejection(e.target.value)}
              placeholder="Add forbidden rule (e.g. Never propose WordPress for enterprise builds)..."
              className="flex-1 rounded-lg border border-border-metal bg-sunken/60 px-3 py-1.5 text-xs text-navy outline-none focus:border-electric/50 focus:bg-white"
            />
            <button
              type="submit"
              disabled={!newRejection.trim() || saving}
              className="flex items-center gap-1 rounded-lg bg-crimson px-3 py-1.5 text-xs font-semibold text-white hover:bg-crimson/90 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </form>
        </div>
      </div>

      {/* Strategic Preferences Card */}
      <div className="bg-white shadow-sm border border-slate-100 rounded-xl p-5">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-electric" />
          <h2 className="font-heading text-sm font-semibold text-navy">Strategic Operator Preferences</h2>
        </div>
        <p className="mt-1 text-xs text-secondary">
          Default baseline parameters injected into research questions and financial models.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(memory?.preferences || {}).map(([key, val]) => (
            <div key={key} className="flex flex-col justify-between rounded-lg border border-border-metal bg-sunken/40 p-3">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                  {key.replace(/_/g, " ")}
                </span>
                <p className="mt-1 text-xs font-medium text-navy">{val}</p>
              </div>
              <button
                type="button"
                onClick={() => handleDeletePref(key)}
                className="mt-2 self-end text-[11px] text-muted hover:text-crimson"
              >
                Delete
              </button>
            </div>
          ))}
        </div>

        <form onSubmit={handleAddPref} className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr_auto]">
          <input
            type="text"
            value={newPrefKey}
            onChange={(e) => setNewPrefKey(e.target.value)}
            placeholder="Key (e.g. ad_platform)"
            className="rounded-lg border border-border-metal bg-sunken/60 px-3 py-1.5 text-xs text-navy outline-none focus:border-electric/50 focus:bg-white"
          />
          <input
            type="text"
            value={newPrefVal}
            onChange={(e) => setNewPrefVal(e.target.value)}
            placeholder="Value (e.g. Meta Ads & Google Ads combined)"
            className="rounded-lg border border-border-metal bg-sunken/60 px-3 py-1.5 text-xs text-navy outline-none focus:border-electric/50 focus:bg-white"
          />
          <button
            type="submit"
            disabled={!newPrefKey.trim() || !newPrefVal.trim() || saving}
            className="flex items-center justify-center gap-1 rounded-lg bg-navy px-4 py-1.5 text-xs font-semibold text-white hover:bg-navy/90 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> Add Preference
          </button>
        </form>
      </div>
    </div>
  );
}
