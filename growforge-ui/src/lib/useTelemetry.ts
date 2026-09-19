"use client";

import { useCallback, useEffect, useState } from "react";
import type { TelemetrySnapshot } from "@/lib/telemetryStore";

const DEFAULT_SNAPSHOT: TelemetrySnapshot = {
  executionState: "idle",
  activeJobId: null,
  activeNodeId: null,
  activeLobe: "neural_core",
  activeAction: null,
  progressPct: 0,
  totalToolInvocations: 0,
  successfulToolInvocations: 0,
  connectedMcpCount: 0,
  publicToolsCount: 0,
  recentEvents: [],
  updatedAt: new Date().toISOString(),
};

export function useTelemetry(intervalMs = 3000) {
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot>(DEFAULT_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTelemetry = useCallback(async () => {
    try {
      const res = await fetch("/api/telemetry");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as TelemetrySnapshot;
      setTelemetry(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load telemetry");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const res = await fetch("/api/telemetry");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as TelemetrySnapshot;
        if (mounted) {
          setTelemetry(data);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to load telemetry");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    const timer = window.setTimeout(() => {
      void load();
    }, 0);

    let intervalId: NodeJS.Timeout | undefined;
    if (intervalMs > 0) {
      intervalId = setInterval(() => {
        void load();
      }, intervalMs);
    }

    return () => {
      mounted = false;
      window.clearTimeout(timer);
      if (intervalId) clearInterval(intervalId);
    };
  }, [intervalMs]);

  return {
    telemetry,
    loading,
    error,
    refresh: fetchTelemetry,
  };
}
