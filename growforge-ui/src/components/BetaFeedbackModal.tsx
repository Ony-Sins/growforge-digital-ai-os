"use client";

import { useEffect, useState } from "react";
import { X, MessageSquarePlus, CheckCircle2, AlertCircle } from "lucide-react";

export type FeedbackCategory = "feedback" | "bug" | "feature_request";

interface BetaFeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BetaFeedbackModal({ isOpen, onClose }: BetaFeedbackModalProps) {
  const [category, setCategory] = useState<FeedbackCategory>("feedback");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || busy) return;

    setBusy(true);
    setError(null);

    const safeContext = {
      page: typeof window !== "undefined" ? window.location.pathname + window.location.search : "/",
      viewport: typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : undefined,
    };

    try {
      const res = await fetch("/api/beta/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          message: message.trim(),
          page: safeContext.page,
        }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        setSubmitted(true);
        setMessage("");
      } else {
        setError(data.error || "Failed to submit feedback.");
      }
    } catch (err: any) {
      setError(err?.message || "Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleResetAndClose = () => {
    setSubmitted(false);
    setError(null);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-200 font-sans"
      onClick={handleResetAndClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="beta-feedback-title"
    >
      <div
        className="w-full max-w-lg bg-[#0b1220] border border-slate-700/80 rounded-2xl shadow-2xl p-6 text-slate-200 relative space-y-4 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3.5">
          <div className="flex items-center gap-2">
            <MessageSquarePlus className="h-5 w-5 text-cyan-400" />
            <h2 id="beta-feedback-title" className="text-base font-semibold text-white tracking-tight">
              Beta Tester Feedback
            </h2>
          </div>
          <button
            type="button"
            onClick={handleResetAndClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {submitted ? (
          <div className="py-8 text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-emerald-950/60 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-white">Thank you for your feedback!</h3>
              <p className="text-xs text-slate-400">
                Your report has been securely delivered to the engineering team.
              </p>
            </div>
            <button
              type="button"
              onClick={handleResetAndClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold rounded-lg text-slate-200 transition"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Category Selector */}
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1.5">Category</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setCategory("feedback")}
                  className={`py-2 px-3 text-xs font-medium rounded-lg border transition ${
                    category === "feedback"
                      ? "bg-cyan-950/60 border-cyan-400 text-cyan-300 shadow-sm"
                      : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Feedback
                </button>
                <button
                  type="button"
                  onClick={() => setCategory("bug")}
                  className={`py-2 px-3 text-xs font-medium rounded-lg border transition ${
                    category === "bug"
                      ? "bg-rose-950/50 border-rose-400 text-rose-300 shadow-sm"
                      : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Bug Report
                </button>
                <button
                  type="button"
                  onClick={() => setCategory("feature_request")}
                  className={`py-2 px-3 text-xs font-medium rounded-lg border transition ${
                    category === "feature_request"
                      ? "bg-amber-950/50 border-amber-400 text-amber-300 shadow-sm"
                      : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Feature Request
                </button>
              </div>
            </div>

            {/* Message Area */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="beta-feedback-msg" className="text-xs font-mono text-slate-400">
                  Message
                </label>
                <span className="text-[11px] font-mono text-slate-500">{message.length}/2000</span>
              </div>
              <textarea
                id="beta-feedback-msg"
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 2000))}
                placeholder={
                  category === "bug"
                    ? "Describe what happened, what you expected, and steps to reproduce..."
                    : category === "feature_request"
                    ? "Describe the feature or workflow improvement you'd like to see..."
                    : "Share your thoughts, ergonomics feedback, or observations..."
                }
                rows={4}
                required
                disabled={busy}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 transition resize-none"
              />
            </div>

            {/* Context Note */}
            <div className="text-[11px] font-mono text-slate-500 bg-slate-900/40 p-2.5 rounded-lg border border-slate-800/60 flex items-center justify-between">
              <span>Context: Current Page</span>
              <span className="text-slate-400">
                {typeof window !== "undefined" ? window.location.pathname : "/"}
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleResetAndClose}
                disabled={busy}
                className="px-3.5 py-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !message.trim()}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow transition"
              >
                {busy ? "Sending..." : "Submit Feedback"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
