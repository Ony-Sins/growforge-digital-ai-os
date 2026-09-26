export type NeutronCoreState = "idle" | "listening" | "thinking" | "speaking" | "executing";

export type CoreQualityTier = "high" | "medium" | "low";

export interface QualityConfig {
  nucleusCount: number;
  flowCount: number;
  atmosphereCount: number;
  maxDpr: number;
}

export const QUALITY_CONFIGS: Record<CoreQualityTier, QualityConfig> = {
  high: {
    nucleusCount: 6500,
    flowCount: 10000,
    atmosphereCount: 4500,
    maxDpr: 2.0,
  },
  medium: {
    nucleusCount: 4000,
    flowCount: 5500,
    atmosphereCount: 2500,
    maxDpr: 1.5,
  },
  low: {
    nucleusCount: 2500,
    flowCount: 3000,
    atmosphereCount: 1000,
    maxDpr: 1.0,
  },
};

export interface StateVisualProfile {
  brightness: number;
  pulseRate: number;
  pulseAmplitude: number;
  turbulence: number;
  flowSpeed: number;
  coreExpansion: number;
}

export const STATE_PROFILES: Record<NeutronCoreState, StateVisualProfile> = {
  idle: {
    brightness: 1.0,
    pulseRate: 0.0,
    pulseAmplitude: 0.0,
    turbulence: 0.25,
    flowSpeed: 0.22,
    coreExpansion: 1.0,
  },
  listening: {
    brightness: 1.35,
    pulseRate: 1.6,
    pulseAmplitude: 0.22,
    turbulence: 0.45,
    flowSpeed: 0.32,
    coreExpansion: 1.15,
  },
  thinking: {
    brightness: 1.25,
    pulseRate: 2.4,
    pulseAmplitude: 0.18,
    turbulence: 0.7,
    flowSpeed: 0.45,
    coreExpansion: 0.95,
  },
  speaking: {
    brightness: 1.3,
    pulseRate: 1.8,
    pulseAmplitude: 0.25,
    turbulence: 0.35,
    flowSpeed: 0.28,
    coreExpansion: 1.1,
  },
  executing: {
    brightness: 1.4,
    pulseRate: 1.2,
    pulseAmplitude: 0.2,
    turbulence: 0.5,
    flowSpeed: 0.5,
    coreExpansion: 1.05,
  },
};
