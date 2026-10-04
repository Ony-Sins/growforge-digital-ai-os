import { isPublicPreviewMode } from "./previewMode";

/** Presentation-only lifecycle, published by the single canonical composer or Desktop Bridge. */
export interface NoraVisualSignal {
  focused: boolean;
  listening: boolean;
  audioEnergy?: number;
  processing: boolean;
  streaming: boolean;
  speaking: boolean;
  responseId: string | null;
  responseAt: string | null;
  response: string | null;
  error: boolean;
  conversationOpen: boolean;
}

export const IDLE_NORA_SIGNAL: NoraVisualSignal = {
  focused: false,
  listening: false,
  audioEnergy: 0,
  processing: false,
  streaming: false,
  speaking: false,
  responseId: null,
  responseAt: null,
  response: null,
  error: false,
  conversationOpen: false,
};

export const NORA_VISUAL_EVENT = "growforge:nora-visual";
export const NORA_VISUAL_REQUEST = "growforge:nora-visual-request";
export const NORA_AUDIO_EVENT = "growforge:nora-audio";

/**
 * Capability / Environment Gate for Desktop Bridge communication.
 * Strictly gated to trusted Local Desktop runtimes (localhost / 127.0.0.1 on non-preview/non-beta deployments).
 * A public frontend environment variable MUST NOT authorize Desktop Bridge access from a remote origin.
 * Public Preview, Beta Web, and Remote SaaS deployments will NEVER attempt Desktop Bridge connections.
 */
export function isDesktopBridgeEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (isPublicPreviewMode()) return false;
  if (process.env.NEXT_PUBLIC_DESKTOP_BRIDGE_ENABLED === "false") return false;

  const hostname = window.location.hostname;
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";

  // Strict invariant: Bridge access is allowed ONLY from trusted local origin.
  // Remote origins MUST NOT pass the gate, even if NEXT_PUBLIC_DESKTOP_BRIDGE_ENABLED is set to true.
  if (!isLocalhost) return false;

  return true;
}

/**
 * Attaches the browser UI to the same-origin authenticated voice event stream (/api/nora/voice-events).
 * Relies on server-side loopback authentication with Desktop Bridge (http://127.0.0.1:7890).
 * Zero credentials in client URLs, query params, or browser history.
 * Strictly gated by isDesktopBridgeEnabled() — fails silent without throwing or blocking UI if bridge is offline.
 */
export function initDesktopVoiceSubscriber(): () => void {
  if (typeof window === "undefined" || !isDesktopBridgeEnabled()) {
    return () => {};
  }

  let eventSource: EventSource | null = null;
  let retryTimer: NodeJS.Timeout | null = null;
  let retryCount = 0;
  const MAX_RETRIES = 5;

  function connect() {
    if (!isDesktopBridgeEnabled() || retryCount >= MAX_RETRIES) return;

    try {
      eventSource = new EventSource("/api/nora/voice-events");

      eventSource.onopen = () => {
        retryCount = 0; // Reset retry counter on successful connect
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // Browser RTC owns its lifecycle; a second SSE publisher would erase
          // transcript/response fields on the canonical composer signal.
          if (data.micOwner === "browser_livekit") return;
          const state = data.state || "idle";
          const userEnergy = typeof data.userAudioEnergy === "number" ? data.userAudioEnergy : (typeof data.energy === "number" ? data.energy : 0);
          const speechEnergy = typeof data.speechEnergy === "number" ? data.speechEnergy : 0;
          const userSpeaking = data.userSpeaking === true || state === "listening";
          const agentSpeaking = data.agentSpeaking === true || state === "speaking";

          const signal: NoraVisualSignal = {
            ...IDLE_NORA_SIGNAL,
            listening: userSpeaking,
            processing: state === "thinking",
            speaking: agentSpeaking,
            audioEnergy: agentSpeaking ? speechEnergy : userEnergy,
          };

          window.dispatchEvent(new CustomEvent(NORA_VISUAL_EVENT, { detail: signal }));
          
          const energyToDispatch = agentSpeaking ? speechEnergy : userEnergy;
          if (energyToDispatch > 0 || state === "idle") {
            window.dispatchEvent(new CustomEvent(NORA_AUDIO_EVENT, { detail: { energy: energyToDispatch, isOutbound: agentSpeaking } }));
          }
        } catch {
          // Non-JSON SSE ping/comment
        }
      };

      eventSource.onerror = () => {
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        retryCount++;
        if (retryCount < MAX_RETRIES) {
          // Exponential backoff up to 15s
          const delay = Math.min(3000 * Math.pow(1.5, retryCount), 15000);
          retryTimer = setTimeout(connect, delay);
        }
      };
    } catch {
      retryCount++;
      if (retryCount < MAX_RETRIES) {
        retryTimer = setTimeout(connect, 5000);
      }
    }
  }

  connect();

  return () => {
    if (eventSource) eventSource.close();
    if (retryTimer) clearTimeout(retryTimer);
  };
}

