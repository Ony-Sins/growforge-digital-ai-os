import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, FileText, History, Image as ImageIcon, Loader2, Mic, MicOff, Minimize2, Paperclip, RefreshCw, Send, Settings2, Sparkles, Trash2, X } from "lucide-react";
import { CoreOrbField } from "./CoreOrbField";
import { useAppState } from "@/lib/appState";
import { Markdown } from "@/components/ui/Markdown";

interface SpeechRecognitionEventLike {
  results: ArrayLike<{ 0: { transcript: string } }>;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

interface CoreCommandCenterProps {
  telemetryData: {
    activeJobCount: number;
    totalJobCount: number;
    mcp: { totalConnected: number };
    models: { totalConfigured: number };
    telemetry: { executionState: string };
    pendingApprovals?: number;
  } | null;
  zoomProgress?: number;
  conversationView: "closed" | "compact" | "expanded";
  onConversationViewChange: (view: "closed" | "compact" | "expanded") => void;
  onOpenMissions?: () => void;
  onOpenSystems?: () => void;
  onOpenApprovals: () => void;
  useGpuCore?: boolean;
  onListeningChange?: (listening: boolean) => void;
}

export interface AttachmentUI {
  name: string;
  kind: string;
  size: number;
  extractedText: string;
  status: "uploading" | "done" | "error";
  errorMsg?: string;
}

interface SpatialChatMessage {
  id: string;
  role: "user" | "assistant" | "error";
  content: string;
  timestamp: string;
  provider?: string;
  attachments?: { name: string; kind: string }[];
  dispatch?: {
    agentId?: string;
    agentName?: string;
    status?: string;
    logMessage?: string;
  } | null;
}

type Tone = { rgb: string; text: string; hex: string; accent: string; glow: string };
const TONES: Record<"cyan" | "teal" | "amber" | "neutral", Tone> = {
  cyan: { rgb: "34,211,238", text: "#38bdf8", hex: "#38bdf8", accent: "text-cyan-400", glow: "rgba(34,211,238,0.16)" },
  teal: { rgb: "45,212,191", text: "#2dd4bf", hex: "#2dd4bf", accent: "text-teal-400", glow: "rgba(45,212,191,0.16)" },
  amber: { rgb: "245,183,59", text: "#fbbf24", hex: "#fbbf24", accent: "text-amber-400", glow: "rgba(245,183,59,0.16)" },
  neutral: { rgb: "148,163,184", text: "#94a3b8", hex: "#94a3b8", accent: "text-slate-400", glow: "rgba(148,163,184,0.10)" },
};

function TrajectoryGlyph({ className }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 18 18" fill="none" className={className} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 14.5 C5.5 13.5, 9 9.5, 11.5 5" stroke="currentColor" />
      <path d="M8.5 3.5 L14 4 L13.5 9.5" stroke="currentColor" />
      <circle cx="3" cy="14.5" r="1.5" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="14" cy="4" r="1.25" fill="currentColor" />
    </svg>
  );
}

function InfrastructureGlyph({ className }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 18 18" fill="none" className={className} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="3" width="5" height="4.5" rx="1" stroke="currentColor" />
      <rect x="10.5" y="10.5" width="5" height="4.5" rx="1" stroke="currentColor" />
      <path d="M7.5 5.25 H13 V10.5" stroke="currentColor" />
      <path d="M5 7.5 V12.75 H10.5" stroke="currentColor" strokeDasharray="1.5 1.5" strokeOpacity="0.75" />
      <circle cx="5" cy="5.25" r="0.75" fill="currentColor" />
      <circle cx="13" cy="12.75" r="0.75" fill="currentColor" />
    </svg>
  );
}

