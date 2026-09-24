"use client";

import React from "react";
import { ChevronDown } from "lucide-react";

export interface AgentTokens {
  agentId: string;
  agentName: string;
  deptId: string;
  deptName: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  modelUsed: string;
  toolsCalled: string[];
  duration: string;
  status: "active" | "done" | "waiting" | "blocked";
}

interface TokenLedgerProps {
  agents: AgentTokens[];
  totalTokens: number;
  totalCost: number;
  modelBreakdown: Record<string, number>; // model -> percentage
  deptBreakdown: Record<string, number>; // dept -> percentage
  expandedAgent?: string;
  onAgentClick?: (agentId: string) => void;
}

export function TokenLedger({
  agents,
  totalTokens,
  totalCost,
  modelBreakdown,
  deptBreakdown,
  expandedAgent,
  onAgentClick,
}: TokenLedgerProps) {
  // Group agents by department
  const byDept = agents.reduce(
    (acc, agent) => {
      if (!acc[agent.deptId]) acc[agent.deptId] = [];
      acc[agent.deptId].push(agent);
      return acc;
    },
    {} as Record<string, AgentTokens[]>
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "text-[#0078ff]";
      case "done":
        return "text-[#10b981]";
      case "waiting":
        return "text-[#f59e0b]";
      case "blocked":
        return "text-[#ef4444]";
      default:
        return "text-[#64748b]";
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case "active":
        return "bg-[#0078ff]/10";
      case "done":
        return "bg-[#10b981]/10";
      case "waiting":
        return "bg-[#f59e0b]/10";
      case "blocked":
        return "bg-[#ef4444]/10";
      default:
        return "bg-[#64748b]/10";
    }
  };

  return (
    <div className="absolute bottom-4 right-4 w-96 max-h-96 overflow-y-auto bg-white/90 border border-slate-200/80 rounded-lg shadow-lg backdrop-blur-md p-4 space-y-3 font-mono text-xs">
      {/* Header Summary */}
      <div className="pb-3 border-b border-slate-200/50">
        <div className="flex justify-between mb-2">
          <span className="text-slate-600">Total Tokens</span>
          <span className="font-bold text-slate-900">{totalTokens.toLocaleString()}</span>
        </div>
        <div className="flex justify-between mb-2">
          <span className="text-slate-600">Total Cost</span>
          <span className="font-bold text-slate-900">${totalCost.toFixed(2)}</span>
        </div>

        {/* Model Breakdown */}
        <div className="text-[10px] text-slate-500 mt-2 space-y-1">
          {Object.entries(modelBreakdown).map(([model, pct]) => (
            <div key={model} className="flex justify-between">
              <span>{model}</span>
              <span className="text-slate-600">{(pct * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Department Summary */}
      <div className="pb-3 border-b border-slate-200/50">
        <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-2">Cost by Dept</div>
        {Object.entries(deptBreakdown).map(([dept, pct]) => (
          <div key={dept} className="flex justify-between text-[10px] mb-1">
            <span className="text-slate-600">{dept}</span>
            <span className="text-slate-900">{(pct * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>

      {/* Agent Details by Department */}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {Object.entries(byDept).map(([deptId, deptAgents]) => (
          <div key={deptId} className="border border-slate-200/50 rounded p-2 space-y-1">
            <div className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
              {deptAgents[0]?.deptName}
            </div>

            {deptAgents.map((agent) => (
              <div
                key={agent.agentId}
                onClick={() => onAgentClick?.(agent.agentId)}
                className="cursor-pointer hover:bg-slate-50 p-1.5 rounded transition-colors"
              >
                <div className="flex justify-between items-start mb-0.5">
                  <span className={`font-semibold ${getStatusColor(agent.status)}`}>{agent.agentName}</span>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${getStatusBg(agent.status)} ${getStatusColor(agent.status)}`}
                  >
                    {agent.status.toUpperCase()}
                  </span>
                </div>

                <div className="space-y-0.5 text-[9px] text-slate-600 ml-2">
                  <div className="flex justify-between">
                    <span>Tokens:</span>
                    <span className="text-slate-900 font-semibold">{agent.totalTokens.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Input/Output:</span>
                    <span className="text-slate-900">{agent.inputTokens} / {agent.outputTokens}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cost:</span>
                    <span className="text-slate-900 font-semibold">${agent.costUsd.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Model:</span>
                    <span className="text-slate-900">{agent.modelUsed}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Duration:</span>
                    <span className="text-slate-900">{agent.duration}</span>
                  </div>

                  {/* Tools Called */}
                  {agent.toolsCalled.length > 0 && (
                    <div className="mt-1 pt-1 border-t border-slate-200/50">
                      <div className="text-slate-500 mb-0.5">Tools called:</div>
                      <div className="flex flex-wrap gap-1">
                        {agent.toolsCalled.map((tool) => (
                          <span key={tool} className="bg-slate-100 text-slate-700 px-1 py-0.5 rounded text-[8px]">
                            {tool}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Expanded Detail */}
                {expandedAgent === agent.agentId && (
                  <div className="mt-2 pt-2 border-t border-slate-200/50 text-[9px] text-slate-600 space-y-1">
                    <div className="bg-slate-50 p-1.5 rounded">
                      <div className="font-semibold text-slate-700 mb-1">Token Breakdown</div>
                      <div className="space-y-0.5">
                        <div>• Input context: ~{Math.round(agent.inputTokens * 0.4)} tokens (research summaries)</div>
                        <div>• Analysis synthesis: ~{Math.round(agent.inputTokens * 0.4)} tokens (LLM reasoning)</div>
                        <div>• Output formatting: ~{agent.outputTokens} tokens (report generation)</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
