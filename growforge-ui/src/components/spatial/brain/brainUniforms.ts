import * as THREE from "three";

/**
 * Uniform objects shared BY REFERENCE between the CORE engine and the BRAIN
 * link/record renderers, so one update per frame keeps every shader on the exact
 * same motion state (this is what makes particle identity/position continuous).
 */
export interface BrainSharedUniforms {
  uFlowTotal: THREE.IUniform<number>;
  uFlowBlend: THREE.IUniform<number>;
  uTurbTime: THREE.IUniform<number>;
  uTurbulence: THREE.IUniform<number>;
  uPulse: THREE.IUniform<number>;
  uReducedMotion: THREE.IUniform<number>;
  /** 0..1 how much of the surrounding atmosphere has organised into faint links. */
  uLinks: THREE.IUniform<number>;
  uClock: THREE.IUniform<number>;
  uTime64: THREE.IUniform<number>;
}

export function createBrainSharedUniforms(): BrainSharedUniforms {
  return {
    uFlowTotal: { value: 0 },
    uFlowBlend: { value: 0 },
    uTurbTime: { value: 0 },
    uTurbulence: { value: 0.25 },
    uPulse: { value: 1 },
    uReducedMotion: { value: 0 },
    uLinks: { value: 0 },
    uClock: { value: 0 },
    uTime64: { value: 0 },
  };
}

/** Per-frame drive values from the camera dolly (already smoothed by the caller). */
export interface BrainDrive {
  links: number; // 0..1 connectivity of the same surrounding particles
  rigid: number; // 0..~0.55 blend of the outer atmosphere toward coherent rotation (keeps links intact)
  speed: number; // 0..1 dive speed-up of the outer particles
}

export const BRAIN_DRIVE_IDLE: BrainDrive = { links: 0, rigid: 0, speed: 0 };
