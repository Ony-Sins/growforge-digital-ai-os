"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertTriangle,
  ArrowRightLeft,
  Bot,
  Code2,
  FlaskConical,
  Loader2,
  Lock,
  MessageSquare,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  type LucideIcon,
} from "lucide-react";
import { agents, type AgentStatus } from "@/lib/agents";
import { StatusDot, statusLabel, statusTextClass } from "@/components/ui/StatusDot";
import type { LlmStrategy } from "@/lib/llm";
import { useAppState } from "@/lib/appState";
import type { HandoffSuggestion } from "@/lib/handoff";

interface RouterStatus {
  strategy: LlmStrategy;
  providerOrder: string[];
  availableKeys: { gemini: boolean; groq: boolean };
}

const STRATEGY_LABEL: Record<LlmStrategy, string> = {
  auto: "Auto (local → cloud)",
  local: "Local only",
  cloud: "Cloud only",
};

const ICONS: Record<string, LucideIcon> = {
  Bot,
  Code2,
  Sparkles,
  ShieldCheck,
  Send,
  Target,
  FlaskConical,
};

interface DispatchInfo {
  agentId: string;
  agentName: string;
  status: AgentStatus;
  lastRun: string;
  logMessage: string | null;
}

type ChatHandoff = HandoffSuggestion & { params: Record<string, unknown> };

