"use client";

import { useMemo, useState } from "react";
import {
  BadgeDollarSign,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Code2,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Filter,
  Globe,
  Layers,
  Megaphone,
  MousePointerClick,
  Palette,
  Search,
  ShieldCheck,
  Target,
  Trophy,
  Users,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Job, JobStep } from "@/lib/jobStore";
import { Markdown } from "@/components/ui/Markdown";

const DEPT_NAMES: Record<string, string> = {
  "sales-bd": "Revenue & Business Development",
  marketing: "Marketing & Brand Strategy",
  "meta-ads": "Paid Media & Performance Advertising",
  "finance-ops": "Finance & Operations",
  "client-success": "Client Success & Program Management",
  "web-design": "Digital Design & User Experience",
  "web-dev": "Web Development & Engineering",
  "ai-automation": "AI Systems & Intelligent Automation",
};

const DEPT_ICONS: Record<string, LucideIcon> = {
  "sales-bd": Target,
  marketing: Megaphone,
  "meta-ads": MousePointerClick,
  "finance-ops": BadgeDollarSign,
  "client-success": ClipboardList,
  "web-design": Palette,
  "web-dev": Code2,
  "ai-automation": Workflow,
};

const KIND_ICONS: Record<JobStep["kind"], LucideIcon> = {
  brief: FileText,
  plan: Building2,
  research: Globe,
  department: Users,
  reconcile: Users,
  qa: ShieldCheck,
  final: Trophy,
};

const KIND_LABELS: Record<JobStep["kind"], string> = {
  brief: "Original Brief",
  plan: "HQ Strategic Plan",
  research: "Live Web Research",
  department: "Specialist Department",
  reconcile: "HQ Cross-Department Review",
  qa: "Independent QA Audit",
  final: "Executive Final Proposal",
};

interface MasterFindingsViewProps {
  job: Job;
  onClose?: () => void;
  onOpenFinalPlan?: () => void;
}

