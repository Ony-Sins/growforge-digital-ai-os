"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronRight,
  Copy,
  Loader2,
  Play,
  SquareTerminal,
  Trash2,
} from "lucide-react";
import { agents } from "@/lib/agents";
import type { LogEntry } from "@/lib/types";
import { useAppState } from "@/lib/appState";
import { isAgentLocked } from "@/lib/security";

type LineKind = "command" | "info" | "success" | "error" | "json" | "system";

interface TerminalLine {
  id: number;
  timestamp: string;
  kind: LineKind;
  text: string;
}

const LINE_TEXT_CLASS: Record<Exclude<LineKind, "json">, string> = {
  command: "text-gold",
  info: "text-electric-soft",
  success: "text-emerald",
  error: "text-crimson",
  system: "text-white/40",
};

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

function escapeHtml(raw: string) {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Minimal JSON syntax highlighter: escapes first, then wraps tokens in
 *  brand-colored spans. Safe against injection since only our own <span>
 *  markup is added around already-escaped text. */
function highlightJson(json: string): string {
  const escaped = escapeHtml(json);
  return escaped.replace(
    /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?)|\b(?:true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
    (match) => {
      if (match.startsWith('"')) {
        const isKey = /:\s*$/.test(match);
        return `<span class="${isKey ? "text-electric-soft" : "text-emerald"}">${match}</span>`;
      }
      if (match === "true" || match === "false") {
        return `<span class="text-gold">${match}</span>`;
      }
      if (match === "null") {
        return `<span class="text-crimson">${match}</span>`;
      }
      return `<span class="text-white/70">${match}</span>`;
    },
  );
}

function parsePayload(raw: string): { value: unknown; isJson: boolean; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: {}, isJson: true };
  try {
    return { value: JSON.parse(trimmed), isJson: true };
  } catch (err) {
    return {
      value: { text: trimmed },
      isJson: false,
      error: err instanceof Error ? err.message : "invalid JSON",
    };
  }
}

let nextLineId = 1;

