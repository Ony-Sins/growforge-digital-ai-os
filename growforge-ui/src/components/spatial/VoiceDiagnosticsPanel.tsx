import React from "react";
import { AlertCircle, Radio, X, Zap } from "lucide-react";
import { isPublicPreviewMode } from "@/lib/previewMode";
import { VoiceSTTEvaluation } from "./VoiceSTTEvaluation";

export interface LatencyMetrics {
  speech_end_to_transcript_ms?: number;
  speech_end_to_nora_start_ms?: number;
  nora_duration_ms?: number;
  nora_finish_to_first_tts_audio_ms?: number;
  speech_end_to_received_audio_ms?: number;
}

export interface VoiceDiagnosticsData {
  runtime?: Record<string, unknown>;
  voiceBackend: "livekit" | "browser";
  micOwner: "browser_livekit" | "desktop_audio_participant" | "browser_speechrecognition" | "none";
  livekitConnectionState?: string;
  roomName?: string;
  micDeviceLabel: string;
  trackEnabled: boolean;
  trackMuted: boolean;
  trackReadyState: string;
  audioRms: number;
  peakEnergy: number;
  userAudioEnergy?: number;
  speechEnergy?: number;
  speechState: string;
  vadState?: string;
  turnDetectorState?: string;
  latestEvents: Array<{ time: string; event: string; detail?: string }>;
  rawInterimTranscript: string;
  rawFinalTranscript: string;
  lastCommittedUtterance: string;
  lastRouterStatus: string;
  lastRouterResponse: string;
  rawError: string | null;
  fallbackOccurred?: boolean;
  fallbackReason?: string;
  latencyMetrics?: LatencyMetrics;
}

interface VoiceDiagnosticsPanelProps {
  data: VoiceDiagnosticsData;
  isOpen: boolean;
  onToggle: () => void;
  onBackendChange?: (backend: "livekit" | "browser") => void;
}