interface ChatMessageUI {
  id: number;
  role: "user" | "assistant" | "error";
  content: string;
  timestamp: string;
  provider?: string;
  dispatch?: DispatchInfo | null;
  dispatchError?: string;
  locked?: { agentId: string; agentName: string } | null;
  handoff?: ChatHandoff | null;
  handoffResolved?: boolean;
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

let nextId = 1;

function ExecutionCard({ dispatch }: { dispatch: DispatchInfo }) {
  const agent = agents.find((a) => a.id === dispatch.agentId);
  const Icon = agent ? (ICONS[agent.icon] ?? Bot) : Bot;
  return (
    <div className="mt-2 flex items-center gap-3 rounded-xl border border-border-metal bg-white/70 px-3 py-2.5">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${agent?.hub ? "bg-navy" : "bg-sunken"}`}>
        <Icon className={`h-4 w-4 ${agent?.hub ? "text-gold" : "text-electric"}`} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-navy">{dispatch.agentName}</p>
          <StatusDot status={dispatch.status} pulse={dispatch.status === "active"} />
          <span className={`text-xs font-medium ${statusTextClass(dispatch.status)}`}>
            {statusLabel(dispatch.status)}
          </span>
        </div>
        {dispatch.logMessage && (
          <p className="mt-0.5 truncate font-mono text-[11px] text-muted">{dispatch.logMessage}</p>
        )}
      </div>
      <span className="shrink-0 font-mono text-[11px] text-muted">{dispatch.lastRun}</span>
    </div>
  );
}

function Markdown({ content }: { content: string }) {
  return (
    <div className="text-sm leading-relaxed text-navy">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: (props) => (
            <a {...props} target="_blank" rel="noreferrer" className="text-electric underline underline-offset-2" />
          ),
          code: ({ className, children, ...props }) => {
            const isBlock = /language-/.test(className ?? "");
            return isBlock ? (
              <code className="block overflow-x-auto rounded-lg bg-navy px-3 py-2 font-mono text-xs text-white/90" {...props}>
                {children}
              </code>
            ) : (
              <code className="rounded bg-sunken px-1 py-0.5 font-mono text-[0.85em] text-navy" {...props}>
                {children}
              </code>
            );
          },
          ul: (props) => <ul className="list-disc space-y-1 pl-5" {...props} />,
          ol: (props) => <ol className="list-decimal space-y-1 pl-5" {...props} />,
          p: (props) => <p className="mb-2 last:mb-0" {...props} />,
          strong: (props) => <strong className="font-semibold text-navy" {...props} />,
          h1: (props) => <h3 className="mb-1 font-heading text-base font-semibold text-navy" {...props} />,
          h2: (props) => <h3 className="mb-1 font-heading text-base font-semibold text-navy" {...props} />,
          h3: (props) => <h3 className="mb-1 font-heading text-sm font-semibold text-navy" {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

const WELCOME_CONTENT =
  "Hi, I'm the GrowForge AI Assistant. Tell me what you need in plain English — or any language — and I'll route it to the right agent. For example: *\"Draft an outbound sequence for mid-market SaaS buyers\"* or *\"¿Puedes revisar la interfaz antes de lanzarla?\"*";

export function ChatView() {
  const { role, unlockedAgentIds, requestAgentUnlock } = useAppState();

  // Starts empty so the server-rendered and hydrated client markup match
  // exactly; the welcome message (which needs a real Date()) is added in an
  // effect below, after mount — computing new Date() at module/render scope
  // would produce a different value during SSR vs. client hydration and
  // trigger a hydration mismatch.
  const [messages, setMessages] = useState<ChatMessageUI[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [strategy, setStrategyState] = useState<LlmStrategy | null>(null);
  const [providerOrderList, setProviderOrderList] = useState<string[]>([]);
  const [switching, setSwitching] = useState(false);
  const [pendingHandoff, setPendingHandoff] = useState<{ handoff: ChatHandoff; messageId: number } | null>(null);
  const [handoffBusy, setHandoffBusy] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setMessages([
      { id: nextId++, role: "assistant", content: WELCOME_CONTENT, timestamp: new Date().toISOString() },
    ]);
  }, []);

  useEffect(() => {
    fetch("/api/router")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: RouterStatus | null) => {
        if (data) {
          setStrategyState(data.strategy);
          setProviderOrderList(data.providerOrder);
        }
      })
      .catch(() => {
        // strategy badge is a nice-to-have; ignore failures
      });
  }, []);

  async function handleStrategyChange(next: LlmStrategy) {
    setSwitching(true);
    try {
      const res = await fetch("/api/router", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy: next }),
      });
      const data: RouterStatus | { error: string } = await res.json();
      if (res.ok && "strategy" in data) {
        setStrategyState(data.strategy);
        setProviderOrderList(data.providerOrder);
      }
    } catch {
      // leave the previous strategy shown; the next request will surface any real error
    } finally {
      setSwitching(false);
    }
  }

  useEffect(() => {
    const el = scrollRef.current;
    el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, sending]);

  useEffect(() => {
    if (!pendingHandoff) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !handoffBusy) handleCancelHandoff();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingHandoff, handoffBusy]);

  async function pollDispatchResolution(messageId: number, agentId: string) {
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}`);
      if (!res.ok) return;
      const data: { agent: { status: AgentStatus; lastRun: string } } = await res.json();
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId && m.dispatch
            ? { ...m, dispatch: { ...m.dispatch, status: data.agent.status, lastRun: data.agent.lastRun } }
            : m,
        ),
      );
    } catch {
      // best-effort follow-up only
    }
  }

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    const userMessage: ChatMessageUI = {
      id: nextId++,
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };
    const history = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-10)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/router", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history, role, unlockedAgentIds }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: nextId++,
            role: "error",
            content: data.error ?? `Request failed (${res.status}).`,
            timestamp: new Date().toISOString(),
            provider: data.provider,
          },
        ]);
        return;
      }

      const assistantId = nextId++;
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: "assistant",
          content: data.reply,
          timestamp: new Date().toISOString(),
          provider: data.provider,
          dispatch: data.dispatch ?? null,
          dispatchError: data.dispatchError,
          locked: data.locked ?? null,
          handoff: data.handoff ?? null,
        },
      ]);

      if (data.dispatch?.agentId) {
        setTimeout(() => pollDispatchResolution(assistantId, data.dispatch.agentId), 1800);
      }
      if (data.handoff) {
        setPendingHandoff({ handoff: data.handoff, messageId: assistantId });
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: nextId++,
          role: "error",
          content: err instanceof Error ? err.message : "Network error reaching the router.",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function markHandoffResolved(messageId: number) {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, handoffResolved: true } : m)));
  }

  /** Confirm: dispatch the SUGGESTED agent instead of the original one. */
  async function handleConfirmHandoff() {
    if (!pendingHandoff) return;
    const { handoff, messageId } = pendingHandoff;
    setHandoffBusy(true);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(handoff.targetAgentId)}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...handoff.params, role, unlockedAgentIds, skipHandoffCheck: true }),
      });
      const data = await res.json();
      const newId = nextId++;
      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { id: newId, role: "error", content: data.error ?? "Hand-off dispatch failed.", timestamp: new Date().toISOString() },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: newId,
            role: "assistant",
            content: `Handed off to **${handoff.targetAgentName}**.`,
            timestamp: new Date().toISOString(),
            dispatch: {
              agentId: handoff.targetAgentId,
              agentName: handoff.targetAgentName,
              status: data.agent?.status ?? "active",
              lastRun: data.agent?.lastRun ?? "running now",
              logMessage: data.log?.message ?? null,
            },
          },
        ]);
        setTimeout(() => pollDispatchResolution(newId, handoff.targetAgentId), 1800);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: nextId++,
          role: "error",
          content: err instanceof Error ? err.message : "Network error during hand-off.",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setHandoffBusy(false);
      markHandoffResolved(messageId);
      setPendingHandoff(null);
    }
  }

  /** Run here anyway: force the ORIGINAL agent to run, bypassing the suggestion. */
  async function handleRunAnyway() {
    if (!pendingHandoff) return;
    const { handoff, messageId } = pendingHandoff;
    setHandoffBusy(true);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(handoff.sourceAgentId)}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...handoff.params, role, unlockedAgentIds, skipHandoffCheck: true }),
      });
      const data = await res.json();
      const newId = nextId++;
      const sourceAgentName = agents.find((a) => a.id === handoff.sourceAgentId)?.name ?? handoff.sourceAgentId;
      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { id: newId, role: "error", content: data.error ?? "Dispatch failed.", timestamp: new Date().toISOString() },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: newId,
            role: "assistant",
            content: `Running **${sourceAgentName}** anyway.`,
            timestamp: new Date().toISOString(),
            dispatch: {
              agentId: handoff.sourceAgentId,
              agentName: sourceAgentName,
              status: data.agent?.status ?? "active",
              lastRun: data.agent?.lastRun ?? "running now",
              logMessage: data.log?.message ?? null,
            },
          },
        ]);
        setTimeout(() => pollDispatchResolution(newId, handoff.sourceAgentId), 1800);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: nextId++,
          role: "error",
          content: err instanceof Error ? err.message : "Network error dispatching agent.",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setHandoffBusy(false);
      markHandoffResolved(messageId);
      setPendingHandoff(null);
    }
  }

  function handleCancelHandoff() {
    if (pendingHandoff) markHandoffResolved(pendingHandoff.messageId);
    setPendingHandoff(null);
  }

  return (
    <section className="glass-card flex flex-col overflow-hidden rounded-2xl">
      <div className="flex items-center gap-3 border-b border-border-metal px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-electric/15 to-gold/15 text-electric ring-1 ring-border-metal">
          <MessageSquare className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-base font-semibold text-navy">AI Assistant</h2>
          <p className="text-xs text-secondary">Plain-English dispatch — any language, no JSON required.</p>
        </div>
        {strategy && (
          <label className="flex shrink-0 items-center gap-1.5">
            <span className="sr-only">LLM strategy</span>
            <select
              name="llm-strategy"
              value={strategy}
              disabled={switching}
              onChange={(e) => handleStrategyChange(e.target.value as LlmStrategy)}
              title={`Tries: ${providerOrderList.join(" → ") || "none configured"}`}
              className="rounded-full border border-border-metal bg-sunken px-2.5 py-1 font-mono text-[10px] text-muted outline-none disabled:opacity-60"
            >
              {(Object.keys(STRATEGY_LABEL) as LlmStrategy[]).map((s) => (
                <option key={s} value={s}>
                  {STRATEGY_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div ref={scrollRef} className="max-h-[32rem] min-h-[20rem] flex-1 space-y-4 overflow-y-auto p-5">
        {messages.map((m) => {
          if (m.role === "error") {
            return (
              <div key={m.id} className="flex items-start gap-2 rounded-xl bg-crimson/10 px-3 py-2.5 ring-1 ring-crimson/25">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-crimson" />
                <div className="min-w-0">
                  <p className="text-sm text-crimson">{m.content}</p>
                  <p className="mt-1 font-mono text-[10px] text-crimson/70">{formatTime(m.timestamp)}</p>
                </div>
              </div>
            );
          }

          const isUser = m.role === "user";
          return (
            <div key={m.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] ${isUser ? "" : "w-full"}`}>
                <div
                  className={`rounded-2xl px-4 py-3 ${
                    isUser
                      ? "bg-gradient-to-br from-electric to-gold text-white"
                      : "border border-border-metal bg-white/80"
                  }`}
                >
                  {isUser ? (
                    <p className="whitespace-pre-wrap break-words text-sm">{m.content}</p>
                  ) : (
                    <Markdown content={m.content} />
                  )}
                </div>
                {m.dispatch && <ExecutionCard dispatch={m.dispatch} />}
                {m.locked && (
                  <div className="mt-2 flex items-center gap-3 rounded-xl border border-border-metal bg-white/70 px-3 py-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sunken text-muted">
                      <Lock className="h-4 w-4" />
                    </span>
                    <p className="min-w-0 flex-1 text-sm text-secondary">
                      <span className="font-medium text-navy">{m.locked.agentName}</span> is locked for your role.
                    </p>
                    <button
                      type="button"
                      onClick={() => m.locked && requestAgentUnlock(m.locked.agentId)}
                      className="shrink-0 rounded-lg bg-gradient-to-r from-electric to-gold px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
                    >
                      Enter Key
                    </button>
                  </div>
                )}
                {m.handoff && (
                  <div className="mt-2 flex items-center gap-2 rounded-xl border border-gold/30 bg-gold/5 px-3 py-2 text-xs text-secondary">
                    <ArrowRightLeft className="h-3.5 w-3.5 shrink-0 text-gold" />
                    {m.handoffResolved ? (
                      <span>Hand-off to <span className="font-medium text-navy">{m.handoff.targetAgentName}</span> resolved.</span>
                    ) : (
                      <span>Suggested hand-off to <span className="font-medium text-navy">{m.handoff.targetAgentName}</span> — see prompt above.</span>
                    )}
                  </div>
                )}
                {m.dispatchError && (
                  <p className="mt-1.5 flex items-center gap-1 text-[11px] text-crimson">
                    <AlertTriangle className="h-3 w-3" /> {m.dispatchError}
                  </p>
                )}
                <p className={`mt-1 font-mono text-[10px] text-muted ${isUser ? "text-right" : ""}`}>
                  {formatTime(m.timestamp)}
                  {m.provider && ` · via ${m.provider}`}
                </p>
              </div>
            </div>
          );
        })}

        {sending && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl border border-border-metal bg-white/80 px-4 py-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-electric" />
              <span className="text-sm text-secondary">Thinking…</span>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSend} className="flex items-end gap-2 border-t border-border-metal p-4">
        <textarea
          ref={inputRef}
          name="chat-message"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Ask in any language… e.g. “review the login screen before we ship”"
          className="max-h-32 flex-1 resize-none rounded-xl border border-border-metal bg-white/80 px-3.5 py-2.5 text-sm text-navy outline-none focus:border-electric/50"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-electric to-gold px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>

      {pendingHandoff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Dismiss"
            onClick={handoffBusy ? undefined : handleCancelHandoff}
            className="absolute inset-0 bg-navy/40 backdrop-blur-sm"
          />
          <div className="glass-card-strong relative w-full max-w-sm rounded-2xl border border-border-metal-strong p-6 shadow-2xl">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-gold/15 to-electric/15 text-gold ring-1 ring-border-metal">
              <ArrowRightLeft className="h-5 w-5" />
            </span>
            <h2 className="mt-3 font-heading text-base font-semibold text-navy">Hand off this task?</h2>
            <p className="mt-1 text-sm text-secondary">
              This task is best handled by{" "}
              <span className="font-medium text-navy">{pendingHandoff.handoff.targetAgentName}</span>.{" "}
              {pendingHandoff.handoff.reason}
            </p>

            <div className="mt-5 space-y-2">
              <button
                type="button"
                onClick={handleConfirmHandoff}
                disabled={handoffBusy}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-electric to-gold px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {handoffBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
                Hand off to {pendingHandoff.handoff.targetAgentName}
              </button>
              <button
                type="button"
                onClick={handleRunAnyway}
                disabled={handoffBusy}
                className="w-full rounded-lg border border-border-metal bg-white/70 px-4 py-2.5 text-sm font-medium text-secondary transition-colors hover:text-navy disabled:cursor-not-allowed disabled:opacity-60"
              >
                Run here anyway
              </button>
              <button
                type="button"
                onClick={handleCancelHandoff}
                disabled={handoffBusy}
                className="w-full rounded-lg px-4 py-2 text-sm text-muted transition-colors hover:text-navy disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
