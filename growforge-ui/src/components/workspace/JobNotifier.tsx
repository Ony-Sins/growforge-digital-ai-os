"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import type { JobSummary } from "@/lib/jobStore";
import { useAppState } from "@/lib/appState";

interface Toast {
  id: string;
  title: string;
  ok: boolean;
}

/** Watches every project and announces when one finishes — an in-app toast
 *  always, plus a desktop notification when the browser allows it (so you
 *  hear about it even from another tab). Only jobs seen *running* during
 *  this page session trigger it, so reloading never replays old alerts. */
export function JobNotifier() {
  const { openJob } = useAppState();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const running = useRef<Set<string>>(new Set());
  const primed = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch("/api/jobs");
        if (!res.ok || cancelled) return;
        const jobs: JobSummary[] = (await res.json()).jobs ?? [];

        for (const job of jobs) {
          if (job.status === "running") {
            running.current.add(job.id);
          } else if (running.current.has(job.id)) {
            running.current.delete(job.id);
            if (!primed.current) continue;
            const ok = job.status === "done";
            setToasts((prev) => [...prev, { id: job.id, title: job.title, ok }]);
            if (typeof Notification !== "undefined" && Notification.permission === "granted") {
              const n = new Notification(ok ? "Project plan ready" : "Project failed", {
                body: job.title,
                icon: "/logo-mark.png",
                tag: job.id,
              });
              n.onclick = () => {
                window.focus();
                openJob(job.id);
              };
            }
          }
        }
        primed.current = true;
      } catch {
        // next tick retries
      }
    }

    check();
    const t = setInterval(check, 4000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [openJob]);

  const dismiss = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className="glass-card-strong flex items-start gap-3 rounded-2xl p-4 shadow-2xl">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
              t.ok ? "bg-emerald/10 text-emerald" : "bg-crimson/10 text-crimson"
            }`}
          >
            {t.ok ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-navy">{t.ok ? "Project plan ready" : "Project failed"}</p>
            <p className="truncate text-xs text-secondary">{t.title}</p>
            <button
              type="button"
              onClick={() => {
                openJob(t.id);
                dismiss(t.id);
              }}
              className="mt-2 rounded-lg bg-gradient-to-r from-electric to-gold px-3 py-1.5 text-xs font-semibold text-white"
            >
              {t.ok ? "Open plan" : "See what happened"}
            </button>
          </div>
          <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="rounded-lg p-1 text-muted hover:text-navy">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
