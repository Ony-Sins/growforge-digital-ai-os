"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  CircleArrowRight,
  Clock,
  Code2,
  CornerDownRight,
  HelpCircle,
  Loader2,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useAppState } from "@/lib/appState";
import type { PendingConsultation } from "@/lib/consultationStore";

/**
 * HITLDrawer — Human-in-the-Loop slide-over drawer
 *
 * The single surface for pending sub-agent consultations (a simpler
 * floating-banner duplicate, ConsultationBanner, was removed 2026-09-17 —
 * this drawer already covered everything it did and more). Exposes:
 *   - Agent identity & step context
 *   - The full question + reasoning context
 *   - Preset answer option pills
 *   - An optional editable JSON payload panel (if the agent surfaces args)
 *   - Three operator actions:
 *       ✅ Approve — sends the answer/payload back to resume execution
 *       ✏️  Edit & Resume — lets the operator mutate the payload JSON then approve
 *       🔀 Redirect — posts a redirect directive telling the agent to change course
 *
 * Mounts as a fixed right-side slide-over. Shows a notification dot on the
 * collapsed trigger button whenever new pending consultations arrive.
 */

type ActionMode = "approve" | "redirect" | null;

interface ConsultationCardProps {
  c: PendingConsultation;
  onDismiss: (id: string) => void;
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function ConsultationCard({ c, onDismiss }: ConsultationCardProps) {
  const { openJob } = useAppState();
  const [mode, setMode] = useState<ActionMode>(null);
  const [customAnswer, setCustomAnswer] = useState("");
  const [redirectText, setRedirectText] = useState("");
  const [payloadText, setPayloadText] = useState(
    c.payload ? JSON.stringify(c.payload, null, 2) : "",
  );
  const [payloadOpen, setPayloadOpen] = useState(false);
  const [payloadError, setPayloadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus the text area when a mode panel opens
  useEffect(() => {
    if (mode && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 80);
    }
  }, [mode]);

  async function submitApprove(answer: string) {
    if (!answer.trim()) return;

    // Validate edited payload JSON if payload panel is open
    if (payloadOpen && payloadText.trim()) {
      try {
        JSON.parse(payloadText);
      } catch {
        setPayloadError("Invalid JSON — fix the payload before approving.");
        return;
      }
    }
    setPayloadError("");
    setBusy(true);
    setError("");
    try {
      const body: Record<string, unknown> = { answer: answer.trim() };
      if (payloadOpen && payloadText.trim()) {
        try {
          body.editedPayload = JSON.parse(payloadText);
        } catch {
          // already validated above
        }
      }
      const res = await fetch(`/api/consultations/${encodeURIComponent(c.id)}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not submit your answer.");
        return;
      }
      onDismiss(c.id);
    } finally {
      setBusy(false);
    }
  }

  async function submitRedirect() {
    if (!redirectText.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/consultations/${encodeURIComponent(c.id)}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ redirectDirective: redirectText.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not submit the redirect.");
        return;
      }
      onDismiss(c.id);
    } finally {
      setBusy(false);
    }
  }

  const deptIcon =
    c.departmentId?.toLowerCase().includes("ai") ||
    c.departmentId?.toLowerCase().includes("auto")
      ? Bot
      : c.departmentId?.toLowerCase().includes("dev") ||
          c.departmentId?.toLowerCase().includes("code")
        ? Code2
        : c.departmentId?.toLowerCase().includes("qa")
          ? ShieldCheck
          : c.departmentId?.toLowerCase().includes("marketing") ||
              c.departmentId?.toLowerCase().includes("meta")
            ? Sparkles
            : HelpCircle;
  const DeptIcon = deptIcon;

  return (
    <div className="glass-card-strong rounded-2xl overflow-hidden ring-1 ring-electric/30 shadow-xl">
      {/* ── Header ── */}
      <div className="flex items-start gap-3 px-4 pt-4 pb-3 border-b border-border-metal">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-electric/10 text-electric">
          <DeptIcon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-electric">
              Sub-Agent · Awaiting Operator Input
            </p>
            <span className="flex items-center gap-1 text-[10px] text-muted">
              <Clock className="h-3 w-3" />
              {timeAgo(c.createdAt)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => openJob(c.jobId)}
            className="mt-0.5 block truncate text-left text-xs font-medium text-navy hover:text-electric underline underline-offset-2"
          >
            {c.jobTitle}
          </button>
          <p className="text-[10px] text-muted mt-0.5">
            {c.stepLabel}
            {c.departmentId ? ` · ${c.departmentId}` : ""}
          </p>
        </div>
      </div>

      {/* ── Question ── */}
      <div className="px-4 py-3">
        <p className="text-sm font-medium text-navy leading-relaxed">{c.question}</p>
      </div>

      {/* ── Preset Options ── */}
      {Array.isArray(c.options) && c.options.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          {c.options.map((opt, idx) => (
            <button
              key={idx}
              type="button"
              disabled={busy}
              onClick={() => submitApprove(opt)}
              className="rounded-lg border border-electric/30 bg-electric/5 px-2.5 py-1 text-xs font-medium text-electric hover:bg-electric hover:text-white transition-colors disabled:opacity-50"
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      {/* ── Payload Inspector (collapsible) ── */}
      {c.payload && (
        <div className="px-4 pb-2">
          <button
            type="button"
            onClick={() => setPayloadOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-lg bg-sunken px-3 py-1.5 text-xs font-medium text-secondary hover:text-navy transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <Code2 className="h-3 w-3" />
              Payload / Parameters
            </span>
            {payloadOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {payloadOpen && (
            <div className="mt-1.5">
              <textarea
                value={payloadText}
                onChange={(e) => {
                  setPayloadText(e.target.value);
                  setPayloadError("");
                }}
                rows={Math.min(8, (payloadText.split("\n").length || 1) + 1)}
                className="w-full rounded-lg border border-border-metal bg-code px-3 py-2 font-mono text-[11px] text-on-navy resize-y focus:border-electric focus:outline-none"
                spellCheck={false}
              />
              {payloadError && (
                <p className="mt-1 text-[10px] text-crimson flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {payloadError}
                </p>
              )}
              <p className="mt-1 text-[10px] text-muted">
                Edit the JSON above — your changes will be sent with the approval.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Action Panel ── */}
      <div className="px-4 pb-4 pt-1">
        {/* Mode toggle buttons */}
        {!mode && (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setMode("approve")}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-electric to-electric/80 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              <Check className="h-3.5 w-3.5" />
              Approve / Answer
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setMode("redirect")}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-border-metal bg-white/80 px-3 py-2 text-xs font-medium text-secondary hover:text-crimson hover:border-crimson/40 disabled:opacity-50 transition-colors"
            >
              <CircleArrowRight className="h-3.5 w-3.5" />
              Redirect
            </button>
          </div>
        )}

        {/* Approve panel */}
        {mode === "approve" && (
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-electric">
              Type your answer or strategic guidance
            </p>
            <textarea
              ref={textareaRef}
              value={customAnswer}
              onChange={(e) => setCustomAnswer(e.target.value)}
              rows={3}
              placeholder="e.g. Yes, prioritise Meta Ads with a £500 test budget…"
              disabled={busy}
              className="w-full rounded-lg border border-border-metal bg-white/90 px-3 py-2 text-xs text-navy placeholder:text-muted resize-none focus:border-electric focus:outline-none disabled:opacity-50"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy || !customAnswer.trim()}
                onClick={() => submitApprove(customAnswer)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-electric to-electric/80 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 transition-opacity"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Send Answer
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setMode(null)}
                className="rounded-lg border border-border-metal bg-white/80 px-3 py-1.5 text-xs text-secondary hover:text-navy disabled:opacity-50"
              >
                Back
              </button>
            </div>
          </div>
        )}

        {/* Redirect panel */}
        {mode === "redirect" && (
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-crimson">
              Redirect directive — agent will change course
            </p>
            <textarea
              ref={textareaRef}
              value={redirectText}
              onChange={(e) => setRedirectText(e.target.value)}
              rows={3}
              placeholder="e.g. Skip HubSpot sync — write to Google Sheets instead…"
              disabled={busy}
              className="w-full rounded-lg border border-crimson/30 bg-white/90 px-3 py-2 text-xs text-navy placeholder:text-muted resize-none focus:border-crimson focus:outline-none disabled:opacity-50"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy || !redirectText.trim()}
                onClick={submitRedirect}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-crimson px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 transition-opacity"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CornerDownRight className="h-3.5 w-3.5" />}
                Send Redirect
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setMode(null)}
                className="rounded-lg border border-border-metal bg-white/80 px-3 py-1.5 text-xs text-secondary hover:text-navy disabled:opacity-50"
              >
                Back
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="mt-2 flex items-center gap-1 text-xs text-crimson">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Drawer
// ---------------------------------------------------------------------------

export function HITLDrawer() {
  const { chatViewMode } = useAppState();
  const [consultations, setConsultations] = useState<PendingConsultation[]>([]);
  const [open, setOpen] = useState(false);
  const prevCountRef = useRef(0);

  // Poll for pending consultations
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/consultations");
        if (res.ok && !cancelled) {
          const data = await res.json();
          const list: PendingConsultation[] = Array.isArray(data.consultations)
            ? data.consultations
            : [];
          setConsultations(list);
          // Auto-open drawer when a new consultation arrives
          if (list.length > prevCountRef.current && list.length > 0) {
            setOpen(true);
          }
          prevCountRef.current = list.length;
        }
      } catch {
        // network hiccup — next tick retries
      }
    }

    poll();
    const interval = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  function dismiss(id: string) {
    setConsultations((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (next.length === 0) setOpen(false);
      return next;
    });
  }

  const pendingCount = consultations.length;

  return (
    <>
      {/* ── Floating trigger button ── */}
      <button
        type="button"
        aria-label={`HITL: ${pendingCount} pending operator input${pendingCount !== 1 ? "s" : ""}`}
        onClick={() => setOpen((v) => !v)}
        className={[
          "fixed z-50 flex h-12 w-12 items-center justify-center rounded-2xl shadow-xl transition-all duration-300",
          // The docked AI Assistant panel is a full-width 45vh bottom sheet
          // below lg, and a fixed right column at lg+ — a plain bottom-6
          // right-6 sits directly underneath either one. Shift out of its
          // way instead of floating on top of the chat input.
          chatViewMode === "docked" ? "bottom-[calc(45vh+1rem)] right-6 lg:bottom-6 lg:right-[25rem]" : "bottom-6 right-6",
          pendingCount > 0
            ? "bg-gradient-to-br from-electric to-gold glow-electric animate-pulse"
            : "bg-navy/90 hover:bg-navy",
        ].join(" ")}
      >
        <HelpCircle className="h-5 w-5 text-white" />
        {pendingCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-crimson text-[10px] font-bold text-white shadow">
            {pendingCount}
          </span>
        )}
      </button>

      {/* ── Backdrop ── */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-navy/10 backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ── Slide-over panel ── */}
      <div
        id="hitl-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Human-in-the-Loop operator input drawer"
        className={[
          "fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col bg-app/95 shadow-2xl transition-transform duration-300 ease-out",
          "border-l border-border-metal-strong",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-metal px-5 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-electric">
              Human-in-the-Loop
            </p>
            <h2 className="text-base font-semibold text-navy">
              Operator Input
              {pendingCount > 0 && (
                <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-electric px-1.5 text-[10px] font-bold text-white">
                  {pendingCount}
                </span>
              )}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close HITL drawer"
            onClick={() => setOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border-metal bg-white/80 text-secondary hover:text-navy transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {pendingCount === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 pt-16 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald/10 text-emerald">
                <Check className="h-7 w-7" />
              </span>
              <p className="text-sm font-semibold text-navy">All clear</p>
              <p className="text-xs text-muted max-w-[200px]">
                No agents are waiting for operator input right now.
              </p>
            </div>
          ) : (
            consultations.map((c) => (
              <ConsultationCard key={c.id} c={c} onDismiss={dismiss} />
            ))
          )}
        </div>

        {/* Footer legend */}
        <div className="border-t border-border-metal px-5 py-3">
          <div className="flex items-center gap-4 text-[10px] text-muted">
            <span className="flex items-center gap-1">
              <Check className="h-3 w-3 text-electric" /> Approve resumes execution
            </span>
            <span className="flex items-center gap-1">
              <CircleArrowRight className="h-3 w-3 text-crimson" /> Redirect pivots the agent
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