function ApprovalSealGlyph({ className }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 18 18" fill="none" className={className} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 2.5 L14.5 5.2 V9.2 C14.5 12.8 9 15.5 9 15.5 C9 15.5 3.5 12.8 3.5 9.2 V5.2 Z" stroke="currentColor" />
      <path d="M6.5 8.75 L8.25 10.5 L11.5 6.75" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function useStatusEmphasis(value: number | undefined) {
  const [emphasized, setEmphasized] = useState(false);
  const prevValRef = useRef<number | undefined>(undefined);
  const isHydratedRef = useRef(false);
  const lastEmphasisTimeRef = useRef(0);

  useEffect(() => {
    if (!isHydratedRef.current) {
      isHydratedRef.current = true;
      prevValRef.current = value;
      return;
    }

    if (value !== undefined && prevValRef.current !== undefined && value !== prevValRef.current) {
      const now = Date.now();
      if (now - lastEmphasisTimeRef.current >= 2000) {
        lastEmphasisTimeRef.current = now;
        setEmphasized(true);
        const timer = setTimeout(() => setEmphasized(false), 600);
        prevValRef.current = value;
        return () => clearTimeout(timer);
      }
    }
    prevValRef.current = value;
  }, [value]);

  return emphasized;
}

function InstrumentSignalTrace({
  tone,
  isEmphasized,
}: {
  tone: keyof typeof TONES;
  isEmphasized?: boolean;
}) {
  const t = TONES[tone];
  return (
    <div
      className="pointer-events-none relative flex h-[14px] w-[36px] items-center"
      style={{ "--inst-rgb": t.rgb } as React.CSSProperties}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 36 14"
        fill="none"
        className="h-full w-full overflow-visible"
      >
        {/* Quiet resting baseline */}
        <line
          x1="0"
          y1="7"
          x2="32"
          y2="7"
          stroke={`rgba(${t.rgb}, 0.22)`}
          strokeWidth="1"
          strokeDasharray="2 2"
        />
        <circle cx="32" cy="7" r="1.2" fill={`rgba(${t.rgb}, 0.45)`} />

        {/* Restrained single impulse on verified underlying count change */}
        {isEmphasized && (
          <path
            d="M 0 7 H 8 L 12.5 2.5 L 17 11.5 L 22 3.5 L 26 7 H 32"
            fill="none"
            stroke={`rgba(${t.rgb}, 0.95)`}
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="signal-trace-impulse"
          />
        )}
      </svg>
    </div>
  );
}

function HudCard({
  label,
  value,
  tone,
  glyph: Glyph,
  isEmphasized = false,
  className = "",
  onClick,
  title,
}: {
  label: string;
  value: string;
  tone: keyof typeof TONES;
  glyph: React.ComponentType<{ className?: string; color?: string }>;
  isEmphasized?: boolean;
  className?: string;
  onClick?: () => void;
  title?: string;
}) {
  const t = TONES[tone];
  const body = (
    <>
      {/* Asymmetric technical corner bracket accents */}
      <span className="pointer-events-none absolute top-1 left-1 h-1.5 w-1.5 core-instrument-corner-tl" />
      <span className="pointer-events-none absolute bottom-1 right-1 h-1.5 w-1.5 core-instrument-corner-br" />

      {/* Directional light sheen and top highlight line */}
      <span className="pointer-events-none absolute inset-0 rounded-lg bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.06),transparent_65%)]" />
      <span className="pointer-events-none absolute inset-x-3 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/18 to-transparent" />

      {/* Left micro status strip */}
      <span
        className={`pointer-events-none core-instrument-strip h-5 w-[2px] shrink-0 rounded-full ${
          isEmphasized ? "opacity-100" : "opacity-95"
        }`}
        style={{
          background: isEmphasized
            ? `linear-gradient(to bottom, #ffffff, rgba(${t.rgb}, 0.95))`
            : `linear-gradient(to bottom, rgba(${t.rgb}, 1.0), rgba(${t.rgb}, 0.35))`,
          boxShadow: isEmphasized
            ? `0 0 10px rgba(${t.rgb}, 0.95), 0 0 2px #fff`
            : `0 0 7px rgba(${t.rgb}, 0.70), 0 0 2px rgba(${t.rgb}, 0.50)`,
        }}
      />

      {/* Bespoke technical glyph with coordinated micro-glow */}
      <div className="pointer-events-none core-instrument-glyph shrink-0">
        <Glyph className="h-4 w-4 shrink-0" color={t.text} />
      </div>

      {/* Text column with crisp Sora typography */}
      <div className="pointer-events-none flex flex-col min-w-0 flex-1 text-left">
        <span className="font-sora text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-400 leading-none">
          {label}
        </span>
        <span className="core-instrument-value mt-1.5 block whitespace-nowrap font-sora text-[13px] font-semibold uppercase leading-none tracking-tight">
          {value}
        </span>
      </div>

      {/* Small subtle chevron - stationary */}
      <ChevronRight className="pointer-events-none core-instrument-chevron h-3.5 w-3.5 shrink-0" />
    </>
  );

  const styleObj = {
    "--inst-rgb": t.rgb,
    "--inst-hex": t.hex,
  } as React.CSSProperties;

  const cls = `core-instrument-card group relative flex h-[56px] w-[198px] items-center gap-2.5 rounded-lg px-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030712] ${className}`;

  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={styleObj}
      className={`${cls} pointer-events-auto`}
    >
      {body}
    </button>
  ) : (
    <div title={title} style={styleObj} className={`${cls} pointer-events-none`}>
      {body}
    </div>
  );
}

let sessionGreetingCompleted = false;
let sessionGreetingStartTime = 0;

function useCoreArrivalGreeting(engaged: boolean) {
  const [stage, setStage] = useState<"initial" | "fade-in" | "visible" | "fade-out" | "hidden">(() => {
    if (sessionGreetingCompleted) {
      return "hidden";
    }
    if (sessionGreetingStartTime && Date.now() - sessionGreetingStartTime >= 5550) {
      sessionGreetingCompleted = true;
      return "hidden";
    }
    return "initial";
  });

  useEffect(() => {
    if (sessionGreetingCompleted) {
      return;
    }

    if (!sessionGreetingStartTime) {
      sessionGreetingStartTime = Date.now();
    }

    const elapsed = Date.now() - sessionGreetingStartTime;
    if (elapsed >= 5550) {
      sessionGreetingCompleted = true;
      return;
    }

    const remainingFadeIn = Math.max(0, 50 - elapsed);
    const remainingVisible = Math.max(0, 650 - elapsed);
    const remainingFadeOut = Math.max(0, 4650 - elapsed);
    const remainingHidden = Math.max(0, 5550 - elapsed);

    const t1 = setTimeout(() => {
      setStage("fade-in");
    }, remainingFadeIn);

    const t2 = setTimeout(() => {
      setStage("visible");
    }, remainingVisible);

    const t3 = setTimeout(() => {
      setStage("fade-out");
    }, remainingFadeOut);

    const t4 = setTimeout(() => {
      sessionGreetingCompleted = true;
      setStage("hidden");
    }, remainingHidden);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, []);

  if (engaged) {
    return "hidden";
  }

  return stage;
}

function greetingForHour(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 21) return "Good evening";
  return "Good night";
}

function ReactiveOrb({
  state,
}: {
  state: "idle" | "focus" | "typing" | "listening" | "voice-active" | "thinking" | "executing" | "success" | "error";
}) {
  let orbClass = "reactive-orb-idle";
  if (state === "error") {
    orbClass = "reactive-orb-error";
  } else if (state === "success") {
    orbClass = "reactive-orb-success";
  } else if (state === "thinking") {
    orbClass = "reactive-orb-thinking";
  } else if (state === "voice-active") {
    orbClass = "reactive-orb-voice-active";
  } else if (state === "listening") {
    orbClass = "reactive-orb-listening";
  } else if (state === "executing") {
    orbClass = "reactive-orb-executing";
  } else if (state === "typing") {
    orbClass = "reactive-orb-typing";
  } else if (state === "focus") {
    orbClass = "reactive-orb-focus";
  }

  return (
    <div className="reactive-orb-container" aria-hidden="true">
      <div className={`reactive-orb-base ${orbClass}`} />
    </div>
  );
}

interface SpatialResponseLayerProps {
  isOpen: boolean;
  viewMode: "compact" | "expanded";
  onToggleViewMode: () => void;
  isResponding: boolean;
  assistantName: string;
  userName: string;
  userPrompt: string | null;
  userAttachments?: Array<{ name: string; kind: string }>;
  response: SpatialChatMessage | null;
  history: Array<{ role: "user" | "assistant"; content: string; timestamp?: string; attachments?: { name: string; kind: string }[] }>;
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
  onOpenSettings: () => void;
  onClearHistory: () => void;
}

