"use client";

import { useCallback, useEffect, useState } from "react";
import { X, MessageSquarePlus } from "lucide-react";
import { BetaFeedbackModal } from "@/components/BetaFeedbackModal";

interface ByokProviderSummary {
  provider: "openai" | "anthropic" | "gemini" | "groq" | "openrouter";
  masked: string;
  enabled: boolean;
  selectedModel?: string;
  createdAt: string;
  updatedAt: string;
  lastTestedAt: string | null;
  lastUsedAt: string | null;
}

const PROVIDER_NAMES: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  groq: "Groq",
  openrouter: "OpenRouter",
};

const DEFAULT_MODELS: Record<string, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-latest",
  gemini: "gemini-1.5-flash",
  groq: "qwen/qwen3.8-27b",
  openrouter: "meta-llama/llama-3.3-70b-instruct",
};

const ALLOWED_MODELS: Record<string, string[]> = {
  openai: ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo", "o3-mini", "gpt-3.5-turbo"],
  anthropic: ["claude-3-5-haiku-latest", "claude-3-5-sonnet-latest", "claude-3-opus-latest"],
  gemini: ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-1.5-pro"],
  groq: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "qwen/qwen3.8-27b", "openai/gpt-oss-120b", "mixtral-8x7b-32768"],
  openrouter: [
    "meta-llama/llama-3.3-70b-instruct",
    "anthropic/claude-3.5-haiku",
    "google/gemini-2.0-flash-001",
    "openai/gpt-4o-mini",
  ],
};

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "Never");

