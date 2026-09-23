"use client";

import React from "react";
import { X, FileText, ArrowRight, GitBranch, Calendar, Folder } from "lucide-react";
import type { GraphNode, GraphLink } from "@/lib/spatial/obsidianReader";
import { Markdown } from "@/components/ui/Markdown";

interface NoteReaderModalProps {
  node: GraphNode | null;
  allNodes: GraphNode[];
  allLinks: GraphLink[];
  onClose: () => void;
  onSelectNode: (node: GraphNode) => void;
}

export function NoteReaderModal({
  node,
  allNodes,
  allLinks,
  onClose,
  onSelectNode,
}: NoteReaderModalProps) {
  if (!node) return null;

  // Find direct connections
  const connectedNodeIds = new Set<string>();
  allLinks.forEach((link) => {
    const srcId = typeof link.source === "object" ? (link.source as { id: string }).id : link.source;
    const tgtId = typeof link.target === "object" ? (link.target as { id: string }).id : link.target;
    if (srcId === node.id) connectedNodeIds.add(tgtId);
    if (tgtId === node.id) connectedNodeIds.add(srcId);
  });

  const connectedNodes = allNodes.filter((n) => connectedNodeIds.has(n.id));

  // A floating holographic HUD readout docked to the top-right — corner
  // brackets, glowing edge, segmented tick-mark dividers, uppercase mono
  // labels — closer to a sci-fi instrument panel than a plain settings card.
  // The Live Telemetry dock (same top-right edge, mid-screen) fades out
  // while this is open (see SpatialHud's isNoteOpen prop), so this can use
  // most of the vertical space without silently covering it.
  return (
    <div className="fixed z-30 top-20 bottom-24 right-6 w-full max-w-md pointer-events-none flex items-stretch animate-in fade-in slide-in-from-right-8 duration-300">
      <div
        className="pointer-events-auto relative flex flex-col w-full rounded-lg bg-[#050b16]/80 border border-cyan-400/25 shadow-[0_0_1px_rgba(56,189,248,0.4),0_0_50px_rgba(56,189,248,0.12)] overflow-hidden backdrop-blur-xl text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Corner brackets — the holographic-instrument-panel signature */}
        <span className="pointer-events-none absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-cyan-300/80 z-10" />
        <span className="pointer-events-none absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-cyan-300/80 z-10" />
        <span className="pointer-events-none absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-cyan-300/80 z-10" />
        <span className="pointer-events-none absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-cyan-300/80 z-10" />
        {/* Thin animated scan line under the top edge */}
        <div className="pointer-events-none absolute top-0 inset-x-4 h-px bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent animate-pulse" />

        {/* Header */}
        <div className="relative px-5 pt-4 pb-3 border-b border-cyan-400/20 bg-cyan-400/[0.03]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="flex items-center justify-center w-10 h-10 border shrink-0"
                style={{ backgroundColor: `${node.color}18`, borderColor: `${node.color}55` }}
              >
                <FileText className="w-5 h-5" style={{ color: node.color }} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.15em]">
                  <span style={{ color: node.color }}>{node.categoryLabel}</span>
                  <span className="text-slate-600">{"//"}</span>
                  <span className="flex items-center gap-1 text-cyan-300/70">
                    <GitBranch className="w-3 h-3" />
                    {node.degree} links
                  </span>
                </div>
                <h2 className="text-base font-bold text-white truncate font-heading mt-1 tracking-wide">
                  {node.title}
                </h2>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 border border-cyan-400/20 text-cyan-300/70 hover:text-white hover:border-cyan-300/60 hover:bg-cyan-400/10 transition-colors shrink-0"
              title="Close reader (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {/* Tick-mark ruler divider */}
          <div className="flex gap-[3px] mt-3 -mb-3 opacity-60">
            {Array.from({ length: 48 }).map((_, i) => (
              <span key={i} className={`h-1.5 w-px ${i % 4 === 0 ? "bg-cyan-300/70 h-2" : "bg-cyan-300/25"}`} />
            ))}
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6 custom-scrollbar">
          {/* Metadata readout strip */}
          <div className="grid grid-cols-1 gap-1.5 text-[11px] font-mono uppercase tracking-wider">
            {node.lastModified && (
              <div className="flex items-center justify-between px-2.5 py-1.5 bg-cyan-400/[0.04] border-l-2 border-cyan-400/40">
                <span className="flex items-center gap-1.5 text-slate-500">
                  <Calendar className="w-3 h-3" /> Modified
                </span>
                <span className="text-slate-300">
                  {new Date(node.lastModified).toLocaleDateString(undefined, { dateStyle: "medium" })}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-cyan-400/[0.04] border-l-2 border-cyan-400/40">
              <span className="flex items-center gap-1.5 text-slate-500 shrink-0">
                <Folder className="w-3 h-3" /> Source
              </span>
              <span className="truncate text-slate-300 normal-case" title={node.path}>
                {node.path}
              </span>
            </div>
          </div>

          {/* Markdown renderer */}
          <div className="prose prose-invert prose-sm max-w-none text-slate-200 prose-headings:font-mono prose-headings:text-cyan-200 prose-headings:uppercase prose-headings:tracking-wide prose-headings:text-xs prose-strong:text-white">
            {node.content ? (
              <Markdown content={node.content} size="base" />
            ) : (
              <p className="text-sm italic text-slate-400">{node.excerpt}</p>
            )}
          </div>

          {/* Direct Graph Connections (Obsidian style) */}
          {connectedNodes.length > 0 && (
            <div className="pt-4 border-t border-cyan-400/15">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-cyan-300/80 mb-3 flex items-center gap-1.5 font-mono">
                <GitBranch className="w-3.5 h-3.5" />
                Direct Graph Connections ({connectedNodes.length})
              </h3>
              <div className="grid grid-cols-1 gap-2">
                {connectedNodes.map((target) => (
                  <button
                    key={target.id}
                    onClick={() => onSelectNode(target)}
                    className="flex items-center justify-between p-3 bg-cyan-400/[0.03] hover:bg-cyan-400/[0.08] border border-cyan-400/10 hover:border-cyan-300/40 transition-all text-left group"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="text-sm font-medium text-white group-hover:text-cyan-300 truncate">
                        {target.title}
                      </p>
                      <p className="text-[11px] text-slate-500 font-mono uppercase tracking-wide">
                        {target.categoryLabel} &bull; {target.degree} links
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-cyan-400/40 group-hover:text-cyan-300 group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="relative flex items-center justify-between px-5 py-2.5 border-t border-cyan-400/20 bg-cyan-400/[0.03] text-[10px] text-cyan-300/60 font-mono uppercase tracking-[0.15em]">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            Obsidian Node
          </span>
          <span className="text-slate-600">Click connection to navigate</span>
        </div>
      </div>
    </div>
  );
}