function SpatialResponseLayer({
  isOpen,
  viewMode,
  onToggleViewMode,
  isResponding,
  assistantName,
  userName,
  userPrompt,
  userAttachments,
  response,
  history,
  error,
  onClose,
  onRetry,
  onOpenSettings,
  onClearHistory,
}: SpatialResponseLayerProps) {
  const historyScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (viewMode === "expanded" && historyScrollRef.current) {
      historyScrollRef.current.scrollTop = historyScrollRef.current.scrollHeight;
    }
  }, [history, isResponding, viewMode]);

  if (!isOpen) return null;

  const isExpanded = viewMode === "expanded";

  return (
    <div
      role="region"
      aria-live="polite"
      aria-label="Assistant Spatial Workspace"
      id="core-conversation"
      data-view={viewMode}
      className={`pointer-events-auto relative spatial-response-layer-wrapper z-20 flex flex-col rounded-2xl bg-[#060e1d]/95 border border-cyan-400/25 backdrop-blur-2xl shadow-[0_16px_40px_rgba(0,0,0,0.9),0_0_28px_rgba(34,211,238,0.14)] p-3 sm:p-4 text-slate-200 select-none spatial-response-layer transition-all duration-200 w-[min(650px,calc(100vw-1.5rem))] ${
        isExpanded ? "max-h-[44vh] sm:max-h-[48vh] md:max-h-[52vh]" : "max-h-[30vh] sm:max-h-[34vh] md:max-h-[38vh]"
      }`}
    >
      {/* Corner bracket accents */}
      <span className="pointer-events-none absolute top-1 left-1 h-2 w-2 core-instrument-corner-tl" />
      <span className="pointer-events-none absolute bottom-1 right-1 h-2 w-2 core-instrument-corner-br" />

      {/* Top highlight line */}
      <span className="pointer-events-none absolute inset-x-4 top-[1px] h-[1px] bg-gradient-to-r from-transparent via-white/25 to-transparent" />

      {/* Header */}
      <div className="flex shrink-0 items-center justify-between pb-2.5 border-b border-white/[0.08]">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-cyan-400" />
          <span className="font-sora text-xs font-semibold text-white tracking-wide">
            {assistantName || "Nora"}
          </span>
          {isExpanded ? (
            <span className="rounded bg-cyan-950/60 border border-cyan-400/20 px-1.5 py-0.5 text-[9px] font-mono font-medium text-cyan-300 uppercase tracking-wider">
              {history.length} {history.length === 1 ? "Turn" : "Turns"}
            </span>
          ) : response?.provider ? (
            <span className="rounded bg-cyan-950/60 border border-cyan-400/20 px-1.5 py-0.5 text-[9px] font-mono font-medium text-cyan-300 uppercase tracking-wider">
              {response.provider}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1">
          {/* Toggle Mode Button */}
          <button
            type="button"
            onClick={onToggleViewMode}
            aria-label={isExpanded ? "Collapse to latest message" : "Expand conversation history"}
            title={isExpanded ? "Collapse to latest message" : "Expand conversation history"}
            className="grid h-9 w-9 sm:h-6 sm:w-6 shrink-0 place-items-center rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-white/10 transition"
          >
            {isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <History className="h-3.5 w-3.5" />}
          </button>

          {/* Conversation Settings Button */}
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Conversation Settings"
            title="Conversation Settings"
            className="grid h-9 w-9 sm:h-6 sm:w-6 shrink-0 place-items-center rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-white/10 transition"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>

          {/* Dismiss / Close Button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Dismiss workspace"
            title="Dismiss workspace"
            className="grid h-9 w-9 sm:h-6 sm:w-6 shrink-0 place-items-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* COMPACT MODE */}
      {!isExpanded && (
        <div className="conversation-compact min-h-0 overflow-y-auto">
          {!userPrompt && !response && !error && !isResponding && <p className="py-4 text-xs text-slate-400">No previous messages. Start a conversation from the dock below.</p>}
          {/* User prompt context */}
          {userPrompt && (
            <div className="mt-2.5 flex flex-col gap-1 rounded-lg bg-white/[0.03] border border-white/[0.06] px-2.5 py-1.5 text-xs text-slate-300">
              <div className="flex items-start gap-1.5">
                <span className="font-semibold text-cyan-400/90 shrink-0">{userName || "You"}:</span>
                <span className="line-clamp-2 text-slate-200">{userPrompt}</span>
              </div>
              {userAttachments && userAttachments.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {userAttachments.map((att, i) => (
                    <span key={i} className="inline-flex items-center gap-1 rounded bg-cyan-950/70 border border-cyan-400/20 px-1.5 py-0.5 text-[10px] text-cyan-300 font-mono">
                      <Paperclip className="h-2.5 w-2.5" />
                      {att.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Thinking State */}
          {isResponding && (
            <div className="mt-3.5 space-y-2.5 py-1">
              <div className="flex items-center gap-2 text-xs text-cyan-300 font-medium">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
                </span>
                <span>{assistantName || "Nora"} is processing...</span>
              </div>
              <div className="space-y-2 pt-1 animate-pulse">
                <div className="h-2.5 w-5/6 rounded-full bg-gradient-to-r from-cyan-500/20 via-sky-500/30 to-cyan-500/10" />
                <div className="h-2.5 w-full rounded-full bg-gradient-to-r from-cyan-500/15 via-sky-500/25 to-cyan-500/10" />
                <div className="h-2.5 w-3/4 rounded-full bg-gradient-to-r from-cyan-500/20 via-sky-500/20 to-cyan-500/5" />
              </div>
            </div>
          )}

          {/* Error State */}
          {error && !isResponding && (
            <div className="mt-3 rounded-lg bg-rose-950/40 border border-rose-500/30 p-3 text-xs text-rose-200">
              <div className="font-semibold text-rose-300 mb-1">Request failed</div>
              <p className="text-slate-300 mb-2.5">{error}</p>
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-medium border border-rose-500/40 transition"
              >
                <RefreshCw className="h-3 w-3" /> Retry
              </button>
            </div>
          )}

          {/* Response Content */}
          {response && !isResponding && !error && (
            <div className="mt-3 overflow-y-auto max-h-[18vh] sm:max-h-[22vh] md:max-h-[26vh] pr-1 select-text space-y-2 text-xs sm:text-sm text-slate-100 leading-relaxed font-sans scrollbar-thin">
              <Markdown content={response.content} size="sm" />

              {/* Dispatch Info Card */}
              {response.dispatch && (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-950/30 px-2.5 py-1.5 text-xs text-cyan-200">
                  <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.8)]" />
                  <span className="font-medium text-white">{response.dispatch.agentName}</span>
                  <span className="text-[11px] text-slate-400">({response.dispatch.status})</span>
                </div>
              )}
            </div>
          )}

          {/* Compact Footer Actions */}
          <div className="mt-3 pt-2.5 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-slate-400">
            <button
              type="button"
              onClick={onToggleViewMode}
              className="text-cyan-400 hover:text-cyan-300 hover:underline flex items-center gap-1 transition"
            >
              <History className="h-3 w-3" /> View history ({history.length})
            </button>
            <button
              type="button"
              onClick={onClose}
              className="hover:text-slate-200 transition"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* EXPANDED HISTORY MODE */}
      {isExpanded && (
        <div className="mt-2.5 flex flex-col flex-1 min-h-0">
          <div
            ref={historyScrollRef}
            className="min-h-0 overflow-y-auto max-h-[28vh] sm:max-h-[32vh] md:max-h-[38vh] pr-1.5 space-y-3.5 text-xs select-text scrollbar-thin"
          >
            {history.length === 0 && !isResponding && (
              <div className="py-8 text-center text-slate-400 text-xs">
                No previous messages. Start a conversation from the dock below.
              </div>
            )}

            {history.map((msg, idx) => (
              <div
                key={idx}
                className={`flex flex-col ${
                  msg.role === "user" ? "items-end" : "items-start"
                }`}
              >
                {msg.role === "user" ? (
                  <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-cyan-500/15 border border-cyan-400/25 px-3 py-2 text-cyan-100 shadow-[0_2px_8px_rgba(0,0,0,0.4)]">
                    <div className="text-[10px] font-semibold text-cyan-400/80 mb-0.5">{userName || "You"}</div>
                    <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {msg.attachments.map((att, i) => (
                          <span key={i} className="inline-flex items-center gap-1 rounded bg-black/40 border border-cyan-400/25 px-1.5 py-0.5 text-[10px] text-cyan-300 font-mono">
                            <Paperclip className="h-2.5 w-2.5" />
                            {att.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="max-w-[95%] rounded-2xl rounded-tl-sm bg-white/[0.04] border border-white/[0.08] px-3.5 py-2.5 text-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.4)] leading-relaxed">
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold text-cyan-300 mb-1">
                      <Sparkles className="h-3 w-3 text-cyan-400" />
                      <span>{assistantName || "Nora"}</span>
                    </div>
                    <Markdown content={msg.content} size="sm" />
                  </div>
                )}
              </div>
            ))}

            {/* Thinking Indicator in History */}
            {isResponding && (
              <div className="flex flex-col items-start max-w-[95%] rounded-2xl rounded-tl-sm bg-white/[0.04] border border-white/[0.08] px-3.5 py-2.5 text-slate-100">
                <div className="flex items-center gap-2 text-xs text-cyan-300 font-medium mb-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
                  </span>
                  <span>{assistantName || "Nora"} is processing...</span>
                </div>
                <div className="space-y-1.5 w-48 animate-pulse pt-1">
                  <div className="h-2 rounded-full bg-cyan-500/20" />
                  <div className="h-2 w-36 rounded-full bg-cyan-500/15" />
                </div>
              </div>
            )}

            {/* Error Banner in History */}
            {error && !isResponding && (
              <div className="rounded-lg bg-rose-950/40 border border-rose-500/30 p-2.5 text-xs text-rose-200 flex items-center justify-between">
                <span>{error}</span>
                <button
                  type="button"
                  onClick={onRetry}
                  className="px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-[11px] text-rose-200 transition"
                >
                  Retry
                </button>
              </div>
            )}
          </div>

          {/* Expanded Footer Actions */}
          <div className="shrink-0 mt-3 pt-2.5 border-t border-white/[0.08] flex items-center justify-between text-[11px] text-slate-400">
            <button
              type="button"
              onClick={onClearHistory}
              disabled={history.length === 0}
              className="inline-flex items-center gap-1 hover:text-rose-300 disabled:opacity-40 disabled:hover:text-slate-400 transition"
            >
              <Trash2 className="h-3 w-3" /> Clear history
            </button>
            <button
              type="button"
              onClick={onToggleViewMode}
              className="text-cyan-400 hover:text-cyan-300 transition"
            >
              Collapse to latest
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface ConversationSettingsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  position?: "dock" | "layer";
  userName: string;
  onUserNameChange: (name: string) => void;
  assistantName: string;
  onAssistantNameChange: (name: string) => void;
  voiceInputEnabled: boolean;
  onVoiceInputToggle: () => void;
  voiceOutputEnabled?: boolean;
  onVoiceOutputToggle?: () => void;
}

function ConversationSettingsPopover({
  isOpen,
  onClose,
  position = "dock",
  userName,
  onUserNameChange,
  assistantName,
  onAssistantNameChange,
  voiceInputEnabled,
  onVoiceInputToggle,
}: ConversationSettingsPopoverProps) {
  if (!isOpen) return null;

  const posClass = position === "layer"
    ? "top-12 right-0 z-50 animate-in fade-in slide-in-from-top-2 duration-200"
    : "bottom-[calc(100%+8px)] right-0 sm:right-2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200";

  return (
    <div
      role="region" aria-label="Conversation Settings"
      className={`conversation-settings absolute overflow-y-auto w-[min(320px,calc(100vw-2rem))] rounded-2xl bg-[#060e1d]/98 border border-cyan-400/25 backdrop-blur-2xl shadow-[0_16px_40px_rgba(0,0,0,0.9),0_0_24px_rgba(34,211,238,0.18)] p-3.5 sm:p-4 text-slate-200 select-none ${posClass}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="sticky -top-3.5 sm:-top-4 z-10 flex items-center justify-between bg-[#060e1d] pb-3 border-b border-white/[0.08]">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Settings2 className="w-4 h-4 text-cyan-400" />
          <span>Conversation Settings</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Settings"
          className="grid h-9 w-9 sm:h-6 sm:w-6 shrink-0 place-items-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-3.5 pt-3">
        {/* Your Name */}
        <div>
          <label className="block text-[11px] font-medium text-slate-400 mb-1">Your Name</label>
          <input
            type="text"
            value={userName}
            onChange={(e) => onUserNameChange(e.target.value)}
            placeholder="Ony"
            className="w-full rounded-lg bg-black/40 border border-white/10 px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none transition"
          />
          <span className="block text-[10px] text-slate-500 mt-0.5">This is how I&apos;ll address you.</span>
        </div>

        {/* Assistant Name */}
        <div>
          <label className="block text-[11px] font-medium text-slate-400 mb-1">Assistant Name</label>
          <input
            type="text"
            value={assistantName}
            onChange={(e) => onAssistantNameChange(e.target.value)}
            placeholder="Nora"
            className="w-full rounded-lg bg-black/40 border border-white/10 px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none transition"
          />
          <span className="block text-[10px] text-slate-500 mt-0.5">Choose what you&apos;d like to call me.</span>
        </div>

        {/* Interaction Mode */}
        <div className="pt-1">
          <label className="block text-[11px] font-medium text-slate-400 mb-2">Interaction Mode</label>
          <div className="space-y-2">
            {/* Text input */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-xs">💬</span>
                <div>
                  <div className="text-xs font-medium text-slate-200">Text Input</div>
                  <div className="text-[10px] text-slate-500">Type to chat with {assistantName || "Nora"}</div>
                </div>
              </div>
              <div className="h-4 w-7 rounded-full bg-cyan-500/80 p-0.5 flex items-center justify-end">
                <div className="h-3 w-3 rounded-full bg-white shadow" />
              </div>
            </div>

            {/* Voice input */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-xs">🎙️</span>
                <div>
                  <div className="text-xs font-medium text-slate-200">Voice Input</div>
                  <div className="text-[10px] text-slate-500">Speak to {assistantName || "Nora"}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={onVoiceInputToggle}
                className={`h-4 w-7 rounded-full p-0.5 flex items-center transition ${voiceInputEnabled ? "bg-cyan-500 justify-end" : "bg-slate-700 justify-start"}`}
              >
                <div className="h-3 w-3 rounded-full bg-white shadow" />
              </button>
            </div>

            {/* Assistant Voice Output */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-xs">🔊</span>
                <div>
                  <div className="text-xs font-medium text-slate-200">Assistant Voice Output</div>
                  <div className="text-[10px] text-slate-500">Speech synthesis unavailable in current environment</div>
                </div>
              </div>
              <button
                type="button"
                disabled={true}
                title="TTS engine not yet configured in local environment"
                className="h-4 w-7 rounded-full p-0.5 flex items-center bg-slate-800 opacity-50 cursor-not-allowed justify-start"
              >
                <div className="h-3 w-3 rounded-full bg-slate-500 shadow" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CoreCommandCenter({
  telemetryData,
  zoomProgress = 0,
  conversationView,
  onConversationViewChange,
  onOpenMissions,
  onOpenSystems,
  onOpenApprovals,
  useGpuCore = true,
  onListeningChange,
}: CoreCommandCenterProps) {
  const { role, unlockedAgentIds, setProfileName } = useAppState();
  const [prompt, setPrompt] = useState("");
  const [engaged, setEngaged] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [successPulse, setSuccessPulse] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isDockSettingsOpen, setIsDockSettingsOpen] = useState(false);
  const [isLayerSettingsOpen, setIsLayerSettingsOpen] = useState(false);

  // Unified Spatial Conversation State (Task C3/C4)
  const [activeUserPrompt, setActiveUserPrompt] = useState<string | null>(null);
  const [activeUserAttachments, setActiveUserAttachments] = useState<Array<{ name: string; kind: string }>>([]);
  const [activeResponse, setActiveResponse] = useState<SpatialChatMessage | null>(null);
  const [isResponding, setIsResponding] = useState(false);
  const [responseError, setResponseError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<AttachmentUI[]>([]);
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [conversationHistory, setConversationHistory] = useState<Array<{ role: "user" | "assistant"; content: string; attachments?: { name: string; kind: string }[] }>>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("growforge.chat.history");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) return parsed;
        }
      } catch {}
    }
    return [];
  });

  // Assistant & User Custom Name
  const [assistantName, setAssistantName] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("growforge.assistantName") || "Nora";
    }
    return "Nora";
  });
  const [userCustomName, setUserCustomName] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("growforge.userName") || "Ony";
    }
    return "Ony";
  });

  const [voiceInputEnabled, setVoiceInputEnabled] = useState(true);
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(false);
  const stackRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const composer = composerRef.current;
    if (!composer) return;
    const measure = () => stackRef.current?.style.setProperty("--composer-height", composer.getBoundingClientRect().height + "px");
    const observer = new ResizeObserver(measure);
    observer.observe(composer);
    measure();
    return () => observer.disconnect();
  }, []);

  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const voiceActiveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const errorTimerRef = useRef<NodeJS.Timeout | null>(null);
  const successTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const activeViewMode = conversationView === "expanded" ? "expanded" : "compact";
  const latestUser = [...conversationHistory].reverse().find((message) => message.role === "user");
  const latestAssistant = [...conversationHistory].reverse().find((message) => message.role === "assistant");
  const displayedResponse = activeResponse ?? (latestAssistant ? {
    ...latestAssistant, id: "stored-latest", role: "assistant" as const, timestamp: "",
  } : null);

  const handleAssistantNameChange = (name: string) => {
    setAssistantName(name);
    if (typeof window !== "undefined") {
      localStorage.setItem("growforge.assistantName", name);
    }
  };

  const handleUserNameChange = (name: string) => {
    setUserCustomName(name);
    setProfileName(name);
    if (typeof window !== "undefined") {
      localStorage.setItem("growforge.userName", name);
    }
  };

  const handleClearHistory = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("growforge.chat.history");
    }
    setConversationHistory([]);
    setActiveResponse(null);
    setActiveUserPrompt(null);
    setActiveUserAttachments([]);
  };

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).slice(0, 10);
    const oversized = files.find((f) => f.size > 15 * 1024 * 1024);
    if (oversized) {
      setResponseError(`"${oversized.name}" exceeds the 15MB limit.`);
      setHasError(true);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      errorTimerRef.current = setTimeout(() => setHasError(false), 3000);
      return;
    }

    const initialAttachments: AttachmentUI[] = files.map((f) => ({
      name: f.name,
      kind: f.type.startsWith("image/") ? "image" : "document",
      size: f.size,
      extractedText: "",
      status: "uploading" as const,
    }));

    setAttachments((prev) => [...prev, ...initialAttachments]);
    setIsUploadingAttachments(true);

    const formData = new FormData();
    files.forEach((f) => formData.append("file", f));

    try {
      const res = await fetch("/api/attachments", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        const errText = data.error || "Failed to process attached files.";
        setAttachments((prev) =>
          prev.map((a) =>
            files.some((f) => f.name === a.name) && a.status === "uploading"
              ? { ...a, status: "error", errorMsg: errText }
              : a,
          ),
        );
        setResponseError(errText);
        return;
      }

      const results: Array<{ name: string; kind: string; extractedText: string }> = data.results ?? [];
      setAttachments((prev) => {
        const remaining = prev.filter((a) => !files.some((f) => f.name === a.name && a.status === "uploading"));
        return [
          ...remaining,
          ...results.map((r) => {
            const matchedFile = files.find((f) => f.name === r.name);
            return {
              name: r.name,
              kind: r.kind,
              size: matchedFile?.size || 0,
              extractedText: r.extractedText,
              status: "done" as const,
            };
          }),
        ];
      });
    } catch {
      setAttachments((prev) =>
        prev.map((a) =>
          files.some((f) => f.name === a.name) && a.status === "uploading"
            ? { ...a, status: "error", errorMsg: "Network error uploading attachment." }
            : a,
        ),
      );
    } finally {
      setIsUploadingAttachments(false);
    }
  };

  const removeAttachment = (name: string) => {
    setAttachments((prev) => prev.filter((a) => a.name !== name));
  };

  const missionsEmphasized = useStatusEmphasis(telemetryData?.activeJobCount);
  const systemsEmphasized = useStatusEmphasis(telemetryData?.mcp.totalConnected);
  const approvalsEmphasized = useStatusEmphasis(telemetryData?.pendingApprovals);

  const greeting = useMemo(() => greetingForHour(new Date().getHours()), []);
  const firstName = userCustomName?.trim() || "Ony";
  const executionState = telemetryData?.telemetry.executionState || "standing by";
  const peripheralOpacity = Math.max(0, 1 - zoomProgress * 1.8);
  const systemLine = telemetryData?.activeJobCount
    ? `${telemetryData.activeJobCount} mission${telemetryData.activeJobCount === 1 ? " is" : "s are"} in motion.`
    : executionState.toLowerCase().includes("error")
      ? "One system needs your attention."
      : "All systems are standing by.";

  const greetingStage = useCoreArrivalGreeting(engaged);

  let greetingOpacityClass = "opacity-0 invisible pointer-events-none";
  if (greetingStage === "initial") {
    greetingOpacityClass = "opacity-0 pointer-events-none";
  } else if (greetingStage === "fade-in") {
    greetingOpacityClass = "opacity-100 transition-opacity duration-[600ms] ease-out pointer-events-none";
  } else if (greetingStage === "visible") {
    greetingOpacityClass = "opacity-100 pointer-events-none";
  } else if (greetingStage === "fade-out") {
    greetingOpacityClass = "opacity-0 transition-opacity duration-[900ms] ease-in-out pointer-events-none";
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPrompt(e.target.value);
    setEngaged(true);
    setIsTyping(true);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      setIsTyping(false);
    }, 380);
  };

  // Real Assistant Request Submission (Task C2/C3/C4)
  const submit = async (overrideValue?: string) => {
    const readyAttachments = attachments.filter((a) => a.status === "done");
    const value = (overrideValue ?? prompt).trim();
    if ((!value && readyAttachments.length === 0) || isResponding || isUploadingAttachments) return;

    const promptText = value || (readyAttachments.length > 0 ? "Please analyze the attached document(s)." : "");
    if (!promptText) return;

    setEngaged(true);
    setIsResponding(true);
    setResponseError(null);
    onConversationViewChange("compact");
    setActiveUserPrompt(promptText);
    setActiveUserAttachments(readyAttachments.map((a) => ({ name: a.name, kind: a.kind })));

    const draftText = prompt;
    const draftAttachments = [...attachments];
    if (!overrideValue) {
      setPrompt("");
      setAttachments([]);
    }

    const attachmentContext = readyAttachments.length > 0
      ? `The client attached ${readyAttachments.length} file${readyAttachments.length === 1 ? "" : "s"} — use this as real context, not as something to ask the client to re-explain:\n\n${readyAttachments.map((a) => `--- Attached file: ${a.name} (${a.kind}) ---\n${a.extractedText}`).join("\n\n")}`
      : undefined;

    const historyPayload = conversationHistory.slice(-8).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    try {
      const res = await fetch("/api/router", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: promptText,
          history: historyPayload,
          role,
          unlockedAgentIds,
          attachmentContext,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      const newHistory = [
        ...conversationHistory,
        {
          role: "user" as const,
          content: promptText,
          attachments: readyAttachments.map((a) => ({ name: a.name, kind: a.kind })),
        },
        {
          role: "assistant" as const,
          content: data.reply,
        },
      ];
      setConversationHistory(newHistory);
      if (typeof window !== "undefined") {
        localStorage.setItem("growforge.chat.history", JSON.stringify(newHistory));
      }

      setActiveResponse({
        id: "resp-" + Date.now(),
        role: "assistant",
        content: data.reply,
        timestamp: new Date().toISOString(),
        provider: data.provider || "Router",
        dispatch: data.dispatch ?? null,
      });

      setSuccessPulse(true);
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => {
        setSuccessPulse(false);
      }, 400);
    } catch (err: unknown) {
      console.error("Assistant request error:", err);
      const errMsg = (err instanceof Error ? err.message : null) || "Failed to communicate with assistant router.";
      setResponseError(errMsg);
      setHasError(true);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      errorTimerRef.current = setTimeout(() => setHasError(false), 2000);
      // Restore draft text and attachments on failure
      setPrompt((prev) => prev || draftText);
      setAttachments((prev) => (prev.length > 0 ? prev : draftAttachments));
    } finally {
      setIsResponding(false);
    }
  };

  const toggleVoice = () => {
    setEngaged(true);
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      onListeningChange?.(false);
      return;
    }

    const speechWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceError("Voice input is not supported by this browser.");
      setHasError(true);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      errorTimerRef.current = setTimeout(() => setHasError(false), 1500);
      return;
    }

    try {
      const recognition = new Recognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = navigator.language || "en-US";
      recognition.onresult = (event) => {
        const transcript = event.results[0]?.[0]?.transcript?.trim();
        if (transcript) {
          setVoiceActive(true);
          if (voiceActiveTimerRef.current) clearTimeout(voiceActiveTimerRef.current);
          voiceActiveTimerRef.current = setTimeout(() => setVoiceActive(false), 1200);
          submit(transcript);
        }
      };
      recognition.onend = () => {
        setListening(false);
        onListeningChange?.(false);
      };
      recognition.onerror = () => {
        setListening(false);
        onListeningChange?.(false);
        setVoiceError("Microphone access was unavailable.");
        setHasError(true);
        if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
        errorTimerRef.current = setTimeout(() => setHasError(false), 1500);
      };
      recognitionRef.current = recognition;
      setListening(true);
      onListeningChange?.(true);
      recognition.start();
    } catch {
      setListening(false);
      onListeningChange?.(false);
      setHasError(true);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      errorTimerRef.current = setTimeout(() => setHasError(false), 1500);
    }
  };

  // Derive exact reactive orb state
  let orbState: "idle" | "focus" | "typing" | "listening" | "voice-active" | "thinking" | "executing" | "success" | "error" = "idle";
  if (hasError) {
    orbState = "error";
  } else if (successPulse) {
    orbState = "success";
  } else if (isResponding) {
    orbState = "thinking";
  } else if (voiceActive) {
    orbState = "voice-active";
  } else if (listening) {
    orbState = "listening";
  } else if ((telemetryData?.activeJobCount ?? 0) > 0) {
    orbState = "executing";
  } else if (isTyping) {
    orbState = "typing";
  } else if (isFocused || isHovered) {
    orbState = "focus";
  }

  const num = (n: number | undefined) => (n === undefined ? "—" : String(n));

  const pendingApprovalsCount = telemetryData?.pendingApprovals;
  const approvalsTone: "amber" | "neutral" = (pendingApprovalsCount !== undefined && pendingApprovalsCount > 0) ? "amber" : "neutral";

  const isSpatialLayerVisible = conversationView !== "closed";

  return (
    <section onKeyDown={(event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      if (isDockSettingsOpen || isLayerSettingsOpen) {
        setIsDockSettingsOpen(false);
        setIsLayerSettingsOpen(false);
      } else {
        onConversationViewChange("closed");
      }
    }} className={`absolute inset-0 z-10 overflow-hidden ${useGpuCore ? "bg-transparent pointer-events-none" : "bg-[#010206]"}`}>
      {!useGpuCore && <CoreOrbField zoom={zoomProgress} />}

      <div
        aria-hidden={greetingStage === "hidden" || greetingStage === "initial" || engaged}
        className={`absolute inset-x-4 top-[16%] z-20 text-center ${greetingOpacityClass} motion-reduce:transition-none`}
      >
        <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-[3.4rem] sm:leading-none">
          {greeting}, <span className="text-cyan-300">{firstName}.</span>
        </h1>
        <p className="mt-3 text-base text-slate-300/85 sm:text-[1.35rem]">{systemLine}</p>
      </div>

      {/* Ambient Instrument Cluster on the LEFT with Data-Change Signal Traces */}
      <div
        style={{ opacity: peripheralOpacity }}
        className="absolute left-[4.5%] top-[30%] z-20 hidden flex-col gap-2.5 lg:flex"
      >
        <div className="flex items-center gap-1.5">
          <HudCard
            label="Missions"
            value={`${num(telemetryData?.activeJobCount)} active`}
            tone="cyan"
            glyph={TrajectoryGlyph}
            isEmphasized={missionsEmphasized}
            onClick={onOpenMissions}
            title={`${telemetryData?.totalJobCount ?? 0} recorded`}
          />
          <InstrumentSignalTrace tone="cyan" isEmphasized={missionsEmphasized} />
        </div>

        <div className="flex items-center gap-1.5">
          <HudCard
            label="Systems"
            value={`${num(telemetryData?.mcp.totalConnected)} connected`}
            tone="teal"
            glyph={InfrastructureGlyph}
            isEmphasized={systemsEmphasized}
            onClick={onOpenSystems}
            title={`${telemetryData?.models.totalConfigured ?? 0} models configured`}
          />
          <InstrumentSignalTrace tone="teal" isEmphasized={systemsEmphasized} />
        </div>

        <div className="flex items-center gap-1.5">
          <HudCard
            label="Approvals"
            value={`${num(telemetryData?.pendingApprovals)} waiting`}
            tone={approvalsTone}
            glyph={ApprovalSealGlyph}
            isEmphasized={approvalsEmphasized}
            onClick={onOpenApprovals}
            title={pendingApprovalsCount && pendingApprovalsCount > 0 ? "Actions waiting for your review" : "No pending approvals"}
          />
          <InstrumentSignalTrace tone={approvalsTone} isEmphasized={approvalsEmphasized} />
        </div>
      </div>

      <div ref={stackRef} className="pointer-events-auto absolute left-1/2 studio-command-dock-wrapper z-30 flex w-[min(650px,calc(100vw-1.5rem))] -translate-x-1/2 flex-col gap-3">
      {/* Response, attachments and composer share one flow so their bounds cannot overlap. */}
      <SpatialResponseLayer
        isOpen={isSpatialLayerVisible}
        viewMode={activeViewMode}
        onToggleViewMode={() => onConversationViewChange(activeViewMode === "compact" ? "expanded" : "compact")}
        isResponding={isResponding}
        assistantName={assistantName}
        userName={userCustomName}
        userPrompt={activeUserPrompt ?? latestUser?.content ?? null}
        userAttachments={activeUserPrompt ? activeUserAttachments : latestUser?.attachments}
        response={displayedResponse}
        history={conversationHistory}
        error={responseError}
        onClose={() => onConversationViewChange("closed")}
        onRetry={() => submit(activeUserPrompt || undefined)}
        onOpenSettings={() => setIsLayerSettingsOpen(!isLayerSettingsOpen)}
        onClearHistory={handleClearHistory}
      />

      {/* OPTION D — STUDIO COMMAND DOCK AND REACTIVE ORB (WITH ATTACHMENTS SUPPORT - MOBILE CALIBRATED) */}
      <div
        ref={composerRef}
        className="studio-composer relative z-30 shrink-0"
      >
        {/* Staged Attachment Chips Strip */}
        {attachments.length > 0 && (
          <div className="flex items-center gap-1.5 mb-1.5 sm:mb-2 px-1 max-h-[64px] sm:max-h-[80px] overflow-x-auto scrollbar-none">
            {attachments.map((att) => (
              <span
                key={att.name}
                className="inline-flex shrink-0 items-center gap-1 rounded-md sm:rounded-lg border border-cyan-400/30 bg-[#061122]/95 px-2 py-0.5 sm:px-2.5 sm:py-1 text-[11px] sm:text-xs text-cyan-200 shadow-md backdrop-blur-md"
              >
                {att.status === "uploading" ? (
                  <Loader2 className="h-3 w-3 animate-spin text-cyan-400" />
                ) : att.kind === "image" ? (
                  <ImageIcon className="h-3 w-3 text-cyan-300" />
                ) : (
                  <FileText className="h-3 w-3 text-cyan-300" />
                )}
                <span className="max-w-[110px] sm:max-w-[140px] truncate font-mono text-[10px] sm:text-[11px]">{att.name}</span>
                {att.status === "error" && <span className="text-[10px] text-rose-400">({att.errorMsg || "failed"})</span>}
                <button
                  type="button"
                  onClick={() => removeAttachment(att.name)}
                  aria-label={`Remove ${att.name}`}
                  className="ml-0.5 text-slate-400 hover:text-white transition"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className="studio-command-dock relative flex h-[52px] sm:h-[60px] md:h-[68px] items-center gap-1 sm:gap-2 md:gap-2.5 rounded-full pl-3 pr-2 sm:pl-4 sm:pr-3 md:pl-5 md:pr-3.5"
        >
          {/* Subtle glossy top highlight line */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-6 sm:inset-x-8 top-[1px] h-[1px] rounded-full bg-gradient-to-r from-transparent via-white/25 to-transparent"
          />

          {/* 1. LEFT: Small luminous reactive orb */}
          <ReactiveOrb state={orbState} />

          {/* 2. CENTER: Editable text input */}
          <input
            value={prompt}
            onFocus={() => {
              setEngaged(true);
              setIsFocused(true);
            }}
            onBlur={() => setIsFocused(false)}
            onChange={handleInputChange}
            placeholder={
              listening
                ? "Listening..."
                : isUploadingAttachments
                  ? "Processing..."
                  : voiceError || (attachments.length > 0 ? "Ask about attached..." : "Start a conversation...")
            }
            aria-label="Start a conversation"
            className="relative min-w-0 flex-1 bg-transparent px-1.5 sm:px-2 text-xs sm:text-sm md:text-[1.05rem] text-white outline-none placeholder:text-slate-400/65"
          />

          {/* Hidden File Input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => {
              handleFilesSelected(e.target.files);
              e.target.value = "";
            }}
            multiple
            accept=".pdf,.docx,.txt,.md,.csv,image/*"
            className="hidden"
            aria-label="Upload files"
          />

          {/* 3. Attachment Button (Paperclip) */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingAttachments}
            aria-label="Attach files"
            title="Attach files (PDF, DOCX, TXT, CSV, images up to 15MB)"
            className={`grid h-8 w-8 sm:h-9 sm:w-9 place-items-center rounded-full text-slate-400 transition hover:text-white hover:bg-white/10 ${
              attachments.length > 0 ? "bg-cyan-500/20 text-cyan-300 border border-cyan-400/30" : "bg-transparent"
            }`}
          >
            {isUploadingAttachments ? (
              <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin text-cyan-400" />
            ) : (
              <Paperclip className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            )}
          </button>

          {/* 4. Conversation Settings Button */}
          <button
            type="button"
            onClick={() => setIsDockSettingsOpen(!isDockSettingsOpen)}
            aria-label="Conversation Settings"
            title="Conversation Settings"
            className={`grid h-8 w-8 sm:h-9 sm:w-9 place-items-center rounded-full text-slate-400 transition hover:text-white hover:bg-white/10 ${
              isDockSettingsOpen ? "bg-white/15 text-cyan-300" : "bg-transparent"
            }`}
          >
            <Settings2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>

          {/* Subtle vertical separator */}
          <span className="relative h-4 sm:h-5 md:h-6 w-px bg-white/12 mx-0.5 sm:mx-1 flex-shrink-0" aria-hidden="true" />

          {/* 5. Microphone Button */}
          <button
            type="button"
            onClick={toggleVoice}
            aria-label={listening ? "Stop listening" : "Start voice input"}
            title={listening ? "Stop listening" : "Start voice input"}
            className={`grid h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10 place-items-center rounded-full transition-all duration-200 active:scale-95 ${
              listening
                ? "bg-rose-500/25 text-rose-300 border border-rose-500/50 shadow-[0_0_16px_rgba(244,63,94,0.5)]"
                : "bg-white/[0.06] text-slate-300 hover:text-white hover:bg-white/[0.12] border border-white/10"
            }`}
          >
            {listening ? <MicOff className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-5 md:w-5" /> : <Mic className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-5 md:w-5" />}
          </button>

          {/* 6. Send / Submit Button */}
          <button
            type="submit"
            aria-label="Send message"
            disabled={(!prompt.trim() && attachments.length === 0) || isUploadingAttachments}
            className={`grid h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10 place-items-center rounded-full transition-all duration-200 ${
              (prompt.trim() || attachments.length > 0) && !isUploadingAttachments
                ? "bg-gradient-to-b from-cyan-300 via-cyan-400 to-sky-500 text-slate-950 font-bold shadow-[0_0_18px_rgba(34,211,238,0.70)] hover:brightness-110 active:scale-95"
                : "bg-white/[0.04] text-slate-600 border border-white/[0.06] cursor-not-allowed"
            }`}
          >
            <Send className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-5 md:w-5" />
          </button>

        </form>
          {/* Conversation Settings Popover from Dock or Layer */}
          <ConversationSettingsPopover
            isOpen={isDockSettingsOpen || isLayerSettingsOpen}
            onClose={() => {
              setIsDockSettingsOpen(false);
              setIsLayerSettingsOpen(false);
            }}
            position="dock"
            userName={userCustomName}
            onUserNameChange={handleUserNameChange}
            assistantName={assistantName}
            onAssistantNameChange={handleAssistantNameChange}
            voiceInputEnabled={voiceInputEnabled}
            onVoiceInputToggle={() => setVoiceInputEnabled(!voiceInputEnabled)}
            voiceOutputEnabled={voiceOutputEnabled}
            onVoiceOutputToggle={() => setVoiceOutputEnabled(!voiceOutputEnabled)}
          />
      </div>
      </div>
    </section>
  );
}

