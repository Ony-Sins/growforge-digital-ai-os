import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, MoreHorizontal, Minus, ChevronRight, FileText, Image as ImageIcon, Loader2, Paperclip, Settings2, Sparkles, X } from "lucide-react";
import { GrowForgeGlyph } from "./GrowForgeGlyph";
import { CoreOrbField } from "./CoreOrbField";
import { NORA_VISUAL_EVENT, NORA_VISUAL_REQUEST, NORA_AUDIO_EVENT, type NoraVisualSignal } from '@/lib/noraVisualSignal';
import { resolveAssistantIdentity } from '@/lib/assistantIdentity';
import { createAudioSampler, type AudioSampler } from '@/lib/audioSampler';
import { useAppState } from "@/lib/appState";
import { Markdown } from "@/components/ui/Markdown";
import type { GraphNode } from "@/lib/spatial/obsidianReader";
import { noraSurfaceContext, type NoraSurface, type NoraDepartmentContext, type NoraAgentContext, type NoraWorkflowContext, type NoraContextRecord, type NoraToolRecord, type NoraDiveScope } from "@/lib/noraSurfaceContext";
import { DIVE_SCOPE_EVENT } from "@/lib/diveLenses";
import { VoiceDiagnosticsPanel, type VoiceDiagnosticsData } from "./VoiceDiagnosticsPanel";
import { LiveKitVoiceClient } from "@/lib/livekitVoiceClient";

function ComposerVoiceWave({ energy }: { energy: number }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-950/40 border border-cyan-500/30 backdrop-blur-sm animate-fade-in">
      <div className="flex items-center gap-0.5 h-4">
        {[0, 1, 2, 3, 4].map((i) => {
          const offset = Math.sin(i * 1.2) * 0.2;
          const heightFactor = Math.max(0.2, Math.min(1.0, energy * (1 + offset * 0.8)));
          const heightPx = Math.max(3, Math.round(heightFactor * 16));
          return (
            <span
              key={i}
              className="w-1 rounded-full bg-gradient-to-t from-cyan-400 to-emerald-300 transition-all duration-75"
              style={{ height: `${heightPx}px` }}
            />
          );
        })}
      </div>
      <span className="text-[11px] font-mono text-cyan-200 tracking-wide font-medium">
        {energy > 0.08 ? "Voice active" : "Listening..."}
      </span>
    </div>
  );
}

interface SpeechRecognitionEventLike {
  resultIndex?: number;
  results: ArrayLike<{ 0?: { transcript: string }; isFinal?: boolean }>;
}

interface SpeechRecognitionInstance {
  onstart: (() => void) | null;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onaudiostart?: (() => void) | null;
  onsoundstart?: (() => void) | null;
  onspeechstart?: (() => void) | null;
  onspeechend?: (() => void) | null;
  onsoundend?: (() => void) | null;
  onaudioend?: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event?: { error?: string }) => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

