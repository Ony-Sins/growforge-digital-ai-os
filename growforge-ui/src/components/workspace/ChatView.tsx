"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  Bot,
  ClipboardCheck,
  Code2,
  FileText,
  FlaskConical,
  Loader2,
  Lock,
  Maximize2,
  Minimize2,
  Paperclip,
  Rocket,
  MessageSquare,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  X,
  type LucideIcon,
} from "lucide-react";
import { agents, type AgentStatus } from "@/lib/agents";
import { StatusDot, statusLabel, statusTextClass } from "@/components/ui/StatusDot";
import type { LlmStrategy } from "@/lib/llm";
import { useAppState } from "@/lib/appState";
import type { HandoffSuggestion } from "@/lib/handoff";
import { Markdown } from "@/components/ui/Markdown";

interface RouterStatus {
  strategy: LlmStrategy;
  providerOrder: string[];
  availableKeys: Record<string, boolean>;
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

interface AttachmentUI {
  name: string;
  kind: string;
  extractedText: string;
  status: "uploading" | "done" | "error";
}

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
  confirmBrief?: string | null;
  job?: { id: string; title: string } | null;
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
    <div className="mt-2 flex items-center gap-3 rounded-xl border border-[#333333] bg-[#111827] px-3 py-2.5">
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

const WELCOME_CONTENT =
  "Hi, I'm the GrowForge AI Assistant. Describe a project in plain language — any language — and I'll ask the right questions, confirm what I understood, then hand it to the departments. You can watch them work live under **Live Projects**.\n\nTry: *\"My client just started a roofing business and needs a complete plan to get real leads and grow.\"*";

export function ChatView() {
  const { role, unlockedAgentIds, requestAgentUnlock, openJob, chatViewMode, setChatViewMode, activeView, activeViewToken } =
    useAppState();

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
  const [pendingBrief, setPendingBrief] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<AttachmentUI[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Clicking "AI Assistant" in the sidebar no longer scrolls to a section —
  // the chat is always visible (docked) or already full-screen (maximized).
  // Instead it just moves focus into the input, same result a user wants.
  useEffect(() => {
    if (activeView === "chat") inputRef.current?.focus();
  }, [activeView, activeViewToken]);

  useEffect(() => {
    if (!pendingHandoff) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !handoffBusy) handleCancelHandoff();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingHandoff, handoffBusy]);

  async function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).slice(0, 10);
    const names = files.map((f) => f.name);
    setAttachments((prev) => [...prev, ...files.map((f) => ({ name: f.name, kind: "…", extractedText: "", status: "uploading" as const }))]);

    const formData = new FormData();
    files.forEach((f) => formData.append("file", f));

