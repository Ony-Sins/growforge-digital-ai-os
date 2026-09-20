"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2,
  Globe,
  Key,
  Loader2,
  Plug,
  Plus,
  RefreshCw,
  Server,
  Sparkles,
  Trash2,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import type { CustomMcpPlugin, DetectedMcpTool } from "@/lib/mcp/pluginRegistry";

export function Integrations({ className = "" }: { className?: string }) {
  const [plugins, setPlugins] = useState<CustomMcpPlugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Form State: Simple Endpoint URL + optional Auth Token inputs
  const [name, setName] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [apiKey, setApiKey] = useState("");

  // Connection/Detection State
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    tools?: DetectedMcpTool[];
  } | null>(null);

  const loadPlugins = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/mcp/connect");
      if (res.ok) {
        const data = await res.json();
        setPlugins(Array.isArray(data.plugins) ? data.plugins : []);
      }
    } catch {
      // Ignored
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadPlugins();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadPlugins]);

  const handleTestAndConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !serverUrl.trim()) return;

    setTesting(true);
    setTestResult(null);

    try {
      const res = await fetch("/api/mcp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          serverUrl: serverUrl.trim(),
          apiKey: apiKey.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (res.ok && data.ok) {
        setTestResult({
          success: true,
          message: `Successfully connected! Discovered ${data.detectedTools?.length || 0} tools.`,
          tools: data.detectedTools || [],
        });
        await loadPlugins();
        // Reset form inputs after 2s
        setTimeout(() => {
          setIsDrawerOpen(false);
          setName("");
          setServerUrl("");
          setApiKey("");
          setTestResult(null);
        }, 2200);
      } else {
        setTestResult({
          success: false,
          message: data.error || "Connection failed. Verify the server endpoint and auth token.",
        });
      }
    } catch (err) {
      setTestResult({
        success: false,
        message: `Network error: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setTesting(false);
    }
  };

  const handleDeletePlugin = async (id: string) => {
    try {
      const res = await fetch(`/api/mcp/connect?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setPlugins((prev) => prev.filter((p) => p.id !== id));
      }
    } catch {
      // Ignored
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-[#333333] bg-[#0B1220] p-5 backdrop-blur-xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-electric/15 text-electric ring-1 ring-electric/30">
            <Plug className="h-6 w-6" />
          </div>
          <div>
            <h2 className="font-heading text-base font-semibold text-white flex items-center gap-2">
              BYO-MCP Plugin Hub
              <span className="inline-flex items-center gap-1 rounded-full bg-electric/15 px-2 py-0.5 text-[10px] font-bold text-electric ring-1 ring-electric/30">
                <Sparkles className="h-3 w-3" /> Auto-Bound Broker
              </span>
            </h2>
            <p className="text-xs text-[#CCCCCC] mt-0.5 font-inter">
              Connect external Model Context Protocol (MCP) servers via SSE/HTTP. Safe tool broker auto-binds discovered capabilities across the agent network.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setIsDrawerOpen(true);
            setTestResult(null);
          }}
          className="flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#0078FF] to-[#FFC432] px-5 py-2.5 text-xs font-bold font-inter text-white shadow-lg shadow-[#0078FF]/20 hover:brightness-110 active:scale-95 transition-all shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>Add Custom MCP Server →</span>
        </button>
      </div>

      {/* Connected Plugins List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#CCCCCC] flex items-center gap-1.5 font-inter">
            <Server className="h-3.5 w-3.5 text-electric" /> Connected Custom MCP Servers ({plugins.length})
          </h3>
          <button
            type="button"
            onClick={() => void loadPlugins()}
            className="flex items-center gap-1 text-[11px] text-[#CCCCCC] hover:text-electric transition-colors"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center rounded-2xl border border-[#333333] bg-[#111c34]/50 p-8">
            <Loader2 className="h-5 w-5 animate-spin text-electric" />
          </div>
        ) : plugins.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#333333] bg-[#111c34]/40 p-10 text-center">
            <Plug className="h-8 w-8 text-[#CCCCCC]/60 mb-2 opacity-60" />
            <p className="text-sm font-medium text-white font-inter">No custom MCP servers connected yet</p>
            <p className="text-xs text-[#CCCCCC] max-w-sm mt-1 font-inter">
              Click &quot;Add Custom MCP Server →&quot; to connect any SSE or HTTP endpoint and auto-discover its tool catalog.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {plugins.map((plugin) => (
              <div
                key={plugin.id}
                className="group relative rounded-2xl border border-[#333333] bg-[#0B1220] p-4 shadow-lg backdrop-blur-md hover:border-electric/50 transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-3 w-3 rounded-full bg-emerald animate-pulse shadow-sm shadow-emerald/50" />
                    <div>
                      <h4 className="font-heading text-sm font-semibold text-white">{plugin.name}</h4>
                      <p className="text-[11px] font-mono text-[#CCCCCC] mt-0.5 flex items-center gap-1 truncate max-w-[220px]">
                        <Globe className="h-3 w-3 shrink-0 text-slate-500" /> {plugin.serverUrl}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleDeletePlugin(plugin.id)}
                    title="Disconnect MCP server"
                    className="rounded-lg p-1.5 text-[#CCCCCC] hover:bg-crimson/15 hover:text-crimson transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-3 flex items-center gap-2 border-t border-[#333333] pt-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-medium text-white bg-electric/15 border border-electric/30">
                    <span className="h-1.5 w-1.5 rounded-full bg-electric" />
                    Auto-Bound
                  </span>
                  <span className="text-[10px] text-[#CCCCCC] font-inter">
                    {plugin.detectedTools.length} {plugin.detectedTools.length === 1 ? "tool" : "tools"} detected
                  </span>
                </div>

                {/* Discovered Tools Chips */}
                {plugin.detectedTools.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {plugin.detectedTools.map((tool) => (
                      <span
                        key={tool.name}
                        className="inline-flex items-center gap-1 rounded bg-[#111c34] px-2 py-0.5 font-mono text-[10px] text-sky-300 border border-[#333333]"
                      >
                        <Zap className="h-2.5 w-2.5 text-electric" />
                        {tool.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Custom MCP Server Drawer / Modal */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-2xl border border-[#333333] bg-[#0B1220] p-6 text-white shadow-2xl animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#333333] pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-electric/15 text-electric ring-1 ring-electric/30">
                  <Plug className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-heading text-base font-semibold text-white">Add Custom MCP Server</h3>
                  <p className="text-xs text-[#CCCCCC] font-inter">Discover and auto-bind tools via the safe tool broker</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                className="rounded-lg p-1 text-[#CCCCCC] hover:bg-[#333333] hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleTestAndConnect} className="mt-4 space-y-4">
              {/* Server Name */}
              <div>
                <label className="block text-xs font-semibold text-[#CCCCCC] mb-1.5 font-inter">
                  Server Name <span className="text-electric">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Postgres DB MCP or Custom CRM Engine"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-[#333333] bg-[#111c34] px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 focus:border-electric focus:outline-none focus:ring-1 focus:ring-electric/30"
                />
              </div>

              {/* Endpoint URL */}
              <div>
                <label className="block text-xs font-semibold text-[#CCCCCC] mb-1.5 font-inter">
                  Endpoint URL (SSE or HTTP) <span className="text-electric">*</span>
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://mcp.internal.acme.com/sse or http://localhost:8000/sse"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  className="w-full rounded-xl border border-[#333333] bg-[#111c34] px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 focus:border-electric focus:outline-none focus:ring-1 focus:ring-electric/30 font-mono"
                />
              </div>

              {/* Optional Auth Token */}
              <div>
                <label className="block text-xs font-semibold text-[#CCCCCC] mb-1.5 flex items-center justify-between font-inter">
                  <span>Bearer Token / API Key <span className="text-slate-500 font-normal">(Optional)</span></span>
                  <Key className="h-3 w-3 text-[#CCCCCC]" />
                </label>
                <input
                  type="password"
                  placeholder="Secret token or API key for Authorization header"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full rounded-xl border border-[#333333] bg-[#111c34] px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 focus:border-electric focus:outline-none focus:ring-1 focus:ring-electric/30 font-mono"
                />
              </div>

              {/* Feedback State */}
              {testResult && (
                <div
                  className={`rounded-xl border p-3 text-xs ${
                    testResult.success
                      ? "border-emerald/40 bg-emerald/10 text-emerald"
                      : "border-crimson/40 bg-crimson/10 text-crimson"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {testResult.success ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className="font-semibold">{testResult.message}</p>
                      {testResult.tools && testResult.tools.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {testResult.tools.map((t) => (
                            <span
                              key={t.name}
                              className="rounded bg-emerald/20 px-2 py-0.5 font-mono text-[10px] text-emerald-300"
                            >
                              {t.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#333333]">
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-[#CCCCCC] hover:bg-[#333333] hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={testing || !name.trim() || !serverUrl.trim()}
                  className="flex items-center gap-2 rounded-full bg-gradient-to-r from-[#0078FF] to-[#FFC432] px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-[#0078FF]/20 hover:brightness-110 active:scale-95 disabled:opacity-50 transition-all font-inter"
                >
                  {testing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Probing &amp; Auto-Detecting...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Test &amp; Auto-Detect →
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