interface CoreCommandCenterProps {
  dockHidden?: boolean;
  onHideDock?: () => void;
  conversationOnly?: boolean;
  contextSurface?: NoraSurface;
  selectedRecord?: GraphNode | null;
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

export interface MediaArtifactUI {
  id?: string;
  url: string;
  type?: "image" | "video";
  prompt?: string;
  provider?: string;
  workflow?: string;
  dimensions?: { width: number; height: number };
  createdAt?: string;
  status?: "completed" | "failed";
  error?: string;
}

interface SpatialChatMessage {
  id: string;
  role: "user" | "assistant" | "error";
  content: string;
  timestamp: string;
  provider?: string;
  model?: string;
  fallbackOccurred?: boolean;
  fallbackFrom?: string;
  attachments?: { name: string; kind: string }[];
  media?: MediaArtifactUI[];
  mediaError?: string;
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
  onClick, open, disabled,
}: {
  state: "idle" | "focus" | "typing" | "listening" | "voice-active" | "thinking" | "executing" | "success" | "error";
  onClick: () => void; open: boolean; disabled: boolean;
}) {
  return (
    <button type="button" className="nora-plus" aria-label="Attachment options" aria-expanded={open} disabled={disabled} onClick={onClick} data-state={state}><GrowForgeGlyph name="gap-add" size={23} strokeWidth={2} /></button>
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
      className={`conversation-settings absolute overflow-y-auto w-[min(320px,calc(100vw-2rem))] rounded-2xl holo-panel p-3.5 sm:p-4 text-slate-200 select-none ${posClass}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="sticky -top-3.5 sm:-top-4 z-10 flex items-center justify-between bg-[#081426]/85 backdrop-blur-md pb-3 border-b border-white/[0.08]">
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
            placeholder="Operator"
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

function InlineMediaCard({ media }: { media: MediaArtifactUI[]; onRetry?: () => void }) {
  const [activeZoomUrl, setActiveZoomUrl] = useState<string | null>(null);

  if (!media || media.length === 0) return null;

  return (
    <div className="mt-2.5 flex flex-col gap-2">
      {media.map((item, idx) => {
        const isVideo = item.type === "video" || item.url.endsWith(".mp4") || item.url.endsWith(".webm");
        const attribution = item.provider || item.workflow ? `${item.provider || "Local"}${item.workflow ? ` · ${item.workflow}` : ""}` : "ComfyUI";

        return (
          <div
            key={item.id || idx}
            className="group relative overflow-hidden rounded-xl border border-cyan-500/25 bg-[#040915]/90 p-2.5 shadow-[0_4px_16px_rgba(0,0,0,0.6)] backdrop-blur-md transition hover:border-cyan-400/50"
          >
            {/* Top metadata badge */}
            <div className="flex items-center justify-between pb-1.5 text-[10px] text-slate-400">
              <span className="flex items-center gap-1 font-mono uppercase text-cyan-300">
                <ImageIcon className="h-3 w-3" />
                <span>{attribution}</span>
              </span>
              {item.dimensions && (
                <span className="font-mono text-[9px] text-slate-500">
                  {item.dimensions.width}×{item.dimensions.height}
                </span>
              )}
            </div>

            {/* Media Content */}
            <div className="relative aspect-auto max-h-64 sm:max-h-80 w-full overflow-hidden rounded-lg bg-black/50 flex items-center justify-center">
              {isVideo ? (
                <video
                  src={item.url}
                  controls
                  className="max-h-64 sm:max-h-80 w-full rounded-lg object-contain"
                />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={item.url}
                  alt={item.prompt || "Generated media"}
                  className="max-h-64 sm:max-h-80 w-full rounded-lg object-contain cursor-zoom-in transition duration-200 hover:scale-[1.01]"
                  onClick={() => setActiveZoomUrl(item.url)}
                  loading="lazy"
                />
              )}
            </div>

            {/* Prompt label and Actions */}
            <div className="mt-2 flex items-center justify-between gap-2 pt-1 border-t border-white/[0.06]">
              {item.prompt && (
                <p className="line-clamp-1 flex-1 text-[10px] text-slate-300 italic" title={item.prompt}>
                  &ldquo;{item.prompt}&rdquo;
                </p>
              )}
              <div className="flex items-center gap-1 shrink-0 ml-auto">
                <a
                  href={item.url}
                  download={item.prompt ? `${item.prompt.slice(0, 30).replace(/[^a-z0-9]/gi, "_")}.png` : "growforge-generated.png"}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded bg-white/10 px-2 py-1 text-[10px] font-medium text-cyan-200 hover:bg-cyan-500/20 hover:text-white transition"
                  title="Download media"
                >
                  Download
                </a>
              </div>
            </div>
          </div>
        );
      })}

      {/* Lightbox Modal */}
      {activeZoomUrl && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md"
          onClick={() => setActiveZoomUrl(null)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-2xl border border-cyan-400/30 bg-[#050b16] p-2 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setActiveZoomUrl(null)}
              className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-slate-200 hover:text-white transition"
              aria-label="Close zoom preview"
            >
              <X className="h-4 w-4" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={activeZoomUrl} alt="Expanded preview" className="max-h-[82vh] max-w-[85vw] rounded-xl object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}

function VoiceMediaCenterCard({
  media,
  onClose,
  assistantName,
}: {
  media: MediaArtifactUI[];
  onClose: () => void;
  assistantName: string;
}) {
  const [activeZoomUrl, setActiveZoomUrl] = useState<string | null>(null);
  const [isPinned, setIsPinned] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (isPinned || isHovered) return;
    const timer = setTimeout(() => {
      onClose();
    }, 6000);
    return () => clearTimeout(timer);
  }, [isPinned, isHovered, onClose]);

  if (!media || media.length === 0) return null;
  const firstItem = media[0];
  const isVideo = firstItem.type === "video" || firstItem.url.endsWith(".mp4") || firstItem.url.endsWith(".webm");

  return (
    <div
      role="dialog"
      aria-label="Voice Generated Media Presentation"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-md animate-in fade-in duration-300 pointer-events-auto"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className="relative max-w-[min(560px,92vw)] w-full overflow-hidden rounded-2xl border border-cyan-400/40 bg-[#040813]/98 p-4 sm:p-5 shadow-[0_0_50px_rgba(34,211,238,0.25),0_20px_50px_rgba(0,0,0,0.9)] backdrop-blur-2xl transition-all animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Holographic corner accents */}
        <span className="pointer-events-none absolute top-1.5 left-1.5 h-3 w-3 border-t-2 border-l-2 border-cyan-400/70" />
        <span className="pointer-events-none absolute top-1.5 right-1.5 h-3 w-3 border-t-2 border-r-2 border-cyan-400/70" />
        <span className="pointer-events-none absolute bottom-1.5 left-1.5 h-3 w-3 border-b-2 border-l-2 border-cyan-400/70" />
        <span className="pointer-events-none absolute bottom-1.5 right-1.5 h-3 w-3 border-b-2 border-r-2 border-cyan-400/70" />

        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-cyan-400 animate-pulse" />
            <span className="font-sora text-sm font-semibold text-white tracking-wide">
              {assistantName || "Nora"}
            </span>
            <span className="rounded bg-cyan-950/80 border border-cyan-400/30 px-2 py-0.5 text-[10px] font-mono font-medium text-cyan-300 uppercase">
              Voice Generation Ready
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsPinned(!isPinned)}
              className={`px-2 py-1 rounded-lg text-xs font-medium border transition ${
                isPinned
                  ? "bg-cyan-500/20 border-cyan-400 text-cyan-300"
                  : "bg-white/5 border-white/10 text-slate-300 hover:text-white hover:bg-white/10"
              }`}
            >
              {isPinned ? "Pinned" : "Keep Viewing"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
              aria-label="Close media preview"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Nora announcement text */}
        <p className="mt-3 text-xs sm:text-sm text-cyan-100 font-sans leading-relaxed">
          &ldquo;Your image is ready. I created a scene based on your voice request. If you&apos;d like anything changed, just say the words.&rdquo;
        </p>

        {/* Media Preview Container */}
        <div className="mt-3 relative aspect-auto max-h-[50vh] w-full overflow-hidden rounded-xl bg-black/60 border border-cyan-500/20 flex items-center justify-center">
          {isVideo ? (
            <video src={firstItem.url} controls className="max-h-[50vh] w-full object-contain rounded-lg" />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={firstItem.url}
              alt={firstItem.prompt || "Voice generated media"}
              className="max-h-[50vh] w-full object-contain rounded-lg cursor-zoom-in hover:scale-[1.01] transition duration-200"
              onClick={() => setActiveZoomUrl(firstItem.url)}
            />
          )}
        </div>

        {/* Footer Actions */}
        <div className="mt-3.5 flex items-center justify-between gap-2 pt-2 border-t border-white/[0.08]">
          <div className="text-[11px] text-slate-400 truncate max-w-[240px]">
            {firstItem.prompt ? `"${firstItem.prompt}"` : "Local ComfyUI"}
          </div>

          <div className="flex items-center gap-2">
            {!isVideo && (
              <button
                type="button"
                onClick={() => setActiveZoomUrl(firstItem.url)}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium text-slate-200 hover:text-white transition"
              >
                Open Fullscreen
              </button>
            )}
            <a
              href={firstItem.url}
              download={firstItem.prompt ? `${firstItem.prompt.slice(0, 30).replace(/[^a-z0-9]/gi, "_")}.png` : "growforge-generated.png"}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-sky-500 text-xs font-semibold text-slate-950 hover:brightness-110 shadow-[0_0_12px_rgba(34,211,238,0.4)] transition"
            >
              Download
            </a>
          </div>
        </div>
      </div>

      {/* Lightbox Modal */}
      {activeZoomUrl && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md"
          onClick={() => setActiveZoomUrl(null)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-2xl border border-cyan-400/30 bg-[#050b16] p-2 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setActiveZoomUrl(null)}
              className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-slate-200 hover:text-white transition"
              aria-label="Close zoom preview"
            >
              <X className="h-4 w-4" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={activeZoomUrl} alt="Expanded preview" className="max-h-[82vh] max-w-[85vw] rounded-xl object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}

export interface SpatialResponseLayerProps {
  contextLabel?: string | null;
  isOpen: boolean;
  viewMode: "compact" | "expanded";
  onToggleViewMode: () => void;
  isResponding: boolean;
  processingStatus?: string;
  assistantName: string;
  userName: string;
  userPrompt: string | null;
  userAttachments?: Array<{ name: string; kind: string }>;
  response: SpatialChatMessage | null;
  history: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp?: string;
    provider?: string;
    model?: string;
    fallbackOccurred?: boolean;
    fallbackFrom?: string;
    attachments?: { name: string; kind: string }[];
    media?: MediaArtifactUI[];
  }>;
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
  onOpenSettings: () => void;
  onClearHistory: () => void;
  isSettingsOpen?: boolean;
  onCloseSettings?: () => void;
  onUserNameChange?: (name: string) => void;
  onAssistantNameChange?: (name: string) => void;
  voiceInputEnabled?: boolean;
  onVoiceInputToggle?: () => void;
  voiceOutputEnabled?: boolean;
  onVoiceOutputToggle?: () => void;
  onSelectPrompt?: (prompt: string) => void;
}

export function SpatialResponseLayer({ isOpen, isResponding, processingStatus, assistantName, history, response, error, onClose, onRetry, onOpenSettings, onClearHistory, onSelectPrompt, contextLabel, isSettingsOpen = false, onCloseSettings, onUserNameChange, onAssistantNameChange, userName, voiceInputEnabled = true, onVoiceInputToggle, voiceOutputEnabled = false, onVoiceOutputToggle }: SpatialResponseLayerProps) {
  const historyScrollRef = useRef<HTMLDivElement>(null);
  const atLatest = useRef(true);
  const [showLatest, setShowLatest] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const jumpToLatest = () => {
    const el = historyScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    atLatest.current = true; setShowLatest(false);
  };
  useEffect(() => { if (isOpen) { const el = historyScrollRef.current; if (el) el.scrollTop = el.scrollHeight; atLatest.current = true; } }, [isOpen]);
  useEffect(() => { if (atLatest.current) { const el = historyScrollRef.current; if (el) el.scrollTop = el.scrollHeight; } }, [history, isResponding]);
  useEffect(() => {
    if (!menuOpen) return;
    const outside = (e: PointerEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false); };
    const escape = (event: KeyboardEvent) => { if(event.key === "Escape"){event.stopImmediatePropagation();setMenuOpen(false);} };
    window.addEventListener("keydown", escape, true);
    window.addEventListener('pointerdown', outside);
    return () => { window.removeEventListener('pointerdown', outside);window.removeEventListener("keydown", escape, true); };
  }, [menuOpen]);
  if (!isOpen) return null;
  return <div role="region" aria-label="NORA conversation" id="core-conversation" className="nora-conversation" data-view="expanded">
    <header className="nora-panel-header">
      <span className="nora-panel-name"><Sparkles size={16} />{assistantName || 'NORA'}</span>
      <div ref={menuRef} className="nora-panel-actions">
        <button type="button" aria-label="Conversation actions" aria-expanded={menuOpen} onClick={() => setMenuOpen(v => !v)}><MoreHorizontal size={16} /></button>
        <button type="button" aria-label="Minimize conversation" onClick={onClose}><Minus size={16} /></button>
        <button type="button" aria-label="Close workspace" onClick={onClose}><X size={16} /></button>
        {menuOpen && <div className="nora-menu nora-actions-menu">
          <button type="button" onClick={() => {setMenuOpen(false);onOpenSettings();}}>Conversation settings</button>
          {response?.provider && <button type="button" onClick={() => {setMenuOpen(false);setDetailsOpen(v=>!v);}}>Execution details</button>}
          <button type="button" disabled={!history.length} onClick={() => {setMenuOpen(false);onClearHistory();}}>Clear history</button>
        </div>}
      </div>
    </header>
    {contextLabel && <div className="nora-context-chip">Context · {contextLabel}</div>}
    {detailsOpen && response?.provider && <div className="nora-context-chip">{response.provider}{response.model ? ` · ${response.model}` : ''}{response.fallbackOccurred ? ` · Fallback from ${response.fallbackFrom || 'primary'}` : ''}</div>}
    {isSettingsOpen && onCloseSettings && onUserNameChange && onAssistantNameChange && onVoiceInputToggle && <ConversationSettingsPopover isOpen onClose={onCloseSettings} position="layer" userName={userName} onUserNameChange={onUserNameChange} assistantName={assistantName} onAssistantNameChange={onAssistantNameChange} voiceInputEnabled={voiceInputEnabled} onVoiceInputToggle={onVoiceInputToggle} voiceOutputEnabled={voiceOutputEnabled} onVoiceOutputToggle={onVoiceOutputToggle} />}
    <div ref={historyScrollRef} className="nora-transcript" aria-label="Conversation messages" onScroll={() => {const el=historyScrollRef.current;if(el){atLatest.current=el.scrollHeight-el.scrollTop-el.clientHeight<32;setShowLatest(!atLatest.current);}}}>
      {!history.length && !isResponding && !error && <div className="nora-empty"><Sparkles size={24}/><p>How can I assist you today?</p><span>Ask a question or work with the current context.</span>{onSelectPrompt && <div className="nora-suggestions">{['Summarize active department status','Audit system connections & models'].map(prompt=><button key={prompt} type="button" onClick={()=>onSelectPrompt(prompt)}>{prompt}</button>)}</div>}</div>}
      {history.map((msg,index)=><article key={index} className={`nora-message nora-message-${msg.role}`}>
        {msg.role==='assistant' && <div className="nora-message-author"><Sparkles size={12}/>{assistantName || 'NORA'}</div>}
        <Markdown content={msg.content} size="sm" />
        {!!msg.attachments?.length && <div className="nora-message-files">{msg.attachments.map((file,i)=><span key={i}><Paperclip size={11}/>{file.name}</span>)}</div>}
        {!!msg.media?.length && <InlineMediaCard media={msg.media}/>}
      </article>)}
      {isResponding && <div role="status" className="nora-processing">{processingStatus || `${assistantName || 'NORA'} is working…`}</div>}
      {error && !isResponding && <div role="alert" className="nora-error">{error}<button type="button" onClick={onRetry}>Retry</button></div>}
    </div>
    {showLatest && <button type="button" className="nora-jump" onClick={jumpToLatest}><ArrowDown size={12}/>Jump to latest</button>}
  </div>;
}
export function CoreCommandCenter({
  dockHidden = false,
  onHideDock,
  conversationOnly = false,
  contextSurface = "CORE",
  selectedRecord = null,
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
  const { role, unlockedAgentIds, profileName, setProfileName } = useAppState();
  const [missionContext, setMissionContext] = useState<{ id: string; title: string; context: string } | null>(null);
  const [agentContext,setAgentContext]=useState<NoraAgentContext|null>(null);
  const [contextRecord,setContextRecord]=useState<NoraContextRecord|null>(null);
  useEffect(()=>{const select=(event:Event)=>setContextRecord((event as CustomEvent<NoraContextRecord|null>).detail);window.addEventListener('growforge:context-record',select);return()=>window.removeEventListener('growforge:context-record',select);},[]);
  const [intelligenceRecord,setIntelligenceRecord]=useState<NoraContextRecord|null>(null);
  useEffect(()=>{const select=(event:Event)=>setIntelligenceRecord((event as CustomEvent<NoraContextRecord|null>).detail);window.addEventListener('growforge:intelligence-record',select);return()=>window.removeEventListener('growforge:intelligence-record',select);},[]);
  const [toolRecord,setToolRecord]=useState<NoraToolRecord|null>(null);
  useEffect(()=>{const select=(event:Event)=>setToolRecord((event as CustomEvent<NoraToolRecord|null>).detail);window.addEventListener('growforge:tool-record',select);return()=>window.removeEventListener('growforge:tool-record',select);},[]);
  const [workflowContext,setWorkflowContext]=useState<NoraWorkflowContext|null>(null);
  useEffect(()=>{const select=(event:Event)=>setWorkflowContext((event as CustomEvent<NoraWorkflowContext|null>).detail);window.addEventListener('growforge:workflow-context',select);return()=>window.removeEventListener('growforge:workflow-context',select);},[]);
  useEffect(()=>{const select=(event:Event)=>setAgentContext((event as CustomEvent<NoraAgentContext|null>).detail);window.addEventListener('growforge:agent-context',select);return()=>window.removeEventListener('growforge:agent-context',select);},[]);
  const [departmentContext,setDepartmentContext]=useState<NoraDepartmentContext|null>(null);
  useEffect(()=>{
    const select=(event:Event)=>setDepartmentContext((event as CustomEvent<NoraDepartmentContext|null>).detail);
    window.addEventListener('growforge:department-context',select);
    return()=>window.removeEventListener('growforge:department-context',select);
  },[]);
  useEffect(() => {
    const select = (event: Event) => setMissionContext((event as CustomEvent<{ id: string; title: string; context: string } | null>).detail);
    window.addEventListener("growforge:mission-context", select);
    return () => window.removeEventListener("growforge:mission-context", select);
  }, []);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const attachmentMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!attachmentMenuOpen) return;
    const outside = (event: PointerEvent) => { if (!attachmentMenuRef.current?.contains(event.target as Node)) setAttachmentMenuOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault();event.stopImmediatePropagation();setAttachmentMenuOpen(false); } };
    window.addEventListener("pointerdown", outside);window.addEventListener("keydown", escape, true);
    return () => {window.removeEventListener("pointerdown", outside);window.removeEventListener("keydown", escape, true);};
  }, [attachmentMenuOpen]);
  const [prompt, setPrompt] = useState("");
  const [engaged, setEngaged] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceRuntimeState, setVoiceRuntimeState] = useState("idle");
  const [agentSpeaking, setAgentSpeaking] = useState(false);
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
  const audioSamplerRef = useRef<AudioSampler | null>(null);
  useEffect(() => {
    const signal:NoraVisualSignal={focused:isFocused,listening,processing:isResponding,streaming:false,speaking:agentSpeaking,responseId:activeResponse?.id??null,responseAt:activeResponse?.timestamp??null,response:activeResponse?.content??null,error:!!responseError||voiceRuntimeState==='error',conversationOpen:conversationView!=='closed'};
    const publish=()=>window.dispatchEvent(new CustomEvent(NORA_VISUAL_EVENT,{detail:signal}));
    publish(); window.addEventListener(NORA_VISUAL_REQUEST,publish);
    return ()=>window.removeEventListener(NORA_VISUAL_REQUEST,publish);
  },[isFocused,listening,isResponding,agentSpeaking,voiceRuntimeState,activeResponse,responseError,conversationView]);
  const [attachments, setAttachments] = useState<AttachmentUI[]>([]);
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [conversationHistory, setConversationHistory] = useState<Array<{
    role: "user" | "assistant";
    content: string;
    provider?: string;
    model?: string;
    fallbackOccurred?: boolean;
    fallbackFrom?: string;
    attachments?: { name: string; kind: string }[];
    media?: MediaArtifactUI[];
  }>>(() => {
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
      return localStorage.getItem("growforge.userName") || "";
    }
    return "";
  });

  const [voiceInputEnabled, setVoiceInputEnabled] = useState(true);
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>("");
  const [voiceMediaArtifacts, setVoiceMediaArtifacts] = useState<MediaArtifactUI[] | null>(null);
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
  const isVoiceSessionActiveRef = useRef(false);
  const accumulatedTranscriptRef = useRef("");
  const interimTranscriptRef = useRef("");
  const turnCommitTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSubmittedTranscriptRef = useRef("");

  const [isVoiceDiagOpen, setIsVoiceDiagOpen] = useState(false);
  const [voiceBackend, setVoiceBackend] = useState<"livekit" | "browser">("livekit");
  const livekitClientRef = useRef<LiveKitVoiceClient | null>(null);
  const [diveScope,setDiveScope]=useState<NoraDiveScope|null>(null);
  useEffect(()=>{const select=(event:Event)=>setDiveScope((event as CustomEvent<NoraDiveScope|null>).detail);window.addEventListener(DIVE_SCOPE_EVENT,select);return()=>window.removeEventListener(DIVE_SCOPE_EVENT,select);},[]);
  const voiceSurfaceContextRef = useRef("");
  useEffect(() => {
    voiceSurfaceContextRef.current = noraSurfaceContext(contextSurface, selectedRecord, missionContext, departmentContext, agentContext, workflowContext, contextRecord, toolRecord, intelligenceRecord, diveScope);
  }, [contextSurface, selectedRecord, missionContext, departmentContext, agentContext, workflowContext, contextRecord, toolRecord, intelligenceRecord, diveScope]);
  const [liveMicEnergy, setLiveMicEnergy] = useState(0);
  useEffect(() => () => {
    isVoiceSessionActiveRef.current = false;
    if (turnCommitTimerRef.current) {
      clearTimeout(turnCommitTimerRef.current);
      turnCommitTimerRef.current = null;
    }
    accumulatedTranscriptRef.current = "";
    interimTranscriptRef.current = "";
    try { recognitionRef.current?.abort?.(); } catch {}
    audioSamplerRef.current?.stop();
    void livekitClientRef.current?.stop();
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const isDiagQuery = params.get("voiceDiag") === "1";
      const isDiagStorage = localStorage.getItem("growforge.voiceDiag") === "1";
      if (isDiagQuery || isDiagStorage) {
        const timer = setTimeout(() => setIsVoiceDiagOpen(true), 0);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  const [voiceDiagData, setVoiceDiagData] = useState<VoiceDiagnosticsData>({
    voiceBackend: "livekit",
    micOwner: "none",
    micDeviceLabel: "None (mic off)",
    trackEnabled: false,
    trackMuted: false,
    trackReadyState: "none",
    audioRms: 0,
    peakEnergy: 0,
    userAudioEnergy: 0,
    speechEnergy: 0,
    speechState: "idle",
    latestEvents: [],
    rawInterimTranscript: "",
    rawFinalTranscript: "",
    lastCommittedUtterance: "None",
    lastRouterStatus: "Idle",
    lastRouterResponse: "None",
    rawError: null,
  });

  const logDiagEvent = (eventName: string, detail?: string) => {
    const timeStr = new Date().toLocaleTimeString();
    setVoiceDiagData((prev) => ({
      ...prev,
      latestEvents: [...prev.latestEvents.slice(-20), { time: timeStr, event: eventName, detail }],
    }));
  };


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
  const firstName = useMemo(() => {
    if (userCustomName?.trim()) return userCustomName.trim();
    if (profileName?.trim()) {
      if (profileName.includes("Ony")) return "Ony";
      const parts = profileName.trim().split(/\s+/);
      return parts[0] || "Operator";
    }
    return "Operator";
  }, [userCustomName, profileName]);
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

  // Real Assistant Request Submission (Phase 1, 2, 4, 5)
  const submit = async (overrideValue?: string, origin: "text" | "voice" = "text") => {
    const readyAttachments = attachments.filter((a) => a.status === "done");
    const value = (overrideValue ?? prompt).trim();
    if ((!value && readyAttachments.length === 0) || isResponding || isUploadingAttachments) return;

    const promptText = value || (readyAttachments.length > 0 ? "Please analyze the attached document(s)." : "");
    if (!promptText) return;

    setEngaged(true);
    setIsResponding(true);
    setResponseError(null);

    // Phase 1.1: Immediately append user message to conversation history & state
    const userTurn = {
      role: "user" as const,
      content: promptText,
      attachments: readyAttachments.map((a) => ({ name: a.name, kind: a.kind })),
    };
    const updatedHistory = [...conversationHistory, userTurn];
    setConversationHistory(updatedHistory);
    if (typeof window !== "undefined") {
      localStorage.setItem("growforge.chat.history", JSON.stringify(updatedHistory));
    }

    setActiveUserPrompt(promptText);
    setActiveUserAttachments(readyAttachments.map((a) => ({ name: a.name, kind: a.kind })));
    setActiveResponse(null);
    if (conversationView === "closed") {
      onConversationViewChange("compact");
    }

    // Truthful neutral processing status without invented timer progression
    setProcessingStatus("Waiting for response...");

    const draftText = prompt;
    const draftAttachments = [...attachments];
    if (!overrideValue) {
      setPrompt("");
      setAttachments([]);
    }

    const attachmentContext = readyAttachments.length > 0
      ? `The client attached ${readyAttachments.length} file${readyAttachments.length === 1 ? "" : "s"} — use this as real context, not as something to ask the client to re-explain:\n\n${readyAttachments.map((a) => `--- Attached file: ${a.name} (${a.kind}) ---\n${a.extractedText}`).join("\n\n")}`
      : undefined;

    const historyPayload = updatedHistory.slice(-8).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    try {
      setVoiceDiagData((prev) => ({
        ...prev,
        lastRouterStatus: "POST /api/router (sending...)",
      }));

      const res = await fetch("/api/router", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: promptText,
          history: historyPayload,
          role,
          unlockedAgentIds,
          attachmentContext: [attachmentContext, noraSurfaceContext(contextSurface, selectedRecord, missionContext, departmentContext, agentContext, workflowContext, contextRecord, toolRecord, intelligenceRecord, diveScope)].filter(Boolean).join("\n\n"),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      setVoiceDiagData((prev) => ({
        ...prev,
        lastRouterStatus: `200 OK (${data.provider || 'Router'})`,
        lastRouterResponse: data.reply || "No reply text",
      }));

      const assistantTurn = {
        role: "assistant" as const,
        content: data.reply,
        provider: data.provider,
        model: data.model,
        fallbackOccurred: data.fallbackOccurred,
        fallbackFrom: data.fallbackFrom,
        media: data.media,
      };
      const finalHistory = [...updatedHistory, assistantTurn];
      setConversationHistory(finalHistory);
      if (typeof window !== "undefined") {
        localStorage.setItem("growforge.chat.history", JSON.stringify(finalHistory));
      }

      setActiveResponse({
        id: "resp-" + Date.now(),
        role: "assistant",
        content: data.reply,
        timestamp: new Date().toISOString(),
        provider: data.provider || "Router",
        model: data.model,
        fallbackOccurred: data.fallbackOccurred,
        fallbackFrom: data.fallbackFrom,
        media: data.media,
        mediaError: data.mediaError,
        dispatch: data.dispatch ?? null,
      });

      // Phase 5.3: Center-stage presentation for voice-triggered media
      if (origin === "voice" && data.media && data.media.length > 0) {
        setVoiceMediaArtifacts(data.media);
      }

      setSuccessPulse(true);
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => {
        setSuccessPulse(false);
      }, 400);
    } catch (err: unknown) {
      console.error("Assistant request error:", err);
      const errMsg = (err instanceof Error ? err.message : null) || "Failed to communicate with assistant router.";
      setVoiceDiagData((prev) => ({
        ...prev,
        lastRouterStatus: `Error (${errMsg})`,
      }));
      setResponseError(errMsg);
      setHasError(true);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      errorTimerRef.current = setTimeout(() => setHasError(false), 2000);
      // Restore draft text and attachments on failure
      setPrompt((prev) => prev || draftText);
      setAttachments((prev) => (prev.length > 0 ? prev : draftAttachments));
    } finally {
      setIsResponding(false);
      setProcessingStatus("");
    }
  };

  const handleVoiceInputToggle = () => {
    setVoiceInputEnabled((prev) => {
      const next = !prev;
      if (!next && (isVoiceSessionActiveRef.current || listening)) {
        isVoiceSessionActiveRef.current = false;
        if (turnCommitTimerRef.current) {
          clearTimeout(turnCommitTimerRef.current);
          turnCommitTimerRef.current = null;
        }
        accumulatedTranscriptRef.current = "";
        interimTranscriptRef.current = "";
        livekitClientRef.current?.stop();
        livekitClientRef.current = null;
        try { recognitionRef.current?.abort?.(); } catch {}
        recognitionRef.current = null;
        audioSamplerRef.current?.stop();
        window.dispatchEvent(new CustomEvent(NORA_AUDIO_EVENT, { detail: { energy: 0 } }));
        setListening(false);
        setVoiceRuntimeState("idle");
        setAgentSpeaking(false);
        setIsResponding(false);
        setLiveMicEnergy(0);
        onListeningChange?.(false);
        setVoiceDiagData((p) => ({ ...p, micOwner: "none", speechState: "idle", speechEnergy: 0, trackReadyState: "ended", trackEnabled: false, trackMuted: false, runtime: { state: "idle", connectionState: "disconnected", playbackStarted: false }, audioRms: 0, peakEnergy: 0, userAudioEnergy: 0 }));
      }
      return next;
    });
  };

  const toggleVoice = async () => {
    setEngaged(true);
    // If voice session is already active, user explicitly toggles it OFF
    if (isVoiceSessionActiveRef.current || listening) {
      isVoiceSessionActiveRef.current = false;
      if (turnCommitTimerRef.current) {
        clearTimeout(turnCommitTimerRef.current);
        turnCommitTimerRef.current = null;
      }
      accumulatedTranscriptRef.current = "";
      interimTranscriptRef.current = "";
      if (livekitClientRef.current) {
        await livekitClientRef.current.stop();
        livekitClientRef.current = null;
      }
      try { recognitionRef.current?.abort?.(); } catch {}
      recognitionRef.current = null;
      audioSamplerRef.current?.stop();
      window.dispatchEvent(new CustomEvent(NORA_AUDIO_EVENT, { detail: { energy: 0 } }));
      setListening(false);
      setVoiceRuntimeState("idle");
      setAgentSpeaking(false);
      setIsResponding(false);
      setLiveMicEnergy(0);
      onListeningChange?.(false);
      setVoiceDiagData((p) => ({ ...p, micOwner: "none", speechState: "idle", speechEnergy: 0, trackReadyState: "ended", trackEnabled: false, trackMuted: false, runtime: { state: "idle", connectionState: "disconnected", playbackStarted: false }, audioRms: 0, peakEnergy: 0, userAudioEnergy: 0 }));
      return;
    }

    if (!voiceInputEnabled) {
      setVoiceError("Voice input is disabled in Settings.");
      setHasError(true);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      errorTimerRef.current = setTimeout(() => {
        setHasError(false);
        setVoiceError(null);
      }, 2000);
      return;
    }

    // -------------------------------------------------------------
    // PRIMARY LOCAL VOICE PATH: LIVEKIT + FASTER-WHISPER + KOKORO
    // -------------------------------------------------------------
    if (voiceBackend === "livekit") {
      isVoiceSessionActiveRef.current = true;
      setVoiceRuntimeState("starting");
      setVoiceDiagData(prev => ({ ...prev, runtime: { state: "starting" }, rawFinalTranscript: "", rawInterimTranscript: "", lastCommittedUtterance: "", lastRouterResponse: "", micDeviceLabel: "None (mic off)", trackReadyState: "none", trackEnabled: false, lastRouterStatus: "idle", rawError: null }));
      setListening(false);
      onListeningChange?.(false);
      setVoiceError(null);

      let outboundSpeaking = false;
      const client = new LiveKitVoiceClient({
        getSurfaceContext: () => voiceSurfaceContextRef.current,
        assistantIdentity: resolveAssistantIdentity(assistantName, localStorage.getItem("growforge.assistantSpokenName") || undefined),
        onAudioEnergy: (energy, rms, peak) => {
          setLiveMicEnergy(energy);
          if (!outboundSpeaking) window.dispatchEvent(new CustomEvent(NORA_AUDIO_EVENT, { detail: { energy } }));
          const trackInfo = client.getTrackInfo();
          setVoiceDiagData((prev) => ({
            ...prev,
            voiceBackend: "livekit",
            micOwner: "browser_livekit",
            micDeviceLabel: trackInfo?.label || "Microphone (LiveKit)",
            trackEnabled: trackInfo?.enabled ?? true,
            trackMuted: trackInfo?.muted ?? false,
            trackReadyState: trackInfo?.readyState ?? "live",
            audioRms: rms,
            peakEnergy: peak,
            userAudioEnergy: energy,
          }));
        },
        onSpeechState: (speechState) => {
          outboundSpeaking = speechState === "speaking";
          if (!outboundSpeaking) window.dispatchEvent(new CustomEvent(NORA_AUDIO_EVENT, { detail: { energy: 0 } }));
          setVoiceRuntimeState(speechState);
          const receiving = speechState === "listening" || speechState === "user_speaking";
          setListening(receiving);
          onListeningChange?.(receiving);
          setAgentSpeaking(speechState === "speaking");
          setIsResponding(speechState === "thinking" || speechState === "transcribing");
          setVoiceDiagData((prev) => ({ ...prev, speechState }));
        },
        onConnectionChange: state => setVoiceDiagData(prev => ({ ...prev, livekitConnectionState: state })),
        onDiagnostics: data => {
          if (data.latencyMetrics) setVoiceDiagData(prev=>({...prev,latencyMetrics:data.latencyMetrics as typeof prev.latencyMetrics}));
          setVoiceDiagData(prev => ({ ...prev,
            runtime: { ...prev.runtime, ...data },
            roomName: typeof data.roomName === "string" ? data.roomName : prev.roomName,
            vadState: typeof data.vadState === "string" ? data.vadState : prev.vadState,
            turnDetectorState: typeof data.turnDetectorState === "string" ? data.turnDetectorState : prev.turnDetectorState,
            speechEnergy: typeof data.speechEnergy === "number" ? data.speechEnergy : prev.speechEnergy,
            lastRouterStatus: typeof data.dispatchType === "string" ? data.dispatchType : prev.lastRouterStatus,
            rawError: typeof data.rawError === "string" ? data.rawError : prev.rawError,
          }));
          if (typeof data.speechEnergy === "number" && data.agentSpeaking) window.dispatchEvent(new CustomEvent(NORA_AUDIO_EVENT, { detail: { energy: data.speechEnergy, isOutbound: true } }));
        },
        onTranscript: (text, final) => {
          if (!final) return;
          logDiagEvent("final_transcript", text);
          setVoiceDiagData(prev => ({ ...prev, rawFinalTranscript: text, lastCommittedUtterance: text }));
          setConversationHistory(prev => [...prev, { role: "user", content: text }]);
          // The agent already submitted this transcript to executeNoraTurn.
          // Display the receipt only; never dispatch it a second time.
        },
        onReply: (text, turnId) => {
          logDiagEvent("nora_reply", `Turn ${turnId}`);
          setVoiceDiagData(prev => ({ ...prev, lastRouterResponse: text }));
          setConversationHistory(prev => [...prev, { role: "assistant", content: text }]);
          setActiveResponse({ id: `voice-${Date.now()}-${turnId}`, role: "assistant", content: text, timestamp: new Date().toISOString() });
        },
        onError: (err) => {
          isVoiceSessionActiveRef.current = false;
          setListening(false);
          onListeningChange?.(false);
          setVoiceRuntimeState("error");
          setAgentSpeaking(false);
          setIsResponding(false);
          logDiagEvent("livekit_error", err.message);
          setVoiceDiagData((prev) => ({
            ...prev,
            rawError: err.message,
            speechState: "error",
          }));
          setVoiceError(`LiveKit Voice Error: ${err.message}`);
          setHasError(true);
        },
      });

      livekitClientRef.current = client;

      try {
        await client.start();
        if (!isVoiceSessionActiveRef.current) return;
        logDiagEvent("livekit_connected", "Room joined and microphone published; backend frame receipts required for Listening");
        setVoiceDiagData((prev) => ({
          ...prev,
          voiceBackend: "livekit",
          micOwner: "browser_livekit",
          fallbackOccurred: false,
        }));
      } catch (err: unknown) {
        console.error("Failed to start LiveKit Voice Client:", err);
        const errMsg = err instanceof Error ? err.message : "LiveKit connection failed";
        isVoiceSessionActiveRef.current = false;
        setListening(false);
        setVoiceRuntimeState("error");
        onListeningChange?.(false);
        setVoiceError(`LiveKit connection error: ${errMsg}`);
        setHasError(true);
        setVoiceDiagData((prev) => ({
          ...prev,
          micOwner: "none",
          speechState: "error",
          rawError: errMsg,
        }));
      }
      return;
    }

    // -------------------------------------------------------------
    // FALLBACK PATH ONLY: BROWSER SPEECH RECOGNITION
    // -------------------------------------------------------------
    const speechWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceError("Voice input is not supported by this browser.");
      setHasError(true);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      errorTimerRef.current = setTimeout(() => {
        setHasError(false);
        setVoiceError(null);
      }, 2000);
      return;
    }

    // Mark session explicitly ACTIVE
    isVoiceSessionActiveRef.current = true;
    setListening(true);
    onListeningChange?.(true);

    // Start audio sampler for visual CORE energy
    audioSamplerRef.current?.stop();
    const sampler = createAudioSampler();
    audioSamplerRef.current = sampler;
    void sampler.start((energy, rms, peak) => {
      setLiveMicEnergy(energy);
      window.dispatchEvent(new CustomEvent(NORA_AUDIO_EVENT, { detail: { energy } }));
      const track = sampler.getTrackInfo();
      setVoiceDiagData((prev) => ({
        ...prev,
        voiceBackend: "browser",
        micOwner: "browser_speechrecognition",
        micDeviceLabel: track?.label || "Default Microphone",
        trackEnabled: track?.enabled ?? true,
        trackMuted: track?.muted ?? false,
        trackReadyState: track?.readyState ?? "live",
        audioRms: rms ?? 0,
        peakEnergy: peak ?? 0,
        userAudioEnergy: energy,
        fallbackOccurred: true,
        fallbackReason: "Manual browser fallback mode selected",
      }));
    });

    const commitUtterance = (forceImmediate = false) => {
      if (turnCommitTimerRef.current) {
        clearTimeout(turnCommitTimerRef.current);
        turnCommitTimerRef.current = null;
      }

      const combined = (accumulatedTranscriptRef.current + " " + interimTranscriptRef.current).trim();
      if (!combined) return;

      // Avoid repeating exact same submission
      if (combined === lastSubmittedTranscriptRef.current) return;

      if (!forceImmediate) {
        turnCommitTimerRef.current = setTimeout(() => {
          commitUtterance(true);
        }, 750);
        return;
      }

      lastSubmittedTranscriptRef.current = combined;
      accumulatedTranscriptRef.current = "";
      interimTranscriptRef.current = "";

      setVoiceActive(true);
      if (voiceActiveTimerRef.current) clearTimeout(voiceActiveTimerRef.current);
      voiceActiveTimerRef.current = setTimeout(() => setVoiceActive(false), 1200);

      setVoiceDiagData((prev) => ({
        ...prev,
        lastCommittedUtterance: combined,
        speechState: "utterance-committed",
      }));

      if (typeof window !== "undefined") {
        (window as unknown as { __GROWFORGE_LAST_VOICE_TRANSCRIPT?: string }).__GROWFORGE_LAST_VOICE_TRANSCRIPT = combined;
      }

      console.log("[GROWFORGE VOICE] Utterance Committed:", combined);
      submit(combined, "voice");
    };

    const startRecognitionSession = () => {
      if (!isVoiceSessionActiveRef.current) return;

      try {
        const recognition = new Recognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = localStorage.getItem("growforge.voiceResponseLanguage") === "bn" ? "bn-BD" : navigator.language;

        recognition.onstart = () => {
          logDiagEvent("onstart");
          if (isVoiceSessionActiveRef.current) {
            setListening(true);
            onListeningChange?.(true);
            setVoiceDiagData((prev) => ({ ...prev, speechState: "listening" }));
          }
        };

        recognition.onaudiostart = () => {
          logDiagEvent("onaudiostart");
          setVoiceDiagData((prev) => ({ ...prev, speechState: "audio-started" }));
        };

        recognition.onsoundstart = () => {
          logDiagEvent("onsoundstart");
          setVoiceDiagData((prev) => ({ ...prev, speechState: "sound-detected" }));
        };

        recognition.onspeechstart = () => {
          logDiagEvent("onspeechstart");
          setVoiceActive(true);
          setVoiceDiagData((prev) => ({ ...prev, speechState: "speech-detected" }));
        };

        recognition.onresult = (event) => {
          let currentFinalChunk = "";
          let currentInterimChunk = "";

          for (let i = event.resultIndex || 0; i < event.results.length; i++) {
            const res = event.results[i];
            const transcript = res[0]?.transcript || "";
            if (res.isFinal) {
              currentFinalChunk += transcript + " ";
            } else {
              currentInterimChunk += transcript + " ";
            }
          }

          if (currentFinalChunk) {
            accumulatedTranscriptRef.current = (accumulatedTranscriptRef.current + " " + currentFinalChunk).trim();
            interimTranscriptRef.current = "";
          }
          if (currentInterimChunk) {
            interimTranscriptRef.current = currentInterimChunk.trim();
          }

          const currentSpeech = (accumulatedTranscriptRef.current + " " + interimTranscriptRef.current).trim();
          logDiagEvent("onresult", currentSpeech);
          setVoiceDiagData((prev) => ({
            ...prev,
            rawInterimTranscript: interimTranscriptRef.current,
            rawFinalTranscript: accumulatedTranscriptRef.current,
          }));

          if (currentSpeech) {
            setVoiceActive(true);
            // Trigger 750ms silence debounce timer to commit turn after user finishes speaking
            commitUtterance(false);
          }
        };

        recognition.onspeechend = () => {
          logDiagEvent("onspeechend");
          setVoiceDiagData((prev) => ({ ...prev, speechState: "speech-ended" }));
          // User paused speech. Shorten commit timer to 350ms for responsive turn submission
          if (accumulatedTranscriptRef.current || interimTranscriptRef.current) {
            if (turnCommitTimerRef.current) clearTimeout(turnCommitTimerRef.current);
            turnCommitTimerRef.current = setTimeout(() => {
              commitUtterance(true);
            }, 350);
          }
        };

        recognition.onsoundend = () => {
          logDiagEvent("onsoundend");
        };

        recognition.onaudioend = () => {
          logDiagEvent("onaudioend");
        };

        recognition.onend = () => {
          logDiagEvent("onend");
          // If there was any pending speech at recognition end boundary, commit it
          if (accumulatedTranscriptRef.current || interimTranscriptRef.current) {
            commitUtterance(true);
          }

          // If session is still active, automatically reconnect/restart without turning off mic
          if (isVoiceSessionActiveRef.current) {
            setTimeout(() => {
              if (isVoiceSessionActiveRef.current) {
                try {
                  recognition.start();
                } catch {
                  startRecognitionSession();
                }
              }
            }, 100);
          } else {
            audioSamplerRef.current?.stop();
            window.dispatchEvent(new CustomEvent(NORA_AUDIO_EVENT, { detail: { energy: 0 } }));
            setListening(false);
            onListeningChange?.(false);
            setVoiceDiagData((prev) => ({ ...prev, micOwner: "none", speechState: "idle" }));
          }
        };

        recognition.onerror = (event?: { error?: string }) => {
          const errType = event?.error || "unknown";
          logDiagEvent("onerror", errType);
          setVoiceDiagData((prev) => ({
            ...prev,
            rawError: errType,
            speechState: `error: ${errType}`,
          }));

          // Silence or temporary pause should NOT kill the voice session
          if (errType === "no-speech" || errType === "aborted") {
            return;
          }

          if (errType === "not-allowed" || errType === "service-not-allowed") {
            isVoiceSessionActiveRef.current = false;
            audioSamplerRef.current?.stop();
            window.dispatchEvent(new CustomEvent(NORA_AUDIO_EVENT, { detail: { energy: 0 } }));
            setListening(false);
            onListeningChange?.(false);
            setVoiceError(`Microphone error: ${errType}`);
            setHasError(true);
            if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
            errorTimerRef.current = setTimeout(() => {
              setHasError(false);
              setVoiceError(null);
            }, 4000);
          }
        };

        recognitionRef.current = recognition;
        recognition.start();
      } catch {
        if (!isVoiceSessionActiveRef.current) {
          audioSamplerRef.current?.stop();
          window.dispatchEvent(new CustomEvent(NORA_AUDIO_EVENT, { detail: { energy: 0 } }));
          setListening(false);
          onListeningChange?.(false);
        }
      }
    };

    startRecognitionSession();
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
  useEffect(() => {
    if (!isSpatialLayerVisible || dockHidden) return;
    const outside = (event: PointerEvent) => { if (event.target instanceof Element && !event.target.closest(".nora-conversation, .studio-command-dock-wrapper, [data-shell-visibility-control]")) onConversationViewChange("closed"); };
    window.addEventListener("pointerdown", outside);
    return () => window.removeEventListener("pointerdown", outside);
  }, [isSpatialLayerVisible, dockHidden, onConversationViewChange]);

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
    }} data-nora-hidden={dockHidden} data-nora-expanded={isSpatialLayerVisible && !dockHidden} data-nora-context={contextSurface === "Explore" && selectedRecord || contextSurface === "Dive In" && (intelligenceRecord || toolRecord || contextRecord || workflowContext || agentContext || departmentContext || missionContext) ? "selected" : undefined} className={`absolute inset-0 z-10 overflow-hidden ${useGpuCore ? "bg-transparent pointer-events-none" : "bg-[#010206]"}`}>
      {!useGpuCore && <CoreOrbField zoom={zoomProgress} />}

      <div
        aria-hidden={conversationOnly || greetingStage === "hidden" || greetingStage === "initial" || engaged}
        className={`absolute inset-x-4 top-[16%] z-20 text-center ${conversationOnly ? "hidden" : greetingOpacityClass} motion-reduce:transition-none`}
      >
        <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-[3.4rem] sm:leading-none">
          {greeting}, <span className="text-cyan-300">{firstName}.</span>
        </h1>
        <p className="mt-3 text-base text-slate-300/85 sm:text-[1.35rem]">{systemLine}</p>
      </div>

      {/* Ambient Instrument Cluster on the LEFT with Data-Change Signal Traces */}
      <div
        style={{ opacity: peripheralOpacity, display: conversationOnly ? "none" : undefined }}
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

      {/* ASSISTANT WORKSPACE LAYER (Responsive: Desktop Right-Side Spatial Panel / Mobile Centered Sheet / Compact Dock-Anchored) */}
      <div className="nora-workspace" aria-hidden={dockHidden} inert={dockHidden ? true : undefined}>
      <SpatialResponseLayer
        contextLabel={contextSurface === "Explore" && selectedRecord ? selectedRecord.title : contextSurface === "Dive In" && intelligenceRecord ? intelligenceRecord.title : contextSurface === "Dive In" && toolRecord ? toolRecord.title : contextSurface === "Dive In" && contextRecord ? contextRecord.title : contextSurface === "Dive In" && workflowContext ? workflowContext.title : contextSurface === "Dive In" && agentContext ? agentContext.title : contextSurface === "Dive In" && departmentContext ? departmentContext.title : contextSurface === "Dive In" && missionContext ? `Mission: ${missionContext.title}` : null}
        isOpen={isSpatialLayerVisible}
        viewMode={activeViewMode}
        onToggleViewMode={() => onConversationViewChange(activeViewMode === "compact" ? "expanded" : "compact")}
        isResponding={isResponding}
        processingStatus={processingStatus}
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
        isSettingsOpen={isLayerSettingsOpen}
        onCloseSettings={() => setIsLayerSettingsOpen(false)}
        onUserNameChange={handleUserNameChange}
        onAssistantNameChange={handleAssistantNameChange}
        voiceInputEnabled={voiceInputEnabled}
        onVoiceInputToggle={() => setVoiceInputEnabled(!voiceInputEnabled)}
        voiceOutputEnabled={voiceOutputEnabled}
        onVoiceOutputToggle={() => setVoiceOutputEnabled(!voiceOutputEnabled)}
        onSelectPrompt={(suggestionPrompt) => submit(suggestionPrompt)}
      />

      {/* VOICE GENERATED MEDIA CENTER PRESENTATION (Phase 5.3) */}
      {voiceMediaArtifacts && voiceMediaArtifacts.length > 0 && (
        <VoiceMediaCenterCard
          media={voiceMediaArtifacts}
          onClose={() => setVoiceMediaArtifacts(null)}
          assistantName={assistantName}
        />
      )}

      {/* STUDIO COMMAND DOCK WRAPPER (Centered at bottom) */}
      <div ref={stackRef} className="pointer-events-auto absolute left-1/2 studio-command-dock-wrapper z-30 flex w-[min(650px,calc(100vw-1.5rem))] -translate-x-1/2 flex-col gap-3">


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
                  className="inline-flex shrink-0 items-center gap-1 rounded-md sm:rounded-lg border border-cyan-400/30 bg-[#061122]/95 px-2 py-0.5 sm:px-2.5 sm:py-1 text-[11px] sm:text-xs text-cyan-200 shadow-md backdrop-blur-md transition-all hover:border-cyan-400/50 hover:bg-[#08172e]"
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

            <div ref={attachmentMenuRef} className="nora-attachment-anchor">
              <ReactiveOrb state={orbState} open={attachmentMenuOpen} disabled={isUploadingAttachments} onClick={() => setAttachmentMenuOpen(v=>!v)} />
              {attachmentMenuOpen && <div role="menu" aria-label="Attachment options" className="nora-menu nora-attachment-menu">
                <button type="button" role="menuitem" onClick={() => {if(fileInputRef.current){fileInputRef.current.accept='.pdf,.docx,.txt,.md,.csv';fileInputRef.current.click();}setAttachmentMenuOpen(false);}}><FileText size={18}/><span>Upload a file<small>PDF, DOCX, TXT, MD, CSV</small></span></button>
                <button type="button" role="menuitem" onClick={() => {if(fileInputRef.current){fileInputRef.current.accept='image/*';fileInputRef.current.click();}setAttachmentMenuOpen(false);}}><ImageIcon size={18}/><span>Upload an image<small>Supported images, up to 15 MB</small></span></button>
              </div>}
            </div>
            <span aria-hidden="true" className="nora-composer-separator" />
            {/* 2. CENTER: Editable text input OR In-Composer Voice Waveform */}
            {listening || (voiceBackend === "livekit" && !["idle", "error"].includes(voiceRuntimeState)) ? (
              <div className="flex flex-1 items-center gap-2 px-1.5 sm:px-2 min-w-0">
                {listening && <ComposerVoiceWave energy={liveMicEnergy} />}
                <span className="truncate text-xs sm:text-sm text-cyan-100 font-mono italic">
                  {voiceBackend === "livekit" ? `${voiceRuntimeState.replaceAll("_", " ")} · ${voiceDiagData.rawFinalTranscript || ""}` : voiceDiagData.rawInterimTranscript || voiceDiagData.rawFinalTranscript || "Listening..."}
                </span>
              </div>
            ) : (
              <input
                value={prompt}
                onFocus={() => {
                  setEngaged(true);
                  setIsFocused(true);
                  onConversationViewChange("expanded");
                }}
                onBlur={() => setIsFocused(false)}
                onChange={handleInputChange}
                placeholder={
                  isUploadingAttachments
                    ? "Processing..."
                    : voiceError || (attachments.length > 0 ? "Ask about attached..." : "Start a conversation...")
                }
                aria-label="Start a conversation"
                className="relative min-w-0 flex-1 bg-transparent px-1.5 sm:px-2 text-xs sm:text-sm md:text-[1.05rem] text-white outline-none placeholder:text-slate-400/65"
              />
            )}

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

            {/* 5. Microphone Button */}
            {onHideDock && <button type="button" onClick={onHideDock} aria-label="Hide NORA Dock" title="Hide NORA Dock" className="shell-dock-collapse"><GrowForgeGlyph name="fold" size={14} /></button>}
            <button
              type="button"
              onClick={toggleVoice}
              aria-pressed={listening || !["idle", "error"].includes(voiceRuntimeState)}
              data-voice-state={voiceRuntimeState}
              aria-label={listening || !["idle", "error"].includes(voiceRuntimeState) ? "Stop listening" : "Start voice input"}
              title={listening || !["idle", "error"].includes(voiceRuntimeState) ? "Stop listening" : "Start voice input"}
              className={`grid h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10 place-items-center rounded-full transition-all duration-200 active:scale-95 ${
                voiceRuntimeState === "error"
                  ? "bg-rose-500/15 text-rose-300 border border-rose-500/50"
                  : voiceRuntimeState === "starting"
                  ? "bg-cyan-500/10 text-cyan-200 border border-cyan-500/30 animate-pulse motion-reduce:animate-none"
                  : listening || !["idle", "error"].includes(voiceRuntimeState)
                  ? "bg-cyan-400/20 text-cyan-100 border border-cyan-300/70 shadow-[0_0_12px_rgba(34,211,238,0.25)]"
                  : "bg-white/[0.06] text-slate-300 hover:text-white hover:bg-white/[0.12] border border-white/10"
              }`}
            >
              <GrowForgeGlyph name="voice" className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-5 md:w-5" />
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
              <GrowForgeGlyph name="transmit" className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-5 md:w-5" />
            </button>
          </form>

          {/* Conversation Settings Popover from Dock */}
          <ConversationSettingsPopover
            isOpen={isDockSettingsOpen}
            onClose={() => setIsDockSettingsOpen(false)}
            position="dock"
            userName={userCustomName}
            onUserNameChange={handleUserNameChange}
            assistantName={assistantName}
            onAssistantNameChange={handleAssistantNameChange}
            voiceInputEnabled={voiceInputEnabled}
            onVoiceInputToggle={handleVoiceInputToggle}
            voiceOutputEnabled={voiceOutputEnabled}
            onVoiceOutputToggle={() => setVoiceOutputEnabled(!voiceOutputEnabled)}
          />
          {/* Live Voice Diagnostics Panel */}
          <VoiceDiagnosticsPanel
            data={voiceDiagData}
            isOpen={isVoiceDiagOpen}
            onToggle={() => setIsVoiceDiagOpen((v) => !v)}
            onBackendChange={(b) => {
              setVoiceBackend(b);
              setVoiceDiagData((prev) => ({ ...prev, voiceBackend: b }));
            }}
          />

        </div>
      </div>
      </div>
    </section>
  );
}