export function MasterFindingsView({ job, onClose, onOpenFinalPlan }: MasterFindingsViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedKind, setSelectedKind] = useState<string>("all");
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedStepId, setCopiedStepId] = useState<string | null>(null);
  const [viewTab, setViewTab] = useState<"rollup" | "departments" | "audit">("rollup");

  // All relevant findings steps that produced real output
  const outputSteps = useMemo(() => {
    return job.steps.filter((s) => s.output && s.output.trim().length > 0);
  }, [job.steps]);

  // Aggregate genuine metrics from existing real state
  const metrics = useMemo(() => {
    const deptSteps = outputSteps.filter((s) => s.kind === "department");
    const totalWords = outputSteps.reduce((acc, s) => acc + (s.output ? s.output.split(/\s+/).length : 0), 0) +
      (job.finalOutput ? job.finalOutput.split(/\s+/).length : 0);
    
    const uniqueSources = new Map<string, string>();
    for (const step of outputSteps) {
      if (step.sources) {
        for (const src of step.sources) {
          if (src.uri) uniqueSources.set(src.uri, src.title || src.uri);
        }
      }
    }
    if (job.dossierSnapshot?.sources) {
      for (const src of job.dossierSnapshot.sources) {
        if (src.uri) uniqueSources.set(src.uri, src.title || src.uri);
      }
    }

    const providers = Array.from(
      new Set(outputSteps.map((s) => s.provider).filter(Boolean))
    ) as string[];

    const executionDurationMs =
      job.finishedAt && job.createdAt
        ? new Date(job.finishedAt).getTime() - new Date(job.createdAt).getTime()
        : null;

    return {
      departmentCount: deptSteps.length,
      totalStepsWithOutput: outputSteps.length,
      totalWords,
      verifiedSourcesCount: uniqueSources.size,
      providers,
      executionDurationMs,
      hasQa: outputSteps.some((s) => s.kind === "qa"),
      hasResearch: job.verified || uniqueSources.size > 0,
      revisionsCount: job.revisions?.length ?? 0,
    };
  }, [outputSteps, job]);

  // Filtered steps based on search query and kind filter
  const filteredSteps = useMemo(() => {
    return outputSteps.filter((step) => {
      if (selectedKind !== "all" && step.kind !== selectedKind) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const matchLabel = step.label.toLowerCase().includes(q);
      const matchActivity = step.activity.toLowerCase().includes(q);
      const matchOutput = step.output ? step.output.toLowerCase().includes(q) : false;
      const matchDept = step.departmentId ? step.departmentId.toLowerCase().includes(q) : false;
      return matchLabel || matchActivity || matchOutput || matchDept;
    });
  }, [outputSteps, selectedKind, searchQuery]);

  function isStepExpanded(stepId: string): boolean {
    return expandedSteps[stepId] ?? true; // default expanded
  }

  function toggleStep(stepId: string) {
    setExpandedSteps((prev) => ({
      ...prev,
      [stepId]: !isStepExpanded(stepId),
    }));
  }

  function expandAll() {
    const next: Record<string, boolean> = {};
    for (const s of outputSteps) next[s.id] = true;
    setExpandedSteps(next);
  }

  function collapseAll() {
    const next: Record<string, boolean> = {};
    for (const s of outputSteps) next[s.id] = false;
    setExpandedSteps(next);
  }

  // Compile entire master findings dossier into clean markdown
  function compileConsolidatedMarkdown(): string {
    const lines: string[] = [];
    lines.push(`# Master Cross-Agent Findings & Audit Dossier: ${job.title}`);
    lines.push("");
    lines.push(`- **Status:** ${job.status.toUpperCase()}`);
    lines.push(`- **Created:** ${new Date(job.createdAt).toLocaleString()}`);
    if (job.finishedAt) lines.push(`- **Completed:** ${new Date(job.finishedAt).toLocaleString()}`);
    if (job.approvedAt) lines.push(`- **Approved:** ${new Date(job.approvedAt).toLocaleString()} by ${job.approvedBy || "CEO"}`);
    lines.push(`- **Research Verified:** ${job.verified ? "Yes (Ground truth web search)" : "No"}`);
    lines.push(`- **Contributing Departments:** ${metrics.departmentCount} specialist departments`);
    lines.push("");
    lines.push("---");
    lines.push("");

    if (job.brief) {
      lines.push("## 1. Original Client Brief");
      lines.push("");
      lines.push(job.brief.trim());
      lines.push("");
      lines.push("---");
      lines.push("");
    }

    if (job.finalOutput) {
      lines.push("## 2. Executive Synthesis & Final Plan");
      lines.push("");
      lines.push(job.finalOutput.trim());
      lines.push("");
      lines.push("---");
      lines.push("");
    }

    lines.push("## 3. Department-by-Department Findings & Technical Deliverables");
    lines.push("");

    for (const step of outputSteps) {
      const deptName = step.departmentId
        ? DEPT_NAMES[step.departmentId] || step.label
        : step.label;

      lines.push(`### ${deptName} (${KIND_LABELS[step.kind] || step.kind})`);
      lines.push(`*Focus: ${step.activity}*`);
      if (step.provider) lines.push(`*Engine: ${step.provider}*`);
      if (step.instructionsHash) lines.push(`*Rule Hash: \`${step.instructionsHash}\`*`);
      lines.push("");
      lines.push((step.output || "").trim());
      lines.push("");

      if (step.sources && step.sources.length > 0) {
        lines.push("**Referenced Sources:**");
        for (const src of step.sources) {
          lines.push(`- [${src.title || src.uri}](${src.uri})`);
        }
        lines.push("");
      }
      lines.push("---");
      lines.push("");
    }

    return lines.join("\n");
  }

  function handleCopyAll() {
    const fullText = compileConsolidatedMarkdown();
    navigator.clipboard.writeText(fullText).then(() => {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2500);
    });
  }

  function handleDownloadMarkdown() {
    const fullText = compileConsolidatedMarkdown();
    const blob = new Blob([fullText], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `master-findings-${job.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "project"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleCopyStep(stepId: string, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedStepId(stepId);
      setTimeout(() => setCopiedStepId(null), 2000);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-150">
      <div className="relative flex h-full max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[#333333] bg-[#0B1220] shadow-2xl">
        {/* Top Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#333333] bg-[#111827] px-6 py-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-electric/20 to-gold/20 text-electric border border-electric/30">
              <Layers className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="truncate font-heading text-base font-semibold text-white">
                  Master Cross-Agent Findings
                </h2>
                <span className="rounded bg-electric/15 px-2 py-0.5 text-[10px] font-bold text-electric border border-electric/30">
                  CONSOLIDATED AUDIT
                </span>
                {job.verified && (
                  <span className="rounded bg-emerald/15 px-2 py-0.5 text-[10px] font-semibold text-emerald border border-emerald/30 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Research-Backed
                  </span>
                )}
                {job.approvedAt && (
                  <span className="rounded bg-emerald/15 px-2 py-0.5 text-[10px] font-semibold text-emerald border border-emerald/30 flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3" /> Approved
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-white/70 mt-0.5">
                {job.title} · {metrics.departmentCount} departments contributing real deliverables
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {onOpenFinalPlan && job.finalOutput && (
              <button
                type="button"
                onClick={onOpenFinalPlan}
                className="hidden sm:flex items-center gap-1.5 rounded-lg border border-[#333333] bg-[#0B1220] px-3 py-1.5 text-xs font-medium text-white hover:border-gold/50 hover:bg-gold/10 hover:text-gold transition-colors"
              >
                <Trophy className="h-3.5 w-3.5 text-gold" /> Final Plan
              </button>
            )}

            <button
              type="button"
              onClick={handleCopyAll}
              className="flex items-center gap-1.5 rounded-lg border border-[#333333] bg-[#0B1220] px-3 py-1.5 text-xs font-medium text-white hover:border-electric/50 hover:bg-electric/10 transition-colors"
              title="Copy entire cross-agent dossier in Markdown"
            >
              {copiedAll ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedAll ? "Copied All" : "Copy Dossier"}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadMarkdown}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-electric to-gold px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-95 transition-opacity"
            >
              <Download className="h-3.5 w-3.5" /> Download (.md)
            </button>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-lg p-1.5 text-muted hover:bg-[#1F2937] hover:text-white transition-colors ml-1"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {/* Real-Data Executive Metric Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5 border-b border-[#333333] bg-[#0B1220] p-4 shrink-0">
          <div className="rounded-xl border border-[#333333] bg-[#111827] p-2.5">
            <span className="text-[10px] uppercase font-semibold text-muted tracking-wider block">Departments</span>
            <span className="text-base font-bold text-white mt-0.5 block">{metrics.departmentCount} Active</span>
          </div>
          <div className="rounded-xl border border-[#333333] bg-[#111827] p-2.5">
            <span className="text-[10px] uppercase font-semibold text-muted tracking-wider block">Verified Sources</span>
            <span className="text-base font-bold text-emerald mt-0.5 block">{metrics.verifiedSourcesCount} Cited</span>
          </div>
          <div className="rounded-xl border border-[#333333] bg-[#111827] p-2.5">
            <span className="text-[10px] uppercase font-semibold text-muted tracking-wider block">Words Produced</span>
            <span className="text-base font-bold text-electric mt-0.5 block">~{metrics.totalWords.toLocaleString()}</span>
          </div>
          <div className="rounded-xl border border-[#333333] bg-[#111827] p-2.5">
            <span className="text-[10px] uppercase font-semibold text-muted tracking-wider block">QA Verification</span>
            <span className={`text-base font-bold mt-0.5 block ${metrics.hasQa ? "text-emerald" : "text-gold"}`}>
              {metrics.hasQa ? "Passed" : "Standard"}
            </span>
          </div>
          <div className="rounded-xl border border-[#333333] bg-[#111827] p-2.5">
            <span className="text-[10px] uppercase font-semibold text-muted tracking-wider block">Engine Footprint</span>
            <span className="text-xs font-mono font-medium text-white truncate mt-1 block">
              {metrics.providers.join(", ") || "Cloud / Local"}
            </span>
          </div>
          <div className="rounded-xl border border-[#333333] bg-[#111827] p-2.5">
            <span className="text-[10px] uppercase font-semibold text-muted tracking-wider block">Governance State</span>
            <span className="text-xs font-semibold text-white mt-1 block truncate">
              {job.approvedAt ? `Approved (${job.approvedBy || "CEO"})` : "Pending Signoff"}
            </span>
          </div>
        </div>

        {/* Toolbar & Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#333333] bg-[#0B1220]/80 px-6 py-2.5 shrink-0">
          {/* View Mode Tabs */}
          <div className="flex items-center gap-1.5 rounded-lg border border-[#333333] bg-[#111827] p-1">
            <button
              type="button"
              onClick={() => setViewTab("rollup")}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                viewTab === "rollup" ? "bg-electric text-white" : "text-muted hover:text-white"
              }`}
            >
              Rollup Dossier
            </button>
            <button
              type="button"
              onClick={() => setViewTab("departments")}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                viewTab === "departments" ? "bg-electric text-white" : "text-muted hover:text-white"
              }`}
            >
              Department Grid
            </button>
            <button
              type="button"
              onClick={() => setViewTab("audit")}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                viewTab === "audit" ? "bg-electric text-white" : "text-muted hover:text-white"
              }`}
            >
              Audit & Provenance
            </button>
          </div>

          {/* Search & Accordion Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search findings text…"
                className="w-44 sm:w-56 rounded-lg border border-[#333333] bg-[#111827] py-1 pl-8 pr-3 text-xs text-white placeholder:text-muted outline-none focus:border-electric/50"
              />
            </div>

            <select
              value={selectedKind}
              onChange={(e) => setSelectedKind(e.target.value)}
              className="rounded-lg border border-[#333333] bg-[#111827] px-2.5 py-1 text-xs text-white outline-none focus:border-electric/50"
            >
              <option value="all">All Deliverables</option>
              <option value="department">Departments Only</option>
              <option value="research">Research Only</option>
              <option value="qa">QA Audit Only</option>
              <option value="plan">HQ Plan Only</option>
            </select>

            <button
              type="button"
              onClick={expandAll}
              className="rounded-lg border border-[#333333] bg-[#111827] px-2.5 py-1 text-[11px] font-medium text-secondary hover:text-white"
            >
              Expand All
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="rounded-lg border border-[#333333] bg-[#111827] px-2.5 py-1 text-[11px] font-medium text-secondary hover:text-white"
            >
              Collapse
            </button>
          </div>
        </div>

        {/* Scrollable Findings Body */}
        <div className="flex-1 overflow-y-auto bg-[#0B1220] p-6 space-y-6">
          {/* TAB 1: CONSOLIDATED ROLLUP DOSSIER */}
          {viewTab === "rollup" && (
            <div className="space-y-6 max-w-5xl mx-auto">
              {/* Brief Summary Box */}
              {job.brief && (
                <div className="rounded-xl border border-[#333333] bg-[#111827]/70 p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-gold font-semibold text-xs uppercase tracking-wider mb-2">
                    <FileText className="h-4 w-4" /> Original Task Brief
                  </div>
                  <p className="text-xs text-white leading-relaxed font-sans whitespace-pre-wrap">{job.brief}</p>
                </div>
              )}

              {/* Department Findings Accordion Cards */}
              {filteredSteps.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#333333] p-12 text-center text-muted">
                  <Filter className="mx-auto h-7 w-7 mb-2 opacity-50" />
                  <p className="text-xs font-semibold text-white">No findings matched your filter or search query</p>
                  <p className="text-[11px] text-muted mt-1">Try clearing the search query or resetting the dropdown filter.</p>
                </div>
              ) : (
                filteredSteps.map((step) => {
                  const Icon = (step.departmentId && DEPT_ICONS[step.departmentId]) || KIND_ICONS[step.kind];
                  const deptName = step.departmentId ? DEPT_NAMES[step.departmentId] || step.label : step.label;
                  const isExpanded = isStepExpanded(step.id);
                  const isCopied = copiedStepId === step.id;

                  return (
                    <div
                      key={step.id}
                      id={`step-${step.id}`}
                      className="rounded-2xl border border-[#333333] bg-[#111827] shadow-lg overflow-hidden transition-all hover:border-electric/40"
                    >
                      {/* Step Header Accordion Toggle */}
                      <div
                        onClick={() => toggleStep(step.id)}
                        className="flex items-center justify-between gap-3 px-5 py-4 bg-[#111827] cursor-pointer select-none border-b border-[#333333]/60 hover:bg-[#1a2333] transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-electric/15 text-electric border border-electric/25">
                            <Icon className="h-4.5 w-4.5" />
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-heading text-sm font-semibold text-white truncate">
                                {deptName}
                              </span>
                              <span className="rounded bg-navy/60 px-1.5 py-0.5 text-[10px] font-medium text-muted border border-[#333333]">
                                {KIND_LABELS[step.kind] || step.kind}
                              </span>
                              {step.provider && (
                                <span className="rounded bg-electric/10 px-1.5 py-0.5 text-[9px] font-mono text-electric border border-electric/20">
                                  {step.provider}
                                </span>
                              )}
                              {step.instructionsHash && (
                                <span className="rounded bg-navy px-1.5 py-0.5 text-[9px] font-mono text-secondary border border-[#333333]">
                                  #{step.instructionsHash}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-secondary truncate mt-0.5">
                              {step.activity}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyStep(step.id, step.output || "");
                            }}
                            className="rounded-lg border border-[#333333] bg-[#0B1220] p-1.5 text-muted hover:text-white hover:border-electric/50"
                            title="Copy this section"
                          >
                            {isCopied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>
                          {isExpanded ? <ChevronUp className="h-4 w-4 text-muted" /> : <ChevronDown className="h-4 w-4 text-muted" />}
                        </div>
                      </div>

                      {/* Step Output Markdown Content */}
                      {isExpanded && (
                        <div className="p-6 bg-[#0B1220] text-white">
                          <div className="prose prose-invert max-w-none text-white">
                            <Markdown content={step.output || "No output recorded."} size="base" />
                          </div>

                          {/* Sources & Citations if present */}
                          {step.sources && step.sources.length > 0 && (
                            <div className="mt-6 pt-4 border-t border-[#333333]">
                              <span className="text-xs font-semibold text-emerald flex items-center gap-1.5 mb-2">
                                <Globe className="h-3.5 w-3.5" /> Verified Research Citations ({step.sources.length})
                              </span>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {step.sources.map((src, sIdx) => (
                                  <a
                                    key={sIdx}
                                    href={src.uri}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-lg border border-[#333333] bg-[#111827] p-2.5 text-xs text-secondary hover:text-electric hover:border-electric/40 transition-colors flex items-start justify-between gap-2"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <p className="font-medium text-white truncate">{src.title || src.uri}</p>
                                      <p className="text-[10px] font-mono text-muted truncate mt-0.5">{src.uri}</p>
                                    </div>
                                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted mt-0.5" />
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 2: DEPARTMENT-BY-DEPARTMENT GRID */}
          {viewTab === "departments" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-6xl mx-auto">
              {filteredSteps.map((step) => {
                const Icon = (step.departmentId && DEPT_ICONS[step.departmentId]) || KIND_ICONS[step.kind];
                const deptName = step.departmentId ? DEPT_NAMES[step.departmentId] || step.label : step.label;
                const isCopied = copiedStepId === step.id;

                return (
                  <div
                    key={step.id}
                    className="flex flex-col rounded-2xl border border-[#333333] bg-[#111827] p-5 shadow-lg space-y-3"
                  >
                    <div className="flex items-center justify-between border-b border-[#333333] pb-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-electric/15 text-electric border border-electric/25">
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <h3 className="font-heading text-xs font-semibold text-white truncate">
                            {deptName}
                          </h3>
                          <span className="text-[10px] text-muted">{KIND_LABELS[step.kind] || step.kind}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyStep(step.id, step.output || "")}
                        className="rounded-md border border-[#333333] bg-[#0B1220] p-1.5 text-muted hover:text-white"
                        title="Copy section"
                      >
                        {isCopied ? <CheckCircle2 className="h-3 w-3 text-emerald" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto max-h-80 bg-[#0B1220] rounded-xl p-3 border border-[#333333]/50 text-xs text-white">
                      <Markdown content={step.output || "No output recorded."} size="sm" />
                    </div>

                    {step.sources && step.sources.length > 0 && (
                      <div className="text-[11px] text-emerald flex items-center gap-1 font-medium">
                        <Globe className="h-3 w-3" /> {step.sources.length} live research citations attached
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 3: AUDIT & GOVERNANCE LEDGER */}
          {viewTab === "audit" && (
            <div className="max-w-4xl mx-auto space-y-5">
              <div className="rounded-2xl border border-[#333333] bg-[#111827] p-6 space-y-4">
                <div className="flex items-center gap-2 text-white font-heading font-semibold text-sm border-b border-[#333333] pb-3">
                  <ShieldCheck className="h-4 w-4 text-emerald" /> Execution Audit & Provenance Ledger
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1">
                    <span className="text-muted">Job ID:</span>
                    <p className="font-mono text-white">{job.id}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-muted">Initiated By:</span>
                    <p className="text-white">{job.createdBy || "System Operator"}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-muted">Creation Timestamp:</span>
                    <p className="text-white">{new Date(job.createdAt).toLocaleString()}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-muted">Completion Timestamp:</span>
                    <p className="text-white">{job.finishedAt ? new Date(job.finishedAt).toLocaleString() : "In progress"}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-muted">Approval Signoff:</span>
                    <p className="text-emerald font-semibold">
                      {job.approvedAt ? `Approved by ${job.approvedBy || "CEO"} on ${new Date(job.approvedAt).toLocaleString()}` : "Pending executive approval"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-muted">Web Search Verification:</span>
                    <p className={job.verified ? "text-emerald" : "text-gold"}>
                      {job.verified ? "Verified via real ground-truth web research" : "Unverified (Local/Heuristic)"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Department Rule Hashes */}
              <div className="rounded-2xl border border-[#333333] bg-[#111827] p-6 space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Department Operating Instructions Hashes
                </h3>
                <div className="space-y-2">
                  {outputSteps.map((step) => (
                    <div key={step.id} className="flex items-center justify-between py-1.5 border-b border-[#333333]/50 text-xs">
                      <span className="text-white font-medium">{step.label}</span>
                      <div className="flex items-center gap-3">
                        {step.provider && <span className="font-mono text-electric text-[11px]">{step.provider}</span>}
                        <code className="bg-[#0B1220] px-2 py-0.5 rounded border border-[#333333] font-mono text-gold text-[10px]">
                          {step.instructionsHash ? `#${step.instructionsHash}` : "legacy"}
                        </code>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Revision History */}
              {job.revisions && job.revisions.length > 0 && (
                <div className="rounded-2xl border border-[#333333] bg-[#111827] p-6 space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Revision Audit Trail</h3>
                  <ul className="space-y-2 text-xs">
                    {job.revisions.map((rev) => (
                      <li key={rev.id} className="p-3 rounded-lg bg-[#0B1220] border border-[#333333]">
                        <div className="flex items-center justify-between text-muted text-[11px] mb-1">
                          <span>{rev.effect === "reran" ? "Reran Pipeline Slice" : "Queued Note"}</span>
                          <span>{new Date(rev.createdAt).toLocaleString()}</span>
                        </div>
                        <p className="text-white">{rev.message}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
