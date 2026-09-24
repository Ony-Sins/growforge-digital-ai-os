"use client";

import { useState, useEffect, useCallback } from "react";
import {
  type UsageRecord,
  type JobUsageSummary,
  summarizeUsage,
  formatTokens,
  formatUsd,
  formatBdt,
  formatDuration,
  estimateCost,
} from "@/lib/usage";

interface StepUsageEntry {
  stepId: string;
  stepLabel: string;
  records: UsageRecord[];
}

interface UsageApiResponse {
  jobId: string;
  jobTitle: string;
  jobStatus: string;
  stepUsage: StepUsageEntry[];
  summary: JobUsageSummary;
}

/** Compact usage badge — shows total tokens + cost in a single line,
 *  expandable to a full per-step breakdown. */
export function JobUsageBadge({ jobId }: { jobId: string }) {
  const [data, setData] = useState<UsageApiResponse | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/${jobId}/usage`);
      if (!res.ok) return;
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load usage");
    }
  }, [jobId]);

  useEffect(() => {
    const timer = setTimeout(() => void fetchUsage(), 0);
    return () => clearTimeout(timer);
  }, [fetchUsage]);

  if (error || !data || data.summary.totalCalls === 0) return null;

  const { summary } = data;
  const totalTokens = summary.totalInputTokens + summary.totalOutputTokens;

  return (
    <div className="usage-badge" style={{ marginTop: 12 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="usage-badge__toggle"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 8,
          padding: "6px 12px",
          color: "rgba(255,255,255,0.7)",
          cursor: "pointer",
          fontSize: 12,
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          textAlign: "left",
        }}
      >
        <span style={{ opacity: 0.5 }}>⚡</span>
        <span>
          {summary.totalCalls} LLM call{summary.totalCalls !== 1 ? "s" : ""}
          {" · "}
          {formatTokens(totalTokens)} tokens
          {" · "}
          {formatDuration(summary.totalDurationMs)}
          {summary.totalCostUsd !== null && (
            <>
              {" · "}
              <span style={{ color: summary.totalCostUsd === 0 ? "#4ade80" : "#facc15" }}>
                {formatUsd(summary.totalCostUsd)}
              </span>
            </>
          )}
        </span>
        <span style={{ marginLeft: "auto", opacity: 0.4, fontSize: 10 }}>
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div
          style={{
            background: "rgba(0,0,0,0.3)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderTop: "none",
            borderRadius: "0 0 8px 8px",
            padding: "12px",
            fontSize: 12,
          }}
        >
          {/* Per-step breakdown */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ color: "rgba(255,255,255,0.5)", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", fontSize: 10, letterSpacing: 1 }}>
              Per-step breakdown
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>
                  <th style={{ textAlign: "left", padding: "2px 6px" }}>Step</th>
                  <th style={{ textAlign: "left", padding: "2px 6px" }}>Model</th>
                  <th style={{ textAlign: "right", padding: "2px 6px" }}>In</th>
                  <th style={{ textAlign: "right", padding: "2px 6px" }}>Out</th>
                  <th style={{ textAlign: "right", padding: "2px 6px" }}>Time</th>
                  <th style={{ textAlign: "right", padding: "2px 6px" }}>Cost</th>
                </tr>
              </thead>
              <tbody>
                {data.stepUsage.map((su) =>
                  su.records.map((r, i) => {
                    const cost = estimateCost(r);
                    return (
                      <tr key={`${su.stepId}-${i}`} style={{ color: "rgba(255,255,255,0.7)" }}>
                        <td style={{ padding: "3px 6px" }}>{su.stepLabel}</td>
                        <td style={{ padding: "3px 6px", color: "rgba(255,255,255,0.45)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.model}
                        </td>
                        <td style={{ textAlign: "right", padding: "3px 6px" }}>
                          {r.inputTokens !== null ? formatTokens(r.inputTokens) : "—"}
                        </td>
                        <td style={{ textAlign: "right", padding: "3px 6px" }}>
                          {r.outputTokens !== null ? formatTokens(r.outputTokens) : "—"}
                        </td>
                        <td style={{ textAlign: "right", padding: "3px 6px", color: "rgba(255,255,255,0.4)" }}>
                          {formatDuration(r.durationMs)}
                        </td>
                        <td style={{ textAlign: "right", padding: "3px 6px" }}>
                          {cost.usd !== null ? (
                            <span style={{ color: cost.usd === 0 ? "#4ade80" : "#facc15" }}>
                              {formatUsd(cost.usd)}
                            </span>
                          ) : cost.known ? (
                            <span style={{ color: "rgba(255,255,255,0.3)" }}>not reported</span>
                          ) : (
                            <span style={{ color: "rgba(255,255,255,0.3)" }}>cost unknown</span>
                          )}
                        </td>
                      </tr>
                    );
                  }),
                )}
              </tbody>
            </table>
          </div>

          {/* Provider totals */}
          {summary.providers.length > 0 && (
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10 }}>
              <div style={{ color: "rgba(255,255,255,0.5)", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", fontSize: 10, letterSpacing: 1 }}>
                Provider totals
              </div>
              {summary.providers.map((p) => (
                <div
                  key={`${p.provider}::${p.model}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "3px 0",
                    color: "rgba(255,255,255,0.65)",
                  }}
                >
                  <span>
                    <strong>{p.provider}</strong>
                    <span style={{ color: "rgba(255,255,255,0.35)", marginLeft: 4, fontSize: 11 }}>
                      ({p.model})
                    </span>
                  </span>
                  <span>
                    {p.calls} call{p.calls !== 1 ? "s" : ""}
                    {" · "}
                    {formatTokens(p.totalInputTokens + p.totalOutputTokens)}
                    {p.estimatedCostUsd !== null && (
                      <>
                        {" · "}
                        <span style={{ color: p.estimatedCostUsd === 0 ? "#4ade80" : "#facc15" }}>
                          {formatUsd(p.estimatedCostUsd)}
                        </span>
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Grand total */}
          <div
            style={{
              borderTop: "1px solid rgba(255,255,255,0.08)",
              marginTop: 8,
              paddingTop: 8,
              display: "flex",
              justifyContent: "space-between",
              fontWeight: 600,
              color: "rgba(255,255,255,0.85)",
            }}
          >
            <span>Total</span>
            <span>
              {formatTokens(totalTokens)} tokens
              {summary.totalCostUsd !== null && (
                <>
                  {" — "}
                  <span style={{ color: summary.totalCostUsd === 0 ? "#4ade80" : "#facc15" }}>
                    {formatUsd(summary.totalCostUsd)}
                  </span>
                  {summary.totalCostBdt !== null && (
                    <span style={{ color: "rgba(255,255,255,0.4)", marginLeft: 6, fontWeight: 400 }}>
                      ({formatBdt(summary.totalCostBdt)})
                    </span>
                  )}
                </>
              )}
              {!summary.allCostsKnown && (
                <span style={{ color: "rgba(255,255,255,0.3)", marginLeft: 6, fontWeight: 400, fontSize: 11 }}>
                  (some models have unknown cost)
                </span>
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Inline usage summary for completion messages / inbox notifications. */
export function UsageSummaryInline({ records }: { records: UsageRecord[] }) {
  if (records.length === 0) return null;
  const summary = summarizeUsage(records);
  const totalTokens = summary.totalInputTokens + summary.totalOutputTokens;

  return (
    <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
      ⚡ {summary.totalCalls} LLM call{summary.totalCalls !== 1 ? "s" : ""}
      {" · "}{formatTokens(totalTokens)} tokens
      {" · "}{formatDuration(summary.totalDurationMs)}
      {summary.totalCostUsd !== null && (
        <>
          {" · "}
          <span style={{ color: summary.totalCostUsd === 0 ? "#4ade80" : "#facc15" }}>
            {formatUsd(summary.totalCostUsd)}
          </span>
          {summary.totalCostBdt !== null && (
            <span style={{ opacity: 0.6 }}> ({formatBdt(summary.totalCostBdt)})</span>
          )}
        </>
      )}
    </span>
  );
}
