/**
 * Authoritative Browser LiveKit Voice Client Manager.
 * Connects the GrowForge browser interface to the local LiveKit server as a standard client participant.
 * Publishes real browser microphone audio and subscribes to NORA TTS audio for speaker output.
 */

import {
  Room,
  RoomEvent,
  Track,
  LocalAudioTrack,
  RemoteTrackPublication,
  RemoteParticipant,
  createLocalAudioTrack,
  ConnectionState,
} from "livekit-client";
import { isDesktopBridgeEnabled } from "./noraVisualSignal";

export interface LiveKitVoiceClientOptions {
  assistantIdentity?: { displayName: string; spokenName: string; wakeName: string };
  conversationId?: string;
  getSurfaceContext?: () => string;
  url?: string;
  roomName?: string;
  participantIdentity?: string;
  participantName?: string;
  onAudioEnergy?: (energy: number, rms: number, peak: number) => void;
  onSpeechState?: (state: string) => void;
  onTranscript?: (transcript: string, isFinal: boolean) => void;
  onConnectionChange?: (state: ConnectionState) => void;
  onError?: (err: Error) => void;
  onDiagnostics?: (data: Record<string, unknown>) => void;
  onReply?: (text: string, turnId: number) => void;
}

export interface LiveKitVoiceClientState {
  isConnected: boolean;
  isPublishingMic: boolean;
  micOwner: "browser_livekit" | "browser_speechrecognition" | "desktop_audio_participant" | "none";
  deviceLabel: string;
  trackReadyState: string;
  roomSid?: string;
}

export class LiveKitVoiceClient {
  private room: Room | null = null;
  private localAudioTrack: LocalAudioTrack | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private outputAnalyser: AnalyserNode | null = null;
  private outputStream: MediaStream | null = null;
  private outputPublished = false;
  private outputTurn = 0;
  private outputSpeechEnd = 0;
  private animFrameId: number | null = null;
  private remoteAudioElement: HTMLAudioElement | null = null;
  private isRunning = false;
  private generation = 0;
  private lastBackendFrame = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private lastTranscript = "";
  private lastReplyTurn = 0;
  private sessionConfigured = false;
  private lastInterruptAt = 0;
  private lastPlaybackTurn = 0;
  private lastPlaybackEndTurn = 0;
  private options: LiveKitVoiceClientOptions;
  private lastSurfaceContext = "";
  private readonly conversationId: string;

  constructor(options: LiveKitVoiceClientOptions = {}) {
    this.conversationId = options.conversationId || crypto.randomUUID();
    this.options = {
      url: options.url || "ws://127.0.0.1:7880",
      roomName: options.roomName || "room_vs_headless_default",
      participantIdentity: options.participantIdentity || "browser_user_" + Math.random().toString(36).slice(2, 8),
      participantName: options.participantName || "Browser voice",
      ...options,
    };
  }

