"use client";

import { useEffect, useState } from "react";
import { agents as seedAgents, type Agent } from "@/lib/agents";

const POLL_INTERVAL_MS = 5000;

/** Live agent roster (real status + lastRun from agentStore.ts via
 *  GET /api/agents), polled the same way ExecutiveFunnel/Workspace already
 *  poll /api/jobs. Seeded with the static roster for an instant,
 *  hydration-safe first paint, then replaced with live data after mount —
 *  shared here so Sidebar, the dashboard roster list, and the Executive
 *  Funnel all show the same real activity instead of three separate copies
 *  of "Never run". */
export function useLiveAgents(): Agent[] {
  const [liveAgents, setLiveAgents] = useState<Agent[]>(seedAgents);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/agents");
        if (!cancelled && res.ok) {
          const data: { agents: Agent[] } = await res.json();
          setLiveAgents(data.agents);
        }
      } catch {
        // best-effort refresh — keep whatever was last shown
      }
    }

    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return liveAgents;
}
