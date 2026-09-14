"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  CircleCheck,
  Info,
  RefreshCw,
  ScrollText,
  Trash2,
} from "lucide-react";
import { agents } from "@/lib/agents";
import type { LogEntry, LogLevel } from "@/lib/types";
import { useAppState } from "@/lib/appState";
import { isAgentLocked } from "@/lib/security";
import { Lock } from "lucide-react";

const POLL_INTERVAL_MS = 3000;
const LIMIT_OPTIONS = [25, 50, 100, 200] as const;

type SeverityFilter = "all" | LogLevel;

const FILTERS: { id: SeverityFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "info", label: "Info" },
  { id: "success", label: "Success" },
  { id: "error", label: "Error" },
];

const LEVEL_STYLES: Record<LogLevel, { text: string; ring: string; dot: string; Icon: typeof Info }> = {
  info: { text: "text-electric", ring: "ring-electric/25", dot: "bg-electric", Icon: Info },
  success: { text: "text-emerald", ring: "ring-emerald/25", dot: "bg-emerald", Icon: CircleCheck },
  error: { text: "text-crimson", ring: "ring-crimson/25", dot: "bg-crimson", Icon: CircleAlert },
};

const agentNameById = new Map(agents.map((a) => [a.id, a.name]));

function agentBadgeLabel(agentId: string | null) {
  if (!agentId) return "system";
  return agentNameById.get(agentId) ?? agentId;
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function LogViewer() {
  const { canAccessAgent } = useAppState();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<SeverityFilter>("all");
  const [limit, setLimit] = useState<(typeof LIMIT_OPTIONS)[number]>(50);
  const [collapsed, setCollapsed] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clearedBeforeId, setClearedBeforeId] = useState(0);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasNewSinceScroll, setHasNewSinceScroll] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastLogIdRef = useRef(0);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch(`/api/logs?limit=${limit}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`request failed (${res.status})`);
      const data: { logs: LogEntry[] } = await res.json();
      setLogs(data.logs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to fetch logs");
    } finally {
      setLoading(false);
    }
  }, [limit]);

  // Initial load + poll every 3s while auto-refresh is on and the panel is open.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount/poll
    fetchLogs();
    if (!autoRefresh || collapsed) return;
    const id = setInterval(fetchLogs, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchLogs, autoRefresh, collapsed]);

  // Chronological (oldest → newest) for a terminal / tail -f feel.
  const chronological = [...logs].reverse().filter((l) => l.id > clearedBeforeId);
  const visible = filter === "all" ? chronological : chronological.filter((l) => l.level === filter);

  // Auto-scroll to the newest entry, but only if the user was already at the
  // bottom — never yank focus away from someone reading older entries.
  useEffect(() => {
    const newest = visible.at(-1)?.id ?? 0;
    const hasNew = newest > lastLogIdRef.current;
    lastLogIdRef.current = newest;

    if (!hasNew) return;
    if (isAtBottom) {
      // Scroll only this container, not scrollIntoView() on the sentinel —
      // that would also scroll ancestor containers (e.g. the outer page)
      // whenever this panel is off-screen when new logs arrive.
      const el = scrollRef.current;
      el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- derived "new logs arrived" indicator
      setHasNewSinceScroll(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible.length]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    setIsAtBottom(atBottom);
    if (atBottom) setHasNewSinceScroll(false);
  }

  function jumpToLatest() {
    const el = scrollRef.current;
    el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setIsAtBottom(true);
    setHasNewSinceScroll(false);
  }

  function handleClear() {
    const newest = logs[0]?.id ?? 0; // logs[] is newest-first from the API
    setClearedBeforeId(newest);
  }

  const counts = {
    all: chronological.length,
    info: chronological.filter((l) => l.level === "info").length,
    success: chronological.filter((l) => l.level === "success").length,
    error: chronological.filter((l) => l.level === "error").length,
  };

  return (
    <section className="flex flex-col overflow-hidden rounded-xl border border-border-metal-strong bg-code shadow-lg">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <ScrollText className="h-4 w-4 text-white/50" />
        <span className="font-heading text-sm font-semibold text-white">Execution Logs</span>
        <span
          className={`ml-1 flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] ${
            autoRefresh && !collapsed
              ? "bg-emerald/15 text-emerald"
              : "bg-white/10 text-white/40"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${autoRefresh && !collapsed ? "bg-emerald animate-pulse" : "bg-white/40"}`}
          />
          {autoRefresh && !collapsed ? "live" : "paused"}
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          <select
            name="log-limit"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value) as (typeof LIMIT_OPTIONS)[number])}
            className="rounded-md border border-white/10 bg-white/5 px-1.5 py-1 font-mono text-[10px] text-white/70 outline-none"
            aria-label="Log limit"
          >
            {LIMIT_OPTIONS.map((n) => (
              <option key={n} value={n} className="bg-navy text-white">
                {n} lines
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setAutoRefresh((v) => !v)}
            title={autoRefresh ? "Pause auto-refresh" : "Resume auto-refresh"}
            className={`rounded-md border border-white/10 p-1.5 transition-colors ${
              autoRefresh ? "bg-white/10 text-white/80" : "text-white/40 hover:text-white/70"
            }`}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={handleClear}
            title="Clear view"
            className="rounded-md border border-white/10 p-1.5 text-white/40 transition-colors hover:text-crimson"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? "Expand" : "Collapse"}
            className="rounded-md border border-white/10 p-1.5 text-white/40 transition-colors hover:text-white/80"
          >
            {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Severity filters */}
          <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-2">
            {FILTERS.map((f) => {
              const active = filter === f.id;
              const style = f.id !== "all" ? LEVEL_STYLES[f.id] : null;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={`flex items-center gap-1 rounded-full border px-2.5 py-1 font-mono text-[10px] transition-colors ${
                    active
                      ? "border-white/20 bg-white/10 text-white"
                      : "border-transparent text-white/40 hover:text-white/70"
                  }`}
                >
                  {style && <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />}
                  {f.label}
                  <span className="text-white/30">{counts[f.id]}</span>
                </button>
              );
            })}
            {error && (
              <span className="ml-auto flex items-center gap-1 font-mono text-[10px] text-crimson">
                <CircleAlert className="h-3 w-3" /> {error}
              </span>
            )}
          </div>

          {/* Log list */}
          <div className="relative flex-1">
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="h-full max-h-80 space-y-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed xl:max-h-[26rem]"
            >
              {loading && logs.length === 0 && (
                <p className="text-white/30">Loading logs…</p>
              )}
              {!loading && visible.length === 0 && (
                <p className="text-white/30">No log entries{filter !== "all" ? ` at level "${filter}"` : ""}.</p>
              )}
              {visible.map((log) => {
                const style = LEVEL_STYLES[log.level];
                const restricted = log.agentId ? isAgentLocked(log.agentId) && !canAccessAgent(log.agentId) : false;
                return (
                  <div key={log.id} className="flex items-start gap-2">
                    <span className="shrink-0 text-white/30">{formatTime(log.timestamp)}</span>
                    <span
                      className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ${style.text} ${style.ring} bg-white/5`}
                    >
                      {agentBadgeLabel(log.agentId)}
                    </span>
                    {restricted ? (
                      <span className="flex min-w-0 flex-1 items-center gap-1.5 break-words text-white/30">
                        <Lock className="h-3 w-3 shrink-0" /> Restricted — unlock this agent to view
                      </span>
                    ) : (
                      <span className={`min-w-0 flex-1 break-words ${style.text}`}>{log.message}</span>
                    )}
                  </div>
                );
              })}
            </div>

            {hasNewSinceScroll && (
              <button
                type="button"
                onClick={jumpToLatest}
                className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-electric px-3 py-1.5 font-mono text-[10px] font-medium text-white shadow-lg transition-transform hover:scale-105"
              >
                <ArrowDown className="h-3 w-3" /> New logs
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
