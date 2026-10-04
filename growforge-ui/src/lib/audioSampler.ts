/**
 * Browser-native Web Audio API microphone energy sampler.
 * Only activated upon user-initiated voice input.
 * Clamps noise floor and smoothly normalizes vocal energy to 0..1.
 */
export interface AudioTrackInfo {
  label: string;
  enabled: boolean;
  muted: boolean;
  readyState: string;
}

export interface AudioSampler {
  start: (onEnergy: (energy: number, rms?: number, peak?: number) => void) => Promise<boolean>;
  stop: () => void;
  getTrackInfo: () => AudioTrackInfo | null;
}

export function createAudioSampler(): AudioSampler {
  let audioContext: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let analyser: AnalyserNode | null = null;
  let rafId: number | null = null;
  let smoothedEnergy = 0;
  let active = false;
  let peakEnergy = 0;

  const getTrackInfo = (): AudioTrackInfo | null => {
    if (!stream) return null;
    const track = stream.getAudioTracks()[0];
    if (!track) return null;
    return {
      label: track.label || "Default Microphone",
      enabled: track.enabled,
      muted: track.muted,
      readyState: track.readyState,
    };
  };

  const stop = () => {
    active = false;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (stream) {
      stream.getTracks().forEach(track => {
        try { track.stop(); } catch {}
      });
      stream = null;
    }
    if (audioContext && audioContext.state !== 'closed') {
      try {
        void audioContext.close();
      } catch {}
      audioContext = null;
    }
    analyser = null;
    smoothedEnergy = 0;
    peakEnergy = 0;
  };

  const start = async (onEnergy: (energy: number, rms?: number, peak?: number) => void): Promise<boolean> => {
    stop();
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return false;
    }
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (!mediaStream) return false;
      stream = mediaStream;
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return false;
      const ctx = new AudioCtx();
      audioContext = ctx;
      if (ctx.state === 'suspended') {
        try { await ctx.resume(); } catch {}
      }

      const source = ctx.createMediaStreamSource(mediaStream);
      const node = ctx.createAnalyser();
      node.fftSize = 512;
      node.smoothingTimeConstant = 0.65;
      source.connect(node);
      analyser = node;
      active = true;

      const freqData = new Uint8Array(node.frequencyBinCount);
      const timeData = new Uint8Array(node.fftSize);
      const NOISE_FLOOR = 0.012;

      const sample = () => {
        if (!active || !analyser) return;

        // Sample vocal frequency range bins (roughly 80Hz to 4000Hz)
        analyser.getByteFrequencyData(freqData);
        analyser.getByteTimeDomainData(timeData);

        let sumFreq = 0;
        const vocalBins = Math.min(freqData.length, 64);
        for (let i = 1; i < vocalBins; i++) {
          sumFreq += freqData[i];
        }
        const avgFreq = sumFreq / (vocalBins - 1) / 255;

        // Sample time-domain RMS
        let sumSquares = 0;
        let framePeak = 0;
        for (let i = 0; i < timeData.length; i++) {
          const norm = (timeData[i] - 128) / 128;
          const absVal = Math.abs(norm);
          if (absVal > framePeak) framePeak = absVal;
          sumSquares += norm * norm;
        }
        const rms = Math.sqrt(sumSquares / timeData.length);
        if (framePeak > peakEnergy) peakEnergy = framePeak;
        else peakEnergy = peakEnergy * 0.98;

        // Composite vocal signal
        const composite = Math.max(avgFreq * 1.4, rms * 2.8);
        const raw = composite > NOISE_FLOOR ? (composite - NOISE_FLOOR) / (1 - NOISE_FLOOR) : 0;

        // Natural speech maps to 0.20–0.55; loud speech to 0.55–0.80; capped below 0.88
        const target = Math.min(0.88, Math.pow(raw, 0.85) * 1.5);
        const attackDecay = target > smoothedEnergy ? 0.45 : 0.22;
        smoothedEnergy += (target - smoothedEnergy) * attackDecay;

        const finalEnergy = smoothedEnergy < 0.01 ? 0 : smoothedEnergy;
        onEnergy(finalEnergy, rms, peakEnergy);

        rafId = requestAnimationFrame(sample);
      };

      rafId = requestAnimationFrame(sample);
      return true;
    } catch {
      stop();
      return false;
    }
  };

  return { start, stop, getTrackInfo };
}
