"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import { Cpu, Key, Terminal, Check, Copy, X, RefreshCw, ArrowRight, Globe } from "lucide-react";
import { useAppState } from "@/lib/appState";
import { getWebLlmEngine, isWebGpuSupported, type WebLlmProgressReport } from "@/lib/webLlm";
import { WebLlmIndicator } from "@/components/workspace/WebLlmIndicator";

const DISMISSED_KEY = "growforge.byok_onboarding_dismissed";
type ProviderStatus = "checking" | "local-ready" | "local-offline" | "cloud-configured";

const emptySubscribe = () => () => {};

export function ByokOnboardingBanner() {
  const { openSettings } = useAppState();
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const [dismissedLocally, setDismissedLocally] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus>("checking");
  const [webLlmProgress, setWebLlmProgress] = useState<WebLlmProgressReport | null>(null);
  const [webLlmReady, setWebLlmReady] = useState(false);
  const [webLlmError, setWebLlmError] = useState<string | null>(null);

  const storedDismissed = useSyncExternalStore(
    emptySubscribe,
    () => {
      try {
        return window.sessionStorage.getItem(DISMISSED_KEY) === "true";
      } catch {
        return false;
      }
    },
    () => false,
  );

  useEffect(() => {
    void checkProviderStatus();
  }, []);

  async function checkProviderStatus() {
    setIsTesting(true);
    setProviderStatus("checking");
    try {
      const [routerRes, testRes] = await Promise.all([
        fetch("/api/router"),
        fetch("/api/vault/system/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            baseUrl: "http://localhost:11434/v1",
            modelName: "qwen2.5:7b-instruct",
            providerType: "ollama",
          }),
        }),
      ]);

      const routerData = routerRes.ok ? await routerRes.json() : null;
      const hasConfiguredCloud = Boolean(
        routerData?.availableKeys && Object.values(routerData.availableKeys as Record<string, boolean>).some(Boolean),
      );
      const testData = testRes.ok ? await testRes.json() : null;

      if (testData?.ok) {
        setProviderStatus("local-ready");
      } else {
        setProviderStatus(hasConfiguredCloud ? "cloud-configured" : "local-offline");
      }
    } catch {
      setProviderStatus("local-offline");
    } finally {
      setIsTesting(false);
    }
  }

  function handleDismiss() {
    setDismissedLocally(true);
    try {
      window.sessionStorage.setItem(DISMISSED_KEY, "true");
    } catch {}
  }

  function handleCopyCommand() {
    navigator.clipboard.writeText("ollama run qwen2.5:7b-instruct");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Downloads and runs a small model entirely inside this browser tab via
  // WebGPU (@mlc-ai/web-llm) — no install, no OS-level permission, because
  // the browser is downloading into its own sandboxed cache, not touching
  // the user's filesystem. This is the closest thing to "one click, it just
  // works, no terminal" that's actually possible from a webpage: a real
  // native-software install can never be triggered by a website, by design
  // (the same browser security boundary that keeps sites from installing
  // malware). ChatView.tsx already falls back to this automatically once
  // nothing else is configured — this button just makes that option visible
  // and explicit instead of a silent fallback the user never finds.
  async function handleRunInBrowser() {
    setWebLlmError(null);
    setWebLlmProgress({ text: "Starting…", progress: 0 });
    try {
      await getWebLlmEngine(undefined, (report) => setWebLlmProgress(report));
      setWebLlmReady(true);
    } catch (err) {
      setWebLlmError(err instanceof Error ? err.message : "Failed to start the in-browser model.");
      setWebLlmProgress(null);
    }
  }

  const isDismissed = dismissedLocally || storedDismissed;
  const webGpuAvailable = mounted && isWebGpuSupported();

  // A confirmed local runtime needs no onboarding banner. A configured cloud
  // key stays visible until the user verifies it from the model manager.
  if (!mounted || isDismissed || providerStatus === "local-ready" || webLlmReady) return null;

  const hasCloudConfiguration = providerStatus === "cloud-configured";
  const isChecking = providerStatus === "checking";
  const description = isChecking
    ? "Checking whether GrowForge can reach its local AI runtime…"
    : hasCloudConfiguration
      ? "Local Ollama is not reachable. A cloud API key is configured, but it still needs a connection test before you rely on it."
      : webGpuAvailable
        ? "No runnable AI provider is detected. Run a small model right in this browser tab (free, no install), start Ollama locally, or add your own cloud API key."
        : "No runnable AI provider is detected. Start Ollama locally for private, no-token-cost execution, or add and test your own cloud API key.";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-electric/30 bg-gradient-to-r from-app via-app to-slate-900 p-4 sm:p-5 text-white shadow-xl backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-300">
      {/* Decorative ambient background glow */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-electric/15 blur-3xl" />
      <div className="pointer-events-none absolute -left-16 -bottom-16 h-48 w-48 rounded-full bg-gold/10 blur-3xl" />

      <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        {/* Left info */}
        <div className="flex items-start gap-3.5 max-w-2xl">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20 text-electric shadow-inner">
            <Cpu className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-heading text-sm font-semibold tracking-tight text-white flex items-center gap-1.5">
                Choose how GrowForge runs AI
                <span className="inline-flex items-center rounded-full bg-electric/20 px-2 py-0.5 text-[10px] font-medium text-electric ring-1 ring-inset ring-electric/30">
                  Local-first
                </span>
              </h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {description}
            </p>
          </div>
        </div>

        {/* Right actions */}
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 pt-1 md:pt-0">
            {/* Copy CLI command pill */}
            <button
              type="button"
              onClick={handleCopyCommand}
              title="Click to copy Ollama launch command"
              className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 font-mono text-[11px] text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              <Terminal className="h-3.5 w-3.5 text-electric" />
              <span>ollama run qwen2.5:7b-instruct</span>
              {copied ? <Check className="h-3.5 w-3.5 text-emerald" /> : <Copy className="h-3 w-3 text-muted" />}
            </button>

            {/* Re-test button — re-checks local Ollama specifically, distinct
             *  from "Run in this browser" below which needs no re-testing. */}
            <button
              type="button"
              onClick={checkProviderStatus}
              disabled={isTesting}
              title="Re-test local Ollama connection"
              className="flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 p-2 text-slate-300 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isTesting ? "animate-spin text-electric" : ""}`} />
            </button>

            {/* Run in this browser — free, zero-install, real download+run
             *  confined to the browser's own sandbox (WebGPU). Only shown
             *  when the browser actually supports WebGPU, since it cannot
             *  work otherwise. */}
            {webGpuAvailable && (
              <button
                type="button"
                onClick={handleRunInBrowser}
                disabled={Boolean(webLlmProgress)}
                title="Download and run a small model directly in this browser tab — no install"
                className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
              >
                <Globe className="h-3.5 w-3.5 text-electric" />
                <span>Run in this browser</span>
              </button>
            )}

            {/* Settings button */}
            <button
              type="button"
              onClick={() => openSettings("ai-providers")}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-electric to-gold px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:brightness-110 active:scale-95"
            >
              <Key className="h-3.5 w-3.5" />
              <span>{hasCloudConfiguration ? "Test configured model" : "Add a cloud key"}</span>
              <ArrowRight className="h-3 w-3" />
            </button>

            {/* Dismiss button */}
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Dismiss banner"
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {webLlmProgress && (
            <WebLlmIndicator progressText={webLlmProgress.text} progressPercent={webLlmProgress.progress} />
          )}
          {webLlmError && <p className="text-[11px] text-crimson">{webLlmError}</p>}
        </div>
      </div>
    </div>
  );
}