  /**
   * Generates a client token for local loopback development LiveKit room.
   */
  private async getLocalToken(): Promise<string> {
    const res = await fetch("/api/nora/voice-token", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room: this.options.roomName }),
    });
    const data = await res.json();
    if (!res.ok || !data.token) throw new Error(`TOKEN_FAILURE: ${data.error || res.status}`);
    if (data.room !== this.options.roomName) throw new Error("ROOM_MISMATCH");
    this.options.participantIdentity = data.identity;
    this.options.url = data.url;
    return data.token;
  }

  /**
   * Connects to the local LiveKit room, acquires the microphone, and publishes the audio track.
   */
  public async start(): Promise<void> {
    if (this.isRunning) return;
    if (!isDesktopBridgeEnabled()) throw new Error("LOCAL_VOICE_UNAVAILABLE");
    this.isRunning = true;
    const generation = ++this.generation;
    this.options.onSpeechState?.("starting");

    try {
      // 1. Acquire client token
      const token = await this.getLocalToken();
      if (!this.isRunning || generation !== this.generation) return;

      // 2. Initialize LiveKit Room
      this.room = new Room({
        adaptiveStream: false,
        dynacast: false,
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        this.options.onConnectionChange?.(state);
        if (state === ConnectionState.Disconnected && this.isRunning) this.fail("ROOM_JOIN_FAILED");
      });
      this.room.on(RoomEvent.ParticipantDisconnected, participant => {
        if (participant.identity === "nora_voice_agent") this.fail("AGENT_NOT_PRESENT");
      });
      this.room.on(RoomEvent.DataReceived, (bytes, participant, _kind, topic) => {
        if (topic !== "nora.voice" || participant?.identity !== "nora_voice_agent") return;
        try {
          const data = JSON.parse(new TextDecoder().decode(bytes));
          if (data.inputParticipant !== this.room?.localParticipant.identity) return;
          if (typeof data.turnId === "number") {
            if (data.turnId !== this.outputTurn) this.outputPublished = false;
            this.outputTurn = data.turnId;
            this.outputPublished = Boolean(data.firstPublishedPcm) && Boolean(data.agentSpeaking);
          }
          if (typeof data.speech_end === "number") this.outputSpeechEnd = data.speech_end;
          const surfaceContext = this.options.getSurfaceContext?.() || "";
          if (!this.sessionConfigured || surfaceContext !== this.lastSurfaceContext || data.conversationId !== this.conversationId) {
            this.sessionConfigured = true;
            this.lastSurfaceContext = surfaceContext;
            void this.room?.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({type:"session_config",...this.options.assistantIdentity,conversationId:this.conversationId,surfaceContext,responseLanguage:localStorage.getItem("growforge.voiceResponseLanguage") || "auto"})), {reliable:true,topic:"nora.control"});
          }
          if (this.remoteAudioElement && data.interrupted) {
            this.remoteAudioElement.muted = true;
            if (data.interruptDetectedAt !== this.lastInterruptAt) {
              this.lastInterruptAt = data.interruptDetectedAt;
              const mutedAt = Date.now()/1000;
              this.options.onDiagnostics?.({ playbackMutedAt: mutedAt, playbackInterrupted: true, interruptBrowserMuteMs: (mutedAt-data.interruptDetectedAt)*1000 });
              void this.room?.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({type:"playback_receipt",event:"interruption_muted",at:mutedAt,turnId:data.turnId})),{reliable:true,topic:"nora.control"});
            }
          } else if (this.remoteAudioElement && data.agentSpeaking) {
            this.remoteAudioElement.muted = false;
          }
          if (data.audioFrameCount > 0 && Date.now()/1000 - data.audioFrameAt < 3) {
            this.lastBackendFrame = Date.now();
            this.options.onSpeechState?.(data.state || "connected");
          }
          this.options.onDiagnostics?.(data);
          if (data.lifecycleEvent === "return_to_listening" && data.turnId > this.lastPlaybackEndTurn) {
            this.lastPlaybackEndTurn = data.turnId;
            this.options.onDiagnostics?.({ playbackEndReceipt: Date.now()/1000 });
            void this.room?.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({type:"playback_receipt",event:"playback_end_receipt",at:Date.now()/1000,turnId:data.turnId})),{reliable:true,topic:"nora.control"});
          }
          if (data.rawError) this.fail(String(data.rawError));
          const transcriptReceipt = `${data.sttFinish}:${data.finalTranscript}`;
          if (data.finalTranscript && transcriptReceipt !== this.lastTranscript) {
            this.lastTranscript = transcriptReceipt;
            this.options.onTranscript?.(data.finalTranscript, true);
          }
          if (data.noraReply && data.turnId > this.lastReplyTurn) {
            this.lastReplyTurn = data.turnId;
            this.options.onReply?.(data.noraReply, data.turnId);
          }
        } catch (error) { this.fail("VOICE_EVENT_INVALID", error); }
      });

      // 3. Handle incoming NORA TTS audio track
      this.room.on(
        RoomEvent.TrackSubscribed,
        (track: Track, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
          if (track.kind === Track.Kind.Audio && participant.identity === "nora_voice_agent") {
            console.log(`[LIVEKIT VOICE CLIENT] Subscribed to remote audio track from ${participant.identity}`);
            if (typeof window !== "undefined") {
              if (!this.remoteAudioElement) {
                this.remoteAudioElement = document.createElement("audio");
                this.remoteAudioElement.autoplay = true;
                this.remoteAudioElement.id = "nora-remote-audio-playback";
                document.body.appendChild(this.remoteAudioElement);
              }
              track.attach(this.remoteAudioElement);
              if (track.mediaStreamTrack) {
                this.outputStream = new MediaStream([track.mediaStreamTrack]);
                this.attachOutputAnalyser();
              }
              this.options.onDiagnostics?.({ outputTrackSid: publication.trackSid, outputParticipant: participant.identity });
              void this.remoteAudioElement.play().then(() => {
                this.options.onDiagnostics?.({ playbackStarted: true });
              }).catch(error => this.fail("PLAYBACK_BLOCKED", error));
            }
          }
        },
      );

      this.room.on(RoomEvent.TrackUnsubscribed, (track: Track) => {
        if (track.kind === Track.Kind.Audio && this.remoteAudioElement) {
          track.detach(this.remoteAudioElement);
        }
      });

      // 4. Connect to Room
      await this.room.connect(this.options.url!, token);
      if (!this.isRunning || generation !== this.generation) { await this.stop(); return; }
      if (![...this.room.remoteParticipants.values()].some(p => p.identity === "nora_voice_agent")) throw new Error("AGENT_NOT_PRESENT");
      await this.room.startAudio();
      this.options.onSpeechState?.("connected");
      this.options.onDiagnostics?.({ roomName: this.room.name, roomSid: await this.room.getSid(), participantIdentity: this.room.localParticipant.identity, connectionState: this.room.state });
      console.log(`[LIVEKIT VOICE CLIENT] Connected to ${this.options.url} (Room: ${this.options.roomName})`);

      // 5. Acquire Microphone & Publish Track
      this.localAudioTrack = await createLocalAudioTrack({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });

      if (!this.isRunning || generation !== this.generation) { await this.stop(); return; }
      const publication = await this.room.localParticipant.publishTrack(this.localAudioTrack, { source: Track.Source.Microphone });
      this.options.onDiagnostics?.({ microphoneSid: publication.trackSid, microphoneSource: publication.source, microphoneMuted: publication.isMuted });
      this.options.onDiagnostics?.({ microphoneSettings: this.localAudioTrack.mediaStreamTrack.getSettings(), microphoneConstraints: this.localAudioTrack.mediaStreamTrack.getConstraints() });
      console.log(`[LIVEKIT VOICE CLIENT] Published local microphone track: ${this.localAudioTrack.mediaStreamTrack.label}`);

      // 6. Start Audio Energy Analyser
      this.startAudioEnergySampling();

      // 7. Inform Desktop Bridge of mic ownership
      this.lastBackendFrame = Date.now();
      this.watchdog = setInterval(() => {
        if (this.isRunning && Date.now() - this.lastBackendFrame > 8000) this.fail("NO_AUDIO_FRAMES");
        void this.localAudioTrack?.getSenderStats().then(stats => {
          if (stats) this.options.onDiagnostics?.({ micBytesSent: stats.bytesSent, micPacketsSent: stats.packetsSent });
        }).catch(() => {});
      }, 1000);
    } catch (err: unknown) {
      await this.stop();
      const error = err instanceof Error ? err : new Error(String(err));
      this.options.onError?.(error);
      throw error;
    }
  }

  private fail(code: string, cause?: unknown): void {
    if (cause && process.env.NODE_ENV === "development") console.warn(`[VOICE] ${code}`, cause instanceof Error ? cause.name : "runtime failure");
    this.options.onSpeechState?.("error");
    this.options.onError?.(new Error(code));
    void this.stop();
  }

  /**
   * Starts Web Audio Analyser node to sample microphone RMS and peak energy at ~60fps.
   */
  private startAudioEnergySampling(): void {
    if (!this.localAudioTrack || typeof window === "undefined") return;

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      this.audioContext = new AudioCtx();
      void this.audioContext.resume();
      const mediaStream = new MediaStream([this.localAudioTrack.mediaStreamTrack]);
      const sourceNode = this.audioContext.createMediaStreamSource(mediaStream);

      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.3;
      sourceNode.connect(this.analyser);
      this.attachOutputAnalyser();

      const bufferLength = this.analyser.fftSize;
      const dataArray = new Float32Array(bufferLength);

      const sample = () => {
        if (!this.isRunning || !this.analyser) return;

        this.analyser.getFloatTimeDomainData(dataArray);

        let sumSquares = 0;
        let peak = 0;

        for (let i = 0; i < bufferLength; i++) {
          const val = dataArray[i];
          const abs = Math.abs(val);
          if (abs > peak) peak = abs;
          sumSquares += val * val;
        }

        const rms = Math.sqrt(sumSquares / bufferLength);
        // Normalize energy (0.0 to 1.0)
        const normalizedEnergy = Math.min(1.0, Math.max(0.0, rms * 5.0));

        this.options.onAudioEnergy?.(normalizedEnergy, rms, peak);
        if (this.outputPublished && this.outputAnalyser && this.outputTurn > this.lastPlaybackTurn && this.remoteAudioElement &&
            !this.remoteAudioElement.paused && !this.remoteAudioElement.muted && this.remoteAudioElement.volume > 0) {
          const output = new Float32Array(this.outputAnalyser.fftSize);
          this.outputAnalyser.getFloatTimeDomainData(output);
          const outputRms = Math.sqrt(output.reduce((sum,value)=>sum+value*value,0)/output.length);
          if (outputRms > 0.001) {
            this.lastPlaybackTurn = this.outputTurn;
            const at = Date.now()/1000;
            const receipt = {type:"playback_receipt",event:"playback_start",at,turnId:this.outputTurn,
              speechEndToReceivedAudioMs: this.outputSpeechEnd ? (at-this.outputSpeechEnd)*1000 : null,
              measurementScope:"non-silent received PCM with unpaused, unmuted player; physical speaker audibility requires human acceptance"};
            this.options.onDiagnostics?.({playbackStart:at, ...receipt});
            void this.room?.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(receipt)), {reliable:true,topic:"nora.control"});
          }
        }

        this.animFrameId = requestAnimationFrame(sample);
      };

      this.animFrameId = requestAnimationFrame(sample);
    } catch (e) {
      console.warn("[LIVEKIT VOICE CLIENT] Audio energy analyzer warning:", e);
    }
  }

  /**
   * Stops sampling and releases Web Audio context.
   */
  private stopAudioEnergySampling(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.audioContext) {
      try {
        void this.audioContext.close();
      } catch {}
      this.audioContext = null;
    }
    this.analyser = null;
    this.outputAnalyser = null;
    this.outputStream = null;
  }

  private attachOutputAnalyser(): void {
    if (!this.audioContext || !this.outputStream || this.outputAnalyser) return;
    this.outputAnalyser = this.audioContext.createAnalyser();
    this.outputAnalyser.fftSize = 512;
    this.audioContext.createMediaStreamSource(this.outputStream).connect(this.outputAnalyser);
  }

  /**
   * Cleanly disconnects from LiveKit room and releases microphone track.
   */
  public async stop(): Promise<void> {
    this.isRunning = false;
    this.generation++;
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
    this.stopAudioEnergySampling();

    if (this.localAudioTrack) {
      try {
        if (this.room?.localParticipant) {
          await this.room.localParticipant.unpublishTrack(this.localAudioTrack);
        }
        this.localAudioTrack.stop();
      } catch {}
      this.localAudioTrack = null;
    }

    if (this.remoteAudioElement) {
      try {
        this.remoteAudioElement.pause();
        this.remoteAudioElement.srcObject = null;
        this.remoteAudioElement.remove();
      } catch {}
      this.remoteAudioElement = null;
    }

    if (this.room) {
      try {
        await this.room.disconnect();
      } catch {}
      this.room = null;
    }

    this.options.onAudioEnergy?.(0, 0, 0);
  }

  public getTrackInfo(): { label: string; readyState: string; enabled: boolean; muted: boolean } | null {
    if (!this.localAudioTrack?.mediaStreamTrack) return null;
    const t = this.localAudioTrack.mediaStreamTrack;
    return {
      label: t.label,
      readyState: t.readyState,
      enabled: t.enabled,
      muted: t.muted,
    };
  }

  public isLive(): boolean {
    return this.isRunning && this.room?.state === ConnectionState.Connected;
  }
}