    try {
      const res = await fetch("/api/attachments", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setAttachments((prev) =>
          prev.map((a) => (names.includes(a.name) && a.status === "uploading" ? { ...a, status: "error", extractedText: data.error ?? "Upload failed." } : a)),
        );
        return;
      }
      const results: { name: string; kind: string; extractedText: string }[] = data.results ?? [];
      setAttachments((prev) => {
        const withoutUploading = prev.filter((a) => !(names.includes(a.name) && a.status === "uploading"));
        return [...withoutUploading, ...results.map((r) => ({ ...r, status: "done" as const }))];
      });
    } catch {
      setAttachments((prev) =>
        prev.map((a) => (names.includes(a.name) && a.status === "uploading" ? { ...a, status: "error", extractedText: "Network error uploading file." } : a)),
      );
    }
  }

  function removeAttachment(name: string) {
    setAttachments((prev) => prev.filter((a) => a.name !== name));
  }

  function buildAttachmentContext(): string | undefined {
    const ready = attachments.filter((a) => a.status === "done");
    if (ready.length === 0) return undefined;
    return `The client attached ${ready.length} file${ready.length === 1 ? "" : "s"} — use this as real context, not as something to ask the client to re-explain:\n\n${ready
      .map((a) => `--- Attached file: ${a.name} (${a.kind}) ---\n${a.extractedText}`)
      .join("\n\n")}`;
  }

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

  async function handleSend(e?: React.FormEvent, override?: string) {
    e?.preventDefault();
    const text = (override ?? input).trim();
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

    const attachmentContext = buildAttachmentContext();
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setAttachments([]);
    setSending(true);

    try {
      const res = await fetch("/api/router", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history, role, unlockedAgentIds, pendingBrief, attachmentContext }),
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
          confirmBrief: data.mode === "confirm" ? data.brief : null,
          job: data.job ?? null,
        },
      ]);

      if (data.mode === "confirm" && data.brief) {
        setPendingBrief(data.brief);
      } else if (data.mode !== "clarify") {
        setPendingBrief(null);
      }
      if (data.job?.id) {
        if (typeof Notification !== "undefined" && Notification.permission === "default") {
          Notification.requestPermission().catch(() => {});
        }
        openJob(data.job.id);
      }

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

  const maximized = chatViewMode === "maximized";

  return (
    <section
      className={
        maximized
          ? "fixed inset-0 z-50 flex flex-col bg-[#0B1220]"
          : // Docked: a bottom sheet below lg, persistent right-side panel at lg+
            "fixed inset-x-0 bottom-0 top-auto z-30 flex h-[45vh] flex-col border-t border-[#333333] bg-[#0B1220]/95 backdrop-blur-2xl shadow-2xl lg:inset-x-auto lg:inset-y-auto lg:right-0 lg:top-16 lg:bottom-0 lg:h-auto lg:w-full lg:max-w-sm lg:border-l lg:border-t-0"
      }
    >
      <div className="flex items-center gap-2.5 border-b border-[#333333] px-4 py-3 bg-[#111827]/60">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-electric/15 to-gold/15 text-electric ring-1 ring-[#333333]">
          <MessageSquare className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-heading text-sm font-semibold text-white">AI Assistant</h2>
          {maximized && (
            <p className="truncate text-xs text-secondary">Describe it in plain language. I ask, confirm, then the team builds it.</p>
          )}
        </div>
        {strategy && maximized && (
          <label className="flex shrink-0 items-center gap-1.5">
            <span className="sr-only">LLM strategy</span>
            <select
              name="llm-strategy"
              value={strategy}
              disabled={switching}
              onChange={(e) => handleStrategyChange(e.target.value as LlmStrategy)}
              title={`Tries: ${providerOrderList.join(" → ") || "none configured"}`}
              className="rounded-full border border-[#333333] bg-[#111827] px-2.5 py-1 font-mono text-[10px] text-muted outline-none disabled:opacity-60"
            >
              {(Object.keys(STRATEGY_LABEL) as LlmStrategy[]).map((s) => (
                <option key={s} value={s}>
                  {STRATEGY_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          onClick={() => setChatViewMode(maximized ? "docked" : "maximized")}
          title={maximized ? "Dock to the right side" : "Maximize to full screen"}
          className="flex shrink-0 items-center justify-center rounded-lg border border-[#333333] bg-[#111827] p-1.5 text-secondary hover:border-electric/40 hover:text-electric"
        >
          {maximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
      </div>

      <div
        ref={scrollRef}
        className={`flex-1 space-y-4 overflow-y-auto p-5 ${maximized ? "mx-auto w-full max-w-3xl" : ""}`}
      >
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
                      ? "btn-primary-cta text-white shadow-lg"
                      : "border border-[#333333] bg-[#111827] text-white shadow-sm"
                  }`}
                >
                  {isUser ? (
                    <p className="whitespace-pre-wrap break-words text-sm">{m.content}</p>
                  ) : (
                    <Markdown content={m.content} />
                  )}
                </div>
                {m.dispatch && <ExecutionCard dispatch={m.dispatch} />}
                {m.confirmBrief && (
                  <div className="mt-2 rounded-xl border border-gold/40 bg-gold/5 p-3">
                    <details>
                      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-white">
                        <ClipboardCheck className="h-4 w-4 text-gold" /> Project brief · tap to review the full version
                      </summary>
                      <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-[#0B1220] border border-[#333333] p-3 font-body text-xs text-secondary">
                        {m.confirmBrief}
                      </pre>
                    </details>
                    {pendingBrief === m.confirmBrief && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={sending}
                          onClick={() => handleSend(undefined, "Yes, looks right. Send it to the team.")}
                          className="btn-primary-cta !px-3 !py-1.5 text-xs font-semibold shadow-sm disabled:opacity-60"
                        >
                          <Rocket className="h-3.5 w-3.5" /> Send to the team
                        </button>
                        <button
                          type="button"
                          onClick={() => inputRef.current?.focus()}
                          className="rounded-lg border border-[#333333] bg-[#111827] px-3 py-1.5 text-xs font-medium text-secondary hover:text-white"
                        >
                          Make changes
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {m.job && (
                  <button
                    type="button"
                    onClick={() => m.job && openJob(m.job.id)}
                    className="mt-2 flex w-full items-center gap-3 rounded-xl border border-electric/30 bg-electric/10 px-3 py-2.5 text-left transition-colors hover:bg-electric/15"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-electric/15 text-electric">
                      <Rocket className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-white">{m.job.title}</span>
                      <span className="block text-xs text-secondary">Sent to the team — watch it live</span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-electric">Open →</span>
                  </button>
                )}
                {m.locked && (
                  <div className="mt-2 flex items-center gap-3 rounded-xl border border-[#333333] bg-[#111827] px-3 py-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0B1220] text-muted">
                      <Lock className="h-4 w-4" />
                    </span>
                    <p className="min-w-0 flex-1 text-sm text-secondary">
                      <span className="font-medium text-white">{m.locked.agentName}</span> is locked for your role.
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
                      <span>Hand-off to <span className="font-medium text-white">{m.handoff.targetAgentName}</span> resolved.</span>
                    ) : (
                      <span>Suggested hand-off to <span className="font-medium text-white">{m.handoff.targetAgentName}</span> — see prompt above.</span>
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
            <div className="flex items-center gap-2 rounded-2xl border border-[#333333] bg-[#111827] px-4 py-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-electric" />
              <span className="text-sm text-secondary">Thinking…</span>
            </div>
          </div>
        )}
      </div>

      <div className={`border-t border-[#333333] bg-[#111827]/40 ${maximized ? "mx-auto w-full max-w-3xl" : ""}`}>
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pt-3">
            {attachments.map((a) => (
              <div
                key={a.name}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${
                  a.status === "error" ? "border-crimson/30 bg-crimson/5 text-crimson" : "border-[#333333] bg-[#111827] text-secondary"
                }`}
                title={a.status === "error" ? a.extractedText : a.status === "done" ? a.extractedText.slice(0, 200) : undefined}
              >
                {a.status === "uploading" ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <FileText className="h-3.5 w-3.5 shrink-0" />}
                <span className="max-w-[10rem] truncate">{a.name}</span>
                <button type="button" onClick={() => removeAttachment(a.name)} aria-label={`Remove ${a.name}`} className="text-muted hover:text-white">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <form onSubmit={handleSend} className="flex items-end gap-2 p-4">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.txt,.md,.csv,image/*"
            className="sr-only"
            onChange={(e) => {
              handleFilesSelected(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Attach files (PDF, Word doc, image, text)"
            className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl border border-[#333333] bg-[#111827] text-secondary hover:border-electric/40 hover:text-electric"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <textarea
            ref={inputRef}
            name="chat-message"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              const el = e.target;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 192)}px`;
            }}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={pendingBrief ? "Reply “yes” or tell me what to change…" : "Describe a project…"}
            className="max-h-48 min-h-[52px] flex-1 resize-none overflow-y-auto rounded-xl border border-[#333333] bg-[#0B1220] px-3.5 py-4 text-sm leading-5 text-white placeholder:text-muted outline-none focus:border-electric/50"
          />
          <button
            type="submit"
            disabled={sending || !input.trim() || attachments.some((a) => a.status === "uploading")}
            className="btn-primary-cta !h-[52px] !w-[52px] !p-0 shrink-0 shadow-lg disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>

      {pendingHandoff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Dismiss"
            onClick={handoffBusy ? undefined : handleCancelHandoff}
            className="absolute inset-0 bg-navy/60 backdrop-blur-sm"
          />
          <div className="glass-card-strong relative w-full max-w-sm rounded-2xl border border-[#333333] p-6 shadow-2xl bg-[#0B1220]">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-gold/15 to-electric/15 text-gold ring-1 ring-[#333333]">
              <ArrowRightLeft className="h-5 w-5" />
            </span>
            <h2 className="mt-3 font-heading text-base font-semibold text-white">Hand off this task?</h2>
            <p className="mt-1 text-sm text-secondary">
              This task is best handled by{" "}
              <span className="font-medium text-white">{pendingHandoff.handoff.targetAgentName}</span>.{" "}
              {pendingHandoff.handoff.reason}
            </p>

            <div className="mt-5 space-y-2">
              <button
                type="button"
                onClick={handleConfirmHandoff}
                disabled={handoffBusy}
                className="btn-primary-cta w-full !py-2.5 text-sm font-semibold shadow-md disabled:cursor-not-allowed disabled:opacity-60"
              >
                {handoffBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
                Hand off to {pendingHandoff.handoff.targetAgentName}
              </button>
              <button
                type="button"
                onClick={handleRunAnyway}
                disabled={handoffBusy}
                className="w-full rounded-lg border border-[#333333] bg-[#111827] px-4 py-2.5 text-sm font-medium text-secondary transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                Run here anyway
              </button>
              <button
                type="button"
                onClick={handleCancelHandoff}
                disabled={handoffBusy}
                className="w-full rounded-lg px-4 py-2 text-sm text-muted transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
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
