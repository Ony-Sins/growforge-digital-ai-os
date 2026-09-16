"use client";

import { useEffect, useState } from "react";
import { HelpCircle, Send } from "lucide-react";
import { useAppState } from "@/lib/appState";
import type { PendingConsultation } from "@/lib/consultationStore";

/**
 * Interactive Asynchronous Consultation Banner
 *
 * Displays pending clarification or strategic questions raised by running
 * sub-agents and departments mid-job. Allows the operator to answer via quick-select
 * option pills or custom text input without blocking background processing.
 */
export function ConsultationBanner() {
  const { openJob } = useAppState();
  const [consultations, setConsultations] = useState<PendingConsultation[]>([]);
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorById, setErrorById] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/consultations");
        if (res.ok && !cancelled) {
          const data = await res.json();
          setConsultations(Array.isArray(data.consultations) ? data.consultations : []);
        }
      } catch {
        // Next tick will retry
      }
    }

    poll();
    const interval = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  async function submitAnswer(id: string, text: string) {
    if (!text.trim()) return;
    setBusyId(id);
    setErrorById((prev) => ({ ...prev, [id]: "" }));
    try {
      const res = await fetch(`/api/consultations/${encodeURIComponent(id)}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorById((prev) => ({ ...prev, [id]: data.error ?? "Could not submit your answer." }));
        return;
      }
      setConsultations((prev) => prev.filter((c) => c.id !== id));
      setCustomAnswers((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } finally {
      setBusyId(null);
    }
  }

  if (consultations.length === 0) return null;

  return (
    <div className="fixed left-1/2 top-20 z-50 flex w-full max-w-xl -translate-x-1/2 flex-col gap-3 px-4">
      {consultations.map((c) => (
        <div key={c.id} className="glass-card-strong rounded-2xl p-4 shadow-2xl ring-1 ring-electric/50">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-electric/10 text-electric">
              <HelpCircle className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wider text-electric">
                  Sub-Agent Consultation · {c.stepLabel}
                </p>
                <button
                  type="button"
                  onClick={() => openJob(c.jobId)}
                  className="truncate text-left text-xs text-secondary hover:text-navy underline underline-offset-2"
                >
                  {c.jobTitle}
                </button>
              </div>

              <p className="mt-1.5 text-sm font-medium text-navy leading-relaxed">
                {c.question}
              </p>

              {/* Preset Options if provided */}
              {Array.isArray(c.options) && c.options.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {c.options.map((opt, idx) => (
                    <button
                      key={idx}
                      type="button"
                      disabled={busyId === c.id}
                      onClick={() => submitAnswer(c.id, opt)}
                      className="rounded-lg border border-electric/30 bg-electric/5 px-2.5 py-1 text-xs font-medium text-electric hover:bg-electric hover:text-white transition-colors disabled:opacity-50"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}

              {/* Custom Answer Input */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submitAnswer(c.id, customAnswers[c.id] || "");
                }}
                className="mt-3 flex gap-2"
              >
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={customAnswers[c.id] ?? ""}
                    onChange={(e) =>
                      setCustomAnswers((prev) => ({ ...prev, [c.id]: e.target.value }))
                    }
                    placeholder="Type strategic guidance or answer..."
                    disabled={busyId === c.id}
                    className="w-full rounded-lg border border-border-metal bg-white/90 px-3 py-1.5 text-xs text-navy placeholder:text-muted focus:border-electric focus:outline-none disabled:opacity-50"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busyId === c.id || !(customAnswers[c.id] ?? "").trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-electric px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-electric/90 disabled:opacity-50 transition-opacity"
                >
                  <Send className="h-3.5 w-3.5" /> Submit
                </button>
              </form>

              {errorById[c.id] && <p className="mt-1.5 text-xs text-crimson">{errorById[c.id]}</p>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