export function TerminalConsole() {
  const { activeView, canAccessAgent, requestAgentUnlock, role, unlockedAgentIds } = useAppState();
  const [selectedAgentId, setSelectedAgentId] = useState(agents[0]?.id ?? "");
  const [payloadText, setPayloadText] = useState("");
  const [commandText, setCommandText] = useState("");
  // Starts empty so SSR and hydrated client markup match exactly; the
  // ready-state line (which needs a real Date()) is added after mount in an
  // effect below — computing new Date() at initial-state time would differ
  // between the server render and client hydration and trigger a mismatch.
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [dispatching, setDispatching] = useState(false);
  const [copied, setCopied] = useState(false);

  const commandInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time ready-state line seeded after mount to avoid an SSR/hydration Date() mismatch
    setLines([
      {
        id: nextLineId++,
        timestamp: new Date().toISOString(),
        kind: "system",
        text: "GrowForge command terminal ready. Select an agent, edit the payload, and dispatch.",
      },
    ]);
  }, []);

  // Focus the command bar when the user navigates here via the sidebar.
  useEffect(() => {
    if (activeView === "terminal") {
      commandInputRef.current?.focus();
    }
  }, [activeView]);

  useEffect(() => {
    // Scroll only this container, not scrollIntoView() on a sentinel — that
    // would also scroll ancestor containers (e.g. the outer page) whenever
    // this panel is off-screen when a new line is appended.
    const el = streamRef.current;
    el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [lines.length]);

  function pushLine(kind: LineKind, text: string) {
    setLines((prev) => [...prev, { id: nextLineId++, timestamp: new Date().toISOString(), kind, text }]);
  }

  async function handleDispatch(e?: React.FormEvent) {
    e?.preventDefault();
    if (dispatching || !selectedAgentId) return;

    if (isAgentLocked(selectedAgentId) && !canAccessAgent(selectedAgentId)) {
      pushLine("error", `Agent ${selectedAgentId} is locked. Enter its security key to run it.`);
      requestAgentUnlock(selectedAgentId);
      return;
    }

    const parsed = parsePayload(payloadText);
    const trimmedCommand = commandText.trim();
    pushLine(
      "command",
      `$ growforge run ${selectedAgentId}${trimmedCommand ? ` ${trimmedCommand}` : ""}${
        !parsed.isJson && payloadText.trim() ? " --payload (text)" : ""
      }`,
    );

    setDispatching(true);
    try {
      const isPlainObject = typeof parsed.value === "object" && parsed.value !== null && !Array.isArray(parsed.value);
      const vaultRes = await fetch(`/api/vault/${encodeURIComponent(selectedAgentId)}`);
      const usingCustomKeys: string[] = vaultRes.ok ? ((await vaultRes.json()).providers ?? []) : [];
      const accessFields = { role, unlockedAgentIds, usingCustomKeys };
      const requestBody = isPlainObject
        ? { ...(parsed.value as Record<string, unknown>), ...accessFields }
        : { payload: parsed.value, ...accessFields };

      const res = await fetch(`/api/agents/${encodeURIComponent(selectedAgentId)}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `request failed (${res.status})`);

      if (data.status === "hand-off") {
        pushLine(
          "info",
          `Hand-off suggested: ${data.targetAgentName} (${data.targetAgentId}) · ${data.reason}`,
        );
        pushLine(
          "system",
          `Agent switched to ${data.targetAgentName} below. Press Run to dispatch there, or switch back to run ${selectedAgentId} anyway.`,
        );
        setSelectedAgentId(data.targetAgentId);
        return;
      }

      pushLine("success", data.log?.message ?? "dispatched");
      pushLine("json", JSON.stringify(data, null, 2));
      setCommandText("");

      const dispatchedLogId: number | undefined = data.log?.id;
      const agentId = selectedAgentId;
      setTimeout(async () => {
        try {
          const logsRes = await fetch(
            `/api/logs?agentId=${encodeURIComponent(agentId)}&limit=1`,
          );
          if (!logsRes.ok) return;
          const logsData: { logs: LogEntry[] } = await logsRes.json();
          const latest = logsData.logs[0];
          if (latest && latest.id !== dispatchedLogId) {
            pushLine(latest.level === "error" ? "error" : latest.level, latest.message);
          }
        } catch {
          // best-effort resolution follow-up only
        }
      }, 1800);
    } catch (err) {
      pushLine("error", err instanceof Error ? err.message : "dispatch failed");
    } finally {
      setDispatching(false);
    }
  }

  function handleClear() {
    setLines([]);
  }

  async function handleCopy() {
    const text = lines.map((l) => `[${formatTime(l.timestamp)}] ${l.text}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard permissions may be unavailable — nothing else to do
    }
  }

  const payloadPreview = parsePayload(payloadText);
  const payloadBadge = !payloadText.trim()
    ? { label: "empty", cls: "text-muted bg-sunken" }
    : payloadPreview.isJson
      ? { label: "valid JSON", cls: "text-emerald bg-emerald/10" }
      : { label: "sent as text", cls: "text-gold bg-gold/10" };

  return (
    <section className="glass-card rounded-2xl p-4 md:p-6">
      <div className="mb-4 flex items-center gap-2">
        <SquareTerminal className="h-4 w-4 text-electric" />
        <div>
          <h2 className="font-heading text-base font-semibold text-navy">Command Terminal</h2>
          <p className="text-xs text-secondary">
            Dispatch an agent directly with a custom payload and watch the stream.
          </p>
        </div>
      </div>

      {/* Dispatch controls */}
      <form onSubmit={handleDispatch} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Agent</span>
            <select
              name="terminal-agent"
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="w-full rounded-lg border border-border-metal bg-white/80 px-3 py-2 text-sm text-navy outline-none focus:border-electric/50"
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {isAgentLocked(a.id) && !canAccessAgent(a.id) ? "[Locked] " : ""}
                  {a.name} · {a.status}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 flex items-center justify-between text-xs font-medium text-muted">
              Payload
              <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${payloadBadge.cls}`}>
                {payloadBadge.label}
              </span>
            </span>
            <textarea
              name="terminal-payload"
              value={payloadText}
              onChange={(e) => setPayloadText(e.target.value)}
              placeholder='{"note": "manual dispatch"}'
              rows={1}
              className="w-full resize-y rounded-lg border border-border-metal bg-white/80 px-3 py-2 font-mono text-xs text-navy outline-none focus:border-electric/50"
            />
          </label>
        </div>

        {/* Shell-style command bar */}
        <div className="flex items-center gap-2 rounded-lg border border-border-metal-strong bg-app px-3 py-2">
          <ChevronRight className="h-4 w-4 shrink-0 text-electric" />
          <input
            ref={commandInputRef}
            name="terminal-command"
            value={commandText}
            onChange={(e) => setCommandText(e.target.value)}
            placeholder={`run ${selectedAgentId} …`}
            className="flex-1 bg-transparent font-mono text-sm text-white outline-none placeholder:text-white/30"
          />
          <button
            type="submit"
            disabled={dispatching}
            className="flex shrink-0 items-center gap-1.5 rounded-md bg-gradient-to-r from-electric to-gold px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
          >
            {dispatching ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Running
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" /> Run
              </>
            )}
          </button>
        </div>
      </form>

      {/* Stdout stream */}
      <div
        className={`mt-4 flex flex-col overflow-hidden rounded-xl border bg-code shadow-lg transition-shadow ${
          dispatching ? "border-electric/60 glow-electric" : "border-border-metal-strong"
        }`}
      >
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-crimson/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-gold/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald/70" />
          <span className="ml-2 font-mono text-xs text-white/50">stdout</span>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleCopy}
              title="Copy stream"
              className="rounded-md border border-white/10 p-1.5 text-white/40 transition-colors hover:text-white/80"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={handleClear}
              title="Clear stream"
              className="rounded-md border border-white/10 p-1.5 text-white/40 transition-colors hover:text-crimson"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div
          ref={streamRef}
          className="max-h-80 space-y-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed xl:max-h-96"
        >
          {lines.length === 0 && <p className="text-white/30">Stream cleared. Dispatch a command to continue.</p>}
          {lines.map((line) =>
            line.kind === "json" ? (
              <pre
                key={line.id}
                className="whitespace-pre-wrap break-words text-white/70"
                dangerouslySetInnerHTML={{ __html: highlightJson(line.text) }}
              />
            ) : (
              <div key={line.id} className="flex items-start gap-2">
                <span className="shrink-0 text-white/30">{formatTime(line.timestamp)}</span>
                <span className={`min-w-0 flex-1 whitespace-pre-wrap break-words ${LINE_TEXT_CLASS[line.kind]}`}>
                  {line.text}
                </span>
              </div>
            ),
          )}
        </div>
      </div>
    </section>
  );
}