export function BetaTesterSettings({
  testerEmail,
  onClose,
  isOverlay = false,
}: {
  testerEmail: string;
  onClose?: () => void;
  isOverlay?: boolean;
}) {
  const [providers, setProviders] = useState<ByokProviderSummary[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>("groq");
  const [selectedModel, setSelectedModel] = useState<string>("llama-3.3-70b-versatile");
  const [apiKey, setApiKey] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState<boolean>(false);

  // NORA Test Console State
  const [chatMode, setChatMode] = useState<"sandbox" | "live">("sandbox");
  const [chatMessage, setChatMessage] = useState<string>("Hello NORA! What mode and engine are you running on?");
  const [chatReply, setChatReply] = useState<{
    reply: string;
    provider: string;
    model: string;
    mode: string;
    error?: boolean;
  } | null>(null);
  const [chatBusy, setChatBusy] = useState<boolean>(false);

  const loadProviders = useCallback(async () => {
    try {
      const res = await fetch("/api/beta/byok", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setProviders(data.providers || []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  const handleProviderChange = (p: string) => {
    setSelectedProvider(p);
    setSelectedModel(DEFAULT_MODELS[p] || "");
  };

  const handleTestKey = async () => {
    if (!apiKey.trim()) {
      setNotice({ kind: "err", text: "Please enter an API key to test." });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/beta/byok/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: selectedProvider, apiKey }),
      });
      const data = await res.json();
      if (data.valid) {
        setNotice({ kind: "ok", text: `✓ Valid ${PROVIDER_NAMES[selectedProvider]} credential! Connection successful.` });
      } else {
        setNotice({ kind: "err", text: `✗ Credential test failed: ${data.error || "Invalid key."}` });
      }
    } catch (err: any) {
      setNotice({ kind: "err", text: `Test failed: ${err.message}` });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveKey = async () => {
    if (!apiKey.trim()) {
      setNotice({ kind: "err", text: "Please enter an API key to save." });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/beta/byok", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: selectedProvider,
          apiKey,
          selectedModel,
          test: false,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setNotice({ kind: "ok", text: `✓ Connected ${PROVIDER_NAMES[selectedProvider]} securely (AES-256-GCM).` });
        setApiKey("");
        loadProviders();
      } else {
        setNotice({ kind: "err", text: data.error || "Failed to save provider credential." });
      }
    } catch (err: any) {
      setNotice({ kind: "err", text: `Save failed: ${err.message}` });
    } finally {
      setBusy(false);
    }
  };

  const handleToggle = async (provider: string, currentEnabled: boolean) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/beta/byok", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, enabled: !currentEnabled }),
      });
      if (res.ok) {
        loadProviders();
      } else {
        const data = await res.json();
        setNotice({ kind: "err", text: data.error || "Failed to update provider." });
      }
    } catch (err: any) {
      setNotice({ kind: "err", text: `Update failed: ${err.message}` });
    } finally {
      setBusy(false);
    }
  };

  const handleTestStored = async (provider: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/beta/byok/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const data = await res.json();
      if (data.valid) {
        setNotice({ kind: "ok", text: `✓ Connected ${PROVIDER_NAMES[provider]} credential verified active.` });
        loadProviders();
      } else {
        setNotice({ kind: "err", text: `✗ Stored credential test failed: ${data.error}` });
      }
    } catch (err: any) {
      setNotice({ kind: "err", text: `Test failed: ${err.message}` });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (provider: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/beta/byok?provider=${encodeURIComponent(provider)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setNotice({ kind: "ok", text: `✓ Disconnected and permanently destroyed vault key for ${PROVIDER_NAMES[provider]}.` });
        loadProviders();
      } else {
        const data = await res.json();
        setNotice({ kind: "err", text: data.error || "Failed to delete provider." });
      }
    } catch (err: any) {
      setNotice({ kind: "err", text: `Delete failed: ${err.message}` });
    } finally {
      setBusy(false);
    }
  };

  const handleSendChat = async () => {
    if (!chatMessage.trim()) return;
    setChatBusy(true);
    setChatReply(null);
    try {
      const res = await fetch("/api/beta/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: chatMessage,
          mode: chatMode,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setChatReply({
          reply: data.reply,
          provider: data.provider,
          model: data.model,
          mode: data.mode || chatMode,
        });
      } else {
        setChatReply({
          reply: `[Error ${res.status}] ${data.error || "Execution failed."}`,
          provider: "Error",
          model: data.code || "refused",
          mode: chatMode,
          error: true,
        });
      }
    } catch (err: any) {
      setChatReply({
        reply: `Network error: ${err.message}`,
        provider: "Error",
        model: "offline",
        mode: chatMode,
        error: true,
      });
    } finally {
      setChatBusy(false);
      loadProviders();
    }
  };

  return (
    <div className={`${isOverlay ? "" : "min-h-screen bg-[#060e1d] p-4 sm:p-8"} text-slate-200 font-sans`}>
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-4 gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              GrowForge Beta <span className="text-cyan-400">BYOK & Settings</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5 font-mono">
              Authenticated Tester: <span className="text-slate-200">{testerEmail}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <button
              type="button"
              onClick={() => setIsFeedbackOpen(true)}
              className="flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded-lg border border-cyan-500/30 bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-300 transition shadow-sm w-fit"
            >
              <MessageSquarePlus className="h-4 w-4" />
              <span>Feedback</span>
            </button>
            {isOverlay && onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/90 hover:bg-slate-700 hover:text-white text-slate-300 transition shadow-sm w-fit"
                aria-label="Close Settings"
              >
                <X className="h-4 w-4" />
                <span>Close</span>
              </button>
            ) : (
              <a
                href="/"
                className="text-xs font-mono px-3 py-1.5 rounded border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 w-fit"
              >
                ← Back to Workspace
              </a>
            )}
          </div>
        </div>

        <BetaFeedbackModal
          isOpen={isFeedbackOpen}
          onClose={() => setIsFeedbackOpen(false)}
        />

        {/* Global Notice */}
        {notice && (
          <div
            className={`p-3 rounded-lg border text-sm flex items-start gap-2 ${
              notice.kind === "ok"
                ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-300"
                : "bg-rose-950/40 border-rose-500/30 text-rose-300"
            }`}
          >
            <span>{notice.text}</span>
          </div>
        )}

        {/* SECTION 1: Connect a Provider Credential */}
        <section className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="border-b border-slate-800 pb-3">
            <h2 className="text-base font-semibold text-white">Connect AI Provider Key (BYOK)</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Connect your personal API key to enable Live AI Mode. Keys are encrypted server-side with AES-256-GCM.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1">Provider</label>
              <select
                value={selectedProvider}
                onChange={(e) => handleProviderChange(e.target.value)}
                disabled={busy}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-400"
              >
                <option value="groq">Groq (Recommended / Fast)</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="gemini">Google Gemini</option>
                <option value="openrouter">OpenRouter</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1">Default Model</label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={busy}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-400"
              >
                {(ALLOWED_MODELS[selectedProvider] || []).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-slate-400 mb-1">
              API Key ({PROVIDER_NAMES[selectedProvider]})
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste your API key here (sk-..., gsk_..., AIza...)"
              disabled={busy}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
            />
            <p className="text-[11px] text-slate-500 mt-1 font-mono">
              Never stored in plaintext. Raw keys cannot be retrieved by the browser after submission.
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleTestKey}
              disabled={busy || !apiKey.trim()}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-xs font-semibold text-slate-200 transition disabled:opacity-50"
            >
              Test Key
            </button>
            <button
              onClick={handleSaveKey}
              disabled={busy || !apiKey.trim()}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold shadow transition disabled:opacity-50"
            >
              Connect & Save Key
            </button>
          </div>
        </section>

        {/* SECTION 2: Connected Providers */}
        <section className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-base font-semibold text-white">Your Connected Providers</h2>
              <p className="text-xs text-slate-400 mt-0.5">Encrypted credentials in your isolated vault.</p>
            </div>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
              {providers.length} connected
            </span>
          </div>

          {providers.length === 0 ? (
            <div className="text-center py-6 text-slate-500 text-sm font-mono">
              No providers connected yet. Sandbox mode is active.
            </div>
          ) : (
            <div className="space-y-3">
              {providers.map((p) => (
                <div
                  key={p.provider}
                  className="bg-slate-800/60 border border-slate-700/80 rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-white">
                        {PROVIDER_NAMES[p.provider] || p.provider}
                      </span>
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-cyan-300">
                        {p.masked}
                      </span>
                      <span
                        className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${
                          p.enabled
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                            : "bg-slate-700/30 border-slate-600 text-slate-400"
                        }`}
                      >
                        {p.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 font-mono space-x-3">
                      <span>Model: {p.selectedModel || DEFAULT_MODELS[p.provider]}</span>
                      <span>•</span>
                      <span>Tested: {fmt(p.lastTestedAt)}</span>
                      <span>•</span>
                      <span>Used: {fmt(p.lastUsedAt)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                    <button
                      onClick={() => handleToggle(p.provider, p.enabled)}
                      disabled={busy}
                      className="px-2.5 py-1.5 rounded border border-slate-600 bg-slate-700 hover:bg-slate-600 text-xs font-mono text-slate-200"
                    >
                      {p.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      onClick={() => handleTestStored(p.provider)}
                      disabled={busy}
                      className="px-2.5 py-1.5 rounded border border-slate-600 bg-slate-700 hover:bg-slate-600 text-xs font-mono text-slate-200"
                    >
                      Test
                    </button>
                    <button
                      onClick={() => handleDelete(p.provider)}
                      disabled={busy}
                      className="px-2.5 py-1.5 rounded border border-rose-900/50 bg-rose-950/40 hover:bg-rose-900/60 text-xs font-mono text-rose-300"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* SECTION 3: Live NORA Testing Console */}
        <section className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">NORA Verification Console</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Verify execution in Sandbox Mode (zero cost) or Live AI Mode (using your BYOK key).
              </p>
            </div>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-400 mr-2">Execution Mode:</span>
            <button
              onClick={() => setChatMode("sandbox")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-mono border transition ${
                chatMode === "sandbox"
                  ? "bg-slate-700 border-slate-500 text-white"
                  : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              Sandbox Mode (Zero Cost)
            </button>
            <button
              onClick={() => setChatMode("live")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-mono border transition ${
                chatMode === "live"
                  ? "bg-cyan-950/60 border-cyan-400 text-cyan-300"
                  : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              Live AI Mode (BYOK)
            </button>
          </div>

          <div className="space-y-2">
            <input
              type="text"
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              placeholder="Enter message for NORA..."
              disabled={chatBusy}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-400"
            />
            <button
              onClick={handleSendChat}
              disabled={chatBusy || !chatMessage.trim()}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold shadow transition disabled:opacity-50"
            >
              {chatBusy ? "Executing..." : `Send via ${chatMode === "live" ? "Live AI" : "Sandbox"}`}
            </button>
          </div>

          {chatReply && (
            <div
              className={`p-4 rounded-lg border space-y-2 ${
                chatReply.error
                  ? "bg-rose-950/30 border-rose-500/40 text-rose-200"
                  : "bg-slate-800/80 border-slate-700 text-slate-200"
              }`}
            >
              <div className="flex items-center justify-between text-xs font-mono border-b border-slate-700/60 pb-1.5">
                <span className="font-semibold text-cyan-400">NORA Response</span>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">
                    Provider: {chatReply.provider}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">
                    Model: {chatReply.model}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded font-bold uppercase ${
                      chatReply.mode === "live" ? "bg-cyan-900/60 text-cyan-300" : "bg-slate-700 text-slate-300"
                    }`}
                  >
                    {chatReply.mode}
                  </span>
                </div>
              </div>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{chatReply.reply}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