export function VoiceDiagnosticsPanel({
  data,
  isOpen,
  onToggle,
  onBackendChange,
}: VoiceDiagnosticsPanelProps) {
  // Never expose diagnostics in public preview/remote SaaS mode
  if (process.env.NODE_ENV !== "development" || isPublicPreviewMode()) {
    return null;
  }

  if (!isOpen) {
    return null;
  }

  return (
    <aside
      aria-label="Voice Engine Diagnostics"
      className="fixed bottom-20 right-4 z-50 w-[calc(100vw-2rem)] max-w-[420px] max-h-[calc(100dvh-12rem)] overflow-y-auto rounded-xl border border-cyan-500/30 bg-[#050e1c]/95 p-3.5 font-mono text-xs text-slate-300 shadow-[0_0_30px_rgba(0,0,0,0.85)] backdrop-blur-xl"
    >
      <header className="flex items-center justify-between border-b border-white/10 pb-2 mb-2.5">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-cyan-400 animate-pulse" />
          <span className="font-semibold tracking-wider text-cyan-200">VOICE ENGINE DIAGNOSTICS</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggle}
            className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white transition"
            aria-label="Close diagnostics"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <div className="space-y-2">
        <details open><summary>Live transport and backend receipts</summary><pre className="whitespace-pre-wrap break-all">{JSON.stringify(data.runtime || {}, null, 2)}</pre></details>
        {/* Row 1: Backend & Owner */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded border border-white/5 bg-white/[0.02] p-2">
            <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase">
              <span>Voice Backend</span>
              {onBackendChange && (
                <button
                  type="button"
                  onClick={() => onBackendChange(data.voiceBackend === "livekit" ? "browser" : "livekit")}
                  className="text-[9px] text-cyan-400 hover:underline"
                >
                  Switch
                </button>
              )}
            </div>
            <div className="font-bold text-cyan-300 mt-0.5">
              {data.voiceBackend === "livekit" ? "LIVEKIT (Local Primary)" : "BROWSER (Fallback)"}
            </div>
          </div>
          <div className="rounded border border-white/5 bg-white/[0.02] p-2">
            <div className="text-[10px] text-slate-400 uppercase">Mic Owner</div>
            <div className={`font-bold mt-0.5 ${data.micOwner === "none" ? "text-slate-400" : "text-emerald-400"}`}>
              {data.micOwner.toUpperCase()}
            </div>
          </div>
        </div>

        {/* Fallback Banner if applicable */}
        {data.fallbackOccurred && (
          <div className="rounded border border-amber-500/40 bg-amber-950/40 p-2 text-amber-300">
            <div className="flex items-center gap-1 text-[10px] font-bold text-amber-400 uppercase">
              <AlertCircle className="h-3 w-3" />
              <span>Voice Fallback Active</span>
            </div>
            <div className="mt-0.5 text-[10px]">{data.fallbackReason || "Switched to browser speech recognition fallback"}</div>
          </div>
        )}

        {/* Row 2: Selected Hardware Device */}
        <div className="rounded border border-white/5 bg-white/[0.02] p-2">
          <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase mb-0.5">
            <span>Microphone Device</span>
            <span className="text-[9px] text-cyan-400">{data.trackReadyState}</span>
          </div>
          <div className="truncate font-medium text-slate-100" title={data.micDeviceLabel}>
            {data.micDeviceLabel}
          </div>
          <div className="mt-1 flex items-center gap-3 text-[10px] text-slate-400">
            <span>Enabled: <strong className={data.trackEnabled ? "text-emerald-400" : "text-rose-400"}>{String(data.trackEnabled)}</strong></span>
            <span>Muted: <strong className={data.trackMuted ? "text-rose-400" : "text-emerald-400"}>{String(data.trackMuted)}</strong></span>
            {data.roomName && <span>Room: <strong className="text-cyan-300">{data.roomName}</strong></span>}
          </div>
        </div>

        {/* Row 3: Audio Energy Meters (Inbound vs Outbound) */}
        <div className="rounded border border-white/5 bg-white/[0.02] p-2 space-y-1.5">
          <div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase mb-0.5">
              <span>Inbound Mic RMS: <strong className="text-cyan-300">{data.audioRms.toFixed(4)}</strong></span>
              <span>Peak: <strong className="text-cyan-300">{data.peakEnergy.toFixed(4)}</strong></span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-75"
                style={{ width: `${Math.min(100, Math.max(0, data.audioRms * 200))}%` }}
              />
            </div>
          </div>
          {typeof data.speechEnergy === "number" && (
            <div>
              <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase mb-0.5">
                <span>Outbound NORA Voice: <strong className="text-teal-300">{(data.speechEnergy * 100).toFixed(1)}%</strong></span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-teal-500 to-amber-400 transition-all duration-75"
                  style={{ width: `${Math.min(100, Math.max(0, data.speechEnergy * 100))}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Row 4: Pipeline Architecture Status */}
        <div className="grid grid-cols-3 gap-1.5 text-center">
          <div className="rounded border border-white/5 bg-white/[0.02] p-1.5">
            <div className="text-[9px] text-slate-400 uppercase">STT Model</div>
            <div className="text-[10px] font-bold text-cyan-300">faster-whisper base.en · int8</div>
          </div>
          <div className="rounded border border-white/5 bg-white/[0.02] p-1.5">
            <div className="text-[9px] text-slate-400 uppercase">Turn Detector</div>
            <div className="text-[10px] font-bold text-emerald-300">Silero VAD + v1-mini</div>
          </div>
          <div className="rounded border border-white/5 bg-white/[0.02] p-1.5">
            <div className="text-[9px] text-slate-400 uppercase">TTS Voice</div>
            <div className="text-[10px] font-bold text-amber-300">Kokoro af_heart</div>
          </div>
        </div>

        {/* Row 5: Latency Waterfall Metrics */}
        {data.latencyMetrics && (
          <div className="rounded border border-cyan-500/20 bg-cyan-950/20 p-2 text-[10px]">
            <div className="flex items-center gap-1 font-semibold text-cyan-300 uppercase mb-1">
              <Zap className="h-3 w-3" />
              <span>Latency Waterfall</span>
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-slate-300">
              <div>Speech end → Transcript:</div>
              <div className="font-mono text-cyan-200">{data.latencyMetrics.speech_end_to_transcript_ms ?? "—"}ms</div>
              <div>NORA duration:</div>
              <div className="font-mono text-cyan-200">{data.latencyMetrics.nora_duration_ms ?? "—"}ms</div>
              <div>NORA finish → First TTS:</div>
              <div className="font-mono text-cyan-200">{data.latencyMetrics.nora_finish_to_first_tts_audio_ms ?? "—"}ms</div>
              <div className="font-bold text-emerald-400">Speech end → Received audio:</div>
              <div className="font-mono font-bold text-emerald-300">{data.latencyMetrics.speech_end_to_received_audio_ms ?? "—"}ms</div>
            </div>
            <p className="mt-1 text-slate-400">Received audio is a playback proxy. Physical audibility still needs your acceptance.</p>
          </div>
        )}

        {/* Error Banner */}
        {data.rawError && (
          <div className="rounded border border-rose-500/40 bg-rose-950/40 p-2 text-rose-300">
            <div className="flex items-center gap-1 text-[10px] font-bold text-rose-400 uppercase">
              <AlertCircle className="h-3 w-3" />
              <span>Voice Error</span>
            </div>
            <div className="mt-0.5 break-all text-[11px] font-medium">{data.rawError}</div>
          </div>
        )}

        {/* Row 6: Interim & Final Transcripts */}
        <div className="space-y-1.5">
          <div className="rounded border border-white/5 bg-white/[0.02] p-2">
            <div className="text-[10px] text-amber-400/90 uppercase font-semibold">Live Interim Transcript</div>
            <div className="mt-0.5 min-h-[18px] text-[11px] text-amber-200 italic break-words">
              {data.rawInterimTranscript ? `"${data.rawInterimTranscript}"` : <span className="text-slate-500 font-normal">{data.voiceBackend === "livekit" ? "Batch Whisper: final transcript after your turn." : "Waiting for speech..."}</span>}
            </div>
          </div>

          <div className="rounded border border-white/5 bg-white/[0.02] p-2">
            <div className="text-[10px] text-emerald-400/90 uppercase font-semibold">Accumulated Final Transcript</div>
            <div className="mt-0.5 min-h-[18px] text-[11px] text-emerald-200 break-words">
              {data.rawFinalTranscript ? `"${data.rawFinalTranscript}"` : <span className="text-slate-500">None yet</span>}
            </div>
          </div>
        </div>

        {/* Row 7: Last Committed Utterance */}
        <div className="rounded border border-cyan-500/20 bg-cyan-950/20 p-2">
          <div className="text-[10px] text-cyan-400 uppercase font-semibold">Last Committed Utterance</div>
          <div className="mt-0.5 text-[11px] text-cyan-100 break-words">
            {data.lastCommittedUtterance || "None"}
          </div>
        </div>

        {/* Row 8: NORA Turn Response */}
        <div className="rounded border border-white/5 bg-white/[0.02] p-2 text-[11px]">
          <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase">
            <span>NORA Turn Status</span>
            <span className="text-slate-300">{data.lastRouterStatus}</span>
          </div>
          <div className="mt-1 line-clamp-3 text-[10px] text-slate-300">
            {data.lastRouterResponse || "No response yet"}
          </div>
        </div>
        <label className="block mt-3">Reply language
          <select aria-label="Voice reply language" className="ml-2 bg-slate-950 border rounded p-1" defaultValue={typeof window!=="undefined" ? localStorage.getItem("growforge.voiceResponseLanguage") || "auto" : "auto"} onChange={event=>localStorage.setItem("growforge.voiceResponseLanguage",event.target.value)}>
            <option value="auto">Mirror my language</option><option value="en">English</option><option value="bn">Bangla</option>
          </select>
        </label>
        <p className="mt-1 text-slate-400">Applies to the next voice session. Bangla audio requires a validated Bangla TTS provider.</p>
        <VoiceSTTEvaluation voiceEnabled={data.micOwner !== "none"}/>
      </div>
    </aside>
  );
}
